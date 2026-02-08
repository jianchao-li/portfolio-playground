# Portfolio Playground

A portfolio analysis tool with a Python/FastAPI backend and Next.js frontend.

## Workflow

Before making code changes, confirm the approach with the user. Do NOT jump ahead to editing files before the user explicitly approves the plan. When the user asks to 'analyze' or 'assess', provide analysis only — do not start fixing.

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, CORS config
    limiter.py           # slowapi rate limiter instance
    routers/portfolio.py # API endpoints
    models/portfolio.py  # Pydantic models
    services/
      analyzer.py        # Core calculations (returns, volatility, Sharpe, drawdown)
      currency.py        # Exchange rate fetching and conversion
  requirements.txt
  venv/

frontend/
  src/
    app/
      page.tsx           # Main page, state management, lazy loading
      layout.tsx         # Root layout
      globals.css        # Global styles + CSS variables
    components/
      PortfolioBuilder.tsx   # Portfolio creation/editing form
      StatsTable.tsx         # Statistics table with metric tooltips
      PerformanceChart.tsx   # Normalized line chart (Recharts)
      SymbolInput.tsx        # Ticker autocomplete with debounced search
      CurrencySelector.tsx   # Currency dropdown with search/filter
      PortfolioPopover.tsx   # Donut chart composition popover
      LoadingSkeletons.tsx   # Shimmer loading placeholders
    lib/
      api.ts             # API client and TypeScript interfaces
      colors.ts          # 20 portfolio colors + 8 pie chart colors
      formatting.ts      # Number/percentage formatting
      theme.ts           # Chart styling constants
    hooks/
      useClickOutside.ts # Click-outside detection hook

package.json             # Root workspace (concurrently, pnpm scripts)
pnpm-workspace.yaml      # pnpm workspace config
```

## Running the Project

```bash
# Both (from root)
pnpm dev

# Backend only
cd backend
./venv/bin/python -m uvicorn app.main:app --reload

# Frontend only
cd frontend
npm run dev
```

## Key Technical Details

### Data Sources
- All market data from **Yahoo Finance** via `yfinance` library
- Stock/ETF prices: ticker symbols (e.g., VOO, AAPL)
- Risk-free rate: `^IRX` (3-month T-bill index)
- Exchange rates: Currency pairs (e.g., `EURUSD=X`, `GBPUSD=X`)

### Supported Currencies
- 40 currencies defined in `currency.py` `SUPPORTED_CURRENCIES` dict

### Calculations (analyzer.py)

| Metric | Formula | Notes |
|--------|---------|-------|
| Total Return | `(end/start) - 1` | Simple return |
| Annualized Return | `(1 + r)^(252/days) - 1` | Geometric annualization |
| Volatility | `daily_returns.std(ddof=1) * sqrt(252)` | Sample std, annualized |
| Sharpe Ratio | `(excess_mean / excess_std) * sqrt(252)` | Uses historical daily T-bill rates |
| Max Drawdown | `min((value - cummax) / cummax)` | Peak-to-trough, negative value |

### Constants
- `TRADING_DAYS_PER_YEAR = 252`
- Date buffer: 5 days before start_date (for weekends/holidays)
- Fallback risk-free rate: 5% annual (if T-bill fetch fails, disclosed in tooltip)

### Caching
- `cachetools.TTLCache` (5-min TTL) on `fetch_prices`, `fetch_risk_free_rates`, and `fetch_exchange_rates`
- Thread-safe via `threading.Lock` (FastAPI runs sync endpoints in a thread pool)
- Eliminates redundant `yf.download` calls when toggling presets or re-analyzing

### Currency Conversion
- Conversion applied AFTER portfolio normalization
- Inverted quotes for EUR/GBP/AUD/NZD (they quote as XXX/USD)
- Multiply portfolio values by exchange rate

### Compare Endpoint Optimization
- Risk-free rates fetched once and reused across all portfolios
- Exchange rates fetched once if non-USD currency
- All unique symbols across all portfolios fetched in a single `yf.download` call
- Batch mode skips cross-column `dropna` so each portfolio applies it on its own subset (prevents newer tickers from trimming dates for older ones)

### Rate Limiting
- `slowapi` rate limiter on API endpoints
- Limiter instance in `app/limiter.py`, middleware in `app/main.py`
- Compare endpoint limited to 20 portfolios and 50 total assets

### API Endpoints
- `POST /api/portfolio/analyze` - Single portfolio analysis
- `POST /api/portfolio/compare` - Compare multiple portfolios
- `GET /api/portfolio/currencies` - List supported currencies
- `GET /api/portfolio/symbols/search?q=` - Search ticker symbols

## Recent Changes

- **5ba0725**: Update README: add screenshot, link to blog post, remove video tag
- **dcb9a75**: Update About link to blog post URL
- **a60fb71**: Add all-rights-reserved license
- **b410b4c**: Add TTL cache for Yahoo Finance API calls
- **f3bf91a**: Cancel in-flight requests on rapid date/currency changes
- **e5d0e9e**: Disclose Sharpe ratio 5% fallback rate in tooltip
- **533575e**: Limit compare endpoint to 20 portfolios and 50 total assets
- **df3f037**: Add rate limiting to API endpoints using slowapi
- **b885989**: Validate invalid tickers and improve form error messages
- **36ae934**: Add date input validation to prevent opaque 500 errors
- **f3c5ed0**: Fix blocking I/O in async FastAPI endpoints
- **2296bce**: Add 18 more currencies for broader global coverage (total: 40)

## Known Limitations

1. **Silent fallback**: If T-bill API fails, Sharpe ratio uses 5% constant rate (disclosed in tooltip)
2. **5-day buffer**: May be insufficient for long holiday weekends
3. **yfinance end-date semantics**: `yf.download(end=...)` is exclusive, so data on the exact `end_date` may be missing

## UI Implementation

When implementing UI changes, always verify HTML validity (no invalid nesting like `<p>` inside `<p>`) and check z-index/stacking context before presenting the result. Test that hover interactions (tooltips, popovers) work without gap bugs.

## Content & Copy

When writing tooltip or UI text, start concise. Do NOT write verbose explanations — keep tooltip text to one short sentence max. If the user asks to simplify, go minimal rather than finding a middle ground.

## Code Style

When modifying existing working code, prefer minimal changes. Do not add unnecessary props, wrappers, or complexity. If something already works, don't refactor it as part of a feature addition.

## Debugging

After implementing a feature, always verify the backend server is running before debugging frontend issues. Check that all dependencies are installed and stale references are cleaned up.

## Hugo / Blog

For Hugo sites: use theme-specific front matter conventions (e.g., `image` vs `thumbnail` vs `cover`). Always check the theme's documentation or existing posts for the correct parameter names. Watch for future-dated posts not appearing.

## Testing

No pytest in venv. Verify syntax with:
```bash
./venv/bin/python -m py_compile app/services/analyzer.py
./venv/bin/python -m py_compile app/services/currency.py
./venv/bin/python -c "from app.services.analyzer import PortfolioAnalyzer; print('OK')"
```
