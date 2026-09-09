"""
FreightIQ Database Engine & Session Management
Handles PostgreSQL connection, session lifecycle, migrations, and CSV seed loading.
"""

import os
import contextlib
from datetime import datetime
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/freightiq")

# Configure connection engine
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """FastAPI Dependency for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextlib.contextmanager
def get_db_session():
    """Context manager for standalone scripts or background workers."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def init_db(seed_data_dir: str = "data"):
    """
    Ensure all tables exist and are properly migrated.
    Loads initial data from CSV if tables are empty.
    """
    from backend.models import (
        Base, Port, VesselClass, Cargo, FreightHistory, Forecast, RiskEvent, 
        Recommendation, User, Vessel, Fixture, Voyage
    )
    
    # 1. Create tables
    Base.metadata.create_all(bind=engine)
    
    # 2. Add any missing columns to recommendations and cargo if pre-existing
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS p10 double precision;"))
            conn.execute(text("ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS p50 double precision;"))
            conn.execute(text("ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS p90 double precision;"))
            conn.execute(text("ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS reasons jsonb;"))
            conn.execute(text("ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'RECOMMENDED';"))
            conn.execute(text("ALTER TABLE cargo ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'PENDING';"))
            conn.commit()
        except Exception:
            pass # Non-postgres or already updated

    # 3. Check and load seed data if empty
    with get_db_session() as db:
        ports_count = db.query(Port).count()
        if ports_count == 0:
            print("Seeding ports from CSV...")
            ports_csv = os.path.join(seed_data_dir, "ports.csv")
            if os.path.exists(ports_csv):
                df_ports = pd.read_csv(ports_csv)
                for _, row in df_ports.iterrows():
                    p = Port(
                        id=int(row["id"]),
                        name=str(row["name"]),
                        max_draft=float(row["max_draft"]),
                        max_loa=float(row["max_loa"]),
                        max_beam=float(row["max_beam"]),
                        handling_rate=int(row["handling_rate"]),
                        lightering_available=bool(row["lightering_available"]),
                        country=str(row.get("country", "")),
                        latitude=float(row["latitude"]) if pd.notnull(row.get("latitude")) else None,
                        longitude=float(row["longitude"]) if pd.notnull(row.get("longitude")) else None,
                        port_type=str(row.get("port_type", "")),
                        congestion_index=float(row["congestion_index"]) if pd.notnull(row.get("congestion_index")) else None,
                        turnaround_time=float(row["turnaround_time"]) if pd.notnull(row.get("turnaround_time")) else None,
                        updated_at=datetime.utcnow()
                    )
                    db.merge(p)
                db.commit()
                print(f"Loaded {len(df_ports)} ports.")

        vc_count = db.query(VesselClass).count()
        if vc_count == 0:
            print("Seeding vessel_classes from CSV...")
            vc_csv = os.path.join(seed_data_dir, "vessel_classes.csv")
            if os.path.exists(vc_csv):
                df_vc = pd.read_csv(vc_csv)
                for _, row in df_vc.iterrows():
                    vc = VesselClass(
                        id=int(row["id"]),
                        name=str(row["name"]),
                        min_dwt=float(row["min_dwt"]),
                        max_dwt=float(row["max_dwt"]),
                        typical_draft=float(row["typical_draft"]),
                        typical_loa=float(row["typical_loa"]),
                        typical_beam=float(row["typical_beam"])
                    )
                    db.merge(vc)
                db.commit()
                print(f"Loaded {len(df_vc)} vessel classes.")

        vessel_count = db.query(Vessel).count()
        if vessel_count == 0:
            print("Seeding vessels from CSV...")
            vessels_csv = os.path.join(seed_data_dir, "vessels.csv")
            if os.path.exists(vessels_csv):
                df_vessels = pd.read_csv(vessels_csv)
                port_ids = set(p.id for p in db.query(Port.id).all())
                for _, row in df_vessels.iterrows():
                    port_id_raw = row.get("current_port_id")
                    port_id_val = int(port_id_raw) if pd.notnull(port_id_raw) and int(port_id_raw) in port_ids else None
                    v = Vessel(
                        id=str(row["vessel_id"]),
                        name=str(row["vessel_name"]),
                        vessel_class=str(row["vessel_class"]),
                        dwt=float(row["dwt"]),
                        draft=float(row["draft"]),
                        loa=float(row["length"]),
                        beam=float(row["beam"]),
                        current_port_id=port_id_val,
                        current_location=str(row.get("operational_status", "At Sea")),
                        operational_status=str(row.get("operational_status", "AVAILABLE")).upper(),
                        availability_date=pd.to_datetime(row["availability_date"]).date() if pd.notnull(row.get("availability_date")) else None,
                        owner_operator=str(row.get("owner_operator", "")),
                        fuel_consumption=float(row["fuel_consumption"]) if pd.notnull(row.get("fuel_consumption")) else None,
                        cruising_speed=float(row["cruising_speed"]) if pd.notnull(row.get("cruising_speed")) else None,
                        reliability_score=float(row["reliability_score"]) if pd.notnull(row.get("reliability_score")) else None,
                        updated_at=datetime.utcnow()
                    )
                    db.merge(v)
                db.commit()
                print(f"Loaded {len(df_vessels)} vessels into fleet database.")

        voyage_count = db.query(Voyage).count()
        if voyage_count == 0:
            print("Seeding initial operational voyages from CSV...")
            voyages_csv = os.path.join(seed_data_dir, "voyages.csv")
            if os.path.exists(voyages_csv):
                df_voyages = pd.read_csv(voyages_csv, nrows=60)
                vessel_ids = set(v.id for v in db.query(Vessel.id).all())
                ports_dict = {p.id: p.name for p in db.query(Port).all()}
                for _, row in df_voyages.iterrows():
                    v_id = str(row["vessel_id"])
                    if v_id not in vessel_ids:
                        continue
                    orig_name = ports_dict.get(int(row["origin_port_id"]), "Port Hedland") if pd.notnull(row.get("origin_port_id")) else "Hay Point"
                    dest_name = ports_dict.get(int(row["destination_port_id"]), "Paradip") if pd.notnull(row.get("destination_port_id")) else "Visakhapatnam"
                    voy = Voyage(
                        id=str(row["voyage_id"]),
                        vessel_id=v_id,
                        origin_port=orig_name,
                        destination_port=dest_name,
                        planned_departure=pd.to_datetime(row["planned_departure"]) if pd.notnull(row.get("planned_departure")) else None,
                        actual_departure=pd.to_datetime(row["actual_departure"]) if pd.notnull(row.get("actual_departure")) else None,
                        planned_arrival=pd.to_datetime(row["planned_arrival"]) if pd.notnull(row.get("planned_arrival")) else None,
                        actual_arrival=pd.to_datetime(row["actual_arrival"]) if pd.notnull(row.get("actual_arrival")) else None,
                        eta=pd.to_datetime(row["planned_arrival"]) if pd.notnull(row.get("planned_arrival")) else None,
                        status=str(row.get("voyage_status", "COMPLETED")).upper(),
                        distance_nm=float(row["distance_nm"]) if pd.notnull(row.get("distance_nm")) else None,
                        fuel_estimate=float(row["fuel_consumed"]) if pd.notnull(row.get("fuel_consumed")) else None,
                        ballast_distance=round(float(row.get("distance_nm", 3000)) * 0.4, 1),
                        delay_hours=float(row.get("delay_hours", 0.0)) if pd.notnull(row.get("delay_hours")) else 0.0,
                        delay_reason=str(row.get("delay_reason", "none")) if pd.notnull(row.get("delay_reason")) else "none",
                        created_at=datetime.utcnow()
                    )
                    db.merge(voy)
                db.commit()
                print(f"Loaded initial operational voyages.")

        risk_count = db.query(RiskEvent).count()
        if risk_count == 0:
            print("Seeding risk_events from CSV...")
            risk_csv = os.path.join(seed_data_dir, "risk_events.csv")
            if os.path.exists(risk_csv):
                df_risk = pd.read_csv(risk_csv)
                for _, row in df_risk.iterrows():
                    re = RiskEvent(
                        id=int(row["id"]),
                        event_type=str(row["event_type"]),
                        route=str(row["route"]) if pd.notnull(row.get("route")) else None,
                        port_id=int(row["port_id"]) if pd.notnull(row.get("port_id")) else None,
                        severity=str(row["severity"]),
                        description=str(row["description"]),
                        event_date=pd.to_datetime(row["event_date"]).date(),
                        source=str(row.get("source", ""))
                    )
                    db.merge(re)
                db.commit()
                print(f"Loaded {len(df_risk)} risk events.")
