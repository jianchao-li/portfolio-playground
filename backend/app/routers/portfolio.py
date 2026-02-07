from fastapi import APIRouter, HTTPException

from app.models.portfolio import (
    AnalysisRequest,
    AnalysisResponse,
    ComparisonRequest,
    PortfolioStats,
    PerformanceData,
)
from app.services.analyzer import PortfolioAnalyzer

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


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
            end_date=request.end_date
        )
        return AnalysisResponse(stats=stats, performance=performance)
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
                end_date=request.end_date
            )
            results.append({
                "stats": stats,
                "performance": performance
            })

        return {"portfolios": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/search")
async def search_symbols(query: str):
    """Search for ticker symbols."""
    import yfinance as yf

    try:
        ticker = yf.Ticker(query.upper())
        info = ticker.info

        if info and info.get('symbol'):
            return {
                "symbol": info.get('symbol'),
                "name": info.get('longName') or info.get('shortName'),
                "type": info.get('quoteType'),
                "exchange": info.get('exchange')
            }
        return {"error": "Symbol not found"}
    except Exception:
        return {"error": "Symbol not found"}
