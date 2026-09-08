"""
FreightIQ ML Training & Evaluation Pipeline
Execute via: python -m ml.train

1. Loads authentic freight dataset
2. Applies leakage-free feature engineering
3. Evaluates Naive Persistence Baseline
4. Trains XGBoost Forecaster (P10, P50, P90 Quantiles)
5. Evaluates and benchmarks XGBoost vs Baseline (MAE, RMSE, R2, Directional Accuracy)
6. Persists model artifacts to ml/artifacts/
7. Optionally updates PostgreSQL forecasts table
"""

import os
import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from ml.data import load_freight_data, engineer_features, get_train_test_data, FEATURE_COLUMNS, TARGET_COLUMN
from ml.model import FreightForecaster, NaivePersistenceBaseline, ARTIFACTS_DIR

def run_training():
    print("=" * 70)
    print("        FREIGHTIQ ML FORECASTING ENGINE — MODEL TRAINING")
    print("=" * 70)
    
    # 1. Load Data
    data_path = "data/freight.csv"
    if not os.path.exists(data_path):
        data_path = "data/freight_history.csv"
    print(f"\n[STEP 1] Loading freight data from: {data_path}")
    raw_df = load_freight_data(data_path)
    print(f"Loaded {len(raw_df):,} records covering {raw_df['route'].nunique()} trade lanes.")

    # 2. Feature Engineering
    print("\n[STEP 2] Performing leakage-free feature engineering...")
    featured_df = engineer_features(raw_df)
    print(f"Engineered {len(FEATURE_COLUMNS)} features: {', '.join(FEATURE_COLUMNS)}")

    # 3. Temporal Walk-Forward Split
    split_date = "2025-01-01"
    print(f"\n[STEP 3] Executing strict walk-forward temporal split (Train < {split_date}, Test >= {split_date})...")
    X_train, y_train, X_test, y_test = get_train_test_data(featured_df, split_date=split_date)
    print(f"Train set: {len(X_train):,} samples (2021-2024)")
    print(f"Test set : {len(X_test):,} samples (2025-2026)")

    # 4. Benchmark: Naive Persistence Baseline
    print("\n[STEP 4] Evaluating Naive Persistence Baseline (Tomorrow = Today's lag_1)...")
    baseline = NaivePersistenceBaseline()
    y_pred_naive = baseline.predict(X_test)
    mae_naive = mean_absolute_error(y_test, y_pred_naive)
    rmse_naive = np.sqrt(mean_squared_error(y_test, y_pred_naive))
    r2_naive = r2_score(y_test, y_pred_naive)

    # Directional Accuracy of Baseline (sign of delta)
    y_prev = X_test["lag_1"].values
    actual_dir = np.sign(y_test.values - y_prev)
    # Baseline predicts zero delta, so directional accuracy is trivial or undefined for exact persistence
    
    print(f"  --> Naive Baseline  | MAE: ${mae_naive:.3f} | RMSE: ${rmse_naive:.3f} | R2: {r2_naive:.3f}")

    # 5. Train XGBoost Forecaster
    print("\n[STEP 5] Training XGBoost Forecaster (P50, P10, P90 Quantiles)...")
    forecaster = FreightForecaster(model_version="xgboost-v1")
    forecaster.fit(X_train, y_train)

    # 6. Evaluate XGBoost Forecaster
    print("\n[STEP 6] Benchmarking XGBoost vs Naive Persistence...")
    p10_test, p50_test, p90_test = forecaster.predict_quantiles(X_test)
    
    mae_xgb = mean_absolute_error(y_test, p50_test)
    rmse_xgb = np.sqrt(mean_squared_error(y_test, p50_test))
    r2_xgb = r2_score(y_test, p50_test)

    # Directional Accuracy (comparing predicted direction vs actual direction over lag_1)
    pred_dir = np.sign(p50_test - y_prev)
    valid_dirs = actual_dir != 0
    dir_acc = np.mean(pred_dir[valid_dirs] == actual_dir[valid_dirs]) * 100.0

    print("\n" + "-" * 70)
    print("                    FINAL MODEL BENCHMARK RESULTS")
    print("-" * 70)
    print(f"  Metric                     Naive Baseline       XGBoost Forecaster")
    print(f"  -------------------------------------------------------------------")
    print(f"  MAE (Mean Absolute Error)  ${mae_naive:.3f}              ${mae_xgb:.3f}")
    print(f"  RMSE (Root Mean Sq Error)  ${rmse_naive:.3f}              ${rmse_xgb:.3f}")
    print(f"  R2 Score                   {r2_naive:.3f}                {r2_xgb:.3f}")
    print(f"  Directional Accuracy       N/A                  {dir_acc:.1f}%")
    print("-" * 70)

    # Sanity checks
    if rmse_xgb <= rmse_naive:
        improvement = ((rmse_naive - rmse_xgb) / rmse_naive) * 100
        print(f"[VERIFIED] XGBoost outperforms Naive Persistence by {improvement:.1f}% RMSE reduction.")
    else:
        print(f"[WARNING] Baseline had lower RMSE than XGBoost.")

    # 7. Persist Model Artifact
    print("\n[STEP 7] Persisting model artifacts to disk...")
    forecaster.save(ARTIFACTS_DIR)

    # 8. Seed/Update PostgreSQL Forecasts Table if DB reachable
    print("\n[STEP 8] Updating PostgreSQL forecasts table for standard corridors...")
    try:
        from backend.database import get_db_session, engine
        from backend.models import Forecast
        
        with get_db_session() as db:
            corridors = [
                ("Australia-Paradip", "Panamax"),
                ("Australia-Paradip", "Capesize"),
                ("Australia-Vizag", "Panamax"),
                ("Australia-Vizag", "Supramax"),
                ("Australia-Haldia", "Handysize"),
                ("Australia-Haldia", "Supramax"),
                ("Indonesia-Paradip", "Panamax"),
                ("Indonesia-Dhamra", "Capesize")
            ]
            
            today = datetime.now().date()
            added = 0
            
            for route, vclass in corridors:
                fc_result = forecaster.predict_horizon(route, vclass, horizon_days=30, df_history=featured_df)
                for item in fc_result["forecasts"][:15]: # save next 15 days
                    t_date = datetime.strptime(item["target_date"], "%Y-%m-%d").date()
                    
                    # Upsert or check existing
                    existing = db.query(Forecast).filter(
                        Forecast.route == route,
                        Forecast.vessel_class == vclass,
                        Forecast.target_date == t_date
                    ).first()
                    
                    if existing:
                        existing.p10 = float(item["p10"])
                        existing.p50 = float(item["p50"])
                        existing.p90 = float(item["p90"])
                        existing.model_version = forecaster.version
                    else:
                        fc_obj = Forecast(
                            forecast_date=today,
                            target_date=t_date,
                            route=route,
                            vessel_class=vclass,
                            p10=float(item["p10"]),
                            p50=float(item["p50"]),
                            p90=float(item["p90"]),
                            model_version=forecaster.version,
                            created_at=datetime.now()
                        )
                        db.add(fc_obj)
                        added += 1
            db.commit()
            print(f"Successfully populated/refreshed forecasts in PostgreSQL ({added} rows updated/inserted).")
    except Exception as e:
        print(f"Note on DB persistence: {e} (Model is safely persisted to disk).")

    print("\n" + "=" * 70)
    print("             MODEL TRAINING & BENCHMARKING COMPLETE!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    success = run_training()
    sys.exit(0 if success else 1)
