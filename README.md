# Portfolio Playground

A web application to build, analyze, and compare investment portfolios.

## Features

- Configure portfolios with stocks, bonds, and ETFs
- View historical performance charts
- Compare multiple portfolios side-by-side
- Key statistics: Sharpe ratio, volatility, max drawdown, returns

## Project Structure

```
portfolio-playground/
├── backend/           # FastAPI Python backend
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── models/           # Pydantic models
│   │   ├── routers/          # API endpoints
│   │   └── services/         # Business logic
│   └── requirements.txt
└── frontend/          # Next.js React frontend
    ├── src/
    │   ├── app/              # Next.js app router
    │   ├── components/       # React components
    │   └── lib/              # API client
    └── package.json
```

## Quick Start

```bash
# First time setup (installs all dependencies)
pnpm install
cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..

# Run both frontend and backend
pnpm dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/portfolio/analyze` | Analyze a single portfolio |
| POST | `/api/portfolio/compare` | Compare multiple portfolios |
| GET | `/api/portfolio/symbols/search` | Search for ticker symbols |

### Example Request

```json
POST /api/portfolio/analyze
{
  "portfolio": {
    "name": "60/40 Portfolio",
    "assets": [
      { "symbol": "SPY", "weight": 0.6 },
      { "symbol": "BND", "weight": 0.4 }
    ]
  },
  "start_date": "2023-01-01",
  "end_date": "2024-01-01",
  "risk_free_rate": 0.05
}
```

## Common Ticker Symbols

- **US Stocks**: SPY, QQQ, VTI, IWM
- **Bonds**: BND, AGG, TLT, SHY
- **International**: VEU, EFA, VWO
- **Individual Stocks**: AAPL, GOOGL, MSFT, AMZN
