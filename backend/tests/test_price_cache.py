"""C4: per-symbol full-history price cache (app.services.price_cache).

- Cached results equal a fresh range download for many random ranges,
  symbol sets, currencies and align_start settings (incl. mid-range listings
  and a symbol with a gap in its history).
- Only missing symbols are downloaded; FX and ^IRX go through the cache.
- Ranges ending today are re-checked after LIVE_TTL (tail refresh only).
- Yahoo re-adjusting past closes (2:1 split, dividend) triggers a full refetch.
- LRU cap.
"""
import random
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from cachetools import LRUCache

from app.services import market_data, price_cache
from tests import conftest
from tests.conftest import DATA_END, DATA_START, fake_download

GAP_FROM, GAP_TO = date(2024, 6, 3), date(2024, 7, 12)  # GAPCO doesn't trade in between


def _series_with_gapco(original):
    def series(symbol):
        if symbol == "GAPCO":
            index = pd.bdate_range(DATA_START, DATA_END)
            index = index[(index < pd.Timestamp(GAP_FROM)) | (index > pd.Timestamp(GAP_TO))]
            rets = np.random.default_rng(7).normal(0.0003, 0.012, len(index))
            return pd.Series(50 * np.cumprod(1 + rets), index=index)
        return original(symbol)
    return series


@pytest.fixture
def downloads(monkeypatch):
    """Record every Yahoo download made through the cache, with the GAPCO symbol added."""
    monkeypatch.setattr(conftest, "_series", _series_with_gapco(conftest._series))
    calls = []

    def recording(tickers, start_date, end_date):
        calls.append((sorted([tickers] if isinstance(tickers, str) else tickers), start_date, end_date))
        return fake_download(tickers, start_date, end_date)

    monkeypatch.setattr(price_cache, "download", recording)
    return calls


def fresh_get_closes(tickers, start_date, end_date):
    """The pre-C4 behaviour: download exactly this range, no cache."""
    tickers = list(dict.fromkeys(tickers))
    data = fake_download(tickers, start_date, end_date)
    if data.empty:
        return pd.DataFrame()
    prices = market_data.extract_close_prices(data)
    if isinstance(prices, pd.Series):
        prices = prices.to_frame(tickers[0])
    prices = prices.dropna(axis=1, how="all")
    prices.columns.name = None  # cosmetic: yfinance names the column level 'Ticker'
    return prices[prices.notna().any(axis=1)]


def compare(client, portfolios, start, end, currency="USD", align_start=False):
    resp = client.post("/api/portfolio/compare", json={
        "portfolios": portfolios, "start_date": start.isoformat(), "end_date": end.isoformat(),
        "currency": currency, "align_start": align_start,
    })
    return resp.status_code, resp.json()


def random_request(rng):
    pool = ["VOO", "QQQ", "NEWCO", "NEWCOIN", "BTC-USD", "GAPCO"]
    portfolios = []
    for i in range(rng.randint(1, 3)):
        syms = rng.sample(pool, rng.randint(1, 2))
        weights = [1.0] if len(syms) == 1 else [0.5, 0.5]
        portfolios.append({"name": f"P{i}", "assets": [{"symbol": s, "weight": w} for s, w in zip(syms, weights)]})
    start = DATA_START - timedelta(days=20) + timedelta(days=rng.randint(0, 1150))
    end = start + timedelta(days=rng.choice([1, 2, 3, 6, 30, 200, 400, 900]))
    end = min(end, DATA_END + timedelta(days=10))
    return dict(portfolios=portfolios, start=start, end=end,
                currency=rng.choice(["USD", "USD", "EUR"]), align_start=rng.random() < 0.5)


def test_cached_responses_equal_fresh_downloads(client, downloads, monkeypatch):
    rng = random.Random(20261108)
    requests = [random_request(rng) for _ in range(60)]

    # Cached path, in order, so later requests are served from earlier fills
    cached = [compare(client, **r) for r in requests]
    assert len(downloads) < len(requests) / 3  # mostly served from the cache

    # Fresh path: exact-range downloads, nothing cached
    monkeypatch.setattr(price_cache, "get_closes", fresh_get_closes)
    fresh = [compare(client, **r) for r in requests]

    statuses = set()
    for r, c, f in zip(requests, cached, fresh):
        assert c == f, r
        statuses.add(c[0])
    assert statuses == {200, 400}  # covers both successful and too-short ranges


def test_gap_and_mid_range_listing_slices_match_fresh(downloads):
    price_cache.get_closes(["VOO"], date(2023, 1, 1), date(2025, 12, 31))  # warm with another range
    for tickers, start, end in [
        (["GAPCO", "VOO"], date(2024, 5, 1), date(2024, 8, 30)),   # spans the gap
        (["GAPCO"], date(2024, 6, 10), date(2024, 7, 10)),          # inside the gap: no data
        (["NEWCO", "VOO", "^IRX"], date(2024, 2, 1), date(2024, 4, 1)),  # listing mid-range
        (["NEWCOIN", "BTC-USD"], date(2024, 2, 28), date(2024, 3, 10)),  # weekend listing
    ]:
        got = price_cache.get_closes(tickers, start, end)
        want = fresh_get_closes(tickers, start, end)
        pd.testing.assert_frame_equal(got, want[got.columns] if not got.empty else want, check_freq=False)
        assert list(got.columns) == [t for t in tickers if t in want.columns]


def test_only_missing_symbols_are_downloaded(client, downloads):
    voo = {"name": "VOO", "assets": [{"symbol": "VOO", "weight": 1.0}]}
    qqq = {"name": "QQQ", "assets": [{"symbol": "QQQ", "weight": 1.0}]}
    compare(client, [voo], date(2023, 1, 1), date(2025, 12, 31))
    assert downloads == [(["VOO", "^IRX"], price_cache.HISTORY_START, date.today())]
    # Other ranges ("1Y/3Y/5Y" shortcuts) and EUR: sliced from the cache; FX downloaded once
    compare(client, [voo], date(2025, 1, 1), date(2025, 12, 31))
    compare(client, [voo], date(2024, 1, 1), date(2025, 6, 30), currency="EUR")
    compare(client, [voo], date(2023, 6, 1), date(2025, 6, 30), currency="EUR")
    assert [d[0] for d in downloads] == [["VOO", "^IRX"], ["EURUSD=X"]]
    # A new combination downloads only the new symbol
    compare(client, [voo, qqq], date(2023, 1, 1), date(2025, 12, 31))
    assert downloads[-1][0] == ["QQQ"]
    assert len(downloads) == 3


def test_request_before_history_start_refetches_further_back(downloads):
    price_cache.get_closes(["VOO"], date(2023, 1, 1), date(2024, 1, 1))
    early = date(1980, 1, 1)
    price_cache.get_closes(["VOO"], early, date(2024, 1, 1))
    assert downloads[-1][1] == early - timedelta(days=market_data.DOWNLOAD_BUFFER_DAYS)


# --- Freshness ---------------------------------------------------------------

class Clock:
    def __init__(self, monkeypatch, today):
        self.t = 1_000_000.0
        self.day = today
        monkeypatch.setattr(price_cache, "_now", lambda: self.t)
        monkeypatch.setattr(price_cache, "_today", lambda: self.day)

    def advance(self, seconds):
        self.t += seconds


def test_live_ranges_refresh_only_the_tail_after_ttl(downloads, monkeypatch):
    clock = Clock(monkeypatch, DATA_END)
    price_cache.get_closes(["VOO"], date(2025, 1, 1), DATA_END)
    assert len(downloads) == 1
    clock.advance(price_cache.LIVE_TTL_SECONDS - 10)
    price_cache.get_closes(["VOO"], date(2024, 1, 1), DATA_END)
    assert len(downloads) == 1  # still fresh
    clock.advance(20)
    price_cache.get_closes(["VOO"], date(2024, 1, 1), DATA_END)
    assert len(downloads) == 2  # tail refresh, not a full history
    tickers, start, end = downloads[-1]
    assert tickers == ["VOO"] and end == DATA_END
    assert start >= DATA_END - timedelta(days=price_cache.TAIL_OVERLAP_DAYS + 7)
    # Past-only ranges don't need live data
    clock.advance(price_cache.LIVE_TTL_SECONDS * 3)
    price_cache.get_closes(["VOO"], date(2024, 1, 1), date(2025, 6, 30))
    assert len(downloads) == 2


def test_full_histories_expire(downloads, monkeypatch):
    clock = Clock(monkeypatch, DATA_END + timedelta(days=30))
    price_cache.get_closes(["VOO"], date(2024, 1, 1), date(2025, 6, 30))
    clock.advance(price_cache.HISTORY_TTL_SECONDS + 1)
    price_cache.get_closes(["VOO"], date(2024, 1, 1), date(2025, 6, 30))
    assert [d[1] for d in downloads] == [price_cache.HISTORY_START] * 2


def test_new_days_are_appended_by_the_tail_refresh(downloads, monkeypatch):
    clock = Clock(monkeypatch, date(2025, 12, 15))
    first = price_cache.get_closes(["VOO"], date(2025, 12, 1), date(2025, 12, 15))
    assert first.index[-1] == pd.Timestamp("2025-12-15")
    clock.day = date(2025, 12, 19)
    clock.advance(price_cache.LIVE_TTL_SECONDS + 1)
    later = price_cache.get_closes(["VOO"], date(2025, 12, 1), date(2025, 12, 19))
    assert later.index[-1] == pd.Timestamp("2025-12-19")
    assert downloads[-1][1] > price_cache.HISTORY_START  # a tail, not a refetch
    pd.testing.assert_frame_equal(later, fresh_get_closes(["VOO"], date(2025, 12, 1), date(2025, 12, 19)),
                                  check_freq=False)


@pytest.mark.parametrize("adjustment, factor", [("2:1 split", 0.5), ("dividend", 0.995), ("noise", 1 + 1e-9)])
def test_readjusted_history_triggers_full_refetch(downloads, monkeypatch, adjustment, factor):
    clock = Clock(monkeypatch, DATA_END)
    price_cache.get_closes(["VOO", "QQQ"], date(2023, 1, 1), DATA_END)

    # Yahoo re-adjusts every VOO close before the ex-date (a few days ago)
    ex_date = pd.Timestamp(DATA_END - timedelta(days=3))
    original = conftest._series

    def readjusted(symbol):
        s = original(symbol)
        if symbol == "VOO":
            s = s.copy()
            s[s.index < ex_date] *= factor
        return s

    monkeypatch.setattr(conftest, "_series", readjusted)
    clock.advance(price_cache.LIVE_TTL_SECONDS + 1)
    n = len(downloads)
    got = price_cache.get_closes(["VOO", "QQQ"], date(2023, 1, 1), DATA_END)
    new_downloads = downloads[n:]

    full = [d for d in new_downloads if d[1] == price_cache.HISTORY_START]
    if adjustment == "noise":
        assert full == []  # within the 1e-6 tolerance: no refetch
    else:
        assert full and full[0][0] == ["VOO"]  # only the re-adjusted symbol is refetched
        expected = fresh_get_closes(["VOO", "QQQ"], date(2023, 1, 1), DATA_END)
        pd.testing.assert_frame_equal(got, expected, check_freq=False)
        assert got["VOO"].iloc[0] == pytest.approx(original("VOO").loc[got.index[0]] * factor)


# --- LRU cap -----------------------------------------------------------------

def test_lru_cap_evicts_least_recently_used(downloads, monkeypatch):
    assert price_cache._entries.maxsize == price_cache.MAX_SYMBOLS
    monkeypatch.setattr(price_cache, "_entries", LRUCache(maxsize=3))
    for symbol in ["VOO", "QQQ", "BTC-USD"]:
        price_cache.get_closes([symbol], date(2024, 1, 1), date(2024, 6, 1))
    price_cache.get_closes(["VOO"], date(2024, 1, 1), date(2024, 6, 1))  # VOO is now most recent
    price_cache.get_closes(["NEWCO"], date(2024, 4, 1), date(2024, 6, 1))  # evicts QQQ
    assert set(price_cache._entries.keys()) == {"VOO", "BTC-USD", "NEWCO"}
    n = len(downloads)
    price_cache.get_closes(["QQQ"], date(2024, 1, 1), date(2024, 6, 1))
    assert len(downloads) == n + 1 and downloads[-1][0] == ["QQQ"]


def test_unknown_ticker_is_not_cached(downloads):
    frame = price_cache.get_closes(["VOO", "NOTAREALTICKER"], date(2024, 1, 1), date(2024, 6, 1))
    assert list(frame.columns) == ["VOO"]
    assert "NOTAREALTICKER" not in price_cache._entries
