from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import portfolio

app = FastAPI(
    title="Portfolio Playground API",
    description="Analyze and compare investment portfolios",
    version="0.1.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(portfolio.router)


@app.get("/")
async def root():
    return {"message": "Portfolio Analyzer API", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}
