from datetime import timedelta

import pandas as pd
import pytest
from pydantic import ValidationError

from app.models.portfolio import Portfolio
from app.services import market_data


def portfolio(name, *assets):
    return {"name": name, "assets": [{"symbol": s, "weight": w} for s, w in assets]}


def compare(client, portfolios, start="2023-01-01", end="2025-12-31", currency="USD"):
    return client.post("/api/portfolio/compare", json={
        "portfolios": portfolios, "start_date": start, "end_date": end, "currency": currency,
    })


VOO = portfolio("VOO", ("VOO", 1.0))
BTC = portfolio("BTC", ("BTC-USD", 1.0))


def test_fewer_than_two_trading_days_is_400(client):
    # Sat-Sun range: no VOO trading days at all
    resp = compare(client, [VOO], start="2024-01-06", end="2024-01-07")
    assert resp.status_code == 400
    # Fri-Sun range: exactly one trading day
    resp = compare(client, [VOO], start="2024-01-05", end="2024-01-07")
    assert resp.status_code == 400
    assert "trading days" in resp.json()["detail"]


def test_two_trading_days_has_finite_stats_and_no_annualized_return(client):
    resp = compare(client, [VOO], start="2024-01-04", end="2024-01-05")
    assert resp.status_code == 200
    stats = resp.json()["portfolios"][0]["stats"]
    assert stats["annualized_return"] is None  # < 1 year
    assert stats["volatility"] is None  # a single return has no std
    assert stats["sharpe_ratio"] is None
    assert isinstance(stats["total_return"], float)


def test_end_date_is_included(client):
    resp = compare(client, [VOO], start="2025-12-01", end="2025-12-31")
    assert resp.status_code == 200
    assert resp.json()["portfolios"][0]["performance"]["dates"][-1] == "2025-12-31"


def test_download_requests_end_plus_one_and_auto_adjust(monkeypatch):
    calls = {}

    def fake_yf_download(**kwargs):
        calls.update(kwargs)
        return pd.DataFrame()

    monkeypatch.setattr(market_data.yf, "download", fake_yf_download)
    d = pd.Timestamp("2025-12-31").date()
    market_data.download("VOO", d - timedelta(days=30), d)
    assert calls["end"] == "2026-01-01"
    assert calls["auto_adjust"] is True


def test_bad_ticker_is_named_alone(client):
    resp = compare(client, [VOO, portfolio("Mixed", ("QQQ", 0.5), ("NOTAREALTICKER", 0.5))])
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "NOTAREALTICKER" in detail
    assert "VOO" not in detail and "QQQ" not in detail


def test_voo_stats_identical_alone_and_beside_btc(client):
    alone = compare(client, [VOO]).json()["portfolios"][0]
    together = compare(client, [VOO, BTC]).json()["portfolios"][0]
    assert alone["stats"] == together["stats"]
    assert alone["performance"] == together["performance"]


def test_annualization_uses_calendar_time(client):
    stats = {p["stats"]["name"]: p["stats"] for p in compare(client, [VOO, BTC]).json()["portfolios"]}
    for s in stats.values():
        assert s["annualized_return"] is not None
        years = 3.0  # 2023-01-01..2025-12-31, within a few days
        implied = (1 + s["total_return"]) ** (1 / years) - 1
        assert s["annualized_return"] == pytest.approx(implied, abs=0.01)


def test_symbol_normalization_and_duplicate_merge():
    p = Portfolio(name="P", assets=[
        {"symbol": " voo ", "weight": 0.3},
        {"symbol": "VOO", "weight": 0.2},
        {"symbol": "btc-usd", "weight": 0.5},
    ])
    assert [(a.symbol, a.weight) for a in p.assets] == [("VOO", 0.5), ("BTC-USD", 0.5)]
    assert p.validate_weights()
    with pytest.raises(ValidationError):
        Portfolio(name="P", assets=[{"symbol": "   ", "weight": 1.0}])


def test_lowercase_symbols_work_end_to_end(client):
    upper = compare(client, [VOO]).json()["portfolios"][0]["stats"]
    lower = compare(client, [portfolio("VOO", ("voo", 0.4), (" VOO", 0.6))]).json()["portfolios"][0]["stats"]
    assert upper == lower


def test_currency_conversion_still_applied(client):
    resp = compare(client, [VOO], currency="EUR")
    assert resp.status_code == 200
    values = resp.json()["portfolios"][0]["performance"]["values"]
    assert values[0] == pytest.approx(100 / 1.10, abs=0.01)


def test_unexpected_errors_return_generic_500(client, monkeypatch):
    from app.services import analyzer

    def boom(*args, **kwargs):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(analyzer.PortfolioAnalyzer, "fetch_prices", boom)
    resp = compare(client, [VOO])
    assert resp.status_code == 500
    assert "secret" not in resp.json()["detail"]
