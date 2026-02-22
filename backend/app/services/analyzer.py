import logging
import threading
from datetime import date, timedelta

import pandas as pd
import quantstats as qs
import yfinance as yf
from cachetools import TTLCache

from app.models.portfolio import Portfolio, PortfolioStats, PerformanceData
from app.services.currency import CurrencyService, extract_close_prices

_prices_cache = TTLCache(maxsize=32, ttl=300)
_prices_lock = threading.Lock()
_rf_cache = TTLCache(maxsize=16, ttl=300)
_rf_lock = threading.Lock()

DEFAULT_RISK_FREE_RATE = 0.05  # 5% annual fallback


class PortfolioAnalyzer:
    def __init__(self):
        self.currency_service = CurrencyService()

    def fetch_risk_free_rate(self, start_date: date, end_date: date) -> float:
        """Fetch average annual risk-free rate (3-month T-bill) for date range."""
        key = (start_date, end_date)
        with _rf_lock:
            if key in _rf_cache:
                return _rf_cache[key]

        adjusted_start = start_date - timedelta(days=5)

        try:
            data = yf.download(
                tickers='^IRX',
                start=adjusted_start.isoformat(),
                end=end_date.isoformat(),
                progress=False
            )
            if len(data) > 0:
                if isinstance(data.columns, pd.MultiIndex):
                    rates = data['Close']['^IRX']
                else:
                    rates = data['Close']
                rates = rates.ffill().dropna()
                rates = rates[rates.index >= pd.Timestamp(start_date)]
                rates = rates[rates.index <= pd.Timestamp(end_date)]
                # Convert percentage to decimal (e.g., 4.5% -> 0.045)
                rf_annual = float(rates.mean()) / 100
                with _rf_lock:
                    _rf_cache[key] = rf_annual
                return rf_annual
        except Exception as e:
            logging.warning("Failed to fetch risk-free rates: %s", e)

        with _rf_lock:
            _rf_cache[key] = DEFAULT_RISK_FREE_RATE
        return DEFAULT_RISK_FREE_RATE

    def fetch_prices(self, symbols: list[str], start_date: date, end_date: date,
                     batch: bool = False) -> pd.DataFrame:
        """Fetch adjusted close prices for given symbols.

        If batch=True, skip cross-column dropna so each portfolio can apply
        it on its own subset (avoids a newer ticker trimming dates for all).
        """
        key = (frozenset(symbols), start_date, end_date, batch)
        with _prices_lock:
            if key in _prices_cache:
                return _prices_cache[key]

        # Add buffer for weekend/holiday adjustments
        adjusted_start = start_date - timedelta(days=5)

        data = yf.download(
            tickers=symbols,
            start=adjusted_start.isoformat(),
            end=end_date.isoformat(),
            progress=False
        )

        # Extract close prices using shared helper
        prices = extract_close_prices(data, error_context=", ".join(symbols))

        # Ensure we have a DataFrame with symbol columns
        if isinstance(prices, pd.Series):
            prices = prices.to_frame(symbols[0])

        # Validate: check for symbols missing entirely or with no price data
        bad_symbols = [s for s in symbols if s not in prices.columns or prices[s].isna().all()]
        if bad_symbols:
            raise ValueError(f"No price data found for: {', '.join(bad_symbols)}")

        # Forward fill missing data, then filter to requested range
        prices = prices.ffill()
        if not batch:
            prices = prices.dropna()
        prices = prices[prices.index >= pd.Timestamp(start_date)]
        prices = prices[prices.index <= pd.Timestamp(end_date)]

        if prices.empty:
            raise ValueError("No price data available for the selected date range")

        with _prices_lock:
            _prices_cache[key] = prices
        return prices

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
        """Calculate portfolio statistics using QuantStats."""
        daily_returns = portfolio_values.pct_change().dropna()

        return PortfolioStats(
            name=name,
            total_return=round(float(qs.stats.comp(daily_returns)), 4),
            annualized_return=round(float(qs.stats.cagr(daily_returns)), 4),
            volatility=round(float(qs.stats.volatility(daily_returns, annualize=True)), 4),
            sharpe_ratio=round(float(qs.stats.sharpe(daily_returns, rf=rf_annual)), 4),
            max_drawdown=round(float(qs.stats.max_drawdown(daily_returns)), 4)
        )

    def analyze(self, portfolio: Portfolio, start_date: date, end_date: date,
                currency: str = "USD",
                rf_rate: float | None = None, exchange_rates=None,
                all_prices=None) -> tuple[PortfolioStats, PerformanceData]:
        """Full analysis of a portfolio."""
        symbols = [asset.symbol for asset in portfolio.assets]
        if all_prices is not None:
            missing = [s for s in symbols if s not in all_prices.columns]
            if missing:
                raise ValueError(f"No price data found for: {', '.join(missing)}")
            subset = all_prices[symbols]
            bad_symbols = [s for s in symbols if subset[s].isna().all()]
            if bad_symbols:
                raise ValueError(f"No price data found for: {', '.join(bad_symbols)}")
            prices = subset.dropna()
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
