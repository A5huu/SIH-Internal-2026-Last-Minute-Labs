# FreightIQ MVP Maritime Logistics — Data Dictionary

**Document Version:** 1.0.0  
**Domain:** AI/ML-driven Maritime Logistics & Dry-Bulk Chartering Decision Support  
**Scope:** Synthetic Operational & Historical Dataset for SIH Problem Statement 26006 (Ministry of Steel)

---

## Overview & Synthetic Data Disclaimer
All datasets documented herein are **synthetically generated** specifically for the FreightIQ MVP platform. They simulate realistic commercial shipping operations, naval architecture physics, Baltic Exchange freight indices, monsoon/cyclonic weather disruptions, and East Coast Indian port constraints. They do not represent proprietary internal fixture records of any commercial vessel operator or government entity.

---

## Entity Relationship Summary

```
                      ┌───────────────────────┐
                      │     vessel_classes    │
                      └──────────┬────────────┘
                                 │ 1:N
                                 ▼
┌─────────────────┐ 1:N       ┌───────────────────────┐
│      ports      │──────────▶│        vessels        │
└────────┬────────┘ (current) └──────────┬────────────┘
         │ 1:N                           │
         │ (orig/dest)                   │
         ▼                               │
┌─────────────────┐                      │
│     routes      │◀─────────────┐       │
└────────┬────────┘              │       │
         │ 1:N                   │       │
         ▼                       │       │
┌─────────────────┐ 1:N          │       │ 1:N
│      cargo      │              │       │
└────────┬────────┘              │       │
         │ 1:N                   │       │
         ▼                       │       │
┌────────────────────────────────┴───────┴────────────┐
│                       voyages                       │
└─────────────────────────────────────────────────────┘
```

---

## 1. `ports.csv`
**Description:** Physical infrastructure, tidal constraints, handling capacities, and congestion baselines for East Coast India discharge ports and key overseas loading hubs.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. 32` | **Primary Key** | Unique identifier for each port terminal. |
| `name` | String | e.g., "Paradip", "Visakhapatnam" | Unique | Official port name. |
| `country` | String | e.g., "India", "Australia", "USA" | — | Sovereign nation where the port is located. |
| `latitude` | Float | `-90.0 .. 90.0` (Degrees) | — | Geographic latitude of outer navigational channel. |
| `longitude` | Float | `-180.0 .. 180.0` (Degrees) | — | Geographic longitude of outer navigational channel. |
| `port_type` | String | `Bulk`, `Multi-purpose`, `Container` | — | Primary cargo categorization. |
| `max_draft` | Float | `7.5 .. 22.5` (Meters) | **Physical Constraint** | Maximum permissible laden vessel draft at mean low water springs (MLWS). |
| `max_loa` | Float | `170.0 .. 420.0` (Meters) | **Physical Constraint** | Maximum permissible length overall (LOA) for berth approach. |
| `max_beam` | Float | `26.0 .. 65.0` (Meters) | **Physical Constraint** | Maximum permissible vessel breadth (beam) for berth pockets. |
| `handling_rate`| Integer | Tonnes/Day (`12,000 .. 120,000`) | — | Mechanized discharge rate under normal operating conditions. |
| `lightering_available` | Boolean | `True`, `False` | — | Whether offshore transshipment / lighterage is operational for deep-draft vessels. |
| `berth_count` | Integer | `4 .. 90` | — | Total active dry-bulk and multi-purpose berths. |
| `congestion_index` | Float | `0.0 .. 1.0` | Baseline | Historical queuing index (0 = zero delay, 1 = saturated anchorage). |
| `turnaround_time` | Float | Hours (`20.0 .. 72.0`) | Baseline | Average vessel port stay from pilot on-board to departure. |
| `storage_capacity` | Integer | Metric Tonnes | — | Total port stockyard capacity for dry bulk. |
| `weather_risk` | String | `Low`, `Medium`, `High` | — | Propensity for swell, cyclone, or monsoon stoppage. |
| `seasonal_congestion_factor` | Float | `1.0 .. 1.6` | Multiplier | Surge multiplier during peak monsoon or export cycles. |
| `operating_hours` | String | `24/7`, `Tidal`, `Daylight` | — | Navigational operating window. |
| `updated_at` | String | ISO 8601 Timestamp | — | Timestamp of last constraint audit. |

---

## 2. `vessel_classes.csv`
**Description:** Canonical benchmark vessel classifications used across dry-bulk chartering and port feasibility logic strictly adhering to `api-contract.md`.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. 4` | **Primary Key** | Unique class identifier. |
| `name` | String | `Handysize`, `Supramax`, `Panamax`, `Capesize` | Enum | Standard commercial bulker classification. |
| `min_dwt` | Integer | Metric Tonnes (`15,000 .. 150,000`) | — | Minimum deadweight tonnage boundary. |
| `max_dwt` | Integer | Metric Tonnes (`40,000 .. 210,000`) | — | Maximum deadweight tonnage boundary. |
| `typical_draft`| Float | Meters (`10.0 .. 17.5`) | — | Typical laden draft for the class. |
| `typical_loa` | Float | Meters (`180.0 .. 295.0`) | — | Typical length overall for the class. |
| `typical_beam` | Float | Meters (`28.0 .. 45.0`) | — | Typical beam for the class. |

---

## 3. `vessels.csv`
**Description:** Fleet inventory of individual merchant bulk carriers with realistic naval architecture specifications, age degradation, and operational status.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `vessel_id` | String | e.g., `V0001 .. V0350` | **Primary Key** | Unique vessel identifier. |
| `vessel_name` | String | e.g., "Star Pioneer" | — | Registered vessel name. |
| `vessel_class` | String | `Handysize`, `Supramax`, `Panamax`, `Capesize` | Matches `vessel_classes.name` | Vessel class. |
| `vessel_type` | String | Same as `vessel_class` | — | Aliased for backward compatibility. |
| `dwt` | Integer | Metric Tonnes (`18,000 .. 208,000`) | Correlated | Total deadweight carrying capacity. |
| `capacity` | Integer | Cubic Meters (`22,000 .. 260,000`) | Correlated | Grain cubic capacity of cargo holds. |
| `length` | Float | Meters (`160.0 .. 302.0`) | Correlated | Length Overall (LOA). |
| `beam` | Float | Meters (`26.0 .. 45.5`) | Correlated | Extreme vessel breadth (Beam). |
| `draft` | Float | Meters (`8.8 .. 18.3`) | Correlated | Maximum summer laden draft. |
| `age` | Integer | Years (`1 .. 24`) | `2026 - build_year` | Chronological age of the hull and machinery. |
| `build_year` | Integer | `2002 .. 2025` | — | Year of shipyard delivery. |
| `engine_power` | Integer | Kilowatts (`5,500 .. 22,000`) | Correlated | Maximum Continuous Rating (MCR) of main propulsion engine. |
| `fuel_type` | String | `VLSFO`, `VLSFO/Scrubber`, `LNG Dual Fuel` | — | Primary bunkering grade. |
| `fuel_consumption`| Float | MT/Day (`18.0 .. 58.0`) | Physics Model | Main engine fuel consumption at cruising speed. |
| `cruising_speed`| Float | Knots (`11.5 .. 14.5`) | Physics Model | Economical cruising speed laden in calm seas. |
| `max_speed` | Float | Knots (`13.5 .. 16.5`) | — | Maximum trials speed. |
| `flag` | String | e.g., "India", "Panama", "Marshall Islands" | — | Flag state of registry. |
| `owner_operator`| String | e.g., "Oldendorff Carriers", "SCI" | — | Commercial owner or disponent manager. |
| `current_port_id`| Integer | `1 .. 32` | **Foreign Key** (`ports.id`) | Last reported AIS position or port stay. |
| `operational_status`| String | `Underway`, `At Berth`, `At Anchor`, `In Maintenance` | — | Live operational status. |
| `availability_date` | String | `YYYY-MM-DD` | — | Next available open fixture date. |
| `reliability_score` | Float | `0.68 .. 0.99` | Degradation Model | Maintenance reliability index (inversely correlated with age). |

---

## 4. `routes.csv`
**Description:** Navigational corridors connecting overseas loading terminals with Indian coastal discharge ports.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `route_id` | Integer | `1 .. 42` | **Primary Key** | Unique route identifier. |
| `route` | String | e.g., "Australia-Paradip", "Indonesia-Vizag" | Canonical Name | Standardized market trade lane key. |
| `route_name` | String | e.g., "Hay Point to Paradip" | — | Verbose origin and destination port pair. |
| `origin_port_id`| Integer | `1 .. 32` | **Foreign Key** (`ports.id`) | Loading port. |
| `destination_port_id`| Integer| `1 .. 32` | **Foreign Key** (`ports.id`) | Discharge port. |
| `distance_nm` | Integer | Nautical Miles (`210 .. 11,720`) | Great Circle / Waypoint | Navigated sea distance. |
| `typical_transit_hours`| Float| Hours (`28.0 .. 915.0`) | Distance / Speed | Standard sea transit duration including port margins. |
| `canal_required`| String | `Torres Strait`, `Malacca`, `Cape of Good Hope`, `None` | — | Major maritime chokepoints encountered. |
| `canal_type` | String | `Malacca`, `Cape`, `None` | — | Chokepoint category. |
| `piracy_risk` | String | `Low`, `Medium`, `High` | — | Piracy risk rating. |
| `weather_risk` | String | `Low`, `Medium`, `High` | — | Seasonal wave/wind hazard profile. |
| `congestion_risk`| String | `Low`, `Medium`, `High` | — | Bottleneck risk at destination. |
| `historical_delay_rate`| Float| `0.08 .. 0.30` | — | Historical probability of voyage incurring >24h delay. |
| `typical_fuel_consumption`| Float| Metric Tonnes | — | Benchmark fuel burn for a Panamax bulk carrier. |
| `route_risk_score`| Float | `1.0 .. 10.0` | Synthetic Score | Composite multi-factor operational risk index. |

---

## 5. `cargo.csv`
**Description:** Individual bulk cargo import demands, laycan fixture windows, and procurement requirements.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. 15,000` | **Primary Key** | Unique cargo requisition ID. |
| `cargo_type` | String | `Coking Coal`, `Thermal Coal`, `Iron Ore`, `Limestone` | — | Primary commodity group. |
| `commodity` | String | e.g., "Hard Coking Coal", "PCI Coal" | — | Specific industrial grade. |
| `quantity` | Integer | Metric Tonnes (`25,000 .. 185,000`) | Matches Vessel Class | Parcel size. |
| `origin` | String | e.g., "Hay Point, Australia" | — | Origin port and country name. |
| `destination_port_id`| Integer| `1 .. 10` | **Foreign Key** (`ports.id`) | Indian discharge port. |
| `laycan_start` | String | `YYYY-MM-DD` | — | First day of vessel presentation window at loading port. |
| `laycan_end` | String | `YYYY-MM-DD` | `> laycan_start` | Cancelling date for charterers. |
| `contract_preference`| String | `Spot`, `CoA` | Enum | Commercial contract structure preference. |
| `required_vessel_type`| String| `Handysize`, `Supramax`, `Panamax`, `Capesize` | — | Vessel class required by parcel size and port draft. |
| `loading_date` | String | `YYYY-MM-DD` | Within Laycan | Planned commencement of cargo loading. |
| `discharge_deadline` | String | `YYYY-MM-DD` | Post-Transit | Required delivery deadline at Indian steel plant. |
| `priority` | String | `Normal`, `High`, `Urgent` | — | Commercial urgency flag. |
| `contract_type` | String | `Spot`, `CoA` | — | Contract categorization. |
| `freight_rate` | Float | USD / Tonne (`12.0 .. 45.0`) | Market Model | Baseline negotiated freight rate. |
| `currency` | String | `USD` | — | Denomination currency. |
| `charter_duration`| Integer | Days (`15 .. 60`) | — | Total laytime and steaming charter period. |
| `special_requirements`| String| `None`, `Geared vessel required`, `Low moisture cargo` | — | Cargo handling riders. |
| `created_at` | String | ISO 8601 Timestamp | — | Timestamp of cargo entry in FreightIQ. |

---

## 6. `freight.csv` & `freight_history.csv`
**Description:** Historical time series of dry-bulk freight benchmark rates and Baltic Exchange macroeconomic drivers (2021-01-01 to 2026-03-31), matching `api-contract.md`.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. N` | **Primary Key** | Unique time series row identifier. |
| `date` | String | `YYYY-MM-DD` | Daily Trading Days | Date of market assessment. |
| `route` | String | e.g., "Australia-Paradip" | **Foreign Key** (`routes.route`) | Standardized trade lane identifier. |
| `vessel_class`| String | `Handysize`, `Supramax`, `Panamax`, `Capesize` | Matches `vessel_classes.name` | Target vessel class. |
| `rate` | Float | USD / Metric Tonne (`6.5 .. 48.0`) | **ML Target** | Route freight rate assessment. |
| `bdi` | Float | Points (`800.0 .. 5,650.0`) | Exogenous Feature | Baltic Dry Index composite benchmark. |
| `bci` | Float | Points (`900.0 .. 8,800.0`) | Exogenous Feature | Baltic Capesize Index. |
| `bpi` | Float | Points (`750.0 .. 4,400.0`) | Exogenous Feature | Baltic Panamax Index. |
| `bsi` | Float | Points (`650.0 .. 3,600.0`) | Exogenous Feature | Baltic Supramax Index. |
| `bunker_price`| Float | USD / Metric Tonne (`380.0 .. 1,120.0`)| Cost Feature | VLSFO Singapore bunker fuel price. |
| `coal_price` | Float | USD / Metric Tonne (`120.0 .. 450.0`) | Commodity Feature | Queensland/Newcastle coking coal benchmark. |
| `usd_index` | Float | Index Points (`89.0 .. 114.0`) | Macro Feature | US Dollar Index (DXY). |

---

## 7. `voyages.csv`
**Description:** Historical individual voyage executions capturing scheduled vs actual timelines, delays, fuel consumption, and weather severity.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `voyage_id` | String | e.g., `VOY_000001` | **Primary Key** | Unique voyage operational identifier. |
| `vessel_id` | String | e.g., `V0001` | **Foreign Key** (`vessels.vessel_id`)| Performing bulk carrier. |
| `route_id` | Integer | `1 .. 42` | **Foreign Key** (`routes.route_id`) | Navigated route. |
| `cargo_id` | Integer | `1 .. 15000` or `NaN` | **Foreign Key** (`cargo.id`) | Transported cargo (null for ballast positioning). |
| `origin_port_id`| Integer| `1 .. 32` | **Foreign Key** (`ports.id`) | Actual departure port. |
| `destination_port_id`| Integer| `1 .. 32` | **Foreign Key** (`ports.id`) | Actual discharge port. |
| `planned_departure`| String| ISO 8601 Timestamp | **Pre-Voyage Feature** | Scheduled departure date & time. |
| `actual_departure` | String| ISO 8601 Timestamp | Operational Reality | Recorded time of lines cast off. |
| `planned_arrival` | String| ISO 8601 Timestamp | **Pre-Voyage Feature** | Initial charter party Estimated Time of Arrival (ETA). |
| `actual_arrival` | String| ISO 8601 Timestamp | **Post-Voyage Outcome** | Recorded time vessel dropped anchor / berthed. |
| `distance_nm` | Integer | Nautical Miles | — | Sea distance sailed. |
| `average_speed` | Float | Knots (`10.0 .. 16.5`) | — | Average speed made good over ground. |
| `fuel_consumed` | Float | Metric Tonnes (`80.0 .. 2,400.0`)| Naval Physics Outcome | Total heavy/very low sulfur fuel oil consumed. |
| `freight_rate` | Float | USD / Tonne | Economic Outcome | Fixture freight rate for the voyage. |
| `bunker_price` | Float | USD / Tonne | Economic Driver | Bunker fuel price at bunkering port. |
| `weather_severity`| Float | `0.0 .. 1.0` | Operational Signal | Normalized mean weather severity encountered. |
| `port_congestion` | Float | `0.0 .. 1.0` | Operational Signal | Normalized destination port queue severity. |
| `delay_hours` | Float | Hours (`0.0 .. 280.0`) | **ML Target (Delay)** | Net voyage delay (actual - planned arrival). |
| `delay_reason` | String | `weather`, `port_congestion`, `mechanical_failure`, `berth_unavailability`, `cargo_handling`, `customs`, `none` | **Post-Voyage Outcome** | Primary categorized cause of operational delay. |
| `voyage_status` | String | `Completed`, `In_Transit`, `Diverted` | Operational State | Lifecycle state of the voyage. |

---

## 8. `weather.csv`
**Description:** Meteorological and oceanographic time-series observations at key coastal ports and sea waypoints.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `weather_id` | Integer | `1 .. 25000` | **Primary Key** | Unique observation ID. |
| `timestamp` | String | ISO 8601 Timestamp | — | Observation time. |
| `latitude` | Float | Degrees | — | Latitude coordinate. |
| `longitude` | Float | Degrees | — | Longitude coordinate. |
| `port_id` | Integer | `1 .. 32` | **Foreign Key** (`ports.id`) | Associated port terminal. |
| `wind_speed` | Float | Knots (`2.0 .. 58.0`) | — | Sustained surface wind speed. |
| `wave_height` | Float | Meters (`0.4 .. 7.8`) | — | Significant wave height (Hs). |
| `visibility` | Float | Nautical Miles (`1.0 .. 10.0`) | — | Horizontal meteorological visibility. |
| `precipitation`| Float | mm / hour (`0.0 .. 45.0`) | — | Rainfall rate. |
| `storm_probability`| Float | `0.0 .. 1.0` | — | Statistical probability of severe squall / storm. |
| `cyclone_probability`| Float| `0.0 .. 1.0` | — | Risk of tropical cyclonic depression in Bay of Bengal. |
| `weather_severity` | Float| `0.0 .. 1.0` | Composite | Overall sea-state operational disruption score. |

---

## 9. `risk_events.csv`
**Description:** Domain-specific operational risk notifications matching `api-contract.md` schemas for early warning feeds.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. 1200` | **Primary Key** | Unique risk alert ID. |
| `event_type` | String | `freight_anomaly`, `port_congestion`, `weather`, `geopolitical` | Enum | Categorical event classification. |
| `route` | String | e.g., "Australia-Paradip" | Canonical Route | Associated commercial shipping route. |
| `port_id` | Integer | `1 .. 32` | **Foreign Key** (`ports.id`) | Impacted port facility. |
| `severity` | String | `Low`, `Medium`, `High` | Enum | Assessed impact severity level. |
| `description` | String | Text | — | Operational summary of the disruption event. |
| `event_date` | String | `YYYY-MM-DD` | — | Date event was logged. |
| `source` | String | e.g., "IMD Cyclone Warning", "AIS Congestion Tracker" | — | Originating intelligence stream. |

---

## 10. `bunker_prices.csv`
**Description:** Daily regional bunker fuel prices across major global bunkering stations.

| Column Name | Data Type | Unit / Allowed Values | Key / Constraints | Description |
|---|---|---|---|---|
| `id` | Integer | `1 .. N` | **Primary Key** | Unique record ID. |
| `date` | String | `YYYY-MM-DD` | — | Pricing date. |
| `port_name` | String | e.g., "Singapore", "Fujairah", "Rotterdam", "Visakhapatnam", "Houston" | — | Physical bunkering port. |
| `fuel_type` | String | `VLSFO`, `LSMGO`, `IFO380` | — | Grade of marine fuel. |
| `price_usd_per_mt`| Float | USD / Metric Tonne (`320.0 .. 1,250.0`) | — | Spot delivered price per metric tonne. |
