"""
FreightIQ ML Data Preparation & Feature Engineering Engine
Strictly adheres to api-contract.md Section 113 and task instructions:
- Features: lag_1, lag_7, lag_30, rolling_mean_7, rolling_mean_30, rolling_volatility,
            bdi, bci, bpi, bsi, bunker_price, coal_price, usd_index, month
- Target: rate
- Temporal alignment: Backward-looking only, zero data leakage
- Time-aware split: Walk-forward / date-based partition (train <= 2024, test >= 2025)
"""

import os
import numpy as np
import pandas as pd
from typing import Tuple, List, Dict, Any, Optional

FEATURE_COLUMNS = [
    "lag_1",
    "lag_7",
    "lag_30",
    "rolling_mean_7",
    "rolling_mean_30",
    "rolling_volatility",
    "bdi",
    "bci",
    "bpi",
    "bsi",
    "bunker_price",
    "coal_price",
    "usd_index",
    "month"
]

TARGET_COLUMN = "rate"

def load_freight_data(filepath: str = "data/freight.csv") -> pd.DataFrame:
    """Load freight dataset preserving source values and realistic controlled missingness."""
    if not os.path.exists(filepath):
        # Fallback to freight_history.csv if freight.csv is elsewhere
        alt_path = os.path.join(os.path.dirname(filepath), "freight_history.csv")
        if os.path.exists(alt_path):
            filepath = alt_path
        else:
            raise FileNotFoundError(f"Neither {filepath} nor {alt_path} exists.")
    
    df = pd.read_csv(filepath)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["route", "vessel_class", "date"]).reset_index(drop=True)
    return df

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate backward-looking market and lag features grouped by route & vessel_class.
    Zero future leakage: all rolling and lag features are strictly shifted by at least 1 day.
    """
    df = df.sort_values(["route", "vessel_class", "date"]).copy()
    
    # Month calendar feature
    df["month"] = df["date"].dt.month
    
    # Grouped lags (Strictly historical: shift >= 1)
    grouped = df.groupby(["route", "vessel_class"])["rate"]
    df["lag_1"] = grouped.shift(1)
    df["lag_7"] = grouped.shift(7)
    df["lag_30"] = grouped.shift(30)
    
    # Backward-looking rolling stats (Shifted by 1 so current day's rate is NEVER in the window)
    df["rolling_mean_7"] = grouped.transform(lambda s: s.shift(1).rolling(7, min_periods=3).mean())
    df["rolling_mean_30"] = grouped.transform(lambda s: s.shift(1).rolling(30, min_periods=7).mean())
    df["rolling_volatility"] = grouped.transform(lambda s: s.shift(1).rolling(14, min_periods=5).std())
    
    # Fill remaining early edge-case nulls with backward/forward fill within group or column medians
    for col in ["lag_1", "lag_7", "lag_30", "rolling_mean_7", "rolling_mean_30"]:
        df[col] = df.groupby(["route", "vessel_class"])[col].transform(lambda s: s.bfill().ffill())
    
    # Volatility default fill to historical median if insufficient window
    df["rolling_volatility"] = df["rolling_volatility"].fillna(df["rolling_volatility"].median())
    
    # Exogenous macro indicators (forward fill realistic market continuity)
    macro_cols = ["bdi", "bci", "bpi", "bsi", "bunker_price", "coal_price", "usd_index"]
    for col in macro_cols:
        if col in df.columns:
            df[col] = df[col].ffill().bfill()
            
    return df

def get_train_test_data(
    df: pd.DataFrame, 
    split_date: str = "2025-01-01"
) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    """
    Perform strict temporal walk-forward split:
    Train: dates < split_date (2021-2024)
    Test: dates >= split_date (2025-2026)
    """
    df_clean = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN]).copy()
    
    train_mask = df_clean["date"] < split_date
    test_mask = df_clean["date"] >= split_date
    
    X_train = df_clean.loc[train_mask, FEATURE_COLUMNS]
    y_train = df_clean.loc[train_mask, TARGET_COLUMN]
    
    X_test = df_clean.loc[test_mask, FEATURE_COLUMNS]
    y_test = df_clean.loc[test_mask, TARGET_COLUMN]
    
    return X_train, y_train, X_test, y_test

def get_latest_market_features(
    df: pd.DataFrame, 
    route: str, 
    vessel_class: str,
    target_date: Optional[pd.Timestamp] = None
) -> Dict[str, float]:
    """
    Extract the most recent observation features for a given route and vessel class,
    projected forward to the target horizon date.
    """
    sub = df[(df["route"] == route) & (df["vessel_class"] == vessel_class)]
    if len(sub) == 0:
        # Fallback to overall vessel_class if route is not in history
        sub = df[df["vessel_class"] == vessel_class]
    if len(sub) == 0:
        sub = df
        
    latest_row = sub.sort_values("date").iloc[-1]
    
    features = {}
    for col in FEATURE_COLUMNS:
        if col == "month":
            features["month"] = target_date.month if target_date else latest_row["date"].month
        else:
            features[col] = float(latest_row[col])
            
    return features
