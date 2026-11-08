from pydantic import BaseModel, Field, AfterValidator, field_validator, model_validator
from typing import Annotated, Literal, Self
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

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("Symbol cannot be empty")
        return v


class Portfolio(BaseModel):
    name: str = Field(..., description="Portfolio name")
    assets: list[Asset] = Field(..., min_length=1, description="List of assets with weights")

    @model_validator(mode="after")
    def merge_duplicate_symbols(self) -> Self:
        """Merge repeated symbols (e.g. 'voo' and 'VOO ') by summing their weights."""
        merged: dict[str, float] = {}
        for asset in self.assets:
            merged[asset.symbol] = merged.get(asset.symbol, 0.0) + asset.weight
        if len(merged) != len(self.assets):
            self.assets = [Asset.model_construct(symbol=s, weight=w) for s, w in merged.items()]
        return self

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


Rebalance = Literal["none", "monthly", "quarterly", "annually"]
REBALANCE_DESCRIPTION = (
    "Reset to target weights on the first trading day of each period (no costs); 'none' = buy-and-hold"
)


class AnalysisRequest(BaseModel):
    portfolio: Portfolio
    start_date: date
    end_date: date
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")
    rebalance: Rebalance = Field(default="none", description=REBALANCE_DESCRIPTION)

    @model_validator(mode='after')
    def validate_dates(self) -> Self:
        _validate_date_range(self.start_date, self.end_date)
        return self


class ComparisonRequest(BaseModel):
    portfolios: list[Portfolio] = Field(..., min_length=1, max_length=20, description="Portfolios to compare")
    start_date: date
    end_date: date
    currency: SupportedCurrency = Field(default="USD", description="Currency for portfolio values")
    rebalance: Rebalance = Field(default="none", description=REBALANCE_DESCRIPTION)
    align_start: bool = Field(
        default=False,
        description="Clip every portfolio to the latest common start date (when their data starts differ)",
    )

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
    annualized_return: float | None  # None when the data spans less than ~1 year
    volatility: float | None  # None when undefined (single return)
    sharpe_ratio: float | None  # None when undefined (zero variance)
    sortino_ratio: float | None  # None when undefined (no returns below the risk-free rate)
    max_drawdown: float


class PerformanceData(BaseModel):
    dates: list[str]
    values: list[float]  # Normalized to 100 at start


class AssetInfo(BaseModel):
    symbol: str
    weight: float
    # Trading currency reported by Yahoo (e.g. "USD", "JPY", "GBp" = pence);
    # None if unknown. Prices are not converted from it yet.
    currency: str | None


class AnalysisResponse(BaseModel):
    stats: PortfolioStats
    performance: PerformanceData
    currency: str = "USD"
    assets: list[AssetInfo]
    # First/last date with data in the requested range, before any alignment
    data_start: date
    data_end: date


class ComparisonResponse(BaseModel):
    portfolios: list[AnalysisResponse]
    # Common start date every portfolio was clipped to, or None if not aligned
    # (align_start off, or all portfolios already start on the same date)
    aligned_start: date | None = None
