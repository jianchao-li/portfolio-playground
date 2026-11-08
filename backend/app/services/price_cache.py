"""Per-symbol cache of raw daily close prices (full history), sliced per request.

Every Yahoo series the app uses goes through here: asset prices, the ^IRX
T-bill series and FX pairs. Each symbol's whole history (from HISTORY_START)
is downloaded once and kept as its raw, un-forward-filled close series, so any
date range or symbol combination is served by slicing, and only symbols that
aren't cached yet are downloaded (in one batched request).

Freshness:
- Ranges that end today (or later) need live prices: if a symbol's newest
  data was checked more than LIVE_TTL_SECONDS ago, only the last few weeks
  are downloaded again ("tail refresh", one batched request for all stale
  symbols).
- Yahoo re-adjusts past closes after a dividend or split. A tail refresh
  compares the overlap with the cache (relative tolerance REFETCH_TOLERANCE)
  and on any mismatch downloads that symbol's full history again.
- As a safety net, full histories older than HISTORY_TTL_SECONDS are
  downloaded again on next use.
- At most MAX_SYMBOLS symbols are kept (least recently used are evicted).
"""
import logging
import threading
import time
from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd
from cachetools import LRUCache

from app.services.market_data import (
    DOWNLOAD_BUFFER_DAYS, LIVE_TTL_SECONDS, download, extract_close_prices,
)

HISTORY_START = date(1985, 1, 1)
HISTORY_TTL_SECONDS = 6 * 60 * 60
MAX_SYMBOLS = 64  # ~10k rows max per symbol: a few MB in total
TAIL_OVERLAP_DAYS = 14  # calendar days of cached history re-downloaded to detect re-adjustments
REFETCH_TOLERANCE = 1e-6  # relative

# Indirection so tests can control the clock and "today"
_now = time.time
_today = date.today


@dataclass
class _Entry:
    series: pd.Series  # raw closes on the days the symbol traded (no NaN, no ffill)
    start: date  # history requested from this date
    end: date  # ... up to this date; requests up to here are covered
    live_from: date  # rows on/after this date may have been live (provisional) when fetched
    fetched_at: float  # last full download
    checked_at: float  # last full download or tail refresh


_entries: LRUCache = LRUCache(maxsize=MAX_SYMBOLS)
_lock = threading.Lock()


def clear() -> None:
    with _lock:
        _entries.clear()


def _close_columns(data: pd.DataFrame, tickers: list[str]) -> dict[str, pd.Series]:
    """Per-ticker close series (NaN dropped) from a yf.download(auto_adjust=True) frame."""
    if data is None or data.empty:
        return {}
    try:
        closes = extract_close_prices(data, error_context=", ".join(tickers))
    except ValueError:
        return {}
    if isinstance(closes, pd.Series):  # single ticker with flat columns
        closes = closes.to_frame(tickers[0])
    out: dict[str, pd.Series] = {}
    for t in tickers:
        if t in closes.columns:
            s = closes[t].dropna().astype(float)
            s.name, s.index.name = t, None
            out[t] = s
    return out


def _download_closes(tickers: list[str], start: date, end: date) -> dict[str, pd.Series]:
    return _close_columns(download(tickers, start, end), tickers)


def _same(a: pd.Series, b: pd.Series) -> bool:
    """True if two series agree on their common dates within REFETCH_TOLERANCE."""
    common = a.index.intersection(b.index)
    if common.empty:
        return True
    x, y = a.loc[common], b.loc[common]
    scale = pd.concat([x.abs(), y.abs()], axis=1).max(axis=1).clip(lower=1e-12)
    return bool(((x - y).abs() <= REFETCH_TOLERANCE * scale).all())


def _store_full(tickers: list[str], start: date, end: date) -> None:
    """Download full histories for `tickers` in one request and cache them."""
    today, now = _today(), _now()
    fetched = _download_closes(tickers, start, end)
    with _lock:
        for t in tickers:
            s = fetched.get(t)
            if s is None or s.empty:
                _entries.pop(t, None)  # unknown ticker: don't cache "no data"
                continue
            _entries[t] = _Entry(s, start, end, today, now, now)


def _refresh_tails(entries: dict[str, _Entry], end: date) -> list[str]:
    """Re-download recent days for `entries`; return symbols whose past prices changed."""
    today, now = _today(), _now()
    tail_start = min(min(e.series.index[-1].date(), e.live_from) for e in entries.values()) \
        - timedelta(days=TAIL_OVERLAP_DAYS)
    tickers = list(entries)
    fetched = _download_closes(tickers, tail_start, end)
    changed = []
    with _lock:
        for t, e in entries.items():
            tail = fetched.get(t)
            if tail is None or tail.empty:
                # Nothing new (or a transient gap): keep what we have
                _entries[t] = _Entry(e.series, e.start, max(e.end, end), e.live_from, e.fetched_at, now)
                continue
            # Rows dated before live_from were final when cached; they must still match
            final_old = e.series[e.series.index < pd.Timestamp(e.live_from)]
            if not _same(final_old, tail):
                changed.append(t)
                continue
            # Replace everything from the tail's first date (provisional rows included)
            kept = e.series[e.series.index < tail.index[0]]
            series = pd.concat([kept, tail])
            series.name = t
            _entries[t] = _Entry(series, e.start, max(e.end, end), today, e.fetched_at, now)
    return changed


def get_closes(tickers: list[str], start_date: date, end_date: date) -> pd.DataFrame:
    """Raw closes for `tickers` over [start_date - buffer, end_date].

    Same shape as a fresh range download: one column per ticker (in order),
    one row per date on which at least one ticker traded, NaN where a ticker
    didn't trade. Tickers without any data are missing from the columns.
    """
    tickers = list(dict.fromkeys(tickers))
    today, now = _today(), _now()
    first_needed = start_date - timedelta(days=DOWNLOAD_BUFFER_DAYS)
    live = end_date >= today
    fetch_end = max(end_date, today)

    full, tails = [], {}
    with _lock:
        for t in tickers:
            e = _entries.get(t)
            if (e is None or e.start > first_needed or now - e.fetched_at > HISTORY_TTL_SECONDS):
                full.append(t)
            elif end_date > e.end or (live and now - e.checked_at > LIVE_TTL_SECONDS):
                tails[t] = e

    if tails:
        full += _refresh_tails(tails, fetch_end)
    if full:
        _store_full(full, min(HISTORY_START, first_needed), fetch_end)

    lo, hi = pd.Timestamp(first_needed), pd.Timestamp(end_date)
    columns = {}
    with _lock:
        for t in tickers:
            e = _entries.get(t)
            if e is not None:
                s = e.series[(e.series.index >= lo) & (e.series.index <= hi)]
                if not s.empty:  # like a fresh download: no column without data
                    columns[t] = s
    if not columns:
        return pd.DataFrame()
    frame = pd.concat(columns, axis=1, sort=True)
    return frame[frame.notna().any(axis=1)]


def get_close(ticker: str, start_date: date, end_date: date) -> pd.Series:
    """Raw closes for one ticker over [start_date - buffer, end_date] (may be empty)."""
    frame = get_closes([ticker], start_date, end_date)
    if ticker not in frame.columns:
        return pd.Series(dtype=float)
    return frame[ticker].dropna()


def log_stats() -> None:  # pragma: no cover - debugging aid
    with _lock:
        logging.info("price cache: %d symbols", len(_entries))
