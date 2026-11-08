"""Shared helpers for downloading and caching Yahoo Finance data."""
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

# Buffer so the first requested day can be forward-filled across weekends/holidays
DOWNLOAD_BUFFER_DAYS = 5


# Today's prices are live, so data for ranges ending today is re-checked this often
LIVE_TTL_SECONDS = 5 * 60


def download(tickers: str | list[str], start_date: date, end_date: date) -> pd.DataFrame:
    """Download daily data for [start_date, end_date] inclusive.

    Starts a few days early to allow forward-filling. yfinance treats `end` as
    exclusive, so one day is added to include end_date itself. auto_adjust is
    pinned so 'Close' is always the split/dividend-adjusted (total return) close.
    """
    return yf.download(
        tickers=tickers,
        start=(start_date - timedelta(days=DOWNLOAD_BUFFER_DAYS)).isoformat(),
        end=(end_date + timedelta(days=1)).isoformat(),
        auto_adjust=True,
        progress=False,
    )


def clip_to_range(data: pd.DataFrame | pd.Series, start_date: date, end_date: date):
    """Keep only rows within [start_date, end_date]."""
    index = data.index
    return data[(index >= pd.Timestamp(start_date)) & (index <= pd.Timestamp(end_date))]


def extract_close_prices(data: pd.DataFrame, error_context: str = "symbols") -> pd.DataFrame | pd.Series:
    """Extract adjusted close prices from yfinance download data (auto_adjust=True).

    Only 'Close' is read: with auto_adjust it is already adjusted, and mixing in
    'Adj Close' could make valid tickers look missing when one ticker is bad.
    """
    if isinstance(data.columns, pd.MultiIndex):
        if 'Close' in data.columns.get_level_values(0):
            return data['Close']
    elif 'Close' in data.columns:
        return data['Close']
    raise ValueError(f"No price data found for {error_context}")
