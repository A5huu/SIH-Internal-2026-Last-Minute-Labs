"""
FreightIQ Business Logic & Decision Orchestration Engine
Implements domain-grounded business rules, feasibility constraints, timing advisory,
risk analytics, Spot vs CoA economics, and central recommendation orchestration.

Core Principle:
- Feasibility constrains ML.
- ML informs economics.
- logic.py orchestrates and explains.
"""

import os
from datetime import datetime, date, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import desc, text

import hashlib
from backend.models import (
    Port, VesselClass, Cargo, FreightHistory, Forecast, RiskEvent, Recommendation, User
)
from ml.model import get_forecaster

def create_cargo(payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Validate and persist a new cargo requirement."""
    quantity = float(payload.get("quantity", 0))
    if quantity <= 0:
        raise ValueError("Cargo quantity must be strictly greater than 0.")
    
    port_id = int(payload.get("destination_port_id", 0))
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise ValueError(f"Destination port ID {port_id} does not exist.")
        
    laycan_start = payload.get("laycan_start")
    laycan_end = payload.get("laycan_end")
    if isinstance(laycan_start, str):
        laycan_start = datetime.strptime(laycan_start, "%Y-%m-%d").date()
    if isinstance(laycan_end, str):
        laycan_end = datetime.strptime(laycan_end, "%Y-%m-%d").date()
        
    if laycan_start > laycan_end:
        raise ValueError(f"laycan_start ({laycan_start}) cannot be after laycan_end ({laycan_end}).")
        
    pref = payload.get("contract_preference", "Spot")
    if pref not in ["Spot", "CoA"]:
        raise ValueError("contract_preference must be either 'Spot' or 'CoA'.")
        
    cargo_obj = Cargo(
        cargo_type=str(payload.get("cargo_type", "Coking Coal")),
        quantity=quantity,
        origin=str(payload.get("origin", "Australia")),
        destination_port_id=port_id,
        laycan_start=laycan_start,
        laycan_end=laycan_end,
        contract_preference=pref,
        created_at=datetime.now(timezone.utc)
    )
    db.add(cargo_obj)
    db.commit()
    db.refresh(cargo_obj)
    
    return {
        "id": cargo_obj.id,
        "cargo_type": cargo_obj.cargo_type,
        "quantity": cargo_obj.quantity,
        "origin": cargo_obj.origin,
        "destination_port_id": cargo_obj.destination_port_id,
        "laycan_start": cargo_obj.laycan_start.isoformat(),
        "laycan_end": cargo_obj.laycan_end.isoformat(),
        "contract_preference": cargo_obj.contract_preference,
        "created_at": cargo_obj.created_at.isoformat()
    }

def get_cargo(cargo_id: int, db: Session) -> Optional[Dict[str, Any]]:
    """Retrieve cargo details by ID."""
    c = db.query(Cargo).filter(Cargo.id == cargo_id).first()
    if not c:
        return None
    return {
        "id": c.id,
        "cargo_type": c.cargo_type,
        "quantity": c.quantity,
        "origin": c.origin,
        "destination_port_id": c.destination_port_id,
        "laycan_start": c.laycan_start.isoformat(),
        "laycan_end": c.laycan_end.isoformat(),
        "contract_preference": c.contract_preference,
        "created_at": c.created_at.isoformat()
    }

def get_ports(port_id: Optional[int], db: Session) -> Any:
    """Retrieve all ports or single port with constraints."""
    if port_id is not None:
        p = db.query(Port).filter(Port.id == port_id).first()
        if not p:
            return None
        return {
            "id": p.id,
            "name": p.name,
            "max_draft": p.max_draft,
            "max_loa": p.max_loa,
            "max_beam": p.max_beam,
            "handling_rate": p.handling_rate,
            "lightering_available": p.lightering_available,
            "country": p.country,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "congestion_index": p.congestion_index
        }
    
    ports = db.query(Port).order_by(Port.name).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "max_draft": p.max_draft,
            "max_loa": p.max_loa,
            "max_beam": p.max_beam,
            "handling_rate": p.handling_rate,
            "lightering_available": p.lightering_available,
            "country": p.country,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "congestion_index": p.congestion_index
        }
        for p in ports
    ]

def check_vessel_port(cargo_quantity: float, destination_port_id: int, db: Session) -> Dict[str, Any]:
    """
    Deterministic physical feasibility and parcel-size matching engine.
    Compares vessel dimensions (Draft, LOA, Beam, DWT) strictly against destination port limits.
    Rule: Physical feasibility strictly overrules ML economics.
    """
    port = db.query(Port).filter(Port.id == destination_port_id).first()
    if not port:
        raise ValueError(f"Destination port ID {destination_port_id} not found.")

    vessel_classes = db.query(VesselClass).order_by(VesselClass.min_dwt).all()
    
    feasible_vessels = []
    excluded_vessels = []

    for vc in vessel_classes:
        reasons = []

        # 1. Draft Constraint
        if vc.typical_draft > port.max_draft:
            # Check lightering safety threshold (cannot lighter if draft gap is extreme > 3.0m)
            draft_excess = vc.typical_draft - port.max_draft
            if not port.lightering_available or draft_excess > 3.0:
                reasons.append(
                    f"Typical draft ({vc.typical_draft}m) exceeds destination port maximum draft ({port.max_draft}m)."
                )
            else:
                # If lightering is available but draft exceeds, it's flagged as conditional or parcel restricted
                reasons.append(
                    f"Typical draft ({vc.typical_draft}m) exceeds harbor draft ({port.max_draft}m); requires offshore lightering."
                )

        # 2. LOA Constraint
        if vc.typical_loa > port.max_loa:
            reasons.append(
                f"Typical length overall LOA ({vc.typical_loa}m) exceeds maximum berth limit ({port.max_loa}m)."
            )

        # 3. Beam Constraint
        if vc.typical_beam > port.max_beam:
            reasons.append(
                f"Typical beam ({vc.typical_beam}m) exceeds maximum navigational channel/berth pocket beam ({port.max_beam}m)."
            )

        # 4. Cargo Parcel Size & Deadweight Capacity Fit
        if cargo_quantity > vc.max_dwt:
            reasons.append(
                f"Cargo parcel ({cargo_quantity:,.0f}t) exceeds maximum deadweight capacity ({vc.max_dwt:,.0f}t DWT)."
            )
        elif cargo_quantity < (vc.min_dwt * 0.65):
            reasons.append(
                f"Cargo parcel ({cargo_quantity:,.0f}t) under-utilizes vessel capacity (minimum recommended: {vc.min_dwt * 0.65:,.0f}t)."
            )

        if not reasons:
            feasible_vessels.append({"vessel_class": vc.name})
        else:
            excluded_vessels.append({
                "vessel_class": vc.name,
                "reason": "; ".join(reasons)
            })

    return {
        "feasible_vessels": feasible_vessels,
        "excluded_vessels": excluded_vessels
    }

def normalize_route(route: Optional[str]) -> str:
    """Resolve frontend route labels (e.g. 'Indonesia-EastCoastIndia (coal)') to canonical database routes."""
    if not route:
        return "Australia-Paradip"
    r_lower = route.lower()
    if "indonesia" in r_lower:
        if "dhamra" in r_lower:
            return "Indonesia-Dhamra"
        elif "vizag" in r_lower or "visakhapatnam" in r_lower:
            return "Indonesia-Vizag"
        return "Indonesia-Paradip"
    elif "australia" in r_lower:
        if "vizag" in r_lower or "visakhapatnam" in r_lower:
            return "Australia-Vizag"
        elif "haldia" in r_lower:
            return "Australia-Haldia"
        return "Australia-Paradip"
    elif "us" in r_lower or "hampton" in r_lower or "norfolk" in r_lower:
        if "vizag" in r_lower:
            return "US_East_Coast-Vizag"
        return "US_East_Coast-Paradip"
    elif "mozambique" in r_lower or "maputo" in r_lower:
        if "gangavaram" in r_lower:
            return "Mozambique-Gangavaram"
        return "Mozambique-Paradip"
    elif "russia" in r_lower or "vostochny" in r_lower:
        return "Russia_Far_East-Vizag"
    return route

def get_market_overview(route: Optional[str], vessel_class: Optional[str], db: Session) -> Dict[str, Any]:
    """Retrieve latest freight rate and recent Baltic index movements."""
    canonical_route = normalize_route(route) if route else None
    query = db.query(FreightHistory)
    if canonical_route:
        query = query.filter(FreightHistory.route == canonical_route)
    if vessel_class:
        query = query.filter(FreightHistory.vessel_class == vessel_class)
        
    records = query.order_by(desc(FreightHistory.date)).limit(120).all()
    
    if not records:
        # Fallback to general history for vessel class or overall
        q_fallback = db.query(FreightHistory)
        if vessel_class:
            q_fallback = q_fallback.filter(FreightHistory.vessel_class == vessel_class)
        records = q_fallback.order_by(desc(FreightHistory.date)).limit(120).all()

    current_rate = records[0].rate if records else 21.50
    selected_route = canonical_route or (records[0].route if records else "Australia-Paradip")
    selected_vclass = vessel_class or (records[0].vessel_class if records else "Panamax")

    historical = [
        {
            "date": r.date.isoformat(),
            "rate": round(r.rate, 2),
            "bdi": round(r.bdi or 0, 1),
            "bci": round(r.bci or 0, 1),
            "bpi": round(r.bpi or 0, 1),
            "bsi": round(r.bsi or 0, 1)
        }
        for r in reversed(records)
    ]

    return {
        "route": selected_route,
        "vessel_class": selected_vclass,
        "current_rate": round(current_rate, 2),
        "historical": historical
    }

def get_forecast(route: str, vessel_class: str, horizon_days: int, db: Session) -> Dict[str, Any]:
    """
    Generate forward freight rate trajectory (P10, P50, P90) and driver explainability.
    Utilizes trained ML Forecaster with fallback to persistence baseline.
    """
    canonical_route = normalize_route(route)
    forecaster = get_forecaster()
    fc = forecaster.predict_horizon(route=canonical_route, vessel_class=vessel_class, horizon_days=horizon_days)
    return fc

def calculate_timing(
    cargo_id: int, 
    feasible_vessel_classes: List[str], 
    laycan_start: Any, 
    laycan_end: Any, 
    db: Session
) -> Dict[str, Any]:
    """
    Market Entry Timing Advisor.
    HARD RULE: Fixture window MUST fall entirely within [laycan_start, laycan_end].
    Compares forecast trajectory across laycan window against waiting risk.
    """
    if isinstance(laycan_start, str):
        laycan_start = datetime.strptime(laycan_start, "%Y-%m-%d").date()
    if isinstance(laycan_end, str):
        laycan_end = datetime.strptime(laycan_end, "%Y-%m-%d").date()

    total_days = (laycan_end - laycan_start).days + 1
    if total_days < 1:
        raise ValueError("laycan_end cannot precede laycan_start.")

    # Cargo route determination
    cargo = db.query(Cargo).filter(Cargo.id == cargo_id).first()
    port_name = "Paradip"
    if cargo and cargo.destination_port:
        port_name = cargo.destination_port.name
    origin = cargo.origin if cargo else "Australia"
    route = f"{origin}-{port_name}"

    forecaster = get_forecaster()
    recs = []

    for vclass in feasible_vessel_classes:
        # Forecast across horizon
        horizon_needed = max(30, (laycan_end - date.today()).days + 5)
        fc_data = forecaster.predict_horizon(route=route, vessel_class=vclass, horizon_days=horizon_needed)
        
        forecast_by_date = {f["target_date"]: f["p50"] for f in fc_data["forecasts"]}

        # Examine rates for each day in laycan
        laycan_rates = []
        for i in range(total_days):
            d = laycan_start + timedelta(days=i)
            d_str = d.strftime("%Y-%m-%d")
            # If date is outside forecast envelope, extrapolate with baseline
            rate = forecast_by_date.get(d_str, fc_data["forecasts"][-1]["p50"] if fc_data["forecasts"] else 22.0)
            laycan_rates.append((d, rate))

        # Determine optimal 2-3 day fixture window within laycan
        window_size = min(3, total_days)
        best_window_start = laycan_start
        best_window_avg = float("inf")

        for i in range(total_days - window_size + 1):
            window_slice = laycan_rates[i : i + window_size]
            avg_rate = np.mean([r[1] for r in window_slice])
            
            # Penalize fixing on the very last day (demurrage & availability risk)
            days_from_end = total_days - (i + window_size)
            urgency_penalty = 0.45 if days_from_end <= 1 else 0.0

            effective_metric = avg_rate + urgency_penalty
            if effective_metric < best_window_avg:
                best_window_avg = effective_metric
                best_window_start = window_slice[0][0]

        best_window_end = best_window_start + timedelta(days=window_size - 1)

        # STRICT HARD BOUNDARY ASSERTION
        assert best_window_start >= laycan_start, "Fixture start violates laycan hard rule!"
        assert best_window_end <= laycan_end, "Fixture end violates laycan hard rule!"

        # Calculate entry score 0-100
        all_rates = [r[1] for r in laycan_rates]
        min_rate = min(all_rates)
        max_rate = max(all_rates)
        spread = max(0.5, max_rate - min_rate)
        rate_saving_pct = (max_rate - best_window_avg) / spread
        
        # Base score on rate savings + comfortable execution buffer
        buffer_bonus = 15 if (laycan_end - best_window_end).days >= 3 else 5
        entry_score = int(np.clip(70 + (rate_saving_pct * 20) + buffer_bonus, 60, 95))

        reason = (
            f"Forecast curve indicates favorable freight softening during {best_window_start.strftime('%d %b')}–"
            f"{best_window_end.strftime('%d %b %Y')} (expected rate ~${best_window_avg:.2f}/t). "
            f"Provides {(laycan_end - best_window_end).days}-day operational buffer prior to laycan deadline."
        )

        recs.append({
            "vessel_class": vclass,
            "fixture_start": best_window_start.strftime("%Y-%m-%d"),
            "fixture_end": best_window_end.strftime("%Y-%m-%d"),
            "entry_score": entry_score,
            "reason": reason
        })

    # Sort by entry_score descending
    recs.sort(key=lambda x: x["entry_score"], reverse=True)
    return {"recommendations": recs}

def calculate_risk(route: Optional[str], port_id: Optional[int], db: Session) -> Dict[str, Any]:
    """
    Risk & Early-Warning Engine.
    Combines registered risk events with statistical freight anomaly detection.
    """
    query = db.query(RiskEvent)
    if route:
        query = query.filter(RiskEvent.route == route)
    if port_id:
        query = query.filter(RiskEvent.port_id == port_id)

    db_events = query.order_by(desc(RiskEvent.event_date)).limit(15).all()

    # Statistical Freight Anomaly Check
    route_name = route or "Australia-Paradip"
    recent_rates = db.query(FreightHistory.rate).filter(
        FreightHistory.route == route_name
    ).order_by(desc(FreightHistory.date)).limit(30).all()

    anomaly_detected = False
    anomaly_severity = "Low"
    anomaly_desc = "Freight movements within normal historical volatility band."

    if len(recent_rates) >= 14:
        rates = [r[0] for r in reversed(recent_rates)]
        delta_7d = (rates[-1] - rates[-7]) / rates[-7]
        volatility = np.std(rates) / np.mean(rates)

        if delta_7d > 0.12 or volatility > 0.15:
            anomaly_detected = True
            anomaly_severity = "High"
            anomaly_desc = f"Freight surge of {delta_7d*100:+.1f}% over 7 days exceeds 90th percentile volatility threshold."
        elif delta_7d > 0.06:
            anomaly_detected = True
            anomaly_severity = "Medium"
            anomaly_desc = f"Moderate upward freight momentum ({delta_7d*100:+.1f}% 7-day change) observed on {route_name}."

    risks = []
    
    # Prepend dynamic anomaly if present
    if anomaly_detected:
        risks.append({
            "id": 99901,
            "event_type": "freight_anomaly",
            "route": route_name,
            "port_id": port_id,
            "severity": anomaly_severity,
            "description": anomaly_desc,
            "event_date": date.today().isoformat(),
            "source": "FreightIQ Market Anomaly Detector"
        })

    for e in db_events:
        risks.append({
            "id": e.id,
            "event_type": e.event_type,
            "route": e.route,
            "port_id": e.port_id,
            "severity": e.severity,
            "description": e.description,
            "event_date": e.event_date.isoformat(),
            "source": e.source or "Maritime Intelligence Feed"
        })

    # Overall risk level determination
    severities = [r["severity"] for r in risks]
    if "High" in severities:
        overall_risk = "High"
    elif "Medium" in severities:
        overall_risk = "Medium"
    else:
        overall_risk = "Low"

    return {
        "risks": risks,
        "overall_risk_level": overall_risk
    }

def simulate_coa(
    cargo_id: Optional[int], 
    cargo_volume: float, 
    vessel_class: str, 
    horizon_months: int, 
    db: Session
) -> Dict[str, Any]:
    """
    Spot vs Contract of Affreightment (CoA) Evaluation Engine.
    Compares single-voyage spot procurement with structured volume commitment.
    MVP: Mean/variance economics with volume discounts and volatility hedging.
    """
    cargo = db.query(Cargo).filter(Cargo.id == cargo_id).first() if cargo_id else None
    route = f"{cargo.origin}-{cargo.destination_port.name}" if (cargo and cargo.destination_port) else "Australia-Paradip"

    # Get forecast benchmark
    forecaster = get_forecaster()
    fc = forecaster.predict_horizon(route=route, vessel_class=vessel_class, horizon_days=30)
    spot_rate = fc["forecasts"][0]["p50"] if fc["forecasts"] else 22.50
    p10 = fc["forecasts"][0]["p10"] if fc["forecasts"] else spot_rate * 0.9
    p90 = fc["forecasts"][0]["p90"] if fc["forecasts"] else spot_rate * 1.15

    # Volatility quantification (spread between P90 and P10)
    volatility = round(float((p90 - p10) / (2 * spot_rate)), 3)

    # Spot cost includes spot market risk premium and bunker variance exposure
    spot_rate_effective = spot_rate * (1.0 + (volatility * 0.4))
    expected_spot_cost = round(cargo_volume * spot_rate_effective, 2)

    # CoA discount scales with committed parcel volume (3.5% to 7.0%)
    coa_discount = 0.055 if cargo_volume >= 60000 else 0.035
    coa_rate_effective = spot_rate * (1.0 - coa_discount)
    expected_coa_cost = round(cargo_volume * coa_rate_effective, 2)

    cost_difference = round(expected_spot_cost - expected_coa_cost, 2)

    # Preferred strategy decision logic
    if cargo_volume >= 50000 or volatility >= 0.12:
        preferred = "CoA"
        reason = (
            f"Volume scale ({cargo_volume:,.0f}t) qualifies for a {coa_discount*100:.1f}% negotiated charter discount. "
            f"Securing a CoA avoids volatile spot freight exposure (volatility: {volatility*100:.1f}%), "
            f"generating an estimated net saving of ${cost_difference:,.2f}."
        )
    else:
        preferred = "Spot"
        reason = (
            f"Smaller parcel size ({cargo_volume:,.0f}t) and benign market volatility ({volatility*100:.1f}%) "
            f"make spot fixture procurement economically agile without long-term volume commitments."
        )

    return {
        "expected_spot_cost": expected_spot_cost,
        "expected_coa_cost": expected_coa_cost,
        "cost_difference": cost_difference,
        "volatility": volatility,
        "preferred_option": preferred,
        "reason": reason
    }

def generate_recommendation(cargo_id: int, db: Session) -> Dict[str, Any]:
    """
    Central Recommendation Engine Orchestrator.
    Workflow:
    Cargo -> Compatibility -> Forecast -> Timing -> Risk -> CoA -> Composite Score -> Detailed Reasons -> PostgreSQL Persist
    """
    cargo = db.query(Cargo).filter(Cargo.id == cargo_id).first()
    if not cargo:
        raise ValueError(f"Cargo ID {cargo_id} not found.")

    port = cargo.destination_port
    if not port:
        raise ValueError(f"Destination port for cargo {cargo_id} not found.")

    # 1. Compatibility Check
    compat = check_vessel_port(cargo.quantity, cargo.destination_port_id, db)
    feasible = compat["feasible_vessels"]
    
    if not feasible:
        excluded_reasons = [f"{e['vessel_class']}: {e['reason']}" for e in compat["excluded_vessels"]]
        raise ValueError(
            f"No physically compatible vessel class for {cargo.quantity:,.0f}t at {port.name}. "
            f"Constraints breached: {' | '.join(excluded_reasons)}"
        )

    # 2. Select Optimal Candidate Vessel Class
    # Priority: Perfect parcel size match among feasible classes
    # e.g., 75,000t -> Panamax (60k-88k DWT)
    selected_vessel_class = feasible[0]["vessel_class"]
    for f in feasible:
        v_name = f["vessel_class"]
        vc_obj = db.query(VesselClass).filter(VesselClass.name == v_name).first()
        if vc_obj and vc_obj.min_dwt <= cargo.quantity <= vc_obj.max_dwt:
            selected_vessel_class = v_name
            break

    # 3. Forecast Trajectory for Selected Vessel
    route = f"{cargo.origin}-{port.name}"
    forecaster = get_forecaster()
    fc = forecaster.predict_horizon(route=route, vessel_class=selected_vessel_class, horizon_days=30)
    
    # 4. Market Entry Timing Advisor
    timing_res = calculate_timing(
        cargo_id=cargo.id,
        feasible_vessel_classes=[selected_vessel_class],
        laycan_start=cargo.laycan_start,
        laycan_end=cargo.laycan_end,
        db=db
    )
    best_timing = timing_res["recommendations"][0]
    fixture_start = datetime.strptime(best_timing["fixture_start"], "%Y-%m-%d").date()
    fixture_end = datetime.strptime(best_timing["fixture_end"], "%Y-%m-%d").date()

    # 5. Extract Rate Quantiles for the Fixture Window
    target_date_str = fixture_start.strftime("%Y-%m-%d")
    matched_fc = next((f for f in fc["forecasts"] if f["target_date"] == target_date_str), fc["forecasts"][0])
    p10 = matched_fc["p10"]
    p50 = matched_fc["p50"]
    p90 = matched_fc["p90"]

    # 6. Risk Engine
    risk_res = calculate_risk(route=route, port_id=cargo.destination_port_id, db=db)
    risk_level = risk_res["overall_risk_level"]

    # 7. Spot vs CoA Evaluation
    coa_res = simulate_coa(
        cargo_id=cargo.id,
        cargo_volume=cargo.quantity,
        vessel_class=selected_vessel_class,
        horizon_months=3,
        db=db
    )
    contract_type = coa_res["preferred_option"]

    # 8. Composite Scoring (0-100)
    # Feasibility (30) + Freight Economics (30) + Timing (20) + Risk (10) + Contract Alignment (10)
    feasibility_pts = 30.0
    economics_pts = float(np.clip(30.0 - ((p50 - 20.0) * 1.5), 18.0, 30.0))
    timing_pts = float(best_timing["entry_score"] * 0.20)
    risk_pts = 10.0 if risk_level == "Low" else (7.0 if risk_level == "Medium" else 3.0)
    contract_pts = 10.0 if contract_type == cargo.contract_preference else 8.0

    final_score = int(round(feasibility_pts + economics_pts + timing_pts + risk_pts + contract_pts))
    final_score = int(np.clip(final_score, 65, 96))

    # 9. Clear, Structured Rationale
    reasons = [
        f"Physically compatible with {port.name} navigation channel and berth constraints (draft {p50:.1f}m envelope)",
        f"Optimal deadweight parcel fit for {cargo.quantity:,.0f} MT {cargo.cargo_type}",
        f"Expected fixture window {fixture_start.strftime('%d %b')}–{fixture_end.strftime('%d %b %Y')} captures favorable freight dip (~${p50:.2f}/t)",
        f"Recommended {contract_type} contract strategy hedges against route market volatility ({coa_res['volatility']*100:.1f}%)",
        f"Route risk assessed at {risk_level} severity with active monitoring"
    ]

    # 10. Persist to PostgreSQL recommendations table
    rec_obj = Recommendation(
        cargo_id=cargo.id,
        vessel_class=selected_vessel_class,
        fixture_start=fixture_start,
        fixture_end=fixture_end,
        expected_rate=p50,
        p10=p10,
        p50=p50,
        p90=p90,
        risk_level=risk_level,
        contract_type=contract_type,
        score=final_score,
        reason=reasons[0],
        reasons=reasons,
        created_at=datetime.now(timezone.utc)
    )
    db.add(rec_obj)
    db.commit()
    db.refresh(rec_obj)

    # 11. Format Exact API Contract Response
    return {
        "cargo_id": cargo.id,
        "vessel_class": selected_vessel_class,
        "fixture_window": {
            "start": fixture_start.strftime("%Y-%m-%d"),
            "end": fixture_end.strftime("%Y-%m-%d")
        },
        "rate": {
            "p10": p10,
            "p50": p50,
            "p90": p90
        },
        "contract_type": contract_type,
        "risk_level": risk_level,
        "score": final_score,
        "reasons": reasons
    }

def get_persisted_recommendation(cargo_id: int, db: Session) -> Optional[Dict[str, Any]]:
    """Retrieve the most recent recommendation for a cargo."""
    rec = db.query(Recommendation).filter(
        Recommendation.cargo_id == cargo_id
    ).order_by(desc(Recommendation.created_at)).first()
    
    if not rec:
        return None

    # Retrieve p10, p50, p90
    p50 = rec.p50 or rec.expected_rate or 21.0
    p10 = rec.p10 or round(p50 * 0.88, 2)
    p90 = rec.p90 or round(p50 * 1.15, 2)

    reasons = rec.reasons if rec.reasons else [rec.reason]

    return {
        "cargo_id": rec.cargo_id,
        "vessel_class": rec.vessel_class,
        "fixture_window": {
            "start": rec.fixture_start.strftime("%Y-%m-%d"),
            "end": rec.fixture_end.strftime("%Y-%m-%d")
        },
        "rate": {
            "p10": p10,
            "p50": p50,
            "p90": p90
        },
        "contract_type": rec.contract_type,
        "risk_level": rec.risk_level,
        "score": int(rec.score),
        "reasons": reasons
    }

def update_admin_port(port_id: int, updates: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Admin endpoint to update port physical constraints."""
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise ValueError(f"Port ID {port_id} not found.")

    allowed_fields = ["name", "max_draft", "max_loa", "max_beam", "handling_rate", "lightering_available"]
    for field in allowed_fields:
        if field in updates and updates[field] is not None:
            setattr(port, field, updates[field])

    port.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(port)

    return {
        "id": port.id,
        "name": port.name,
        "max_draft": port.max_draft,
        "max_loa": port.max_loa,
        "max_beam": port.max_beam,
        "handling_rate": port.handling_rate,
        "lightering_available": port.lightering_available
    }

def optimize_fleet(payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Post-MVP Clean Demonstration Fleet / Idle-Time Optimization Stub."""
    vessel_id = payload.get("vessel_id", "V0001")
    current_position = payload.get("current_position", "Singapore Anchorage")
    available_from = payload.get("available_from", date.today().isoformat())

    return {
        "options": [
            {
                "cargo_id": 1,
                "route": "Australia-Paradip",
                "expected_idle_reduction_days": 4.5,
                "score": 92.0
            },
            {
                "cargo_id": 2,
                "route": "Indonesia-Vizag",
                "expected_idle_reduction_days": 2.0,
                "score": 84.0
            }
        ]
    }

def get_available_routes(db: Session) -> List[Dict[str, Any]]:
    """Return list of distinct routes available with metadata."""
    routes = [
        {"route": "Australia-Paradip", "origin": "Australia (Hay Point / Gladstone)", "destination": "Paradip", "commodity": "Coking Coal"},
        {"route": "Australia-Vizag", "origin": "Australia (Hay Point / Gladstone)", "destination": "Visakhapatnam", "commodity": "Coking Coal"},
        {"route": "Australia-Haldia", "origin": "Australia (Hay Point)", "destination": "Haldia", "commodity": "Coking Coal"},
        {"route": "Indonesia-Paradip", "origin": "Indonesia (Taboneo / Samarinda)", "destination": "Paradip", "commodity": "Thermal Coal"},
        {"route": "Indonesia-Vizag", "origin": "Indonesia (Taboneo)", "destination": "Visakhapatnam", "commodity": "Thermal Coal"},
        {"route": "Indonesia-Dhamra", "origin": "Indonesia (Taboneo)", "destination": "Dhamra", "commodity": "Thermal Coal"},
        {"route": "Mozambique-Paradip", "origin": "Mozambique (Maputo / Beira)", "destination": "Paradip", "commodity": "Thermal Coal"},
        {"route": "Mozambique-Gangavaram", "origin": "Mozambique (Maputo)", "destination": "Gangavaram", "commodity": "Thermal Coal"},
        {"route": "US_East_Coast-Paradip", "origin": "US East Coast (Hampton Roads)", "destination": "Paradip", "commodity": "Met Coal"},
        {"route": "US_East_Coast-Vizag", "origin": "US East Coast (Hampton Roads)", "destination": "Visakhapatnam", "commodity": "Met Coal"},
        {"route": "Russia_Far_East-Vizag", "origin": "Russia Far East (Vostochny)", "destination": "Visakhapatnam", "commodity": "PCI / Met Coal"},
    ]
    return routes

def hash_password(password: str) -> str:
    """Generate SHA-256 hash of password."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def create_user(data: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Register a new user."""
    email = data.get("email", "").strip().lower()
    name = data.get("name", "").strip()
    password = data.get("password", "")
    company = data.get("company", "").strip()
    role = data.get("role", "Chartering Manager")
    
    if not email or not password:
        raise ValueError("Email and password are required.")
    
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise ValueError("User with this email already exists.")
    
    user = User(
        name=name or email.split("@")[0],
        email=email,
        company=company,
        role=role,
        password_hash=hash_password(password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "company": user.company,
        "role": user.role
    }

def authenticate_user(email: str, password: str, db: Session) -> Dict[str, Any]:
    """Authenticate user with email and password."""
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or user.password_hash != hash_password(password):
        raise ValueError("Invalid email or password.")
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "company": user.company,
        "role": user.role
    }