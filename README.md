#

# FreightIQ — Intelligent Freight Forecasting & Chartering Decision Support Platform

> **Smart India Hackathon 2026** | **Problem Statement ID:** 26006
> **Organization:** Ministry of Steel | **Theme:** AI/ML-driven Maritime Logistics & Dry-Bulk Chartering Optimization

---

## Executive Overview

India’s steel industry imports the vast majority of its coking coal from Australia, the United States, Mozambique, Russia, and Indonesia into East Coast ports (**Paradip, Visakhapatnam, Gangavaram, Dhamra, Gopalpur, and Haldia**). Traditionally, chartering teams procure dry-bulk capacity via reactive, single-voyage spot fixtures. This exposes steelmakers to severe freight market volatility, port infrastructure mismatches, and missed opportunities for structured **Contract of Affreightment (CoA)** volume savings.

**FreightIQ** transforms bulk maritime logistics from reactive market execution into an intelligent, constraint-aware decision process.

```text
                    CARGO PLAN
                        │
                        ▼
            ┌───────────────────────┐
            │  FEASIBILITY ENGINE   │  Deterministic physical constraints
            │ (Draft, LOA, Beam, t) │  (Ports & Naval Architecture)
            └───────────┬───────────┘
                        │ Feasible vessel classes only
                        ▼
            ┌───────────────────────┐
            │   XGBOOST FORECASTER  │  Leakage-free time-aware quantile ML
            │     (P10, P50, P90)   │  (Walk-forward validated)
            └───────────┬───────────┘
                        │ Expected rates & uncertainty band
            ┌───────────┴───────────┐
            ▼           ▼           ▼
        TIMING         RISK        COA
        ADVISOR       ENGINE    SIMULATOR
     (Laycan window) (Anomalies)(Mean/Variance)
            │           │           │
            └───────────┼───────────┘
                        ▼
            ┌───────────────────────┐
            │    RECOMMENDATION     │  Multi-factor composite scoring
            │        ENGINE         │  Explainable chartering directive
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  MARITIME DASHBOARD   │  Dark-mode analytics UI
            │   (HTML + CSS + JS)   │  Live decision cards & charts
            └───────────────────────┘
```

### Core Architecture Philosophy

> **"Feasibility constrains ML. ML informs economics. logic.py combines into an explainable decision."**
> Physical navigational constraints (harbor draft, berth LOA, beam pockets, parcel boundaries) strictly override economic appeal. An economically cheap Capesize is impossible if the destination harbor cannot berth it safely.

---

## Technology Stack

* **Frontend:** HTML5, Modern CSS (Custom Design System, Glassmorphism, Dark Maritime Theme), Vanilla JavaScript, Chart.js (via CDN).
* **Backend:** Python 3.10+, FastAPI (Asynchronous REST API, Pydantic v2 schemas, Auto-generated Swagger `/docs`).
* **Database:** PostgreSQL (Relational schema, Foreign-Key referential integrity, B-Tree indexes).
* **Machine Learning:** XGBoost (Quantile regression `P10, P50, P90`), Scikit-Learn, Pandas, NumPy, Joblib.
* **Architecture Style:** Clean Layered Architecture (`Frontend` → `api.py` → `logic.py` → `database.py` / `ml/model.py`).

---

---

## Project Structure

```text
SIH-Internal-2026-Last-Minute-Labs/
│
├── backend/          # FastAPI + business/decision logic
├── frontend/         # Web dashboard
├── ml/               # Forecasting and model training
├── data/             # Maritime datasets and validation
├── tests/            # API tests
│
├── requirements.txt
├── .env.example
└── README.md
```

---

# Running the Project

## Prerequisites

Install:

* Python 3.10+
* PostgreSQL 14+
* Git

Make sure PostgreSQL is running on port `5432`.

---

## 1. Clone the Repository

```bash
git clone https://github.com/A5huu/SIH-Internal-2026-Last-Minute-Labs.git
cd SIH-Internal-2026-Last-Minute-Labs
```

---

## 2. Create Virtual Environment

### Windows

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell activation doesn't work:

```powershell
.\.venv\Scripts\activate.bat
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Setup PostgreSQL

Create a database:

```sql
CREATE DATABASE freightiq;
```

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/freightiq
ENVIRONMENT=development
PORT=8000
HOST=0.0.0.0
```

Replace the username/password if your PostgreSQL credentials are different.

---

## 5. Initialize Database

```bash
python -c "from backend.database import init_db; init_db()"
```

---

## 6. Validate Dataset

```bash
python data/validate_data.py
```

---

## 7. Train ML Model

```bash
python -m ml.train
```

This trains the XGBoost forecasting models and creates the model artifacts.

---

## 8. Start the Application

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open the dashboard:

**http://127.0.0.1:8000/**

API documentation:

**http://127.0.0.1:8000/docs**

Health check:

**http://127.0.0.1:8000/health**

---

## 9. Run Tests

In a separate terminal:

```bash
python -m pytest tests/test_api.py -v
```

---

# Quick Start

After PostgreSQL is configured, the complete setup is:

```bash
git clone https://github.com/A5huu/SIH-Internal-2026-Last-Minute-Labs.git
cd SIH-Internal-2026-Last-Minute-Labs

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

python -c "from backend.database import init_db; init_db()"

python data/validate_data.py
python -m ml.train

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Then visit:

```text
http://127.0.0.1:8000/
```

---

## Final Output

FreightIQ does **not automatically book a shipment**.

It provides an explainable recommendation containing:

* Recommended vessel class
* Expected freight rate
* P10 / P50 / P90 forecast
* Recommended fixture timing
* Risk assessment
* Spot vs CoA comparison
* Rejected alternatives and reasons

The final chartering decision remains with the procurement/user.

---

### Team Last Minute Labs

**Smart India Hackathon 2026**
**Problem Statement 26006**
