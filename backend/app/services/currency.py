import yfinance as yf
import pandas as pd
from datetime import date, timedelta
from typing import Literal, Optional

CurrencyCode = Literal["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"]

SUPPORTED_CURRENCIES = {
    "USD": {"symbol": "$", "name": "US Dollar", "ticker": None},
    "EUR": {"symbol": "€", "name": "Euro", "ticker": "EURUSD=X"},
    "GBP": {"symbol": "£", "name": "British Pound", "ticker": "GBPUSD=X"},
    "JPY": {"symbol": "¥", "name": "Japanese Yen", "ticker": "JPY=X"},
    "CHF": {"symbol": "Fr", "name": "Swiss Franc", "ticker": "CHF=X"},
    "CAD": {"symbol": "C$", "name": "Canadian Dollar", "ticker": "CAD=X"},
    "AUD": {"symbol": "A$", "name": "Australian Dollar", "ticker": "AUDUSD=X"},
}

# Currencies where the quote is XXX/USD (value is how many USD per 1 unit of currency)
# For these, we need to invert: 1 EUR = X USD means 1 USD = 1/X EUR
INVERTED_QUOTES = {"EUR", "GBP", "AUD"}


class CurrencyService:
    """Service for fetching and applying currency exchange rates."""

    def fetch_exchange_rates(
        self, currency: CurrencyCode, start_date: date, end_date: date
    ) -> Optional[pd.Series]:
        """
        Fetch exchange rates for converting USD to target currency.
        Returns a Series indexed by date with conversion multipliers.
        """
        if currency == "USD":
            return None  # No conversion needed

        currency_info = SUPPORTED_CURRENCIES.get(currency)
        if not currency_info or not currency_info["ticker"]:
            raise ValueError(f"Unsupported currency: {currency}")

        # Add buffer for weekend/holiday adjustments
        adjusted_start = start_date - timedelta(days=5)

        data = yf.download(
            tickers=currency_info["ticker"],
            start=adjusted_start.isoformat(),
            end=end_date.isoformat(),
            progress=False,
        )

        if data.empty:
            raise ValueError(f"No exchange rate data available for {currency}")

        # Handle yfinance column format
        if isinstance(data.columns, pd.MultiIndex):
            if "Adj Close" in data.columns.get_level_values(0):
                rates = data["Adj Close"]
            else:
                rates = data["Close"]
            # Flatten if still multi-index
            if isinstance(rates, pd.DataFrame):
                rates = rates.iloc[:, 0]
        else:
            if "Adj Close" in data.columns:
                rates = data["Adj Close"]
            elif "Close" in data.columns:
                rates = data["Close"]
            else:
                raise ValueError(f"No exchange rate data found for {currency}")

        # Forward fill missing data
        rates = rates.ffill().dropna()
        rates = rates[rates.index >= pd.Timestamp(start_date)]

        if rates.empty:
            raise ValueError(f"No exchange rate data available for {currency} in the specified date range")

        # Convert to proper multiplier
        # For EUR/GBP/AUD: quote is XXX/USD, so we need to invert to get USD/XXX
        # For JPY/CHF/CAD: quote is already USD/XXX
        if currency in INVERTED_QUOTES:
            rates = 1 / rates

        return rates

    def apply_conversion(
        self, prices: pd.DataFrame, rates: Optional[pd.Series]
    ) -> pd.DataFrame:
        """
        Apply exchange rate conversion to price data.
        Multiplies prices by exchange rates for each matching date.
        """
        if rates is None:
            return prices

        # Align indices - forward fill, then backfill for any leading NaN
        aligned_rates = rates.reindex(prices.index, method="ffill")
        aligned_rates = aligned_rates.bfill()  # Handle case where prices start before rates

        return prices.multiply(aligned_rates, axis=0)


def get_currency_list() -> list[dict]:
    """Return list of supported currencies for API response."""
    return [
        {"code": code, "symbol": info["symbol"], "name": info["name"]}
        for code, info in SUPPORTED_CURRENCIES.items()
    ]
