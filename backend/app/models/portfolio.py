from pydantic import BaseModel, Field, AfterValidator
from typing import Annotated
from datetime import date

from app.services.currency import SUPPORTED_CURRENCIES


def _validate_supported_currency(v: str) -> str:
    if v not in SUPPORTED_CURRENCIES:
        raise ValueError(f"Unsupported currency: {v}")
    return v


SupportedCurrency = Annotated[str, AfterValidator(_validate_supported_currency)]


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
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")


class ComparisonRequest(BaseModel):
    portfolios: list[Portfolio] = Field(..., min_length=1, description="Portfolios to compare")
    start_date: date
    end_date: date
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")


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
