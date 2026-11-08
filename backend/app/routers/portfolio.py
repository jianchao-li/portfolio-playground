import logging

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.limiter import INTERACTIVE_LIMIT, PREFETCH_LIMIT, limiter
from app.models.portfolio import (
    AnalysisRequest,
    AnalysisResponse,
    AssetInfo,
    ComparisonRequest,
    ComparisonResponse,
    Portfolio,
    PortfolioStats,
    PerformanceData,
)
from app.services.analyzer import AnalysisResult, PortfolioAnalyzer
from app.services.asset_info import get_currencies as get_asset_currencies
from app.services.currency import get_currency_list

INTERNAL_ERROR_DETAIL = "Internal server error while analyzing portfolios. Please try again later."

def _response(portfolio: Portfolio, result: AnalysisResult, currency: str,
              asset_currencies: dict[str, str | None]) -> AnalysisResponse:
    return AnalysisResponse(
        stats=result.stats,
        performance=result.performance,
        currency=currency,
        assets=[AssetInfo(symbol=a.symbol, weight=a.weight, currency=asset_currencies.get(a.symbol))
                for a in portfolio.assets],
        data_start=result.data_start,
        data_end=result.data_end,
    )


router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/currencies")
def get_currencies():
    """Return list of supported currencies."""
    return get_currency_list()


@router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit(INTERACTIVE_LIMIT)
def analyze_portfolio(request: Request, body: AnalysisRequest):
    """Analyze a single portfolio and return stats + performance data."""
    if not body.portfolio.validate_weights():
        raise HTTPException(status_code=400, detail="Portfolio weights must sum to 1.0")

    try:
        analyzer = PortfolioAnalyzer()
        result = analyzer.analyze(
            portfolio=body.portfolio,
            start_date=body.start_date,
            end_date=body.end_date,
            currency=body.currency,
            rebalance=body.rebalance,
        )
        asset_currencies = get_asset_currencies([a.symbol for a in body.portfolio.assets])
        return _response(body.portfolio, result, body.currency, asset_currencies)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logging.exception("Portfolio analysis failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@router.post("/compare", response_model=ComparisonResponse)
@limiter.limit(INTERACTIVE_LIMIT)
def compare_portfolios(request: Request, body: ComparisonRequest):
    """Compare multiple portfolios."""
    return _compare(body)


@router.post("/prefetch", response_model=ComparisonResponse)
@limiter.limit(PREFETCH_LIMIT)
def prefetch_portfolios(request: Request, body: ComparisonRequest):
    """Same as /compare, for the frontend's background preset prefetch.

    A separate endpoint with its own (smaller) rate-limit budget, so
    background prefetches never use up a visitor's /compare budget, and
    abusing one endpoint can't drain the other.
    """
    return _compare(body)


def _compare(body: ComparisonRequest) -> ComparisonResponse:
    for portfolio in body.portfolios:
        if not portfolio.validate_weights():
            raise HTTPException(
                status_code=400,
                detail=f"Portfolio '{portfolio.name}' weights must sum to 1.0"
            )

    try:
        analyzer = PortfolioAnalyzer()

        all_symbols = list({
            asset.symbol
            for portfolio in body.portfolios
            for asset in portfolio.assets
        })
        # Fetch prices first: it also downloads and caches the risk-free rate
        all_prices = analyzer.fetch_prices(all_symbols, body.start_date, body.end_date)
        rf_rates = analyzer.fetch_risk_free_rates(body.start_date, body.end_date)

        exchange_rates = None
        if body.currency != "USD":
            exchange_rates = analyzer.currency_service.fetch_exchange_rates(
                body.currency, body.start_date, body.end_date
            )

        # Clip everyone to the latest common start, only if starts differ
        aligned_start = (
            analyzer.common_start(body.portfolios, all_prices, body.start_date, body.end_date)
            if body.align_start else None
        )

        asset_currencies = get_asset_currencies(all_symbols)
        results = []
        for portfolio in body.portfolios:
            result = analyzer.analyze(
                portfolio=portfolio,
                start_date=body.start_date,
                end_date=body.end_date,
                currency=body.currency,
                rf_rates=rf_rates,
                exchange_rates=exchange_rates,
                all_prices=all_prices,
                align_start=aligned_start,
                rebalance=body.rebalance,
            )
            results.append(_response(portfolio, result, body.currency, asset_currencies))

        return ComparisonResponse(portfolios=results, aligned_start=aligned_start)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logging.exception("Portfolio analysis failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@router.get("/symbols/search")
@limiter.limit("30/minute")
async def search_symbols(request: Request, q: str):
    """Search for ticker symbols using Yahoo Finance search API."""
    if not q:
        return []

    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {
            "q": q,
            "quotesCount": 10,
            "newsCount": 0,
            "listsCount": 0,
            "enableFuzzyQuery": False,
        }
        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

        return [
            {
                "symbol": quote.get("symbol"),
                "name": quote.get("shortname") or quote.get("longname"),
                "type": quote.get("quoteType"),
                "exchange": quote.get("exchange"),
            }
            for quote in data.get("quotes", [])[:10]
        ]
    except httpx.TimeoutException:
        logging.error(f"Symbol search timeout for query: {q}")
        raise HTTPException(status_code=504, detail="Symbol search timed out")
    except httpx.HTTPStatusError as e:
        logging.error(f"Symbol search HTTP error for query {q}: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Symbol search service unavailable")
    except Exception as e:
        logging.error(f"Symbol search error for query {q}: {str(e)}")
        raise HTTPException(status_code=500, detail="Symbol search failed")
