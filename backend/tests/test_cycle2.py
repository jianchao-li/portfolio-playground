"""Cycle 2: Sortino ratio, start-date alignment, per-asset trading currency."""
import math

import numpy as np
import pandas as pd
import pytest

from app.services import asset_info
from app.services.analyzer import PortfolioAnalyzer
from tests.conftest import NEWCO_LISTING


def portfolio(name, *assets):
    return {"name": name, "assets": [{"symbol": s, "weight": w} for s, w in assets]}


def compare(client, portfolios, start="2023-01-01", end="2025-12-31", currency="USD", **extra):
    return client.post("/api/portfolio/compare", json={
        "portfolios": portfolios, "start_date": start, "end_date": end, "currency": currency, **extra,
    })


VOO = portfolio("VOO", ("VOO", 1.0))
NEWCO = portfolio("NewCo", ("NEWCO", 1.0))
BTC = portfolio("BTC", ("BTC-USD", 1.0))


# --- Sortino ---------------------------------------------------------------

def test_sortino_matches_hand_computation():
    # 5 values over 8 calendar days -> 4 returns
    dates = pd.to_datetime(["2024-01-01", "2024-01-03", "2024-01-04", "2024-01-08", "2024-01-09"])
    values = pd.Series([100.0, 102.0, 99.0, 101.0, 98.0], index=dates)
    rf_annual = 0.04

    # By hand, with plain arithmetic
    v = list(values)
    rets = [v[i] / v[i - 1] - 1 for i in range(1, len(v))]
    years = 8 / 365.25
    ppy = len(rets) / years
    rf_p = (1 + rf_annual) ** (1 / ppy) - 1
    excess = [r - rf_p for r in rets]
    mean = sum(excess) / len(excess)
    downside = math.sqrt(sum(min(e, 0) ** 2 for e in excess) / len(excess))
    expected_sortino = mean / downside * math.sqrt(ppy)
    std = math.sqrt(sum((e - mean) ** 2 for e in excess) / (len(excess) - 1))
    expected_sharpe = mean / std * math.sqrt(ppy)

    stats = PortfolioAnalyzer().calculate_stats(values, "x", rf_annual)
    assert stats.sortino_ratio == pytest.approx(round(expected_sortino, 4), abs=1e-4)
    assert stats.sharpe_ratio == pytest.approx(round(expected_sharpe, 4), abs=1e-4)


def test_sortino_is_null_when_degenerate():
    dates = pd.bdate_range("2024-01-01", periods=6)
    rising = pd.Series([100, 101, 102, 103, 104, 105], index=dates, dtype=float)
    # Every return beats the risk-free rate: no downside deviation
    assert PortfolioAnalyzer().calculate_stats(rising, "x", 0.04).sortino_ratio is None
    # A single return
    two = pd.Series([100.0, 99.0], index=dates[:2])
    assert PortfolioAnalyzer().calculate_stats(two, "x", 0.04).sortino_ratio is None


def test_sortino_in_api_response(client):
    stats = compare(client, [VOO]).json()["portfolios"][0]["stats"]
    assert isinstance(stats["sortino_ratio"], float)
    # Downside deviation <= total deviation for these returns, so Sortino >= Sharpe here
    assert stats["sortino_ratio"] >= stats["sharpe_ratio"]


def test_series_supports_client_side_drawdown(client):
    """The frontend derives drawdown from performance.values; its min must equal max_drawdown."""
    p = compare(client, [VOO]).json()["portfolios"][0]
    values = np.array(p["performance"]["values"])
    drawdown = values / np.maximum.accumulate(values) - 1
    assert drawdown.min() == pytest.approx(p["stats"]["max_drawdown"], abs=1e-4)


# --- Align start dates -----------------------------------------------------

def test_align_start_clips_to_latest_common_start(client):
    body = compare(client, [VOO, NEWCO], align_start=True).json()
    assert body["aligned_start"] == NEWCO_LISTING.isoformat()
    voo, newco = body["portfolios"]
    assert voo["performance"]["dates"][0] == NEWCO_LISTING.isoformat()
    assert newco["performance"]["dates"][0] == NEWCO_LISTING.isoformat()
    # The real (unaligned) window is still reported
    assert voo["data_start"] == "2023-01-02"  # synthetic weekday calendar
    assert newco["data_start"] == NEWCO_LISTING.isoformat()
    assert voo["data_end"] == "2025-12-31"


def test_aligned_stats_equal_a_run_on_the_sub_range(client):
    aligned = compare(client, [VOO, NEWCO, BTC], align_start=True).json()["portfolios"]
    sub = compare(client, [VOO, NEWCO, BTC], start=NEWCO_LISTING.isoformat()).json()["portfolios"]
    for a, s in zip(aligned, sub):
        assert a["stats"] == s["stats"]
        assert a["performance"] == s["performance"]


def test_align_start_off_or_same_starts_changes_nothing(client):
    off = compare(client, [VOO, NEWCO]).json()
    assert off["aligned_start"] is None
    assert off["portfolios"][0]["performance"]["dates"][0] == "2023-01-02"
    same = compare(client, [VOO, portfolio("QQQ", ("QQQ", 1.0))], align_start=True).json()
    plain = compare(client, [VOO, portfolio("QQQ", ("QQQ", 1.0))]).json()
    assert same["aligned_start"] is None
    assert same["portfolios"] == plain["portfolios"]


def test_align_start_too_short_is_400(client):
    # Aligned to a Saturday crypto listing, VOO keeps only Monday 2024-03-04
    coin = portfolio("Coin", ("NEWCOIN", 1.0))
    resp = compare(client, [VOO, coin], start="2024-02-01", end="2024-03-04", align_start=True)
    assert resp.status_code == 400
    assert "aligning start dates" in resp.json()["detail"]


# --- Per-asset trading currency ---------------------------------------------

def test_asset_currency_from_yahoo_metadata(client, monkeypatch):
    calls = []

    def fake_spark(symbols):
        calls.append(sorted(symbols))
        return {"VOO": "USD", "QQQ": "USD", "NEWCO": "JPY"}

    monkeypatch.setattr(asset_info, "fetch_spark_currencies", fake_spark)
    body = compare(client, [VOO, portfolio("Mix", ("QQQ", 0.5), ("NEWCO", 0.5))]).json()
    assert body["portfolios"][0]["assets"] == [{"symbol": "VOO", "weight": 1.0, "currency": "USD"}]
    assert body["portfolios"][1]["assets"] == [
        {"symbol": "QQQ", "weight": 0.5, "currency": "USD"},
        {"symbol": "NEWCO", "weight": 0.5, "currency": "JPY"},
    ]
    # One batched lookup, then served from the cache
    compare(client, [VOO])
    assert calls == [["NEWCO", "QQQ", "VOO"]]


def test_asset_currency_falls_back_to_suffix():
    # The autouse fixture makes the Yahoo lookup fail
    got = asset_info.get_currencies(["VOO", "7203.T", "VOD.L", "SAP.DE", "BTC-USD", "JPY=X", "^GSPC"])
    assert got == {"VOO": "USD", "7203.T": "JPY", "VOD.L": "GBp", "SAP.DE": "EUR",
                   "BTC-USD": "USD", "JPY=X": "JPY", "^GSPC": None}
    # Fallback guesses are not cached, so Yahoo's answer can still win later
    assert "7203.T" not in asset_info._currency_cache


def test_analyze_endpoint_has_new_fields(client):
    resp = client.post("/api/portfolio/analyze", json={
        "portfolio": VOO, "start_date": "2024-01-01", "end_date": "2024-12-31",
    })
    body = resp.json()
    assert resp.status_code == 200
    assert body["assets"] == [{"symbol": "VOO", "weight": 1.0, "currency": "USD"}]
    assert body["data_start"] == "2024-01-01" and body["data_end"] == "2024-12-31"
    assert "sortino_ratio" in body["stats"]
