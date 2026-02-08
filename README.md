# Portfolio Playground

A web application for analyzing and comparing investment portfolio performance. Build custom portfolios from real market data, visualize historical returns, and compare key risk/return metrics side by side. See [this blog post](https://jianchao-li.github.io/post/vibe-coding-portfolio-playground/) for an introduction and demo video.

![Portfolio Playground](featured.png)

## Features

- **Portfolio builder** -- Create custom portfolios by searching for ticker symbols and assigning weights. Includes autocomplete search powered by Yahoo Finance.
- **Preset portfolios** -- Quickly add common benchmarks: S&P 500 (VOO), NASDAQ 100 (QQQ), Developed Markets (VEA), Emerging Markets (VWO), Gold (GLD), Bitcoin (IBIT), and Volatility (VIXY).
- **Performance chart** -- Compare portfolios on a normalized $100-start line chart over a configurable date range.
- **Statistics table** -- Side-by-side comparison of Total Return, Annualized Return, Volatility, Sharpe Ratio, and Max Drawdown, with tooltips explaining each metric.
- **Multi-currency support** -- View results in 40 currencies (USD, EUR, GBP, JPY, CNY, and more) using real-time exchange rates.
- **Asset allocation view** -- Hover over any portfolio to see a pie chart breakdown of its holdings.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐
│     Frontend        │       │      Backend         │
│  Next.js / React    │──────▶│  Python / FastAPI     │
│  TypeScript         │  API  │  Pandas / NumPy       │
│  Recharts           │◀──────│  yfinance             │
└─────────────────────┘       └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │   Yahoo Finance API   │
                              │  Prices, FX rates,    │
                              │  T-bill rates, search │
                              └──────────────────────┘
```

**Frontend** (`frontend/`) -- Next.js 14 with TypeScript and Recharts for charting. Handles portfolio construction UI, date/currency selection, and data visualization.

**Backend** (`backend/`) -- FastAPI server that fetches market data from Yahoo Finance via `yfinance`, computes portfolio returns, and calculates financial metrics (volatility, Sharpe ratio, max drawdown). Uses historical daily T-bill rates for the risk-free rate in Sharpe ratio calculations. Includes a 5-minute TTL cache (`cachetools`) for Yahoo Finance responses, rate limiting via `slowapi`, and input validation for tickers, dates, and portfolio limits.

**Data source** -- All market data comes from Yahoo Finance: stock/ETF prices via ticker symbols, exchange rates via currency pairs (e.g., `EURUSD=X`), and the risk-free rate via `^IRX` (3-month T-bill index).

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- pnpm

### Setup

```bash
# Install frontend dependencies
pnpm install

# Set up backend virtual environment
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### Run

```bash
# Start both frontend and backend together
pnpm dev
```

Or run them separately:

```bash
# Backend (http://localhost:8000)
cd backend
./venv/bin/python -m uvicorn app.main:app --reload

# Frontend (http://localhost:3000)
cd frontend
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Deployment

The app is deployed using free tiers: frontend on **[Vercel](https://vercel.com)** and backend on **[Render](https://render.com)**. Free-tier limitations include:

- **Render cold starts** -- The backend spins down after inactivity. A GitHub Actions cron job pings the backend every 14 minutes to keep it alive.
- **512 MB memory** -- Render free tier has limited RAM, which constrains cache sizes and concurrent requests.
