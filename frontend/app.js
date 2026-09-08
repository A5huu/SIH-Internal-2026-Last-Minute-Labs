/**
 * FreightIQ — Frontend Application Logic
 * Implements interactive decision support, Chart.js visualizations,
 * demo scenario loaders, and port admin constraint editing.
 */

const API_BASE = ""; // Relative path to FastAPI backend

// State tracking
let forecastChartInstance = null;
let marketChartInstance = null;
let portsCache = [];
let currentCargoId = null;

document.addEventListener("DOMContentLoaded", () => {
  initDefaults();
  bindEvents();
  loadPorts();
  loadMarketTrends("Australia-Paradip", "Panamax");
  loadRiskFeed("Australia-Paradip", 1);
  
  // Auto-run initial demo scenario
  setTimeout(() => {
    loadScenario(1);
  }, 400);
});

/**
 * Set realistic default form values
 */
function initDefaults() {
  const startInput = document.getElementById("laycanStart");
  const endInput = document.getElementById("laycanEnd");
  
  // Default to hackathon demo dates (November 2026)
  startInput.value = "2026-11-10";
  endInput.value = "2026-11-20";
}

/**
 * Event bindings
 */
function bindEvents() {
  const cargoForm = document.getElementById("cargoForm");
  cargoForm.addEventListener("submit", handleCargoSubmit);

  // Scenario Buttons
  document.getElementById("btnScenario1").addEventListener("click", () => loadScenario(1));
  document.getElementById("btnScenario2").addEventListener("click", () => loadScenario(2));
  document.getElementById("btnScenario3").addEventListener("click", () => loadScenario(3));

  // Port selector change updates port specs display
  document.getElementById("destinationPort").addEventListener("change", handlePortChange);

  // Port Admin Modal
  document.getElementById("btnOpenPortAdmin").addEventListener("click", openPortModal);
  document.getElementById("btnCloseModal").addEventListener("click", closePortModal);
  document.getElementById("btnCancelModal").addEventListener("click", closePortModal);
  document.getElementById("portEditForm").addEventListener("submit", handlePortSave);
}

/**
 * Fetch and populate ports list
 */
async function loadPorts() {
  try {
    const res = await fetch(`${API_BASE}/ports`);
    if (!res.ok) throw new Error("Failed to fetch ports");
    portsCache = await res.json();

    const select = document.getElementById("destinationPort");
    select.innerHTML = "";

    portsCache.forEach((port) => {
      const opt = document.createElement("option");
      opt.value = port.id;
      opt.textContent = `${port.name} (Draft: ${port.max_draft}m | LOA: ${port.max_loa}m)`;
      select.appendChild(opt);
    });

    // Default to Paradip (id: 1) if available
    const paradip = portsCache.find(p => p.name.toLowerCase().includes("paradip"));
    if (paradip) {
      select.value = paradip.id;
    }
    updatePortSpecsDisplay(parseInt(select.value));
  } catch (err) {
    console.error("Error loading ports:", err);
    showToast("Error loading ports catalog: " + err.message);
  }
}

/**
 * Handle Port Selection Change
 */
function handlePortChange(e) {
  const portId = parseInt(e.target.value);
  updatePortSpecsDisplay(portId);
}

function updatePortSpecsDisplay(portId) {
  const port = portsCache.find(p => p.id === portId);
  const container = document.getElementById("currentPortSpecs");
  if (!port || !container) return;

  container.innerHTML = `
    <div class="spec-box">
      <div class="spec-label">Max Draft</div>
      <div class="spec-value">${port.max_draft} m</div>
    </div>
    <div class="spec-box">
      <div class="spec-label">Max Berth LOA</div>
      <div class="spec-value">${port.max_loa} m</div>
    </div>
    <div class="spec-box">
      <div class="spec-label">Max Beam</div>
      <div class="spec-value">${port.max_beam} m</div>
    </div>
    <div class="spec-box">
      <div class="spec-label">Handling Rate</div>
      <div class="spec-value">${port.handling_rate.toLocaleString()} t/d</div>
    </div>
  `;
}

/**
 * Scenario Pre-sets Loader
 */
function loadScenario(num) {
  document.querySelectorAll(".btn-scenario").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`btnScenario${num}`);
  if (btn) btn.classList.add("active");

  const cargoType = document.getElementById("cargoType");
  const quantity = document.getElementById("cargoQuantity");
  const origin = document.getElementById("cargoOrigin");
  const port = document.getElementById("destinationPort");
  const start = document.getElementById("laycanStart");
  const end = document.getElementById("laycanEnd");
  const radioCoa = document.querySelector('input[name="contractPreference"][value="CoA"]');
  const radioSpot = document.querySelector('input[name="contractPreference"][value="Spot"]');

  if (num === 1) {
    // Critical Demo Case 1: 75,000t Coking Coal, Australia -> Paradip, 10-20 Nov 2026, CoA
    cargoType.value = "Coking Coal";
    quantity.value = 75000;
    origin.value = "Australia";
    const paradip = portsCache.find(p => p.name === "Paradip");
    if (paradip) port.value = paradip.id;
    start.value = "2026-11-10";
    end.value = "2026-11-20";
    radioCoa.checked = true;
    showToast("Loaded Demo 1: Paradip 75kt Coking Coal (Panamax target)");
  } else if (num === 2) {
    // Critical Demo Case 2: 75,000t Coal, Australia -> Haldia (Shallow draft port constraint)
    cargoType.value = "Coking Coal";
    quantity.value = 75000;
    origin.value = "Australia";
    const haldia = portsCache.find(p => p.name === "Haldia");
    if (haldia) port.value = haldia.id;
    start.value = "2026-11-10";
    end.value = "2026-11-20";
    radioSpot.checked = true;
    showToast("Loaded Demo 2: Haldia Shallow Draft Port (Capesize/Panamax physical exclusion)");
  } else if (num === 3) {
    // Demo Case 3: 55,000t Thermal Coal, Indonesia -> Vizag (Supramax parcel)
    cargoType.value = "Thermal Coal";
    quantity.value = 55000;
    origin.value = "Indonesia";
    const vizag = portsCache.find(p => p.name === "Visakhapatnam");
    if (vizag) port.value = vizag.id;
    start.value = "2026-11-15";
    end.value = "2026-11-25";
    radioCoa.checked = true;
    showToast("Loaded Demo 3: Vizag 55kt Thermal Coal (Supramax target)");
  }

  updatePortSpecsDisplay(parseInt(port.value));
  document.getElementById("cargoForm").dispatchEvent(new Event("submit"));
}

/**
 * Primary Form Submission: Workflow Execution
 */
async function handleCargoSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmitPlan");
  btn.classList.add("loading");

  try {
    const payload = {
      cargo_type: document.getElementById("cargoType").value,
      quantity: parseFloat(document.getElementById("cargoQuantity").value),
      origin: document.getElementById("cargoOrigin").value,
      destination_port_id: parseInt(document.getElementById("destinationPort").value),
      laycan_start: document.getElementById("laycanStart").value,
      laycan_end: document.getElementById("laycanEnd").value,
      contract_preference: document.querySelector('input[name="contractPreference"]:checked').value
    };

    // 1. Create Cargo Record via POST /cargo
    const cargoRes = await fetch(`${API_BASE}/cargo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!cargoRes.ok) {
      const err = await cargoRes.json();
      throw new Error(err.detail || "Failed to create cargo");
    }
    const createdCargo = await cargoRes.json();
    currentCargoId = createdCargo.id;

    // 2. Evaluate Compatibility via POST /compatibility
    const compatRes = await fetch(`${API_BASE}/compatibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cargo_quantity: payload.quantity,
        destination_port_id: payload.destination_port_id
      })
    });
    const compatData = await compatRes.json();
    renderCompatibility(compatData);

    // If no feasible vessels exist (e.g. 75,000t parcel at 8.5m shallow port without lighterage)
    if (compatData.feasible_vessels.length === 0) {
      renderInfeasibleRecommendation(payload, compatData);
      showToast("Physical feasibility constraint breached: No compatible vessels!", 4000);
      return;
    }

    // 3. Generate Complete Decision Recommendation via POST /recommendation
    const recRes = await fetch(`${API_BASE}/recommendation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cargo_id: currentCargoId })
    });

    if (!recRes.ok) {
      const err = await recRes.json();
      throw new Error(err.detail || "Failed to generate recommendation");
    }
    const recData = await recRes.json();
    renderRecommendation(recData, payload);

    // 4. Update Forecast Chart for the selected route & vessel
    const route = `${payload.origin}-${portsCache.find(p => p.id === payload.destination_port_id)?.name || "Paradip"}`;
    loadForecastChart(route, recData.vessel_class);

    // 5. Update Spot vs CoA Strategy
    loadCoaAnalysis(currentCargoId, payload.quantity, recData.vessel_class);

    // 6. Update Route Risk Feed
    loadRiskFeed(route, payload.destination_port_id);

  } catch (err) {
    console.error("Execution error:", err);
    showToast(err.message || "An unexpected error occurred");
  } finally {
    btn.classList.remove("loading");
  }
}

/**
 * Render Compatibility Matrix
 */
function renderCompatibility(compatData) {
  const container = document.getElementById("compatResults");
  container.innerHTML = "";

  if (compatData.feasible_vessels.length > 0) {
    const title = document.createElement("div");
    title.className = "compat-group-title text-emerald";
    title.textContent = `Feasible Classes (${compatData.feasible_vessels.length})`;
    container.appendChild(title);

    compatData.feasible_vessels.forEach(v => {
      const card = document.createElement("div");
      card.className = "vessel-compat-card feasible";
      card.innerHTML = `
        <div class="compat-icon">✓</div>
        <div class="compat-details">
          <div class="compat-vessel-name">
            ${v.vessel_class}
            <span class="compat-badge">Pass</span>
          </div>
          <div class="compat-reason">100% physically compatible with draft, berth LOA, and parcel payload.</div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  if (compatData.excluded_vessels.length > 0) {
    const title = document.createElement("div");
    title.className = "compat-group-title text-rose";
    title.textContent = `Excluded Classes (${compatData.excluded_vessels.length})`;
    container.appendChild(title);

    compatData.excluded_vessels.forEach(v => {
      const card = document.createElement("div");
      card.className = "vessel-compat-card excluded";
      card.innerHTML = `
        <div class="compat-icon">✕</div>
        <div class="compat-details">
          <div class="compat-vessel-name">
            ${v.vessel_class}
            <span class="compat-badge">Excluded</span>
          </div>
          <div class="compat-reason">${v.reason}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }
}

/**
 * Render Recommendation Hero Card
 */
function renderRecommendation(rec, cargoPayload) {
  document.getElementById("recScoreVal").textContent = rec.score;
  document.getElementById("recVesselClass").textContent = rec.vessel_class.toUpperCase();
  document.getElementById("recVesselSub").textContent = "Physically Feasible & Parcel Matched";

  const fStart = formatDateShort(rec.fixture_window.start);
  const fEnd = formatDateShort(rec.fixture_window.end);
  document.getElementById("recFixtureWindow").textContent = `${fStart} – ${fEnd}`;

  document.getElementById("recContractType").textContent = rec.contract_type;
  document.getElementById("recContractSub").textContent = rec.contract_type === "CoA" ? "Multi-Voyage Hedged" : "Spot Market Fixture";

  const riskEl = document.getElementById("recRiskLevel");
  riskEl.textContent = rec.risk_level.toUpperCase();
  riskEl.className = `hl-value-large ${rec.risk_level === "High" ? "text-rose" : (rec.risk_level === "Medium" ? "text-amber" : "text-emerald")}`;

  // Forecast Quantiles
  document.getElementById("recP10").textContent = `$${rec.rate.p10.toFixed(2)}`;
  document.getElementById("recP50").textContent = `$${rec.rate.p50.toFixed(2)}`;
  document.getElementById("recP90").textContent = `$${rec.rate.p90.toFixed(2)}`;

  // Reasons List
  const list = document.getElementById("recReasonsList");
  list.innerHTML = "";
  rec.reasons.forEach(reason => {
    const li = document.createElement("li");
    li.textContent = reason;
    list.appendChild(li);
  });

  // Smooth scroll to hero recommendation on desktop
  document.getElementById("heroRecCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Render Infeasible Rejection Hero Card (e.g. Haldia Demo Case)
 */
function renderInfeasibleRecommendation(cargoPayload, compatData) {
  document.getElementById("recScoreVal").textContent = "0";
  document.getElementById("recVesselClass").textContent = "PHYSICALLY INFEASIBLE";
  document.getElementById("recVesselClass").classList.add("text-rose");
  document.getElementById("recVesselSub").textContent = "Constraint Engine Override";

  document.getElementById("recFixtureWindow").textContent = "BLOCKED";
  document.getElementById("recContractType").textContent = "NONE";
  document.getElementById("recRiskLevel").textContent = "CRITICAL";
  document.getElementById("recRiskLevel").className = "hl-value-large text-rose";

  document.getElementById("recP10").textContent = "$--";
  document.getElementById("recP50").textContent = "$--";
  document.getElementById("recP90").textContent = "$--";

  const list = document.getElementById("recReasonsList");
  list.innerHTML = "";
  compatData.excluded_vessels.forEach(v => {
    const li = document.createElement("li");
    li.style.color = "var(--accent-rose)";
    li.textContent = `${v.vessel_class} Excluded: ${v.reason}`;
    list.appendChild(li);
  });

  showToast("Physical feasibility override: Vessel cannot berth safely at selected port!", 4500);
}

/**
 * Load and render Forecast Chart with confidence cloud
 */
async function loadForecastChart(route, vesselClass) {
  try {
    const res = await fetch(`${API_BASE}/forecast?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vesselClass)}&horizon_days=30`);
    if (!res.ok) throw new Error("Forecast API error");
    const data = await res.json();

    const labels = data.forecasts.map(f => formatDateShort(f.target_date));
    const p10Data = data.forecasts.map(f => f.p10);
    const p50Data = data.forecasts.map(f => f.p50);
    const p90Data = data.forecasts.map(f => f.p90);

    const ctx = document.getElementById("forecastChart").getContext("2d");

    if (forecastChartInstance) {
      forecastChartInstance.destroy();
    }

    forecastChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "P90 (Ceiling)",
            data: p90Data,
            borderColor: "transparent",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            pointRadius: 0,
            fill: "+1" // fill down to next dataset (P10)
          },
          {
            label: "P10 (Floor)",
            data: p10Data,
            borderColor: "transparent",
            backgroundColor: "transparent",
            pointRadius: 0,
            fill: false
          },
          {
            label: "P50 Expected Freight",
            data: p50Data,
            borderColor: "#38bdf8",
            borderWidth: 2.5,
            pointBackgroundColor: "#0284c7",
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.25,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            borderColor: "#38bdf8",
            borderWidth: 1,
            titleFont: { family: "Plus Jakarta Sans", weight: "bold" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (context) => {
                return ` ${context.dataset.label}: $${context.parsed.y.toFixed(2)} / MT`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8", maxTicksLimit: 10 }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#94a3b8",
              callback: (val) => `$${val}`
            }
          }
        }
      }
    });

    // Render drivers pills
    const pillsContainer = document.getElementById("featureDriversPills");
    pillsContainer.innerHTML = "";
    (data.drivers || []).forEach(d => {
      const pill = document.createElement("span");
      pill.className = "driver-pill";
      pill.innerHTML = `<strong>${d.feature}</strong>: ${(d.impact * 100).toFixed(0)}%`;
      pillsContainer.appendChild(pill);
    });

  } catch (err) {
    console.error("Forecast chart error:", err);
  }
}

/**
 * Load Spot vs CoA Strategy Evaluation
 */
async function loadCoaAnalysis(cargoId, volume, vesselClass) {
  try {
    const res = await fetch(`${API_BASE}/coa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cargo_id: cargoId,
        cargo_volume: volume,
        vessel_class: vesselClass,
        horizon_months: 3
      })
    });
    if (!res.ok) throw new Error("CoA API error");
    const data = await res.json();

    document.getElementById("coaExpectedSpot").textContent = `$${data.expected_spot_cost.toLocaleString()}`;
    document.getElementById("coaExpectedCoa").textContent = `$${data.expected_coa_cost.toLocaleString()}`;
    
    const diffSign = data.cost_difference >= 0 ? "+$" : "-$";
    document.getElementById("coaSavingsVal").textContent = `${diffSign}${Math.abs(data.cost_difference).toLocaleString()}`;
    document.getElementById("coaReasonText").textContent = data.reason;

    const badge = document.getElementById("coaStrategyBadge");
    badge.textContent = `Recommended: ${data.preferred_option}`;

  } catch (err) {
    console.error("CoA error:", err);
  }
}

/**
 * Load Route Risk Feed
 */
async function loadRiskFeed(route, portId) {
  try {
    const res = await fetch(`${API_BASE}/risk?route=${encodeURIComponent(route)}&port_id=${portId}`);
    if (!res.ok) throw new Error("Risk API error");
    const data = await res.json();

    const list = document.getElementById("riskEventsList");
    list.innerHTML = "";

    if (!data.risks || data.risks.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No active critical risk signals on this corridor.</div>';
      return;
    }

    data.risks.slice(0, 6).forEach(r => {
      const item = document.createElement("div");
      item.className = "risk-item";
      item.innerHTML = `
        <div class="risk-item-header">
          <span class="risk-type text-cyan">${r.event_type.replace("_", " ")}</span>
          <span class="risk-severity-pill severity-${r.severity}">${r.severity} Risk</span>
        </div>
        <div class="risk-desc">${r.description}</div>
        <div class="risk-meta">${r.event_date} • Source: ${r.source || "Intelligence Feed"}</div>
      `;
      list.appendChild(item);
    });

  } catch (err) {
    console.error("Risk feed error:", err);
  }
}

/**
 * Load Baltic Market Trends
 */
async function loadMarketTrends(route, vesselClass) {
  try {
    const res = await fetch(`${API_BASE}/market?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vesselClass)}`);
    if (!res.ok) return;
    const data = await res.json();

    const labels = data.historical.slice(-30).map(h => formatDateShort(h.date));
    const bdi = data.historical.slice(-30).map(h => h.bdi);
    const bci = data.historical.slice(-30).map(h => h.bci);
    const bpi = data.historical.slice(-30).map(h => h.bpi);
    const bsi = data.historical.slice(-30).map(h => h.bsi);

    const ctx = document.getElementById("marketChart").getContext("2d");
    if (marketChartInstance) {
      marketChartInstance.destroy();
    }

    marketChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          { label: "BDI (Composite)", data: bdi, borderColor: "#38bdf8", borderWidth: 2, tension: 0.2, pointRadius: 0 },
          { label: "BCI (Capesize)", data: bci, borderColor: "#f43f5e", borderWidth: 1.5, tension: 0.2, pointRadius: 0 },
          { label: "BPI (Panamax)", data: bpi, borderColor: "#10b981", borderWidth: 1.5, tension: 0.2, pointRadius: 0 },
          { label: "BSI (Supramax)", data: bsi, borderColor: "#a855f7", borderWidth: 1.5, tension: 0.2, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#94a3b8", font: { size: 10 } }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.04)" }, ticks: { color: "#64748b", maxTicksLimit: 8 } },
          y: { grid: { color: "rgba(255, 255, 255, 0.04)" }, ticks: { color: "#64748b" } }
        }
      }
    });

  } catch (err) {
    console.error("Market chart error:", err);
  }
}

/**
 * Port Admin Modal Logic
 */
function openPortModal() {
  const select = document.getElementById("destinationPort");
  const portId = parseInt(select.value);
  const port = portsCache.find(p => p.id === portId);
  if (!port) return;

  document.getElementById("editPortId").value = port.id;
  document.getElementById("editPortName").value = port.name;
  document.getElementById("editMaxDraft").value = port.max_draft;
  document.getElementById("editMaxLoa").value = port.max_loa;
  document.getElementById("editMaxBeam").value = port.max_beam;
  document.getElementById("editHandlingRate").value = port.handling_rate;
  document.getElementById("editLightering").checked = port.lightering_available;

  document.getElementById("portModal").classList.add("active");
}

function closePortModal() {
  document.getElementById("portModal").classList.remove("active");
}

async function handlePortSave(e) {
  e.preventDefault();
  const portId = parseInt(document.getElementById("editPortId").value);
  const payload = {
    name: document.getElementById("editPortName").value,
    max_draft: parseFloat(document.getElementById("editMaxDraft").value),
    max_loa: parseFloat(document.getElementById("editMaxLoa").value),
    max_beam: parseFloat(document.getElementById("editMaxBeam").value),
    handling_rate: parseInt(document.getElementById("editHandlingRate").value),
    lightering_available: document.getElementById("editLightering").checked
  };

  try {
    const res = await fetch(`${API_BASE}/admin/ports/${portId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Failed to update port constraints");
    const updated = await res.json();

    // Update local cache
    const idx = portsCache.findIndex(p => p.id === portId);
    if (idx !== -1) {
      portsCache[idx] = updated;
    }

    updatePortSpecsDisplay(portId);
    closePortModal();
    showToast(`Updated constraints for ${updated.name}! Re-running feasibility...`);

    // Trigger re-check
    document.getElementById("cargoForm").dispatchEvent(new Event("submit"));

  } catch (err) {
    showToast("Port update failed: " + err.message);
  }
}

/**
 * Toast Helper
 */
function showToast(msg, duration = 3000) {
  const toast = document.getElementById("appToast");
  const text = document.getElementById("toastMsg");
  text.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

/**
 * Date Formatter helper (e.g. "2026-11-14" -> "14 Nov")
 */
function formatDateShort(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}
