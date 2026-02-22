# Version History

## 2026-02-22

### New Features
- **AI Portfolio Analysis**: Added client-side AI portfolio analysis using WebLLM
- **Multi-Portfolio AI Comparison**: Enhanced AI analysis with larger model and multi-portfolio comparison support
- **Simplified AI Workflow**: Streamlined AI analysis to single-click workflow
- **QuantStats Integration**: Refactored portfolio metrics to use QuantStats library

### Improvements
- Show compared portfolios in AI analysis result
- Update blog post link to project page URL

### Bug Fixes
- Fix tooltip text wrapping in Portfolio Statistics table

---

## 2026-02-20

### Improvements
- Add architecture diagram and update README documentation
- Clean up dead code, fix undefined CSS variable, and improve accessibility

---

## 2026-02-12

### Improvements
- Update featured.png screenshot
- Update site URLs from jianchao-li.github.io to jianchao.xyz

---

## 2026-02-11

### Improvements
- Replace inline first-load message with full-page loading overlay

---

## 2026-02-10

### New Features
- **Vibrant Gradient Accents**: Add vibrant gradient accents throughout the page

---

## 2026-02-09

### Improvements
- Widen custom portfolio modal and ticker column to fix symbol overlap
- Update About link to projects page
- Add star emoji to About link and remove "live" from loading message

### Bug Fixes
- Fix Portfolio Statistics table being cut off by equalizing chart/table flex ratio

---

## 2026-02-08

### New Features
- **Global Currency Support**: Added 40 currencies for broader global coverage
- **Dynamic Currency List**: Backend is now single source of truth for currencies
- **Inline Sparklines**: Added inline sparklines in stats table
- **Rate Limiting**: Added rate limiting to API endpoints using slowapi
- **Request Caching**: Added TTL cache for Yahoo Finance API calls
- **Keep-Alive Cron**: Added GitHub Actions cron to keep Render free tier alive

### Improvements
- Make currency list dynamic with backend as single source of truth
- Highlight chart curve on stats table row hover
- Show performance chart and stats table side by side
- Add subtle hover effect to stats table rows
- Batch stock price fetch in compare endpoint
- Pre-fetch risk-free rates and exchange rates in compare endpoint
- Make CORS origins configurable via ALLOWED_ORIGINS env var
- Improve portfolio builder UX: contextual weight errors, name reuse, and layout fixes
- Make custom portfolio name clickable to edit, red-on-hover delete button
- Group custom and preset chips with divider
- Rename custom button to "+ Custom Portfolio" and add "Presets:" label
- Show donut chart popover on hover for inactive preset chips
- Only load S&P 500, Developed and Emerging Markets by default
- Sort supported currencies alphabetically
- Add About and Source Code links
- Responsive stats table: abbreviated headers, right-aligned, tighter padding
- Disclose Sharpe ratio 5% fallback rate in tooltip
- Add buy-and-hold disclaimer to chart info tooltip
- Add disclaimers section
- Update README for deployment and cron documentation

### Bug Fixes
- Fix currency dropdown and Max Drawdown tooltip overflowing right edge
- Fix chart date alignment for portfolios with different date ranges
- Skip cross-column dropna in batch mode so newer tickers don't trim dates
- Fix S&P 500 ticker (VTI → VOO)
- Fix single-slice pie chart gap
- Fix ticker validation to catch symbols missing from yfinance results
- Validate invalid tickers and improve form error messages
- Add date input validation to prevent opaque 500 errors
- Fix blocking I/O in async FastAPI endpoints
- Fix chip sections layout: wrap presets to own row
- Tighten weight validation tolerance from 1% to 1e-9
- Handle network errors and non-JSON responses in fetchFromAPI
- Limit compare endpoint to 20 portfolios and 50 total assets
- Cancel in-flight requests on rapid date/currency changes

### Security
- Added rate limiting (20/min for analyze and compare endpoints)
- Added portfolio/asset count limits to prevent abuse

---

## 2026-02-07

### Initial Release

#### Core Features
- **FastAPI Backend + Next.js Frontend**: Initial scaffold with modern stack
- **Portfolio Analysis**: Analyze custom portfolios with multiple assets
- **Portfolio Comparison**: Compare multiple portfolios side-by-side
- **Preset Portfolios**: Diverse global preset portfolios including S&P 500, Developed Markets, Emerging Markets, Gold, Bitcoin, Volatility
- **Custom Portfolio Builder**: Create custom portfolios with symbol autocomplete
- **Multi-Currency Support**: Currency selector for multi-currency portfolio analysis
- **Real Risk-Free Rate**: Use historical daily T-bill rates for Sharpe ratio calculation

#### UI/UX Features
- **Interactive Chart**: Performance chart with date refresh, X-axis formatting, and tooltip styling
- **Chart-Table Correlation**: Bidirectional hover highlighting between chart and stats table
- **Portfolio Chips**: Color-coded portfolio chips matching chart curves
- **Info Tooltips**: Explanatory tooltips for portfolio statistics definitions
- **Loading States**: Lazy loading, skeletons, and loading overlay
- **Custom Currency Dropdown**: Redesigned with flags and search
- **Sticky Chart**: Chart container sticky for table hover interaction visibility
- **Symbol Autocomplete**: With error handling and light mint theme

#### Technical Improvements
- Use sample standard deviation (ddof=1) for volatility and Sharpe ratio
- Apply currency conversion after normalization for combined returns
- Batch API calls for better performance
- Refactor frontend to reduce duplication and improve maintainability
