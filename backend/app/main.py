import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.limiter import limiter
from app.routers import portfolio

app = FastAPI(
    title="Portfolio Playground API",
    description="Analyze and compare investment portfolios",
    version="0.1.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS for frontend
allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress JSON responses (performance series are tens of KB)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include routers
app.include_router(portfolio.router)


@app.get("/")
async def root():
    return {"message": "Portfolio Analyzer API", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}
