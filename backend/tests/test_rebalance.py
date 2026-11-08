"""C2: periodic rebalancing to target weights (first trading day of each period, no costs)."""
import pandas as pd
import pytest

from app.models.portfolio import Portfolio
from app.services.analyzer import PortfolioAnalyzer
from tests.conftest import NEWCO_LISTING

HALF_HALF = Portfolio(name="50/50", assets=[{"symbol": "A", "weight": 0.5}, {"symbol": "B", "weight": 0.5}])


def values(prices: dict, dates: list[str], rebalance: str) -> list[float]:
    frame = pd.DataFrame(prices, index=pd.to_datetime(dates))
    out = PortfolioAnalyzer().calculate_portfolio_values(HALF_HALF, frame, rebalance)
    return [round(v, 10) for v in out]


def test_monthly_matches_hand_computation():
    dates = ["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02", "2024-03-01"]
    prices = {"A": [100, 110, 110, 121, 121], "B": [100, 100, 90, 90, 99]}
    # Buy-and-hold: 0.5 * A/100 + 0.5 * B/100
    assert values(prices, dates, "none") == [100, 105, 100, 105.5, 110]
    # Monthly, by hand (units of A and B per $1):
    #  Jan 30: 0.005 A + 0.005 B                      -> 1.00
    #  Jan 31: 0.005*110 + 0.005*100                  -> 1.05
    #  Feb 1 (rebalance at close): 0.005*110+0.005*90 -> 1.00; reset to 0.5/110 A + 0.5/90 B
    #  Feb 2: 0.5/110*121 + 0.5/90*90                 -> 1.05
    #  Mar 1 (rebalance): 0.5/110*121 + 0.5/90*99     -> 1.10
    assert values(prices, dates, "monthly") == [100, 105, 100, 105, 110]


def test_annual_matches_hand_computation():
    dates = ["2023-12-28", "2023-12-29", "2024-01-02", "2024-01-03"]
    prices = {"A": [100, 120, 120, 150], "B": [100, 100, 80, 80]}
    assert values(prices, dates, "none") == [100, 110, 100, 115]
    # Jan 2 rebalance: value 0.5*1.2 + 0.5*0.8 = 1.0 -> 0.5/120 A + 0.5/80 B;
    # Jan 3: 0.5*150/120 + 0.5*80/80 = 1.125
    assert values(prices, dates, "annually") == [100, 110, 100, 112.5]
    # No quarter/month boundary inside December, so quarterly == annually here
    assert values(prices, dates, "quarterly") == [100, 110, 100, 112.5]


def test_single_asset_is_unaffected():
    dates = pd.bdate_range("2024-01-25", periods=12)
    frame = pd.DataFrame({"A": range(100, 112)}, index=dates, dtype=float)
    p = Portfolio(name="A", assets=[{"symbol": "A", "weight": 1.0}])
    a = PortfolioAnalyzer()
    assert a.calculate_portfolio_values(p, frame, "monthly").round(10).tolist() == \
        a.calculate_portfolio_values(p, frame, "none").round(10).tolist()


def portfolio(name, *assets):
    return {"name": name, "assets": [{"symbol": s, "weight": w} for s, w in assets]}


def compare(client, portfolios, start="2023-01-01", end="2025-12-31", **extra):
    return client.post("/api/portfolio/compare", json={
        "portfolios": portfolios, "start_date": start, "end_date": end, **extra,
    })


MIX = portfolio("Mix", ("VOO", 0.6), ("QQQ", 0.4))


def test_none_is_identical_to_omitting_the_field(client):
    omitted = compare(client, [MIX]).json()
    explicit = compare(client, [MIX], rebalance="none").json()
    assert omitted == explicit
    analyze = lambda **extra: client.post("/api/portfolio/analyze", json={
        "portfolio": MIX, "start_date": "2023-01-01", "end_date": "2025-12-31", **extra}).json()
    assert analyze() == analyze(rebalance="none")


def test_rebalancing_changes_multi_asset_results(client):
    none = compare(client, [MIX]).json()["portfolios"][0]
    monthly = compare(client, [MIX], rebalance="monthly").json()["portfolios"][0]
    assert none["performance"]["dates"] == monthly["performance"]["dates"]
    assert none["performance"]["values"][0] == monthly["performance"]["values"][0] == 100
    assert none["stats"]["total_return"] != monthly["stats"]["total_return"]


def test_invalid_rebalance_is_422(client):
    assert compare(client, [MIX], rebalance="weekly").status_code == 422


def test_rebalance_with_align_start_equals_sub_range(client):
    mixed = portfolio("Mixed", ("VOO", 0.5), ("NEWCO", 0.5))
    crypto = portfolio("Crypto mix", ("BTC-USD", 0.5), ("VOO", 0.5))  # mixed calendar
    aligned = compare(client, [MIX, mixed, crypto], rebalance="quarterly", align_start=True).json()
    assert aligned["aligned_start"] == NEWCO_LISTING.isoformat()
    sub = compare(client, [MIX, mixed, crypto], rebalance="quarterly", start=NEWCO_LISTING.isoformat()).json()
    for a, s in zip(aligned["portfolios"], sub["portfolios"]):
        assert a["stats"] == s["stats"]
        assert a["performance"] == s["performance"]


def test_mixed_calendar_rebalances_on_first_row_of_its_own_calendar():
    # Crypto + stock portfolio: rows include weekends; Sat Jun 1 2024 is the first row of June
    dates = ["2024-05-30", "2024-05-31", "2024-06-01", "2024-06-02", "2024-06-03"]
    prices = {"A": [100, 100, 100, 100, 110], "B": [100, 120, 120, 120, 120]}  # A = stock (ffilled weekend)
    got = values(prices, dates, "monthly")
    # Jun 1 rebalance at value 1.10 -> 0.55/100 A + 0.55/120 B; Jun 3: 0.55*1.1 + 0.55 = 1.155
    assert got == pytest.approx([100, 110, 110, 110, 115.5])
