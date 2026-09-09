/* ==================================================
   FREIGHTIQ
   APPLICATION JAVASCRIPT & BACKEND INTEGRATION
   PostgreSQL + FastAPI + ML XGBoost Decision Engine
================================================== */

const API_BASE = (window.location.port === "8000")
    ? window.location.origin
    : "http://127.0.0.1:8000";

/* Centralized Role-Based Fetch Wrapper */
async function authFetch(url, options = {}) {
    let role = "Logistics Manager";
    try {
        const userStr = localStorage.getItem("freightiq_user");
        if (userStr) {
            const u = JSON.parse(userStr);
            if (u && u.role) role = u.role;
        }
    } catch (e) {}

    const headers = Object.assign({}, options.headers || {}, {
        "X-User-Role": role,
        "Authorization": `Bearer ${role.toLowerCase().replace(/\s+/g, '_')}_token`
    });

    return fetch(url, Object.assign({}, options, { headers }));
}

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

    // Role-specific automated view triggers
    if (pageId === "dashboard") {
        loadLogisticsKPIs();
    } else if (pageId === "decisions") {
        loadDecisionsTable();
    } else if (pageId === "charteringOps") {
        loadCharteringOpsSummary();
    } else if (pageId === "tonnageBoard") {
        loadTonnageBoard();
    } else if (pageId === "fixtureMgmt") {
        loadApprovedCargoForChartering();
        loadConfirmedFixtures();
    } else if (pageId === "voyageTimeline") {
        loadAllVoyages();
    } else if (pageId === "navSafety") {
        initNavSafetyDropdowns();
    } else if (pageId === "ballastOps") {
        initBallastDropdowns();
    } else if (pageId === "analystOverview") {
        loadAnalystOverview();
    } else if (pageId === "analystForecast") {
        renderAnalystForecastChart(30);
    } else if (pageId === "balticMonitor") {
        loadBalticMonitor();
    } else if (pageId === "macroAnomalies") {
        loadMacroAnomalies();
    } else if (pageId === "modelPerformance") {
        loadModelPerformance();
    } else if (pageId === "dataQuality") {
        loadDataQualityReport();
    }

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

    // Handle Ranked Vessel Recommendations update grounded in active cargo parcel
    if (pageId === "vessel") {
        renderRankedVessels();
    }
}

/* =====================================================
   PAGE TITLES
===================================================== */

function updatePageTitle(pageId) {
    const titles = {
        dashboard: ["Procurement Command Center", "High-level overview of bulk cargo procurement & logistics KPIs"],
        cargo: ["Cargo Wizard", "Define cargo parameters for end-to-end AI recommendations"],
        vessel: ["Ranked Vessel Recommendations", "Physical feasibility-constrained candidate ranking"],
        forecast: ["Freight Rate Forecast & SHAP", "AI-powered freight rate prediction and explainability"],
        ports: ["Port Explorer", "Inspect East Coast India port constraints and vessel draft"],
        coa: ["Spot vs CoA Simulator", "Evaluate market volatility and contract cost exposure"],
        risk: ["Risk Score", "Monitor maritime freight, weather and port risks"],
        alerts: ["Risk & Alerts", "Live operational signals and maritime hazard advisories"],
        decisions: ["Procurement Decisions & Approvals", "Stem audit trail and commercial sign-offs"],
        charteringOps: ["Chartering Operations Center", "Fleet disposition, vessel nominations & live execution"],
        tonnageBoard: ["Tonnage Availability Board", "350 real bulk carriers with real-time status & positions"],
        fixtureMgmt: ["Fixture & Contract Management", "Charterparty agreement, freight fixing & voyage nomination"],
        voyageTimeline: ["Voyage Execution Timeline", "9-stage closed-loop operational voyage tracking"],
        navSafety: ["UKC Navigational Safety Margin", "Dynamic draft, squat effect & tidal surge clearance"],
        ballastOps: ["Ballast & Repositioning Economics", "Vessel positioning cost, fuel burn & TCE optimization"],
        laycanMonitor: ["Laycan & Demurrage Monitor", "Readiness windows, weather delays & demurrage exposure"],
        analystOverview: ["Market Intelligence Overview", "Baltic macro trends, freight spreads & volatility index"],
        analystForecast: ["Multi-Horizon Freight Forecast", "P10 / P50 / P90 probabilistic rate forecast curves"],
        balticMonitor: ["Baltic Dry Indices Monitor", "Real-time BDI, BCI, BPI, BSI cross-index correlation"],
        macroAnomalies: ["Macro Signals & Anomaly Detection", "Bunker shock, congestion spikes & spread divergences"],
        modelPerformance: ["Model Performance & Backtesting", "XGBoost vs Naive baseline, MAPE, MAE & drift tracking"],
        dataQuality: ["Data Quality & Pipeline Health", "Completeness scoring, schema validation & update latency"]
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
    await renderRankedVessels();
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

        // Determine requested days range (30, 60, 90) from #chartRange selector
        const rangeSelect = document.getElementById("chartRange");
        let days = 30;
        if (rangeSelect) {
            const val = rangeSelect.value || "";
            const parsed = parseInt(val);
            if (!isNaN(parsed)) {
                days = parsed;
            } else if (val.includes("90")) {
                days = 90;
            } else if (val.includes("60")) {
                days = 60;
            } else {
                days = 30;
            }
        }

        // Update Market Chart with selected range
        const history = data.historical || [];
        if (history.length > 0) {
            const recent = history.slice(-days);
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
async function loadForecastData(targetRoute = null, targetVessel = null, targetHorizon = null) {
    const route = targetRoute || currentRoute;
    const vessel = targetVessel || currentVesselClass;

    const horizonSelect = document.getElementById("forecastHorizonSelect");
    const horizon = targetHorizon || (horizonSelect ? parseInt(horizonSelect.value) || 30 : 30);

    try {
        // Fetch both market history and forecast in parallel with dynamic horizon
        const [marketRes, forecastRes] = await Promise.all([
            fetch(`${API_BASE}/market?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}`),
            fetch(`${API_BASE}/forecast?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}&horizon_days=${horizon}`)
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
            // 7 Days forward
            const fc7 = forecasts.length >= 7 ? forecasts[6].p50 : forecasts[forecasts.length - 1].p50;
            const diff7 = ((fc7 - currentRate) / currentRate) * 100;
            if (fcVal7d) fcVal7d.textContent = `$${fc7.toFixed(2)}`;
            if (fcSub7d) {
                fcSub7d.textContent = `${diff7 >= 0 ? '+' : ''}${diff7.toFixed(1)}% vs Current`;
                fcSub7d.className = diff7 >= 0 ? "trend-up" : "trend-down";
            }

            // Target Horizon forward (e.g. 30d, 60d, or 90d)
            const targetIdx = forecasts.length - 1;
            const fcTarget = forecasts[targetIdx].p50;
            const diffTarget = ((fcTarget - currentRate) / currentRate) * 100;

            const cardTargetLabel = document.querySelector("#fcCard30d span");
            if (cardTargetLabel) cardTargetLabel.textContent = `${horizon}-Day Forward (P50)`;

            if (fcVal30d) fcVal30d.textContent = `$${fcTarget.toFixed(2)}`;
            if (fcSub30d) {
                fcSub30d.textContent = `${diffTarget >= 0 ? '+' : ''}${diffTarget.toFixed(1)}% vs Current`;
                fcSub30d.className = diffTarget >= 0 ? "trend-up" : "trend-down";
            }

            // Forward Risk Upper Bound (P90 at horizon)
            const p90Val = forecasts[targetIdx].p90;
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
                const icon = r.event_type === "weather" ? "fa-cloud" : r.event_type === "port_congestion" ? "fa-anchor" : r.event_type === "geopolitical" ? "fa-earth-asia" : "fa-chart-line";
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

        // Determine Overall Risk Level from backend
        const riskLevel = data.overall_risk_level || data.risk_level || (highCount > 0 ? "High" : medCount > 0 ? "Medium" : "Low");

        // Group active risk events by analytical pillar
        const volRisks = risks.filter(r => r.event_type === "freight_anomaly");
        const geoRisks = risks.filter(r => r.event_type === "geopolitical");
        const portRisks = risks.filter(r => r.event_type === "port_congestion");
        const wxRisks = risks.filter(r => r.event_type === "weather");

        // Calculate dynamic sub-scores (0-100) per pillar based on signal severity
        const evalPillar = (items, fallback) => {
            if (!items.length) return { score: fallback, label: "Low • Normal baseline" };
            if (items.some(i => i.severity === "High")) {
                return { score: 84, label: "High • Disruption signal active" };
            }
            if (items.some(i => i.severity === "Medium")) {
                return { score: 56, label: "Moderate • Elevated volatility" };
            }
            return { score: 28, label: "Low • Minor advisory" };
        };

        const volEval = evalPillar(volRisks, 45);
        const geoEval = evalPillar(geoRisks, 38);
        const portEval = evalPillar(portRisks, 22);
        const wxEval = evalPillar(wxRisks, 20);

        // Weighted Composite Risk Index = (0.35 × Vol) + (0.25 × Geo) + (0.20 × Port) + (0.20 × Wx)
        const compositeScore = Math.round(
            (0.35 * volEval.score) +
            (0.25 * geoEval.score) +
            (0.20 * portEval.score) +
            (0.20 * wxEval.score)
        );

        // Update Gauge & Level
        const riskGauge = document.getElementById("riskScoreValue") || document.querySelector(".risk-circle strong");
        if (riskGauge) riskGauge.textContent = compositeScore;

        const levelHeading = document.getElementById("riskLevelHeading") || document.querySelector(".risk-score-panel h2");
        const levelDesc = document.getElementById("riskLevelDescription") || document.querySelector(".risk-score-panel p");
        const riskCircle = document.getElementById("riskCircleGauge") || document.querySelector(".risk-circle");

        const color = compositeScore >= 70 ? "var(--red)" : compositeScore >= 40 ? "var(--orange)" : "var(--green)";

        if (levelHeading) {
            levelHeading.textContent = `${riskLevel} Risk`;
            levelHeading.style.color = color;
        }

        if (levelDesc) {
            if (compositeScore >= 70) {
                levelDesc.textContent = "Active disruption signals detected. High freight volatility or route bottlenecks require defensive chartering.";
            } else if (compositeScore >= 40) {
                levelDesc.textContent = "Moderate market momentum or port delays observed. Forward fixing or partial hedging advised.";
            } else {
                levelDesc.textContent = "Current conditions indicate a relatively stable procurement environment with manageable volatility.";
            }
        }

        if (riskCircle) {
            riskCircle.style.background = `conic-gradient(${color} ${compositeScore}%, #173044 ${compositeScore}%)`;
        }

        // Update Risk Factors progress bars and pill labels
        const updatePillarBar = (barId, pctId, sevId, evalObj, weightText) => {
            const bar = document.getElementById(barId);
            const pct = document.getElementById(pctId);
            const sev = document.getElementById(sevId);
            if (bar) bar.style.width = `${evalObj.score}%`;
            if (pct) pct.textContent = `${evalObj.score}%`;
            if (sev) sev.textContent = `${weightText} • ${evalObj.label}`;
        };

        updatePillarBar("barVolatility", "pctVolatility", "volatilitySeverity", volEval, "Weight: 35%");
        updatePillarBar("barGeopolitical", "pctGeopolitical", "geopoliticalSeverity", geoEval, "Weight: 25%");
        updatePillarBar("barCongestion", "pctCongestion", "congestionSeverity", portEval, "Weight: 20%");
        updatePillarBar("barWeather", "pctWeather", "weatherSeverity", wxEval, "Weight: 20%");

        // Update active risk event count badge
        const countBadge = document.getElementById("activeRiskEventCount");
        if (countBadge) {
            countBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${risks.length} Monitored Signals`;
        }

        // Update Dashboard Top KPI card if present
        const kpiRisk = document.querySelector(".stat-card.orange h2");
        if (kpiRisk) kpiRisk.innerHTML = `${compositeScore}<span>/100</span>`;
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

    const isDense = dataPoints.length > 40;

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
                pointRadius: isDense ? 2 : 4,
                pointHoverRadius: isDense ? 5 : 7,
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
                    ticks: {
                        color: "#6f849a",
                        font: { size: 9 },
                        maxTicksLimit: 10,
                        maxRotation: 0
                    }
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
                    ticks: {
                        color: "#6f849a",
                        font: { size: 9.5 },
                        maxTicksLimit: 12,
                        maxRotation: 0
                    }
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
    const horizonSelect = document.getElementById("forecastHorizonSelect");
    if (!routeSelect || !vesselSelect) return;

    const selectedRoute = routeSelect.value;
    const selectedVessel = vesselSelect.value;
    const selectedHorizon = horizonSelect ? parseInt(horizonSelect.value) || 30 : 30;

    loadForecastData(selectedRoute, selectedVessel, selectedHorizon);
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

let currentEstimatedRate = 25.96;

function updateLiveCostPreview() {
    const qtyInput = document.getElementById("cargoQty");
    const liveCostText = document.getElementById("liveCostText");
    const liveCostRate = document.getElementById("liveCostRate");
    if (!qtyInput || !liveCostText) return;

    const qty = parseFloat(qtyInput.value) || 0;
    const rate = currentEstimatedRate;
    const total = qty * rate;

    liveCostText.textContent = `$${Math.round(total).toLocaleString()} USD`;
    if (liveCostRate) {
        liveCostRate.textContent = `(@ ~$${rate.toFixed(2)}/MT)`;
    }
}
window.updateLiveCostPreview = updateLiveCostPreview;

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

        // Update Forecast Rates & Total Cost Analysis
        if (recData.rate) {
            const p10 = recData.rate.p10 !== undefined ? recData.rate.p10 : 23.60;
            const p50 = recData.rate.p50 !== undefined ? recData.rate.p50 : 25.96;
            const p90 = recData.rate.p90 !== undefined ? recData.rate.p90 : 31.57;

            currentEstimatedRate = p50;

            const p10El = document.getElementById("recP10");
            const p50El = document.getElementById("recP50");
            const p90El = document.getElementById("recP90");
            if (p10El) p10El.textContent = `$${p10.toFixed(2)}`;
            if (p50El) p50El.textContent = `$${p50.toFixed(2)}`;
            if (p90El) p90El.textContent = `$${p90.toFixed(2)}`;

            // Calculate Total Voyage Freight Outlay
            const totalP50 = quantity * p50;
            const totalP10 = quantity * p10;
            const totalP90 = quantity * p90;

            const basisTag = document.getElementById("costBasisTag");
            if (basisTag) basisTag.textContent = `${quantity.toLocaleString()} MT @ $${p50.toFixed(2)} / MT`;

            const totalExpEl = document.getElementById("totalCostExpected");
            if (totalExpEl) totalExpEl.innerHTML = `$${Math.round(totalP50).toLocaleString()} <small>USD</small>`;

            const totalHumanEl = document.getElementById("totalCostHuman");
            if (totalHumanEl) {
                const millionVal = (totalP50 / 1000000).toFixed(2);
                totalHumanEl.textContent = `Approx. $${millionVal} Million USD for ${quantity.toLocaleString()} MT voyage fixture`;
            }

            // Scenarios P10, P50, P90
            const costP10El = document.getElementById("costP10Amount");
            const costP10RateEl = document.getElementById("costP10Rate");
            const costP10DiffEl = document.getElementById("costP10Diff");
            if (costP10El) costP10El.textContent = `$${Math.round(totalP10).toLocaleString()}`;
            if (costP10RateEl) costP10RateEl.textContent = `@ $${p10.toFixed(2)} / MT`;
            if (costP10DiffEl) {
                const diff = totalP50 - totalP10;
                const pct = ((p50 - p10) / p50) * 100;
                costP10DiffEl.textContent = `-$${Math.round(diff).toLocaleString()} (-${pct.toFixed(1)}%)`;
            }

            const costP50El = document.getElementById("costP50Amount");
            const costP50RateEl = document.getElementById("costP50Rate");
            if (costP50El) costP50El.textContent = `$${Math.round(totalP50).toLocaleString()}`;
            if (costP50RateEl) costP50RateEl.textContent = `@ $${p50.toFixed(2)} / MT`;

            const costP90El = document.getElementById("costP90Amount");
            const costP90RateEl = document.getElementById("costP90Rate");
            const costP90DiffEl = document.getElementById("costP90Diff");
            if (costP90El) costP90El.textContent = `$${Math.round(totalP90).toLocaleString()}`;
            if (costP90RateEl) costP90RateEl.textContent = `@ $${p90.toFixed(2)} / MT`;
            if (costP90DiffEl) {
                const diff = totalP90 - totalP50;
                const pct = ((p90 - p50) / p50) * 100;
                costP90DiffEl.textContent = `+$${Math.round(diff).toLocaleString()} (+${pct.toFixed(1)}%)`;
            }

            // Hedging Badge Text
            const hedgingTitle = document.getElementById("costHedgingTitle");
            const hedgingText = document.getElementById("costHedgingText");
            const isCoA = (recData.contract_type || contractPref) === "CoA";
            if (hedgingTitle && hedgingText) {
                if (isCoA) {
                    hedgingTitle.textContent = "CoA Strategy Value";
                    const estSavings = Math.round(quantity * 2.20);
                    hedgingText.textContent = `CoA Volume Rate hedges ~$${estSavings.toLocaleString()} USD vs. spot peak`;
                } else {
                    hedgingTitle.textContent = "Spot Strategy Profile";
                    hedgingText.textContent = "Single voyage fixture; fully captures any short-term freight rate declines";
                }
            }

            // Also synchronize live cost preview on the left form card
            updateLiveCostPreview();
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
        await renderRankedVessels();
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
        await renderRankedVessels();
    } finally {
        if (btnGen) {
            btnGen.innerHTML = `Generate Recommendation`;
            btnGen.disabled = false;
        }
    }
}

// =====================================================
// DYNAMIC RANKED VESSEL RECOMMENDATIONS (CARGO WIZARD LINKED)
// =====================================================
async function renderRankedVessels(customParcel = null) {
    // 1. Extract values from Cargo Wizard inputs or customParcel
    const qtyElem = document.getElementById("cargoQty");
    const destElem = document.getElementById("cargoDestination");
    const originElem = document.getElementById("cargoOrigin");
    const commElem = document.getElementById("cargoCommodity");

    const quantity = customParcel?.quantity || (qtyElem ? parseFloat(qtyElem.value) || 75000 : 75000);
    const destPortId = customParcel?.destPortId || (destElem ? parseInt(destElem.value, 10) || 1 : 1);
    const originFull = customParcel?.origin || (originElem ? originElem.value : "Australia (Hay Point / Gladstone)");
    const originClean = originFull.split("(")[0].trim();
    const commodity = customParcel?.commodity || (commElem ? commElem.value : "Coking Coal (Prime Hard)");

    // Retrieve destination port profile
    let destPort = portsCache && portsCache.length > 0 ? portsCache.find(p => p.id === destPortId) : null;
    if (!destPort) {
        destPort = { id: 1, name: "Paradip", max_draft: 17.0, max_loa: 300, max_beam: 45, lightering_available: false };
    }

    // 2. Update Active Parcel Header Pill & Table Header
    const pillText = document.getElementById("vesselActiveParcelText");
    if (pillText) {
        pillText.innerHTML = `Active Parcel: <strong>${quantity.toLocaleString()} MT ${commodity}</strong> | ${originClean} &rarr; ${destPort.name}`;
    }
    const tableHeader = document.getElementById("tablePortUkcHeader");
    if (tableHeader) {
        tableHeader.textContent = `${destPort.name} UKC Margin`;
    }

    // 3. Define 4 Dry Bulk Vessel Classes with Engineering Dimensions
    const vesselSpecs = [
        {
            name: "Handysize",
            dwtRange: "25,000 – 40,000",
            typicalDwt: 35000,
            minDwt: 25000,
            maxDwt: 40000,
            typicalDraft: 10.2,
            typicalLoa: 180,
            typicalBeam: 28.4,
            vesselSample: "MV Bright Trader",
            operator: "Trans-Ocean Maritime • IMO 9518290",
            features: "4x25T on-board cranes, high maneuverability in shallow draft harbors",
            rateMultiplier: 1.18,
            baseRate: 30.40
        },
        {
            name: "Supramax",
            dwtRange: "50,000 – 65,000",
            typicalDwt: 62000,
            minDwt: 50000,
            maxDwt: 65000,
            typicalDraft: 12.2,
            typicalLoa: 199,
            typicalBeam: 32.2,
            vesselSample: "MV Pacific Star",
            operator: "Global Bulk Lines • IMO 9621140",
            features: "4x30T cranes with grabs provide self-discharging capability at non-geared berths",
            rateMultiplier: 1.06,
            baseRate: 27.40
        },
        {
            name: "Panamax",
            dwtRange: "65,000 – 88,000",
            typicalDwt: 82000,
            minDwt: 65000,
            maxDwt: 88000,
            typicalDraft: 13.8,
            typicalLoa: 229,
            typicalBeam: 32.3,
            vesselSample: "MV Ocean Titan",
            operator: "Pacific Maritime Corp • IMO 9784321",
            features: "Gearless workhorse bulker optimized for deep-water terminals and high handling rates",
            rateMultiplier: 1.00,
            baseRate: 25.96
        },
        {
            name: "Capesize",
            dwtRange: "120,000 – 200,000",
            typicalDwt: 165000,
            minDwt: 120000,
            maxDwt: 200000,
            typicalDraft: 17.8,
            typicalLoa: 295,
            typicalBeam: 45.0,
            vesselSample: "MV Cape Pioneer",
            operator: "Eastern Bulk Carriers • IMO 9512389",
            features: "Heavy gearless ore/coal carrier requiring deep-water approach (18m+) or offshore lightering",
            rateMultiplier: 0.83,
            baseRate: 21.50
        }
    ];

    // 4. Query deterministic compatibility from backend
    let backendFeasible = null;
    let backendExcluded = null;
    try {
        const compRes = await fetch(`${API_BASE}/compatibility`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cargo_quantity: quantity, destination_port_id: destPort.id })
        });
        if (compRes.ok) {
            const compData = await compRes.json();
            backendFeasible = (compData.feasible_vessels || []).map(v => v.vessel_class.toLowerCase());
            backendExcluded = compData.excluded_vessels || [];
        }
    } catch (e) {
        console.warn("Using offline compatibility evaluation", e);
    }

    // 5. Evaluate each class against the active parcel and destination port
    const evaluated = vesselSpecs.map(vc => {
        const ukc = destPort.max_draft - vc.typicalDraft;
        const draftExcess = vc.typicalDraft - destPort.max_draft;
        const loaBreach = vc.typicalLoa > destPort.max_loa;
        const beamBreach = vc.typicalBeam > destPort.max_beam;
        const overMaxDwt = quantity > vc.maxDwt;
        const underMinDwt = quantity < (vc.minDwt * 0.65);
        const slightDeadfreight = quantity < vc.minDwt && !underMinDwt;
        const perfectParcelFit = quantity >= vc.minDwt && quantity <= vc.maxDwt;

        let isPhysicallyFeasible = true;
        let breachReasons = [];
        let statusTag = "safe";
        let statusText = "";
        let score = 90;

        // Check backend excluded list if available
        if (backendExcluded && backendExcluded.length > 0) {
            const exObj = backendExcluded.find(e => e.vessel_class.toLowerCase() === vc.name.toLowerCase());
            if (exObj) {
                isPhysicallyFeasible = false;
                breachReasons.push(exObj.reason);
            }
        }

        // Local physical checks (ensures instant responsiveness even offline)
        if (draftExcess > 0) {
            if (destPort.lightering_available && draftExcess <= 3.0) {
                breachReasons.push(`Draft (${vc.typicalDraft}m) exceeds harbor depth (${destPort.max_draft}m); requires offshore lightering`);
                statusTag = "suboptimal";
                score -= 22;
            } else {
                isPhysicallyFeasible = false;
                breachReasons.push(`Laden draft (${vc.typicalDraft}m) strictly exceeds ${destPort.name} maximum draft (${destPort.max_draft}m) by +${draftExcess.toFixed(1)}m`);
            }
        }

        if (loaBreach) {
            isPhysicallyFeasible = false;
            breachReasons.push(`Length overall LOA (${vc.typicalLoa}m) exceeds ${destPort.name} berth limit (${destPort.max_loa}m)`);
        }

        if (beamBreach) {
            isPhysicallyFeasible = false;
            breachReasons.push(`Beam (${vc.typicalBeam}m) exceeds ${destPort.name} channel envelope (${destPort.max_beam}m)`);
        }

        if (overMaxDwt) {
            isPhysicallyFeasible = false;
            breachReasons.push(`Cargo parcel (${quantity.toLocaleString()}t) exceeds maximum deadweight capacity (${vc.maxDwt.toLocaleString()}t DWT)`);
        } else if (underMinDwt) {
            isPhysicallyFeasible = false;
            breachReasons.push(`Cargo parcel (${quantity.toLocaleString()}t) under-utilizes vessel capacity (minimum recommended: ${(vc.minDwt * 0.65).toLocaleString()}t)`);
        } else if (slightDeadfreight) {
            breachReasons.push(`Parcel size is slightly below nominal capacity; incur partial deadfreight penalty`);
            if (statusTag === "safe") statusTag = "suboptimal";
            score -= 10;
        }

        // Status & Score Consolidation
        if (!isPhysicallyFeasible) {
            statusTag = "disqualified";
            score = Math.max(22, 45 - (breachReasons.length * 8));
            statusText = `Physically Infeasible at ${destPort.name} • Constraint Exceeded`;
        } else if (statusTag === "suboptimal") {
            statusText = `Feasible with Operational / Lightering Constraints`;
        } else {
            statusText = `100% Physically Feasible • ${destPort.name} Channel Compliant`;
            score = perfectParcelFit ? 94 : 87;
        }

        // Freight rate calculation
        const benchmarkP50 = currentEstimatedRate || 25.96;
        const effectiveRate = parseFloat((benchmarkP50 * (vc.baseRate / 25.96)).toFixed(2));
        const totalOutlay = quantity * effectiveRate;

        // Dynamic bullet points
        const reasonsList = [];
        if (isPhysicallyFeasible) {
            if (perfectParcelFit) {
                reasonsList.push(`Exact parcel deadweight match for ${quantity.toLocaleString()} MT ${commodity}`);
            } else if (slightDeadfreight) {
                reasonsList.push(`Can lift ${quantity.toLocaleString()} MT with minor hold deadfreight`);
            }
            if (ukc >= 1.5) {
                reasonsList.push(`${vc.typicalDraft}m draft safely clears ${destPort.name} channel with +${ukc.toFixed(1)}m under-keel clearance`);
            } else if (ukc >= 0) {
                reasonsList.push(`Narrow under-keel clearance (+${ukc.toFixed(1)}m); requires tidal window berthing`);
            }
            reasonsList.push(vc.features);
        } else {
            breachReasons.forEach(r => reasonsList.push(r));
            if (underMinDwt) {
                reasonsList.push(`${quantity.toLocaleString()} MT utilizes only ${Math.round((quantity / vc.typicalDwt) * 100)}% of vessel deadweight (severe deadfreight penalty)`);
            }
        }

        return {
            ...vc,
            isFeasible: isPhysicallyFeasible,
            ukc: ukc,
            statusTag: statusTag,
            statusText: statusText,
            score: score,
            effectiveRate: effectiveRate,
            totalOutlay: totalOutlay,
            reasonsList: reasonsList
        };
    });

    // 6. Sort: Feasible candidates first, then descending by score
    evaluated.sort((a, b) => {
        if (a.isFeasible && !b.isFeasible) return -1;
        if (!a.isFeasible && b.isFeasible) return 1;
        return b.score - a.score;
    });

    // 7. Render Top 3 Cards in #rankedCardsGrid
    const gridEl = document.getElementById("rankedCardsGrid");
    if (gridEl) {
        gridEl.innerHTML = "";
        const top3 = evaluated.slice(0, 3);
        top3.forEach((cand, idx) => {
            const rankNum = idx + 1;
            const rankClass = `rank-${rankNum}`;
            let badgeTitle = "";
            let badgeClass = "";
            let iconClass = "fa-award";

            if (rankNum === 1 && cand.isFeasible) {
                badgeTitle = "RANK #1 • AI OPTIMAL FIXTURE";
                badgeClass = "rank-1-badge";
                iconClass = "fa-award";
            } else if (rankNum === 2 && cand.isFeasible) {
                badgeTitle = "RANK #2 • FEASIBLE BACKUP / ALTERNATIVE";
                badgeClass = "rank-2-badge";
                iconClass = "fa-shield-halved";
            } else if (!cand.isFeasible) {
                badgeTitle = `RANK #${rankNum} • RESTRICTED / INFEASIBLE`;
                badgeClass = "rank-3-badge";
                iconClass = "fa-ban";
            } else {
                badgeTitle = `RANK #${rankNum} • CONDITIONAL FIXTURE`;
                badgeClass = "rank-2-badge";
                iconClass = "fa-triangle-exclamation";
            }

            const card = document.createElement("div");
            card.className = `ranked-vessel-card ${rankClass} ${!cand.isFeasible ? "disqualified" : ""}`;

            const ukcDisplay = cand.ukc >= 1.5 
                ? `${cand.typicalDraft} m <span class="text-teal">(UKC +${cand.ukc.toFixed(1)}m Safe)</span>`
                : (cand.ukc >= 0 
                    ? `${cand.typicalDraft} m <span class="text-amber">(UKC +${cand.ukc.toFixed(1)}m Marginal)</span>`
                    : `${cand.typicalDraft} m <span class="text-rose">(Exceeds by +${Math.abs(cand.ukc).toFixed(1)}m)</span>`);

            const reasonsHtml = cand.reasonsList.map(r => {
                const icon = cand.isFeasible ? "fa-check text-green" : "fa-xmark text-rose";
                return `<div><i class="fa-solid ${icon}"></i> ${r}</div>`;
            }).join("");

            const actionBtnHtml = cand.isFeasible
                ? (rankNum === 1 
                    ? `<button type="button" class="btn-fixture primary" onclick="approveAndSendToChartering(1)"><i class="fa-solid fa-paper-plane"></i> Approve &amp; Send to Chartering</button><button type="button" class="btn-fixture secondary" onclick="showPage('ports')"><i class="fa-solid fa-anchor"></i> Verify Port Berth</button>`
                    : `<button type="button" class="btn-fixture secondary" onclick="showPage('cargo')"><i class="fa-solid fa-sliders"></i> Select as Alternative</button><button type="button" class="btn-fixture secondary" onclick="showPage('ports')"><i class="fa-solid fa-anchor"></i> View Draft</button>`)
                : `<button type="button" class="btn-fixture disabled" disabled><i class="fa-solid fa-lock"></i> Excluded by Feasibility Engine</button>`;

            card.innerHTML = `
                <div class="card-rank-badge ${badgeClass}">
                    <i class="fa-solid ${iconClass}"></i>
                    <span>${badgeTitle}</span>
                </div>
                <div class="ranked-card-top">
                    <div class="ranked-ship-avatar">
                        <i class="fa-solid fa-ship"></i>
                    </div>
                    <div class="ranked-title-block">
                        <h3>${cand.name} • ${cand.vesselSample}</h3>
                        <span class="vessel-operator">${cand.operator}</span>
                    </div>
                    <div class="ranked-score-badge ${!cand.isFeasible ? 'disqual' : ''}">
                        <span class="score-val">${cand.score}</span>
                        <span class="score-lbl">/ 100</span>
                    </div>
                </div>
                <div class="ranked-feasibility-tag ${cand.statusTag}">
                    <i class="fa-solid ${cand.isFeasible ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
                    <span>${cand.statusText}</span>
                </div>
                <div class="ranked-specs-grid">
                    <div class="ranked-spec">
                        <small>Deadweight (DWT)</small>
                        <strong>${cand.typicalDwt.toLocaleString()} DWT</strong>
                    </div>
                    <div class="ranked-spec">
                        <small>Arrival Draft</small>
                        <strong>${ukcDisplay}</strong>
                    </div>
                    <div class="ranked-spec">
                        <small>Forecast Freight</small>
                        <strong class="${cand.isFeasible ? (rankNum === 1 ? 'text-cyan' : 'text-amber') : ''}">$${cand.effectiveRate.toFixed(2)} / MT</strong>
                    </div>
                    <div class="ranked-spec">
                        <small>Total Outlay (${(quantity/1000).toFixed(0)}kt)</small>
                        <strong class="${cand.isFeasible ? (rankNum === 1 ? 'text-cyan' : 'text-amber') : 'text-rose'}">$${Math.round(cand.totalOutlay).toLocaleString()} USD</strong>
                    </div>
                </div>
                <div class="ranked-reasons-list">
                    ${reasonsHtml}
                </div>
                <div class="ranked-action-row">
                    ${actionBtnHtml}
                </div>
            `;
            gridEl.appendChild(card);
        });
    }

    // 8. Render Dynamic Comparison Table in #rankedTableBody
    const tbodyEl = document.getElementById("rankedTableBody");
    if (tbodyEl) {
        tbodyEl.innerHTML = "";
        evaluated.forEach((cand, idx) => {
            const tr = document.createElement("tr");
            if (idx === 0 && cand.isFeasible) tr.className = "highlight-row";
            else if (!cand.isFeasible) tr.className = "disqual-row";

            const ukcBadge = cand.ukc >= 1.5 
                ? `<span class="ukc-safe">+${cand.ukc.toFixed(1)} m (Safe)</span>`
                : (cand.ukc >= 0 
                    ? `<span class="text-amber">+${cand.ukc.toFixed(1)} m (Tidal)</span>`
                    : `<span class="ukc-prohibited">${cand.ukc.toFixed(1)} m (Draft Exceeded)</span>`);

            const feasBadge = cand.isFeasible 
                ? (cand.statusTag === "safe" 
                    ? `<span class="text-green">Direct Berthing</span>` 
                    : `<span class="text-amber">Tidal/Lightering</span>`)
                : `<span class="text-rose">Prohibited</span>`;

            const rankPill = cand.isFeasible 
                ? (idx === 0 
                    ? `<span class="badge-tag green">Rank #1 (${cand.score} pts)</span>` 
                    : `<span class="badge-tag blue">Rank #${idx + 1} (${cand.score} pts)</span>`)
                : `<span class="badge-tag red">Excluded (${cand.score} pts)</span>`;

            tr.innerHTML = `
                <td><strong class="${idx === 0 && cand.isFeasible ? 'text-cyan' : ''}">${idx === 0 && cand.isFeasible ? '<i class="fa-solid fa-award text-amber"></i> ' : ''}${cand.name}</strong></td>
                <td>${cand.dwtRange}</td>
                <td>${cand.typicalDraft.toFixed(1)} m</td>
                <td>${ukcBadge}</td>
                <td>${feasBadge}</td>
                <td><strong>$${cand.effectiveRate.toFixed(2)}</strong></td>
                <td><strong class="${idx === 0 && cand.isFeasible ? 'text-cyan' : ''}">$${Math.round(cand.totalOutlay).toLocaleString()}</strong></td>
                <td>${rankPill}</td>
            `;
            tbodyEl.appendChild(tr);
        });
    }
}
window.renderRankedVessels = renderRankedVessels;

/* =====================================================
   SPOT VS COA SIMULATOR (LOGISTICS MANAGER SUITE)
===================================================== */

async function runCoASimulation() {
    const qtyElem = document.getElementById("coaQty");
    const spotElem = document.getElementById("spotRate");
    const coaElem = document.getElementById("coaRate");
    const volElem = document.getElementById("volatility");
    const voyagesElem = document.getElementById("coaVoyagesCount");

    const volume = qtyElem ? parseFloat(qtyElem.value) || 500000 : 500000;
    const spotRateVal = spotElem ? parseFloat(spotElem.value) || 25.96 : 25.96;
    const coaRateVal = coaElem ? parseFloat(coaElem.value) || 23.80 : 23.80;
    const voyages = voyagesElem ? parseInt(voyagesElem.value) || 8 : 8;

    const spotTotalElem = document.getElementById("spotTotal");
    const coaTotalElem = document.getElementById("coaTotal");
    const decisionElem = document.getElementById("coaDecision");
    const decisionText = document.getElementById("coaDecisionText");
    const advElem = document.getElementById("coaAdvantage");
    const advBarText = document.getElementById("coaAdvantageBarText");
    const progElem = document.getElementById("coaProgress");
    const netSavingsElem = document.getElementById("coaNetSavings");
    const spotRiskNote = document.getElementById("spotRiskNote");

    try {
        const coaPayload = {
            cargo_id: currentCargoId || 1,
            cargo_volume: volume,
            vessel_class: (currentVesselClass && ["Supramax", "Panamax", "Capesize", "Handysize"].includes(currentVesselClass) && currentVesselClass !== "Capesize") ? currentVesselClass : "Panamax",
            horizon_months: 6
        };

        const res = await fetch(`${API_BASE}/coa`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(coaPayload)
        }).catch(() => null);

        let spotCost = volume * spotRateVal;
        let coaCost = volume * coaRateVal;
        let pref = coaCost < spotCost ? "CoA" : "Spot";
        let reason = "";

        if (res && res.ok) {
            const data = await res.json();
            if (data.expected_spot_cost) spotCost = data.expected_spot_cost;
            if (data.expected_coa_cost) coaCost = data.expected_coa_cost;
            if (data.preferred_option) pref = data.preferred_option;
            if (data.reason) reason = data.reason;
        }

        const diff = Math.abs(spotCost - coaCost);
        const advPct = ((diff / Math.max(spotCost, coaCost)) * 100).toFixed(1);

        if (spotTotalElem) spotTotalElem.textContent = `$${(spotCost / 1e6).toFixed(2)}M`;
        if (coaTotalElem) coaTotalElem.textContent = `$${(coaCost / 1e6).toFixed(2)}M`;

        if (netSavingsElem) {
            netSavingsElem.textContent = `$${Math.round(diff).toLocaleString()} USD`;
        }
        if (advElem) advElem.textContent = `${advPct}%`;
        if (advBarText) advBarText.textContent = `${advPct}% Advantage`;
        if (progElem) progElem.style.width = `${Math.min(100, Math.max(15, parseFloat(advPct) * 8))}%`;

        if (spotRiskNote) {
            const p10Spread = (spotCost * 0.91 / 1e6).toFixed(1);
            const p90Spread = (spotCost * 1.21 / 1e6).toFixed(1);
            spotRiskNote.textContent = `Unhedged volatility exposure ($${p10Spread}M – $${p90Spread}M P90)`;
        }

        if (decisionText) {
            if (pref === "CoA") {
                decisionText.textContent = `Secures ~$${Math.round(diff).toLocaleString()} USD net freight savings across ${volume.toLocaleString()} MT (${voyages} fixtures) while insulating against spot freight peaks.`;
            } else {
                decisionText.textContent = `Spot market preferred for short parcels to capture immediate softer rate trajectory.`;
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

/* =====================================================
   USER PROFILE & ROLE-BASED SESSION MANAGEMENT
===================================================== */

const DEFAULT_ROLE_USER = {
    id: 101,
    name: "Ashutosh Sharma",
    email: "logistics@steel.gov.in",
    company: "Ministry of Steel / Bulk Procurement",
    role: "Logistics Manager"
};

function initUserProfile() {
    try {
        let userStr = localStorage.getItem("freightiq_user");
        let user;
        if (userStr) {
            try {
                user = JSON.parse(userStr);
            } catch (e) {
                user = DEFAULT_ROLE_USER;
            }
        } else {
            user = DEFAULT_ROLE_USER;
            localStorage.setItem("freightiq_user", JSON.stringify(user));
        }

        const role = user.role || "Logistics Manager";
        const name = user.name || "Ashutosh Sharma";

        // Update Sidebar User Card
        const nameEl = document.getElementById("userName") || document.querySelector(".user strong");
        const roleEl = document.getElementById("userRoleTitle") || document.querySelector(".user small");
        const avatarEl = document.getElementById("userAvatar") || document.querySelector(".user-avatar");
        const topRoleEl = document.getElementById("topActiveRoleText");
        const ccRoleEl = document.getElementById("ccRoleTitle");
        const navTitleEl = document.getElementById("roleNavTitle");

        if (nameEl) nameEl.textContent = name;
        if (roleEl) roleEl.textContent = role;
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
        if (topRoleEl) topRoleEl.textContent = role;
        if (ccRoleEl) ccRoleEl.textContent = role;
        if (navTitleEl) navTitleEl.textContent = `${role.toUpperCase()} SUITE`;

        // Toggle Sidebar Navigation Groups according to active role
        const navLogistics = document.getElementById("navGroupLogistics");
        const navChartering = document.getElementById("navGroupChartering");
        const navAnalyst = document.getElementById("navGroupAnalyst");

        if (navLogistics) navLogistics.style.display = (role === "Logistics Manager") ? "block" : "none";
        if (navChartering) navChartering.style.display = (role === "Chartering Officer") ? "block" : "none";
        if (navAnalyst) navAnalyst.style.display = (role === "Market Analyst") ? "block" : "none";

        // Update Modal selection highlight
        const optLogistics = document.getElementById("roleOptLogistics");
        const optChartering = document.getElementById("roleOptChartering");
        const optAnalyst = document.getElementById("roleOptAnalyst");

        if (optLogistics) optLogistics.classList.toggle("active", role === "Logistics Manager");
        if (optChartering) optChartering.classList.toggle("active", role === "Chartering Officer");
        if (optAnalyst) optAnalyst.classList.toggle("active", role === "Market Analyst");

        // Auth link
        const authLink = document.getElementById("authLink");
        const authLinkText = document.getElementById("authLinkText");
        if (authLink) {
            authLink.title = "Sign Out / Switch Persona";
            if (authLinkText) authLinkText.textContent = "Sign Out";
            authLink.onclick = (e) => {
                e.preventDefault();
                if (confirm("Sign out of current FreightIQ session?")) {
                    localStorage.removeItem("freightiq_user");
                    window.location.href = "login.html";
                }
            };
        }
    } catch (e) {
        console.warn("User profile init error:", e);
    }
}

function switchUserRole(newRole) {
    const roleProfiles = {
        "Logistics Manager": {
            id: 101,
            name: "Ashutosh Sharma",
            email: "logistics@steel.gov.in",
            company: "Ministry of Steel / Bulk Procurement",
            role: "Logistics Manager"
        },
        "Chartering Officer": {
            id: 102,
            name: "Capt. Rajesh Nair",
            email: "chartering@steel.gov.in",
            company: "National Bulk Carriers Corp",
            role: "Chartering Officer"
        },
        "Market Analyst": {
            id: 103,
            name: "Dr. Priya Sen",
            email: "analyst@steel.gov.in",
            company: "Maritime Economic Analytics Cell",
            role: "Market Analyst"
        }
    };

    const profile = roleProfiles[newRole] || {
        name: "Ashutosh Sharma",
        email: "logistics@steel.gov.in",
        company: "Maritime Logistics",
        role: newRole
    };

    localStorage.setItem("freightiq_user", JSON.stringify(profile));
    initUserProfile();
    closeRoleModal();

    // Navigate to role's primary tool
    if (newRole === "Logistics Manager") {
        showPage("dashboard");
    } else if (newRole === "Chartering Officer") {
        showPage("charteringOps");
    } else if (newRole === "Market Analyst") {
        showPage("analystOverview");
    }
}
window.openRoleModal = openRoleModal;
window.closeRoleModal = closeRoleModal;
window.switchUserRole = switchUserRole;

/* =====================================================
   SHAP DRIVER ATTRIBUTION FILTER
===================================================== */

function filterShapDrivers(type, btn) {
    document.querySelectorAll(".shap-tab").forEach(t => t.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const items = document.querySelectorAll(".shap-item");
    items.forEach(item => {
        const itemType = item.getAttribute("data-type");
        if (type === "all" || itemType === type) {
            item.style.display = "flex";
        } else {
            item.style.display = "none";
        }
    });
}
window.filterShapDrivers = filterShapDrivers;

/* =====================================================
   UNDER-KEEL CLEARANCE (UKC) CALCULATOR
===================================================== */

function calculateUKC() {
    const portDraftElem = document.getElementById("ukcPortSelect");
    const vesselDraftElem = document.getElementById("ukcVesselDraft");
    const tideElem = document.getElementById("ukcTide");

    if (!portDraftElem || !vesselDraftElem) return;

    const portDraft = parseFloat(portDraftElem.value) || 17.0;
    const vesselDraft = parseFloat(vesselDraftElem.value) || 13.8;
    const tide = tideElem ? (parseFloat(tideElem.value) || 0) : 1.0;

    const effectiveDraft = portDraft + tide;
    const ukcMargin = effectiveDraft - vesselDraft;

    const valEl = document.getElementById("ukcMarginValue");
    const badgeEl = document.getElementById("ukcStatusBadge");
    const descEl = document.getElementById("ukcExplanation");
    const barEl = document.getElementById("ukcBarFill");

    if (valEl) {
        valEl.innerHTML = `${ukcMargin >= 0 ? "+" : ""}${ukcMargin.toFixed(1)} <small>meters</small>`;
        valEl.className = ukcMargin >= 1.5 ? "ukc-metric-value text-teal" : (ukcMargin >= 0 ? "ukc-metric-value text-amber" : "ukc-metric-value text-rose");
    }

    if (badgeEl && descEl && barEl) {
        if (ukcMargin >= 1.5) {
            badgeEl.className = "ukc-status-badge safe";
            badgeEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> SAFE BERTHING`;
            descEl.textContent = `Vessel arrival draft (${vesselDraft.toFixed(1)}m) safely clears effective channel envelope (${effectiveDraft.toFixed(1)}m). Net UKC margin of +${ukcMargin.toFixed(1)}m exceeds Ministry required 1.5m safety standard.`;
            barEl.className = "ukc-bar-fill safe";
            barEl.style.width = `${Math.min(100, Math.max(20, (ukcMargin / 5) * 100))}%`;
        } else if (ukcMargin >= 0) {
            badgeEl.className = "ukc-status-badge marginal";
            badgeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> MARGINAL (TIDAL WINDOW)`;
            descEl.textContent = `Caution: Clearance margin is narrow (+${ukcMargin.toFixed(1)}m). Vessel requires high-water tidal window clearance and harbor tug escort.`;
            barEl.className = "ukc-bar-fill marginal";
            barEl.style.width = "40%";
        } else {
            badgeEl.className = "ukc-status-badge prohibited";
            badgeEl.innerHTML = `<i class="fa-solid fa-ban"></i> PROHIBITED (DRAFT EXCEEDED)`;
            descEl.textContent = `Vessel arrival draft (${vesselDraft.toFixed(1)}m) exceeds effective port envelope (${effectiveDraft.toFixed(1)}m) by ${Math.abs(ukcMargin).toFixed(1)}m. Direct calling prohibited; offshore lightering required at Sagar Sandheads anchorage.`;
            barEl.className = "ukc-bar-fill prohibited";
            barEl.style.width = "100%";
        }
    }
}
window.calculateUKC = calculateUKC;


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
        const commSelect = document.getElementById("cargoCommodity");
        const originSelect = document.getElementById("cargoOrigin");
        const destSelect = document.getElementById("cargoDestination");
        const qtyInput = document.getElementById("cargoQty");

        if (commSelect) commSelect.value = "Thermal Coal (Indonesian 4200 GAR)";
        if (originSelect) originSelect.value = "Indonesia (Taboneo / Samarinda)";
        if (qtyInput) qtyInput.value = "55000";

        if (destSelect && portsCache.length > 0) {
            const vizag = portsCache.find(p => p.name.toLowerCase().includes("visakhapatnam") || p.name.toLowerCase().includes("vizag"));
            if (vizag) destSelect.value = vizag.id;
        }

        showPage("coa");
        const qtyElem = document.getElementById("coaQty");
        const spotElem = document.getElementById("spotRate");
        const coaElem = document.getElementById("coaRate");

        if (qtyElem) qtyElem.value = "500000";
        if (spotElem) spotElem.value = "24.5";
        if (coaElem) coaElem.value = "22.8";

        await runCoASimulation();
        await renderRankedVessels();
    }
}

/* =====================================================
   EVENT LISTENERS & STARTUP
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    showPage("dashboard");
    initUserProfile();
    initAppData();
    updateLiveCostPreview();
    calculateUKC();
    runCoASimulation();

    // Dynamically re-evaluate Ranked Vessel Recommendations whenever cargo wizard inputs change
    const wizardInputs = ["cargoQty", "cargoDestination", "cargoOrigin", "cargoCommodity"];
    wizardInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", () => renderRankedVessels());
            if (id === "cargoQty") {
                el.addEventListener("input", () => renderRankedVessels());
            }
        }
    });

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

/* =====================================================
   THREE-ROLE MARITIME DECISION SUPPORT SUITE FUNCTIONS
===================================================== */

/* -----------------------------------------------------
   1. LOGISTICS MANAGER: PROCUREMENT COMMAND & AUDIT
----------------------------------------------------- */

async function loadLogisticsKPIs() {
    try {
        const res = await authFetch(`${API_BASE}/procurement/kpis`);
        if (!res.ok) return;
        const data = await res.json();

        const activeStems = document.getElementById("kpiActivePlans");
        const pendingAppr = document.getElementById("kpiPendingApprovals");
        const totalVol = document.getElementById("kpiTotalVolume");
        const avgRate = document.getElementById("kpiAvgFreightRate");
        const savings = document.getElementById("kpiPotentialSavings");
        const coaShare = document.getElementById("kpiCoAShare");

        if (activeStems) activeStems.textContent = data.active_cargo_stems ?? 14;
        if (pendingAppr) pendingAppr.textContent = data.pending_approvals ?? 3;
        if (totalVol) totalVol.textContent = (data.total_volume_mt ?? 890000).toLocaleString() + " MT";
        if (avgRate) avgRate.textContent = "$" + (data.avg_freight_rate ?? 21.8).toFixed(2);
        if (savings) savings.textContent = "$" + Math.round((data.potential_savings_usd ?? 142000) / 1000) + "k";
        if (coaShare) coaShare.textContent = data.spot_vs_coa_share ?? "65% CoA / 35% Spot";
    } catch (e) {
        console.warn("Error loading logistics KPIs:", e);
    }
}
window.loadLogisticsKPIs = loadLogisticsKPIs;

async function loadDecisionsTable() {
    const tbody = document.getElementById("decisionsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Querying live PostgreSQL stems...</td></tr>`;

    try {
        const res = await authFetch(`${API_BASE}/cargo/all`);
        if (!res.ok) throw new Error("Failed to fetch cargo stems");
        const list = await res.json();

        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--muted);">No cargo stems currently found. Create a stem in Cargo Wizard.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        list.forEach(c => {
            const tr = document.createElement("tr");

            let statusBadge = `<span class="badge-status badge-status-amber"><i class="fa-solid fa-clock"></i> PENDING</span>`;
            if (c.status === "RECOMMENDED") {
                statusBadge = `<span class="badge-status badge-status-cyan"><i class="fa-solid fa-brain"></i> RECOMMENDED</span>`;
            } else if (c.status === "APPROVED" || c.status === "SENT_TO_CHARTERING") {
                statusBadge = `<span class="badge-status badge-status-teal"><i class="fa-solid fa-paper-plane"></i> SENT TO CHARTERING</span>`;
            } else if (c.status === "FIXED") {
                statusBadge = `<span class="badge-status badge-status-green"><i class="fa-solid fa-anchor"></i> FIXED</span>`;
            } else if (c.status === "COMPLETED") {
                statusBadge = `<span class="badge-status badge-status-muted"><i class="fa-solid fa-flag-checkered"></i> COMPLETED</span>`;
            }

            const recClass = (c.recommendation && c.recommendation.vessel_class) ? c.recommendation.vessel_class : "Panamax";
            const recRate = (c.recommendation && c.recommendation.predicted_rate) ? `$${c.recommendation.predicted_rate.toFixed(2)}/MT` : "$21.80/MT";
            const recId = (c.recommendation && c.recommendation.id) ? c.recommendation.id : c.id;

            let actionCol = "";
            if (c.status === "PENDING" || c.status === "RECOMMENDED") {
                actionCol = `
                    <button class="btn-action-primary" onclick="approveAndSendToChartering(${recId})">
                        <i class="fa-solid fa-check"></i> Approve &amp; Charter
                    </button>
                    <button class="btn-action-secondary" onclick="rejectRecommendation(${recId})">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                `;
            } else if (c.status === "APPROVED" || c.status === "SENT_TO_CHARTERING") {
                actionCol = `
                    <button class="btn-action-secondary" onclick="switchUserRole('Chartering Officer')">
                        <i class="fa-solid fa-arrow-right"></i> Open in Chartering
                    </button>
                `;
            } else {
                actionCol = `<span style="font-size:11px; color:var(--muted);"><i class="fa-solid fa-lock"></i> Locked</span>`;
            }

            tr.innerHTML = `
                <td><strong>#CGO-${String(c.id).padStart(4, '0')}</strong></td>
                <td>${c.commodity || 'Coking Coal'}</td>
                <td><strong>${(c.quantity || 75000).toLocaleString()}</strong> MT</td>
                <td>${c.origin_port || 'Australia'} &rarr; ${c.destination_port || 'Paradip'}</td>
                <td>${c.laycan_start ? c.laycan_start.slice(0,10) : '2026-11-12'} / ${c.laycan_end ? c.laycan_end.slice(0,10) : '2026-11-23'}</td>
                <td><strong>${recClass}</strong></td>
                <td><strong style="color:#20b8ff;">${recRate}</strong></td>
                <td>${statusBadge}</td>
                <td>${actionCol}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error loading decisions table:", e);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading decision audit trail: ${e.message}</td></tr>`;
    }
}
window.loadDecisionsTable = loadDecisionsTable;

async function approveAndSendToChartering(recId) {
    if (!confirm("Approve AI recommendation and dispatch stem to Chartering Operations?")) return;

    try {
        const res = await authFetch(`${API_BASE}/recommendation/${recId}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "Commercial sign-off granted by Logistics Manager. Dispatched to Chartering for vessel fixing." })
        });

        if (!res.ok) {
            const err = await res.json();
            alert("Approval Failed: " + (err.detail || "Server error"));
            return;
        }

        const data = await res.json();
        alert("SUCCESS: Recommendation #" + recId + " approved! Stem dispatched to Chartering Operations.");
        
        loadLogisticsKPIs();
        loadDecisionsTable();

        if (confirm("Would you like to switch to Chartering Officer suite now to fix a candidate vessel?")) {
            switchUserRole("Chartering Officer");
        }
    } catch (e) {
        console.error("Error approving recommendation:", e);
        alert("Error approving stem: " + e.message);
    }
}
window.approveAndSendToChartering = approveAndSendToChartering;

async function rejectRecommendation(recId) {
    const reason = prompt("Enter reason for rejecting this recommendation:", "Commercial timing deferred to next quarter");
    if (reason === null) return;

    try {
        const res = await authFetch(`${API_BASE}/recommendation/${recId}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: reason })
        });

        if (!res.ok) {
            const err = await res.json();
            alert("Rejection Failed: " + (err.detail || "Server error"));
            return;
        }

        alert("Recommendation rejected and archived.");
        loadDecisionsTable();
        loadLogisticsKPIs();
    } catch (e) {
        console.error("Error rejecting recommendation:", e);
        alert("Error rejecting recommendation: " + e.message);
    }
}
window.rejectRecommendation = rejectRecommendation;

/* -----------------------------------------------------
   2. CHARTERING OFFICER: FLEET, TONNAGE, FIXTURES & VOYAGES
----------------------------------------------------- */

async function loadCharteringOpsSummary() {
    try {
        const [fleetRes, voyagesRes, cargoRes] = await Promise.all([
            authFetch(`${API_BASE}/fleet`),
            authFetch(`${API_BASE}/voyages`),
            authFetch(`${API_BASE}/cargo/approved`)
        ]);

        if (fleetRes.ok) {
            const fleet = await fleetRes.json();
            const coKpiFleet = document.getElementById("coKpiFleet");
            if (coKpiFleet) coKpiFleet.textContent = fleet.length;
        }

        if (voyagesRes.ok) {
            const voyages = await voyagesRes.json();
            const coKpiVoyages = document.getElementById("coKpiVoyages");
            if (coKpiVoyages) coKpiVoyages.textContent = voyages.length;
        }

        if (cargoRes.ok) {
            const approved = await cargoRes.json();
            const coKpiAwaiting = document.getElementById("coKpiAwaiting");
            if (coKpiAwaiting) coKpiAwaiting.textContent = approved.length;
        }
    } catch (e) {
        console.warn("Error loading chartering ops summary:", e);
    }
}
window.loadCharteringOpsSummary = loadCharteringOpsSummary;

async function loadTonnageBoard() {
    const tbody = document.getElementById("tonnageTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Querying 350 bulkers from PostgreSQL...</td></tr>`;

    const searchInput = document.getElementById("tonnageSearch");
    const classFilter = document.getElementById("tonnageClassFilter");
    const statusFilter = document.getElementById("tonnageStatusFilter");

    const query = new URLSearchParams();
    if (searchInput && searchInput.value) query.append("search", searchInput.value);
    if (classFilter && classFilter.value) query.append("vessel_class", classFilter.value);
    if (statusFilter && statusFilter.value) query.append("operational_status", statusFilter.value);

    try {
        const res = await authFetch(`${API_BASE}/tonnage?${query.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch tonnage");
        const vessels = await res.json();

        tbody.innerHTML = "";
        if (!vessels || vessels.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--muted);">No tonnage matches current search criteria.</td></tr>`;
            return;
        }

        vessels.slice(0, 50).forEach(v => {
            const tr = document.createElement("tr");

            let statusBadge = `<span class="badge-status badge-status-green"><i class="fa-solid fa-circle-dot"></i> OPEN BALLAST</span>`;
            if (v.operational_status === "IN_TRANSIT") {
                statusBadge = `<span class="badge-status badge-status-cyan"><i class="fa-solid fa-water"></i> IN TRANSIT</span>`;
            } else if (v.operational_status === "ON_SUBS") {
                statusBadge = `<span class="badge-status badge-status-amber"><i class="fa-solid fa-hourglass-half"></i> ON SUBS</span>`;
            } else if (v.operational_status === "FIXED") {
                statusBadge = `<span class="badge-status badge-status-purple"><i class="fa-solid fa-anchor"></i> FIXED</span>`;
            }

            const relColor = v.reliability_score >= 90 ? "#10b981" : (v.reliability_score >= 80 ? "#38bdf8" : "#f59e0b");

            tr.innerHTML = `
                <td><strong>${v.name}</strong><br><small style="color:var(--muted);">IMO: ${v.imo || '9876543'} &bull; ${v.flag || 'Panama'}</small></td>
                <td><span class="badge-tag blue">${v.vessel_class}</span></td>
                <td><strong>${(v.dwt || 75000).toLocaleString()}</strong> MT</td>
                <td>${(v.draft || 14.2).toFixed(1)} m</td>
                <td>${v.speed_laden || 13.5} kts / ${v.fuel_consumption_laden || 28} MT/d</td>
                <td>${v.current_port || 'Singapore'} &bull; ${v.open_date ? v.open_date.slice(0,10) : 'Prompt'}</td>
                <td><strong style="color:${relColor};">${v.reliability_score || 94}%</strong></td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-action-primary" onclick="nominateVesselForFixture(${v.id}, '${v.name.replace(/'/g, "\'")}', '${v.vessel_class}', ${v.draft}, ${v.dwt})">
                        <i class="fa-solid fa-file-signature"></i> Fix
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error loading tonnage board:", e);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading tonnage board: ${e.message}</td></tr>`;
    }
}
window.loadTonnageBoard = loadTonnageBoard;

function nominateVesselForFixture(vesselId, vesselName, vesselClass, draft, dwt) {
    showPage("fixtureMgmt");
    const vSelect = document.getElementById("fixtureVesselSelect");
    if (vSelect) {
        // Add if missing
        let optFound = false;
        for (let i = 0; i < vSelect.options.length; i++) {
            if (parseInt(vSelect.options[i].value) === vesselId) {
                vSelect.selectedIndex = i;
                optFound = true;
                break;
            }
        }
        if (!optFound) {
            const opt = document.createElement("option");
            opt.value = vesselId;
            opt.textContent = `${vesselName} (${vesselClass} | ${dwt.toLocaleString()} DWT | Draft: ${draft}m)`;
            vSelect.appendChild(opt);
            vSelect.value = vesselId;
        }
    }
}
window.nominateVesselForFixture = nominateVesselForFixture;

async function loadApprovedCargoForChartering() {
    const container = document.getElementById("approvedCargoContainer");
    const cInput = document.getElementById("fixtureCargoId");
    const vSelect = document.getElementById("fixtureVesselSelect");
    const dInput = document.getElementById("fixtureDateInput");

    if (dInput && !dInput.value) {
        dInput.value = new Date().toISOString().slice(0, 10);
    }

    // Populate candidate vessels into fixture dropdown if empty
    if (vSelect && vSelect.options.length <= 1) {
        try {
            const vRes = await authFetch(`${API_BASE}/tonnage?operational_status=OPEN_BALLAST`);
            if (vRes.ok) {
                const openVessels = await vRes.json();
                vSelect.innerHTML = `<option value="">-- Select Open Candidate Vessel --</option>`;
                openVessels.slice(0, 40).forEach(v => {
                    const opt = document.createElement("option");
                    opt.value = v.id;
                    opt.textContent = `${v.name} (${v.vessel_class} | ${(v.dwt).toLocaleString()} DWT | Draft: ${v.draft}m | ${v.current_port})`;
                    vSelect.appendChild(opt);
                });
            }
        } catch (err) {
            console.warn("Error pre-populating fixture vessels:", err);
        }
    }

    try {
        const res = await authFetch(`${API_BASE}/cargo/approved`);
        if (!res.ok) return;
        const cargoes = await res.json();

        if (cInput && cargoes.length > 0 && !cInput.value) {
            cInput.value = cargoes[0].id;
            const rInput = document.getElementById("fixtureRateInput");
            if (rInput && cargoes[0].recommendation) {
                rInput.value = cargoes[0].recommendation.predicted_rate;
            }
        }

        if (container) {
            container.innerHTML = "";
            if (!cargoes || cargoes.length === 0) {
                container.innerHTML = `<div style="grid-column:1/-1; padding:24px; text-align:center; color:var(--muted); background:rgba(255,255,255,0.02); border-radius:8px;">No approved cargo stems awaiting fixture. Stems approved by Logistics Manager appear here automatically.</div>`;
                return;
            }

            cargoes.forEach((c, idx) => {
                const card = document.createElement("div");
                card.className = "stat-card cyan";
                card.style.cursor = "pointer";
                card.onclick = () => {
                    if (cInput) cInput.value = c.id;
                    const rInput = document.getElementById("fixtureRateInput");
                    if (rInput && c.recommendation) rInput.value = c.recommendation.predicted_rate;
                    document.querySelectorAll("#approvedCargoContainer .stat-card").forEach(sc => sc.style.borderColor = "");
                    card.style.borderColor = "#20b8ff";
                };

                if (idx === 0) card.style.borderColor = "#20b8ff";

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <div>
                            <span class="badge-status badge-status-teal"><i class="fa-solid fa-clipboard-check"></i> APPROVED</span>
                            <h3 style="margin-top:6px; font-size:16px;">#CGO-${String(c.id).padStart(4, '0')} &bull; ${c.commodity}</h3>
                        </div>
                        <strong style="color:#20b8ff; font-size:18px;">${(c.quantity).toLocaleString()} MT</strong>
                    </div>
                    <div style="font-size:12px; color:#94a3b8; line-height:1.6;">
                        <div>Route: <strong>${c.origin_port} &rarr; ${c.destination_port}</strong></div>
                        <div>Target Class: <strong>${c.recommendation ? c.recommendation.vessel_class : 'Panamax'}</strong></div>
                        <div>Benchmark Rate: <strong>${c.recommendation ? '$' + c.recommendation.predicted_rate.toFixed(2) : '$21.80'}/MT</strong></div>
                    </div>
                    <button class="btn-action-primary" style="margin-top:14px; width:100%; justify-content:center;">
                        <i class="fa-solid fa-file-signature"></i> Select for Fixture
                    </button>
                `;
                container.appendChild(card);
            });
        }
    } catch (e) {
        console.warn("Error loading approved cargo:", e);
    }
}
window.loadApprovedCargoForChartering = loadApprovedCargoForChartering;

async function submitFixture(event = null) {
    if (event) event.preventDefault();

    const cargoSelect = document.getElementById("fixtureCargoId");
    const vesselSelect = document.getElementById("fixtureVesselSelect");
    const rateInput = document.getElementById("fixtureRateInput");
    const dateInput = document.getElementById("fixtureDateInput");

    const cargoId = parseInt(cargoSelect ? cargoSelect.value : 1);
    const vesselId = parseInt(vesselSelect ? vesselSelect.value : 1);
    const agreedRate = parseFloat(rateInput ? rateInput.value : 21.80);
    const fixtureDate = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().slice(0, 10);

    if (!cargoId || !vesselId || !agreedRate) {
        alert("Please select cargo, candidate vessel, and agreed freight rate.");
        return;
    }

    try {
        const btn = document.getElementById("btnConfirmFixture");
        if (btn) btn.disabled = true;

        const res = await authFetch(`${API_BASE}/fixtures`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cargo_id: cargoId,
                vessel_id: vesselId,
                agreed_rate: agreedRate,
                notes: `Charterparty fixture agreed at $${agreedRate.toFixed(2)}/MT on ${fixtureDate}`
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert("Fixture Failed: " + (err.detail || "Server error"));
            if (btn) btn.disabled = false;
            return;
        }

        const data = await res.json();
        alert("FIXTURE CONFIRMED! Fixture #" + data.fixture.fixture_number + " created. Initialized Voyage #" + data.voyage.voyage_number + " in stage: FIXTURE.");

        if (btn) btn.disabled = false;
        loadConfirmedFixtures();
        loadCharteringOpsSummary();
        loadTonnageBoard();
        loadApprovedCargoForChartering();
        showPage("voyageTimeline");
        loadAllVoyages();
    } catch (e) {
        console.error("Error submitting fixture:", e);
        alert("Error executing fixture: " + e.message);
    }
}
window.submitFixture = submitFixture;

async function loadConfirmedFixtures() {
    const tbody = document.getElementById("confirmedFixturesTableBody");
    if (!tbody) return;

    try {
        const res = await authFetch(`${API_BASE}/fixtures`);
        if (!res.ok) return;
        const fixtures = await res.json();

        tbody.innerHTML = "";
        if (!fixtures || fixtures.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">No confirmed fixtures yet. Select an approved stem above to execute fixture.</td></tr>`;
            return;
        }

        fixtures.forEach(f => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${f.fixture_number}</strong></td>
                <td><strong>${f.vessel_name}</strong><br><small style="color:var(--muted);">${f.vessel_class}</small></td>
                <td>${f.commodity || 'Coking Coal'} (${(f.quantity || 75000).toLocaleString()} MT)</td>
                <td>${f.route || 'Australia -> Paradip'}</td>
                <td><strong style="color:#20b8ff;">$${(f.agreed_rate || 21.8).toFixed(2)}/MT</strong></td>
                <td>${f.fixture_date ? f.fixture_date.slice(0,10) : '2026-09-09'}</td>
                <td><span class="badge-status badge-status-green"><i class="fa-solid fa-check"></i> ${f.status || 'CONFIRMED'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn("Error loading fixtures:", e);
    }
}
window.loadConfirmedFixtures = loadConfirmedFixtures;

/* -----------------------------------------------------
   3. 9-STAGE VOYAGE TIMELINE PROGRESSION
----------------------------------------------------- */

let currentVoyagesCache = [];

async function loadAllVoyages() {
    const vSelect = document.getElementById("voyageSelect");
    const tbody = document.getElementById("voyagesTableBody");

    try {
        const res = await authFetch(`${API_BASE}/voyages`);
        if (!res.ok) return;
        currentVoyagesCache = await res.json();

        if (vSelect) {
            vSelect.innerHTML = "";
            currentVoyagesCache.forEach((v, idx) => {
                const opt = document.createElement("option");
                opt.value = v.id;
                opt.textContent = `${v.voyage_number} - ${v.vessel_name} (${v.origin_port} -> ${v.destination_port}) [${v.status}]`;
                vSelect.appendChild(opt);
            });

            vSelect.onchange = () => {
                const selected = currentVoyagesCache.find(v => v.id === parseInt(vSelect.value));
                if (selected) renderActiveVoyage(selected);
            };
        }

        if (currentVoyagesCache.length > 0) {
            renderActiveVoyage(currentVoyagesCache[0]);
        }

        if (tbody) {
            tbody.innerHTML = "";
            currentVoyagesCache.forEach(v => {
                const tr = document.createElement("tr");
                const isDelay = v.delay_hours > 0;
                tr.innerHTML = `
                    <td><strong>${v.voyage_number}</strong></td>
                    <td><strong>${v.vessel_name}</strong></td>
                    <td>${v.origin_port} &rarr; ${v.destination_port}</td>
                    <td><span class="badge-status badge-status-cyan">${v.status}</span></td>
                    <td style="color:${isDelay ? '#ef4444' : '#10b981'}; font-weight:600;">
                        ${isDelay ? `+${v.delay_hours}h (${v.delay_reason || 'Weather'})` : 'On Schedule'}
                    </td>
                    <td>${v.ballast_distance_nm || 1240} nm</td>
                    <td>${v.fuel_consumed_mt || 185} MT</td>
                    <td>
                        <button class="btn-action-primary" onclick="selectVoyageForTimeline(${v.id})">
                            <i class="fa-solid fa-eye"></i> Track
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.warn("Error loading voyages:", e);
    }
}
window.loadAllVoyages = loadAllVoyages;

function selectVoyageForTimeline(voyageId) {
    const vSelect = document.getElementById("voyageSelect");
    if (vSelect) vSelect.value = voyageId;
    const selected = currentVoyagesCache.find(v => v.id === voyageId);
    if (selected) renderActiveVoyage(selected);
    window.scrollTo({ top: 150, behavior: "smooth" });
}
window.selectVoyageForTimeline = selectVoyageForTimeline;

function renderActiveVoyage(voyage) {
    const title = document.getElementById("voyageTrackTitle");
    const subtitle = document.getElementById("voyageTrackSubtitle");
    const stageBadge = document.getElementById("voyageCurrentStageBadge");
    const track = document.getElementById("voyageStepperTrack");

    if (title) title.textContent = `Voyage ${voyage.voyage_number} • ${voyage.vessel_name}`;
    if (subtitle) subtitle.textContent = `Route: ${voyage.origin_port} &rarr; ${voyage.destination_port} | Class: ${voyage.vessel_class || 'Supramax'}`;
    if (stageBadge) stageBadge.textContent = `CURRENT STAGE: ${voyage.status}`;

    const stages = [
        { code: "FIXTURE", name: "Fixture Fixed", icon: "fa-file-signature" },
        { code: "NOMINATION", name: "Nomination", icon: "fa-envelope-open-text" },
        { code: "BALLAST", name: "Ballast Transit", icon: "fa-ship" },
        { code: "ARRIVAL", name: "Load Arrival", icon: "fa-anchor" },
        { code: "LOADING", name: "Loading Ops", icon: "fa-dolly" },
        { code: "DEPARTURE", name: "Departure", icon: "fa-compass" },
        { code: "TRANSIT", name: "Laden Transit", icon: "fa-water" },
        { code: "DISCHARGE", name: "Discharge Ops", icon: "fa-warehouse" },
        { code: "COMPLETED", name: "Completed", icon: "fa-flag-checkered" }
    ];

    const currentIdx = stages.findIndex(s => s.code === voyage.status);
    const activeIdx = currentIdx !== -1 ? currentIdx : 0;

    if (track) {
        track.innerHTML = "";
        stages.forEach((st, idx) => {
            const stepDiv = document.createElement("div");
            let stateClass = "upcoming";
            if (idx < activeIdx) stateClass = "completed";
            else if (idx === activeIdx) stateClass = "active";

            stepDiv.className = `v-step ${stateClass}`;
            const iconToUse = stateClass === "completed" ? "fa-check" : st.icon;

            stepDiv.innerHTML = `
                <div class="step-circle">
                    <i class="fa-solid ${iconToUse}"></i>
                </div>
                <span class="step-title">${st.name}</span>
            `;
            track.appendChild(stepDiv);
        });
    }
}

async function advanceVoyageStage() {
    const vSelect = document.getElementById("voyageSelect");
    if (!vSelect || !vSelect.value) {
        alert("Please select a voyage first.");
        return;
    }

    const voyageId = parseInt(vSelect.value);
    const selected = currentVoyagesCache.find(v => v.id === voyageId);
    if (!selected) return;

    const stages = ["FIXTURE", "NOMINATION", "BALLAST", "ARRIVAL", "LOADING", "DEPARTURE", "TRANSIT", "DISCHARGE", "COMPLETED"];
    const currIdx = stages.indexOf(selected.status);

    if (currIdx >= stages.length - 1) {
        alert("This voyage has already reached its final COMPLETED stage!");
        return;
    }

    const nextStatus = stages[currIdx + 1];

    const delayInput = document.getElementById("voyageDelayInput");
    const reasonSelect = document.getElementById("voyageDelayReasonSelect");
    const delayHours = parseFloat(delayInput ? delayInput.value : 0) || 0;
    const delayReason = (reasonSelect && reasonSelect.value) ? reasonSelect.value : "Operational Congestion";

    try {
        const res = await authFetch(`${API_BASE}/voyages/${voyageId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: nextStatus,
                delay_hours: delayHours,
                delay_reason: delayReason
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert("Stage Advance Failed: " + (err.detail || "Server error"));
            return;
        }

        const data = await res.json();
        alert(`Voyage stage advanced to: ${nextStatus}!`);
        await loadAllVoyages();
        if (vSelect) vSelect.value = voyageId;
        const updated = currentVoyagesCache.find(v => v.id === voyageId);
        if (updated) renderActiveVoyage(updated);
    } catch (e) {
        console.error("Error advancing voyage stage:", e);
        alert("Error advancing voyage stage: " + e.message);
    }
}
window.advanceVoyageStage = advanceVoyageStage;

/* -----------------------------------------------------
   4. NAVIGATION SAFETY & BALLAST OPS
----------------------------------------------------- */

function initNavSafetyDropdowns() {
    const portSelect = document.getElementById("navSafetyPortSelect");
    if (portSelect && portsCache.length > 0 && portSelect.options.length <= 1) {
        portSelect.innerHTML = "";
        portsCache.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.name} (Max Draft: ${p.max_draft}m | LOA: ${p.max_loa}m)`;
            portSelect.appendChild(opt);
        });
    }
}

async function computeNavSafety() {
    const portSelect = document.getElementById("navSafetyPortSelect");
    const draftInput = document.getElementById("navSafetyDraftInput");
    const tideInput = document.getElementById("navSafetyTideInput");

    const portId = portSelect ? parseInt(portSelect.value) : 1;
    const vesselDraft = draftInput ? parseFloat(draftInput.value) : 14.5;
    const tide = tideInput ? parseFloat(tideInput.value) : 1.2;

    try {
        const res = await authFetch(`${API_BASE}/navigation/safety`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                port_id: portId,
                vessel_draft: vesselDraft,
                tidal_surge: tide,
                speed_knots: 6.0
            })
        });

        if (!res.ok) return;
        const data = await res.json();

        const badge = document.getElementById("navSafetyStatusBadge");
        const depth = document.getElementById("navSafetyAvailableDepth");
        const ukc = document.getElementById("navSafetyClearance");
        const verdict = document.getElementById("navSafetyVerdict");
        const advisory = document.getElementById("navSafetyAdvisory");

        if (depth) depth.textContent = `${data.effective_water_depth.toFixed(1)} m`;
        if (ukc) ukc.textContent = `${data.ukc_margin >= 0 ? '+' : ''}${data.ukc_margin.toFixed(2)} m`;
        if (verdict) verdict.textContent = data.safety_verdict;
        if (advisory) advisory.textContent = data.lightering_recommendation;

        if (badge) {
            if (data.safety_verdict === "SAFE") {
                badge.className = "badge-status badge-status-green";
                badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> SAFE NAVIGATION MARGIN`;
            } else if (data.safety_verdict === "MARGINAL") {
                badge.className = "badge-status badge-status-amber";
                badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> MARGINAL (TIDAL WINDOW REQUIRED)`;
            } else {
                badge.className = "badge-status badge-status-red";
                badge.innerHTML = `<i class="fa-solid fa-ban"></i> PROHIBITED (LIGHTERING MANDATORY)`;
            }
        }
    } catch (e) {
        console.warn("Error computing nav safety:", e);
    }
}
window.computeNavSafety = computeNavSafety;

function initBallastDropdowns() {
    const portSelect = document.getElementById("ballastPortSelect");
    if (portSelect && portsCache.length > 0 && portSelect.options.length <= 1) {
        portSelect.innerHTML = "";
        portsCache.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name;
            opt.textContent = `${p.name} (${p.country || 'India'})`;
            portSelect.appendChild(opt);
        });
    }
}

async function computeBallastOps() {
    const vSelect = document.getElementById("ballastVesselSelect");
    const pSelect = document.getElementById("ballastPortSelect");

    const vesselId = vSelect ? parseInt(vSelect.value) : 1;
    const targetPort = pSelect ? pSelect.value : "Paradip";

    try {
        const res = await authFetch(`${API_BASE}/fleet/repositioning`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vessel_id: vesselId,
                target_load_port: targetPort,
                bunker_price_vlsfo: 625.0,
                daily_hire_rate: 18500.0
            })
        });

        if (!res.ok) return;
        const data = await res.json();

        const badge = document.getElementById("ballastRatingBadge");
        const dist = document.getElementById("ballastDistText");
        const dur = document.getElementById("ballastDurationText");
        const fuel = document.getElementById("ballastFuelText");
        const cost = document.getElementById("ballastCostText");
        const eta = document.getElementById("ballastEtaText");

        if (dist) dist.textContent = `${data.ballast_distance_nm.toLocaleString()} NM`;
        if (dur) dur.textContent = `${data.ballast_days.toFixed(1)} Days`;
        if (fuel) fuel.textContent = `${data.fuel_burn_mt.toFixed(1)} MT VLSFO`;
        if (cost) cost.textContent = `$${Math.round(data.total_repositioning_cost_usd).toLocaleString()}`;
        if (eta) eta.textContent = `TCE: $${Math.round(data.ballast_tce_usd_day).toLocaleString()}/day`;

        if (badge) {
            badge.className = data.efficiency_rating === "OPTIMAL" ? "badge-status badge-status-green" : "badge-status badge-status-amber";
            badge.textContent = `EFFICIENCY: ${data.efficiency_rating}`;
        }
    } catch (e) {
        console.warn("Error computing ballast ops:", e);
    }
}
window.computeBallastOps = computeBallastOps;

/* -----------------------------------------------------
   5. MARKET ANALYST: BALTIC MONITOR, ANOMALIES & ACCURACY
----------------------------------------------------- */

async function loadAnalystOverview() {
    await loadBalticMonitor();
}
window.loadAnalystOverview = loadAnalystOverview;

async function loadBalticMonitor() {
    try {
        const res = await authFetch(`${API_BASE}/market/indices`);
        if (!res.ok) return;
        const data = await res.json();

        const idx = data.indices || {};
        const updateIdx = (prefix, obj) => {
            if (!obj) return;
            const valEl = document.getElementById(prefix + "Val");
            const chgEl = document.getElementById(prefix + "Change");
            if (valEl) valEl.textContent = obj.current;
            if (chgEl) {
                const isUp = obj.change_pct >= 0;
                chgEl.textContent = `${isUp ? '+' : ''}${obj.change_pct}%`;
                chgEl.style.color = isUp ? "#10b981" : "#ef4444";
            }
        };

        updateIdx("bdi", idx.bdi);
        updateIdx("bci", idx.bci);
        updateIdx("bpi", idx.bpi);
        updateIdx("bsi", idx.bsi);

        // Update Overview KPIs
        const anBdi = document.getElementById("anKpiBdi");
        const anBci = document.getElementById("anKpiBci");
        const anBpi = document.getElementById("anKpiBpi");
        const anBunker = document.getElementById("anKpiBunker");

        if (anBdi && idx.bdi) anBdi.textContent = idx.bdi.current;
        if (anBci && idx.bci) anBci.textContent = idx.bci.current;
        if (anBpi && idx.bpi) anBpi.textContent = idx.bpi.current;
        if (anBunker) anBunker.textContent = `$${data.bunker_price_vlsfo || 625}/MT`;

    } catch (e) {
        console.warn("Error loading Baltic indices monitor:", e);
    }
}
window.loadBalticMonitor = loadBalticMonitor;

async function loadMacroAnomalies() {
    const container = document.getElementById("anomaliesContainer");
    if (!container) return;

    try {
        const res = await authFetch(`${API_BASE}/market/anomalies`);
        if (!res.ok) return;
        const anomalies = await res.json();

        container.innerHTML = "";
        anomalies.forEach(a => {
            const card = document.createElement("div");
            card.className = `anomaly-card ${a.severity.toLowerCase()}`;
            card.innerHTML = `
                <div class="anomaly-header">
                    <span class="anomaly-title">${a.title}</span>
                    <span class="badge-status ${a.severity === 'HIGH' ? 'badge-status-red' : 'badge-status-amber'}">${a.severity} SEVERITY</span>
                </div>
                <div class="anomaly-meta">Detected: ${a.detected_at} &bull; Type: ${a.type}</div>
                <div class="anomaly-desc">${a.description}</div>
                <div class="anomaly-guidance">
                    <strong><i class="fa-solid fa-lightbulb"></i> Quantitative Action:</strong> ${a.recommended_action}
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.warn("Error loading macro anomalies:", e);
    }
}
window.loadMacroAnomalies = loadMacroAnomalies;

async function loadModelPerformance() {
    try {
        const res = await authFetch(`${API_BASE}/model/performance`);
        if (!res.ok) return;
        const data = await res.json();
        // Displays metrics in console or updates table
        console.log("Model Performance Metrics:", data);
    } catch (e) {
        console.warn("Error loading model performance:", e);
    }
}
window.loadModelPerformance = loadModelPerformance;

async function loadDataQualityReport() {
    const tbody = document.getElementById("dataQualityTableBody");
    if (!tbody) return;

    try {
        const res = await authFetch(`${API_BASE}/data/quality`);
        if (!res.ok) return;
        const report = await res.json();

        tbody.innerHTML = "";
        (report.sources || []).forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${s.dataset}</strong></td>
                <td><strong style="color:#10b981;">${s.completeness}%</strong></td>
                <td>${s.freshness_hours}h ago</td>
                <td>${(s.row_count || 12000).toLocaleString()}</td>
                <td><span class="badge-status badge-status-green"><i class="fa-solid fa-shield-check"></i> ${s.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn("Error loading data quality:", e);
    }
}
window.loadDataQualityReport = loadDataQualityReport;

let analystChartInstance = null;

async function renderAnalystForecastChart(horizon = 30) {
    const canvas = document.getElementById("analystForecastChart");
    if (!canvas) return;

    try {
        const res = await fetch(`${API_BASE}/forecast?horizon=${horizon}&route=Indonesia-EastCoastIndia%20(coal)&vessel_class=Supramax`);
        if (!res.ok) return;
        const data = await res.json();
        const forecasts = data.forecasts || [];

        const ctx = canvas.getContext("2d");
        if (analystChartInstance) analystChartInstance.destroy();

        const labels = forecasts.map(f => f.target_date.slice(5));
        const p10 = forecasts.map(f => f.p10);
        const p50 = forecasts.map(f => f.p50);
        const p90 = forecasts.map(f => f.p90);

        analystChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "P90 Upper Risk Ceiling",
                        data: p90,
                        borderColor: "rgba(239, 68, 68, 0.6)",
                        backgroundColor: "rgba(239, 68, 68, 0.05)",
                        borderDash: [4, 4],
                        fill: "+1",
                        pointRadius: 0
                    },
                    {
                        label: "P50 Expected Freight Rate ($/MT)",
                        data: p50,
                        borderColor: "#20b8ff",
                        backgroundColor: "rgba(32, 184, 255, 0.15)",
                        borderWidth: 3,
                        pointRadius: 2,
                        pointHoverRadius: 6
                    },
                    {
                        label: "P10 Lower Floor",
                        data: p10,
                        borderColor: "rgba(16, 185, 129, 0.6)",
                        backgroundColor: "transparent",
                        borderDash: [4, 4],
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: "#94a3b8" } }
                },
                scales: {
                    x: { ticks: { color: "#64748b", maxTicksLimit: 12 }, grid: { display: false } },
                    y: { ticks: { color: "#64748b", callback: v => "$" + v }, grid: { color: "rgba(255,255,255,0.05)" } }
                }
            }
        });
    } catch (e) {
        console.warn("Error rendering analyst forecast chart:", e);
    }
}
window.renderAnalystForecastChart = renderAnalystForecastChart;

function switchForecastHorizon(days) {
    const btns = [
        { id: "btnHorizon30", days: 30 },
        { id: "btnHorizon60", days: 60 },
        { id: "btnHorizon90", days: 90 }
    ];

    btns.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) el.classList.toggle("active", b.days === days);
    });

    const hText = document.getElementById("anForecastHorizonText");
    if (hText) hText.textContent = `${days}-Day Forward Horizon`;

    renderAnalystForecastChart(days);
}
window.switchForecastHorizon = switchForecastHorizon;
