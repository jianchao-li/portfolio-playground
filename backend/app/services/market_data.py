"""Shared helpers for downloading and caching Yahoo Finance data."""
import threading
from collections.abc import Callable, Hashable
from datetime import date, timedelta
from typing import TypeVar

import pandas as pd
import yfinance as yf
from cachetools import TLRUCache

T = TypeVar("T")

# Buffer so the first requested day can be forward-filled across weekends/holidays
DOWNLOAD_BUFFER_DAYS = 5


# Ranges ending today can still change (today's prices are live); past ranges can't.
LIVE_TTL_SECONDS = 5 * 60
HISTORICAL_TTL_SECONDS = 6 * 60 * 60


def _ttu(key: Hashable, value, now: float) -> float:
    """Expiry time for a cache entry, based on the latest date in its key."""
    dates = [k for k in key if isinstance(k, date)] if isinstance(key, tuple) else []
    historical = bool(dates) and max(dates) < date.today()
    return now + (HISTORICAL_TTL_SECONDS if historical else LIVE_TTL_SECONDS)


def make_cache(maxsize: int) -> TLRUCache:
    """LRU cache whose entries expire after 5 min, or 6 h for past-only date ranges."""
    return TLRUCache(maxsize=maxsize, ttu=_ttu)


def cached(cache: TLRUCache, lock: threading.Lock, key: Hashable, compute: Callable[[], T]) -> T:
    """Return cache[key], computing and storing it on a miss. Exceptions are not cached."""
    with lock:
        if key in cache:
            return cache[key]
    value = compute()
    with lock:
        cache[key] = value
    return value


def download(tickers: str | list[str], start_date: date, end_date: date) -> pd.DataFrame:
    """Download daily data, starting a few days early to allow forward-filling."""
    return yf.download(
        tickers=tickers,
        start=(start_date - timedelta(days=DOWNLOAD_BUFFER_DAYS)).isoformat(),
        end=end_date.isoformat(),
        progress=False,
    )


def clip_to_range(data: pd.DataFrame | pd.Series, start_date: date, end_date: date):
    """Keep only rows within [start_date, end_date]."""
    index = data.index
    return data[(index >= pd.Timestamp(start_date)) & (index <= pd.Timestamp(end_date))]


def extract_close_prices(data: pd.DataFrame, error_context: str = "symbols") -> pd.DataFrame | pd.Series:
    """Extract close/adj-close prices from yfinance download data, handling MultiIndex columns."""
    if isinstance(data.columns, pd.MultiIndex):
        if 'Adj Close' in data.columns.get_level_values(0):
            return data['Adj Close']
        return data['Close']
    if 'Adj Close' in data.columns:
        return data['Adj Close']
    if 'Close' in data.columns:
        return data['Close']
    raise ValueError(f"No price data found for {error_context}")
