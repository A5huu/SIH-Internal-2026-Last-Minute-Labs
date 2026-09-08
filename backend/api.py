"""
FreightIQ FastAPI API Routes
Exposes all endpoints strictly defined in api-contract.md.
API endpoints remain thin and delegate all business orchestration to logic.py.
"""

from typing import List, Optional, Dict, Any, Literal
from datetime import date, datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
import backend.logic as logic

router = APIRouter()

# -----------------------------------------------------------------------------
# Enums & Pydantic Schemas
# -----------------------------------------------------------------------------
VesselClassEnum = Literal["Handysize", "Supramax", "Panamax", "Capesize"]
ContractTypeEnum = Literal["Spot", "CoA"]
RiskSeverityEnum = Literal["Low", "Medium", "High"]
EventTypeEnum = Literal["freight_anomaly", "port_congestion", "weather", "geopolitical"]

class CargoCreateRequest(BaseModel):
    cargo_type: str = Field(..., json_schema_extra={"example": "Coking Coal"})
    quantity: float = Field(..., gt=0, json_schema_extra={"example": 75000})
    origin: str = Field(..., json_schema_extra={"example": "Australia"})
    destination_port_id: int = Field(..., json_schema_extra={"example": 1})
    laycan_start: date = Field(..., json_schema_extra={"example": "2026-11-10"})
    laycan_end: date = Field(..., json_schema_extra={"example": "2026-11-20"})
    contract_preference: ContractTypeEnum = Field(default="Spot", json_schema_extra={"example": "Spot"})

class CargoResponse(CargoCreateRequest):
    id: int
    created_at: str

class PortResponse(BaseModel):
    id: int
    name: str
    max_draft: float
    max_loa: float
    max_beam: float
    handling_rate: int
    lightering_available: bool
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    congestion_index: Optional[float] = None

class PortUpdateRequest(BaseModel):
    name: Optional[str] = None
    max_draft: Optional[float] = None
    max_loa: Optional[float] = None
    max_beam: Optional[float] = None
    handling_rate: Optional[int] = None
    lightering_available: Optional[bool] = None

class CompatibilityRequest(BaseModel):
    cargo_quantity: float = Field(..., gt=0, json_schema_extra={"example": 75000})
    destination_port_id: int = Field(..., json_schema_extra={"example": 1})

class FeasibleVesselItem(BaseModel):
    vessel_class: str

class ExcludedVesselItem(BaseModel):
    vessel_class: str
    reason: str

class CompatibilityResponse(BaseModel):
    feasible_vessels: List[FeasibleVesselItem]
    excluded_vessels: List[ExcludedVesselItem]

class TimingRequest(BaseModel):
    cargo_id: int = Field(..., json_schema_extra={"example": 1})
    feasible_vessel_classes: List[str] = Field(..., json_schema_extra={"example": ["Panamax", "Supramax"]})
    laycan_start: date = Field(..., json_schema_extra={"example": "2026-11-10"})
    laycan_end: date = Field(..., json_schema_extra={"example": "2026-11-20"})

class TimingItem(BaseModel):
    vessel_class: str
    fixture_start: str
    fixture_end: str
    entry_score: int
    reason: str

class TimingResponse(BaseModel):
    recommendations: List[TimingItem]

class CoaRequest(BaseModel):
    cargo_id: Optional[int] = None
    cargo_volume: float = Field(..., gt=0, json_schema_extra={"example": 75000})
    vessel_class: str = Field(..., json_schema_extra={"example": "Panamax"})
    horizon_months: int = Field(default=3, ge=1, le=12, json_schema_extra={"example": 3})

class CoaResponse(BaseModel):
    expected_spot_cost: float
    expected_coa_cost: float
    cost_difference: float
    volatility: float
    preferred_option: ContractTypeEnum
    reason: str

class RecommendationRequest(BaseModel):
    cargo_id: int = Field(..., json_schema_extra={"example": 1})

class FixtureWindow(BaseModel):
    start: str
    end: str

class RateQuantiles(BaseModel):
    p10: float
    p50: float
    p90: float

class RecommendationResponse(BaseModel):
    cargo_id: int
    vessel_class: str
    fixture_window: FixtureWindow
    rate: RateQuantiles
    contract_type: ContractTypeEnum
    risk_level: RiskSeverityEnum
    score: int
    reasons: List[str]

class FleetOptimizeRequest(BaseModel):
    vessel_id: str = Field(default="V0001", json_schema_extra={"example": "V0001"})
    current_position: str = Field(default="Singapore", json_schema_extra={"example": "Singapore Anchorage"})
    available_from: str = Field(default="2026-11-01", json_schema_extra={"example": "2026-11-01"})

class SignupRequest(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "John Doe"})
    email: str = Field(..., json_schema_extra={"example": "john@example.com"})
    password: str = Field(..., min_length=4, json_schema_extra={"example": "password123"})
    company: Optional[str] = Field(default="", json_schema_extra={"example": "Tata Steel"})
    role: Optional[str] = Field(default="Chartering Manager", json_schema_extra={"example": "Chartering Manager"})

class LoginRequest(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "john@example.com"})
    password: str = Field(..., json_schema_extra={"example": "password123"})

class AuthResponse(BaseModel):
    id: int
    name: str
    email: str
    company: Optional[str] = None
    role: Optional[str] = None
    token: Optional[str] = "demo-session-token"

# -----------------------------------------------------------------------------
# Endpoints Implementation
# -----------------------------------------------------------------------------

@router.post("/cargo", response_model=CargoResponse, status_code=status.HTTP_201_CREATED)
def api_create_cargo(req: CargoCreateRequest, db: Session = Depends(get_db)):
    """Create a new cargo specification."""
    try:
        return logic.create_cargo(req.model_dump(), db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create cargo: {str(e)}")

@router.get("/cargo/{cargo_id}", response_model=CargoResponse)
def api_get_cargo(cargo_id: int, db: Session = Depends(get_db)):
    """Retrieve cargo details by ID."""
    cargo = logic.get_cargo(cargo_id, db)
    if not cargo:
        raise HTTPException(status_code=404, detail=f"Cargo {cargo_id} not found.")
    return cargo

@router.get("/ports", response_model=List[PortResponse])
def api_list_ports(db: Session = Depends(get_db)):
    """List all supported discharge and loading ports with navigational constraints."""
    return logic.get_ports(port_id=None, db=db)

@router.get("/ports/{port_id}", response_model=PortResponse)
def api_get_port(port_id: int, db: Session = Depends(get_db)):
    """Retrieve navigational and physical berth constraints for a specific port."""
    port = logic.get_ports(port_id=port_id, db=db)
    if not port:
        raise HTTPException(status_code=404, detail=f"Port {port_id} not found.")
    return port

@router.post("/compatibility", response_model=CompatibilityResponse)
def api_check_compatibility(req: CompatibilityRequest, db: Session = Depends(get_db)):
    """
    Deterministic rule-based vessel-port physical feasibility engine.
    Checks draft, LOA, beam, and deadweight parcel boundaries.
    """
    try:
        return logic.check_vessel_port(req.cargo_quantity, req.destination_port_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feasibility evaluation failed: {str(e)}")

@router.get("/market")
def api_get_market(
    route: Optional[str] = Query(default=None, description="Trade corridor, e.g., Australia-Paradip"),
    vessel_class: Optional[str] = Query(default=None, description="Vessel class, e.g., Panamax"),
    db: Session = Depends(get_db)
):
    """Retrieve latest freight benchmark rate and historical Baltic indices."""
    try:
        return logic.get_market_overview(route, vessel_class, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch market data: {str(e)}")

@router.get("/forecast")
def api_get_forecast(
    route: str = Query(default="Australia-Paradip", description="Trade corridor"),
    vessel_class: str = Query(default="Panamax", description="Vessel classification"),
    horizon_days: int = Query(default=30, ge=1, le=180, description="Forecast horizon in days"),
    db: Session = Depends(get_db)
):
    """Generate forward freight forecast quantiles (P10, P50, P90) and driver explainability."""
    try:
        return logic.get_forecast(route, vessel_class, horizon_days, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast generation failed: {str(e)}")

@router.post("/timing", response_model=TimingResponse)
def api_calculate_timing(req: TimingRequest, db: Session = Depends(get_db)):
    """
    Market Entry Timing Advisor.
    HARD RULE: Recommended fixture window MUST fall strictly within the specified cargo laycan.
    """
    try:
        return logic.calculate_timing(
            req.cargo_id, 
            req.feasible_vessel_classes, 
            req.laycan_start, 
            req.laycan_end, 
            db
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Timing calculation failed: {str(e)}")

@router.post("/coa", response_model=CoaResponse)
def api_simulate_coa(req: CoaRequest, db: Session = Depends(get_db)):
    """Evaluate Spot vs Contract of Affreightment (CoA) strategy and cost savings."""
    try:
        return logic.simulate_coa(req.cargo_id, req.cargo_volume, req.vessel_class, req.horizon_months, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CoA simulation failed: {str(e)}")

@router.get("/risk")
def api_get_risk(
    route: Optional[str] = Query(default=None),
    port_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db)
):
    """Retrieve active route/port risk events and statistical freight anomaly signals."""
    try:
        return logic.calculate_risk(route, port_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk retrieval failed: {str(e)}")

@router.post("/recommendation", response_model=RecommendationResponse)
def api_generate_recommendation(req: RecommendationRequest, db: Session = Depends(get_db)):
    """
    Complete end-to-end Decision Support Orchestration.
    Workflow: Feasibility Constraints -> ML Freight Forecast -> Timing Advisor -> Risk Analysis -> CoA Economics -> Multi-factor Score
    """
    try:
        return logic.generate_recommendation(req.cargo_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation orchestration failed: {str(e)}")

@router.get("/recommendation/{cargo_id}", response_model=RecommendationResponse)
def api_get_recommendation(cargo_id: int, db: Session = Depends(get_db)):
    """Retrieve the most recent recommendation generated for a cargo requirement."""
    rec = logic.get_persisted_recommendation(cargo_id, db)
    if not rec:
        raise HTTPException(status_code=404, detail=f"No recommendation found for Cargo ID {cargo_id}.")
    return rec

@router.post("/fleet/optimize")
def api_optimize_fleet(req: FleetOptimizeRequest, db: Session = Depends(get_db)):
    """Post-MVP Demonstration Fleet / Idle-Time Optimization Stub."""
    return logic.optimize_fleet(req.model_dump(), db)

@router.get("/admin/ports", response_model=List[PortResponse])
def api_admin_list_ports(db: Session = Depends(get_db)):
    """Admin endpoint to inspect port constraints."""
    return logic.get_ports(port_id=None, db=db)

@router.put("/admin/ports/{port_id}", response_model=PortResponse)
def api_admin_update_port(port_id: int, req: PortUpdateRequest, db: Session = Depends(get_db)):
    """Admin endpoint to update port draft, LOA, beam, and handling rates."""
    try:
        return logic.update_admin_port(port_id, req.model_dump(exclude_unset=True), db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Port update failed: {str(e)}")

@router.post("/auth/signup", response_model=AuthResponse)
def api_signup(req: SignupRequest, db: Session = Depends(get_db)):
    """User registration endpoint."""
    try:
        user = logic.create_user(req.model_dump(), db)
        user["token"] = f"token_{user['id']}"
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@router.post("/auth/login", response_model=AuthResponse)
def api_login(req: LoginRequest, db: Session = Depends(get_db)):
    """User authentication endpoint."""
    try:
        user = logic.authenticate_user(req.email, req.password, db)
        user["token"] = f"token_{user['id']}"
        return user
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@router.get("/routes")
def api_list_routes(db: Session = Depends(get_db)):
    """List available trading routes and associated metadata."""
    return logic.get_available_routes(db)

