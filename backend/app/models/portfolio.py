from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date

CurrencyCode = Literal["USD", "EUR", "GBP", "CNY", "JPY", "CHF", "CAD", "AUD", "SGD"]


class Asset(BaseModel):
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL', 'SPY')")
    weight: float = Field(..., ge=0, le=1, description="Weight in portfolio (0-1)")


class Portfolio(BaseModel):
    name: str = Field(..., description="Portfolio name")
    assets: list[Asset] = Field(..., min_length=1, description="List of assets with weights")

    def validate_weights(self) -> bool:
        total = sum(asset.weight for asset in self.assets)
        return abs(total - 1.0) < 0.01  # Allow small floating point errors


class AnalysisRequest(BaseModel):
    portfolio: Portfolio
    start_date: date
    end_date: date
    currency: CurrencyCode = Field(default="USD", description="Currency for portfolio values")


class ComparisonRequest(BaseModel):
    portfolios: list[Portfolio] = Field(..., min_length=2, description="Portfolios to compare")
    start_date: date
    end_date: date
    currency: CurrencyCode = Field(default="USD", description="Currency for portfolio values")


class PortfolioStats(BaseModel):
    name: str
    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float


class PerformanceData(BaseModel):
    dates: list[str]
    values: list[float]  # Normalized to 100 at start


class AnalysisResponse(BaseModel):
    stats: PortfolioStats
    performance: PerformanceData
    currency: str = "USD"
