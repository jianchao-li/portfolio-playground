import logging
import threading
from datetime import date

import numpy as np
import pandas as pd

from app.models.portfolio import Portfolio, PortfolioStats, PerformanceData
from app.services.currency import CurrencyService
from app.services.market_data import (
    cached, clip_to_range, download, extract_close_prices, make_cache,
)

_prices_cache = make_cache(maxsize=32)
_prices_lock = threading.Lock()
_rf_cache = make_cache(maxsize=16)
_rf_lock = threading.Lock()

DEFAULT_RISK_FREE_RATE = 0.05  # 5% annual fallback
RISK_FREE_TICKER = '^IRX'  # 13-week T-bill yield, quoted in percent
TRADING_DAYS = 252


def _mean_risk_free_rate(rates: pd.Series, start_date: date, end_date: date) -> float:
    """Average annual rate over the range, as a decimal (4.5% -> 0.045)."""
    return float(clip_to_range(rates, start_date, end_date).mean()) / 100


def _rf_close(data: pd.DataFrame) -> pd.Series:
    if isinstance(data.columns, pd.MultiIndex):
        return data['Close'][RISK_FREE_TICKER]
    return data['Close']


class PortfolioAnalyzer:
    def __init__(self):
        self.currency_service = CurrencyService()

    def fetch_risk_free_rate(self, start_date: date, end_date: date) -> float:
        """Fetch average annual risk-free rate (3-month T-bill) for date range.

        Usually already cached by fetch_prices(), which downloads the T-bill
        series in the same Yahoo request as the asset prices.
        """
        def compute() -> float:
            try:
                data = download(RISK_FREE_TICKER, start_date, end_date)
                if len(data) > 0:
                    return _mean_risk_free_rate(_rf_close(data).ffill().dropna(), start_date, end_date)
            except Exception as e:
                logging.warning("Failed to fetch risk-free rates: %s", e)
            return DEFAULT_RISK_FREE_RATE

        return cached(_rf_cache, _rf_lock, (start_date, end_date), compute)

    def fetch_prices(self, symbols: list[str], start_date: date, end_date: date,
                     batch: bool = False) -> pd.DataFrame:
        """Fetch adjusted close prices for given symbols.

        If batch=True, skip cross-column dropna so each portfolio can apply
        it on its own subset (avoids a newer ticker trimming dates for all).

        When the risk-free rate for this range isn't cached yet, it is
        downloaded in the same request and cached, saving a round trip.
        """
        def compute() -> pd.DataFrame:
            rf_key = (start_date, end_date)
            with _rf_lock:
                include_rf = rf_key not in _rf_cache and RISK_FREE_TICKER not in symbols
            tickers = symbols + [RISK_FREE_TICKER] if include_rf else symbols

            data = download(tickers, start_date, end_date)
            prices = extract_close_prices(data, error_context=", ".join(symbols))

            # Ensure we have a DataFrame with symbol columns
            if isinstance(prices, pd.Series):
                prices = prices.to_frame(symbols[0])

            if include_rf:
                rf_rates = (_rf_close(data).dropna() if RISK_FREE_TICKER in prices.columns
                            else pd.Series(dtype=float))
                rf = (_mean_risk_free_rate(rf_rates, start_date, end_date)
                      if not rf_rates.empty else DEFAULT_RISK_FREE_RATE)
                with _rf_lock:
                    _rf_cache[rf_key] = rf
                if RISK_FREE_TICKER in prices.columns:
                    # Drop rows that only exist because the T-bill traded that day
                    symbol_cols = [c for c in prices.columns if c != RISK_FREE_TICKER]
                    extra_rows = prices[symbol_cols].isna().all(axis=1) & prices[RISK_FREE_TICKER].notna()
                    prices = prices.loc[~extra_rows, symbol_cols]

            # Validate: check for symbols missing entirely or with no price data
            bad_symbols = [s for s in symbols if s not in prices.columns or prices[s].isna().all()]
            if bad_symbols:
                raise ValueError(f"No price data found for: {', '.join(bad_symbols)}")

            # Forward fill missing data, then filter to requested range
            prices = prices.ffill()
            if not batch:
                prices = prices.dropna()
            prices = clip_to_range(prices, start_date, end_date)

            if prices.empty:
                raise ValueError("No price data available for the selected date range")
            return prices

        return cached(_prices_cache, _prices_lock,
                      (frozenset(symbols), start_date, end_date, batch), compute)

    def calculate_portfolio_values(self, portfolio: Portfolio, prices: pd.DataFrame) -> pd.Series:
        """Calculate daily portfolio values based on weights."""
        # Normalize prices to start at 1
        normalized = prices / prices.iloc[0]

        # Apply weights
        portfolio_value = pd.Series(0.0, index=normalized.index)
        for asset in portfolio.assets:
            if asset.symbol in normalized.columns:
                portfolio_value += normalized[asset.symbol] * asset.weight

        return portfolio_value * 100  # Start at 100

    def calculate_stats(self, portfolio_values: pd.Series, name: str,
                        rf_annual: float = DEFAULT_RISK_FREE_RATE) -> PortfolioStats:
        """Calculate portfolio statistics from daily values.

        Formulas match QuantStats (comp, cagr, volatility, sharpe, max_drawdown)
        with 252 trading days per year.
        """
        returns = portfolio_values.pct_change().dropna()
        growth = (1 + returns).cumprod()

        total_return = growth.iloc[-1] - 1
        years = returns.count() / TRADING_DAYS
        annualized_return = (1 + total_return) ** (1 / years) - 1
        volatility = returns.std() * np.sqrt(TRADING_DAYS)

        # Sharpe on excess returns; like QuantStats, rf is only applied when positive
        excess = returns - ((1 + rf_annual) ** (1 / TRADING_DAYS) - 1) if rf_annual > 0 else returns
        sharpe = excess.mean() / excess.std() * np.sqrt(TRADING_DAYS)

        # Drawdown measured against a starting value of 1.0 before the first return
        peak = growth.cummax().clip(lower=1.0)
        max_drawdown = min((growth / peak).min(), 1.0) - 1

        return PortfolioStats(
            name=name,
            total_return=round(float(total_return), 4),
            annualized_return=round(float(annualized_return), 4),
            volatility=round(float(volatility), 4),
            sharpe_ratio=round(float(sharpe), 4),
            max_drawdown=round(float(max_drawdown), 4),
        )

    def analyze(self, portfolio: Portfolio, start_date: date, end_date: date,
                currency: str = "USD",
                rf_rate: float | None = None, exchange_rates=None,
                all_prices=None) -> tuple[PortfolioStats, PerformanceData]:
        """Full analysis of a portfolio."""
        symbols = [asset.symbol for asset in portfolio.assets]
        if all_prices is not None:
            # all_prices comes from fetch_prices(batch=True), which already
            # validated every symbol; only the per-portfolio dropna remains.
            prices = all_prices[symbols].dropna()
            if prices.empty:
                raise ValueError("No price data available for the selected date range")
        else:
            prices = self.fetch_prices(symbols, start_date, end_date)

        # Normalize to $100 USD first
        portfolio_values = self.calculate_portfolio_values(portfolio, prices)

        # Then convert to target currency (captures both asset returns + currency movement)
        if currency != "USD":
            if exchange_rates is None:
                exchange_rates = self.currency_service.fetch_exchange_rates(
                    currency, start_date, end_date
                )
            aligned_rates = exchange_rates.reindex(portfolio_values.index, method="ffill").bfill()
            portfolio_values = portfolio_values * aligned_rates

        # Fetch risk-free rate for Sharpe ratio calculation (if not provided)
        if rf_rate is None:
            rf_rate = self.fetch_risk_free_rate(start_date, end_date)

        stats = self.calculate_stats(portfolio_values, portfolio.name, rf_rate)

        performance = PerformanceData(
            dates=[d.strftime('%Y-%m-%d') for d in portfolio_values.index],
            values=[round(v, 2) for v in portfolio_values.values]
        )

        return stats, performance
