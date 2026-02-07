import logging

from fastapi import APIRouter, HTTPException

from app.models.portfolio import (
    AnalysisRequest,
    AnalysisResponse,
    ComparisonRequest,
    PortfolioStats,
    PerformanceData,
)
from app.services.analyzer import PortfolioAnalyzer
from app.services.currency import get_currency_list

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/currencies")
async def get_currencies():
    """Return list of supported currencies."""
    return get_currency_list()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_portfolio(request: AnalysisRequest):
    """Analyze a single portfolio and return stats + performance data."""
    if not request.portfolio.validate_weights():
        raise HTTPException(status_code=400, detail="Portfolio weights must sum to 1.0")

    try:
        analyzer = PortfolioAnalyzer(risk_free_rate=request.risk_free_rate)
        stats, performance = analyzer.analyze(
            portfolio=request.portfolio,
            start_date=request.start_date,
            end_date=request.end_date,
            currency=request.currency
        )
        return AnalysisResponse(stats=stats, performance=performance, currency=request.currency)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
async def compare_portfolios(request: ComparisonRequest):
    """Compare multiple portfolios."""
    for portfolio in request.portfolios:
        if not portfolio.validate_weights():
            raise HTTPException(
                status_code=400,
                detail=f"Portfolio '{portfolio.name}' weights must sum to 1.0"
            )

    try:
        analyzer = PortfolioAnalyzer(risk_free_rate=request.risk_free_rate)
        results = []

        for portfolio in request.portfolios:
            stats, performance = analyzer.analyze(
                portfolio=portfolio,
                start_date=request.start_date,
                end_date=request.end_date,
                currency=request.currency
            )
            results.append({
                "stats": stats,
                "performance": performance,
                "currency": request.currency
            })

        return {"portfolios": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/search")
async def search_symbols(q: str):
    """Search for ticker symbols using Yahoo Finance search API."""
    import httpx

    if not q or len(q) < 1:
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

        quotes = data.get("quotes", [])
        results = []
        for quote in quotes[:10]:
            results.append({
                "symbol": quote.get("symbol"),
                "name": quote.get("shortname") or quote.get("longname"),
                "type": quote.get("quoteType"),
                "exchange": quote.get("exchange"),
            })

        return results
    except httpx.TimeoutException:
        logging.error(f"Symbol search timeout for query: {q}")
        raise HTTPException(status_code=504, detail="Symbol search timed out")
    except httpx.HTTPStatusError as e:
        logging.error(f"Symbol search HTTP error for query {q}: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Symbol search service unavailable")
    except Exception as e:
        logging.error(f"Symbol search error for query {q}: {str(e)}")
        raise HTTPException(status_code=500, detail="Symbol search failed")
