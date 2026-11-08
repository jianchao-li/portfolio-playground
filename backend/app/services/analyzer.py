import logging
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from app.models.portfolio import Portfolio, PortfolioStats, PerformanceData
from app.services import price_cache
from app.services.currency import CurrencyService
from app.services.market_data import clip_to_range

DEFAULT_RISK_FREE_RATE = 0.05  # 5% annual fallback
RISK_FREE_TICKER = '^IRX'  # 13-week T-bill yield, quoted in percent
DAYS_PER_YEAR = 365.25
# Rebalancing option -> pandas period of the rebalance schedule
REBALANCE_FREQUENCIES = {"monthly": "M", "quarterly": "Q", "annually": "Y"}
MIN_TRADING_DAYS = 2  # need at least one daily return
# Annualize only spans of ~1 year or more; the slack tolerates weekends and
# holidays at both ends of a calendar-year range (e.g. Jan 2 - Dec 31).
MIN_ANNUALIZE_DAYS = 358


def _positive(x: float) -> bool:
    return bool(np.isfinite(x)) and x > 1e-12


def _round(x: float | None) -> float | None:
    """Round to 4 decimals; non-finite or missing values become None."""
    if x is None or not np.isfinite(x):
        return None
    return round(float(x), 4)


def mean_risk_free_rate(rates: pd.Series | None, start, end) -> float:
    """Average annual T-bill rate over [start, end], as a decimal (4.5% -> 0.045).

    `rates` is the daily ^IRX series in percent (see fetch_risk_free_rates).
    Falls back to the whole series, then to DEFAULT_RISK_FREE_RATE.
    """
    if rates is None or rates.empty:
        return DEFAULT_RISK_FREE_RATE
    window = clip_to_range(rates, start, end)
    return float((window if not window.empty else rates).mean()) / 100


@dataclass
class AnalysisResult:
    stats: PortfolioStats
    performance: PerformanceData
    # First/last date with data for this portfolio in the requested range,
    # before any start-date alignment
    data_start: date
    data_end: date


class PortfolioAnalyzer:
    def __init__(self):
        self.currency_service = CurrencyService()

    def fetch_risk_free_rates(self, start_date: date, end_date: date) -> pd.Series | None:
        """Daily 13-week T-bill yields (^IRX, percent) for the range, or None.

        The series (not just its mean) is returned, so each portfolio's Sharpe
        and Sortino can use the average over its own data window. It comes
        from the per-symbol price cache, usually filled by fetch_prices(),
        which requests the T-bill series in the same Yahoo download as the
        asset prices.
        """
        try:
            rates = clip_to_range(price_cache.get_close(RISK_FREE_TICKER, start_date, end_date),
                                  start_date, end_date)
            return rates if not rates.empty else None
        except Exception as e:
            logging.warning("Failed to fetch risk-free rates: %s", e)
            return None

    def fetch_risk_free_rate(self, start_date: date, end_date: date) -> float:
        """Average annual risk-free rate over the range, as a decimal."""
        return mean_risk_free_rate(self.fetch_risk_free_rates(start_date, end_date),
                                   start_date, end_date)

    def fetch_prices(self, symbols: list[str], start_date: date, end_date: date) -> pd.DataFrame:
        """Fetch raw adjusted close prices for the given symbols.

        The frame is NOT forward-filled or clipped: it keeps the download
        buffer before start_date and NaN on days a symbol didn't trade, so
        each portfolio can later keep only the days its own symbols traded
        (see portfolio_prices). Every symbol is validated to have some data.

        Prices come from the per-symbol price cache (full histories, sliced
        to the range), so only symbols not cached yet are downloaded. The
        T-bill series is requested alongside, so a cold request still makes
        a single Yahoo download.
        """
        tickers = symbols if RISK_FREE_TICKER in symbols else symbols + [RISK_FREE_TICKER]
        prices = price_cache.get_closes(tickers, start_date, end_date)

        # Validate: check for symbols missing entirely or with no price data
        bad_symbols = [s for s in symbols if s not in prices.columns or prices[s].isna().all()]
        if bad_symbols:
            raise ValueError(f"No price data found for: {', '.join(bad_symbols)}")

        # Drop the T-bill column and rows on which none of the symbols traded
        prices = prices[symbols]
        return prices[prices.notna().any(axis=1)]

    @staticmethod
    def portfolio_prices(raw: pd.DataFrame, symbols: list[str],
                         start_date: date, end_date: date) -> pd.DataFrame:
        """Daily prices for one portfolio, on the days its own symbols traded.

        Rows where none of these symbols traded (e.g. weekends added by a
        crypto ticker in another portfolio) are dropped, so they can't add
        fake 0% days to this portfolio's stats. Remaining gaps (an exchange
        holiday for one of the symbols) are forward-filled, then rows before
        every symbol has a price (newest listing) are dropped.
        """
        prices = raw[symbols]
        prices = prices[prices.notna().any(axis=1)].ffill()
        prices = clip_to_range(prices, start_date, end_date).dropna()
        if prices.empty:
            raise ValueError("No price data available for the selected date range")
        if len(prices) < MIN_TRADING_DAYS:
            raise ValueError(
                f"Not enough trading days in the selected range (found {len(prices)}, "
                f"need at least {MIN_TRADING_DAYS}). Please choose a longer date range."
            )
        return prices

    def calculate_portfolio_values(self, portfolio: Portfolio, prices: pd.DataFrame,
                                   rebalance: str = "none") -> pd.Series:
        """Daily portfolio values, starting at 100.

        rebalance="none" is buy-and-hold: weights drift with prices. Otherwise
        holdings are reset to the target weights at the close of the first
        trading day (in this portfolio's own calendar) of each month, quarter
        or year, with no transaction costs.
        """
        if rebalance != "none":
            return self._rebalanced_values(portfolio, prices, REBALANCE_FREQUENCIES[rebalance])

        # Normalize prices to start at 1
        normalized = prices / prices.iloc[0]

        # Apply weights
        portfolio_value = pd.Series(0.0, index=normalized.index)
        for asset in portfolio.assets:
            if asset.symbol in normalized.columns:
                portfolio_value += normalized[asset.symbol] * asset.weight

        return portfolio_value * 100  # Start at 100

    @staticmethod
    def _rebalanced_values(portfolio: Portfolio, prices: pd.DataFrame, freq: str) -> pd.Series:
        assets = [a for a in portfolio.assets if a.symbol in prices.columns]
        weights = np.array([a.weight for a in assets])
        p = prices[[a.symbol for a in assets]].to_numpy(dtype=float)
        n = len(p)
        # Row indices where a new period begins (the first row is the initial allocation)
        period = prices.index.to_period(freq)
        starts = (np.flatnonzero(period[1:] != period[:-1]) + 1).tolist()
        bounds = [0, *starts, n]

        values = np.empty(n)
        value = 1.0
        for a, b in zip(bounds[:-1], bounds[1:]):
            holdings = weights * value / p[a]  # units of each asset at target weights
            values[a:b] = p[a:b] @ holdings
            if b < n:
                value = p[b] @ holdings  # value at the next rebalance day's close
        return pd.Series(values * 100, index=prices.index)

    def calculate_stats(self, portfolio_values: pd.Series, name: str,
                        rf_annual: float = DEFAULT_RISK_FREE_RATE) -> PortfolioStats:
        """Calculate portfolio statistics from daily values.

        Formulas follow QuantStats (comp, cagr, volatility, sharpe, max_drawdown),
        but annualize by calendar time instead of assuming 252 rows per year:
        years = calendar days / 365.25 and periods_per_year = returns / years.
        This stays correct for crypto (~365 rows/year) and mixed calendars.

        Annualized return is None for spans shorter than ~1 year; volatility,
        Sharpe and Sortino are None when undefined (single return, zero
        variance, or no returns below the risk-free rate for Sortino).
        """
        if len(portfolio_values) < MIN_TRADING_DAYS:
            raise ValueError(
                f"Not enough trading days in the selected range (need at least {MIN_TRADING_DAYS})"
            )
        returns = portfolio_values.pct_change().dropna()
        growth = (1 + returns).cumprod()
        total_return = growth.iloc[-1] - 1

        span_days = (portfolio_values.index[-1] - portfolio_values.index[0]).days
        years = max(span_days, 1) / DAYS_PER_YEAR
        periods_per_year = len(returns) / years

        annualized_return = ((1 + total_return) ** (1 / years) - 1
                             if span_days >= MIN_ANNUALIZE_DAYS else None)

        daily_std = returns.std()
        volatility = daily_std * np.sqrt(periods_per_year) if _positive(daily_std) else None

        # Sharpe on excess returns; like QuantStats, rf is only applied when positive
        rf_per_period = (1 + rf_annual) ** (1 / periods_per_year) - 1 if rf_annual > 0 else 0.0
        excess = returns - rf_per_period
        excess_std = excess.std()
        sharpe = (excess.mean() / excess_std * np.sqrt(periods_per_year)
                  if _positive(excess_std) else None)

        # Sortino (QuantStats): same excess returns and annualization as Sharpe,
        # divided by the downside deviation sqrt(mean(min(excess, 0)^2)) taken
        # over all periods
        downside = np.sqrt((excess.clip(upper=0) ** 2).sum() / len(excess))
        sortino = (excess.mean() / downside * np.sqrt(periods_per_year)
                   if len(excess) >= 2 and _positive(downside) else None)

        # Drawdown measured against a starting value of 1.0 before the first return
        peak = growth.cummax().clip(lower=1.0)
        max_drawdown = min((growth / peak).min(), 1.0) - 1

        return PortfolioStats(
            name=name,
            total_return=_round(total_return),
            annualized_return=_round(annualized_return),
            volatility=_round(volatility),
            sharpe_ratio=_round(sharpe),
            sortino_ratio=_round(sortino),
            max_drawdown=_round(max_drawdown),
        )

    def analyze(self, portfolio: Portfolio, start_date: date, end_date: date,
                currency: str = "USD",
                rf_rates: pd.Series | None = None, exchange_rates=None,
                all_prices=None, align_start: date | None = None,
                rebalance: str = "none") -> AnalysisResult:
        """Full analysis of a portfolio.

        `align_start` clips the already-fetched prices to start on that date
        (the latest common start across compared portfolios), so stats cover
        the same period as the others. Nothing extra is downloaded.
        """
        symbols = [asset.symbol for asset in portfolio.assets]
        if all_prices is None:
            all_prices = self.fetch_prices(symbols, start_date, end_date)
        prices = self.portfolio_prices(all_prices, symbols, start_date, end_date)
        data_start, data_end = prices.index[0].date(), prices.index[-1].date()
        if align_start is not None:
            prices = prices[prices.index >= pd.Timestamp(align_start)]
            if len(prices) < MIN_TRADING_DAYS:
                raise ValueError(
                    f"Not enough trading days for '{portfolio.name}' after aligning start dates "
                    f"to {align_start.isoformat()}. Turn off alignment or choose a longer range."
                )

        # Normalize to $100 USD first
        portfolio_values = self.calculate_portfolio_values(portfolio, prices, rebalance)

        # Then convert to target currency (captures both asset returns + currency movement)
        if currency != "USD":
            if exchange_rates is None:
                exchange_rates = self.currency_service.fetch_exchange_rates(
                    currency, start_date, end_date
                )
            aligned_rates = exchange_rates.reindex(portfolio_values.index, method="ffill").bfill()
            portfolio_values = portfolio_values * aligned_rates

        if rf_rates is None:
            rf_rates = self.fetch_risk_free_rates(start_date, end_date)
        # Average T-bill rate over the period these stats actually cover
        rf_rate = mean_risk_free_rate(rf_rates, portfolio_values.index[0], portfolio_values.index[-1])

        stats = self.calculate_stats(portfolio_values, portfolio.name, rf_rate)

        performance = PerformanceData(
            dates=[d.strftime('%Y-%m-%d') for d in portfolio_values.index],
            values=[round(v, 2) for v in portfolio_values.values]
        )

        return AnalysisResult(stats, performance, data_start, data_end)

    def common_start(self, portfolios: list[Portfolio], all_prices: pd.DataFrame,
                     start_date: date, end_date: date) -> date | None:
        """Latest first-trading date across portfolios, or None if all start together."""
        starts = {
            self.portfolio_prices(all_prices, [a.symbol for a in p.assets], start_date, end_date)
            .index[0].date()
            for p in portfolios
        }
        return max(starts) if len(starts) > 1 else None
