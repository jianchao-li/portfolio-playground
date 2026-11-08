"""Trading currency of each symbol, from Yahoo quote metadata (cached).

Prices are used as if they were USD, so the frontend flags assets that trade
in another currency ("JPY, not converted") until real conversion lands.

The currency comes from Yahoo's batched spark endpoint (one request for all
uncached symbols, no per-symbol .info call) and is cached for a day. If that
request fails, it falls back to the exchange suffix (7203.T -> JPY).
"""
import logging
import threading

import httpx
from cachetools import TTLCache

SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark"
SPARK_BATCH = 20  # symbols per request
SPARK_TIMEOUT_SECONDS = 3.0
CURRENCY_TTL_SECONDS = 24 * 60 * 60

_currency_cache: TTLCache = TTLCache(maxsize=2048, ttl=CURRENCY_TTL_SECONDS)
_currency_lock = threading.Lock()

# Yahoo exchange suffix -> trading currency (Yahoo's own codes: GBp and ZAc
# are pence and cents, ILA is agorot)
SUFFIX_CURRENCIES = {
    "T": "JPY", "L": "GBp", "HK": "HKD", "TO": "CAD", "V": "CAD", "NE": "CAD",
    "AX": "AUD", "NZ": "NZD", "SW": "CHF", "DE": "EUR", "F": "EUR", "PA": "EUR", "AS": "EUR",
    "MI": "EUR", "MC": "EUR", "BR": "EUR", "LS": "EUR", "VI": "EUR", "HE": "EUR", "IR": "EUR",
    "ST": "SEK", "OL": "NOK", "CO": "DKK", "IC": "ISK", "WA": "PLN", "PR": "CZK", "BD": "HUF",
    "IS": "TRY", "KS": "KRW", "KQ": "KRW", "TW": "TWD", "TWO": "TWD", "SS": "CNY", "SZ": "CNY",
    "NS": "INR", "BO": "INR", "SI": "SGD", "KL": "MYR", "BK": "THB", "JK": "IDR", "SA": "BRL",
    "MX": "MXN", "SN": "CLP", "TA": "ILA", "JO": "ZAc", "SR": "SAR", "CA": "EGP",
}


def currency_from_symbol(symbol: str) -> str | None:
    """Best guess from the symbol alone; None when it can't be told (e.g. indices)."""
    if symbol.startswith("^"):
        return None
    if symbol.endswith("=X"):
        # USDJPY=X style pairs are quoted in their second currency; JPY=X in JPY
        pair = symbol[:-2]
        return pair[-3:] if len(pair) in (3, 6) else None
    if "-" in symbol and symbol.rsplit("-", 1)[1] in ("USD", "EUR", "GBP", "JPY"):
        return symbol.rsplit("-", 1)[1]  # crypto pairs such as BTC-USD
    if "." in symbol:
        return SUFFIX_CURRENCIES.get(symbol.rsplit(".", 1)[1])
    return "USD"


def fetch_spark_currencies(symbols: list[str]) -> dict[str, str]:
    """Currency per symbol from Yahoo's batched spark endpoint (network)."""
    found: dict[str, str] = {}
    with httpx.Client(timeout=SPARK_TIMEOUT_SECONDS, headers={"User-Agent": "Mozilla/5.0"}) as client:
        for i in range(0, len(symbols), SPARK_BATCH):
            batch = symbols[i:i + SPARK_BATCH]
            response = client.get(SPARK_URL, params={
                "symbols": ",".join(batch), "range": "1d", "interval": "1d",
            })
            response.raise_for_status()
            for item in (response.json().get("spark") or {}).get("result") or []:
                for entry in item.get("response") or []:
                    currency = (entry.get("meta") or {}).get("currency")
                    if item.get("symbol") and currency:
                        found[item["symbol"]] = currency
    return found


def get_currencies(symbols: list[str]) -> dict[str, str | None]:
    """Trading currency per symbol: cached Yahoo metadata, else the suffix guess."""
    with _currency_lock:
        result = {s: _currency_cache[s] for s in symbols if s in _currency_cache}
    missing = [s for s in symbols if s not in result]
    if missing:
        try:
            fetched = fetch_spark_currencies(missing)
        except Exception as e:  # metadata is best-effort; never fail the request
            logging.warning("Currency metadata lookup failed: %s", e)
            fetched = {}
        with _currency_lock:
            for s in missing:
                if s in fetched:
                    _currency_cache[s] = fetched[s]
                    result[s] = fetched[s]
                else:
                    # Not cached, so a later request can still get Yahoo's answer
                    result[s] = currency_from_symbol(s)
    return result
