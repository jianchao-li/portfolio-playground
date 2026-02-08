from pydantic import BaseModel, Field, AfterValidator, model_validator
from typing import Annotated, Self
from datetime import date, timedelta

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
        return abs(total - 1.0) < 1e-9  # Allow small floating point errors


MAX_DATE_RANGE_YEARS = 25


def _validate_date_range(start_date: date, end_date: date) -> None:
    if start_date >= end_date:
        raise ValueError("Start date must be before end date")
    if start_date > date.today():
        raise ValueError("Start date cannot be in the future")
    if end_date > date.today():
        raise ValueError("End date cannot be in the future")
    if (end_date - start_date) > timedelta(days=MAX_DATE_RANGE_YEARS * 365):
        raise ValueError("Date range cannot exceed 25 years")


class AnalysisRequest(BaseModel):
    portfolio: Portfolio
    start_date: date
    end_date: date
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")

    @model_validator(mode='after')
    def validate_dates(self) -> Self:
        _validate_date_range(self.start_date, self.end_date)
        return self


class ComparisonRequest(BaseModel):
    portfolios: list[Portfolio] = Field(..., min_length=1, max_length=20, description="Portfolios to compare")
    start_date: date
    end_date: date
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")

    @model_validator(mode='after')
    def validate_dates_and_assets(self) -> Self:
        _validate_date_range(self.start_date, self.end_date)
        total_assets = sum(len(p.assets) for p in self.portfolios)
        if total_assets > 50:
            raise ValueError(f"Total assets across all portfolios cannot exceed 50 (got {total_assets})")
        return self


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
