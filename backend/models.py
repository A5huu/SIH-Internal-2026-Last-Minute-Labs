"""
FreightIQ Database Models
Strictly adheres to api-contract.md and includes operational support entities.
"""

from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey, JSON
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Port(Base):
    __tablename__ = "ports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, unique=True)
    max_draft = Column(Float, nullable=False)
    max_loa = Column(Float, nullable=False)
    max_beam = Column(Float, nullable=False)
    handling_rate = Column(Integer, nullable=False)
    lightering_available = Column(Boolean, nullable=False, default=False)
    country = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    port_type = Column(String(50), nullable=True)
    congestion_index = Column(Float, nullable=True)
    turnaround_time = Column(Float, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cargos = relationship("Cargo", back_populates="destination_port")
    risk_events = relationship("RiskEvent", back_populates="port")

class VesselClass(Base):
    __tablename__ = "vessel_classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(30), nullable=False, unique=True)
    min_dwt = Column(Float, nullable=False)
    max_dwt = Column(Float, nullable=False)
    typical_draft = Column(Float, nullable=False)
    typical_loa = Column(Float, nullable=False)
    typical_beam = Column(Float, nullable=False)

class Cargo(Base):
    __tablename__ = "cargo"

    id = Column(Integer, primary_key=True, index=True)
    cargo_type = Column(String(100), nullable=False)
    quantity = Column(Float, nullable=False)
    origin = Column(String(100), nullable=False)
    destination_port_id = Column(Integer, ForeignKey("ports.id"), nullable=False, index=True)
    laycan_start = Column(Date, nullable=False)
    laycan_end = Column(Date, nullable=False)
    contract_preference = Column(String(20), nullable=False)  # Spot | CoA
    status = Column(String(50), nullable=False, default="PENDING")  # PENDING | RECOMMENDED | APPROVED | SENT_TO_CHARTERING | FIXED | COMPLETED
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    destination_port = relationship("Port", back_populates="cargos")
    recommendations = relationship("Recommendation", back_populates="cargo")
    fixtures = relationship("Fixture", back_populates="cargo")

class FreightHistory(Base):
    __tablename__ = "freight_history"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    route = Column(String(200), nullable=False, index=True)
    vessel_class = Column(String(30), nullable=False, index=True)
    rate = Column(Float, nullable=False)
    bdi = Column(Float, nullable=True)
    bci = Column(Float, nullable=True)
    bpi = Column(Float, nullable=True)
    bsi = Column(Float, nullable=True)
    bunker_price = Column(Float, nullable=True)
    coal_price = Column(Float, nullable=True)
    usd_index = Column(Float, nullable=True)

class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True, index=True)
    forecast_date = Column(Date, nullable=False, index=True)
    target_date = Column(Date, nullable=False, index=True)
    route = Column(String(200), nullable=False, index=True)
    vessel_class = Column(String(30), nullable=False, index=True)
    p10 = Column(Float, nullable=False)
    p50 = Column(Float, nullable=False)
    p90 = Column(Float, nullable=False)
    model_version = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

class RiskEvent(Base):
    __tablename__ = "risk_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)  # freight_anomaly, port_congestion, weather, geopolitical
    route = Column(String(200), nullable=True, index=True)
    port_id = Column(Integer, ForeignKey("ports.id"), nullable=True, index=True)
    severity = Column(String(20), nullable=False)    # Low, Medium, High
    description = Column(Text, nullable=False)
    event_date = Column(Date, nullable=False, index=True)
    source = Column(String(200), nullable=True)

    # Relationships
    port = relationship("Port", back_populates="risk_events")

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargo.id"), nullable=False, index=True)
    vessel_class = Column(String(30), nullable=False)
    fixture_start = Column(Date, nullable=False)
    fixture_end = Column(Date, nullable=False)
    expected_rate = Column(Float, nullable=True)  # P50 rate
    p10 = Column(Float, nullable=True)
    p50 = Column(Float, nullable=True)
    p90 = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=False)  # Low | Medium | High
    contract_type = Column(String(20), nullable=False)  # Spot | CoA
    score = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    reasons = Column(JSON, nullable=True)
    status = Column(String(50), nullable=False, default="RECOMMENDED")  # RECOMMENDED | APPROVED | REJECTED | SENT_TO_CHARTERING
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    cargo = relationship("Cargo", back_populates="recommendations")

class Vessel(Base):
    __tablename__ = "vessels"

    id = Column(String(30), primary_key=True, index=True)  # V0001
    name = Column(String(150), nullable=False)
    vessel_class = Column(String(50), nullable=False, index=True)  # Handysize, Supramax, Panamax, Capesize
    dwt = Column(Float, nullable=False)
    draft = Column(Float, nullable=False)
    loa = Column(Float, nullable=False)
    beam = Column(Float, nullable=False)
    current_port_id = Column(Integer, ForeignKey("ports.id"), nullable=True)
    current_location = Column(String(150), nullable=True)
    operational_status = Column(String(50), nullable=False, default="AVAILABLE", index=True)  # AVAILABLE | NOMINATED | FIXED | ON BALLAST | LOADING | IN TRANSIT | DISCHARGING | COMPLETED
    availability_date = Column(Date, nullable=True)
    owner_operator = Column(String(150), nullable=True)
    fuel_consumption = Column(Float, nullable=True)
    cruising_speed = Column(Float, nullable=True)
    reliability_score = Column(Float, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    fixtures = relationship("Fixture", back_populates="vessel")
    voyages = relationship("Voyage", back_populates="vessel")

class Fixture(Base):
    __tablename__ = "fixtures"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cargo_id = Column(Integer, ForeignKey("cargo.id"), nullable=False, index=True)
    vessel_id = Column(String(30), ForeignKey("vessels.id"), nullable=False, index=True)
    fixture_date = Column(Date, nullable=False)
    agreed_rate = Column(Float, nullable=False)
    status = Column(String(30), nullable=False, default="FIXED")  # NOMINATED | FIXED | CANCELLED
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    cargo = relationship("Cargo", back_populates="fixtures")
    vessel = relationship("Vessel", back_populates="fixtures")
    voyages = relationship("Voyage", back_populates="fixture")

class Voyage(Base):
    __tablename__ = "voyages"

    id = Column(String(50), primary_key=True, index=True)  # VOY_000001
    fixture_id = Column(Integer, ForeignKey("fixtures.id"), nullable=True, index=True)
    vessel_id = Column(String(30), ForeignKey("vessels.id"), nullable=False, index=True)
    cargo_id = Column(Integer, ForeignKey("cargo.id"), nullable=True, index=True)
    origin_port = Column(String(100), nullable=False)
    destination_port = Column(String(100), nullable=False)
    planned_departure = Column(DateTime(timezone=True), nullable=True)
    actual_departure = Column(DateTime(timezone=True), nullable=True)
    planned_arrival = Column(DateTime(timezone=True), nullable=True)
    actual_arrival = Column(DateTime(timezone=True), nullable=True)
    eta = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), nullable=False, default="FIXTURE", index=True)  # FIXTURE | NOMINATION | BALLAST | ARRIVAL | LOADING | DEPARTURE | TRANSIT | DISCHARGE | COMPLETED
    distance_nm = Column(Float, nullable=True)
    fuel_estimate = Column(Float, nullable=True)
    ballast_distance = Column(Float, nullable=True)
    delay_hours = Column(Float, default=0.0)
    delay_reason = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    vessel = relationship("Vessel", back_populates="voyages")
    fixture = relationship("Fixture", back_populates="voyages")
    cargo = relationship("Cargo")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False, unique=True, index=True)
    company = Column(String(150), nullable=True)
    role = Column(String(50), nullable=True, default="Chartering Manager")
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

