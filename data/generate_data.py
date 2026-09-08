"""
FreightIQ Synthetic Data Generator
SIH Problem Statement 26006: AI/ML-driven Maritime Logistics & Chartering Optimization

Generates realistic maritime datasets for:
1. ML model training (freight forecasting, delay prediction)
2. Vessel-port compatibility checks
3. Market entry timing & chartering recommendations (Spot vs CoA)
4. Risk scoring and early warning alerts

Adheres strictly to schemas in api-contract.md, architecture.md, and features.md.
"""

import os
import sys
import argparse
import random
import math
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

def parse_args():
    parser = argparse.ArgumentParser(description="Generate realistic FreightIQ synthetic dataset")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--voyages", type=int, default=65000, help="Number of historical voyage records to generate")
    parser.add_argument("--cargo", type=int, default=15000, help="Number of cargo demand records")
    parser.add_argument("--output_dir", type=str, default="data", help="Output directory for generated CSV files")
    return parser.parse_args()


# =====================================================================
# 1. PORTS GENERATION
# =====================================================================
def generate_ports(rng):
    """
    Generates realistic port infrastructure data for East Coast India, West Coast India,
    and key global loading/transshipment hubs.
    Constraints directly reflect physical realities (draft, LOA, handling rates).
    """
    ports_data = [
        # East Coast Indian Ports (Discharge hubs for Ministry of Steel coking coal)
        {
            "id": 1, "name": "Paradip", "country": "India", "latitude": 20.2644, "longitude": 86.6713,
            "port_type": "Bulk", "max_draft": 17.1, "max_loa": 300.0, "max_beam": 48.0,
            "handling_rate": 55000, "lightering_available": True, "berth_count": 18,
            "congestion_index": 0.45, "turnaround_time": 44.0, "storage_capacity": 4500000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.35, "operating_hours": "24/7"
        },
        {
            "id": 2, "name": "Visakhapatnam", "country": "India", "latitude": 17.6868, "longitude": 83.2185,
            "port_type": "Bulk", "max_draft": 16.5, "max_loa": 280.0, "max_beam": 45.0,
            "handling_rate": 45000, "lightering_available": True, "berth_count": 24,
            "congestion_index": 0.38, "turnaround_time": 38.0, "storage_capacity": 3800000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.25, "operating_hours": "24/7"
        },
        {
            "id": 3, "name": "Gangavaram", "country": "India", "latitude": 17.6200, "longitude": 83.2386,
            "port_type": "Bulk", "max_draft": 18.5, "max_loa": 310.0, "max_beam": 50.0,
            "handling_rate": 65000, "lightering_available": False, "berth_count": 9,
            "congestion_index": 0.25, "turnaround_time": 28.0, "storage_capacity": 3000000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 4, "name": "Dhamra", "country": "India", "latitude": 20.8039, "longitude": 86.9608,
            "port_type": "Bulk", "max_draft": 18.0, "max_loa": 300.0, "max_beam": 48.0,
            "handling_rate": 60000, "lightering_available": False, "berth_count": 6,
            "congestion_index": 0.28, "turnaround_time": 30.0, "storage_capacity": 3200000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.30, "operating_hours": "24/7"
        },
        {
            "id": 5, "name": "Gopalpur", "country": "India", "latitude": 19.3080, "longitude": 84.9664,
            "port_type": "Bulk", "max_draft": 12.5, "max_loa": 225.0, "max_beam": 33.0,
            "handling_rate": 20000, "lightering_available": True, "berth_count": 4,
            "congestion_index": 0.40, "turnaround_time": 56.0, "storage_capacity": 1200000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.40, "operating_hours": "24/7"
        },
        {
            "id": 6, "name": "Haldia", "country": "India", "latitude": 22.0232, "longitude": 88.0673,
            "port_type": "Bulk", "max_draft": 8.5, "max_loa": 190.0, "max_beam": 30.0,
            "handling_rate": 18000, "lightering_available": True, "berth_count": 14,
            "congestion_index": 0.62, "turnaround_time": 68.0, "storage_capacity": 1800000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.50, "operating_hours": "Tidal"
        },
        {
            "id": 7, "name": "Kolkata", "country": "India", "latitude": 22.5414, "longitude": 88.3188,
            "port_type": "General Cargo", "max_draft": 7.5, "max_loa": 172.0, "max_beam": 26.0,
            "handling_rate": 12000, "lightering_available": True, "berth_count": 16,
            "congestion_index": 0.55, "turnaround_time": 72.0, "storage_capacity": 900000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.35, "operating_hours": "Tidal"
        },
        {
            "id": 8, "name": "Chennai", "country": "India", "latitude": 13.0827, "longitude": 80.2707,
            "port_type": "Container/Multi-purpose", "max_draft": 15.5, "max_loa": 290.0, "max_beam": 40.0,
            "handling_rate": 35000, "lightering_available": False, "berth_count": 22,
            "congestion_index": 0.35, "turnaround_time": 36.0, "storage_capacity": 2500000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.20, "operating_hours": "24/7"
        },
        {
            "id": 9, "name": "Kamarajar (Ennore)", "country": "India", "latitude": 13.2611, "longitude": 80.3328,
            "port_type": "Bulk", "max_draft": 16.0, "max_loa": 280.0, "max_beam": 45.0,
            "handling_rate": 48000, "lightering_available": False, "berth_count": 8,
            "congestion_index": 0.30, "turnaround_time": 32.0, "storage_capacity": 2800000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 10, "name": "Tuticorin (V.O.C.)", "country": "India", "latitude": 8.7642, "longitude": 78.1348,
            "port_type": "Bulk", "max_draft": 14.2, "max_loa": 245.0, "max_beam": 36.0,
            "handling_rate": 28000, "lightering_available": False, "berth_count": 14,
            "congestion_index": 0.32, "turnaround_time": 40.0, "storage_capacity": 1600000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.10, "operating_hours": "24/7"
        },

        # West Coast Indian Ports
        {
            "id": 11, "name": "Mundra", "country": "India", "latitude": 22.7383, "longitude": 69.7042,
            "port_type": "Bulk", "max_draft": 17.5, "max_loa": 305.0, "max_beam": 48.0,
            "handling_rate": 60000, "lightering_available": False, "berth_count": 28,
            "congestion_index": 0.26, "turnaround_time": 26.0, "storage_capacity": 5500000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.10, "operating_hours": "24/7"
        },
        {
            "id": 12, "name": "Kandla (Deendayal)", "country": "India", "latitude": 23.0033, "longitude": 70.2181,
            "port_type": "Bulk", "max_draft": 13.5, "max_loa": 240.0, "max_beam": 35.0,
            "handling_rate": 32000, "lightering_available": True, "berth_count": 16,
            "congestion_index": 0.48, "turnaround_time": 48.0, "storage_capacity": 3100000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 13, "name": "Nhava Sheva (JNPT)", "country": "India", "latitude": 18.9499, "longitude": 72.9515,
            "port_type": "Container", "max_draft": 15.0, "max_loa": 330.0, "max_beam": 45.0,
            "handling_rate": 40000, "lightering_available": False, "berth_count": 12,
            "congestion_index": 0.42, "turnaround_time": 32.0, "storage_capacity": 2000000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 14, "name": "Cochin", "country": "India", "latitude": 9.9654, "longitude": 76.2694,
            "port_type": "Multi-purpose", "max_draft": 14.5, "max_loa": 260.0, "max_beam": 38.0,
            "handling_rate": 26000, "lightering_available": False, "berth_count": 15,
            "congestion_index": 0.30, "turnaround_time": 34.0, "storage_capacity": 1500000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.20, "operating_hours": "24/7"
        },

        # Key Global Loading Ports (Coal, Iron Ore, Energy)
        # Australia (Primary Coking Coal Source)
        {
            "id": 15, "name": "Hay Point", "country": "Australia", "latitude": -21.2858, "longitude": 149.2995,
            "port_type": "Bulk Coal", "max_draft": 19.5, "max_loa": 320.0, "max_beam": 52.0,
            "handling_rate": 90000, "lightering_available": False, "berth_count": 6,
            "congestion_index": 0.35, "turnaround_time": 30.0, "storage_capacity": 8000000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.25, "operating_hours": "24/7"
        },
        {
            "id": 16, "name": "Gladstone", "country": "Australia", "latitude": -23.8427, "longitude": 151.2562,
            "port_type": "Bulk Coal", "max_draft": 18.5, "max_loa": 310.0, "max_beam": 50.0,
            "handling_rate": 80000, "lightering_available": False, "berth_count": 8,
            "congestion_index": 0.32, "turnaround_time": 32.0, "storage_capacity": 6500000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.20, "operating_hours": "24/7"
        },
        {
            "id": 17, "name": "Newcastle", "country": "Australia", "latitude": -32.9267, "longitude": 151.7817,
            "port_type": "Bulk Coal", "max_draft": 15.2, "max_loa": 300.0, "max_beam": 48.0,
            "handling_rate": 85000, "lightering_available": False, "berth_count": 10,
            "congestion_index": 0.44, "turnaround_time": 42.0, "storage_capacity": 7500000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 18, "name": "Port Hedland", "country": "Australia", "latitude": -20.3122, "longitude": 118.5760,
            "port_type": "Bulk Iron Ore", "max_draft": 19.8, "max_loa": 330.0, "max_beam": 55.0,
            "handling_rate": 110000, "lightering_available": False, "berth_count": 19,
            "congestion_index": 0.38, "turnaround_time": 28.0, "storage_capacity": 12000000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.30, "operating_hours": "24/7"
        },

        # Indonesia (Thermal & PCI Coal)
        {
            "id": 19, "name": "Balikpapan", "country": "Indonesia", "latitude": -1.2654, "longitude": 116.8312,
            "port_type": "Bulk Coal", "max_draft": 14.5, "max_loa": 250.0, "max_beam": 38.0,
            "handling_rate": 45000, "lightering_available": True, "berth_count": 8,
            "congestion_index": 0.40, "turnaround_time": 46.0, "storage_capacity": 3500000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.25, "operating_hours": "24/7"
        },
        {
            "id": 20, "name": "Tanjung Priok", "country": "Indonesia", "latitude": -6.1039, "longitude": 106.8833,
            "port_type": "Multi-purpose", "max_draft": 14.0, "max_loa": 280.0, "max_beam": 40.0,
            "handling_rate": 35000, "lightering_available": False, "berth_count": 20,
            "congestion_index": 0.45, "turnaround_time": 38.0, "storage_capacity": 2800000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.20, "operating_hours": "24/7"
        },
        {
            "id": 21, "name": "Samarinda", "country": "Indonesia", "latitude": -0.5022, "longitude": 117.1536,
            "port_type": "Bulk Coal Riverine", "max_draft": 11.5, "max_loa": 210.0, "max_beam": 32.2,
            "handling_rate": 28000, "lightering_available": True, "berth_count": 12,
            "congestion_index": 0.52, "turnaround_time": 54.0, "storage_capacity": 2200000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.30, "operating_hours": "Tidal"
        },

        # United States (Coking Coal)
        {
            "id": 22, "name": "Norfolk (Hampton Roads)", "country": "USA", "latitude": 36.8508, "longitude": -76.2859,
            "port_type": "Bulk Coal", "max_draft": 15.2, "max_loa": 300.0, "max_beam": 48.0,
            "handling_rate": 70000, "lightering_available": False, "berth_count": 10,
            "congestion_index": 0.35, "turnaround_time": 36.0, "storage_capacity": 5000000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 23, "name": "Baltimore", "country": "USA", "latitude": 39.2904, "longitude": -76.6122,
            "port_type": "Bulk Coal", "max_draft": 14.8, "max_loa": 290.0, "max_beam": 45.0,
            "handling_rate": 55000, "lightering_available": False, "berth_count": 7,
            "congestion_index": 0.36, "turnaround_time": 40.0, "storage_capacity": 4200000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.20, "operating_hours": "24/7"
        },

        # Mozambique (Coking & Thermal Coal)
        {
            "id": 24, "name": "Maputo", "country": "Mozambique", "latitude": -25.9692, "longitude": 32.5732,
            "port_type": "Bulk Coal", "max_draft": 14.2, "max_loa": 250.0, "max_beam": 38.0,
            "handling_rate": 35000, "lightering_available": False, "berth_count": 8,
            "congestion_index": 0.42, "turnaround_time": 44.0, "storage_capacity": 2800000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.25, "operating_hours": "24/7"
        },
        {
            "id": 25, "name": "Beira", "country": "Mozambique", "latitude": -19.8436, "longitude": 34.8389,
            "port_type": "Bulk Coal", "max_draft": 11.0, "max_loa": 200.0, "max_beam": 32.0,
            "handling_rate": 22000, "lightering_available": True, "berth_count": 5,
            "congestion_index": 0.50, "turnaround_time": 58.0, "storage_capacity": 1500000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.35, "operating_hours": "Tidal"
        },

        # Russia Far East (Coking Coal)
        {
            "id": 26, "name": "Vostochny", "country": "Russia", "latitude": 42.7333, "longitude": 133.0833,
            "port_type": "Bulk Coal", "max_draft": 16.5, "max_loa": 290.0, "max_beam": 45.0,
            "handling_rate": 65000, "lightering_available": False, "berth_count": 8,
            "congestion_index": 0.38, "turnaround_time": 40.0, "storage_capacity": 4500000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.40, "operating_hours": "24/7"
        },
        {
            "id": 27, "name": "Vanino", "country": "Russia", "latitude": 49.0833, "longitude": 140.2667,
            "port_type": "Bulk Coal", "max_draft": 14.8, "max_loa": 245.0, "max_beam": 36.0,
            "handling_rate": 45000, "lightering_available": False, "berth_count": 6,
            "congestion_index": 0.46, "turnaround_time": 50.0, "storage_capacity": 3000000,
            "weather_risk": "High", "seasonal_congestion_factor": 1.45, "operating_hours": "Ice-classed winter"
        },

        # Strategic Transshipment & Major Global Hubs
        {
            "id": 28, "name": "Singapore", "country": "Singapore", "latitude": 1.29027, "longitude": 103.851959,
            "port_type": "Transshipment / Bunkering", "max_draft": 19.0, "max_loa": 400.0, "max_beam": 60.0,
            "handling_rate": 95000, "lightering_available": False, "berth_count": 65,
            "congestion_index": 0.30, "turnaround_time": 22.0, "storage_capacity": 15000000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.10, "operating_hours": "24/7"
        },
        {
            "id": 29, "name": "Port Klang", "country": "Malaysia", "latitude": 2.9999, "longitude": 101.3928,
            "port_type": "Transshipment", "max_draft": 17.5, "max_loa": 360.0, "max_beam": 52.0,
            "handling_rate": 60000, "lightering_available": False, "berth_count": 32,
            "congestion_index": 0.34, "turnaround_time": 28.0, "storage_capacity": 6000000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.12, "operating_hours": "24/7"
        },
        {
            "id": 30, "name": "Colombo", "country": "Sri Lanka", "latitude": 6.9497, "longitude": 79.8438,
            "port_type": "Transshipment", "max_draft": 18.0, "max_loa": 380.0, "max_beam": 55.0,
            "handling_rate": 55000, "lightering_available": False, "berth_count": 22,
            "congestion_index": 0.36, "turnaround_time": 30.0, "storage_capacity": 4500000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.15, "operating_hours": "24/7"
        },
        {
            "id": 31, "name": "Rotterdam", "country": "Netherlands", "latitude": 51.9244, "longitude": 4.4777,
            "port_type": "Mega Port", "max_draft": 22.5, "max_loa": 420.0, "max_beam": 65.0,
            "handling_rate": 120000, "lightering_available": False, "berth_count": 90,
            "congestion_index": 0.24, "turnaround_time": 24.0, "storage_capacity": 25000000,
            "weather_risk": "Low", "seasonal_congestion_factor": 1.10, "operating_hours": "24/7"
        },
        {
            "id": 32, "name": "Shanghai (Qingdao)", "country": "China", "latitude": 31.2304, "longitude": 121.4737,
            "port_type": "Mega Port", "max_draft": 18.5, "max_loa": 400.0, "max_beam": 60.0,
            "handling_rate": 105000, "lightering_available": False, "berth_count": 80,
            "congestion_index": 0.40, "turnaround_time": 32.0, "storage_capacity": 20000000,
            "weather_risk": "Medium", "seasonal_congestion_factor": 1.30, "operating_hours": "24/7"
        }
    ]

    df_ports = pd.DataFrame(ports_data)
    # Add updated_at matching api-contract.md
    df_ports["updated_at"] = "2026-03-01T00:00:00Z"
    return df_ports


# =====================================================================
# 2. VESSEL CLASSES GENERATION
# =====================================================================
def generate_vessel_classes():
    """
    Vessel classes strictly matching api-contract.md:
    id, name(vessel_class), min_dwt, max_dwt, typical_draft, typical_loa, typical_beam
    """
    classes_data = [
        {
            "id": 1, "name": "Handysize", "min_dwt": 15000, "max_dwt": 40000,
            "typical_draft": 10.0, "typical_loa": 180.0, "typical_beam": 28.0
        },
        {
            "id": 2, "name": "Supramax", "min_dwt": 50000, "max_dwt": 65000,
            "typical_draft": 12.5, "typical_loa": 199.0, "typical_beam": 32.2
        },
        {
            "id": 3, "name": "Panamax", "min_dwt": 60000, "max_dwt": 88000,
            "typical_draft": 13.5, "typical_loa": 228.0, "typical_beam": 32.3
        },
        {
            "id": 4, "name": "Capesize", "min_dwt": 150000, "max_dwt": 210000,
            "typical_draft": 17.5, "typical_loa": 295.0, "typical_beam": 45.0
        }
    ]
    return pd.DataFrame(classes_data)


# =====================================================================
# 3. VESSELS GENERATION
# =====================================================================
def generate_vessels(df_classes, df_ports, rng, n_vessels=350):
    """
    Generates realistic merchant bulk carrier fleet with correlated naval architecture:
    DWT -> Dimensions (LOA, Beam, Draft) -> Engine Power -> Fuel Consumption.
    Includes age degradation and reliability scoring.
    """
    class_distribution = [
        ("Handysize", 55, (18000, 38000), (160, 188), (26.0, 29.5), (8.8, 10.4), (5500, 7500)),
        ("Supramax", 115, (52000, 64500), (188, 200), (31.5, 32.3), (11.8, 13.1), (7800, 9600)),
        ("Panamax", 120, (68000, 85000), (220, 229), (32.1, 32.3), (12.8, 14.6), (9200, 12000)),
        ("Capesize", 60, (160000, 208000), (285, 300), (43.0, 45.5), (16.8, 18.3), (15000, 22000)),
    ]

    vessel_names_prefixes = [
        "Star", "Golden", "Pacific", "Ocean", "Baltic", "Eastern", "Maritime", "Apex", "Global",
        "Bunga", "Berge", "Navios", "Diana", "Safe", "Nordic", "Eagle", "Iron", "Steel", "Bharat",
        "Sagar", "Ganga", "Yamuna", "Kaveri", "Mundra", "Paradip", "Indus", "Samudra", "Tashkent"
    ]
    vessel_names_suffixes = [
        "Pioneer", "Trader", "Carrier", "Voyager", "Leader", "Explorer", "Endeavour", "Fortune",
        "Champion", "Master", "Prosperity", "Glory", "Harmony", "Navigator", "Express", "Jewel",
        "Titan", "Horizon", "Sunrise", "Colossus", "Legacy", "Pride", "Dynasty", "Vanguard"
    ]

    owners = [
        "Shipping Corporation of India (SCI)", "Great Eastern Shipping", "Oldendorff Carriers",
        "Star Bulk Carriers", "Berge Bulk", "Golden Ocean Group", "Navios Maritime", "Pacific Basin",
        "Genco Shipping", "Eagle Bulk", "Tata NYK Shipping", "Adani Shipping", "Jindal Steel & Power"
    ]
    flags = ["India", "Panama", "Marshall Islands", "Liberia", "Singapore", "Malta", "Cyprus", "Bahamas"]
    statuses = ["Underway", "At Berth", "At Anchor", "In Maintenance"]

    vessels = []
    vessel_id_counter = 1

    current_year = 2026

    for class_name, count, dwt_r, loa_r, beam_r, draft_r, power_r in class_distribution:
        for _ in range(count):
            v_id = f"V{vessel_id_counter:04d}"
            name = f"{rng.choice(vessel_names_prefixes)} {rng.choice(vessel_names_suffixes)}"

            # Correlated naval physics
            dwt = int(rng.uniform(dwt_r[0], dwt_r[1]))
            norm_factor = (dwt - dwt_r[0]) / max(1, (dwt_r[1] - dwt_r[0]))

            # Length, beam, draft correlated with DWT
            loa = round(loa_r[0] + norm_factor * (loa_r[1] - loa_r[0]) + float(rng.normal(0, 1.5)), 1)
            loa = max(loa_r[0], min(loa_r[1] + 2.0, loa))
            beam = round(beam_r[0] + norm_factor * (beam_r[1] - beam_r[0]) + float(rng.normal(0, 0.3)), 1)
            draft = round(draft_r[0] + norm_factor * (draft_r[1] - draft_r[0]) + float(rng.normal(0, 0.2)), 2)

            # Volumetric capacity in cubic meters (~1.25 m3 per DWT for bulkers)
            capacity = int(dwt * rng.uniform(1.20, 1.28))

            # Build year & Age (1 to 24 years old)
            weights = np.linspace(0.02, 0.08, 23)
            weights = weights / np.sum(weights)
            build_year = int(rng.choice(list(range(2002, 2025)), p=weights))
            age = current_year - build_year

            # Engine power in kW
            engine_power = int(power_r[0] + norm_factor * (power_r[1] - power_r[0]) + float(rng.normal(0, 300)))

            # Fuel type & consumption
            fuel_type = "VLSFO" if build_year < 2021 else rng.choice(["VLSFO", "VLSFO/Scrubber", "LNG Dual Fuel"], p=[0.65, 0.25, 0.10])

            # Cruising speed (knots)
            cruising_speed = round(rng.uniform(12.2, 14.2) - 0.02 * age, 1)
            max_speed = round(cruising_speed + rng.uniform(1.5, 2.5), 1)

            # Daily fuel consumption (MT/day) at cruising speed (cubic law scaling)
            base_fuel = {
                "Handysize": rng.uniform(18.0, 23.0),
                "Supramax": rng.uniform(25.0, 31.0),
                "Panamax": rng.uniform(30.0, 37.0),
                "Capesize": rng.uniform(46.0, 56.0)
            }[class_name]
            fuel_consumption = round(base_fuel * (1.0 + 0.008 * age) * (cruising_speed / 13.0)**2.8, 2)

            # Reliability score: decreases with age and maintenance history
            reliability_score = round(max(0.68, min(0.99, 0.98 - 0.012 * age + float(rng.normal(0, 0.02)))), 3)

            flag = rng.choice(flags, p=[0.20, 0.30, 0.20, 0.15, 0.07, 0.03, 0.03, 0.02])
            owner = rng.choice(owners)
            curr_port = int(rng.choice(df_ports["id"].values))
            status = rng.choice(statuses, p=[0.50, 0.28, 0.18, 0.04])

            # Availability date
            days_offset = int(rng.integers(-5, 30))
            avail_date = (datetime(2026, 3, 1) + timedelta(days=days_offset)).strftime("%Y-%m-%d")

            vessels.append({
                "vessel_id": v_id,
                "vessel_name": name,
                "vessel_class": class_name,
                "vessel_type": class_name,  # for backwards compatibility
                "dwt": dwt,
                "capacity": capacity,
                "length": loa,
                "beam": beam,
                "draft": draft,
                "age": age,
                "build_year": build_year,
                "engine_power": engine_power,
                "fuel_type": fuel_type,
                "fuel_consumption": fuel_consumption,
                "cruising_speed": cruising_speed,
                "max_speed": max_speed,
                "flag": flag,
                "owner_operator": owner,
                "current_port_id": curr_port,
                "operational_status": status,
                "availability_date": avail_date,
                "reliability_score": reliability_score
            })
            vessel_id_counter += 1

    df_vessels = pd.DataFrame(vessels)
    return df_vessels


# =====================================================================
# 4. ROUTES GENERATION
# =====================================================================
def generate_routes(df_ports, rng):
    """
    Generates realistic maritime routes with authentic nautical mile distances,
    canal chokepoints, piracy/weather risk zones, and historical delay baselines.
    """
    trade_lane_templates = [
        # Australia East Coast to East Coast India (via Torres Strait / Lombok Strait / Malacca)
        ("Hay Point", "Paradip", 4950, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Medium", 0.14),
        ("Hay Point", "Visakhapatnam", 4880, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.12),
        ("Hay Point", "Gangavaram", 4875, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.11),
        ("Hay Point", "Dhamra", 4980, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.12),
        ("Hay Point", "Haldia", 5040, "Torres Strait / Malacca", "Malacca", "Low", "High", "High", 0.28),
        ("Hay Point", "Gopalpur", 4910, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Medium", 0.18),
        ("Gladstone", "Paradip", 5080, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Medium", 0.14),
        ("Gladstone", "Visakhapatnam", 5010, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.12),
        ("Gladstone", "Gangavaram", 5005, "Torres Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.11),
        ("Gladstone", "Haldia", 5170, "Torres Strait / Malacca", "Malacca", "Low", "High", "High", 0.29),
        ("Newcastle", "Paradip", 5520, "Bass Strait / Sunda / Malacca", "Malacca", "Low", "Medium", "Medium", 0.15),
        ("Newcastle", "Visakhapatnam", 5450, "Bass Strait / Sunda / Malacca", "Malacca", "Low", "Medium", "Low", 0.13),
        ("Port Hedland", "Paradip", 3620, "Direct Indian Ocean", "Direct Sea", "Low", "Low", "Medium", 0.10),
        ("Port Hedland", "Visakhapatnam", 3540, "Direct Indian Ocean", "Direct Sea", "Low", "Low", "Low", 0.09),

        # Indonesia to East Coast India (Short haul coal route)
        ("Balikpapan", "Paradip", 2320, "Makassar Strait / Malacca", "Malacca", "Low", "Medium", "Medium", 0.15),
        ("Balikpapan", "Visakhapatnam", 2240, "Makassar Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.13),
        ("Balikpapan", "Gangavaram", 2235, "Makassar Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.12),
        ("Balikpapan", "Dhamra", 2350, "Makassar Strait / Malacca", "Malacca", "Low", "Medium", "Low", 0.13),
        ("Balikpapan", "Haldia", 2410, "Makassar Strait / Malacca", "Malacca", "Low", "High", "High", 0.26),
        ("Tanjung Priok", "Paradip", 1950, "Sunda Strait / Bay of Bengal", "Direct Sea", "Low", "Medium", "Medium", 0.12),
        ("Tanjung Priok", "Visakhapatnam", 1880, "Sunda Strait / Bay of Bengal", "Direct Sea", "Low", "Medium", "Low", 0.11),
        ("Samarinda", "Paradip", 2360, "River / Malacca Strait", "Malacca", "Low", "Medium", "Medium", 0.18),

        # United States East Coast to East Coast India (Long haul Capesize / Panamax)
        ("Norfolk (Hampton Roads)", "Paradip", 11650, "Cape of Good Hope", "Cape", "Low", "High", "Medium", 0.18),
        ("Norfolk (Hampton Roads)", "Visakhapatnam", 11580, "Cape of Good Hope", "Cape", "Low", "High", "Low", 0.16),
        ("Norfolk (Hampton Roads)", "Gangavaram", 11575, "Cape of Good Hope", "Cape", "Low", "High", "Low", 0.15),
        ("Baltimore", "Paradip", 11720, "Cape of Good Hope", "Cape", "Low", "High", "Medium", 0.19),
        ("Baltimore", "Visakhapatnam", 11650, "Cape of Good Hope", "Cape", "Low", "High", "Low", 0.17),

        # Mozambique to East Coast India (Mid haul coal)
        ("Maputo", "Paradip", 4420, "Mozambique Channel / Indian Ocean", "Direct Sea", "Low", "Medium", "Medium", 0.14),
        ("Maputo", "Visakhapatnam", 4350, "Mozambique Channel / Indian Ocean", "Direct Sea", "Low", "Medium", "Low", 0.13),
        ("Maputo", "Gangavaram", 4345, "Mozambique Channel / Indian Ocean", "Direct Sea", "Low", "Medium", "Low", 0.12),
        ("Beira", "Paradip", 4210, "Mozambique Channel / Indian Ocean", "Direct Sea", "Low", "High", "High", 0.22),

        # Russia Far East to East Coast India (Pacific hauls)
        ("Vostochny", "Paradip", 5280, "Sea of Japan / Malacca Strait", "Malacca", "Low", "High", "Medium", 0.16),
        ("Vostochny", "Visakhapatnam", 5210, "Sea of Japan / Malacca Strait", "Malacca", "Low", "High", "Low", 0.14),
        ("Vanino", "Paradip", 5580, "Tatar Strait / Malacca Strait", "Malacca", "Low", "High", "Medium", 0.20),

        # West Coast India Connections
        ("Hay Point", "Mundra", 5620, "Torres Strait / Malacca / Arabian Sea", "Malacca", "Low", "Low", "Low", 0.08),
        ("Tanjung Priok", "Mundra", 2750, "Malacca Strait / Arabian Sea", "Malacca", "Low", "Low", "Low", 0.08),
        ("Norfolk (Hampton Roads)", "Mundra", 10900, "Cape of Good Hope", "Cape", "Low", "High", "Low", 0.14),

        # Coastal & Intra-India Bulk Movements
        ("Paradip", "Chennai", 640, "Coastal Bay of Bengal", "Direct Sea", "Low", "Medium", "Low", 0.08),
        ("Visakhapatnam", "Haldia", 480, "Coastal Bay of Bengal", "Direct Sea", "Low", "High", "High", 0.24),
        ("Paradip", "Haldia", 210, "Coastal Bay of Bengal", "Direct Sea", "Low", "High", "High", 0.25)
    ]

    port_name_to_id = dict(zip(df_ports["name"], df_ports["id"]))

    routes = []
    route_id_counter = 1

    for orig_name, dest_name, dist_nm, canal_req, canal_type, pir_risk, w_risk, cong_risk, hist_delay in trade_lane_templates:
        if orig_name in port_name_to_id and dest_name in port_name_to_id:
            orig_id = port_name_to_id[orig_name]
            dest_id = port_name_to_id[dest_name]

            orig_region = df_ports.loc[df_ports["id"] == orig_id, "country"].values[0]
            dest_clean = dest_name.split()[0]
            route_label = f"{orig_region}-{dest_clean}"

            # Transit time at nominal speed 13.0 knots + port buffer
            typical_transit_hours = round(dist_nm / 13.0 + 12.0, 1)

            # Fuel consumption for average Panamax
            typical_fuel = round((dist_nm / (13.0 * 24.0)) * 32.0, 1)

            # Combined route risk score (1.0 to 10.0)
            risk_map = {"Low": 1.5, "Medium": 4.5, "High": 8.0}
            base_risk = (risk_map[w_risk] * 0.45 + risk_map[cong_risk] * 0.40 + risk_map[pir_risk] * 0.15)
            route_risk_score = round(min(9.8, max(1.2, base_risk + float(rng.normal(0, 0.3)))), 2)

            routes.append({
                "route_id": route_id_counter,
                "route": route_label,
                "route_name": f"{orig_name} to {dest_name}",
                "origin_port_id": orig_id,
                "destination_port_id": dest_id,
                "distance_nm": dist_nm,
                "typical_transit_hours": typical_transit_hours,
                "canal_required": canal_req,
                "canal_type": canal_type,
                "piracy_risk": pir_risk,
                "weather_risk": w_risk,
                "congestion_risk": cong_risk,
                "historical_delay_rate": hist_delay,
                "typical_fuel_consumption": typical_fuel,
                "route_risk_score": route_risk_score
            })
            route_id_counter += 1

    df_routes = pd.DataFrame(routes)
    return df_routes


# =====================================================================
# 5. BUNKER & COMMODITY PRICES TIME SERIES (2021-2026)
# =====================================================================
def generate_market_time_series(rng):
    """
    Generates realistic daily historical time series (2021-01-01 to 2026-03-31)
    capturing true maritime market cycles:
    - 2021: Post-COVID boom, supply chain congestion, historic BDI spike to ~5,650
    - 2022: Ukraine War commodity shock, VLSFO bunker spike to >$1,000/MT, energy volatility
    - 2023: Global rate normalization, China property cooling, BDI normalizing to 1,000-1,800
    - 2024-2025: Red Sea disruptions (Suez detour via Cape of Good Hope), Indian steel demand surge (+12% YoY)
    - 2026: Balanced market with strong seasonal cycles
    """
    dates = pd.date_range(start="2021-01-01", end="2026-03-31", freq="B")  # Business days
    n_days = len(dates)

    log_bdi = np.zeros(n_days)
    log_bdi[0] = math.log(1400.0)

    bunker_price = np.zeros(n_days)
    bunker_price[0] = 430.0

    coal_price = np.zeros(n_days)
    coal_price[0] = 135.0

    usd_index = np.zeros(n_days)
    usd_index[0] = 90.5

    for t in range(1, n_days):
        dt = dates[t]
        year = dt.year
        month = dt.month
        day_of_year = dt.dayofyear

        seasonal_bdi_factor = 1.0 + 0.15 * math.sin(2 * math.pi * (day_of_year - 60) / 365.25)

        if year == 2021:
            target_bdi = 3200.0 * (1.0 + 0.6 * math.sin(math.pi * (t / 250)))
            target_bunker = 550.0 + 0.4 * t
            target_coal = 220.0 + 0.6 * t
            target_usd = 92.5 + 0.01 * t
            vol = 0.035
        elif year == 2022:
            target_bdi = 2200.0
            target_bunker = 850.0 + (180.0 if month in [3, 4, 5, 6, 7] else 50.0)
            target_coal = 380.0 + (70.0 if month in [3, 4, 5, 6] else 0.0)
            target_usd = 104.0 + 0.02 * (month - 1)
            vol = 0.040
        elif year == 2023:
            target_bdi = 1350.0
            target_bunker = 620.0
            target_coal = 270.0
            target_usd = 103.0
            vol = 0.028
        elif year in [2024, 2025]:
            target_bdi = 1850.0 * seasonal_bdi_factor
            target_bunker = 640.0
            target_coal = 250.0
            target_usd = 104.5
            vol = 0.025
        else: # 2026
            target_bdi = 1750.0 * seasonal_bdi_factor
            target_bunker = 610.0
            target_coal = 240.0
            target_usd = 103.5
            vol = 0.022

        drift_bdi = 0.03 * (math.log(target_bdi) - log_bdi[t-1])
        log_bdi[t] = log_bdi[t-1] + drift_bdi + float(rng.normal(0, vol))

        bunker_price[t] = bunker_price[t-1] + 0.04 * (target_bunker - bunker_price[t-1]) + float(rng.normal(0, 12.0))
        coal_price[t] = coal_price[t-1] + 0.03 * (target_coal - coal_price[t-1]) + float(rng.normal(0, 6.0))
        usd_index[t] = usd_index[t-1] + 0.03 * (target_usd - usd_index[t-1]) + float(rng.normal(0, 0.4))

    bdi_values = np.exp(log_bdi)

    bci_values = np.round(bdi_values * (1.15 + 0.35 * np.sin(np.linspace(0, 20, n_days)) + rng.normal(0, 0.08, n_days)), 0)
    bci_values = np.maximum(800.0, bci_values)

    bpi_values = np.round(bdi_values * (0.95 + rng.normal(0, 0.04, n_days)), 0)
    bpi_values = np.maximum(650.0, bpi_values)

    bsi_values = np.round(bdi_values * (0.85 + rng.normal(0, 0.03, n_days)), 0)
    bsi_values = np.maximum(600.0, bsi_values)

    df_market = pd.DataFrame({
        "date": [d.strftime("%Y-%m-%d") for d in dates],
        "bdi": np.round(bdi_values, 1),
        "bci": np.round(bci_values, 1),
        "bpi": np.round(bpi_values, 1),
        "bsi": np.round(bsi_values, 1),
        "bunker_price": np.round(bunker_price, 2),
        "coal_price": np.round(coal_price, 2),
        "usd_index": np.round(usd_index, 2)
    })
    return df_market


# =====================================================================
# 6. FREIGHT HISTORY (freight.csv / freight_history)
# =====================================================================
def generate_freight_history(df_market, df_routes, rng):
    """
    Generates freight_history matching exact schema in api-contract.md:
    id, date, route, vessel_class, rate, bdi, bci, bpi, bsi, bunker_price, coal_price, usd_index
    """
    key_routes = [
        ("Australia-Paradip", 4950),
        ("Australia-Vizag", 4880),
        ("Australia-Gangavaram", 4875),
        ("Australia-Dhamra", 4980),
        ("Australia-Haldia", 5040),
        ("Indonesia-Paradip", 2320),
        ("Indonesia-Vizag", 2240),
        ("Indonesia-Dhamra", 2350),
        ("US_East_Coast-Paradip", 11650),
        ("US_East_Coast-Vizag", 11580),
        ("Mozambique-Paradip", 4420),
        ("Russia_Far_East-Vizag", 5210),
    ]

    vessel_classes_config = {
        "Capesize": {"index_col": "bci", "base_multiplier": 0.0035, "scale_discount": 0.72},
        "Panamax": {"index_col": "bpi", "base_multiplier": 0.0048, "scale_discount": 0.90},
        "Supramax": {"index_col": "bsi", "base_multiplier": 0.0062, "scale_discount": 1.05},
        "Handysize": {"index_col": "bsi", "base_multiplier": 0.0075, "scale_discount": 1.25}
    }

    freight_rows = []
    row_id = 1

    for _, m_row in df_market.iterrows():
        dt_str = m_row["date"]
        bdi = m_row["bdi"]
        bci = m_row["bci"]
        bpi = m_row["bpi"]
        bsi = m_row["bsi"]
        bunker = m_row["bunker_price"]
        coal = m_row["coal_price"]
        usd = m_row["usd_index"]

        month = int(dt_str[5:7])
        monsoon_premium = 1.12 if month in [6, 7, 8, 9] else 1.0

        for route_name, dist_nm in key_routes:
            compatible_classes = ["Handysize", "Supramax", "Panamax"]
            if "Haldia" not in route_name:
                compatible_classes.append("Capesize")
            if "US_East_Coast" in route_name:
                compatible_classes = ["Panamax", "Capesize"]

            for v_class in compatible_classes:
                cfg = vessel_classes_config[v_class]
                relevant_index = m_row[cfg["index_col"]]

                distance_factor = dist_nm / 4500.0
                index_component = relevant_index * cfg["base_multiplier"]
                bunker_component = (bunker / 600.0) * 8.5 * distance_factor

                base_rate = (10.0 * distance_factor + index_component + bunker_component) * cfg["scale_discount"]
                rate = round(base_rate * monsoon_premium + float(rng.normal(0, 0.45)), 2)
                rate = max(6.5, rate)

                freight_rows.append({
                    "id": row_id,
                    "date": dt_str,
                    "route": route_name,
                    "vessel_class": v_class,
                    "rate": rate,
                    "bdi": bdi,
                    "bci": bci,
                    "bpi": bpi,
                    "bsi": bsi,
                    "bunker_price": bunker,
                    "coal_price": coal,
                    "usd_index": usd
                })
                row_id += 1

    df_freight = pd.DataFrame(freight_rows)
    return df_freight


# =====================================================================
# 7. CARGO GENERATION
# =====================================================================
def generate_cargo(df_ports, rng, n_cargo=15000):
    """
    Generates realistic dry-bulk cargo demand records strictly matching api-contract.md:
    id, cargo_type, quantity, origin, destination_port_id, laycan_start, laycan_end,
    contract_preference, created_at
    """
    cargo_types = [
        ("Coking Coal", ["Hard Coking Coal", "Semi-Soft Coking Coal", "PCI Coal"], 0.60),
        ("Thermal Coal", ["Non-Coking Coal Grade G1-G5", "Indonesian High Calorie Coal"], 0.22),
        ("Iron Ore", ["Iron Ore Pellets", "Iron Ore Fines 62% Fe", "Lump Ore"], 0.12),
        ("Limestone", ["SMS Grade Limestone", "Calcined Lime"], 0.06)
    ]

    origins = [
        ("Hay Point, Australia", 15, "Australia"),
        ("Gladstone, Australia", 16, "Australia"),
        ("Newcastle, Australia", 17, "Australia"),
        ("Balikpapan, Indonesia", 19, "Indonesia"),
        ("Tanjung Priok, Indonesia", 20, "Indonesia"),
        ("Samarinda, Indonesia", 21, "Indonesia"),
        ("Norfolk, USA", 22, "USA"),
        ("Baltimore, USA", 23, "USA"),
        ("Maputo, Mozambique", 24, "Mozambique"),
        ("Vostochny, Russia", 26, "Russia"),
        ("Port Hedland, Australia", 18, "Australia")
    ]

    east_coast_dest_ids = [1, 2, 3, 4, 5, 6, 8, 9]
    dest_weights = [0.32, 0.22, 0.18, 0.14, 0.04, 0.05, 0.03, 0.02]

    class_parcels = {
        "Capesize": (140000, 185000),
        "Panamax": (65000, 82000),
        "Supramax": (50000, 62000),
        "Handysize": (25000, 38000)
    }

    start_date = datetime(2021, 1, 1)
    end_date = datetime(2026, 3, 20)
    date_range_days = (end_date - start_date).days

    cargo_list = []

    for c_id in range(1, n_cargo + 1):
        type_idx = int(rng.choice(len(cargo_types), p=[ct[2] for ct in cargo_types]))
        c_type_tuple = cargo_types[type_idx]
        c_type = c_type_tuple[0]
        commodity = rng.choice(c_type_tuple[1])

        orig_idx = int(rng.choice(len(origins)))
        origin_name, orig_port_id, orig_country = origins[orig_idx]
        dest_port_id = int(rng.choice(east_coast_dest_ids, p=dest_weights))

        dest_draft = df_ports.loc[df_ports["id"] == dest_port_id, "max_draft"].values[0]

        if dest_draft >= 17.0 and c_type in ["Coking Coal", "Iron Ore"] and rng.random() < 0.45:
            req_class = "Capesize"
        elif dest_draft >= 13.0 and rng.random() < 0.70:
            req_class = "Panamax"
        elif dest_draft >= 11.0:
            req_class = "Supramax"
        else:
            req_class = rng.choice(["Handysize", "Supramax"], p=[0.75, 0.25])

        p_min, p_max = class_parcels[req_class]
        quantity = int(round(rng.uniform(p_min, p_max), -2))

        day_offset = int(rng.integers(0, date_range_days))
        laycan_s = start_date + timedelta(days=day_offset)
        laycan_window_len = int(rng.choice([5, 7, 10, 14], p=[0.40, 0.40, 0.15, 0.05]))
        laycan_e = laycan_s + timedelta(days=laycan_window_len)

        loading_date = laycan_s + timedelta(days=int(rng.integers(1, laycan_window_len)))
        transit_est_days = 12 if "Indonesia" in origin_name else (22 if "Australia" in origin_name else 42)
        discharge_deadline = loading_date + timedelta(days=transit_est_days + int(rng.integers(5, 12)))

        created_at = (laycan_s - timedelta(days=int(rng.integers(7, 30)))).strftime("%Y-%m-%dT%H:%M:%SZ")
        contract_pref = rng.choice(["Spot", "CoA"], p=[0.68, 0.32])
        priority = rng.choice(["Normal", "High", "Urgent"], p=[0.75, 0.20, 0.05])

        base_rate = 14.5 if "Indonesia" in origin_name else (24.0 if "Australia" in origin_name else 38.0)
        rate = round(base_rate * (1.2 if req_class == "Handysize" else (0.85 if req_class == "Capesize" else 1.0)) + float(rng.normal(0, 1.5)), 2)

        cargo_list.append({
            "id": c_id,
            "cargo_type": c_type,
            "commodity": commodity,
            "quantity": quantity,
            "origin": origin_name,
            "destination_port_id": dest_port_id,
            "laycan_start": laycan_s.strftime("%Y-%m-%d"),
            "laycan_end": laycan_e.strftime("%Y-%m-%d"),
            "contract_preference": contract_pref,
            "required_vessel_type": req_class,
            "loading_date": loading_date.strftime("%Y-%m-%d"),
            "discharge_deadline": discharge_deadline.strftime("%Y-%m-%d"),
            "priority": priority,
            "contract_type": contract_pref,
            "freight_rate": rate,
            "currency": "USD",
            "charter_duration": transit_est_days + 8,
            "special_requirements": "Standard" if rng.random() > 0.15 else rng.choice(["Geared vessel required", "Low moisture cargo", "Self-unloader preferred", "Fast discharge required"]),
            "created_at": created_at
        })

    df_cargo = pd.DataFrame(cargo_list)
    return df_cargo


# =====================================================================
# 8. HISTORICAL VOYAGES GENERATION (50k - 75k records)
# =====================================================================
def generate_voyages(df_vessels, df_routes, df_ports, df_cargo, df_market, rng, n_voyages=65000):
    """
    Generates rich historical voyage dataset with realistic correlations:
    - Planned vs actual timings with authentic log-normal long-tailed delays
    - Fuel consumption matching naval architecture cubic relations and heavy weather penalties
    - Delay reasons conditional on vessel age, route risk, and port congestion
    - Pre-voyage features clearly separated from post-voyage outcomes to prevent ML leakage
    """
    vessel_lookup = df_vessels.set_index("vessel_id").to_dict("index")
    route_lookup = df_routes.set_index("route_id").to_dict("index")
    port_lookup = df_ports.set_index("id").to_dict("index")

    market_lookup = df_market.set_index("date").to_dict("index")
    market_dates = sorted(list(market_lookup.keys()))

    # Build calendar date to market info lookup for O(1) speed
    full_date_range = pd.date_range(start="2021-01-01", end="2026-04-01", freq="D")
    date_to_bunker = {}
    current_m_idx = 0
    n_m_dates = len(market_dates)
    for cal_dt in full_date_range:
        cal_str = cal_dt.strftime("%Y-%m-%d")
        # Find nearest market date
        while current_m_idx < n_m_dates - 1 and market_dates[current_m_idx + 1] <= cal_str:
            current_m_idx += 1
        date_to_bunker[cal_str] = market_lookup[market_dates[current_m_idx]]["bunker_price"]

    # Precompute candidate vessels per destination port based on draft & LOA constraints
    port_candidate_vessels = {}
    for p_id, p_row in df_ports.set_index("id").iterrows():
        p_draft = p_row["max_draft"]
        p_loa = p_row["max_loa"]
        effective_draft = p_draft + (1.2 if p_row["lightering_available"] else 0.0)
        candidate_df = df_vessels[
            (df_vessels["draft"] <= effective_draft) & 
            (df_vessels["length"] <= p_loa)
        ]
        if p_draft < 10.0:
            # Shallow ports like Haldia (8.5m) strictly allow only Handysize (and light Supramax)
            candidate_df = candidate_df[candidate_df["vessel_class"].isin(["Handysize", "Supramax"])]
        if len(candidate_df) == 0:
            candidate_df = df_vessels[df_vessels["vessel_class"] == "Handysize"]
        port_candidate_vessels[p_id] = candidate_df["vessel_id"].values

    r_ids = df_routes["route_id"].values
    c_ids = df_cargo["id"].values

    start_dt = datetime(2021, 1, 15)
    end_dt = datetime(2026, 3, 15)
    total_days = (end_dt - start_dt).days

    voyages = []

    for voy_idx in range(1, n_voyages + 1):
        voy_id = f"VOY_{voy_idx:06d}"

        r_id = int(rng.choice(r_ids))
        r_data = route_lookup[r_id]
        orig_port_id = r_data["origin_port_id"]
        dest_port_id = r_data["destination_port_id"]
        dist_nm = r_data["distance_nm"]

        dest_port = port_lookup[dest_port_id]

        # Select vessel strictly compatible with destination port constraints
        v_id = rng.choice(port_candidate_vessels[dest_port_id])
        v_data = vessel_lookup[v_id]

        day_offset = int(rng.integers(0, total_days))
        planned_dep = start_dt + timedelta(days=day_offset, hours=int(rng.integers(0, 24)))

        dep_delay_hrs = float(rng.exponential(scale=3.5))
        actual_dep = planned_dep + timedelta(hours=dep_delay_hrs)

        nominal_speed = v_data["cruising_speed"]
        avg_speed = round(nominal_speed + float(rng.normal(0, 0.4)), 2)
        avg_speed = max(10.0, min(16.5, avg_speed))

        planned_transit_hrs = dist_nm / nominal_speed
        planned_arr = planned_dep + timedelta(hours=planned_transit_hrs)

        dep_month = planned_dep.month
        is_monsoon = dep_month in [6, 7, 8, 9]
        base_weather = 0.55 if is_monsoon else 0.25
        weather_sev = round(min(1.0, max(0.05, base_weather + float(rng.normal(0, 0.18)))), 3)

        dest_base_cong = dest_port["congestion_index"]
        port_cong = round(min(1.0, max(0.05, dest_base_cong * (1.3 if is_monsoon else 1.0) + float(rng.normal(0, 0.12)))), 3)

        v_age = v_data["age"]
        r_risk = r_data["route_risk_score"]

        # Composite operational risk factor (0.0 to 1.0)
        risk_score = (
            0.15 * (v_age / 24.0) +
            0.15 * (1.0 - v_data["reliability_score"]) / 0.32 +
            0.20 * (r_risk / 10.0) +
            0.25 * weather_sev +
            0.25 * port_cong
        )
        risk_score = min(0.95, max(0.05, risk_score + float(rng.normal(0, 0.04))))

        # Conditioned probabilities for delay severity buckets
        p_high = min(0.25, max(0.03, 0.04 + 0.22 * risk_score))
        p_mod = min(0.35, max(0.10, 0.12 + 0.25 * risk_score))
        p_extreme = min(0.05, max(0.005, 0.005 + 0.04 * risk_score))
        p_low = max(0.35, 1.0 - (p_mod + p_high + p_extreme))
        total_p = p_low + p_mod + p_high + p_extreme
        p_low, p_mod, p_high, p_extreme = p_low/total_p, p_mod/total_p, p_high/total_p, p_extreme/total_p

        bucket = rng.choice(["low", "mod", "high", "extreme"], p=[p_low, p_mod, p_high, p_extreme])

        if bucket == "low":
            delay_hours = round(max(0.0, float(rng.exponential(scale=1.5 + 4.0 * risk_score))), 1)
            reason = "none" if delay_hours < 2.0 else rng.choice(["cargo_handling", "documentation", "berth_unavailability", "none"], p=[0.4, 0.3, 0.2, 0.1])
        elif bucket == "mod":
            delay_hours = round(10.0 + float(rng.exponential(scale=10.0 + 16.0 * risk_score)), 1)
            w_weather = 0.40 if weather_sev > 0.45 else 0.20
            w_cong = 0.40 if port_cong > 0.45 else 0.20
            w_berth = max(0.1, 1.0 - w_weather - w_cong)
            reason = rng.choice(["weather", "port_congestion", "berth_unavailability"], p=[w_weather, w_cong, w_berth])
        elif bucket == "high":
            delay_hours = round(38.0 + float(rng.exponential(scale=24.0 + 36.0 * risk_score)), 1)
            w_weather = 0.45 if weather_sev > 0.50 else 0.20
            w_cong = 0.35 if port_cong > 0.45 else 0.25
            w_mech = 0.30 if v_age > 15 else 0.15
            w_sum = w_weather + w_cong + w_mech
            reason = rng.choice(["weather", "port_congestion", "mechanical_failure"], p=[w_weather/w_sum, w_cong/w_sum, w_mech/w_sum])
        else: # extreme
            delay_hours = round(95.0 + float(rng.exponential(scale=45.0 + 55.0 * risk_score)), 1)
            reason = "weather" if weather_sev > 0.55 else ("mechanical_failure" if v_age > 15 else "port_congestion")

        actual_transit_hrs = (dist_nm / avg_speed) + (delay_hours * 0.4)
        port_waiting_hrs = delay_hours * 0.6
        actual_arr = actual_dep + timedelta(hours=actual_transit_hrs + port_waiting_hrs)

        days_at_sea = actual_transit_hrs / 24.0
        speed_ratio = avg_speed / nominal_speed
        weather_penalty = 1.0 + 0.22 * weather_sev
        fuel_consumed = round(v_data["fuel_consumption"] * (speed_ratio**2.8) * days_at_sea * weather_penalty, 1)

        cargo_id = int(rng.choice(c_ids)) if rng.random() < 0.88 else None

        dep_date_str = planned_dep.strftime("%Y-%m-%d")
        bunker_price = date_to_bunker.get(dep_date_str, 550.0)

        base_rate = (dist_nm / 4500.0) * 18.0 + (bunker_price / 600.0) * 6.0
        freight_rate = round(base_rate + float(rng.normal(0, 1.2)), 2)

        if planned_dep > datetime(2026, 3, 1):
            voyage_status = "In_Transit" if actual_arr > datetime(2026, 3, 20) else "Completed"
        else:
            voyage_status = "Completed" if rng.random() > 0.008 else "Diverted"

        voyages.append({
            "voyage_id": voy_id,
            "vessel_id": v_id,
            "route_id": r_id,
            "cargo_id": cargo_id,
            "origin_port_id": orig_port_id,
            "destination_port_id": dest_port_id,
            "planned_departure": planned_dep.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "actual_departure": actual_dep.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "planned_arrival": planned_arr.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "actual_arrival": actual_arr.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "distance_nm": dist_nm,
            "average_speed": avg_speed,
            "fuel_consumed": fuel_consumed,
            "freight_rate": freight_rate,
            "bunker_price": bunker_price,
            "weather_severity": weather_sev,
            "port_congestion": port_cong,
            "delay_hours": delay_hours,
            "delay_reason": reason,
            "voyage_status": voyage_status
        })

    df_voyages = pd.DataFrame(voyages)
    return df_voyages


# =====================================================================
# 9. WEATHER OBSERVATIONS GENERATION
# =====================================================================
def generate_weather(df_ports, rng, n_records=25000):
    """
    Generates spatiotemporal maritime weather data covering ports and waypoints.
    Exhibits temporal continuity, monsoon seasonality, and cyclonic storms in Bay of Bengal.
    """
    port_list = df_ports.to_dict("records")
    start_date = datetime(2021, 1, 1)

    weather_records = []

    for w_idx in range(1, n_records + 1):
        port_idx = int(rng.choice(len(port_list)))
        port = port_list[port_idx]
        p_id = port["id"]
        lat = port["latitude"]
        lon = port["longitude"]

        day_offset = int(rng.integers(0, 1880))
        hour = int(rng.choice([0, 6, 12, 18]))
        ts = start_date + timedelta(days=day_offset, hours=hour)
        month = ts.month

        is_indian_port = port["country"] == "India"
        is_sw_monsoon = is_indian_port and (month in [6, 7, 8, 9])
        is_cyclone_season = is_indian_port and (month in [5, 10, 11])

        base_wind = 24.0 if is_sw_monsoon else (14.0 if is_cyclone_season else 10.0)
        wind_speed = round(max(2.0, base_wind + float(rng.normal(0, 6.5))), 1)

        wave_height = round(max(0.4, 0.12 * wind_speed + float(rng.normal(0, 0.4))), 2)
        visibility = round(max(1.0, min(10.0, 10.0 - 0.18 * wave_height - (4.0 if is_sw_monsoon and rng.random() < 0.4 else 0.0))), 1)

        precip = round(max(0.0, (float(rng.exponential(scale=6.0)) if is_sw_monsoon else float(rng.exponential(scale=0.8)))), 1)

        storm_prob = round(min(0.98, max(0.02, 0.05 + 0.025 * wind_speed)), 3)
        cyclone_prob = round(min(0.85, max(0.01, (0.28 if is_cyclone_season and wind_speed > 28.0 else 0.02))), 3)

        weather_sev = round(min(1.0, max(0.05, 0.3 * (wind_speed / 45.0) + 0.4 * (wave_height / 6.0) + 0.3 * storm_prob)), 3)

        weather_records.append({
            "weather_id": w_idx,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "latitude": round(lat + float(rng.normal(0, 0.1)), 4),
            "longitude": round(lon + float(rng.normal(0, 0.1)), 4),
            "port_id": p_id,
            "wind_speed": wind_speed,
            "wave_height": wave_height,
            "visibility": visibility,
            "precipitation": precip,
            "storm_probability": storm_prob,
            "cyclone_probability": cyclone_prob,
            "weather_severity": weather_sev
        })

    df_weather = pd.DataFrame(weather_records)
    return df_weather


# =====================================================================
# 10. RISK EVENTS GENERATION
# =====================================================================
def generate_risk_events(df_ports, df_routes, rng, n_events=1200):
    """
    Generates operational risk events strictly matching api-contract.md:
    id, event_type, route, port_id, severity, description, event_date, source
    """
    event_types = ["freight_anomaly", "port_congestion", "weather", "geopolitical"]
    severities = ["Low", "Medium", "High"]

    port_ids = df_ports["id"].values
    port_names = dict(zip(df_ports["id"], df_ports["name"]))
    routes = df_routes["route"].unique()

    start_date = datetime(2021, 1, 1)

    descriptions = {
        "freight_anomaly": [
            "Sudden freight spike (+18% DoD) driven by tightening Capesize tonnage in Pacific basin.",
            "BDI index surged 250 points following unexpected chartering volume for Queensland coal.",
            "Panamax Atlantic round voyage rates collapsed -12% on low grain demand.",
            "Bunker fuel price volatility exceeds 90th percentile following crude market rally."
        ],
        "port_congestion": [
            "Berth queue exceeding 12 vessels; average waiting time rose to 78 hours.",
            "Mechanized coal conveyor breakdown causing delayed discharge at mechanized berths.",
            "Tidal window restrictions combined with dredging operations causing vessel hold-ups.",
            "High yard inventory utilization (>92%) slowing down discharge rates."
        ],
        "weather": [
            "Tropical Cyclone alert issued for Bay of Bengal; port operations suspended for 48 hours.",
            "Heavy monsoon swell (>4.2m) preventing safe pilot boarding at outer anchorage.",
            "Dense fog conditions restricting channel navigation to daylight hours only.",
            "Typhoon warning in South China Sea requiring southern deviation for westbound bulkers."
        ],
        "geopolitical": [
            "Red Sea security advisory prompting operators to route via Cape of Good Hope (+14 days).",
            "Sanction compliance verification tightening on Far East coal flows.",
            "Canal transit quota reduction increasing reservation auction premiums.",
            "Export tariff modification announced by major coal-producing authority."
        ]
    }

    sources = {
        "freight_anomaly": ["Baltic Exchange Market Monitor", "FreightIQ Anomaly Engine", "Clarksons Intelligence"],
        "port_congestion": ["Port Authority Circular", "AIS Congestion Tracker", "Terminal Operations Log"],
        "weather": ["India Meteorological Department (IMD)", "JTWC Cyclone Warning", "Marine Weather Routing Service"],
        "geopolitical": ["Maritime Security Advisory", "Lloyd's List Intelligence", "Ministry Trade Notice"]
    }

    events = []

    for ev_id in range(1, n_events + 1):
        ev_type = rng.choice(event_types, p=[0.25, 0.35, 0.25, 0.15])
        p_id = int(rng.choice(port_ids))
        p_name = port_names[p_id]
        route = rng.choice(routes)
        sev = rng.choice(severities, p=[0.45, 0.40, 0.15])

        day_offset = int(rng.integers(0, 1880))
        ev_date = (start_date + timedelta(days=day_offset)).strftime("%Y-%m-%d")

        desc_template = rng.choice(descriptions[ev_type])
        desc = f"[{p_name} / {route}] {desc_template}"
        source = rng.choice(sources[ev_type])

        events.append({
            "id": ev_id,
            "event_type": ev_type,
            "route": route,
            "port_id": p_id,
            "severity": sev,
            "description": desc,
            "event_date": ev_date,
            "source": source
        })

    df_risks = pd.DataFrame(events)
    return df_risks


# =====================================================================
# 11. BUNKER PRICES GENERATION
# =====================================================================
def generate_bunker_prices(rng):
    """
    Generates daily regional bunker fuel benchmark prices for Singapore, Fujairah,
    Rotterdam, Visakhapatnam, and Houston.
    """
    dates = pd.date_range(start="2021-01-01", end="2026-03-31", freq="B")
    ports = [
        ("Singapore", 1.0, 1.0),
        ("Fujairah", 0.98, 1.02),
        ("Rotterdam", 0.95, 0.98),
        ("Visakhapatnam", 1.06, 1.08),
        ("Houston", 0.93, 0.96)
    ]

    records = []
    b_id = 1

    base_vlsfo = 520.0

    for dt in dates:
        dt_str = dt.strftime("%Y-%m-%d")
        year = dt.year

        if year == 2022:
            base_vlsfo = 780.0 + 120.0 * math.sin(dt.dayofyear / 50.0)
        elif year == 2021:
            base_vlsfo = 480.0 + 0.3 * dt.dayofyear
        else:
            base_vlsfo = 620.0 + 35.0 * math.sin(dt.dayofyear / 60.0)

        for port_name, p_mult, mgo_mult in ports:
            vlsfo_price = round(base_vlsfo * p_mult + float(rng.normal(0, 5.0)), 2)
            lsmgo_price = round(vlsfo_price * 1.28 * mgo_mult + float(rng.normal(0, 7.0)), 2)
            ifo_price = round(vlsfo_price * 0.72 + float(rng.normal(0, 4.0)), 2)

            for f_type, f_price in [("VLSFO", vlsfo_price), ("LSMGO", lsmgo_price), ("IFO380", ifo_price)]:
                records.append({
                    "id": b_id,
                    "date": dt_str,
                    "port_name": port_name,
                    "fuel_type": f_type,
                    "price_usd_per_mt": f_price
                })
                b_id += 1

    df_bunker = pd.DataFrame(records)
    return df_bunker


# =====================================================================
# 12. INJECT CONTROLLED REALISTIC IMPERFECTIONS
# =====================================================================
def inject_realistic_imperfections(df_vessels, df_cargo, df_voyages, df_weather, rng):
    """
    Introduces controlled, domain-realistic data imperfections:
    - 1-4% missing values in operational fields (weather sensor, auxiliary fuel, minor delay reasons)
    - Minor casing variation in ~1.5% non-key text records ('Hard Coking Coal' -> 'hard coking coal')
    - 0.4% duplicate voyage status records (representing dual AIS/agent transmissions)
    - ZERO corruption of primary keys or referential integrity.
    """
    print("Injecting controlled realistic operational imperfections...")

    weather_mask = rng.random(len(df_weather)) < 0.035
    df_weather.loc[weather_mask, "wave_height"] = np.nan
    precip_mask = rng.random(len(df_weather)) < 0.025
    df_weather.loc[precip_mask, "precipitation"] = np.nan

    minimal_delay = df_voyages["delay_hours"] < 1.0
    df_voyages.loc[minimal_delay & (rng.random(len(df_voyages)) < 0.15), "delay_reason"] = np.nan

    fuel_mask = (df_voyages["planned_departure"] < "2022-06-01") & (rng.random(len(df_voyages)) < 0.025)
    df_voyages.loc[fuel_mask, "fuel_consumed"] = np.nan

    casing_mask = rng.random(len(df_cargo)) < 0.018
    df_cargo.loc[casing_mask, "commodity"] = df_cargo.loc[casing_mask, "commodity"].apply(
        lambda x: x.lower() if rng.random() < 0.5 else f" {x} "
    )

    n_dupes = int(len(df_voyages) * 0.004)
    dupe_indices = rng.choice(df_voyages.index, size=n_dupes, replace=False)
    dupe_rows = df_voyages.loc[dupe_indices].copy()
    df_voyages_final = pd.concat([df_voyages, dupe_rows], ignore_index=True)

    return df_vessels, df_cargo, df_voyages_final, df_weather


# =====================================================================
# MAIN GENERATION PIPELINE
# =====================================================================
def main():
    args = parse_args()
    print(f"=== FreightIQ Dataset Generator ===")
    print(f"Random seed: {args.seed}")
    print(f"Target voyages: {args.voyages}")
    print(f"Output directory: {args.output_dir}")

    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)

    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Ports
    print("\n[1/10] Generating ports.csv...")
    df_ports = generate_ports(rng)
    ports_path = os.path.join(args.output_dir, "ports.csv")
    df_ports.to_csv(ports_path, index=False)
    print(f"Generated {len(df_ports)} ports -> {ports_path}")

    # 2. Vessel Classes
    print("\n[2/10] Generating vessel_classes.csv...")
    df_classes = generate_vessel_classes()
    classes_path = os.path.join(args.output_dir, "vessel_classes.csv")
    df_classes.to_csv(classes_path, index=False)
    print(f"Generated {len(df_classes)} vessel classes -> {classes_path}")

    # 3. Vessels
    print("\n[3/10] Generating vessels.csv...")
    df_vessels = generate_vessels(df_classes, df_ports, rng, n_vessels=350)
    vessels_path = os.path.join(args.output_dir, "vessels.csv")
    df_vessels.to_csv(vessels_path, index=False)
    print(f"Generated {len(df_vessels)} vessels -> {vessels_path}")

    # 4. Routes
    print("\n[4/10] Generating routes.csv...")
    df_routes = generate_routes(df_ports, rng)
    routes_path = os.path.join(args.output_dir, "routes.csv")
    df_routes.to_csv(routes_path, index=False)
    print(f"Generated {len(df_routes)} routes -> {routes_path}")

    # 5. Market Macro Time Series
    print("\n[5/10] Generating market macro time series (2021-2026)...")
    df_market = generate_market_time_series(rng)

    # 6. Freight History (freight.csv & freight_history.csv)
    print("\n[6/10] Generating freight.csv and freight_history.csv...")
    df_freight = generate_freight_history(df_market, df_routes, rng)
    freight_path = os.path.join(args.output_dir, "freight.csv")
    freight_hist_path = os.path.join(args.output_dir, "freight_history.csv")
    df_freight.to_csv(freight_path, index=False)
    df_freight.to_csv(freight_hist_path, index=False)
    print(f"Generated {len(df_freight)} freight history rows -> {freight_path}")

    # 7. Cargo
    print(f"\n[7/10] Generating cargo.csv ({args.cargo} records)...")
    df_cargo = generate_cargo(df_ports, rng, n_cargo=args.cargo)
    cargo_path = os.path.join(args.output_dir, "cargo.csv")
    df_cargo.to_csv(cargo_path, index=False)
    print(f"Generated {len(df_cargo)} cargo records -> {cargo_path}")

    # 8. Weather
    print("\n[8/10] Generating weather.csv...")
    df_weather = generate_weather(df_ports, rng, n_records=25000)

    # 9. Voyages
    print(f"\n[9/10] Generating voyages.csv ({args.voyages} records)...")
    df_voyages = generate_voyages(df_vessels, df_routes, df_ports, df_cargo, df_market, rng, n_voyages=args.voyages)

    # 10. Risk Events & Bunker Prices
    print("\n[10/10] Generating risk_events.csv and bunker_prices.csv...")
    df_risks = generate_risk_events(df_ports, df_routes, rng, n_events=1200)
    risks_path = os.path.join(args.output_dir, "risk_events.csv")
    df_risks.to_csv(risks_path, index=False)

    df_bunker = generate_bunker_prices(rng)
    bunker_path = os.path.join(args.output_dir, "bunker_prices.csv")
    df_bunker.to_csv(bunker_path, index=False)

    # Inject controlled imperfections
    df_vessels, df_cargo, df_voyages, df_weather = inject_realistic_imperfections(
        df_vessels, df_cargo, df_voyages, df_weather, rng
    )

    # Save final imperfect datasets
    voyages_path = os.path.join(args.output_dir, "voyages.csv")
    df_voyages.to_csv(voyages_path, index=False)
    print(f"Saved {len(df_voyages)} voyage records (including 0.4% dupes) -> {voyages_path}")

    weather_path = os.path.join(args.output_dir, "weather.csv")
    df_weather.to_csv(weather_path, index=False)
    print(f"Saved {len(df_weather)} weather observations -> {weather_path}")

    print("\n>>> All FreightIQ synthetic datasets generated successfully! <<<")

if __name__ == "__main__":
    main()
