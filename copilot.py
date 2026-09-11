from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models import Cargo, Vessel
from backend.logic import (
    check_vessel_port,
    generate_recommendation,
)


ACTIVE_VESSEL_STATUSES = [
    "AVAILABLE",
    "AT ANCHOR",
    "UNDERWAY",
    "ON BALLAST",
]


def find_matching_vessels(
    cargo: Cargo,
    db: Session,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Vessel screening layer.

    This checks physical port compatibility and operational
    suitability. The main FreightIQ recommendation engine remains
    the final commercial decision authority.
    """

    port = cargo.destination_port

    if not port:
        raise ValueError("Cargo destination port not found.")

    compatibility = check_vessel_port(
        cargo_quantity=cargo.quantity,
        destination_port_id=cargo.destination_port_id,
        db=db,
    )

    feasible_classes = set()

    for item in compatibility.get("feasible_vessels", []):
        if not isinstance(item, dict):
            continue

        vessel_class = (
            item.get("vessel_class")
            or item.get("name")
            or item.get("class")
        )

        if vessel_class:
            feasible_classes.add(str(vessel_class))

    if not feasible_classes:
        return []

    vessels = (
        db.query(Vessel)
        .filter(
            Vessel.vessel_class.in_(list(feasible_classes)),
            Vessel.operational_status.in_(ACTIVE_VESSEL_STATUSES),
        )
        .all()
    )

    candidates: List[Dict[str, Any]] = []

    for vessel in vessels:
        if vessel.dwt is None or vessel.dwt < cargo.quantity:
            continue

        score = 0.0
        reasons: List[str] = []

        # Capacity
        score += 30
        reasons.append("DWT is sufficient for the cargo.")

        # Draft
        if vessel.draft is not None:
            if vessel.draft > port.max_draft:
                continue

            score += 15
            reasons.append(
                "Draft is compatible with destination port."
            )

        # LOA
        if vessel.loa is not None:
            if vessel.loa > port.max_loa:
                continue

            score += 10
            reasons.append(
                "LOA is compatible with destination port."
            )

        # Beam
        if vessel.beam is not None:
            if vessel.beam > port.max_beam:
                continue

            score += 10
            reasons.append(
                "Beam is compatible with destination port."
            )

        # Reliability
        reliability = vessel.reliability_score
        if reliability is None:
            reliability = 0.70

        score += float(reliability) * 15

        if reliability >= 0.85:
            reasons.append("High reliability score.")
        elif reliability >= 0.75:
            reasons.append("Good reliability score.")

        # Availability
        if vessel.availability_date:
            if vessel.availability_date <= cargo.laycan_end:
                score += 10

                if vessel.availability_date < cargo.laycan_start:
                    reasons.append(
                        "Vessel is available before the cargo laycan."
                    )
                else:
                    reasons.append(
                        "Vessel becomes available during the cargo laycan."
                    )
            else:
                score -= 10
                reasons.append(
                    "Availability is after the cargo laycan."
                )
        else:
            score += 5
            reasons.append(
                "No fixed availability date is recorded."
            )

        # Speed
        if vessel.cruising_speed:
            speed_score = min(
                float(vessel.cruising_speed) / 15.0 * 10,
                10,
            )
            score += speed_score

            if vessel.cruising_speed >= 13:
                reasons.append(
                    "Good cruising speed for voyage execution."
                )

        candidates.append(
            {
                "vessel_id": vessel.id,
                "vessel_name": vessel.name,
                "vessel_class": vessel.vessel_class,
                "dwt": vessel.dwt,
                "draft": vessel.draft,
                "loa": vessel.loa,
                "beam": vessel.beam,
                "availability_date": (
                    vessel.availability_date.isoformat()
                    if vessel.availability_date
                    else None
                ),
                "cruising_speed": vessel.cruising_speed,
                "reliability_score": reliability,
                "operational_status": vessel.operational_status,
                "score": round(max(0, min(score, 100)), 2),
                "reasons": reasons,
            }
        )

    candidates.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    return candidates[:limit]


def _extract_recommendation_vessel(
    recommendation: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return the vessel selected by the core FreightIQ engine."""

    vessel = recommendation.get("recommended_vessel")

    if isinstance(vessel, dict):
        return dict(vessel)

    return None


def _merge_vessel_details(
    engine_vessel: Dict[str, Any],
    screened_vessel: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Merge the core recommendation with vessel-screening details.

    The core engine fields take precedence for the final decision.
    Screening information is retained as supporting evidence.
    """

    merged = dict(screened_vessel or {})
    merged.update(engine_vessel)

    if screened_vessel:
        merged["copilot_match_score"] = screened_vessel.get("score")
        merged["copilot_match_reasons"] = screened_vessel.get(
            "reasons",
            [],
        )

    if engine_vessel.get("score") is not None:
        merged["recommendation_score"] = engine_vessel["score"]

    return merged


def _build_final_vessel_list(
    recommendation: Dict[str, Any],
    screened_vessels: List[Dict[str, Any]],
    winner: Optional[Dict[str, Any]],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Build one consistent vessel list.

    The order from generate_recommendation() is authoritative.
    The independent Copilot screening score is retained as
    'copilot_match_score' rather than replacing the final score.
    """

    screened_by_id = {
        str(vessel.get("vessel_id")): vessel
        for vessel in screened_vessels
    }

    engine_vessels = recommendation.get("top_vessels") or []

    final: List[Dict[str, Any]] = []
    seen = set()

    # Core engine's ranking first.
    for engine_vessel in engine_vessels:
        if not isinstance(engine_vessel, dict):
            continue

        vessel_id = engine_vessel.get("vessel_id")
        key = str(vessel_id)

        if vessel_id is None or key in seen:
            continue

        screened = screened_by_id.get(key)
        final.append(
            _merge_vessel_details(
                engine_vessel,
                screened,
            )
        )
        seen.add(key)

        if len(final) >= limit:
            break

    # Make absolutely sure the final winner appears first.
    if winner:
        winner_id = winner.get("vessel_id")
        winner_key = str(winner_id)

        winner_match = next(
            (
                item
                for item in final
                if str(item.get("vessel_id")) == winner_key
            ),
            None,
        )

        if winner_match is None:
            winner_match = _merge_vessel_details(
                winner,
                screened_by_id.get(winner_key),
            )

        final = [
            winner_match,
            *[
                item
                for item in final
                if str(item.get("vessel_id")) != winner_key
            ],
        ]

        seen = {
            str(item.get("vessel_id"))
            for item in final
        }

    # Fill remaining slots from the independent screening layer.
    for screened in screened_vessels:
        key = str(screened.get("vessel_id"))

        if key in seen:
            continue

        final.append(screened)
        seen.add(key)

        if len(final) >= limit:
            break

    return final[:limit]


def _build_risk_mitigation(
    risk_level: Any,
) -> Dict[str, Any]:
    """
    Convert the model's route risk into an actionable
    chartering decision and mitigation plan.
    """

    level = str(risk_level or "Medium").strip().title()

    if level == "High":
        return {
            "level": "High",
            "severity": "HIGH",
            "decision": "PROCEED WITH CAUTION",
            "summary": (
                "Elevated operational or market risk detected. "
                "Fixture should proceed only with appropriate "
                "risk controls and human approval."
            ),
            "mitigation_actions": [
                {
                    "priority": "CRITICAL",
                    "action": (
                        "Obtain human approval before final vessel fixture."
                    ),
                    "reason": (
                        "Current route risk is HIGH."
                    ),
                },
                {
                    "priority": "HIGH",
                    "action": (
                        "Monitor weather conditions and route disruptions."
                    ),
                    "reason": (
                        "Adverse conditions can increase voyage delay "
                        "and operational exposure."
                    ),
                },
                {
                    "priority": "HIGH",
                    "action": (
                        "Monitor destination-port congestion."
                    ),
                    "reason": (
                        "Congestion can increase turnaround time "
                        "and total logistics cost."
                    ),
                },
                {
                    "priority": "MEDIUM",
                    "action": (
                        "Keep an alternative compatible vessel on standby."
                    ),
                    "reason": (
                        "A backup protects against vessel unavailability "
                        "or late operational changes."
                    ),
                },
                {
                    "priority": "MEDIUM",
                    "action": (
                        "Recheck the freight market before final fixture."
                    ),
                    "reason": (
                        "Freight conditions can change before the fixture."
                    ),
                },
            ],
        }

    if level == "Low":
        return {
            "level": "Low",
            "severity": "LOW",
            "decision": "PROCEED",
            "summary": (
                "Current route signals are relatively stable. "
                "Standard operational monitoring is recommended."
            ),
            "mitigation_actions": [
                {
                    "priority": "LOW",
                    "action": (
                        "Continue standard voyage monitoring."
                    ),
                    "reason": (
                        "Current route risk is relatively low."
                    ),
                },
                {
                    "priority": "LOW",
                    "action": (
                        "Confirm vessel availability before fixture."
                    ),
                    "reason": (
                        "Availability can change before the laycan."
                    ),
                },
            ],
        }

    return {
        "level": "Medium",
        "severity": "MEDIUM",
        "decision": "PROCEED WITH MONITORING",
        "summary": (
            "Moderate risk signals detected. Continue monitoring "
            "market and operational conditions before fixture."
        ),
        "mitigation_actions": [
            {
                "priority": "HIGH",
                "action": (
                    "Continue monitoring weather and port congestion."
                ),
                "reason": (
                    "Moderate risk conditions can change before fixture."
                ),
            },
            {
                "priority": "MEDIUM",
                "action": (
                    "Keep one compatible backup vessel available."
                ),
                "reason": (
                    "Provides operational flexibility if conditions change."
                ),
            },
            {
                "priority": "MEDIUM",
                "action": (
                    "Review the latest freight rate before fixture."
                ),
                "reason": (
                    "Market conditions can change before the fixture."
                ),
            },
        ],
    }


def run_chartering_copilot(
    cargo_id: int,
    db: Session,
) -> Dict[str, Any]:
    """
    Main AI Chartering Copilot.

    Natural language request
        -> cargo requirement
        -> port feasibility
        -> vessel screening
        -> freight forecast
        -> risk analysis
        -> contract strategy
        -> ONE FINAL RECOMMENDATION
        -> risk mitigation plan
    """

    cargo = (
        db.query(Cargo)
        .filter(Cargo.id == cargo_id)
        .first()
    )

    if not cargo:
        raise ValueError(
            f"Cargo ID {cargo_id} not found."
        )

    if not cargo.destination_port:
        raise ValueError(
            "Cargo destination port not found."
        )

    # Independent physical/operational screening.
    screened_vessels = find_matching_vessels(
        cargo=cargo,
        db=db,
        limit=5,
    )

    # Main FreightIQ engine is the authoritative decision layer.
    recommendation = generate_recommendation(
        cargo_id=cargo_id,
        db=db,
    )

    if not recommendation:
        raise ValueError(
            "FreightIQ recommendation engine returned no result."
        )

    engine_winner = _extract_recommendation_vessel(
        recommendation
    )

    # If the core engine has no vessel, use the screened fallback.
    winner = engine_winner

    if winner is None and screened_vessels:
        winner = dict(screened_vessels[0])

    # Merge screening evidence into the ONE final winner.
    if winner:
        winner_id = winner.get("vessel_id")

        screened_match = next(
            (
                item
                for item in screened_vessels
                if str(item.get("vessel_id"))
                == str(winner_id)
            ),
            None,
        )

        winner = _merge_vessel_details(
            winner,
            screened_match,
        )

    # Consistent alternatives list.
    final_vessels = _build_final_vessel_list(
        recommendation=recommendation,
        screened_vessels=screened_vessels,
        winner=winner,
        limit=5,
    )

    # ---------------------------------------------------------
    # Commercial values
    # ---------------------------------------------------------

    rate_data = recommendation.get("rate") or {}

    p10_rate = rate_data.get("p10")
    p50_rate = rate_data.get("p50")
    p90_rate = rate_data.get("p90")

    vessel_class = (
        recommendation.get("vessel_class")
        or (winner or {}).get("vessel_class")
        or "Bulk Carrier"
    )

    risk_level = (
        recommendation.get("risk_level")
        or recommendation.get("overall_risk_level")
        or "Medium"
    )

    contract_type = (
        recommendation.get("contract_type")
        or cargo.contract_preference
        or "Spot"
    )

    risk_assessment = _build_risk_mitigation(
        risk_level
    )

    # ---------------------------------------------------------
    # Explainable decision
    # ---------------------------------------------------------

    explanation: List[str] = []

    if winner:
        winner_name = winner.get(
            "vessel_name",
            "Selected vessel",
        )

        explanation.append(
            f"{winner_name} is the final recommended vessel "
            "selected by the FreightIQ decision engine."
        )

        explanation.append(
            f"Recommended vessel class: {vessel_class}."
        )

        if winner.get("dwt") is not None:
            explanation.append(
                f"DWT of {int(winner['dwt']):,} MT is suitable "
                f"for the {int(cargo.quantity):,} MT cargo."
            )

        port_max_draft = getattr(
            cargo.destination_port,
            "max_draft",
            None,
        )

        if (
            winner.get("draft") is not None
            and port_max_draft is not None
        ):
            explanation.append(
                f"Draft of {float(winner['draft']):.2f}m "
                f"is within the port limit of "
                f"{float(port_max_draft):.2f}m."
            )

        if winner.get("reliability_score") is not None:
            explanation.append(
                f"Reliability score is "
                f"{float(winner['reliability_score']):.3f}."
            )

        if winner.get("availability_status"):
            explanation.append(
                f"Availability status: "
                f"{winner['availability_status']}."
            )

    else:
        explanation.append(
            "No vessel passed the available compatibility "
            "and operational screening."
        )

    if p50_rate is not None:
        explanation.append(
            f"Expected P50 freight rate is "
            f"${float(p50_rate):.2f}/t."
        )

    explanation.append(
        f"Current route risk is {risk_assessment['level']}."
    )

    explanation.append(
        f"Contract strategy: {contract_type}."
    )

    if risk_assessment["severity"] == "HIGH":
        explanation.append(
            "Because route risk is HIGH, FreightIQ recommends "
            "proceeding only with risk controls and human approval."
        )
    elif risk_assessment["severity"] == "MEDIUM":
        explanation.append(
            "Because route risk is MEDIUM, FreightIQ recommends "
            "proceeding with active monitoring."
        )
    else:
        explanation.append(
            "Current route risk is LOW, so standard operational "
            "monitoring is sufficient."
        )

    # ---------------------------------------------------------
    # Final API object
    # ---------------------------------------------------------

    return {
        "cargo": {
            "id": cargo.id,
            "cargo_type": cargo.cargo_type,
            "quantity": cargo.quantity,
            "origin": cargo.origin,
            "destination": cargo.destination_port.name,
            "laycan_start": (
                cargo.laycan_start.isoformat()
                if cargo.laycan_start
                else None
            ),
            "laycan_end": (
                cargo.laycan_end.isoformat()
                if cargo.laycan_end
                else None
            ),
            "contract_preference": cargo.contract_preference,
        },

        # ONE final winner.
        "recommended_vessel": winner,

        # Consistent ranked alternatives.
        "top_vessels": final_vessels,

        # Preserve the complete core FreightIQ output.
        "freight_recommendation": recommendation,

        # New actionable risk layer.
        "risk_assessment": risk_assessment,

        # Human-readable explanation.
        "copilot_explanation": explanation,
    }
