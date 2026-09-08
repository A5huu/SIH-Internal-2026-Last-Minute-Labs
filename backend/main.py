"""
FreightIQ FastAPI Application Server
SIH 2026 Problem Statement 26006
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import init_db
from backend.api import router
from ml.model import get_forecaster

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database schema & load ML model singleton into memory
    print("[STARTUP] Initializing database schema...")
    init_db()
    print("[STARTUP] Loading ML forecasting engine...")
    get_forecaster()
    print("[STARTUP] FreightIQ server ready.")
    yield
    print("[SHUTDOWN] FreightIQ server stopped.")

app = FastAPI(
    title="FreightIQ API",
    description="Intelligent Freight Forecasting, Vessel-Port Feasibility & Chartering Decision Support Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(router)

# Health Check
@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": "FreightIQ Core",
        "database": "connected",
        "model": get_forecaster().version
    }

# Serve Frontend pages & static assets
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    @app.get("/dashboard", include_in_schema=False)
    @app.get("/main.html", include_in_schema=False)
    def serve_frontend_root():
        main_file = os.path.join(frontend_dir, "main.html")
        if os.path.exists(main_file):
            return FileResponse(main_file)
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "FreightIQ API is active. Open /docs for Swagger UI."}

    @app.get("/login", include_in_schema=False)
    @app.get("/login.html", include_in_schema=False)
    def serve_login():
        login_file = os.path.join(frontend_dir, "login.html")
        if os.path.exists(login_file):
            return FileResponse(login_file)
        return FileResponse(os.path.join(frontend_dir, "main.html"))

    @app.get("/signup", include_in_schema=False)
    @app.get("/signup.html", include_in_schema=False)
    def serve_signup():
        signup_file = os.path.join(frontend_dir, "signup.html")
        if os.path.exists(signup_file):
            return FileResponse(signup_file)
        return FileResponse(os.path.join(frontend_dir, "main.html"))

    # Direct static file routes for root relative paths
    @app.get("/style.css", include_in_schema=False)
    def serve_style():
        return FileResponse(os.path.join(frontend_dir, "style.css"))

    @app.get("/script.js", include_in_schema=False)
    def serve_script():
        return FileResponse(os.path.join(frontend_dir, "script.js"))

    @app.get("/auth.css", include_in_schema=False)
    def serve_auth_css():
        return FileResponse(os.path.join(frontend_dir, "auth.css"))

    @app.get("/auth.js", include_in_schema=False)
    def serve_auth_js():
        return FileResponse(os.path.join(frontend_dir, "auth.js"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
