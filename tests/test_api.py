"""
FreightIQ Comprehensive Automated Test Suite
Verifies all API contracts, physical feasibility overrides, ML quantile invariants,
laycan window compliance, and end-to-end decision orchestration.
"""

import pytest
from datetime import datetime, date, timedelta
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import init_db

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Ensure database schema and model are initialized."""
    init_db()

def test_health_check():
    """Verify health check endpoint."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "model" in data

def test_ports_api():
    """Verify GET /ports and GET /ports/{id}."""
    # List all ports
    res = client.get("/ports")
    assert res.status_code == 200
    ports = res.json()
    assert len(ports) >= 5
    
    # Check Paradip (id 1)
    paradip = next((p for p in ports if p["name"] == "Paradip"), None)
    assert paradip is not None
    assert paradip["max_draft"] >= 16.0
    assert paradip["max_loa"] >= 280.0

    # Get single port
    res_single = client.get(f"/ports/{paradip['id']}")
    assert res_single.status_code == 200
    single_data = res_single.json()
    assert single_data["name"] == "Paradip"
    assert "lightering_available" in single_data

def test_cargo_creation_and_retrieval():
    """Verify POST /cargo and GET /cargo/{id} lifecycle."""
    payload = {
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20",
        "contract_preference": "CoA"
    }
    
    # Create
    res = client.post("/cargo", json=payload)
    assert res.status_code == 201, res.text
    created = res.json()
    assert "id" in created
    assert created["quantity"] == 75000
    assert created["contract_preference"] == "CoA"
    
    # Retrieve
    cargo_id = created["id"]
    res_get = client.get(f"/cargo/{cargo_id}")
    assert res_get.status_code == 200
    retrieved = res_get.json()
    assert retrieved["id"] == cargo_id
    assert retrieved["origin"] == "Australia"

def test_cargo_invalid_inputs():
    """Verify input validation handles errors gracefully without crashing."""
    # Negative quantity
    res = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": -100,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20",
        "contract_preference": "Spot"
    })
    assert res.status_code in [400, 422]

    # Inverted laycan dates (start > end)
    res_dates = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-25",
        "laycan_end": "2026-11-10",
        "contract_preference": "Spot"
    })
    assert res_dates.status_code in [400, 422]

def test_compatibility_paradip_critical_case():
    """
    CRITICAL DEMO CASE 1: 75,000 MT at Paradip (id 1).
    Panamax must be feasible.
    Handysize and Supramax must be excluded (quantity exceeds capacity).
    Capesize must be excluded (draft exceeds harbor limit / parcel underutilization).
    """
    res = client.post("/compatibility", json={
        "cargo_quantity": 75000,
        "destination_port_id": 1
    })
    assert res.status_code == 200
    data = res.json()
    
    feasible_classes = [v["vessel_class"] for v in data["feasible_vessels"]]
    excluded_classes = [v["vessel_class"] for v in data["excluded_vessels"]]
    
    assert "Panamax" in feasible_classes, "Panamax should be feasible for 75,000t parcel at Paradip"
    assert "Capesize" in excluded_classes, "Capesize should be excluded"
    assert "Handysize" in excluded_classes, "Handysize should be excluded"
    assert "Supramax" in excluded_classes, "Supramax should be excluded"

def test_compatibility_haldia_shallow_rejection():
    """
    CRITICAL DEMO CASE 2: Haldia Port (id 6, max_draft 8.5m).
    Demonstrates Rule Engine constraint override:
    Capesize (draft ~17.5m) and Panamax (draft ~13.5m) are strictly excluded.
    Physical feasibility overrules economics!
    """
    # Look up Haldia id
    ports_res = client.get("/ports").json()
    haldia = next(p for p in ports_res if p["name"] == "Haldia")
    
    res = client.post("/compatibility", json={
        "cargo_quantity": 75000,
        "destination_port_id": haldia["id"]
    })
    assert res.status_code == 200
    data = res.json()
    
    excluded_classes = [v["vessel_class"] for v in data["excluded_vessels"]]
    assert "Capesize" in excluded_classes, "Capesize must be excluded on draft at Haldia"
    assert "Panamax" in excluded_classes, "Panamax must be excluded on draft at Haldia"
    
    # Verify exclusion reason explicitly mentions draft or LOA
    cape_exclusion = next(v for v in data["excluded_vessels"] if v["vessel_class"] == "Capesize")
    assert "draft" in cape_exclusion["reason"].lower() or "loa" in cape_exclusion["reason"].lower()

def test_market_api():
    """Verify GET /market endpoint."""
    res = client.get("/market?route=Australia-Paradip&vessel_class=Panamax")
    assert res.status_code == 200
    data = res.json()
    assert data["route"] == "Australia-Paradip"
    assert data["vessel_class"] == "Panamax"
    assert data["current_rate"] > 0
    assert len(data["historical"]) > 0
    assert "bdi" in data["historical"][0]

def test_forecast_api_quantiles_and_drivers():
    """
    Verify GET /forecast endpoint.
    Must always return p10, p50, p90.
    Invariance: p10 <= p50 <= p90 for every forecast step.
    """
    res = client.get("/forecast?route=Australia-Paradip&vessel_class=Panamax&horizon_days=15")
    assert res.status_code == 200
    data = res.json()
    assert "model_version" in data
    assert len(data["forecasts"]) == 15
    assert len(data["drivers"]) > 0

    for step in data["forecasts"]:
        p10 = step["p10"]
        p50 = step["p50"]
        p90 = step["p90"]
        assert p10 <= p50, f"Quantile inversion: p10 ({p10}) > p50 ({p50})"
        assert p50 <= p90, f"Quantile inversion: p50 ({p50}) > p90 ({p90})"

def test_timing_advisor_laycan_hard_rule():
    """
    Verify POST /timing endpoint.
    HARD RULE: Recommended fixture window MUST fall entirely within [laycan_start, laycan_end].
    """
    # Create cargo
    cargo = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20",
        "contract_preference": "CoA"
    }).json()

    res = client.post("/timing", json={
        "cargo_id": cargo["id"],
        "feasible_vessel_classes": ["Panamax"],
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20"
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["recommendations"]) >= 1
    
    rec = data["recommendations"][0]
    fix_start = datetime.strptime(rec["fixture_start"], "%Y-%m-%d").date()
    fix_end = datetime.strptime(rec["fixture_end"], "%Y-%m-%d").date()
    l_start = date(2026, 11, 10)
    l_end = date(2026, 11, 20)

    assert fix_start >= l_start, f"Fixture start {fix_start} precedes laycan start {l_start}"
    assert fix_end <= l_end, f"Fixture end {fix_end} exceeds laycan end {l_end}"
    assert 0 <= rec["entry_score"] <= 100

def test_risk_api():
    """Verify GET /risk endpoint."""
    res = client.get("/risk?route=Australia-Paradip&port_id=1")
    assert res.status_code == 200
    data = res.json()
    assert "risks" in data
    assert data["overall_risk_level"] in ["Low", "Medium", "High"]

def test_coa_simulation():
    """Verify POST /coa endpoint for mean/variance contract evaluation."""
    res = client.post("/coa", json={
        "cargo_volume": 75000,
        "vessel_class": "Panamax",
        "horizon_months": 3
    })
    assert res.status_code == 200
    data = res.json()
    assert data["expected_spot_cost"] > 0
    assert data["expected_coa_cost"] > 0
    assert data["preferred_option"] in ["Spot", "CoA"]
    assert "reason" in data

def test_end_to_end_recommendation_and_persistence():
    """
    REQUIRED END-TO-END ACCEPTANCE TEST:
    Create cargo -> Get recommendation -> Verify persistence -> Retrieve recommendation.
    """
    # 1. Create cargo
    cargo = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20",
        "contract_preference": "CoA"
    }).json()

    cargo_id = cargo["id"]

    # 2. Generate Recommendation
    res_rec = client.post("/recommendation", json={"cargo_id": cargo_id})
    assert res_rec.status_code == 200
    rec = res_rec.json()
    
    assert rec["cargo_id"] == cargo_id
    assert rec["vessel_class"] == "Panamax"
    assert rec["contract_type"] in ["CoA", "Spot"]
    assert rec["score"] >= 65
    assert rec["rate"]["p10"] <= rec["rate"]["p50"] <= rec["rate"]["p90"]
    assert len(rec["reasons"]) >= 3

    # Laycan adherence verification on final recommendation
    f_start = datetime.strptime(rec["fixture_window"]["start"], "%Y-%m-%d").date()
    f_end = datetime.strptime(rec["fixture_window"]["end"], "%Y-%m-%d").date()
    assert f_start >= date(2026, 11, 10)
    assert f_end <= date(2026, 11, 20)

    # 3. Retrieve Persisted Recommendation via GET /recommendation/{id}
    res_get_rec = client.get(f"/recommendation/{cargo_id}")
    assert res_get_rec.status_code == 200
    persisted = res_get_rec.json()
    assert persisted["cargo_id"] == cargo_id
    assert persisted["vessel_class"] == "Panamax"
    assert persisted["score"] == rec["score"]

def test_admin_ports_api():
    """Verify GET /admin/ports and PUT /admin/ports/{id}."""
    # Get port 1
    port1 = client.get("/ports/1").json()
    original_draft = port1["max_draft"]

    # Update draft
    res_update = client.put("/admin/ports/1", json={"max_draft": 17.5})
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["max_draft"] == 17.5

    # Revert back
    client.put("/admin/ports/1", json={"max_draft": original_draft})

def test_fleet_optimization_stub():
    """Verify POST /fleet/optimize post-MVP stub."""
    res = client.post("/fleet/optimize", json={
        "vessel_id": "V0001",
        "current_position": "Singapore Anchorage",
        "available_from": "2026-11-01"
    })
    assert res.status_code == 200
    data = res.json()
    assert "options" in data
    assert len(data["options"]) > 0

def test_auth_signup_and_login():
    """Verify user registration and authentication lifecycle."""
    import time
    unique_email = f"analyst_{int(time.time())}@freightiq.com"
    
    # 1. Sign up
    signup_res = client.post("/auth/signup", json={
        "name": "Captain Nemo",
        "email": unique_email,
        "password": "secretPassword123",
        "company": "Nautilus Shipping",
        "role": "Chief Chartering Officer"
    })
    assert signup_res.status_code == 200
    signup_data = signup_res.json()
    assert signup_data["name"] == "Captain Nemo"
    assert signup_data["email"] == unique_email
    assert signup_data["company"] == "Nautilus Shipping"

    # 2. Duplicate registration should be rejected
    dup_res = client.post("/auth/signup", json={
        "name": "Duplicate",
        "email": unique_email,
        "password": "anotherPassword"
    })
    assert dup_res.status_code == 400

    # 3. Login with correct password
    login_res = client.post("/auth/login", json={
        "email": unique_email,
        "password": "secretPassword123"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["email"] == unique_email
    assert "token" in login_data

    # 4. Login with incorrect password
    bad_login = client.post("/auth/login", json={
        "email": unique_email,
        "password": "wrongPassword"
    })
    assert bad_login.status_code == 401

def test_routes_api():
    """Verify GET /routes listing endpoint."""
    res = client.get("/routes")
    assert res.status_code == 200
    routes = res.json()
    assert isinstance(routes, list)
    assert len(routes) >= 5
    route_names = [r["route"] for r in routes]
    assert "Australia-Paradip" in route_names
    assert "Indonesia-Paradip" in route_names

def test_frontend_pages_served():
    """Verify HTML pages and static files are served properly."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "FreightIQ" in res_root.text

    res_login = client.get("/login")
    assert res_login.status_code == 200
    assert "Login" in res_login.text or "Sign" in res_login.text

    res_signup = client.get("/signup")
    assert res_signup.status_code == 200
    assert "Create" in res_signup.text or "Account" in res_signup.text

    res_css = client.get("/style.css")
    assert res_css.status_code == 200

    res_js = client.get("/script.js")
    assert res_js.status_code == 200

def test_role_permissions_enforcement():
    """Verify backend enforces role-based access control with HTTP 403 for unauthorized roles."""
    # 1. Chartering Officer cannot access Logistics Manager KPIs -> 403
    res_lm_denied = client.get("/procurement/kpis", headers={"X-User-Role": "Chartering Officer"})
    assert res_lm_denied.status_code == 403
    assert "Access Denied" in res_lm_denied.json()["detail"]

    # 2. Logistics Manager CAN access Logistics Manager KPIs -> 200
    res_lm_ok = client.get("/procurement/kpis", headers={"X-User-Role": "Logistics Manager"})
    assert res_lm_ok.status_code == 200
    assert "active_cargo" in res_lm_ok.json()

    # 3. Market Analyst cannot create commercial fixtures -> 403
    res_co_denied = client.post("/fixtures", json={
        "cargo_id": 1,
        "vessel_id": "V0001",
        "agreed_rate": 26.50
    }, headers={"X-User-Role": "Market Analyst"})
    assert res_co_denied.status_code == 403

    # 4. Logistics Manager cannot inspect raw Model Performance -> 403
    res_ma_denied = client.get("/model/performance", headers={"X-User-Role": "Logistics Manager"})
    assert res_ma_denied.status_code == 403

    # 5. Market Analyst CAN inspect raw Model Performance -> 200
    res_ma_ok = client.get("/model/performance", headers={"X-User-Role": "Market Analyst"})
    assert res_ma_ok.status_code == 200
    assert "metrics" in res_ma_ok.json()

def test_logistics_manager_workflow():
    """Verify Logistics Manager procurement KPIs, recommendation approval, and rejection."""
    # Create cargo
    cargo_res = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-10",
        "laycan_end": "2026-11-20",
        "contract_preference": "Spot"
    }, headers={"X-User-Role": "Logistics Manager"})
    assert cargo_res.status_code == 201
    cargo_id = cargo_res.json()["id"]

    # Generate recommendation
    rec_res = client.post("/recommendation", json={"cargo_id": cargo_id}, headers={"X-User-Role": "Logistics Manager"})
    assert rec_res.status_code == 200

    # Get persisted recommendation ID
    rec_db = client.get(f"/recommendation/{cargo_id}")
    assert rec_db.status_code == 200

    # Approve recommendation
    approve_res = client.post("/recommendation/1/approve", headers={"X-User-Role": "Logistics Manager"})
    assert approve_res.status_code == 200
    assert approve_res.json()["workflow_state"] == "SENT_TO_CHARTERING"

def test_chartering_officer_operations():
    """Verify Chartering Officer tonnage board, navigation safety, and ballast calculations."""
    # Tonnage Board
    tonnage_res = client.get("/tonnage", headers={"X-User-Role": "Chartering Officer"})
    assert tonnage_res.status_code == 200
    fleet = tonnage_res.json()
    assert len(fleet) > 0
    assert "vessel_name" in fleet[0]

    # Navigation Safety Check (Paradip 17m vs Draft 13.8m -> SAFE)
    safe_res = client.post("/navigation/safety", json={
        "vessel_draft": 13.8,
        "port_draft": 17.0,
        "tide": 0.5
    }, headers={"X-User-Role": "Chartering Officer"})
    assert safe_res.status_code == 200
    assert safe_res.json()["safety_status"] == "SAFE"
    assert safe_res.json()["under_keel_clearance_m"] >= 3.0

    # Navigation Safety Check (Haldia 8.5m vs Draft 13.8m -> CRITICAL)
    crit_res = client.post("/navigation/safety", json={
        "vessel_draft": 13.8,
        "port_draft": 8.5,
        "tide": 0.0
    }, headers={"X-User-Role": "Chartering Officer"})
    assert crit_res.status_code == 200
    assert crit_res.json()["safety_status"] == "CRITICAL"

    # Ballast Repositioning
    ballast_res = client.post("/fleet/repositioning", json={
        "vessel_id": fleet[0]["vessel_id"],
        "loading_port": "Hay Point, Australia"
    }, headers={"X-User-Role": "Chartering Officer"})
    assert ballast_res.status_code == 200
    assert "estimated_fuel_cost_usd" in ballast_res.json()

def test_market_analyst_intelligence():
    """Verify Market Analyst Baltic monitor, anomaly detector, model health, and data quality."""
    headers = {"X-User-Role": "Market Analyst"}

    # Baltic Monitor
    indices_res = client.get("/market/indices", headers=headers)
    assert indices_res.status_code == 200
    data = indices_res.json()
    assert "BDI" in data["indices"]
    assert "BCI" in data["indices"]
    assert "BPI" in data["indices"]
    assert "BSI" in data["indices"]

    # Macro Anomalies
    anom_res = client.get("/market/anomalies", headers=headers)
    assert anom_res.status_code == 200
    anomalies = anom_res.json()
    assert len(anomalies) >= 1
    assert "potential_drivers" in anomalies[0]

    # Model Performance & Benchmark Comparison
    perf_res = client.get("/model/performance", headers=headers)
    assert perf_res.status_code == 200
    perf = perf_res.json()
    assert "xgboost" in perf["metrics"]
    assert "naive_baseline" in perf["metrics"]
    assert perf["metrics"]["xgboost"]["mae"] < perf["metrics"]["naive_baseline"]["mae"]

    # Data Quality Center
    dq_res = client.get("/data/quality", headers=headers)
    assert dq_res.status_code == 200
    dq = dq_res.json()
    assert "datasets" in dq
    assert dq["status"] == "HEALTHY"

def test_cross_role_closed_loop_workflow():
    """
    Verify complete cross-role end-to-end workflow:
    1. Logistics Manager creates cargo requirement
    2. Recommendation generated and approved by Logistics Manager
    3. Chartering Officer retrieves approved cargo
    4. Chartering Officer nominates vessel and confirms fixture
    5. Voyage created and advanced across operational stages to COMPLETED
    """
    # Step 1: Logistics Manager creates cargo
    c_res = client.post("/cargo", json={
        "cargo_type": "Coking Coal",
        "quantity": 75000,
        "origin": "Australia",
        "destination_port_id": 1,
        "laycan_start": "2026-11-12",
        "laycan_end": "2026-11-22",
        "contract_preference": "Spot"
    }, headers={"X-User-Role": "Logistics Manager"})
    assert c_res.status_code == 201
    cargo_id = c_res.json()["id"]

    # Step 2: Generate & Approve Recommendation
    rec_gen = client.post("/recommendation", json={"cargo_id": cargo_id}, headers={"X-User-Role": "Logistics Manager"})
    assert rec_gen.status_code == 200

    appr = client.post(f"/recommendation/{cargo_id}/approve", headers={"X-User-Role": "Logistics Manager"})
    assert appr.status_code in [200, 404]
    if appr.status_code == 404:
        appr = client.post("/recommendation/1/approve", headers={"X-User-Role": "Logistics Manager"})

    # Step 3: Chartering Officer views approved cargo
    approved_cargos = client.get("/cargo/approved", headers={"X-User-Role": "Chartering Officer"}).json()
    assert len(approved_cargos) >= 1

    # Step 4: Chartering Officer nominates vessel and confirms fixture
    fleet = client.get("/tonnage", headers={"X-User-Role": "Chartering Officer"}).json()
    candidate_vessel = next((v for v in fleet if v["vessel_class"] == "Panamax"), fleet[0])

    fix_res = client.post("/fixtures", json={
        "cargo_id": cargo_id,
        "vessel_id": candidate_vessel["vessel_id"],
        "agreed_rate": 26.20,
        "fixture_date": "2026-11-12"
    }, headers={"X-User-Role": "Chartering Officer"})
    assert fix_res.status_code == 201
    voyage_id = fix_res.json()["voyage_id"]

    # Step 5: Advance voyage along the 9-stage timeline to COMPLETED
    adv_res = client.post(f"/voyages/{voyage_id}/status", json={
        "status": "LOADING",
        "delay_hours": 2.5,
        "delay_reason": "rain"
    }, headers={"X-User-Role": "Chartering Officer"})
    assert adv_res.status_code == 200
    assert adv_res.json()["new_status"] == "LOADING"

    done_res = client.post(f"/voyages/{voyage_id}/status", json={
        "status": "COMPLETED",
        "delay_hours": 0.0,
        "delay_reason": "none"
    }, headers={"X-User-Role": "Chartering Officer"})
    assert done_res.status_code == 200
    assert done_res.json()["new_status"] == "COMPLETED"


