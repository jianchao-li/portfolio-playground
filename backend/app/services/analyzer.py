import yfinance as yf
import pandas as pd
import numpy as np
from datetime import date, datetime, timedelta
from functools import lru_cache

from app.models.portfolio import Portfolio, PortfolioStats, PerformanceData, CurrencyCode
from app.services.currency import CurrencyService


class PortfolioAnalyzer:
    TRADING_DAYS_PER_YEAR = 252

    def __init__(self):
        self.currency_service = CurrencyService()
        self._cached_rf_rate: float | None = None
        self._rf_cache_time: datetime | None = None

    def fetch_risk_free_rate(self) -> float:
        """Fetch current 3-month T-bill rate from Yahoo Finance."""
        try:
            data = yf.download('^IRX', period='5d', progress=False)
            if len(data) > 0:
                # ^IRX returns rate as percentage (e.g., 3.59 = 3.59%)
                rate = data['Close'].iloc[-1]
                if hasattr(rate, 'item'):
                    rate = rate.item()
                return rate / 100  # Convert to decimal
        except Exception:
            pass
        return 0.05  # Fallback to 5% if fetch fails

    @property
    def risk_free_rate(self) -> float:
        """Get risk-free rate with 1-hour cache."""
        now = datetime.now()
        if self._cached_rf_rate is None or \
           self._rf_cache_time is None or \
           (now - self._rf_cache_time).seconds > 3600:
            self._cached_rf_rate = self.fetch_risk_free_rate()
            self._rf_cache_time = now
        return self._cached_rf_rate

    def fetch_prices(self, symbols: list[str], start_date: date, end_date: date) -> pd.DataFrame:
        """Fetch adjusted close prices for given symbols."""
        # Add buffer for weekend/holiday adjustments
        adjusted_start = start_date - timedelta(days=5)

        data = yf.download(
            tickers=symbols,
            start=adjusted_start.isoformat(),
            end=end_date.isoformat(),
            progress=False
        )

        # Handle yfinance column format (may be MultiIndex or flat)
        if isinstance(data.columns, pd.MultiIndex):
            # New yfinance format: MultiIndex columns like ('Adj Close', 'SPY')
            # Try 'Adj Close' first, fall back to 'Close' if not available
            if 'Adj Close' in data.columns.get_level_values(0):
                prices = data['Adj Close']
            else:
                prices = data['Close']
        else:
            # Single ticker or old format
            if 'Adj Close' in data.columns:
                prices = data['Adj Close']
            elif 'Close' in data.columns:
                prices = data['Close']
            else:
                raise ValueError(f"No price data found for symbols: {symbols}")

        # Ensure we have a DataFrame with symbol columns
        if isinstance(prices, pd.Series):
            prices = prices.to_frame(symbols[0])

        # Forward fill missing data, then filter to requested range
        prices = prices.ffill().dropna()
        prices = prices[prices.index >= pd.Timestamp(start_date)]

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

    def calculate_stats(self, portfolio_values: pd.Series, name: str) -> PortfolioStats:
        """Calculate portfolio statistics."""
        # Daily returns
        daily_returns = portfolio_values.pct_change().dropna()

        # Total return
        total_return = (portfolio_values.iloc[-1] / portfolio_values.iloc[0]) - 1

        # Annualized return
        num_days = len(portfolio_values)
        annualized_return = (1 + total_return) ** (self.TRADING_DAYS_PER_YEAR / num_days) - 1

        # Volatility (annualized)
        volatility = daily_returns.std() * np.sqrt(self.TRADING_DAYS_PER_YEAR)

        # Sharpe ratio
        daily_rf = self.risk_free_rate / self.TRADING_DAYS_PER_YEAR
        excess_returns = daily_returns - daily_rf
        sharpe_ratio = (excess_returns.mean() / excess_returns.std()) * np.sqrt(self.TRADING_DAYS_PER_YEAR)

        # Max drawdown
        rolling_max = portfolio_values.cummax()
        drawdown = (portfolio_values - rolling_max) / rolling_max
        max_drawdown = drawdown.min()

        return PortfolioStats(
            name=name,
            total_return=round(total_return, 4),
            annualized_return=round(annualized_return, 4),
            volatility=round(volatility, 4),
            sharpe_ratio=round(sharpe_ratio, 4),
            max_drawdown=round(max_drawdown, 4)
        )

    def analyze(self, portfolio: Portfolio, start_date: date, end_date: date, currency: CurrencyCode = "USD") -> tuple[PortfolioStats, PerformanceData]:
        """Full analysis of a portfolio."""
        symbols = [asset.symbol for asset in portfolio.assets]
        prices = self.fetch_prices(symbols, start_date, end_date)

        # Normalize to $100 USD first
        portfolio_values = self.calculate_portfolio_values(portfolio, prices)

        # Then convert to target currency (captures both asset returns + currency movement)
        if currency != "USD":
            exchange_rates = self.currency_service.fetch_exchange_rates(
                currency, start_date, end_date
            )
            aligned_rates = exchange_rates.reindex(portfolio_values.index, method="ffill").bfill()
            portfolio_values = portfolio_values * aligned_rates

        stats = self.calculate_stats(portfolio_values, portfolio.name)

        performance = PerformanceData(
            dates=[d.strftime('%Y-%m-%d') for d in portfolio_values.index],
            values=[round(v, 2) for v in portfolio_values.values]
        )

        return stats, performance
