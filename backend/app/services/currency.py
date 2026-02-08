import yfinance as yf
import pandas as pd
from datetime import date, timedelta
import threading
from cachetools import TTLCache

_fx_cache = TTLCache(maxsize=16, ttl=300)
_fx_lock = threading.Lock()

SUPPORTED_CURRENCIES = {
    "AED": {"name": "UAE Dirham", "flag": "\U0001f1e6\U0001f1ea", "ticker": "AED=X"},
    "AUD": {"name": "Australian Dollar", "flag": "\U0001f1e6\U0001f1fa", "ticker": "AUDUSD=X"},
    "BRL": {"name": "Brazilian Real", "flag": "\U0001f1e7\U0001f1f7", "ticker": "BRL=X"},
    "CAD": {"name": "Canadian Dollar", "flag": "\U0001f1e8\U0001f1e6", "ticker": "CAD=X"},
    "CHF": {"name": "Swiss Franc", "flag": "\U0001f1e8\U0001f1ed", "ticker": "CHF=X"},
    "CLP": {"name": "Chilean Peso", "flag": "\U0001f1e8\U0001f1f1", "ticker": "CLP=X"},
    "CNY": {"name": "Chinese Yuan", "flag": "\U0001f1e8\U0001f1f3", "ticker": "CNY=X"},
    "COP": {"name": "Colombian Peso", "flag": "\U0001f1e8\U0001f1f4", "ticker": "COP=X"},
    "CZK": {"name": "Czech Koruna", "flag": "\U0001f1e8\U0001f1ff", "ticker": "CZK=X"},
    "DKK": {"name": "Danish Krone", "flag": "\U0001f1e9\U0001f1f0", "ticker": "DKK=X"},
    "EGP": {"name": "Egyptian Pound", "flag": "\U0001f1ea\U0001f1ec", "ticker": "EGP=X"},
    "EUR": {"name": "Euro", "flag": "\U0001f1ea\U0001f1fa", "ticker": "EURUSD=X"},
    "GBP": {"name": "British Pound", "flag": "\U0001f1ec\U0001f1e7", "ticker": "GBPUSD=X"},
    "HKD": {"name": "Hong Kong Dollar", "flag": "\U0001f1ed\U0001f1f0", "ticker": "HKD=X"},
    "HUF": {"name": "Hungarian Forint", "flag": "\U0001f1ed\U0001f1fa", "ticker": "HUF=X"},
    "IDR": {"name": "Indonesian Rupiah", "flag": "\U0001f1ee\U0001f1e9", "ticker": "IDR=X"},
    "ILS": {"name": "Israeli New Shekel", "flag": "\U0001f1ee\U0001f1f1", "ticker": "ILS=X"},
    "INR": {"name": "Indian Rupee", "flag": "\U0001f1ee\U0001f1f3", "ticker": "INR=X"},
    "ISK": {"name": "Icelandic Krona", "flag": "\U0001f1ee\U0001f1f8", "ticker": "ISK=X"},
    "JPY": {"name": "Japanese Yen", "flag": "\U0001f1ef\U0001f1f5", "ticker": "JPY=X"},
    "KES": {"name": "Kenyan Shilling", "flag": "\U0001f1f0\U0001f1ea", "ticker": "KES=X"},
    "KRW": {"name": "South Korean Won", "flag": "\U0001f1f0\U0001f1f7", "ticker": "KRW=X"},
    "LKR": {"name": "Sri Lankan Rupee", "flag": "\U0001f1f1\U0001f1f0", "ticker": "LKR=X"},
    "MXN": {"name": "Mexican Peso", "flag": "\U0001f1f2\U0001f1fd", "ticker": "MXN=X"},
    "MYR": {"name": "Malaysian Ringgit", "flag": "\U0001f1f2\U0001f1fe", "ticker": "MYR=X"},
    "NOK": {"name": "Norwegian Krone", "flag": "\U0001f1f3\U0001f1f4", "ticker": "NOK=X"},
    "NZD": {"name": "New Zealand Dollar", "flag": "\U0001f1f3\U0001f1ff", "ticker": "NZDUSD=X"},
    "PEN": {"name": "Peruvian Sol", "flag": "\U0001f1f5\U0001f1ea", "ticker": "PEN=X"},
    "PHP": {"name": "Philippine Peso", "flag": "\U0001f1f5\U0001f1ed", "ticker": "PHP=X"},
    "PKR": {"name": "Pakistani Rupee", "flag": "\U0001f1f5\U0001f1f0", "ticker": "PKR=X"},
    "PLN": {"name": "Polish Zloty", "flag": "\U0001f1f5\U0001f1f1", "ticker": "PLN=X"},
    "RON": {"name": "Romanian Leu", "flag": "\U0001f1f7\U0001f1f4", "ticker": "RON=X"},
    "SAR": {"name": "Saudi Riyal", "flag": "\U0001f1f8\U0001f1e6", "ticker": "SAR=X"},
    "SEK": {"name": "Swedish Krona", "flag": "\U0001f1f8\U0001f1ea", "ticker": "SEK=X"},
    "SGD": {"name": "Singapore Dollar", "flag": "\U0001f1f8\U0001f1ec", "ticker": "SGD=X"},
    "THB": {"name": "Thai Baht", "flag": "\U0001f1f9\U0001f1ed", "ticker": "THB=X"},
    "TRY": {"name": "Turkish Lira", "flag": "\U0001f1f9\U0001f1f7", "ticker": "TRY=X"},
    "TWD": {"name": "New Taiwan Dollar", "flag": "\U0001f1f9\U0001f1fc", "ticker": "TWD=X"},
    "USD": {"name": "US Dollar", "flag": "\U0001f1fa\U0001f1f8", "ticker": None},
    "ZAR": {"name": "South African Rand", "flag": "\U0001f1ff\U0001f1e6", "ticker": "ZAR=X"},
}

# Currencies where the quote is XXX/USD (value is how many USD per 1 unit of currency)
# For these, we need to invert: 1 EUR = X USD means 1 USD = 1/X EUR
INVERTED_QUOTES = {"EUR", "GBP", "AUD", "NZD"}


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


class CurrencyService:
    """Service for fetching and applying currency exchange rates."""

    def fetch_exchange_rates(
        self, currency: str, start_date: date, end_date: date
    ) -> pd.Series | None:
        """
        Fetch exchange rates for converting USD to target currency.
        Returns a Series indexed by date with conversion multipliers.
        """
        key = (currency, start_date, end_date)
        with _fx_lock:
            if key in _fx_cache:
                return _fx_cache[key]

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

        # Extract close prices using shared helper
        rates = extract_close_prices(data, error_context=currency)
        # Flatten to Series if single-ticker DataFrame
        if isinstance(rates, pd.DataFrame):
            rates = rates.iloc[:, 0]

        # Forward fill missing data
        rates = rates.ffill().dropna()
        rates = rates[rates.index >= pd.Timestamp(start_date)]
        rates = rates[rates.index <= pd.Timestamp(end_date)]

        if rates.empty:
            raise ValueError(f"No exchange rate data available for {currency} in the specified date range")

        # Convert to proper multiplier
        # For EUR/GBP/AUD/NZD: quote is XXX/USD, so we need to invert to get USD/XXX
        # For JPY/CHF/CAD etc.: quote is already USD/XXX
        if currency in INVERTED_QUOTES:
            rates = 1 / rates

        with _fx_lock:
            _fx_cache[key] = rates
        return rates


def get_currency_list() -> list[dict]:
    """Return list of supported currencies for API response."""
    return [
        {"code": code, "name": info["name"], "flag": info["flag"]}
        for code, info in SUPPORTED_CURRENCIES.items()
    ]
