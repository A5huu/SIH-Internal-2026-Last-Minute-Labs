/* ==================================================
   FREIGHTIQ
   APPLICATION JAVASCRIPT & BACKEND INTEGRATION
   PostgreSQL + FastAPI + ML XGBoost Decision Engine
================================================== */

const API_BASE = (window.location.port === "8000")
    ? window.location.origin
    : "http://127.0.0.1:8000";

let portsCache = [];
let vesselClassesCache = [];
let currentCargoId = 1;
let currentRoute = "Indonesia-EastCoastIndia (coal)";
let currentVesselClass = "Supramax";

let freightChartInstance = null;
let forecastChartInstance = null;
let portMapInstance = null;
let portMarkers = {};
let portRouteLayers = [];

/* =====================================================
   PAGE NAVIGATION
===================================================== */

function showPage(pageId, clickedButton = null) {
    const pages = document.querySelectorAll(".page");
    pages.forEach(page => page.classList.remove("active-page"));

    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.add("active-page");
    }

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));

    if (clickedButton) {
        clickedButton.classList.add("active");
    } else {
        navItems.forEach(item => {
            const attr = item.getAttribute("onclick");
            if (attr && attr.includes(`'${pageId}'`)) {
                item.classList.add("active");
            }
        });
    }

    updatePageTitle(pageId);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Handle Leaflet interactive port map sizing
    if (pageId === "ports") {
        setTimeout(() => {
            if (!portMapInstance) {
                initPortMap();
            } else {
                portMapInstance.invalidateSize();
            }
        }, 150);
    }

    // Handle Forecast chart refresh and resize
    if (pageId === "forecast") {
        setTimeout(() => {
            loadForecastData();
            if (forecastChartInstance) forecastChartInstance.resize();
        }, 120);
    }
}

/* =====================================================
   PAGE TITLES
===================================================== */

function updatePageTitle(pageId) {
    const titles = {
        dashboard: ["Dashboard", "Intelligent maritime freight decision support"],
        forecast: ["Freight Forecast", "AI-powered freight rate prediction (XGBoost)"],
        cargo: ["Cargo Planner", "Define cargo parameters for end-to-end AI recommendations"],
        vessel: ["Vessel Recommendation", "Find the best vessel for your cargo & port"],
        procurement: ["Procurement Recommendation", "AI-assisted bulk cargo procurement timing"],
        risk: ["Risk Score", "Monitor maritime freight, weather and port risks"],
        ports: ["Port Explorer", "Inspect East Coast India port constraints and vessel draft"],
        coa: ["Spot vs CoA Simulator", "Evaluate market volatility and contract cost exposure"],
        alerts: ["Risk & Alerts", "Live operational signals and maritime hazard advisories"]
    };

    const title = titles[pageId] || titles.dashboard;
    const pt = document.getElementById("pageTitle");
    const ps = document.getElementById("pageSubtitle");
    if (pt) pt.textContent = title[0];
    if (ps) ps.textContent = title[1];
}

/* =====================================================
   REFRESH BUTTON
===================================================== */

async function refreshData() {
    const button = document.querySelector(".refresh-btn");
    if (!button) return;

    const original = button.innerHTML;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Fetching Live DB...`;
    button.disabled = true;

    try {
        await initAppData();
        button.innerHTML = `<i class="fa-solid fa-check"></i> Updated`;
        button.style.color = "#22c55e";
    } catch (e) {
        console.error("Refresh error:", e);
        button.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Error`;
        button.style.color = "#ef4444";
    } finally {
        setTimeout(() => {
            button.innerHTML = original;
            button.disabled = false;
            button.style.color = "";
        }, 1500);
    }
}

/* =====================================================
   INITIALIZATION & API BINDINGS
===================================================== */

async function initAppData() {
    await checkSystemHealth();
    await loadPorts();
    await loadMarketData();
    await loadForecastData();
    await loadRiskData();
}

// 1. System Health Check
async function checkSystemHealth() {
    const bStatus = document.getElementById("backendStatus");
    const dStatus = document.getElementById("dbStatus");
    const mStatus = document.getElementById("mlStatus");

    try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
            if (bStatus) bStatus.innerHTML = `<i class="fa-solid fa-circle" style="color:#22c55e"></i> FastAPI: Online (Port 8000)`;
            if (dStatus) dStatus.innerHTML = `<i class="fa-solid fa-database" style="color:#22c55e"></i> PostgreSQL: Connected (Port 5432)`;
            if (mStatus) mStatus.innerHTML = `<i class="fa-solid fa-microchip" style="color:#20b8ff"></i> ML: XGBoost Model Active`;
        } else {
            throw new Error("Health check non-200");
        }
    } catch (err) {
        console.warn("Backend not yet connected:", err);
        if (bStatus) bStatus.innerHTML = `<i class="fa-solid fa-circle" style="color:#f59e0b"></i> FastAPI: Offline / Connecting`;
        if (dStatus) dStatus.innerHTML = `<i class="fa-solid fa-database" style="color:#f59e0b"></i> PostgreSQL: Standby`;
    }
}

// 2. Load Ports from PostgreSQL
async function loadPorts() {
    try {
        const res = await fetch(`${API_BASE}/ports`);
        if (!res.ok) return;
        portsCache = await res.json();

        // Populate Destination dropdown in Cargo Planner
        const destSelect = document.getElementById("cargoDestination");
        if (destSelect && portsCache.length > 0) {
            destSelect.innerHTML = "";
            portsCache.forEach(port => {
                const opt = document.createElement("option");
                opt.value = port.id;
                opt.textContent = `${port.name} (Draft: ${port.max_draft}m | LOA: ${port.max_loa || 300}m)`;
                destSelect.appendChild(opt);
            });
            // Default to Paradip
            const defPort = portsCache.find(p => p.name.toLowerCase() === "paradip") || portsCache[0];
            if (defPort) destSelect.value = defPort.id;
        }

        // Render port list on Port Explorer page
        const portListDiv = document.getElementById("portListContainer") || document.querySelector(".port-list");
        if (portListDiv && portsCache.length > 0) {
            portListDiv.innerHTML = "";
            portsCache.forEach(port => {
                const draftTag = port.max_draft >= 18 ? "tag-low" : port.max_draft >= 14 ? "tag-med" : "tag-high";
                const draftLabel = port.max_draft >= 18 ? "Deep Draft" : port.max_draft >= 14 ? "Standard" : "Draft-sensitive";
                const btn = document.createElement("button");
                btn.type = "button";
                btn.onclick = () => selectPort(port.name);
                btn.innerHTML = `<strong>${port.name}</strong><span>Draft: ${port.max_draft}m, LOA: ${port.max_loa}m</span><em class="${draftTag}">${draftLabel}</em>`;
                portListDiv.appendChild(btn);
            });
        }

        // Initialize or update interactive maritime map
        if (document.getElementById("portMap")) {
            if (!portMapInstance) {
                initPortMap();
            } else {
                renderPortMarkers();
            }
        }

        // Default select Paradip to display initial profile
        const initialPort = portsCache.find(p => p.name.toLowerCase() === "paradip") || portsCache[0];
        if (initialPort) {
            selectPort(initialPort.name);
        }
    } catch (err) {
        console.error("Error loading ports:", err);
    }
}

// 3. Load Market Data & Chart
async function loadMarketData() {
    try {
        const url = `${API_BASE}/market?route=${encodeURIComponent(currentRoute)}&vessel_class=${encodeURIComponent(currentVesselClass)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        // Update Dashboard Rate KPI
        if (data.current_rate !== undefined && data.current_rate !== null) {
            const rateH2 = document.querySelector(".stat-card.blue h2");
            if (rateH2) {
                rateH2.innerHTML = `$${data.current_rate.toFixed(2)} <small>/ MT</small>`;
            }
        }

        // Update Market Chart
        const history = data.historical || [];
        if (history.length > 0) {
            const recent = history.slice(-14);
            const labels = recent.map(h => {
                const d = new Date(h.date);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            });
            const rates = recent.map(h => h.rate);
            renderFreightChart(labels, rates);
        }
    } catch (err) {
        console.error("Error loading market data:", err);
    }
}

// 4. Load Forecast Data & AI Chart
async function loadForecastData(targetRoute = null, targetVessel = null) {
    const route = targetRoute || currentRoute;
    const vessel = targetVessel || currentVesselClass;

    try {
        // Fetch both market history and forecast in parallel
        const [marketRes, forecastRes] = await Promise.all([
            fetch(`${API_BASE}/market?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}`),
            fetch(`${API_BASE}/forecast?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}&horizon_days=30`)
        ]);

        if (!forecastRes.ok) return;
        const forecastData = await forecastRes.json();
        const marketData = marketRes.ok ? await marketRes.json() : { current_rate: null, historical: [] };

        const forecasts = forecastData.forecasts || [];
        const history = marketData.historical || [];
        const currentRate = (marketData.current_rate !== null && marketData.current_rate !== undefined)
            ? marketData.current_rate
            : (history.length > 0 ? history[history.length - 1].rate : (forecasts.length > 0 ? forecasts[0].p50 : 20.0));

        // Update Dashboard Purple KPI Card
        const fcKpi = document.querySelector(".stat-card.purple h2");
        if (fcKpi && forecasts.length > 0) {
            fcKpi.innerHTML = `$${forecasts[0].p50.toFixed(2)} <small>/ MT</small>`;
        }

        // Update the 4 Cards on the Forecast Page
        const fcValCurrent = document.getElementById("fcValCurrent");
        const fcSubCurrent = document.getElementById("fcSubCurrent");
        const fcVal7d = document.getElementById("fcVal7d");
        const fcSub7d = document.getElementById("fcSub7d");
        const fcVal30d = document.getElementById("fcVal30d");
        const fcSub30d = document.getElementById("fcSub30d");
        const fcVal90d = document.getElementById("fcVal90d");
        const fcSub90d = document.getElementById("fcSub90d");

        if (fcValCurrent) fcValCurrent.textContent = `$${currentRate.toFixed(2)}`;
        if (fcSubCurrent) fcSubCurrent.textContent = `${vessel} • Spot Fixture`;

        if (forecasts.length > 0) {
            // 7 Days
            const fc7 = forecasts.length >= 7 ? forecasts[6].p50 : forecasts[forecasts.length - 1].p50;
            const diff7 = ((fc7 - currentRate) / currentRate) * 100;
            if (fcVal7d) fcVal7d.textContent = `$${fc7.toFixed(2)}`;
            if (fcSub7d) {
                fcSub7d.textContent = `${diff7 >= 0 ? '+' : ''}${diff7.toFixed(1)}% vs Current`;
                fcSub7d.className = diff7 >= 0 ? "trend-up" : "trend-down";
            }

            // 30 Days
            const fc30 = forecasts.length >= 30 ? forecasts[29].p50 : forecasts[forecasts.length - 1].p50;
            const diff30 = ((fc30 - currentRate) / currentRate) * 100;
            if (fcVal30d) fcVal30d.textContent = `$${fc30.toFixed(2)}`;
            if (fcSub30d) {
                fcSub30d.textContent = `${diff30 >= 0 ? '+' : ''}${diff30.toFixed(1)}% vs Current`;
                fcSub30d.className = diff30 >= 0 ? "trend-up" : "trend-down";
            }

            // Forward Risk Upper Bound (P90)
            const p90Val = forecasts.length >= 7 ? forecasts[6].p90 : forecasts[0].p90;
            const diffP90 = ((p90Val - currentRate) / currentRate) * 100;
            if (fcVal90d) fcVal90d.textContent = `$${p90Val.toFixed(2)}`;
            if (fcSub90d) {
                fcSub90d.textContent = `${diffP90 >= 0 ? '+' : ''}${diffP90.toFixed(1)}% Upper Risk`;
                fcSub90d.className = "trend-up";
            }
        }

        // Render Chart using real market fixtures + XGBoost forecast
        renderForecastChart(history, forecasts, currentRate);

        // Render explainability drivers
        renderForecastExplainability(forecastData.drivers, currentRate, forecasts);

    } catch (err) {
        console.error("Error loading forecast data:", err);
    }
}

// 5. Load Risk Events
async function loadRiskData() {
    try {
        const res = await fetch(`${API_BASE}/risk`);
        if (!res.ok) return;
        const data = await res.json();
        const risks = data.risks || [];

        // Update alert summary counts
        const highCount = risks.filter(r => r.severity === "High").length;
        const medCount = risks.filter(r => r.severity === "Medium").length;
        const lowCount = risks.filter(r => r.severity === "Low").length;

        const statBoxes = document.querySelectorAll(".alert-stat strong");
        if (statBoxes.length >= 3) {
            statBoxes[0].textContent = highCount;
            statBoxes[1].textContent = medCount;
            statBoxes[2].textContent = lowCount;
        }

        // Render live alert items in #alerts
        const alertList = document.querySelector(".alert-list");
        if (alertList && risks.length > 0) {
            alertList.innerHTML = "";
            risks.forEach(r => {
                const sevClass = r.severity.toLowerCase();
                const icon = r.event_type === "weather" ? "fa-cloud" : r.event_type === "port_congestion" ? "fa-anchor" : "fa-chart-line";
                const div = document.createElement("div");
                div.className = `alert-item ${sevClass}`;
                div.innerHTML = `
                    <div class="alert-symbol"><i class="fa-solid ${icon}"></i></div>
                    <div>
                        <strong>${r.event_type.replace('_', ' ').toUpperCase()}: ${r.description}</strong>
                        <p>Route: ${r.route || 'Regional'} | Source: ${r.source || 'Port Authority'} | Date: ${r.event_date}</p>
                    </div>
                    <span>${r.severity.toUpperCase()}</span>
                `;
                alertList.appendChild(div);
            });
        }

        // Update overall risk level badge
        const riskLevel = data.risk_level || "Low";
        const riskScoreNum = riskLevel === "High" ? 78 : riskLevel === "Medium" ? 48 : 24;
        const riskGauge = document.querySelector(".risk-circle strong");
        if (riskGauge) riskGauge.textContent = riskScoreNum;

        const kpiRisk = document.querySelector(".stat-card.orange h2");
        if (kpiRisk) kpiRisk.innerHTML = `${riskScoreNum}<span>/100</span>`;
    } catch (err) {
        console.error("Error loading risk data:", err);
    }
}

/* =====================================================
   CHARTS RENDERING
===================================================== */

function renderFreightChart(labels, dataPoints) {
    const canvas = document.getElementById("freightChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (freightChartInstance) {
        freightChartInstance.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, "rgba(32,184,255,0.25)");
    gradient.addColorStop(1, "rgba(32,184,255,0)");

    freightChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Freight Rate ($/MT)",
                data: dataPoints,
                borderColor: "#20b8ff",
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 7,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Rate: $${ctx.parsed.y.toFixed(2)}/MT`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#6f849a", font: { size: 9 } }
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: {
                        color: "#6f849a",
                        font: { size: 9 },
                        callback: val => "$" + val
                    }
                }
            }
        }
    });
}

function renderForecastChart(history, forecasts, currentRate) {
    const canvas = document.getElementById("forecastChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (forecastChartInstance) {
        forecastChartInstance.destroy();
    }

    const labels = [];
    const histData = [];
    const p50Data = [];
    const p10Data = [];
    const p90Data = [];

    // Slice recent historical spot records (last 10 data points from database)
    const recentHistory = (history && history.length > 0) ? history.slice(-10) : [];

    if (recentHistory.length > 0) {
        recentHistory.forEach(item => {
            const d = new Date(item.date);
            labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
            histData.push(item.rate);
            p50Data.push(null);
            p10Data.push(null);
            p90Data.push(null);
        });

        // Anchor the forecast curve seamlessly onto Today's rate
        const lastRate = recentHistory[recentHistory.length - 1].rate;
        p50Data[p50Data.length - 1] = lastRate;
        p10Data[p10Data.length - 1] = lastRate;
        p90Data[p90Data.length - 1] = lastRate;
    } else {
        labels.push("Today");
        histData.push(currentRate);
        p50Data.push(currentRate);
        p10Data.push(currentRate);
        p90Data.push(currentRate);
    }

    // Append forward predictions from XGBoost ML model
    forecasts.forEach(f => {
        const d = new Date(f.target_date);
        labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        histData.push(null);
        p50Data.push(f.p50);
        p10Data.push(f.p10);
        p90Data.push(f.p90);
    });

    forecastChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Historical Fixtures (PostgreSQL)",
                    data: histData,
                    borderColor: "#20b8ff",
                    backgroundColor: "rgba(32, 184, 255, 0.1)",
                    fill: false,
                    tension: 0.25,
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#20b8ff"
                },
                {
                    label: "AI Forecast (P50 Expected)",
                    data: p50Data,
                    borderColor: "#a855f7",
                    backgroundColor: "rgba(168, 85, 247, 0.08)",
                    borderDash: [5, 4],
                    tension: 0.25,
                    borderWidth: 2.5,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#a855f7"
                },
                {
                    label: "Upper Ceiling (P90)",
                    data: p90Data,
                    borderColor: "rgba(239, 68, 68, 0.55)",
                    borderDash: [3, 3],
                    tension: 0.25,
                    borderWidth: 1.5,
                    pointRadius: 0
                },
                {
                    label: "Lower Floor (P10)",
                    data: p10Data,
                    borderColor: "rgba(34, 197, 94, 0.55)",
                    borderDash: [3, 3],
                    tension: 0.25,
                    borderWidth: 1.5,
                    pointRadius: 0
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
                legend: {
                    labels: { color: "#9db0c3", font: { size: 10, family: "Inter, sans-serif" } }
                },
                tooltip: {
                    backgroundColor: "rgba(8, 20, 36, 0.95)",
                    titleColor: "#ffffff",
                    bodyColor: "#cbd5e1",
                    borderColor: "rgba(32, 184, 255, 0.3)",
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            if (context.raw === null || context.raw === undefined) return null;
                            return `${context.dataset.label}: $${context.raw.toFixed(2)}/MT`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: "rgba(255, 255, 255, 0.03)" },
                    ticks: { color: "#6f849a", font: { size: 9.5 } }
                },
                y: {
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: {
                        color: "#6f849a",
                        font: { size: 9.5 },
                        callback: val => "$" + val
                    }
                }
            }
        }
    });
}

function onForecastFilterChanged() {
    const routeSelect = document.getElementById("forecastRouteSelect");
    const vesselSelect = document.getElementById("forecastVesselSelect");
    if (!routeSelect || !vesselSelect) return;

    const selectedRoute = routeSelect.value;
    const selectedVessel = vesselSelect.value;

    loadForecastData(selectedRoute, selectedVessel);
}

function renderForecastExplainability(drivers, currentRate, forecasts) {
    const driversList = document.getElementById("forecastDriversList");
    if (!driversList) return;

    if (drivers && drivers.length > 0) {
        driversList.innerHTML = "";
        drivers.forEach(d => {
            const pct = Math.round((d.impact || 0) * 100);
            const row = document.createElement("div");
            row.className = "driver-row";
            row.innerHTML = `
                <span>${d.feature}</span>
                <div class="driver-bar-bg"><div class="driver-bar-fill" style="width: ${Math.max(5, pct)}%;"></div></div>
                <strong>${(d.impact * 100).toFixed(1)}%</strong>
            `;
            driversList.appendChild(row);
        });
    }
}

/* =====================================================
   CARGO PLANNER & RECOMMENDATION GENERATOR
===================================================== */

function selectContractPreference(pref) {
    const input = document.getElementById("cargoContract");
    if (input) input.value = pref;

    const btnCoA = document.getElementById("btnContractCoA");
    const btnSpot = document.getElementById("btnContractSpot");

    if (btnCoA && btnSpot) {
        btnCoA.classList.toggle("active", pref === "CoA");
        btnSpot.classList.toggle("active", pref === "Spot");
    }
}

function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    return dateStr;
}

async function generatePlan() {
    const originElem = document.getElementById("cargoOrigin");
    const destElem = document.getElementById("cargoDestination");
    const qtyElem = document.getElementById("cargoQty");
    const commElem = document.getElementById("cargoCommodity");
    const startElem = document.getElementById("laycanStart");
    const endElem = document.getElementById("laycanEnd");
    const contractElem = document.getElementById("cargoContract");
    const btnGen = document.getElementById("btnGenerate");

    const commodity = commElem ? commElem.value : "Coking Coal (Prime Hard)";
    const origin = originElem ? originElem.value : "Australia (Hay Point / Gladstone)";
    const destPortId = destElem ? parseInt(destElem.value, 10) : 1;
    const quantity = qtyElem ? parseFloat(qtyElem.value) : 75000;
    const contractPref = contractElem ? contractElem.value : "Spot";
    const startStr = startElem && startElem.value ? startElem.value : "2026-11-12";
    const endStr = endElem && endElem.value ? endElem.value : "2026-11-23";

    if (btnGen) {
        btnGen.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating Recommendation...`;
        btnGen.disabled = true;
    }

    try {
        // Step 1: Create Cargo record in PostgreSQL
        const cargoPayload = {
            cargo_type: commodity.includes("Coal") ? "Coking Coal" : "Iron Ore",
            quantity: quantity,
            origin: origin.split("(")[0].trim(),
            destination_port_id: destPortId,
            laycan_start: startStr,
            laycan_end: endStr,
            contract_preference: contractPref
        };

        const cargoRes = await fetch(`${API_BASE}/cargo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cargoPayload)
        });

        if (!cargoRes.ok) {
            throw new Error(`Failed to create cargo: ${cargoRes.statusText}`);
        }
        const createdCargo = await cargoRes.json();
        currentCargoId = createdCargo.id;

        // Step 2: Trigger Recommendation Engine
        const recRes = await fetch(`${API_BASE}/recommendation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cargo_id: currentCargoId })
        });

        if (!recRes.ok) {
            throw new Error(`Failed to generate recommendation: ${recRes.statusText}`);
        }
        const recData = await recRes.json();

        const fixStart = recData.fixture_window?.start || startStr;
        const fixEnd = recData.fixture_window?.end || endStr;
        const windowDisplay = `${formatShortDate(fixStart)} – ${formatShortDate(fixEnd)}`;

        // Update score & directive header
        const scoreEl = document.getElementById("recScore");
        if (scoreEl) scoreEl.textContent = recData.score || 79;

        // Update 4 Metric Cards
        const vesselEl = document.getElementById("recVesselClass");
        if (vesselEl) vesselEl.textContent = (recData.vessel_class || "PANAMAX").toUpperCase();

        const vesselDescEl = document.getElementById("recVesselDesc");
        if (vesselDescEl) vesselDescEl.textContent = "Physically Feasible & Parcel Matched";

        const windowEl = document.getElementById("recFixtureWindow");
        if (windowEl) windowEl.textContent = windowDisplay;

        const stratEl = document.getElementById("recStrategy");
        if (stratEl) stratEl.textContent = recData.contract_type || contractPref || "CoA";

        const stratDescEl = document.getElementById("recStrategyDesc");
        if (stratDescEl) stratDescEl.textContent = (recData.contract_type || contractPref) === "CoA" ? "Multi-Voyage Hedged" : "Single Voyage Index Linked";

        const riskEl = document.getElementById("recRiskIndex");
        if (riskEl) riskEl.textContent = (recData.risk_level || "HIGH").toUpperCase();

        // Update Forecast Rates
        if (recData.rate) {
            const p10El = document.getElementById("recP10");
            const p50El = document.getElementById("recP50");
            const p90El = document.getElementById("recP90");
            if (p10El && recData.rate.p10 !== undefined) p10El.textContent = `$${recData.rate.p10.toFixed(2)}`;
            if (p50El && recData.rate.p50 !== undefined) p50El.textContent = `$${recData.rate.p50.toFixed(2)}`;
            if (p90El && recData.rate.p90 !== undefined) p90El.textContent = `$${recData.rate.p90.toFixed(2)}`;
        }

        // Update Rationale Checklist
        const rationaleUl = document.getElementById("recRationaleList");
        if (rationaleUl && recData.reasons && recData.reasons.length > 0) {
            rationaleUl.innerHTML = "";
            recData.reasons.forEach(reason => {
                const li = document.createElement("li");
                li.innerHTML = `<i class="fa-solid fa-check text-green"></i> <span>${reason}</span>`;
                rationaleUl.appendChild(li);
            });
        }

        currentVesselClass = recData.vessel_class || "Panamax";
    } catch (err) {
        console.error("Plan generation error:", err);
        // Physical feasibility rejection check (e.g. Haldia shallow port)
        const compRes = await fetch(`${API_BASE}/compatibility`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cargo_quantity: quantity, destination_port_id: destPortId })
        }).catch(() => null);

        if (compRes && compRes.ok) {
            const compData = await compRes.json();
            const vesselEl = document.getElementById("recVesselClass");
            if (vesselEl) vesselEl.innerHTML = `<span style="color:#ef4444; font-size:16px;">PHYSICALLY INFEASIBLE</span>`;
            const vesselDescEl = document.getElementById("recVesselDesc");
            if (vesselDescEl) vesselDescEl.textContent = "Berth / Draft Constraints Exceeded";
            const scoreEl = document.getElementById("recScore");
            if (scoreEl) scoreEl.textContent = "0";
            const riskEl = document.getElementById("recRiskIndex");
            if (riskEl) riskEl.textContent = "CRITICAL";

            const rationaleUl = document.getElementById("recRationaleList");
            if (rationaleUl && compData.excluded_vessels && compData.excluded_vessels.length > 0) {
                rationaleUl.innerHTML = "";
                compData.excluded_vessels.forEach(ex => {
                    const li = document.createElement("li");
                    li.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> <span><strong>${ex.vessel_class} Excluded:</strong> ${ex.reason}</span>`;
                    rationaleUl.appendChild(li);
                });
            }
        }
    } finally {
        if (btnGen) {
            btnGen.innerHTML = `Generate Recommendation`;
            btnGen.disabled = false;
        }
    }
}

// Update the Vessel Recommendation page dynamically
function updateVesselPage(recommendedClass, feasibleList) {
    const vesselCards = document.querySelectorAll(".vessel-card");
    if (vesselCards.length > 0) {
        const topCard = vesselCards[0];
        const title = topCard.querySelector("h3");
        if (title) title.textContent = `MV ${recommendedClass} Leader`;
        const recLabel = topCard.querySelector(".recommended-label");
        if (recLabel) recLabel.innerHTML = `<i class="fa-solid fa-star"></i> AI OPTIMIZED (${recommendedClass.toUpperCase()})`;
    }
}

/* =====================================================
   SPOT VS COA SIMULATOR
===================================================== */

async function runCoASimulation() {
    const qtyElem = document.getElementById("coaQty");
    const spotElem = document.getElementById("spotRate");
    const coaElem = document.getElementById("coaRate");
    const volElem = document.getElementById("volatility");

    const volume = qtyElem ? parseFloat(qtyElem.value) : 500000;
    const spotRateVal = spotElem ? parseFloat(spotElem.value) : 24.8;
    const coaRateVal = coaElem ? parseFloat(coaElem.value) : 23.2;

    const spotTotalElem = document.getElementById("spotTotal");
    const coaTotalElem = document.getElementById("coaTotal");
    const decisionElem = document.getElementById("coaDecision");
    const advElem = document.getElementById("coaAdvantage");
    const progElem = document.getElementById("coaProgress");

    try {
        const coaPayload = {
            cargo_id: currentCargoId || 1,
            cargo_volume: volume,
            vessel_class: (currentVesselClass && ["Supramax", "Panamax", "Capesize", "Handysize"].includes(currentVesselClass) && currentVesselClass !== "Capesize") ? currentVesselClass : "Supramax",
            horizon_months: 6
        };

        const res = await fetch(`${API_BASE}/coa`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(coaPayload)
        });

        if (res.ok) {
            const data = await res.json();
            const spotCost = data.expected_spot_cost || (volume * spotRateVal);
            const coaCost = data.expected_coa_cost || (volume * coaRateVal);
            const diff = Math.abs(spotCost - coaCost);
            const pref = data.preferred_option || (coaCost < spotCost ? "CoA" : "Spot");

            if (spotTotalElem) spotTotalElem.textContent = `$${(spotCost / 1e6).toFixed(2)}M`;
            if (coaTotalElem) coaTotalElem.textContent = `$${(coaCost / 1e6).toFixed(2)}M`;

            const advPct = ((diff / Math.max(spotCost, coaCost)) * 100).toFixed(1);
            if (advElem) advElem.textContent = `${advPct}%`;
            if (progElem) progElem.style.width = `${Math.min(100, Math.max(10, parseFloat(advPct) * 4))}%`;

            if (decisionElem) {
                decisionElem.innerHTML = `
                    <i class="fa-solid fa-circle-check" style="color:#22c55e;"></i>
                    <div>
                        <strong>${pref} Strategy Preferred</strong>
                        <p>${data.reason || `Cost savings of $${(diff / 1e3).toFixed(1)}k with controlled forward volatility.`}</p>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error("CoA simulation error:", err);
    }
}

/* =====================================================
   PORT EXPLORER & INTERACTIVE MARITIME MAP
===================================================== */

function initPortMap() {
    if (!window.L) {
        console.warn("Leaflet library not loaded yet.");
        return;
    }
    const mapContainer = document.getElementById("portMap");
    if (!mapContainer) return;

    if (portMapInstance) {
        portMapInstance.invalidateSize();
        return;
    }

    try {
        // Initialize Leaflet map centered on Indian East Coast
        portMapInstance = L.map("portMap", {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true
        }).setView([18.5, 84.5], 6);

        // Add ESRI World Dark Gray tile layer for crisp, unwatermarked maritime styling
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
            attribution: '&copy; Esri, DeLorme, NAVTEQ',
            maxZoom: 16
        }).addTo(portMapInstance);

        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 16,
            pane: "overlayPane"
        }).addTo(portMapInstance);

        // Indian East Coast Trunk Line connecting key hubs
        const eastCoastLine = [
            [22.5414, 88.3188], // Kolkata
            [22.0232, 88.0673], // Haldia
            [20.8039, 86.9608], // Dhamra
            [20.2644, 86.6713], // Paradip
            [19.308, 84.9664],  // Gopalpur
            [17.6868, 83.2185], // Visakhapatnam
            [17.62, 83.2386],   // Gangavaram
            [13.2611, 80.3328], // Kamarajar (Ennore)
            [13.0827, 80.2707], // Chennai
            [8.7642, 78.1348]   // Tuticorin
        ];
        const ecPoly = L.polyline(eastCoastLine, {
            color: "#20b8ff",
            weight: 2.5,
            opacity: 0.85,
            dashArray: "6, 8"
        }).addTo(portMapInstance);
        portRouteLayers.push(ecPoly);

        // Global shipping corridors into East Coast Indian ports
        const globalCorridors = [
            // Russia (Vostochny) -> Malacca -> Bay of Bengal -> Paradip
            [[42.7333, 133.0833], [32.0, 126.0], [15.0, 114.0], [3.5, 101.5], [10.0, 92.0], [20.2644, 86.6713]],
            // Australia (Hay Point / Gladstone) -> Lombok Strait -> Bay of Bengal -> Vizag
            [[-21.2858, 149.2995], [-12.0, 130.0], [-8.5, 116.0], [6.0, 90.0], [17.6868, 83.2185]],
            // Mozambique (Maputo / Beira) -> Indian Ocean -> Sri Lanka -> Chennai / Paradip
            [[-25.9692, 32.5732], [-12.0, 55.0], [3.0, 75.0], [6.5, 80.0], [13.0827, 80.2707]],
            // Indonesia (Balikpapan / Samarinda) -> Singapore -> Bay of Bengal -> Dhamra
            [[-1.2654, 116.8312], [1.29, 103.85], [11.0, 88.0], [20.8039, 86.9608]]
        ];

        globalCorridors.forEach(lane => {
            const lanePoly = L.polyline(lane, {
                color: "#38bdf8",
                weight: 1.8,
                opacity: 0.55,
                dashArray: "4, 8"
            }).addTo(portMapInstance);
            portRouteLayers.push(lanePoly);
        });

        // Render port markers on map
        renderPortMarkers();

        // Invalidate size once rendered
        setTimeout(() => {
            if (portMapInstance) portMapInstance.invalidateSize();
        }, 200);

    } catch (e) {
        console.error("Error initializing port map:", e);
    }
}

function renderPortMarkers() {
    if (!portMapInstance || !portsCache || portsCache.length === 0) return;

    // Clear existing markers
    Object.values(portMarkers).forEach(marker => {
        try { portMapInstance.removeLayer(marker); } catch (e) {}
    });
    portMarkers = {};

    portsCache.forEach(port => {
        if (port.latitude !== null && port.longitude !== null && !isNaN(port.latitude) && !isNaN(port.longitude)) {
            const isDeep = port.max_draft >= 18;
            const isStandard = port.max_draft >= 14 && port.max_draft < 18;
            const badgeClass = isDeep ? "deep" : (isStandard ? "standard" : "sensitive");
            const draftLabel = isDeep ? "Deep Draft" : (isStandard ? "Standard" : "Draft-sensitive");

            const iconHtml = `
                <div class="map-port-pin ${badgeClass}" id="pin-${port.id}">
                    <span class="pin-pulse"></span>
                    <span class="pin-core"></span>
                    <span class="pin-label">${port.name}</span>
                </div>
            `;
            const customIcon = L.divIcon({
                html: iconHtml,
                className: "leaflet-port-divicon",
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([port.latitude, port.longitude], { icon: customIcon }).addTo(portMapInstance);

            const popupHtml = `
                <div style="font-family: Inter, sans-serif; min-width: 170px;">
                    <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-anchor" style="color:#20b8ff;"></i> ${port.name}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">${port.country || 'Maritime Hub'} &bull; <span style="color: ${isDeep ? '#10b981' : isStandard ? '#f59e0b' : '#ef4444'}; font-weight:700;">${draftLabel}</span></div>
                    <div style="font-size: 11px; line-height: 1.5; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                        <div>Draft: <strong style="color:#fff;">${port.max_draft}m</strong> | LOA: <strong style="color:#fff;">${port.max_loa}m</strong></div>
                        <div>Discharge: <strong style="color:#38bdf8;">${port.handling_rate.toLocaleString()} MT/day</strong></div>
                    </div>
                    <button type="button" onclick="selectPort('${port.name.replace(/'/g, "\\'")}')" style="margin-top:8px; width:100%; background:rgba(32,184,255,0.2); border:1px solid #20b8ff; color:#fff; border-radius:4px; padding:5px; font-size:10px; font-weight:700; cursor:pointer;">
                        Inspect Port Profile &rarr;
                    </button>
                </div>
            `;
            marker.bindPopup(popupHtml, { offset: [0, -10] });

            marker.on("click", () => {
                selectPort(port.name);
            });

            portMarkers[port.name.toLowerCase()] = marker;
        }
    });
}

function setPortMapView(viewType) {
    if (!portMapInstance) return;

    document.querySelectorAll(".view-btn").forEach(btn => btn.classList.remove("active"));

    if (viewType === "east-coast") {
        document.getElementById("btnViewEastCoast")?.classList.add("active");
        portMapInstance.flyTo([18.5, 84.5], 6, { duration: 0.8 });
    } else if (viewType === "india") {
        document.getElementById("btnViewIndia")?.classList.add("active");
        portMapInstance.flyTo([19.0, 78.5], 5, { duration: 0.8 });
    } else if (viewType === "global") {
        document.getElementById("btnViewGlobal")?.classList.add("active");
        portMapInstance.flyTo([15.0, 95.0], 3, { duration: 0.8 });
    }
}

function filterPortList(query) {
    const listContainer = document.getElementById("portListContainer");
    if (!listContainer) return;
    const q = (query || "").toLowerCase().trim();
    const buttons = listContainer.querySelectorAll("button");
    buttons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (!q || text.includes(q)) {
            btn.style.display = "grid";
        } else {
            btn.style.display = "none";
        }
    });
}

async function selectPort(portName, details = null, congestion = null) {
    if (!portsCache || portsCache.length === 0) return;

    const port = portsCache.find(p => p.name.toLowerCase() === portName.toLowerCase());
    const displayContainer = document.getElementById("selectedPortCard");

    if (port) {
        const isDeep = port.max_draft >= 18;
        const isStandard = port.max_draft >= 14 && port.max_draft < 18;
        const badgeClass = isDeep ? "deep" : (isStandard ? "standard" : "sensitive");
        const badgeLabel = isDeep ? "Deep Draft" : (isStandard ? "Standard" : "Draft-sensitive");
        const lighteringVal = port.lightering_available ? "Yes" : "No";
        const dischargeRateVal = `${port.handling_rate.toLocaleString()} MT/day`;

        // Exact match to User Reference Mockup Image 2
        const profileMarkup = `
            <div class="port-profile-header">
                <span class="port-name-main">${port.name}</span>
                <span class="port-specs-mid">Draft: ${port.max_draft}m, LOA: ${port.max_loa}m</span>
                <span class="port-badge ${badgeClass}">${badgeLabel}</span>
            </div>
            <div class="port-profile-card">
                <div class="port-profile-card-title">
                    <i class="fa-solid fa-anchor anchor-icon"></i>
                    <span>${port.name} Port Profile</span>
                </div>
                <div class="port-profile-grid">
                    <div class="port-profile-cell">
                        <span class="param-label">Max Draft:</span>
                        <span class="param-value">${port.max_draft} meters</span>
                    </div>
                    <div class="port-profile-cell">
                        <span class="param-label">Max LOA:</span>
                        <span class="param-value">${port.max_loa} meters</span>
                    </div>
                    <div class="port-profile-cell">
                        <span class="param-label">Max Beam:</span>
                        <span class="param-value">${port.max_beam} meters</span>
                    </div>
                    <div class="port-profile-cell">
                        <span class="param-label">Discharge Rate:</span>
                        <span class="param-value">${dischargeRateVal}</span>
                    </div>
                    <div class="port-profile-cell">
                        <span class="param-label">Lightering:</span>
                        <span class="param-value">${lighteringVal}</span>
                    </div>
                    <div class="port-profile-cell">
                        <span class="param-label">Database ID:</span>
                        <span class="param-value">#${port.id} (PostgreSQL)</span>
                    </div>
                </div>
            </div>
        `;

        if (displayContainer) {
            displayContainer.innerHTML = profileMarkup;
        }

        // Highlight active port in sidebar list
        const listContainer = document.getElementById("portListContainer");
        if (listContainer) {
            const buttons = listContainer.querySelectorAll("button");
            buttons.forEach(btn => {
                const bTitle = btn.querySelector("strong");
                if (bTitle && bTitle.textContent.toLowerCase() === port.name.toLowerCase()) {
                    btn.classList.add("active-port");
                    btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
                } else {
                    btn.classList.remove("active-port");
                }
            });
        }

        // Pan and highlight marker on Leaflet map
        if (portMapInstance && port.latitude !== null && port.longitude !== null && !isNaN(port.latitude) && !isNaN(port.longitude)) {
            const currentZoom = portMapInstance.getZoom();
            const targetZoom = currentZoom < 5 ? 5 : (port.country === "India" ? Math.max(currentZoom, 6) : 5);
            portMapInstance.flyTo([port.latitude, port.longitude], targetZoom, {
                duration: 0.8
            });

            // Mark pin as selected
            document.querySelectorAll(".map-port-pin").forEach(el => el.classList.remove("selected"));
            const marker = portMarkers[port.name.toLowerCase()];
            if (marker) {
                const el = marker.getElement();
                if (el) {
                    const pin = el.querySelector(".map-port-pin");
                    if (pin) pin.classList.add("selected");
                }
            }
        }
    } else {
        if (detailDiv) {
            detailDiv.innerHTML = `<strong>${portName}</strong>: ${details || 'Operating profile active.'}`;
        }
    }
}

/* =====================================================
   USER PROFILE & SESSION MANAGEMENT
===================================================== */

function initUserProfile() {
    try {
        const userStr = localStorage.getItem("freightiq_user");
        if (userStr) {
            const user = JSON.parse(userStr);
            const nameEl = document.querySelector(".user strong");
            const roleEl = document.querySelector(".user small");
            const avatarEl = document.querySelector(".user-avatar");
            const authLink = document.getElementById("authLink");
            const authLinkText = document.getElementById("authLinkText");

            if (nameEl && user.name) nameEl.textContent = user.name;
            if (roleEl && (user.role || user.company)) roleEl.textContent = `${user.role || 'Chartering'} (${user.company || 'Enterprise'})`;
            if (avatarEl && user.name) avatarEl.textContent = user.name.charAt(0).toUpperCase();

            if (authLink) {
                authLink.title = "Sign Out / Switch Account";
                if (authLinkText) authLinkText.textContent = "Sign Out";
                authLink.onclick = (e) => {
                    e.preventDefault();
                    if (confirm("Sign out of current FreightIQ session?")) {
                        localStorage.removeItem("freightiq_user");
                        window.location.href = "login.html";
                    }
                };
            }
        }
    } catch (e) {
        console.warn("User profile init error:", e);
    }
}

/* =====================================================
   HACKATHON QUICK DEMO SCENARIOS
===================================================== */

async function loadDemoScenario(scenarioNum) {
    if (scenarioNum === 1) {
        // Scenario 1: Paradip 75,000 MT Coking Coal -> Panamax Recommended
        showPage("cargo");
        const commSelect = document.getElementById("cargoCommodity");
        const originSelect = document.getElementById("cargoOrigin");
        const destSelect = document.getElementById("cargoDestination");
        const qtyInput = document.getElementById("cargoQty");
        const startInput = document.getElementById("laycanStart");
        const endInput = document.getElementById("laycanEnd");

        if (commSelect) commSelect.value = "Coking Coal (Prime Hard)";
        if (originSelect) originSelect.value = "Australia (Hay Point / Gladstone)";
        if (qtyInput) qtyInput.value = "75000";
        if (startInput) startInput.value = "2026-11-12";
        if (endInput) endInput.value = "2026-11-23";
        selectContractPreference("Spot");

        if (destSelect && portsCache.length > 0) {
            const paradip = portsCache.find(p => p.name.toLowerCase() === "paradip") || portsCache[0];
            destSelect.value = paradip.id;
        }

        await generatePlan();

    } else if (scenarioNum === 2) {
        // Scenario 2: Haldia Shallow Port Feasibility Overrule (Capesize/Panamax draft rejected)
        showPage("cargo");
        const commSelect = document.getElementById("cargoCommodity");
        const originSelect = document.getElementById("cargoOrigin");
        const destSelect = document.getElementById("cargoDestination");
        const qtyInput = document.getElementById("cargoQty");

        if (commSelect) commSelect.value = "Coking Coal (Prime Hard)";
        if (originSelect) originSelect.value = "Australia (Hay Point / Gladstone)";
        if (qtyInput) qtyInput.value = "75000";

        if (destSelect && portsCache.length > 0) {
            const haldia = portsCache.find(p => p.name.toLowerCase().includes("haldia"));
            if (haldia) {
                destSelect.value = haldia.id;
            }
        }

        await generatePlan();

    } else if (scenarioNum === 3) {
        // Scenario 3: Vizag 55kt Spot vs CoA
        showPage("coa");
        const qtyElem = document.getElementById("coaQty");
        const spotElem = document.getElementById("spotRate");
        const coaElem = document.getElementById("coaRate");

        if (qtyElem) qtyElem.value = "500000";
        if (spotElem) spotElem.value = "24.5";
        if (coaElem) coaElem.value = "22.8";

        await runCoASimulation();
    }
}

/* =====================================================
   EVENT LISTENERS & STARTUP
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    showPage("dashboard");
    initUserProfile();
    initAppData();

    // Chart Range Selector
    const rangeSelect = document.getElementById("chartRange");
    if (rangeSelect) {
        rangeSelect.addEventListener("change", () => {
            loadMarketData();
        });
    }

    // Hover feedback on cards
    document.querySelectorAll(".stat-card, .vessel-card, .forecast-card").forEach(card => {
        card.addEventListener("mouseenter", () => {
            card.style.transition = "all 0.3s ease";
        });
    });

    // Vessel selection buttons
    document.querySelectorAll(".select-btn").forEach(button => {
        button.addEventListener("click", function() {
            const oldText = this.innerHTML;
            this.innerHTML = `<i class="fa-solid fa-check"></i> Fixture Confirmed`;
            this.style.background = "#22c55e";
            setTimeout(() => {
                this.innerHTML = oldText;
                this.style.background = "";
            }, 2000);
        });
    });
});