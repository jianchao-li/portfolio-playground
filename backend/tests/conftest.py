"""Offline test fixtures: synthetic Yahoo data instead of network downloads."""
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.limiter import limiter
from app.main import app
from app.services import asset_info, price_cache

DATA_START = date(2022, 12, 1)
DATA_END = date(2026, 1, 31)
NEWCO_LISTING = date(2024, 3, 4)  # a Monday
NEWCOIN_LISTING = date(2024, 3, 2)  # a Saturday


def _series(symbol: str) -> pd.Series:
    """Deterministic synthetic close prices on the symbol's own calendar."""
    if symbol in ("VOO", "QQQ", "^IRX", "EURUSD=X"):
        index = pd.bdate_range(DATA_START, DATA_END)  # weekdays only
    elif symbol == "NEWCO":
        index = pd.bdate_range(NEWCO_LISTING, DATA_END)  # listed mid-range
    elif symbol == "NEWCOIN":
        index = pd.date_range(NEWCOIN_LISTING, DATA_END)  # crypto listed on a Saturday
    elif symbol == "BTC-USD":
        index = pd.date_range(DATA_START, DATA_END)  # trades every day
    else:
        return pd.Series(dtype=float, index=pd.DatetimeIndex([]))  # unknown ticker: no data
    if symbol == "^IRX":
        return pd.Series(4.0, index=index)  # 4% T-bill yield, quoted in percent
    if symbol == "EURUSD=X":
        return pd.Series(1.10, index=index)
    seed = sum(map(ord, symbol))
    rets = np.random.default_rng(seed).normal(0.0004, 0.01, len(index))
    return pd.Series(100 * np.cumprod(1 + rets), index=index)


def fake_download(tickers, start_date: date, end_date: date) -> pd.DataFrame:
    """Mimic yf.download(auto_adjust=True) through app.services.market_data.download.

    Applies the same buffer and inclusive-end handling as the real wrapper, then
    mimics yfinance's exclusive `end` and MultiIndex ('Close', ticker) columns,
    with an all-NaN column for tickers that have no data.
    """
    from app.services.market_data import DOWNLOAD_BUFFER_DAYS
    tickers = [tickers] if isinstance(tickers, str) else list(tickers)
    start = pd.Timestamp(start_date - timedelta(days=DOWNLOAD_BUFFER_DAYS))
    end = pd.Timestamp(end_date + timedelta(days=1))  # wrapper adds a day...
    cols = {}
    for t in tickers:
        s = _series(t)
        cols[t] = s[(s.index >= start) & (s.index < end)]  # ...yfinance excludes end
    frame = pd.DataFrame(cols)
    if frame.dropna(how="all").empty:
        return pd.DataFrame()
    frame.columns = pd.MultiIndex.from_product([["Close"], frame.columns], names=["Price", "Ticker"])
    return frame


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    # Every Yahoo download (prices, ^IRX, FX) goes through the per-symbol price cache
    monkeypatch.setattr(price_cache, "download", fake_download)

    def no_network(symbols):
        raise RuntimeError("network disabled in tests")

    monkeypatch.setattr(asset_info, "fetch_spark_currencies", no_network)
    price_cache.clear()
    asset_info._currency_cache.clear()
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def client():
    return TestClient(app)
