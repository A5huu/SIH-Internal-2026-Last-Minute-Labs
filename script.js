/* ==================================================
   FREIGHTIQ
   APPLICATION JAVASCRIPT & BACKEND INTEGRATION
   PostgreSQL + FastAPI + ML XGBoost Decision Engine
================================================== */

const API_BASE = (window.location.port === "8000")
    ? window.location.origin
    : "http://127.0.0.1:8000";

/* =====================================================
   CENTRALIZED ROLE-BASED FETCH WRAPPER
===================================================== */

async function authFetch(url, options = {}) {
    let role = "Logistics Manager";

    try {
        const userStr = localStorage.getItem("freightiq_user");

        if (userStr) {
            const u = JSON.parse(userStr);

            if (u && u.role) {
                role = u.role;
            }
        }
    } catch (e) {
        console.warn("Unable to read user role:", e);
    }

    const headers = Object.assign({}, options.headers || {}, {
        "X-User-Role": role,
        "Authorization":
            `Bearer ${role.toLowerCase().replace(/\s+/g, "_")}_token`
    });

    return fetch(
        url,
        Object.assign({}, options, { headers })
    );
}


/* =====================================================
   GLOBAL APPLICATION STATE
===================================================== */

let portsCache = [];

let vesselClassesCache = [];

let currentCargoId = 1;

let currentRoute =
    "Indonesia-EastCoastIndia (coal)";

let currentVesselClass =
    "Supramax";

let freightChartInstance = null;

let forecastChartInstance = null;

let portMapInstance = null;

let portMarkers = {};

let portRouteLayers = [];


/* =====================================================
   PAGE NAVIGATION
===================================================== */

function showPage(pageId, clickedButton = null) {

    const pages =
        document.querySelectorAll(".page");

    pages.forEach(page => {
        page.classList.remove("active-page");
    });

    const selectedPage =
        document.getElementById(pageId);

    if (selectedPage) {
        selectedPage.classList.add("active-page");
    }

    const navItems =
        document.querySelectorAll(".nav-item");

    navItems.forEach(item => {
        item.classList.remove("active");
    });

    if (clickedButton) {

        clickedButton.classList.add("active");

    } else {

        navItems.forEach(item => {

            const attr =
                item.getAttribute("onclick");

            if (
                attr &&
                attr.includes(`'${pageId}'`)
            ) {
                item.classList.add("active");
            }

        });
    }

    updatePageTitle(pageId);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    /* =================================================
       ROLE-SPECIFIC AUTOMATED VIEW TRIGGERS
    ================================================= */

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


    /* =================================================
       LEAFLET PORT MAP
    ================================================= */

    if (pageId === "ports") {

        setTimeout(() => {

            if (!portMapInstance) {

                initPortMap();

            } else {

                portMapInstance.invalidateSize();

            }

        }, 150);
    }


    /* =================================================
       FORECAST PAGE
    ================================================= */

    if (pageId === "forecast") {

        setTimeout(() => {

            loadForecastData();

            if (forecastChartInstance) {
                forecastChartInstance.resize();
            }

        }, 120);
    }


    /* =================================================
       VESSEL RECOMMENDATION PAGE
    ================================================= */

    if (pageId === "vessel") {

        renderRankedVessels();

    }
}


/* =====================================================
   PAGE TITLES
===================================================== */

function updatePageTitle(pageId) {

    const titles = {

        dashboard: [
            "Procurement Command Center",
            "High-level overview of bulk cargo procurement & logistics KPIs"
        ],

        cargo: [
            "Cargo Wizard",
            "Define cargo parameters for end-to-end AI recommendations"
        ],

        vessel: [
            "Ranked Vessel Recommendations",
            "Physical feasibility-constrained candidate ranking"
        ],

        forecast: [
            "Freight Rate Forecast & SHAP",
            "AI-powered freight rate prediction and explainability"
        ],

        ports: [
            "Port Explorer",
            "Inspect East Coast India port constraints and vessel draft"
        ],

        coa: [
            "Spot vs CoA Simulator",
            "Evaluate market volatility and contract cost exposure"
        ],

        risk: [
            "Risk Score",
            "Monitor maritime freight, weather and port risks"
        ],

        alerts: [
            "Risk & Alerts",
            "Live operational signals and maritime hazard advisories"
        ],

        decisions: [
            "Procurement Decisions & Approvals",
            "Stem audit trail and commercial sign-offs"
        ],

        charteringOps: [
            "Chartering Operations Center",
            "Fleet disposition, vessel nominations & live execution"
        ],

        tonnageBoard: [
            "Tonnage Availability Board",
            "350 real bulk carriers with real-time status & positions"
        ],

        fixtureMgmt: [
            "Fixture & Contract Management",
            "Charterparty agreement, freight fixing & voyage nomination"
        ],

        voyageTimeline: [
            "Voyage Execution Timeline",
            "9-stage closed-loop operational voyage tracking"
        ],

        navSafety: [
            "UKC Navigational Safety Margin",
            "Dynamic draft, squat effect & tidal surge clearance"
        ],

        ballastOps: [
            "Ballast & Repositioning Economics",
            "Vessel positioning cost, fuel burn & TCE optimization"
        ],

        laycanMonitor: [
            "Laycan & Demurrage Monitor",
            "Readiness windows, weather delays & demurrage exposure"
        ],

        analystOverview: [
            "Market Intelligence Overview",
            "Baltic macro trends, freight spreads & volatility index"
        ],

        analystForecast: [
            "Multi-Horizon Freight Forecast",
            "P10 / P50 / P90 probabilistic rate forecast curves"
        ],

        balticMonitor: [
            "Baltic Dry Indices Monitor",
            "Real-time BDI, BCI, BPI, BSI cross-index correlation"
        ],

        macroAnomalies: [
            "Macro Signals & Anomaly Detection",
            "Bunker shock, congestion spikes & spread divergences"
        ],

        modelPerformance: [
            "Model Performance & Backtesting",
            "XGBoost vs Naive baseline, MAPE, MAE & drift tracking"
        ],

        dataQuality: [
            "Data Quality & Pipeline Health",
            "Completeness scoring, schema validation & update latency"
        ]
    };


    const title =
        titles[pageId] || titles.dashboard;

    const pt =
        document.getElementById("pageTitle");

    const ps =
        document.getElementById("pageSubtitle");

    if (pt) {
        pt.textContent = title[0];
    }

    if (ps) {
        ps.textContent = title[1];
    }
}


/* =====================================================
   REFRESH BUTTON
===================================================== */

async function refreshData() {

    const button =
        document.querySelector(".refresh-btn");

    if (!button) return;

    const original =
        button.innerHTML;

    button.innerHTML =
        `<i class="fa-solid fa-spinner fa-spin"></i> Fetching Live DB...`;

    button.disabled = true;

    try {

        await initAppData();

        button.innerHTML =
            `<i class="fa-solid fa-check"></i> Updated`;

        button.style.color =
            "#22c55e";

    } catch (e) {

        console.error(
            "Refresh error:",
            e
        );

        button.innerHTML =
            `<i class="fa-solid fa-circle-exclamation"></i> Error`;

        button.style.color =
            "#ef4444";

    } finally {

        setTimeout(() => {

            button.innerHTML =
                original;

            button.disabled =
                false;

            button.style.color =
                "";

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


/* =====================================================
   SYSTEM HEALTH CHECK
===================================================== */

async function checkSystemHealth() {

    const bStatus =
        document.getElementById("backendStatus");

    const dStatus =
        document.getElementById("dbStatus");

    const mStatus =
        document.getElementById("mlStatus");

    try {

        const res =
            await fetch(`${API_BASE}/health`);

        if (res.ok) {

            if (bStatus) {

                bStatus.innerHTML =
                    `<i class="fa-solid fa-circle" style="color:#22c55e"></i>
                     FastAPI: Online (Port 8000)`;

            }

            if (dStatus) {

                dStatus.innerHTML =
                    `<i class="fa-solid fa-database" style="color:#22c55e"></i>
                     PostgreSQL: Connected (Port 5432)`;

            }

            if (mStatus) {

                mStatus.innerHTML =
                    `<i class="fa-solid fa-microchip" style="color:#20b8ff"></i>
                     ML: XGBoost Model Active`;

            }

        } else {

            throw new Error(
                "Health check non-200"
            );
        }

    } catch (err) {

        console.warn(
            "Backend not yet connected:",
            err
        );

        if (bStatus) {

            bStatus.innerHTML =
                `<i class="fa-solid fa-circle" style="color:#f59e0b"></i>
                 FastAPI: Offline / Connecting`;

        }

        if (dStatus) {

            dStatus.innerHTML =
                `<i class="fa-solid fa-database" style="color:#f59e0b"></i>
                 PostgreSQL: Standby`;

        }
    }
}


/* =====================================================
   LOAD PORTS FROM POSTGRESQL
===================================================== */

async function loadPorts() {

    try {

        const res =
            await fetch(`${API_BASE}/ports`);

        if (!res.ok) return;

        portsCache =
            await res.json();


        /* =================================================
           DESTINATION DROPDOWN
        ================================================= */

        const destSelect =
            document.getElementById(
                "cargoDestination"
            );

        if (
            destSelect &&
            portsCache.length > 0
        ) {

            destSelect.innerHTML = "";

            portsCache.forEach(port => {

                const opt =
                    document.createElement(
                        "option"
                    );

                opt.value =
                    port.id;

                opt.textContent =
                    `${port.name} (Draft: ${port.max_draft}m | LOA: ${port.max_loa || 300}m)`;

                destSelect.appendChild(opt);

            });


            /* Default to Paradip */

            const defPort =
                portsCache.find(
                    p =>
                        p.name.toLowerCase() ===
                        "paradip"
                ) ||
                portsCache[0];

            if (defPort) {

                destSelect.value =
                    defPort.id;

            }
        }


        /* =================================================
           PORT LIST
        ================================================= */

        const portListDiv =
            document.getElementById(
                "portListContainer"
            ) ||
            document.querySelector(
                ".port-list"
            );

        if (
            portListDiv &&
            portsCache.length > 0
        ) {

            portListDiv.innerHTML = "";

            portsCache.forEach(port => {

                const draftTag =
                    port.max_draft >= 18
                        ? "tag-low"
                        : port.max_draft >= 14
                            ? "tag-med"
                            : "tag-high";

                const draftLabel =
                    port.max_draft >= 18
                        ? "Deep Draft"
                        : port.max_draft >= 14
                            ? "Standard"
                            : "Draft-sensitive";

                const btn =
                    document.createElement(
                        "button"
                    );

                btn.type =
                    "button";

                btn.onclick =
                    () => selectPort(
                        port.name
                    );

                btn.innerHTML = `
                    <strong>${port.name}</strong>
                    <span>
                        Draft: ${port.max_draft}m,
                        LOA: ${port.max_loa}m
                    </span>
                    <em class="${draftTag}">
                        ${draftLabel}
                    </em>
                `;

                portListDiv.appendChild(
                    btn
                );

            });
        }


        /* =================================================
           PORT MAP
        ================================================= */

        if (
            document.getElementById(
                "portMap"
            )
        ) {

            if (!portMapInstance) {

                initPortMap();

            } else {

                renderPortMarkers();

            }
        }


        /* =================================================
           INITIAL PORT
        ================================================= */

        const initialPort =
            portsCache.find(
                p =>
                    p.name.toLowerCase() ===
                    "paradip"
            ) ||
            portsCache[0];

        if (initialPort) {

            selectPort(
                initialPort.name
            );
        }

    } catch (err) {

        console.error(
            "Error loading ports:",
            err
        );
    }
}


/* =====================================================
   MARKET DATA & CHART
===================================================== */

async function loadMarketData() {

    try {

        const url =
            `${API_BASE}/market?route=${encodeURIComponent(currentRoute)}&vessel_class=${encodeURIComponent(currentVesselClass)}`;

        const res =
            await fetch(url);

        if (!res.ok) return;

        const data =
            await res.json();


        /* Dashboard Rate KPI */

        if (
            data.current_rate !==
                undefined &&
            data.current_rate !== null
        ) {

            const rateH2 =
                document.querySelector(
                    ".stat-card.blue h2"
                );

            if (rateH2) {

                rateH2.innerHTML =
                    `$${data.current_rate.toFixed(2)}
                     <small>/ MT</small>`;

            }
        }


        /* Chart Range */

        const rangeSelect =
            document.getElementById(
                "chartRange"
            );

        let days = 30;

        if (rangeSelect) {

            const val =
                rangeSelect.value ||
                "";

            const parsed =
                parseInt(val);

            if (!isNaN(parsed)) {

                days = parsed;

            } else if (
                val.includes("90")
            ) {

                days = 90;

            } else if (
                val.includes("60")
            ) {

                days = 60;

            } else {

                days = 30;
            }
        }


        /* Historical market data */

        const history =
            data.historical || [];

        if (history.length > 0) {

            const recent =
                history.slice(-days);

            const labels =
                recent.map(h => {

                    const d =
                        new Date(h.date);

                    return d.toLocaleDateString(
                        "en-US",
                        {
                            month: "short",
                            day: "numeric"
                        }
                    );

                });

            const rates =
                recent.map(
                    h => h.rate
                );

            renderFreightChart(
                labels,
                rates
            );
        }

    } catch (err) {

        console.error(
            "Error loading market data:",
            err
        );
    }
}


/* =====================================================
   FORECAST DATA & AI CHART
===================================================== */

async function loadForecastData(
    targetRoute = null,
    targetVessel = null,
    targetHorizon = null
) {

    const route =
        targetRoute ||
        currentRoute;

    const vessel =
        targetVessel ||
        currentVesselClass;

    const horizonSelect =
        document.getElementById(
            "forecastHorizonSelect"
        );

    const horizon =
        targetHorizon ||
        (
            horizonSelect
                ? parseInt(
                    horizonSelect.value
                ) || 30
                : 30
        );

    try {

        const [
            marketRes,
            forecastRes
        ] = await Promise.all([

            fetch(
                `${API_BASE}/market?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}`
            ),

            fetch(
                `${API_BASE}/forecast?route=${encodeURIComponent(route)}&vessel_class=${encodeURIComponent(vessel)}&horizon_days=${horizon}`
            )
        ]);


        if (!forecastRes.ok) return;

        const forecastData =
            await forecastRes.json();

        const marketData =
            marketRes.ok
                ? await marketRes.json()
                : {
                    current_rate: null,
                    historical: []
                };


        const forecasts =
            forecastData.forecasts ||
            [];

        const history =
            marketData.historical ||
            [];


        const currentRate =
            (
                marketData.current_rate !==
                    null &&
                marketData.current_rate !==
                    undefined
            )
                ? marketData.current_rate
                : (
                    history.length > 0
                        ? history[
                            history.length - 1
                        ].rate
                        : (
                            forecasts.length > 0
                                ? forecasts[0].p50
                                : 20.0
                        )
                );


        /* =================================================
           DASHBOARD FORECAST KPI
        ================================================= */

        const fcKpi =
            document.querySelector(
                ".stat-card.purple h2"
            );

        if (
            fcKpi &&
            forecasts.length > 0
        ) {

            fcKpi.innerHTML =
                `$${forecasts[0].p50.toFixed(2)}
                 <small>/ MT</small>`;

        }


        /* =================================================
           FORECAST PAGE CARDS
        ================================================= */

        const fcValCurrent =
            document.getElementById(
                "fcValCurrent"
            );

        const fcSubCurrent =
            document.getElementById(
                "fcSubCurrent"
            );

        const fcVal7d =
            document.getElementById(
                "fcVal7d"
            );

        const fcSub7d =
            document.getElementById(
                "fcSub7d"
            );

        const fcVal30d =
            document.getElementById(
                "fcVal30d"
            );

        const fcSub30d =
            document.getElementById(
                "fcSub30d"
            );

        const fcVal90d =
            document.getElementById(
                "fcVal90d"
            );

        const fcSub90d =
            document.getElementById(
                "fcSub90d"
            );


        if (fcValCurrent) {

            fcValCurrent.textContent =
                `$${currentRate.toFixed(2)}`;

        }

        if (fcSubCurrent) {

            fcSubCurrent.textContent =
                `${vessel} • Spot Fixture`;

        }


        /* =================================================
           FORECAST VALUES
        ================================================= */

        if (forecasts.length > 0) {

            const fc7 =
                forecasts.length >= 7
                    ? forecasts[6].p50
                    : forecasts[
                        forecasts.length - 1
                    ].p50;

            const diff7 =
                (
                    (fc7 - currentRate) /
                    currentRate
                ) * 100;


            if (fcVal7d) {

                fcVal7d.textContent =
                    `$${fc7.toFixed(2)}`;

            }

            if (fcSub7d) {

                fcSub7d.textContent =
                    `${diff7 >= 0 ? "+" : ""}${diff7.toFixed(1)}% vs Current`;

                fcSub7d.className =
                    diff7 >= 0
                        ? "trend-up"
                        : "trend-down";
            }


            /* Target horizon */

            const targetIdx =
                forecasts.length - 1;

            const fcTarget =
                forecasts[
                    targetIdx
                ].p50;

            const diffTarget =
                (
                    (fcTarget - currentRate) /
                    currentRate
                ) * 100;


            const cardTargetLabel =
                document.querySelector(
                    "#fcCard30d span"
                );

            if (cardTargetLabel) {

                cardTargetLabel.textContent =
                    `${horizon}-Day Forward (P50)`;

            }


            if (fcVal30d) {

                fcVal30d.textContent =
                    `$${fcTarget.toFixed(2)}`;

            }

            if (fcSub30d) {

                fcSub30d.textContent =
                    `${diffTarget >= 0 ? "+" : ""}${diffTarget.toFixed(1)}% vs Current`;

                fcSub30d.className =
                    diffTarget >= 0
                        ? "trend-up"
                        : "trend-down";
            }


            /* P90 upper risk */

            const p90Val =
                forecasts[
                    targetIdx
                ].p90;

            const diffP90 =
                (
                    (p90Val - currentRate) /
                    currentRate
                ) * 100;


            if (fcVal90d) {

                fcVal90d.textContent =
                    `$${p90Val.toFixed(2)}`;

            }

            if (fcSub90d) {

                fcSub90d.textContent =
                    `${diffP90 >= 0 ? "+" : ""}${diffP90.toFixed(1)}% Upper Risk`;

                fcSub90d.className =
                    "trend-up";
            }
        }


        /* =================================================
           RENDER FORECAST CHART
        ================================================= */

        renderForecastChart(
            history,
            forecasts,
            currentRate
        );


        /* =================================================
           SHAP / EXPLAINABILITY
        ================================================= */

        renderForecastExplainability(
            forecastData.drivers,
            currentRate,
            forecasts
        );

    } catch (err) {

        console.error(
            "Error loading forecast data:",
            err
        );
    }
}
                       /* =====================================================
   RISK EVENTS
===================================================== */

async function loadRiskData() {

    try {

        const res =
            await fetch(`${API_BASE}/risk`);

        if (!res.ok) return;

        const data =
            await res.json();

        const risks =
            data.risks || [];


        /* -------------------------------------------------
           ALERT COUNTS
        ------------------------------------------------- */

        const highCount =
            risks.filter(
                r => r.severity === "High"
            ).length;

        const medCount =
            risks.filter(
                r => r.severity === "Medium"
            ).length;

        const lowCount =
            risks.filter(
                r => r.severity === "Low"
            ).length;


        const statBoxes =
            document.querySelectorAll(
                ".alert-stat strong"
            );

        if (statBoxes.length >= 3) {

            statBoxes[0].textContent =
                highCount;

            statBoxes[1].textContent =
                medCount;

            statBoxes[2].textContent =
                lowCount;
        }


        /* -------------------------------------------------
           ALERT LIST
        ------------------------------------------------- */

        const alertList =
            document.querySelector(
                ".alert-list"
            );

        if (
            alertList &&
            risks.length > 0
        ) {

            alertList.innerHTML = "";

            risks.forEach(r => {

                const sevClass =
                    (r.severity || "Low")
                        .toLowerCase();

                const icon =
                    r.event_type === "weather"
                        ? "fa-cloud"
                        : r.event_type === "port_congestion"
                            ? "fa-anchor"
                            : r.event_type === "geopolitical"
                                ? "fa-earth-asia"
                                : "fa-chart-line";

                const div =
                    document.createElement(
                        "div"
                    );

                div.className =
                    `alert-item ${sevClass}`;

                div.innerHTML = `
                    <div class="alert-symbol">
                        <i class="fa-solid ${icon}"></i>
                    </div>

                    <div>
                        <strong>
                            ${(r.event_type || "")
                                .replace("_", " ")
                                .toUpperCase()}:
                            ${r.description || "Risk signal detected"}
                        </strong>

                        <p>
                            Route:
                            ${r.route || "Regional"}
                            |
                            Source:
                            ${r.source || "Port Authority"}
                            |
                            Date:
                            ${r.event_date || "-"}
                        </p>
                    </div>

                    <span>
                        ${(r.severity || "LOW").toUpperCase()}
                    </span>
                `;

                alertList.appendChild(div);
            });
        }


        /* -------------------------------------------------
           OVERALL RISK
        ------------------------------------------------- */

        const riskLevel =
            data.overall_risk_level ||
            data.risk_level ||
            (
                highCount > 0
                    ? "High"
                    : medCount > 0
                        ? "Medium"
                        : "Low"
            );


        /* -------------------------------------------------
           RISK PILLARS
        ------------------------------------------------- */

        const volRisks =
            risks.filter(
                r => r.event_type === "freight_anomaly"
            );

        const geoRisks =
            risks.filter(
                r => r.event_type === "geopolitical"
            );

        const portRisks =
            risks.filter(
                r => r.event_type === "port_congestion"
            );

        const wxRisks =
            risks.filter(
                r => r.event_type === "weather"
            );


        const evalPillar =
            (items, fallback) => {

                if (!items.length) {

                    return {
                        score: fallback,
                        label: "Low • Normal baseline"
                    };
                }

                if (
                    items.some(
                        i => i.severity === "High"
                    )
                ) {

                    return {
                        score: 84,
                        label:
                            "High • Disruption signal active"
                    };
                }

                if (
                    items.some(
                        i => i.severity === "Medium"
                    )
                ) {

                    return {
                        score: 56,
                        label:
                            "Moderate • Elevated volatility"
                    };
                }

                return {
                    score: 28,
                    label:
                        "Low • Minor advisory"
                };
            };


        const volEval =
            evalPillar(volRisks, 45);

        const geoEval =
            evalPillar(geoRisks, 38);

        const portEval =
            evalPillar(portRisks, 22);

        const wxEval =
            evalPillar(wxRisks, 20);


        /* -------------------------------------------------
           COMPOSITE RISK SCORE
        ------------------------------------------------- */

        const compositeScore =
            Math.round(
                (0.35 * volEval.score) +
                (0.25 * geoEval.score) +
                (0.20 * portEval.score) +
                (0.20 * wxEval.score)
            );


        /* -------------------------------------------------
           RISK GAUGE
        ------------------------------------------------- */

        const riskGauge =
            document.getElementById(
                "riskScoreValue"
            ) ||
            document.querySelector(
                ".risk-circle strong"
            );

        if (riskGauge) {

            riskGauge.textContent =
                compositeScore;
        }


        const levelHeading =
            document.getElementById(
                "riskLevelHeading"
            ) ||
            document.querySelector(
                ".risk-score-panel h2"
            );


        const levelDesc =
            document.getElementById(
                "riskLevelDescription"
            ) ||
            document.querySelector(
                ".risk-score-panel p"
            );


        const riskCircle =
            document.getElementById(
                "riskCircleGauge"
            ) ||
            document.querySelector(
                ".risk-circle"
            );


        const color =
            compositeScore >= 70
                ? "var(--red)"
                : compositeScore >= 40
                    ? "var(--orange)"
                    : "var(--green)";


        if (levelHeading) {

            levelHeading.textContent =
                `${riskLevel} Risk`;

            levelHeading.style.color =
                color;
        }


        if (levelDesc) {

            if (compositeScore >= 70) {

                levelDesc.textContent =
                    "Active disruption signals detected. High freight volatility or route bottlenecks require defensive chartering.";

            } else if (compositeScore >= 40) {

                levelDesc.textContent =
                    "Moderate market momentum or port delays observed. Forward fixing or partial hedging advised.";

            } else {

                levelDesc.textContent =
                    "Current conditions indicate a relatively stable procurement environment with manageable volatility.";
            }
        }


        if (riskCircle) {

            riskCircle.style.background =
                `conic-gradient(
                    ${color}
                    ${compositeScore}%,
                    #173044
                    ${compositeScore}%
                )`;
        }


        /* -------------------------------------------------
           RISK FACTOR BARS
        ------------------------------------------------- */

        const updatePillarBar =
            (
                barId,
                pctId,
                sevId,
                evalObj,
                weightText
            ) => {

                const bar =
                    document.getElementById(barId);

                const pct =
                    document.getElementById(pctId);

                const sev =
                    document.getElementById(sevId);

                if (bar) {

                    bar.style.width =
                        `${evalObj.score}%`;
                }

                if (pct) {

                    pct.textContent =
                        `${evalObj.score}%`;
                }

                if (sev) {

                    sev.textContent =
                        `${weightText} • ${evalObj.label}`;
                }
            };


        updatePillarBar(
            "barVolatility",
            "pctVolatility",
            "volatilitySeverity",
            volEval,
            "Weight: 35%"
        );


        updatePillarBar(
            "barGeopolitical",
            "pctGeopolitical",
            "geopoliticalSeverity",
            geoEval,
            "Weight: 25%"
        );


        updatePillarBar(
            "barCongestion",
            "pctCongestion",
            "congestionSeverity",
            portEval,
            "Weight: 20%"
        );


        updatePillarBar(
            "barWeather",
            "pctWeather",
            "weatherSeverity",
            wxEval,
            "Weight: 20%"
        );


        const countBadge =
            document.getElementById(
                "activeRiskEventCount"
            );

        if (countBadge) {

            countBadge.innerHTML =
                `<i class="fa-solid fa-triangle-exclamation"></i>
                 ${risks.length} Monitored Signals`;
        }


        const kpiRisk =
            document.querySelector(
                ".stat-card.orange h2"
            );

        if (kpiRisk) {

            kpiRisk.innerHTML =
                `${compositeScore}<span>/100</span>`;
        }

    } catch (err) {

        console.error(
            "Error loading risk data:",
            err
        );
    }
}


/* =====================================================
   FREIGHT CHART
===================================================== */

function renderFreightChart(
    labels,
    dataPoints
) {

    const canvas =
        document.getElementById(
            "freightChart"
        );

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");


    if (freightChartInstance) {

        freightChartInstance.destroy();
    }


    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            0,
            250
        );

    gradient.addColorStop(
        0,
        "rgba(32,184,255,0.25)"
    );

    gradient.addColorStop(
        1,
        "rgba(32,184,255,0)"
    );


    const isDense =
        dataPoints.length > 40;


    freightChartInstance =
        new Chart(ctx, {

            type: "line",

            data: {

                labels: labels,

                datasets: [

                    {
                        label:
                            "Freight Rate ($/MT)",

                        data:
                            dataPoints,

                        borderColor:
                            "#20b8ff",

                        backgroundColor:
                            gradient,

                        fill:
                            true,

                        tension:
                            0.35,

                        pointRadius:
                            isDense ? 2 : 4,

                        pointHoverRadius:
                            isDense ? 5 : 7,

                        borderWidth:
                            2.5
                    }
                ]
            },

            options: {

                responsive: true,

                maintainAspectRatio:
                    false,

                plugins: {

                    legend: {
                        display: false
                    },

                    tooltip: {

                        callbacks: {

                            label: ctx =>
                                ` Rate: $${ctx.parsed.y.toFixed(2)}/MT`
                        }
                    }
                },

                scales: {

                    x: {

                        grid: {
                            display: false
                        },

                        ticks: {

                            color:
                                "#6f849a",

                            font: {
                                size: 9
                            },

                            maxTicksLimit:
                                10,

                            maxRotation:
                                0
                        }
                    },

                    y: {

                        grid: {

                            color:
                                "rgba(255,255,255,0.05)"
                        },

                        ticks: {

                            color:
                                "#6f849a",

                            font: {
                                size: 9
                            },

                            callback:
                                val =>
                                    "$" + val
                        }
                    }
                }
            }
        });
}


/* =====================================================
   FORECAST CHART
===================================================== */

function renderForecastChart(
    history,
    forecasts,
    currentRate
) {

    const canvas =
        document.getElementById(
            "forecastChart"
        );

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");


    if (forecastChartInstance) {

        forecastChartInstance.destroy();
    }


    const labels = [];

    const histData = [];

    const p50Data = [];

    const p10Data = [];

    const p90Data = [];


    const recentHistory =
        (
            history &&
            history.length > 0
        )
            ? history.slice(-10)
            : [];


    /* -------------------------------------------------
       HISTORICAL DATA
    ------------------------------------------------- */

    if (recentHistory.length > 0) {

        recentHistory.forEach(item => {

            const d =
                new Date(item.date);

            labels.push(
                d.toLocaleDateString(
                    "en-US",
                    {
                        month: "short",
                        day: "numeric"
                    }
                )
            );

            histData.push(
                item.rate
            );

            p50Data.push(null);

            p10Data.push(null);

            p90Data.push(null);
        });


        const lastRate =
            recentHistory[
                recentHistory.length - 1
            ].rate;

        p50Data[
            p50Data.length - 1
        ] = lastRate;

        p10Data[
            p10Data.length - 1
        ] = lastRate;

        p90Data[
            p90Data.length - 1
        ] = lastRate;

    } else {

        labels.push(
            "Today"
        );

        histData.push(
            currentRate
        );

        p50Data.push(
            currentRate
        );

        p10Data.push(
            currentRate
        );

        p90Data.push(
            currentRate
        );
    }


    /* -------------------------------------------------
       FORECAST
    ------------------------------------------------- */

    forecasts.forEach(f => {

        const d =
            new Date(
                f.target_date
            );

        labels.push(
            d.toLocaleDateString(
                "en-US",
                {
                    month: "short",
                    day: "numeric"
                }
            )
        );

        histData.push(null);

        p50Data.push(
            f.p50
        );

        p10Data.push(
            f.p10
        );

        p90Data.push(
            f.p90
        );
    });


    forecastChartInstance =
        new Chart(ctx, {

            type: "line",

            data: {

                labels: labels,

                datasets: [

                    {
                        label:
                            "Historical Fixtures (PostgreSQL)",

                        data:
                            histData,

                        borderColor:
                            "#20b8ff",

                        backgroundColor:
                            "rgba(32,184,255,0.1)",

                        fill:
                            false,

                        tension:
                            0.25,

                        borderWidth:
                            2.5,

                        pointRadius:
                            3,

                        pointHoverRadius:
                            6,

                        pointBackgroundColor:
                            "#20b8ff"
                    },

                    {
                        label:
                            "AI Forecast (P50 Expected)",

                        data:
                            p50Data,

                        borderColor:
                            "#a855f7",

                        backgroundColor:
                            "rgba(168,85,247,0.08)",

                        borderDash:
                            [5, 4],

                        tension:
                            0.25,

                        borderWidth:
                            2.5,

                        pointRadius:
                            2,

                        pointHoverRadius:
                            5,

                        pointBackgroundColor:
                            "#a855f7"
                    },

                    {
                        label:
                            "Upper Ceiling (P90)",

                        data:
                            p90Data,

                        borderColor:
                            "rgba(239,68,68,0.55)",

                        borderDash:
                            [3, 3],

                        tension:
                            0.25,

                        borderWidth:
                            1.5,

                        pointRadius:
                            0
                    },

                    {
                        label:
                            "Lower Floor (P10)",

                        data:
                            p10Data,

                        borderColor:
                            "rgba(34,197,94,0.55)",

                        borderDash:
                            [3, 3],

                        tension:
                            0.25,

                        borderWidth:
                            1.5,

                        pointRadius:
                            0
                    }
                ]
            },

            options: {

                responsive:
                    true,

                maintainAspectRatio:
                    false,

                interaction: {

                    mode:
                        "index",

                    intersect:
                        false
                },

                plugins: {

                    legend: {

                        labels: {

                            color:
                                "#9db0c3",

                            font: {

                                size:
                                    10,

                                family:
                                    "Inter, sans-serif"
                            }
                        }
                    },

                    tooltip: {

                        backgroundColor:
                            "rgba(8,20,36,0.95)",

                        titleColor:
                            "#ffffff",

                        bodyColor:
                            "#cbd5e1",

                        borderColor:
                            "rgba(32,184,255,0.3)",

                        borderWidth:
                            1,

                        callbacks: {

                            label:
                                function(context) {

                                    if (
                                        context.raw === null ||
                                        context.raw === undefined
                                    ) {
                                        return null;
                                    }

                                    return `${context.dataset.label}: $${context.raw.toFixed(2)}/MT`;
                                }
                        }
                    }
                },

                scales: {

                    x: {

                        grid: {

                            color:
                                "rgba(255,255,255,0.03)"
                        },

                        ticks: {

                            color:
                                "#6f849a",

                            font: {
                                size: 9.5
                            },

                            maxTicksLimit:
                                12,

                            maxRotation:
                                0
                        }
                    },

                    y: {

                        grid: {

                            color:
                                "rgba(255,255,255,0.05)"
                        },

                        ticks: {

                            color:
                                "#6f849a",

                            font: {
                                size: 9.5
                            },

                            callback:
                                val =>
                                    "$" + val
                        }
                    }
                }
            }
        });
}


/* =====================================================
   FORECAST FILTER
===================================================== */

function onForecastFilterChanged() {

    const routeSelect =
        document.getElementById(
            "forecastRouteSelect"
        );

    const vesselSelect =
        document.getElementById(
            "forecastVesselSelect"
        );

    const horizonSelect =
        document.getElementById(
            "forecastHorizonSelect"
        );

    if (
        !routeSelect ||
        !vesselSelect
    ) {
        return;
    }


    const selectedRoute =
        routeSelect.value;

    const selectedVessel =
        vesselSelect.value;

    const selectedHorizon =
        horizonSelect
            ? parseInt(
                horizonSelect.value
            ) || 30
            : 30;


    loadForecastData(
        selectedRoute,
        selectedVessel,
        selectedHorizon
    );
}


/* =====================================================
   FORECAST EXPLAINABILITY
===================================================== */

function renderForecastExplainability(
    drivers,
    currentRate,
    forecasts
) {

    const driversList =
        document.getElementById(
            "forecastDriversList"
        );

    if (!driversList) return;


    if (
        drivers &&
        drivers.length > 0
    ) {

        driversList.innerHTML =
            "";

        drivers.forEach(d => {

            const pct =
                Math.round(
                    (d.impact || 0) * 100
                );

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "driver-row";

            row.innerHTML = `
                <span>
                    ${d.feature}
                </span>

                <div class="driver-bar-bg">
                    <div
                        class="driver-bar-fill"
                        style="width:${Math.max(
                            5,
                            pct
                        )}%;">
                    </div>
                </div>

                <strong>
                    ${(d.impact * 100).toFixed(1)}%
                </strong>
            `;

            driversList.appendChild(
                row
            );
        });
    }
}


/* =====================================================
   CARGO PLANNER
===================================================== */

function selectContractPreference(
    pref
) {

    const input =
        document.getElementById(
            "cargoContract"
        );

    if (input) {

        input.value =
            pref;
    }


    const btnCoA =
        document.getElementById(
            "btnContractCoA"
        );

    const btnSpot =
        document.getElementById(
            "btnContractSpot"
        );


    if (
        btnCoA &&
        btnSpot
    ) {

        btnCoA.classList.toggle(
            "active",
            pref === "CoA"
        );

        btnSpot.classList.toggle(
            "active",
            pref === "Spot"
        );
    }
}


/* =====================================================
   DATE FORMATTER
===================================================== */

function formatShortDate(
    dateStr
) {

    if (!dateStr) return "";

    const parts =
        dateStr.split("-");

    if (parts.length === 3) {

        const d =
            new Date(
                parseInt(parts[0]),
                parseInt(parts[1]) - 1,
                parseInt(parts[2])
            );

        return d.toLocaleDateString(
            "en-GB",
            {
                day: "numeric",
                month: "short"
            }
        );
    }

    return dateStr;
}


/* =====================================================
   LIVE COST PREVIEW
===================================================== */

let currentEstimatedRate =
    25.96;


function updateLiveCostPreview() {

    const qtyInput =
        document.getElementById(
            "cargoQty"
        );

    const liveCostText =
        document.getElementById(
            "liveCostText"
        );

    const liveCostRate =
        document.getElementById(
            "liveCostRate"
        );


    if (
        !qtyInput ||
        !liveCostText
    ) {
        return;
    }


    const qty =
        parseFloat(
            qtyInput.value
        ) || 0;

    const rate =
        currentEstimatedRate;

    const total =
        qty * rate;


    liveCostText.textContent =
        `$${Math.round(total).toLocaleString()} USD`;


    if (liveCostRate) {

        liveCostRate.textContent =
            `(@ ~$${rate.toFixed(2)}/MT)`;
    }
}


window.updateLiveCostPreview =
    updateLiveCostPreview;


/* =====================================================
   GENERATE PROCUREMENT PLAN
===================================================== */

async function generatePlan() {

    const originElem =
        document.getElementById(
            "cargoOrigin"
        );

    const destElem =
        document.getElementById(
            "cargoDestination"
        );

    const qtyElem =
        document.getElementById(
            "cargoQty"
        );

    const commElem =
        document.getElementById(
            "cargoCommodity"
        );

    const startElem =
        document.getElementById(
            "laycanStart"
        );

    const endElem =
        document.getElementById(
            "laycanEnd"
        );

    const contractElem =
        document.getElementById(
            "cargoContract"
        );

    const btnGen =
        document.getElementById(
            "btnGenerate"
        );


    const commodity =
        commElem
            ? commElem.value
            : "Coking Coal (Prime Hard)";

    const origin =
        originElem
            ? originElem.value
            : "Australia (Hay Point / Gladstone)";

    const destPortId =
        destElem
            ? parseInt(
                destElem.value,
                10
            )
            : 1;

    const quantity =
        qtyElem
            ? parseFloat(
                qtyElem.value
            )
            : 75000;

    const contractPref =
        contractElem
            ? contractElem.value
            : "Spot";

    const startStr =
        startElem &&
        startElem.value
            ? startElem.value
            : "2026-11-12";

    const endStr =
        endElem &&
        endElem.value
            ? endElem.value
            : "2026-11-23";


    if (btnGen) {

        btnGen.innerHTML =
            `<i class="fa-solid fa-spinner fa-spin"></i>
             Generating Recommendation...`;

        btnGen.disabled =
            true;
    }


    try {

        /* ---------------------------------------------
           CREATE CARGO
        --------------------------------------------- */

        const cargoPayload = {

            cargo_type:
                commodity.includes("Coal")
                    ? "Coking Coal"
                    : "Iron Ore",

            quantity:
                quantity,

            origin:
                origin
                    .split("(")[0]
                    .trim(),

            destination_port_id:
                destPortId,

            laycan_start:
                startStr,

            laycan_end:
                endStr,

            contract_preference:
                contractPref
        };


        const cargoRes =
            await fetch(
                `${API_BASE}/cargo`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            cargoPayload
                        )
                }
            );


        if (!cargoRes.ok) {

            throw new Error(
                `Failed to create cargo: ${cargoRes.statusText}`
            );
        }


        const createdCargo =
            await cargoRes.json();

        currentCargoId =
            createdCargo.id;


        /* ---------------------------------------------
           RUN RECOMMENDATION ENGINE
        --------------------------------------------- */

        const recRes =
            await fetch(
                `${API_BASE}/recommendation`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            cargo_id:
                                currentCargoId
                        })
                }
            );


        if (!recRes.ok) {

            throw new Error(
                `Failed to generate recommendation: ${recRes.statusText}`
            );
        }


        const recData =
            await recRes.json();


        /* ---------------------------------------------
           FIXTURE WINDOW
        --------------------------------------------- */

        const fixStart =
            recData.fixture_window?.start ||
            startStr;

        const fixEnd =
            recData.fixture_window?.end ||
            endStr;

        const windowDisplay =
            `${formatShortDate(fixStart)}
             – ${formatShortDate(fixEnd)}`;


        /* ---------------------------------------------
           SCORE
        --------------------------------------------- */

        const scoreEl =
            document.getElementById(
                "recScore"
            );

        if (scoreEl) {

            scoreEl.textContent =
                recData.score || 79;
        }


        /* ---------------------------------------------
           VESSEL CLASS
        --------------------------------------------- */

        const vesselEl =
            document.getElementById(
                "recVesselClass"
            );

        if (vesselEl) {

            vesselEl.textContent =
                (
                    recData.vessel_class ||
                    "PANAMAX"
                ).toUpperCase();
        }


        const vesselDescEl =
            document.getElementById(
                "recVesselDesc"
            );

        if (vesselDescEl) {

            vesselDescEl.textContent =
                "Physically Feasible & Parcel Matched";
        }


        /* ---------------------------------------------
           FIXTURE WINDOW
        --------------------------------------------- */

        const windowEl =
            document.getElementById(
                "recFixtureWindow"
            );

        if (windowEl) {

            windowEl.textContent =
                windowDisplay;
        }


        /* ---------------------------------------------
           CONTRACT STRATEGY
        --------------------------------------------- */

        const stratEl =
            document.getElementById(
                "recStrategy"
            );

        if (stratEl) {

            stratEl.textContent =
                recData.contract_type ||
                contractPref ||
                "CoA";
        }


        const stratDescEl =
            document.getElementById(
                "recStrategyDesc"
            );

        if (stratDescEl) {

            stratDescEl.textContent =
                (
                    recData.contract_type ||
                    contractPref
                ) === "CoA"
                    ? "Multi-Voyage Hedged"
                    : "Single Voyage Index Linked";
        }


        /* ---------------------------------------------
           RISK
        --------------------------------------------- */

        const riskEl =
            document.getElementById(
                "recRiskIndex"
            );

        if (riskEl) {

            riskEl.textContent =
                (
                    recData.risk_level ||
                    "HIGH"
                ).toUpperCase();
        }


        /* ---------------------------------------------
           RATE FORECAST
        --------------------------------------------- */

        if (recData.rate) {

            const p10 =
                recData.rate.p10 !== undefined
                    ? recData.rate.p10
                    : 23.60;

            const p50 =
                recData.rate.p50 !== undefined
                    ? recData.rate.p50
                    : 25.96;

            const p90 =
                recData.rate.p90 !== undefined
                    ? recData.rate.p90
                    : 31.57;


            currentEstimatedRate =
                p50;


            const p10El =
                document.getElementById(
                    "recP10"
                );

            const p50El =
                document.getElementById(
                    "recP50"
                );

            const p90El =
                document.getElementById(
                    "recP90"
                );


            if (p10El) {

                p10El.textContent =
                    `$${p10.toFixed(2)}`;
            }

            if (p50El) {

                p50El.textContent =
                    `$${p50.toFixed(2)}`;
            }

            if (p90El) {

                p90El.textContent =
                    `$${p90.toFixed(2)}`;
            }


            /* -----------------------------------------
               TOTAL OUTLAY
            ----------------------------------------- */

            const totalP50 =
                quantity * p50;

            const totalP10 =
                quantity * p10;

            const totalP90 =
                quantity * p90;


            const basisTag =
                document.getElementById(
                    "costBasisTag"
                );

            if (basisTag) {

                basisTag.textContent =
                    `${quantity.toLocaleString()}
                     MT @ $${p50.toFixed(2)} / MT`;
            }


            const totalExpEl =
                document.getElementById(
                    "totalCostExpected"
                );

            if (totalExpEl) {

                totalExpEl.innerHTML =
                    `$${Math.round(
                        totalP50
                    ).toLocaleString()}
                    <small>USD</small>`;
            }


            const totalHumanEl =
                document.getElementById(
                    "totalCostHuman"
                );

            if (totalHumanEl) {

                const millionVal =
                    (
                        totalP50 /
                        1000000
                    ).toFixed(2);

                totalHumanEl.textContent =
                    `Approx. $${millionVal} Million USD
                     for ${quantity.toLocaleString()} MT voyage fixture`;
            }


            /* -----------------------------------------
               P10 SCENARIO
            ----------------------------------------- */

            const costP10El =
                document.getElementById(
                    "costP10Amount"
                );

            const costP10RateEl =
                document.getElementById(
                    "costP10Rate"
                );

            const costP10DiffEl =
                document.getElementById(
                    "costP10Diff"
                );


            if (costP10El) {

                costP10El.textContent =
                    `$${Math.round(
                        totalP10
                    ).toLocaleString()}`;
            }


            if (costP10RateEl) {

                costP10RateEl.textContent =
                    `@ $${p10.toFixed(2)} / MT`;
            }


            if (costP10DiffEl) {

                const diff =
                    totalP50 -
                    totalP10;

                const pct =
                    (
                        (p50 - p10) /
                        p50
                    ) * 100;

                costP10DiffEl.textContent =
                    `-$${Math.round(
                        diff
                    ).toLocaleString()}
                     (-${pct.toFixed(1)}%)`;
            }


            /* -----------------------------------------
               P50 SCENARIO
            ----------------------------------------- */

            const costP50El =
                document.getElementById(
                    "costP50Amount"
                );

            const costP50RateEl =
                document.getElementById(
                    "costP50Rate"
                );


            if (costP50El) {

                costP50El.textContent =
                    `$${Math.round(
                        totalP50
                    ).toLocaleString()}`;
            }


            if (costP50RateEl) {

                costP50RateEl.textContent =
                    `@ $${p50.toFixed(2)} / MT`;
            }


            /* -----------------------------------------
               P90 SCENARIO
            ----------------------------------------- */

            const costP90El =
                document.getElementById(
                    "costP90Amount"
                );

            const costP90RateEl =
                document.getElementById(
                    "costP90Rate"
                );

            const costP90DiffEl =
                document.getElementById(
                    "costP90Diff"
                );


            if (costP90El) {

                costP90El.textContent =
                    `$${Math.round(
                        totalP90
                    ).toLocaleString()}`;
            }


            if (costP90RateEl) {

                costP90RateEl.textContent =
                    `@ $${p90.toFixed(2)} / MT`;
            }


            if (costP90DiffEl) {

                const diff =
                    totalP90 -
                    totalP50;

                const pct =
                    (
                        (p90 - p50) /
                        p50
                    ) * 100;

                costP90DiffEl.textContent =
                    `+$${Math.round(
                        diff
                    ).toLocaleString()}
                     (+${pct.toFixed(1)}%)`;
            }


            /* -----------------------------------------
               CONTRACT HEDGING
            ----------------------------------------- */

            const hedgingTitle =
                document.getElementById(
                    "costHedgingTitle"
                );

            const hedgingText =
                document.getElementById(
                    "costHedgingText"
                );

            const isCoA =
                (
                    recData.contract_type ||
                    contractPref
                ) === "CoA";


            if (
                hedgingTitle &&
                hedgingText
            ) {

                if (isCoA) {

                    hedgingTitle.textContent =
                        "CoA Strategy Value";

                    const estSavings =
                        Math.round(
                            quantity * 2.20
                        );

                    hedgingText.textContent =
                        `CoA Volume Rate hedges
                         ~$${estSavings.toLocaleString()}
                         USD vs. spot peak`;

                } else {

                    hedgingTitle.textContent =
                        "Spot Strategy Profile";

                    hedgingText.textContent =
                        "Single voyage fixture; fully captures any short-term freight rate declines";
                }
            }


            updateLiveCostPreview();
        }


        /* ---------------------------------------------
           RATIONALE
        --------------------------------------------- */

        const rationaleUl =
            document.getElementById(
                "recRationaleList"
            );

        if (
            rationaleUl &&
            recData.reasons &&
            recData.reasons.length > 0
        ) {

            rationaleUl.innerHTML =
                "";

            recData.reasons.forEach(
                reason => {

                    const li =
                        document.createElement(
                            "li"
                        );

                    li.innerHTML =
                        `<i class="fa-solid fa-check text-green"></i>
                         <span>${reason}</span>`;

                    rationaleUl.appendChild(
                        li
                    );
                }
            );
        }


        currentVesselClass =
            recData.vessel_class ||
            "Panamax";


        await renderRankedVessels();


    } catch (err) {

        console.error(
            "Plan generation error:",
            err
        );


        /* ---------------------------------------------
           PHYSICAL COMPATIBILITY FALLBACK
        --------------------------------------------- */

        const compRes =
            await fetch(
                `${API_BASE}/compatibility`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            cargo_quantity:
                                quantity,

                            destination_port_id:
                                destPortId
                        })
                }
            )
            .catch(
                () => null
            );


        if (
            compRes &&
            compRes.ok
        ) {

            const compData =
                await compRes.json();


            const vesselEl =
                document.getElementById(
                    "recVesselClass"
                );

            if (vesselEl) {

                vesselEl.innerHTML =
                    `<span style="color:#ef4444;font-size:16px;">
                        PHYSICALLY INFEASIBLE
                     </span>`;
            }


            const vesselDescEl =
                document.getElementById(
                    "recVesselDesc"
                );

            if (vesselDescEl) {

                vesselDescEl.textContent =
                    "Berth / Draft Constraints Exceeded";
            }


            const scoreEl =
                document.getElementById(
                    "recScore"
                );

            if (scoreEl) {

                scoreEl.textContent =
                    "0";
            }


            const riskEl =
                document.getElementById(
                    "recRiskIndex"
                );

            if (riskEl) {

                riskEl.textContent =
                    "CRITICAL";
            }


            const rationaleUl =
                document.getElementById(
                    "recRationaleList"
                );


            if (
                rationaleUl &&
                compData.excluded_vessels &&
                compData.excluded_vessels.length > 0
            ) {

                rationaleUl.innerHTML =
                    "";

                compData.excluded_vessels.forEach(
                    ex => {

                        const li =
                            document.createElement(
                                "li"
                            );

                        li.innerHTML =
                            `<i class="fa-solid fa-triangle-exclamation"
                                style="color:#ef4444;"></i>
                             <span>
                                <strong>
                                    ${ex.vessel_class}
                                    Excluded:
                                </strong>
                                ${ex.reason}
                             </span>`;

                        rationaleUl.appendChild(
                            li
                        );
                    }
                );
            }
        }


        await renderRankedVessels();


    } finally {

        if (btnGen) {

            btnGen.innerHTML =
                "Generate Recommendation";

            btnGen.disabled =
                false;
        }
    }
}/* =====================================================
   VESSEL RECOMMENDATION ENGINE
===================================================== */

async function renderRankedVessels() {

    const container =
        document.getElementById(
            "rankedVesselsContainer"
        ) ||
        document.getElementById(
            "vesselRecommendations"
        );

    if (!container) return;


    const qtyElem =
        document.getElementById(
            "cargoQty"
        );

    const destElem =
        document.getElementById(
            "cargoDestination"
        );


    const quantity =
        qtyElem
            ? parseFloat(
                qtyElem.value
            ) || 75000
            : 75000;

    const destinationPortId =
        destElem
            ? parseInt(
                destElem.value
            ) || 1
            : 1;


    container.innerHTML = `
        <div style="
            padding:35px;
            text-align:center;
            color:var(--muted);
        ">
            <i class="fa-solid fa-spinner fa-spin"
               style="font-size:26px;color:#20b8ff;">
            </i>

            <div style="margin-top:12px;">
                Running physical feasibility
                & AI vessel ranking...
            </div>
        </div>
    `;


    try {

        const res =
            await authFetch(
                `${API_BASE}/recommend-vessels`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            cargo_quantity:
                                quantity,

                            destination_port_id:
                                destinationPortId
                        })
                }
            );


        if (!res.ok) {

            throw new Error(
                `Vessel recommendation failed: ${res.status}`
            );
        }


        const data =
            await res.json();


        const vessels =
            data.vessels ||
            data.recommendations ||
            [];


        if (!vessels.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-ship"></i>

                    <h3>
                        No Physically Compatible Vessels
                    </h3>

                    <p>
                        No vessel in the current fleet
                        satisfies the destination port
                        draft, LOA, beam and cargo
                        requirements.
                    </p>
                </div>
            `;

            return;
        }


        container.innerHTML =
            "";


        vessels.forEach(
            (vessel, index) => {

                const score =
                    Number(
                        vessel.score ??
                        vessel.match_score ??
                        vessel.recommendation_score ??
                        0
                    );


                const scoreClass =
                    score >= 90
                        ? "excellent"
                        : score >= 75
                            ? "good"
                            : "warning";


                const availability =
                    vessel.availability_status ||
                    vessel.operational_status ||
                    "AVAILABLE";


                const reasons =
                    Array.isArray(
                        vessel.reasons
                    )
                        ? vessel.reasons
                        : [];


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "vessel-card";


                if (index === 0) {

                    card.classList.add(
                        "recommended"
                    );
                }


                card.innerHTML = `
                    <div class="vessel-card-header">

                        <div>

                            <div class="vessel-rank">
                                #${index + 1}
                            </div>

                            <h3>
                                ${vessel.vessel_name ||
                                vessel.name ||
                                "Unnamed Vessel"}
                            </h3>

                            <span class="badge-tag blue">
                                ${vessel.vessel_class ||
                                "Panamax"}
                            </span>

                        </div>


                        <div class="vessel-score ${scoreClass}">

                            <strong>
                                ${score.toFixed(1)}
                            </strong>

                            <small>
                                MATCH
                            </small>

                        </div>

                    </div>


                    <div class="vessel-metrics">

                        <div>
                            <span>DWT</span>
                            <strong>
                                ${Number(
                                    vessel.dwt ||
                                    0
                                ).toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Draft</span>
                            <strong>
                                ${Number(
                                    vessel.draft ||
                                    0
                                ).toFixed(1)}m
                            </strong>
                        </div>

                        <div>
                            <span>LOA</span>
                            <strong>
                                ${Number(
                                    vessel.loa ||
                                    vessel.length ||
                                    0
                                ).toFixed(1)}m
                            </strong>
                        </div>

                        <div>
                            <span>Beam</span>
                            <strong>
                                ${Number(
                                    vessel.beam ||
                                    0
                                ).toFixed(1)}m
                            </strong>
                        </div>

                    </div>


                    <div class="vessel-availability">

                        <i class="fa-solid fa-calendar-check"></i>

                        <span>
                            ${availability}
                        </span>

                    </div>


                    ${
                        reasons.length
                            ? `
                                <div class="vessel-reasons">

                                    ${reasons
                                        .slice(0, 5)
                                        .map(
                                            reason =>
                                                `
                                                <div>
                                                    <i class="fa-solid fa-check"></i>
                                                    ${reason}
                                                </div>
                                                `
                                        )
                                        .join("")}

                                </div>
                              `
                            : ""
                    }


                    <button
                        class="btn-action-primary"
                        onclick='selectRecommendedVessel(${JSON.stringify(
                            vessel
                        )})'
                    >

                        <i class="fa-solid fa-file-signature"></i>

                        Select Vessel

                    </button>

                `;


                container.appendChild(
                    card
                );
            }
        );


    } catch (err) {

        console.error(
            "Vessel ranking error:",
            err
        );


        container.innerHTML = `
            <div class="empty-state">

                <i class="fa-solid fa-triangle-exclamation"
                   style="color:#ef4444;">
                </i>

                <h3>
                    Vessel Engine Error
                </h3>

                <p>
                    ${escapeHtml(
                        err.message
                    )}
                </p>

            </div>
        `;
    }
}


window.renderRankedVessels =
    renderRankedVessels;


/* =====================================================
   SELECT RECOMMENDED VESSEL
===================================================== */

function selectRecommendedVessel(
    vessel
) {

    window.selectedFreightIQVessel =
        vessel;


    const name =
        vessel.vessel_name ||
        vessel.name ||
        "Selected Vessel";


    const message =
        `${name} selected as candidate vessel.`;


    /* Update visible selection */

    const selectedName =
        document.getElementById(
            "selectedVesselName"
        );

    if (selectedName) {

        selectedName.textContent =
            name;
    }


    const selectedClass =
        document.getElementById(
            "selectedVesselClass"
        );

    if (selectedClass) {

        selectedClass.textContent =
            vessel.vessel_class ||
            "Panamax";
    }


    const selectedDraft =
        document.getElementById(
            "selectedVesselDraft"
        );

    if (selectedDraft) {

        selectedDraft.textContent =
            `${Number(
                vessel.draft || 0
            ).toFixed(1)} m`;
    }


    /* Open fixture page */

    if (
        document.getElementById(
            "fixtureVesselSelect"
        )
    ) {

        showPage(
            "fixtureMgmt"
        );


        const select =
            document.getElementById(
                "fixtureVesselSelect"
            );


        if (select) {

            const vesselId =
                vessel.vessel_id ??
                vessel.id;


            let found =
                false;


            Array.from(
                select.options
            ).forEach(
                option => {

                    if (
                        Number(
                            option.value
                        ) ===
                        Number(
                            vesselId
                        )
                    ) {

                        select.value =
                            vesselId;

                        found =
                            true;
                    }
                }
            );


            if (
                !found &&
                vesselId
            ) {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    vesselId;

                option.textContent =
                    `${name} (${vessel.vessel_class || "Panamax"})`;

                select.appendChild(
                    option
                );

                select.value =
                    vesselId;
            }
        }
    }


    /* Notification */

    if (
        typeof showToast ===
        "function"
    ) {

        showToast(
            message,
            "success"
        );

    } else {

        console.log(
            message
        );
    }
}


window.selectRecommendedVessel =
    selectRecommendedVessel;


/* =====================================================
   COA SIMULATOR
===================================================== */

async function runCoASimulation() {

    const qtyElem =
        document.getElementById(
            "coaQty"
        );

    const spotElem =
        document.getElementById(
            "spotRate"
        );

    const coaElem =
        document.getElementById(
            "coaRate"
        );


    const quantity =
        qtyElem
            ? parseFloat(
                qtyElem.value
            ) || 500000
            : 500000;


    const spotRate =
        spotElem
            ? parseFloat(
                spotElem.value
            ) || 24.5
            : 24.5;


    const coaRate =
        coaElem
            ? parseFloat(
                coaElem.value
            ) || 22.8
            : 22.8;


    const spotCost =
        quantity *
        spotRate;


    const coaCost =
        quantity *
        coaRate;


    const savings =
        spotCost -
        coaCost;


    const savingsPct =
        spotCost > 0
            ? (
                savings /
                spotCost
            ) * 100
            : 0;


    const spotCostEl =
        document.getElementById(
            "coaSpotCost"
        );

    const coaCostEl =
        document.getElementById(
            "coaContractCost"
        );

    const savingsEl =
        document.getElementById(
            "coaSavings"
        );

    const savingsPctEl =
        document.getElementById(
            "coaSavingsPct"
        );


    if (spotCostEl) {

        spotCostEl.textContent =
            `$${Math.round(
                spotCost
            ).toLocaleString()}`;
    }


    if (coaCostEl) {

        coaCostEl.textContent =
            `$${Math.round(
                coaCost
            ).toLocaleString()}`;
    }


    if (savingsEl) {

        savingsEl.textContent =
            `$${Math.round(
                savings
            ).toLocaleString()}`;
    }


    if (savingsPctEl) {

        savingsPctEl.textContent =
            `${savingsPct.toFixed(1)}%`;
    }


    const verdict =
        document.getElementById(
            "coaVerdict"
        );


    if (verdict) {

        if (savings > 0) {

            verdict.textContent =
                "CoA Advantage";

            verdict.style.color =
                "#22c55e";

        } else {

            verdict.textContent =
                "Spot Advantage";

            verdict.style.color =
                "#20b8ff";
        }
    }
}


window.runCoASimulation =
    runCoASimulation;


/* =====================================================
   PORT EXPLORER
===================================================== */

function selectPort(
    portName
) {

    if (!portsCache.length) {
        return;
    }


    const port =
        portsCache.find(
            p =>
                p.name.toLowerCase() ===
                portName.toLowerCase()
        );


    if (!port) return;


    const nameEl =
        document.getElementById(
            "selectedPortName"
        );

    const draftEl =
        document.getElementById(
            "selectedPortDraft"
        );

    const loaEl =
        document.getElementById(
            "selectedPortLOA"
        );

    const beamEl =
        document.getElementById(
            "selectedPortBeam"
        );

    const handlingEl =
        document.getElementById(
            "selectedPortHandling"
        );

    const congestionEl =
        document.getElementById(
            "selectedPortCongestion"
        );

    const lighteringEl =
        document.getElementById(
            "selectedPortLightering"
        );


    if (nameEl) {

        nameEl.textContent =
            port.name;
    }


    if (draftEl) {

        draftEl.textContent =
            `${port.max_draft} m`;
    }


    if (loaEl) {

        loaEl.textContent =
            `${port.max_loa || "-"} m`;
    }


    if (beamEl) {

        beamEl.textContent =
            `${port.max_beam || "-"} m`;
    }


    if (handlingEl) {

        handlingEl.textContent =
            `${port.handling_rate || "-"} MT/hr`;
    }


    if (congestionEl) {

        const congestion =
            Number(
                port.congestion_index ||
                0
            );


        congestionEl.textContent =
            `${Math.round(
                congestion * 100
            )}%`;


        congestionEl.style.color =
            congestion >= 0.7
                ? "#ef4444"
                : congestion >= 0.4
                    ? "#f59e0b"
                    : "#22c55e";
    }


    if (lighteringEl) {

        lighteringEl.textContent =
            port.lightering_available
                ? "AVAILABLE"
                : "NOT AVAILABLE";

        lighteringEl.style.color =
            port.lightering_available
                ? "#22c55e"
                : "#ef4444";
    }


    /* -------------------------------------------------
       Highlight selected port
    ------------------------------------------------- */

    document
        .querySelectorAll(
            ".port-list button"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.textContent
                        .toLowerCase()
                        .includes(
                            port.name.toLowerCase()
                        )
                );
            }
        );


    /* -------------------------------------------------
       Move map
    ------------------------------------------------- */

    if (
        portMapInstance &&
        port.latitude !== undefined &&
        port.longitude !== undefined
    ) {

        portMapInstance.setView(
            [
                port.latitude,
                port.longitude
            ],
            8,
            {
                animate: true
            }
        );


        const marker =
            portMarkers[
                port.id
            ];


        if (marker) {

            marker.openPopup();
        }
    }
}


window.selectPort =
    selectPort;


/* =====================================================
   LEAFLET PORT MAP
===================================================== */

function initPortMap() {

    const mapElement =
        document.getElementById(
            "portMap"
        );


    if (
        !mapElement ||
        typeof L ===
            "undefined"
    ) {
        return;
    }


    if (portMapInstance) {

        portMapInstance.remove();
    }


    portMapInstance =
        L.map(
            mapElement,
            {
                zoomControl:
                    true
            }
        ).setView(
            [
                17.0,
                82.0
            ],
            5
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(
        portMapInstance
    );


    renderPortMarkers();
}


function renderPortMarkers() {

    if (
        !portMapInstance ||
        !portsCache.length
    ) {
        return;
    }


    Object.values(
        portMarkers
    ).forEach(
        marker =>
            marker.remove()
    );


    portMarkers =
        {};


    portsCache.forEach(
        port => {

            if (
                port.latitude ===
                    undefined ||
                port.longitude ===
                    undefined
            ) {
                return;
            }


            const marker =
                L.marker(
                    [
                        port.latitude,
                        port.longitude
                    ]
                ).addTo(
                    portMapInstance
                );


            marker.bindPopup(`
                <div style="
                    min-width:180px;
                    color:#0f172a;
                ">

                    <strong>
                        ${port.name}
                    </strong>

                    <br>

                    Max Draft:
                    ${port.max_draft}m

                    <br>

                    Max LOA:
                    ${port.max_loa || "-"}m

                    <br>

                    Max Beam:
                    ${port.max_beam || "-"}m

                </div>
            `);


            portMarkers[
                port.id
            ] =
                marker;
        }
    );
}


window.initPortMap =
    initPortMap;


/* =====================================================
   USER PROFILE
===================================================== */

function initUserProfile() {

    const profileName =
        document.getElementById(
            "profileName"
        );

    const profileRole =
        document.getElementById(
            "profileRole"
        );


    try {

        const userStr =
            localStorage.getItem(
                "freightiq_user"
            );


        if (!userStr) return;


        const user =
            JSON.parse(
                userStr
            );


        if (profileName) {

            profileName.textContent =
                user.name ||
                user.username ||
                "FreightIQ User";
        }


        if (profileRole) {

            profileRole.textContent =
                user.role ||
                "Logistics Manager";
        }


    } catch (e) {

        console.warn(
            "Profile initialization failed:",
            e
        );
    }
}


window.initUserProfile =
    initUserProfile;


/* =====================================================
   ROLE SWITCHING
===================================================== */

function switchUserRole(
    role
) {

    try {

        const existing =
            localStorage.getItem(
                "freightiq_user"
            );


        const user =
            existing
                ? JSON.parse(existing)
                : {};


        user.role =
            role;


        localStorage.setItem(
            "freightiq_user",
            JSON.stringify(user)
        );


        initUserProfile();


        /* Role-specific landing page */

        if (
            role ===
            "Chartering Officer"
        ) {

            showPage(
                "charteringOps"
            );

        } else if (
            role ===
            "Market Analyst"
        ) {

            showPage(
                "analystOverview"
            );

        } else {

            showPage(
                "dashboard"
            );
        }


    } catch (e) {

        console.error(
            "Role switch error:",
            e
        );
    }
}


window.switchUserRole =
    switchUserRole;


/* =====================================================
   UKC NAVIGATION CALCULATOR
===================================================== */

function calculateUKC() {

    const vesselDraftInput =
        document.getElementById(
            "ukcVesselDraft"
        );

    const portDraftInput =
        document.getElementById(
            "ukcPortDraft"
        );

    const tideInput =
        document.getElementById(
            "ukcTide"
        );

    const squatInput =
        document.getElementById(
            "ukcSquat"
        );


    const vesselDraft =
        vesselDraftInput
            ? parseFloat(
                vesselDraftInput.value
            ) || 14.5
            : 14.5;


    const portDraft =
        portDraftInput
            ? parseFloat(
                portDraftInput.value
            ) || 17.1
            : 17.1;


    const tide =
        tideInput
            ? parseFloat(
                tideInput.value
            ) || 1.2
            : 1.2;


    const squat =
        squatInput
            ? parseFloat(
                squatInput.value
            ) || 0.3
            : 0.3;


    const effectiveDraft =
        portDraft +
        tide;


    const ukcMargin =
        effectiveDraft -
        vesselDraft -
        squat;


    const badgeEl =
        document.getElementById(
            "ukcStatusBadge"
        );

    const descEl =
        document.getElementById(
            "ukcDescription"
        );

    const barEl =
        document.getElementById(
            "ukcBarFill"
        );


    if (
        !badgeEl ||
        !descEl ||
        !barEl
    ) {
        return;
    }


    if (ukcMargin >= 1.0) {

        badgeEl.className =
            "ukc-status-badge safe";

        badgeEl.innerHTML =
            `<i class="fa-solid fa-circle-check"></i>
             SAFE NAVIGATION MARGIN`;

        descEl.textContent =
            `Safe: UKC margin is +${ukcMargin.toFixed(
                1
            )}m after tide and squat allowance.`;

        barEl.className =
            "ukc-bar-fill safe";

        barEl.style.width =
            `${Math.min(
                100,
                Math.max(
                    20,
                    (ukcMargin / 5) * 100
                )
            )}%`;

    } else if (
        ukcMargin >= 0
    ) {

        badgeEl.className =
            "ukc-status-badge marginal";

        badgeEl.innerHTML =
            `<i class="fa-solid fa-triangle-exclamation"></i>
             MARGINAL (TIDAL WINDOW)`;

        descEl.textContent =
            `Caution: Clearance margin is narrow (+${ukcMargin.toFixed(
                1
            )}m). Vessel requires high-water tidal window clearance and harbor tug escort.`;

        barEl.className =
            "ukc-bar-fill marginal";

        barEl.style.width =
            "40%";

    } else {

        badgeEl.className =
            "ukc-status-badge prohibited";

        badgeEl.innerHTML =
            `<i class="fa-solid fa-ban"></i>
             PROHIBITED (DRAFT EXCEEDED)`;

        descEl.textContent =
            `Vessel arrival draft (${vesselDraft.toFixed(
                1
            )}m) exceeds effective port envelope (${effectiveDraft.toFixed(
                1
            )}m) by ${Math.abs(
                ukcMargin
            ).toFixed(
                1
            )}m. Direct calling prohibited; offshore lightering required.`;

        barEl.className =
            "ukc-bar-fill prohibited";

        barEl.style.width =
            "100%";
    }
}


window.calculateUKC =
    calculateUKC;


/* =====================================================
   HACKATHON QUICK DEMO SCENARIOS
===================================================== */

async function loadDemoScenario(
    scenarioNum
) {

    if (
        scenarioNum ===
        1
    ) {

        showPage(
            "cargo"
        );


        const commSelect =
            document.getElementById(
                "cargoCommodity"
            );

        const originSelect =
            document.getElementById(
                "cargoOrigin"
            );

        const destSelect =
            document.getElementById(
                "cargoDestination"
            );

        const qtyInput =
            document.getElementById(
                "cargoQty"
            );

        const startInput =
            document.getElementById(
                "laycanStart"
            );

        const endInput =
            document.getElementById(
                "laycanEnd"
            );


        if (commSelect)
            commSelect.value =
                "Coking Coal (Prime Hard)";


        if (originSelect)
            originSelect.value =
                "Australia (Hay Point / Gladstone)";


        if (qtyInput)
            qtyInput.value =
                "75000";


        if (startInput)
            startInput.value =
                "2026-11-12";


        if (endInput)
            endInput.value =
                "2026-11-23";


        selectContractPreference(
            "Spot"
        );


        if (
            destSelect &&
            portsCache.length > 0
        ) {

            const paradip =
                portsCache.find(
                    p =>
                        p.name
                            .toLowerCase() ===
                        "paradip"
                ) ||
                portsCache[0];


            destSelect.value =
                paradip.id;
        }


        await generatePlan();


    } else if (
        scenarioNum ===
        2
    ) {

        showPage(
            "cargo"
        );


        const commSelect =
            document.getElementById(
                "cargoCommodity"
            );

        const originSelect =
            document.getElementById(
                "cargoOrigin"
            );

        const destSelect =
            document.getElementById(
                "cargoDestination"
            );

        const qtyInput =
            document.getElementById(
                "cargoQty"
            );


        if (commSelect)
            commSelect.value =
                "Coking Coal (Prime Hard)";


        if (originSelect)
            originSelect.value =
                "Australia (Hay Point / Gladstone)";


        if (qtyInput)
            qtyInput.value =
                "75000";


        if (
            destSelect &&
            portsCache.length > 0
        ) {

            const haldia =
                portsCache.find(
                    p =>
                        p.name
                            .toLowerCase()
                            .includes(
                                "haldia"
                            )
                );


            if (haldia)
                destSelect.value =
                    haldia.id;
        }


        await generatePlan();


    } else if (
        scenarioNum ===
        3
    ) {

        const commSelect =
            document.getElementById(
                "cargoCommodity"
            );

        const originSelect =
            document.getElementById(
                "cargoOrigin"
            );

        const destSelect =
            document.getElementById(
                "cargoDestination"
            );

        const qtyInput =
            document.getElementById(
                "cargoQty"
            );


        if (commSelect)
            commSelect.value =
                "Thermal Coal (Indonesian 4200 GAR)";


        if (originSelect)
            originSelect.value =
                "Indonesia (Taboneo / Samarinda)";


        if (qtyInput)
            qtyInput.value =
                "55000";


        if (
            destSelect &&
            portsCache.length > 0
        ) {

            const vizag =
                portsCache.find(
                    p =>
                        p.name
                            .toLowerCase()
                            .includes(
                                "visakhapatnam"
                            ) ||
                        p.name
                            .toLowerCase()
                            .includes(
                                "vizag"
                            )
                );


            if (vizag)
                destSelect.value =
                    vizag.id;
        }


        showPage(
            "coa"
        );


        const qtyElem =
            document.getElementById(
                "coaQty"
            );

        const spotElem =
            document.getElementById(
                "spotRate"
            );

        const coaElem =
            document.getElementById(
                "coaRate"
            );


        if (qtyElem)
            qtyElem.value =
                "500000";


        if (spotElem)
            spotElem.value =
                "24.5";


        if (coaElem)
            coaElem.value =
                "22.8";


        await runCoASimulation();

        await renderRankedVessels();
    }
}


window.loadDemoScenario =
    loadDemoScenario;


/* =====================================================
   UTILITY: HTML ESCAPE
===================================================== */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =====================================================
   TOAST NOTIFICATION
===================================================== */

function showToast(
    message,
    type = "info"
) {

    let toast =
        document.getElementById(
            "freightIqToast"
        );


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );

        toast.id =
            "freightIqToast";


        toast.style.position =
            "fixed";

        toast.style.right =
            "24px";

        toast.style.bottom =
            "24px";

        toast.style.zIndex =
            "99999";

        toast.style.padding =
            "14px 18px";

        toast.style.borderRadius =
            "10px";

        toast.style.fontSize =
            "13px";

        toast.style.fontWeight =
            "600";

        toast.style.boxShadow =
            "0 10px 30px rgba(0,0,0,.35)";


        document.body.appendChild(
            toast
        );
    }


    toast.textContent =
        message;


    if (
        type ===
        "success"
    ) {

        toast.style.background =
            "#123b2a";

        toast.style.color =
            "#86efac";

    } else if (
        type ===
        "error"
    ) {

        toast.style.background =
            "#431c24";

        toast.style.color =
            "#fca5a5";

    } else {

        toast.style.background =
            "#102b40";

        toast.style.color =
            "#7dd3fc";
    }


    toast.style.opacity =
        "1";


    clearTimeout(
        window.__freightIqToastTimer
    );


    window.__freightIqToastTimer =
        setTimeout(
            () => {

                toast.style.opacity =
                    "0";

            },
            3000
        );
}


window.showToast =
    showToast;


/* =====================================================
   EVENT LISTENERS & STARTUP
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        showPage(
            "dashboard"
        );


        initUserProfile();


        initAppData();


        updateLiveCostPreview();


        calculateUKC();


        runCoASimulation();


        /* ---------------------------------------------
           Cargo Wizard Inputs
        --------------------------------------------- */

        const wizardInputs = [
            "cargoQty",
            "cargoDestination",
            "cargoOrigin",
            "cargoCommodity"
        ];


        wizardInputs.forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );


                if (!el) return;


                el.addEventListener(
                    "change",
                    () =>
                        renderRankedVessels()
                );


                if (
                    id ===
                    "cargoQty"
                ) {

                    el.addEventListener(
                        "input",
                        () =>
                            renderRankedVessels()
                    );
                }
            }
        );


        /* ---------------------------------------------
           Chart Range
        --------------------------------------------- */

        const rangeSelect =
            document.getElementById(
                "chartRange"
            );


        if (rangeSelect) {

            rangeSelect.addEventListener(
                "change",
                () =>
                    loadMarketData()
            );
        }


        /* ---------------------------------------------
           Hover Feedback
        --------------------------------------------- */

        document
            .querySelectorAll(
                ".stat-card, .vessel-card, .forecast-card"
            )
            .forEach(
                card => {

                    card.addEventListener(
                        "mouseenter",
                        () => {

                            card.style.transition =
                                "all 0.3s ease";
                        }
                    );
                }
            );


        /* ---------------------------------------------
           Fixture Buttons
        --------------------------------------------- */

        document
            .querySelectorAll(
                ".select-btn"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        function() {

                            const oldText =
                                this.innerHTML;


                            this.innerHTML =
                                `<i class="fa-solid fa-check"></i>
                                 Fixture Confirmed`;


                            this.style.background =
                                "#22c55e";


                            setTimeout(
                                () => {

                                    this.innerHTML =
                                        oldText;

                                    this.style.background =
                                        "";

                                },
                                2000
                            );
                        }
                    );
                }
            );


        /* ---------------------------------------------
           Navigation Safety
        --------------------------------------------- */

        const navInputs = [
            "ukcVesselDraft",
            "ukcPortDraft",
            "ukcTide",
            "ukcSquat"
        ];


        navInputs.forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );


                if (el) {

                    el.addEventListener(
                        "input",
                        calculateUKC
                    );
                }
            }
        );


        /* ---------------------------------------------
           CoA Live Simulation
        --------------------------------------------- */

        [
            "coaQty",
            "spotRate",
            "coaRate"
        ].forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );


                if (el) {

                    el.addEventListener(
                        "input",
                        runCoASimulation
                    );
                }
            }
        );
    }
);/* ============================================================
   FREIGHTIQ — AI CHARTERING COPILOT
   ============================================================

   Purpose:
   - Send natural-language cargo requests to the backend
   - Parse the AI recommendation
   - Display ONE authoritative final vessel
   - Display freight intelligence
   - Display route risk + mitigation
   - Display ranked alternatives
   ============================================================ */


/* ------------------------------------------------------------
   COPILOT STATE
------------------------------------------------------------ */

let copilotLastResult = null;


/* ------------------------------------------------------------
   EXAMPLE PROMPT
------------------------------------------------------------ */

function useCopilotExample(message) {

    const input =
        document.getElementById(
            "copilotMessage"
        );

    if (!input) return;


    input.value =
        message;


    input.focus();


    input.dispatchEvent(
        new Event(
            "input",
            {
                bubbles: true
            }
        )
    );
}


window.useCopilotExample =
    useCopilotExample;


/* ------------------------------------------------------------
   SUBMIT COPILOT CHAT
------------------------------------------------------------ */

async function submitCopilotChat() {

    const input =
        document.getElementById(
            "copilotMessage"
        );

    const sendBtn =
        document.getElementById(
            "copilotSendBtn"
        );

    const loading =
        document.getElementById(
            "copilotLoading"
        );

    const emptyState =
        document.getElementById(
            "copilotEmptyState"
        );

    const result =
        document.getElementById(
            "copilotResult"
        );


    if (!input) {
        console.error(
            "copilotMessage element not found"
        );
        return;
    }


    const message =
        input.value.trim();


    if (!message) {

        showCopilotError(
            "Please describe your cargo requirement first."
        );

        return;
    }


    /* --------------------------------------------------------
       Loading State
    -------------------------------------------------------- */

    if (loading) {

        loading.style.display =
            "flex";
    }


    if (emptyState) {

        emptyState.style.display =
            "none";
    }


    if (result) {

        result.style.display =
            "none";
    }


    if (sendBtn) {

        sendBtn.disabled =
            true;

        sendBtn.innerHTML =
            `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Analyzing...
            `;
    }


    try {

        const response =
            await authFetch(
                `${API_BASE}/copilot/chat`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            message:
                                message
                        })
                }
            );


        if (!response.ok) {

            let errorMessage =
                `Copilot request failed (${response.status})`;


            try {

                const errorData =
                    await response.json();


                if (
                    errorData.detail
                ) {

                    errorMessage =
                        errorData.detail;
                }

            } catch (_) {
                /* Ignore JSON parsing failure */
            }


            throw new Error(
                errorMessage
            );
        }


        const data =
            await response.json();


        copilotLastResult =
            data;


        renderCopilotResult(
            data
        );


    } catch (error) {

        console.error(
            "Copilot error:",
            error
        );


        showCopilotError(
            error.message ||
            "Unable to process the chartering request."
        );

    } finally {

        if (loading) {

            loading.style.display =
                "none";
        }


        if (sendBtn) {

            sendBtn.disabled =
                false;

            sendBtn.innerHTML =
                `
                <i class="fa-solid fa-paper-plane"></i>
                Analyze Requirement
                `;
        }
    }
}


window.submitCopilotChat =
    submitCopilotChat;


/* ------------------------------------------------------------
   COMPATIBILITY ALIAS
   ------------------------------------------------------------ */

function runCopilotChat() {

    return submitCopilotChat();
}


window.runCopilotChat =
    runCopilotChat;


/* ------------------------------------------------------------
   ERROR STATE
------------------------------------------------------------ */

function showCopilotError(
    message
) {

    const result =
        document.getElementById(
            "copilotResult"
        );


    if (!result) return;


    result.style.display =
        "block";


    result.innerHTML = `
        <div class="copilot-error-card">

            <div class="copilot-error-icon">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>

            <div>

                <h3>
                    Copilot Could Not Complete the Analysis
                </h3>

                <p>
                    ${escapeCopilotHtml(
                        message
                    )}
                </p>

            </div>

        </div>
    `;
}


/* ------------------------------------------------------------
   MAIN RESULT RENDERER
------------------------------------------------------------ */

/* ------------------------------------------------------------
   FREIGHTIQ AI CHARTERING COPILOT
   FINAL RESULT RENDERER
------------------------------------------------------------ */

function renderCopilotResult(data) {

    const result = document.getElementById("copilotResult");

    if (!result) {
        console.error("FreightIQ: copilotResult element not found.");
        return;
    }

    result.style.display = "block";
    result.hidden = false;

    /* =========================================================
       NORMALIZE BACKEND RESPONSE
    ========================================================= */

    const recommendation =
        data?.recommendation || {};

    const vessel =
        recommendation.recommended_vessel ||
        data?.recommended_vessel ||
        data?.vessel ||
        {};

    const freight =
        recommendation.freight_recommendation ||
        data?.freight_recommendation ||
        {};

    /* Backend forecast is normally nested under freight.rate. */
    const rate =
        freight.rate ||
        recommendation.rate ||
        data?.rate ||
        {};

    const risk =
        data?.risk_assessment ||
        recommendation.risk_assessment ||
        {};

    const parsed =
        data?.parsed_request ||
        recommendation.parsed_request ||
        {};

    const alternatives =
        recommendation.top_vessels ||
        data?.top_vessels ||
        [];

    const explanation =
        data?.explanation ||
        recommendation.explanation ||
        data?.copilot_explanation ||
        "AI analysis completed successfully.";


    /* =========================================================
       SAFE HELPERS
    ========================================================= */

    const safeNumber = (value) => {

        const n = Number(value);

        return Number.isFinite(n) ? n : null;
    };


    const escapeHTML = (value) => {

        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };


    const formatNumber = (value, digits = 0) => {

        const n = safeNumber(value);

        if (n === null) {
            return "—";
        }

        return n.toLocaleString("en-US", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    };


    const formatDate = (value) => {

        if (!value || value === "—") {
            return "—";
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return escapeHTML(value);
        }

        return d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };


    const formatRate = (value) => {

        const n = safeNumber(value);

        if (n === null) {
            return "—";
        }

        return "$" + n.toFixed(2) + " / MT";
    };


    const sameVessel = (a, b) => {

        if (
            a === null ||
            a === undefined ||
            b === null ||
            b === undefined
        ) {
            return false;
        }

        return String(a)
            .trim()
            .toLowerCase() ===
            String(b)
                .trim()
                .toLowerCase();
    };


    /* =========================================================
       FINAL VESSEL
    ========================================================= */

    const vesselName =
        vessel.vessel_name ||
        vessel.name ||
        "Recommended Vessel";


    const vesselId =
        vessel.vessel_id ??
        vessel.id ??
        "—";


    const vesselClass =
        vessel.vessel_class ||
        vessel.class ||
        "—";


    const dwt =
        safeNumber(vessel.dwt);


    const draft =
        safeNumber(vessel.draft);


    const loa =
        safeNumber(
            vessel.loa ??
            vessel.length
        );


    const beam =
        safeNumber(vessel.beam);


    const reliabilityRaw =
        safeNumber(
            vessel.reliability_score
        );


    const reliability =
        reliabilityRaw !== null
            ? (
                reliabilityRaw <= 1
                    ? reliabilityRaw * 100
                    : reliabilityRaw
            )
            : null;


    const speed =
        safeNumber(
            vessel.cruising_speed
        );


    const score =
        safeNumber(
            vessel.recommendation_score ??
            vessel.score ??
            recommendation.score ??
            freight.score
        );


    const availabilityDate =
        vessel.availability_date ||
        null;


    const availabilityStatus =
        vessel.availability_status ||
        vessel.operational_status ||
        "Availability not specified";


    const finalVesselId =
        vessel.vessel_id ??
        vessel.id;


    /* =========================================================
       FREIGHT DATA
    ========================================================= */

    const p10 =
        safeNumber(
            freight.p10 ??
            freight.rate_p10 ??
            rate.p10 ??
            rate.rate_p10
        );


    const p50 =
        safeNumber(
            freight.p50 ??
            freight.rate_p50 ??
            freight.expected_rate ??
            rate.p50 ??
            rate.rate_p50 ??
            rate.expected_rate
        );


    const p90 =
        safeNumber(
            freight.p90 ??
            freight.rate_p90 ??
            rate.p90 ??
            rate.rate_p90
        );


    const contractType =
        freight.contract_type ||
        parsed.contract_preference ||
        "Spot";


    const fixtureWindow =
        freight.fixture_window ||
        {};

    const fixtureStart =
        freight.fixture_window_start ||
        freight.fixture_start ||
        fixtureWindow.start ||
        freight.laycan_start ||
        parsed.laycan_start ||
        "—";


    const fixtureEnd =
        freight.fixture_window_end ||
        freight.fixture_end ||
        fixtureWindow.end ||
        freight.laycan_end ||
        parsed.laycan_end ||
        "—";


    /* =========================================================
       RISK
    ========================================================= */

    const riskLevel = String(
        risk.overall_risk_level ||
        risk.level ||
        risk.risk_level ||
        freight.risk_level ||
        recommendation.risk_level ||
        "Medium"
    ).toUpperCase();


    let riskClass = "medium";

    if (riskLevel === "HIGH") {
        riskClass = "high";
    }

    if (riskLevel === "LOW") {
        riskClass = "low";
    }


    const riskDecision =
        risk.decision ||
        (
            riskLevel === "HIGH"
                ? "HUMAN APPROVAL REQUIRED"
                : riskLevel === "MEDIUM"
                    ? "PROCEED WITH MONITORING"
                    : "PROCEED"
        );


    const riskSummary =
        risk.summary ||
        (
            riskLevel === "HIGH"
                ? "High risk signals detected. Human review is required before final fixture."
                : riskLevel === "MEDIUM"
                    ? "Moderate risk signals detected. Continue monitoring market and operational conditions before fixture."
                    : "Low risk conditions detected. Standard operational monitoring is sufficient."
        );


    const mitigationActions =
        Array.isArray(risk.mitigation_actions)
            ? risk.mitigation_actions
            : [];


    /* =========================================================
       CARGO REQUIREMENT
    ========================================================= */

    const quantity =
        safeNumber(
            parsed.quantity ??
            parsed.cargo_quantity
        );


    const cargoType =
        parsed.cargo_type ||
        parsed.commodity ||
        "Coking Coal";


    const origin =
        parsed.origin ||
        "Australia";


    const destination =
        parsed.destination ||
        parsed.destination_port ||
        "Paradip";


    const laycanStart =
        parsed.laycan_start ||
        "—";


    const laycanEnd =
        parsed.laycan_end ||
        "—";


    /* =========================================================
       ORDER ALTERNATIVES
       IMPORTANT:
       Vessel IDs are strings such as V0283.
       DO NOT use Number(V0283).
    ========================================================= */

    const validAlternatives =
        Array.isArray(alternatives)
            ? alternatives.filter(item => {

                return item &&
                    (
                        item.vessel_id !== undefined ||
                        item.id !== undefined ||
                        item.vessel_name ||
                        item.name
                    );

            })
            : [];


    let orderedAlternatives =
        [...validAlternatives];


    const finalIndex =
        orderedAlternatives.findIndex(item => {

            const itemId =
                item.vessel_id ??
                item.id;

            return sameVessel(
                itemId,
                finalVesselId
            );

        });


    if (finalIndex > 0) {

        const winner =
            orderedAlternatives.splice(
                finalIndex,
                1
            )[0];

        orderedAlternatives.unshift(winner);

    }
    else if (finalIndex === -1) {

        orderedAlternatives.unshift(vessel);

    }


    /* =========================================================
       SCORE STYLE
    ========================================================= */

    const scoreClass =
        score !== null && score >= 90
            ? "excellent"
            : score !== null && score >= 75
                ? "good"
                : "warning";


    /* =========================================================
       RISK ICON
    ========================================================= */

    let riskIcon =
        "fa-shield-halved";

    if (riskLevel === "HIGH") {
        riskIcon =
            "fa-triangle-exclamation";
    }

    if (riskLevel === "LOW") {
        riskIcon =
            "fa-circle-check";
    }


    /* =========================================================
       MITIGATION ACTIONS
    ========================================================= */

    let mitigationHTML = "";

    if (mitigationActions.length > 0) {

        mitigationHTML =
            mitigationActions
                .slice(0, 6)
                .map((action, index) => {

                    const text =
                        typeof action === "string"
                            ? action
                            : (
                                action?.action ||
                                action?.description ||
                                action?.text ||
                                "Review risk control"
                            );


                    const priority =
                        typeof action === "object"
                            ? (
                                action?.priority ||
                                "MONITOR"
                            )
                            : "MONITOR";


                    return `
                        <div class="copilot-mitigation-item">

                            <div class="copilot-mitigation-number">
                                ${index + 1}
                            </div>

                            <div class="copilot-mitigation-content">

                                <div class="copilot-mitigation-priority">
                                    ${escapeHTML(priority)}
                                </div>

                                <strong>
                                    ${escapeHTML(text)}
                                </strong>

                            </div>

                        </div>
                    `;

                })
                .join("");

    }
    else {

        mitigationHTML = `
            <div class="copilot-mitigation-empty">
                <i class="fa-solid fa-shield-halved"></i>
                Standard operational monitoring is recommended.
            </div>
        `;

    }


    /* =========================================================
       ALTERNATIVE VESSELS
    ========================================================= */

    const alternativesHTML =
        orderedAlternatives
            .slice(0, 5)
            .map((item, index) => {

                const itemName =
                    item.vessel_name ||
                    item.name ||
                    "Unknown Vessel";


                const itemClass =
                    item.vessel_class ||
                    item.class ||
                    "—";


                const itemId =
                    item.vessel_id ??
                    item.id ??
                    "—";


                const itemScore =
                    safeNumber(
                        item.recommendation_score ??
                        item.score ??
                        item.copilot_match_score
                    );


                const itemDwt =
                    safeNumber(item.dwt);


                const itemDraft =
                    safeNumber(item.draft);


                const itemAvailability =
                    item.availability_status ||
                    item.availability_date ||
                    item.operational_status ||
                    "—";


                const isFinal =
                    sameVessel(
                        itemId,
                        finalVesselId
                    );


                return `
                    <div class="copilot-alternative-row ${
                        isFinal ? "final" : ""
                    }">

                        <div class="copilot-alt-rank">

                            ${
                                isFinal
                                    ? `<i class="fa-solid fa-crown"></i>`
                                    : `#${index + 1}`
                            }

                        </div>


                        <div class="copilot-alt-main">

                            <strong>
                                ${escapeHTML(itemName)}
                            </strong>

                            <span>
                                ${escapeHTML(itemId)}
                                •
                                ${escapeHTML(itemClass)}
                            </span>

                        </div>


                        <div class="copilot-alt-metric">

                            <span>
                                DWT
                            </span>

                            <strong>
                                ${
                                    itemDwt !== null
                                        ? formatNumber(itemDwt)
                                        : "—"
                                }
                            </strong>

                        </div>


                        <div class="copilot-alt-metric">

                            <span>
                                Draft
                            </span>

                            <strong>
                                ${
                                    itemDraft !== null
                                        ? itemDraft.toFixed(2) + " m"
                                        : "—"
                                }
                            </strong>

                        </div>


                        <div class="copilot-alt-availability">

                            ${escapeHTML(
                                String(itemAvailability)
                            )}

                        </div>


                        <div class="copilot-alt-score">

                            ${
                                itemScore !== null
                                    ? itemScore.toFixed(1)
                                    : "—"
                            }

                        </div>


                        ${
                            isFinal
                                ? `
                                    <div class="copilot-alt-badge">
                                        FINAL
                                    </div>
                                  `
                                : ""
                        }

                    </div>
                `;

            })
            .join("");


    /* =========================================================
       FINAL HTML
    ========================================================= */

    result.innerHTML = `

        <!-- =====================================================
             FINAL RECOMMENDATION
        ====================================================== -->

        <section class="copilot-final-card">

            <div class="copilot-final-header">

                <div class="copilot-final-title">

                    <div class="copilot-eyebrow">

                        <i class="fa-solid fa-wand-magic-sparkles"></i>

                        AI CHARTERING DECISION

                    </div>


                    <h2>
                        ${escapeHTML(vesselName)}
                    </h2>


                    <div class="copilot-vessel-subtitle">

                        ${escapeHTML(String(vesselId))}

                        <span class="copilot-divider">
                            •
                        </span>

                        ${escapeHTML(vesselClass)}

                    </div>


                    <div class="copilot-final-badge">

                        <i class="fa-solid fa-circle-check"></i>

                        FINAL RECOMMENDATION

                    </div>

                </div>


                <div class="copilot-score-box ${scoreClass}">

                    <strong>
                        ${
                            score !== null
                                ? score.toFixed(1)
                                : "—"
                        }
                    </strong>

                    <span>
                        / 100
                    </span>

                    <small>
                        MATCH SCORE
                    </small>

                </div>

            </div>


            <!-- VESSEL METRICS -->

            <div class="copilot-vessel-grid">

                <div class="copilot-metric">

                    <span>
                        DWT
                    </span>

                    <strong>
                        ${
                            dwt !== null
                                ? formatNumber(dwt)
                                : "—"
                        }
                    </strong>

                    <small>
                        MT
                    </small>

                </div>


                <div class="copilot-metric">

                    <span>
                        DRAFT
                    </span>

                    <strong>
                        ${
                            draft !== null
                                ? draft.toFixed(2)
                                : "—"
                        }
                    </strong>

                    <small>
                        metres
                    </small>

                </div>


                <div class="copilot-metric">

                    <span>
                        LOA
                    </span>

                    <strong>
                        ${
                            loa !== null
                                ? loa.toFixed(1)
                                : "—"
                        }
                    </strong>

                    <small>
                        metres
                    </small>

                </div>


                <div class="copilot-metric">

                    <span>
                        BEAM
                    </span>

                    <strong>
                        ${
                            beam !== null
                                ? beam.toFixed(1)
                                : "—"
                        }
                    </strong>

                    <small>
                        metres
                    </small>

                </div>


                <div class="copilot-metric">

                    <span>
                        RELIABILITY
                    </span>

                    <strong>
                        ${
                            reliability !== null
                                ? reliability.toFixed(1) + "%"
                                : "—"
                        }
                    </strong>

                    <small>
                        score
                    </small>

                </div>


                <div class="copilot-metric">

                    <span>
                        SPEED
                    </span>

                    <strong>
                        ${
                            speed !== null
                                ? speed.toFixed(1)
                                : "—"
                        }
                    </strong>

                    <small>
                        knots
                    </small>

                </div>

            </div>


            <!-- AVAILABILITY -->

            <div class="copilot-availability">

                <div class="copilot-availability-icon">

                    <i class="fa-solid fa-calendar-check"></i>

                </div>


                <div>

                    <span>
                        AVAILABILITY
                    </span>

                    <strong>
                        ${
                            availabilityDate
                                ? formatDate(availabilityDate)
                                : escapeHTML(
                                    String(
                                        availabilityStatus
                                    )
                                )
                        }
                    </strong>

                    <small>
                        ${escapeHTML(
                            String(
                                availabilityStatus
                            )
                        )}
                    </small>

                </div>

            </div>

        </section>


        <!-- =====================================================
             COMMERCIAL INTELLIGENCE
        ====================================================== -->

        <section class="copilot-section-card">

            <div class="copilot-section-title">

                <div class="copilot-section-icon freight">

                    <i class="fa-solid fa-chart-line"></i>

                </div>


                <div>

                    <h3>
                        Freight Intelligence
                    </h3>

                    <p>
                        AI forecast for the recommended vessel
                        class and fixture window
                    </p>

                </div>

            </div>


            <div class="copilot-rate-grid">

                <div class="copilot-rate-card">

                    <span>
                        P10
                    </span>

                    <strong>
                        ${formatRate(p10)}
                    </strong>

                    <small>
                        Lower market floor
                    </small>

                </div>


                <div class="copilot-rate-card primary">

                    <span>
                        P50
                    </span>

                    <strong>
                        ${formatRate(p50)}
                    </strong>

                    <small>
                        Expected freight rate
                    </small>

                </div>


                <div class="copilot-rate-card">

                    <span>
                        P90
                    </span>

                    <strong>
                        ${formatRate(p90)}
                    </strong>

                    <small>
                        Upper market ceiling
                    </small>

                </div>

            </div>


            <div class="copilot-freight-details">

                <div>

                    <span>
                        CONTRACT STRATEGY
                    </span>

                    <strong>
                        ${escapeHTML(
                            String(contractType)
                        )}
                    </strong>

                </div>


                <div>

                    <span>
                        FIXTURE WINDOW
                    </span>

                    <strong>

                        ${formatDate(fixtureStart)}

                        →

                        ${formatDate(fixtureEnd)}

                    </strong>

                </div>

            </div>

        </section>


        <!-- =====================================================
             RISK ENGINE
        ====================================================== -->

        <section class="copilot-risk-card ${riskClass}">

            <div class="copilot-risk-header">

                <div class="copilot-risk-title">

                    <div class="copilot-risk-icon">

                        <i class="fa-solid ${riskIcon}"></i>

                    </div>


                    <div>

                        <span>
                            AI RISK ENGINE
                        </span>

                        <h3>
                            Route Risk & Mitigation
                        </h3>

                    </div>

                </div>


                <div class="copilot-risk-level">

                    ${escapeHTML(riskLevel)}

                </div>

            </div>


            <div class="copilot-risk-decision">

                <i class="fa-solid fa-gavel"></i>

                <strong>
                    Decision:
                </strong>

                <span>
                    ${escapeHTML(
                        String(riskDecision)
                    )}
                </span>

            </div>


            <div class="copilot-risk-summary">

                ${escapeHTML(
                    String(riskSummary)
                )}

            </div>


            <div class="copilot-mitigation-title">

                <i class="fa-solid fa-list-check"></i>

                Recommended Mitigation Actions

            </div>


            <div class="copilot-mitigation-grid">

                ${mitigationHTML}

            </div>

        </section>


        <!-- =====================================================
             WHY FREIGHTIQ CHOSE THIS VESSEL
        ====================================================== -->

        <section class="copilot-section-card">

            <div class="copilot-section-title">

                <div class="copilot-section-icon purple">

                    <i class="fa-solid fa-brain"></i>

                </div>


                <div>

                    <h3>
                        Why FreightIQ Chose This Vessel
                    </h3>

                    <p>
                        AI decision explanation
                    </p>

                </div>

            </div>


            <div class="copilot-explanation">

                <i class="fa-solid fa-quote-left"></i>

                <p>
                    ${escapeHTML(
                        Array.isArray(explanation)
                            ? explanation.join(" ")
                            : String(explanation)
                    )}
                </p>

            </div>

        </section>


        <!-- =====================================================
             REQUIREMENT SUMMARY
        ====================================================== -->

        <section class="copilot-section-card">

            <div class="copilot-section-title">

                <div class="copilot-section-icon blue">

                    <i class="fa-solid fa-boxes-stacked"></i>

                </div>


                <div>

                    <h3>
                        Requirement Parsed
                    </h3>

                    <p>
                        Natural-language request converted
                        into chartering parameters
                    </p>

                </div>

            </div>


            <div class="copilot-requirement-grid">

                <div>

                    <span>
                        CARGO
                    </span>

                    <strong>
                        ${escapeHTML(
                            String(cargoType)
                        )}
                    </strong>

                </div>


                <div>

                    <span>
                        QUANTITY
                    </span>

                    <strong>
                        ${
                            quantity !== null
                                ? formatNumber(quantity)
                                : "—"
                        }
                        MT
                    </strong>

                </div>


                <div>

                    <span>
                        ORIGIN
                    </span>

                    <strong>
                        ${escapeHTML(
                            String(origin)
                        )}
                    </strong>

                </div>


                <div>

                    <span>
                        DESTINATION
                    </span>

                    <strong>
                        ${escapeHTML(
                            String(destination)
                        )}
                    </strong>

                </div>


                <div>

                    <span>
                        LAYCAN START
                    </span>

                    <strong>
                        ${formatDate(laycanStart)}
                    </strong>

                </div>


                <div>

                    <span>
                        LAYCAN END
                    </span>

                    <strong>
                        ${formatDate(laycanEnd)}
                    </strong>

                </div>

            </div>

        </section>


        <!-- =====================================================
             ALTERNATIVE VESSELS
        ====================================================== -->

        <section class="copilot-section-card">

            <div class="copilot-section-title">

                <div class="copilot-section-icon green">

                    <i class="fa-solid fa-ranking-star"></i>

                </div>


                <div>

                    <h3>
                        Ranked Alternatives
                    </h3>

                    <p>
                        Other physically compatible vessels
                        evaluated by the AI engine
                    </p>

                </div>

            </div>


            <div class="copilot-alternatives">

                ${
                    alternativesHTML ||
                    `
                        <div class="copilot-mitigation-empty">
                            No alternative vessels returned.
                        </div>
                    `
                }

            </div>

        </section>


        <!-- =====================================================
             ACTION BAR
        ====================================================== -->

        <div class="copilot-action-bar">

            <button
                type="button"
                class="copilot-action-btn primary"
                onclick="acceptCopilotRecommendation()"
            >

                <i class="fa-solid fa-check"></i>

                Accept Recommendation

            </button>


            <button
                type="button"
                class="copilot-action-btn secondary"
                onclick="openCopilotCargoPlan()"
            >

                <i class="fa-solid fa-route"></i>

                Open Cargo Plan

            </button>


            <button
                type="button"
                class="copilot-action-btn secondary"
                onclick="copyCopilotSummary()"
            >

                <i class="fa-solid fa-copy"></i>

                Copy Decision Summary

            </button>

        </div>

    `;


    /* =========================================================
       SAVE LAST RESULT
    ========================================================= */

    window.copilotLastResult =
        data;

    if (
        typeof copilotLastResult !== "undefined"
    ) {
        copilotLastResult =
            data;
    }


    /* =========================================================
       OPTIONAL SMOOTH SCROLL
    ========================================================= */

    setTimeout(() => {

        result.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }, 100);

}



/* ============================================================
   HELPER FUNCTIONS
============================================================ */


/* ------------------------------------------------------------
   Safe Number
------------------------------------------------------------ */

function numberValue(
    value
) {

    const number =
        Number(
            value
        );


    return Number.isFinite(
        number
    )
        ? number
        : 0;
}


/* ------------------------------------------------------------
   Number Formatting
------------------------------------------------------------ */

function formatNumber(
    value,
    decimals = 0
) {

    const number =
        numberValue(
            value
        );


    return number.toLocaleString(
        undefined,
        {
            minimumFractionDigits:
                decimals,

            maximumFractionDigits:
                decimals
        }
    );
}


/* ------------------------------------------------------------
   Freight Rate Formatting
------------------------------------------------------------ */

function formatRate(
    value
) {

    const number =
        numberValue(
            value
        );


    if (!number) {

        return "—";
    }


    return `$${number.toFixed(2)}/MT`;
}


/* ------------------------------------------------------------
   Date Formatting
------------------------------------------------------------ */

function formatCopilotDate(
    value
) {

    if (
        !value ||
        value ===
            "—"
    ) {

        return "—";
    }


    const date =
        new Date(
            value
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(
            value
        );
    }


    return date.toLocaleDateString(
        "en-IN",
        {
            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric"
        }
    );
}


/* ------------------------------------------------------------
   HTML Escape
------------------------------------------------------------ */

function escapeCopilotHtml(
    value
) {

    return String(
        value ??
        ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* ============================================================
   ACCEPT FINAL RECOMMENDATION
============================================================ */

function acceptCopilotRecommendation() {

    if (
        !copilotLastResult
    ) {

        showCopilotError(
            "No Copilot recommendation is currently available."
        );

        return;
    }


    const recommendation =
        copilotLastResult.recommendation ||
        {};


    const vessel =
        recommendation.recommended_vessel ||
        {};


    window.selectedFreightIQVessel =
        vessel;


    /*
     * Populate existing vessel selection
     * if that field exists.
     */

    const select =
        document.getElementById(
            "fixtureVesselSelect"
        );


    const vesselId =
        vessel.vessel_id ??
        vessel.id;


    if (
        select &&
        vesselId !==
            undefined
    ) {

        const exists =
            Array.from(
                select.options
            ).some(
                option =>
                    Number(
                        option.value
                    ) ===
                    Number(
                        vesselId
                    )
            );


        if (!exists) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                vesselId;


            option.textContent =
                `${vessel.vessel_name || vessel.name} (${vessel.vessel_class || "Panamax"})`;


            select.appendChild(
                option
            );
        }


        select.value =
            vesselId;
    }


    showToast(
        `${vessel.vessel_name || vessel.name || "Recommended vessel"} accepted as the final chartering candidate.`,
        "success"
    );
}


window.acceptCopilotRecommendation =
    acceptCopilotRecommendation;


/* ============================================================
   OPEN CARGO PLAN
============================================================ */

function openCopilotCargoPlan() {

    if (
        typeof showPage ===
        "function"
    ) {

        showPage(
            "cargo"
        );
    }


    const recommendation =
        copilotLastResult?.recommendation ||
        {};


    const vessel =
        recommendation.recommended_vessel ||
        {};


    const parsed =
        copilotLastResult?.parsed_request ||
        {};


    /*
     * Fill existing cargo fields where possible.
     */

    const qty =
        document.getElementById(
            "cargoQty"
        );


    const commodity =
        document.getElementById(
            "cargoCommodity"
        );


    const origin =
        document.getElementById(
            "cargoOrigin"
        );


    const start =
        document.getElementById(
            "laycanStart"
        );


    const end =
        document.getElementById(
            "laycanEnd"
        );


    if (
        qty &&
        parsed.quantity
    ) {

        qty.value =
            parsed.quantity;
    }


    if (
        commodity &&
        parsed.cargo_type
    ) {

        commodity.value =
            parsed.cargo_type;
    }


    if (
        origin &&
        parsed.origin
    ) {

        origin.value =
            parsed.origin;
    }


    if (
        start &&
        parsed.laycan_start
    ) {

        start.value =
            String(
                parsed.laycan_start
            ).slice(
                0,
                10
            );
    }


    if (
        end &&
        parsed.laycan_end
    ) {

        end.value =
            String(
                parsed.laycan_end
            ).slice(
                0,
                10
            );
    }


    showToast(
        `Cargo plan opened for ${vessel.vessel_name || vessel.name || "recommended vessel"}.`,
        "info"
    );
}


window.openCopilotCargoPlan =
    openCopilotCargoPlan;


/* ============================================================
   COPY DECISION SUMMARY
============================================================ */

async function copyCopilotSummary() {

    if (
        !copilotLastResult
    ) {

        return;
    }


    const recommendation =
        copilotLastResult.recommendation ||
        {};


    const vessel =
        recommendation.recommended_vessel ||
        {};


    const freight =
        recommendation.freight_recommendation ||
        {};

    const rate =
        freight.rate ||
        {};


    const risk =
        copilotLastResult.risk_assessment ||
        {};


    const text =
        `
FreightIQ AI Chartering Decision

Final Vessel:
${vessel.vessel_name || vessel.name || "—"}

Vessel ID:
${vessel.vessel_id ?? vessel.id ?? "—"}

Class:
${vessel.vessel_class || "—"}

DWT:
${formatNumber(vessel.dwt)} MT

Draft:
${numberValue(vessel.draft).toFixed(2)} m

Freight P10:
${formatRate(freight.p10 ?? freight.rate_p10 ?? rate.p10)}

Freight P50:
${formatRate(freight.p50 ?? freight.rate_p50 ?? freight.expected_rate ?? rate.p50)}

Freight P90:
${formatRate(freight.p90 ?? freight.rate_p90 ?? rate.p90)}

Contract:
${freight.contract_type || "Spot"}

Risk:
${risk.level || freight.risk_level || "Unknown"}

Decision:
${risk.decision || "—"}
        `.trim();


    try {

        await navigator.clipboard.writeText(
            text
        );


        showToast(
            "AI decision summary copied to clipboard.",
            "success"
        );

    } catch (error) {

        console.warn(
            "Clipboard unavailable:",
            error
        );


        showToast(
            "Unable to copy summary.",
            "error"
        );
    }
}


window.copyCopilotSummary =
    copyCopilotSummary;


/* ============================================================
   ENTER KEY SUPPORT
============================================================ */

document.addEventListener(
    "keydown",
    event => {

        const input =
            document.getElementById(
                "copilotMessage"
            );


        if (
            !input ||
            document.activeElement !==
                input
        ) {
            return;
        }


        /*
         * Enter = send
         * Shift + Enter = new line
         */

        if (
            event.key ===
                "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();


            submitCopilotChat();
        }
    }
);


/* ============================================================
   COPILOT INITIALIZATION
============================================================ */

function initCopilot() {

    const input =
        document.getElementById(
            "copilotMessage"
        );


    if (!input) return;


    input.addEventListener(
        "input",
        () => {

            const sendBtn =
                document.getElementById(
                    "copilotSendBtn"
                );


            if (!sendBtn) return;


            sendBtn.disabled =
                !input.value.trim();
        }
    );


    /*
     * Set initial state.
     */

    const sendBtn =
        document.getElementById(
            "copilotSendBtn"
        );


    if (sendBtn) {

        sendBtn.disabled =
            !input.value.trim();
    }
}


window.initCopilot =
    initCopilot;


/* ============================================================
   START COPILOT
============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initCopilot();

    }
);


/* ============================================================
   END — AI CHARTERING COPILOT
============================================================ */
