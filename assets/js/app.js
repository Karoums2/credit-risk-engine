(() => {
  const ANALYSIS_KEY = "cre_analysis";
  const METHODOLOGY_KEY = "cre_methodology";

  const YEAR_KEYS = ["N", "N-1", "N-2"];
  const PAIR_SCORE_MATRIX = buildPairMatrix();
  const DEFAULT_OBJECTIVES = [
    "Structurer une analyse crédit de manière rigoureuse",
    "Rendre des intuitions financières mesurables et comparables",
    "Relier performance opérationnelle, structure financière et probabilité de défaut",
    "Produire un reporting exploitable en banque d'affaires ou en private equity"
  ];

  const defaultMethodology = () => ({
    weights: { structure: 0.3, liquidite: 0.3, business: 0.25, gouvernance: 0.15 },
    ratingThresholds: [
      { max: 19, rating: "AAA" },
      { max: 34, rating: "AA" },
      { max: 49, rating: "A" },
      { max: 64, rating: "BBB" },
      { max: 79, rating: "BB" },
      { max: 89, rating: "B" },
      { max: 100, rating: "CCC/C" }
    ],
    pd: { a: 0.1, b: 50, horizonYears: 1 },
    stress: { ebitdaShock: -0.2, ratesBps: 200 },
    lgd: { min: 0.3, max: 0.75, base: 0.7, tangibleImpact: 0.4 },
    ead: { ccf: 0.5 },
    sectors: ["Industrie", "Services", "Commerce", "Technologie", "Santé", "Transport", "Construction", "Autre"],
    assumptions: { depreciationDefault: 0 }
  });

  const defaultAnalysis = () => ({
    company: {
      name: "",
      createdAt: "",
      sector: "Industrie",
      country: "",
      headcount: "",
      businessModel: "",
      comments: "",
      story: "",
      objectives: [...DEFAULT_OBJECTIVES]
    },
    inputs: {
      balance: {
        tangibleFixedAssets: byYear(0),
        intangibleFixedAssets: byYear(0),
        financialFixedAssets: byYear(0),
        inventory: byYear(0),
        receivables: byYear(0),
        cash: byYear(0),
        tradePayables: byYear(0),
        shortTermDebt: byYear(0),
        longTermDebt: byYear(0),
        variableDebt: byYear(0),
        fixedDebt: byYear(0),
        equity: byYear(0)
      },
      income: {
        revenue: byYear(0),
        ebitda: byYear(0),
        ebit: byYear(0),
        financialCharges: byYear(0),
        netIncome: byYear(0),
        depreciation: byYear(0)
      },
      cashflow: {
        capex: byYear(0),
        deltaWcr: byYear(0),
        dividends: byYear(0),
        undrawnCommitted: byYear(0),
        undrawnMaturity: byYear("")
      }
    },
    economicBalance: {
      wcr: 0,
      immobilisations: 0,
      economicAssets: 0,
      grossFinancialDebt: 0,
      netDebt: 0,
      investedCapital: 0,
      tangibleAssets: 0,
      totalAssets: 0
    },
    scores: {
      indicators: {},
      indicatorScores: {},
      pairs: { structure: 0, liquidite: 0, business: 0, gouvernance: 0 },
      global: 0,
      rating: "BBB"
    },
    stress: { base: {}, stressEbitda: {}, stressRates: {} },
    risk: { pd: 0, lgd: 0, ead: 0, el: 0, elPctEad: 0 },
    monteCarlo: { runs: 10000, meanPd: 0, p95Pd: 0, histogram: [] },
    lbo: {
      enabled: false,
      seniorDebt: 0,
      mezzDebt: 0,
      unitrancheDebt: 0,
      averageRate: 0,
      amortization: 0,
      dscr: 0,
      cashSweep: 0,
      exitMultipleRisk: 0,
      pdFinal: 0
    },
    timestamp: new Date().toISOString()
  });

  function byYear(initialValue) {
    return { N: initialValue, "N-1": initialValue, "N-2": initialValue };
  }

  function buildPairMatrix() {
    return Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 10 }, (_, colIdx) => (rowIdx + 1) * (colIdx + 1))
    );
  }

  function loadJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed || fallback;
    } catch (_) {
      return fallback;
    }
  }

  const methodology = mergeDeep(defaultMethodology(), loadJSON(METHODOLOGY_KEY, {}));
  const analysis = mergeDeep(defaultAnalysis(), loadJSON(ANALYSIS_KEY, {}));

  function saveAll() {
    analysis.timestamp = new Date().toISOString();
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analysis));
    localStorage.setItem(METHODOLOGY_KEY, JSON.stringify(methodology));
  }

  function mergeDeep(base, extra) {
    if (!extra || typeof extra !== "object") return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    Object.keys(extra).forEach((k) => {
      if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
        out[k] = mergeDeep(base[k], extra[k]);
      } else {
        out[k] = extra[k];
      }
    });
    return out;
  }

  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function safeDiv(a, b) {
    return b === 0 ? 0 : a / b;
  }

  function values3(series) {
    return YEAR_KEYS.map((y) => toNumber(series[y]));
  }

  function mean(arr) {
    return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
  }

  function std(arr) {
    if (!arr.length) return 0;
    const m = mean(arr);
    const variance = mean(arr.map((x) => (x - m) ** 2));
    return Math.sqrt(variance);
  }

  function volatilityPct(series) {
    const arr = values3(series);
    const m = mean(arr);
    if (m === 0) return 0;
    return Math.abs(std(arr) / m);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mapLeverage(x) {
    if (x < 1) return 1;
    if (x < 2) return 2;
    if (x < 3) return 4;
    if (x < 4) return 6;
    if (x < 5) return 8;
    if (x < 6) return 9;
    return 10;
  }

  function mapCoverage(x) {
    if (x > 8) return 1;
    if (x > 6) return 2;
    if (x > 4) return 4;
    if (x > 3) return 5;
    if (x > 2) return 7;
    if (x > 1) return 8;
    return 10;
  }

  function mapFcfRatio(x) {
    if (x > 0.8) return 1;
    if (x > 0.6) return 2;
    if (x > 0.4) return 4;
    if (x > 0.2) return 6;
    if (x > 0) return 8;
    return 10;
  }

  function mapLiquidity(x) {
    if (x > 2) return 1;
    if (x > 1.5) return 3;
    if (x > 1.1) return 5;
    if (x > 0.8) return 7;
    if (x > 0.5) return 8;
    if (x > 0.2) return 9;
    return 10;
  }

  function mapVolatility(x) {
    if (x < 0.05) return 1;
    if (x < 0.1) return 3;
    if (x < 0.2) return 5;
    if (x < 0.3) return 7;
    if (x < 0.4) return 9;
    return 10;
  }

  function riskBand(score) {
    if (score <= 9) return "Très faible";
    if (score <= 19) return "Faible";
    if (score <= 39) return "Moyen";
    if (score <= 69) return "Fort";
    if (score <= 89) return "Majeur";
    return "Critique";
  }

  function pairScoreFromMatrix(scoreA, scoreB) {
    const row = clamp(Math.round(scoreA), 1, 10) - 1;
    const col = clamp(Math.round(scoreB), 1, 10) - 1;
    return PAIR_SCORE_MATRIX[row][col];
  }

  function ratingFromGlobal(score) {
    const rounded = Math.round(score);
    const found = methodology.ratingThresholds.find((r) => rounded <= r.max);
    return found ? found.rating : "CCC/C";
  }

  function computeEconomicBalance() {
    const b = analysis.inputs.balance;
    const y = "N";
    const wcr = toNumber(b.inventory[y]) + toNumber(b.receivables[y]) - toNumber(b.tradePayables[y]);
    const immobilisations =
      toNumber(b.tangibleFixedAssets[y]) + toNumber(b.intangibleFixedAssets[y]) + toNumber(b.financialFixedAssets[y]);
    const economicAssets = immobilisations + wcr;
    const grossDebt =
      toNumber(b.shortTermDebt[y]) +
      toNumber(b.longTermDebt[y]) +
      toNumber(b.variableDebt[y]) +
      toNumber(b.fixedDebt[y]);
    const netDebt = grossDebt - toNumber(b.cash[y]);
    const investedCapital = toNumber(b.equity[y]) + netDebt;
    const tangibleAssets = toNumber(b.tangibleFixedAssets[y]) + toNumber(b.inventory[y]);
    const totalAssets = immobilisations + toNumber(b.inventory[y]) + toNumber(b.receivables[y]) + toNumber(b.cash[y]);

    analysis.economicBalance = {
      wcr,
      immobilisations,
      economicAssets,
      grossFinancialDebt: grossDebt,
      netDebt,
      investedCapital,
      tangibleAssets,
      totalAssets
    };
  }

  function fcfForYear(y) {
    const i = analysis.inputs.income;
    const c = analysis.inputs.cashflow;
    const depreciation = toNumber(i.depreciation[y]) || methodology.assumptions.depreciationDefault || 0;
    return toNumber(i.netIncome[y]) + depreciation - toNumber(c.deltaWcr[y]) - toNumber(c.capex[y]);
  }

  function computeScoring(overrides = null) {
    computeEconomicBalance();
    const i = analysis.inputs.income;
    const b = analysis.inputs.balance;
    const c = analysis.inputs.cashflow;
    const y = "N";

    const ebitda = overrides?.ebitda ?? toNumber(i.ebitda[y]);
    const financialCharges = overrides?.financialCharges ?? toNumber(i.financialCharges[y]);
    const netDebt = overrides?.netDebt ?? analysis.economicBalance.netDebt;
    const fcf = overrides?.fcf ?? fcfForYear(y);
    const undrawn = overrides?.undrawn ?? toNumber(c.undrawnCommitted[y]);
    const stDebt = overrides?.shortTermDebt ?? toNumber(b.shortTermDebt[y]);

    const leverage = safeDiv(netDebt, ebitda);
    const coverage = safeDiv(ebitda, Math.max(financialCharges, 0.00001));
    const fcfRatio = safeDiv(fcf, ebitda);
    const liquidityCt = safeDiv(toNumber(b.cash[y]) + undrawn, stDebt);
    const revenueVol = volatilityPct(i.revenue);
    const ebitdaVol = volatilityPct(i.ebitda);
    const governanceQ = toNumber(overrides?.governance ?? analysis.scores.indicators.governanceQ ?? 5);
    const strategyQ = toNumber(overrides?.strategy ?? analysis.scores.indicators.strategyQ ?? 5);

    const sc = {
      leverage: mapLeverage(leverage),
      coverage: mapCoverage(coverage),
      fcfRatio: mapFcfRatio(fcfRatio),
      liquidityCt: mapLiquidity(liquidityCt),
      revenueVol: mapVolatility(revenueVol),
      ebitdaVol: mapVolatility(ebitdaVol),
      governanceQ: clamp(Math.round(governanceQ), 1, 10),
      strategyQ: clamp(Math.round(strategyQ), 1, 10)
    };

    const pairs = {
      structure: pairScoreFromMatrix(sc.leverage, sc.coverage),
      liquidite: pairScoreFromMatrix(sc.fcfRatio, sc.liquidityCt),
      business: pairScoreFromMatrix(sc.revenueVol, sc.ebitdaVol),
      gouvernance: pairScoreFromMatrix(sc.governanceQ, sc.strategyQ)
    };

    const globalScore =
      methodology.weights.structure * pairs.structure +
      methodology.weights.liquidite * pairs.liquidite +
      methodology.weights.business * pairs.business +
      methodology.weights.gouvernance * pairs.gouvernance;

    analysis.scores = {
      indicators: {
        leverage,
        coverage,
        fcf,
        fcfRatio,
        liquidityCt,
        revenueVol,
        ebitdaVol,
        governanceQ,
        strategyQ
      },
      indicatorScores: sc,
      pairs,
      global: globalScore,
      rating: ratingFromGlobal(globalScore)
    };
  }

  function computeRisk() {
    const S = analysis.scores.global;
    const pd = 1 / (1 + Math.exp(-methodology.pd.a * (S - methodology.pd.b)));
    const e = analysis.economicBalance;
    const tangibility = safeDiv(e.tangibleAssets, Math.max(e.totalAssets, 1));
    let lgd = methodology.lgd.base - methodology.lgd.tangibleImpact * tangibility;
    lgd = clamp(lgd, methodology.lgd.min, methodology.lgd.max);
    const usedDebt = analysis.economicBalance.grossFinancialDebt;
    const undrawn = toNumber(analysis.inputs.cashflow.undrawnCommitted.N);
    const ead = usedDebt + methodology.ead.ccf * undrawn;
    const el = pd * lgd * ead;

    analysis.risk = {
      pd,
      lgd,
      ead,
      el,
      elPctEad: safeDiv(el, Math.max(ead, 1))
    };
  }

  function computeStress() {
    const base = {
      score: analysis.scores.global,
      rating: analysis.scores.rating,
      pd: analysis.risk.pd
    };
    const ebitdaBase = toNumber(analysis.inputs.income.ebitda.N);
    const chargesBase = toNumber(analysis.inputs.income.financialCharges.N);
    const stressEbitdaValue = ebitdaBase * (1 + methodology.stress.ebitdaShock);

    computeScoring({ ebitda: stressEbitdaValue });
    computeRisk();
    const s1 = {
      score: analysis.scores.global,
      rating: analysis.scores.rating,
      pd: analysis.risk.pd
    };

    const chargeRateShock = chargesBase * (1 + methodology.stress.ratesBps / 10000);
    computeScoring({ financialCharges: chargeRateShock });
    computeRisk();
    const s2 = {
      score: analysis.scores.global,
      rating: analysis.scores.rating,
      pd: analysis.risk.pd
    };

    computeScoring();
    computeRisk();

    analysis.stress = { base, stressEbitda: s1, stressRates: s2 };
  }

  function runMonteCarlo() {
    const i = analysis.inputs.income;
    const baseEbitda = toNumber(i.ebitda.N);
    const sigma = std(values3(i.ebitda));
    const runs = 10000;
    const pds = [];

    for (let idx = 0; idx < runs; idx += 1) {
      const random = randomNormal(0, 1);
      const sampled = baseEbitda + sigma * random;
      computeScoring({ ebitda: sampled });
      computeRisk();
      pds.push(analysis.risk.pd);
    }

    pds.sort((a, b) => a - b);
    const meanPd = mean(pds);
    const p95Pd = pds[Math.floor(0.95 * (runs - 1))];
    const histogram = buildHistogram(pds, 20);

    computeScoring();
    computeRisk();

    analysis.monteCarlo = { runs, meanPd, p95Pd, histogram };
  }

  function randomNormal(mu, sigma) {
    const u1 = Math.random() || 1e-8;
    const u2 = Math.random() || 1e-8;
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mu + sigma * z0;
  }

  function buildHistogram(values, bins) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = (max - min) / bins || 1 / bins;
    const buckets = Array.from({ length: bins }, (_, i) => ({ x: min + i * width, c: 0 }));
    values.forEach((v) => {
      const idx = clamp(Math.floor((v - min) / width), 0, bins - 1);
      buckets[idx].c += 1;
    });
    return buckets;
  }

  function applyLayout() {
    const body = document.body;
    const root = body.dataset.root || ".";
    const nav = body.dataset.nav || "";

    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `
      <div class="container header-inner">
        <a class="brand" href="${link(root, "index.html")}">
          <img src="${link(root, "assets/img/logo.svg")}" alt="Logo CHAABENA CONSULTING CAPITAL" />
          <span class="brand-title">CHAABENA CONSULTING CAPITAL</span>
        </a>
        <nav class="main-nav">
          <a data-nav="home" href="${link(root, "index.html")}">Accueil</a>
          <a data-nav="simulation" href="${link(root, "simulation/preamble.html")}">Simulation</a>
          <a data-nav="pdf" href="${link(root, "export/pdf.html")}">Génération PDF</a>
          <a data-nav="settings" href="${link(root, "settings/methodology.html")}">Paramètres &amp; Méthodologie</a>
        </nav>
      </div>
    `;
    document.body.prepend(header);

    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `<div class="container">Karim CHAABENA - Paris, France - 2026</div>`;
    document.body.appendChild(footer);

    header.querySelectorAll(".main-nav a").forEach((a) => {
      if (a.dataset.nav === nav) a.classList.add("active");
    });
  }

  function link(root, path) {
    return root === "." ? `./${path}` : `${root}/${path}`;
  }

  function renderStepper() {
    const host = document.getElementById("stepper");
    if (!host) return;
    const step = document.body.dataset.step || "preambule";
    const steps = [
      { id: "preambule", label: "Préambule" },
      { id: "inputs", label: "Inputs" },
      { id: "economic", label: "2. Bilan économique" },
      { id: "scoring", label: "3. Scoring" },
      { id: "simulation", label: "4. Simulation" }
    ];
    host.className = "stepper";
    host.innerHTML = steps
      .map((s) => `<span class="step ${s.id === step ? "active" : ""}">${s.label}</span>`)
      .join("");
  }

  function bindModelInput(selector, getter, setter) {
    document.querySelectorAll(selector).forEach((el) => {
      el.value = getter(el) ?? "";
      el.addEventListener("input", () => {
        setter(el, el.value);
        saveAll();
      });
    });
  }

  function initHome() {
    // Réinjecte les objectifs standards si les champs sont vides.
    analysis.company.objectives = Array.from({ length: 4 }, (_, idx) => {
      const current = analysis.company.objectives?.[idx];
      return current && String(current).trim() ? current : DEFAULT_OBJECTIVES[idx];
    });

    bindModelInput("[data-objective]", (el) => analysis.company.objectives[toNumber(el.dataset.objective)], (el, v) => {
      analysis.company.objectives[toNumber(el.dataset.objective)] = v;
    });
    bindModelInput("#storyField", () => analysis.company.story, (_, v) => {
      analysis.company.story = v;
    });
    saveAll();
  }

  function initPreamble() {
    const sector = document.getElementById("sector");
    if (sector) {
      sector.innerHTML = methodology.sectors.map((s) => `<option value="${s}">${s}</option>`).join("");
    }
    const fields = [
      ["companyName", () => analysis.company.name, (v) => (analysis.company.name = v)],
      ["creationDate", () => analysis.company.createdAt, (v) => (analysis.company.createdAt = v)],
      ["sector", () => analysis.company.sector, (v) => (analysis.company.sector = v)],
      ["country", () => analysis.company.country, (v) => (analysis.company.country = v)],
      ["headcount", () => analysis.company.headcount, (v) => (analysis.company.headcount = v)],
      ["businessModel", () => analysis.company.businessModel, (v) => (analysis.company.businessModel = v)],
      ["comments", () => analysis.company.comments, (v) => (analysis.company.comments = v)]
    ];

    fields.forEach(([id, getter, setter]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = getter() ?? "";
      el.addEventListener("input", () => {
        setter(el.value);
        saveAll();
      });
    });

    document.getElementById("clearPreambleBtn")?.addEventListener("click", () => {
      analysis.company.name = "";
      analysis.company.createdAt = "";
      analysis.company.sector = methodology.sectors[0] || "";
      analysis.company.country = "";
      analysis.company.headcount = "";
      analysis.company.businessModel = "";
      analysis.company.comments = "";

      const uiMap = {
        companyName: analysis.company.name,
        creationDate: analysis.company.createdAt,
        sector: analysis.company.sector,
        country: analysis.company.country,
        headcount: analysis.company.headcount,
        businessModel: analysis.company.businessModel,
        comments: analysis.company.comments
      };
      Object.entries(uiMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
      });
      saveAll();
    });
  }

  function initYearTable(prefix, target) {
    const rows = document.querySelectorAll(`[data-table="${prefix}"] [data-key]`);
    rows.forEach((input) => {
      if (input.dataset.type === "text") return;
      const key = input.dataset.key;
      const year = input.dataset.year;
      if (!key || !year) return;
      input.value = target[key][year];
      input.addEventListener("input", () => {
        target[key][year] = toNumber(input.value);
        saveAll();
      });
    });
  }

  function initBalanceSheet() {
    initYearTable("balance", analysis.inputs.balance);
    const balanceInputs = Array.from(document.querySelectorAll('[data-table="balance"] input[data-key]'));
    const validationCells = Array.from(document.querySelectorAll('[data-table="balance"] [data-validation]'));

    balanceInputs.forEach((input) => {
      if (String(input.value) === "0") input.value = "";
    });

    const assetKeys = [
      "tangibleFixedAssets",
      "intangibleFixedAssets",
      "financialFixedAssets",
      "inventory",
      "receivables",
      "cash"
    ];
    const liabilityKeys = ["tradePayables", "shortTermDebt", "longTermDebt", "variableDebt", "fixedDebt", "equity"];

    function isRowComplete(key) {
      const rowInputs = balanceInputs.filter((input) => input.dataset.key === key);
      return rowInputs.every((input) => {
        const raw = String(input.value ?? "").trim();
        return raw !== "" && raw !== "0";
      });
    }

    function sumKeysForYear(keys, year) {
      return keys.reduce((sum, key) => sum + toNumber(analysis.inputs.balance[key][year]), 0);
    }

    function updateTotals() {
      const ids = {
        totalAssetsN: sumKeysForYear(assetKeys, "N"),
        totalAssetsN1: sumKeysForYear(assetKeys, "N-1"),
        totalAssetsN2: sumKeysForYear(assetKeys, "N-2"),
        totalLiabilitiesN: sumKeysForYear(liabilityKeys, "N"),
        totalLiabilitiesN1: sumKeysForYear(liabilityKeys, "N-1"),
        totalLiabilitiesN2: sumKeysForYear(liabilityKeys, "N-2")
      };
      Object.entries(ids).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = Number(value).toLocaleString("fr-FR");
      });
    }

    function updateValidation() {
      validationCells.forEach((cell) => {
        const key = cell.dataset.validation;
        cell.innerHTML = validationBadge(isRowComplete(key));
      });
      updateTotals();
    }

    balanceInputs.forEach((input) => {
      input.addEventListener("input", updateValidation);
    });

    document.getElementById("clearBalanceBtn")?.addEventListener("click", () => {
      balanceInputs.forEach((input) => {
        const key = input.dataset.key;
        const year = input.dataset.year;
        input.value = "";
        analysis.inputs.balance[key][year] = 0;
      });
      updateValidation();
      saveAll();
    });

    updateValidation();
  }

  function validationBadge(isComplete) {
    return isComplete ? `<span class="badge success">Complet</span>` : `<span class="badge warn">Manquant</span>`;
  }

  function initIncomeStatement() {
    initYearTable("income", analysis.inputs.income);
    const statusCells = Array.from(document.querySelectorAll("[data-validation]"));
    const incomeInputs = Array.from(document.querySelectorAll('[data-table="income"] input[data-key]'));

    function updateIncomeValidation() {
      statusCells.forEach((cell) => {
        const key = cell.dataset.validation;
        const series = analysis.inputs.income[key];
        const hasMissing = YEAR_KEYS.some((y) => !toNumber(series[y]));
        cell.innerHTML = hasMissing ? `<span class="badge warn">Manquant</span>` : `<span class="badge success">Complet</span>`;
      });
    }

    incomeInputs.forEach((input) => {
      input.addEventListener("input", updateIncomeValidation);
    });

    const saveDate = document.getElementById("lastSaved");
    if (saveDate) saveDate.textContent = new Date(analysis.timestamp).toLocaleString("fr-FR");
    updateIncomeValidation();

    document.getElementById("clearIncomeBtn")?.addEventListener("click", () => {
      const keys = ["revenue", "ebitda", "ebit", "financialCharges", "netIncome", "depreciation"];
      keys.forEach((key) => {
        YEAR_KEYS.forEach((year) => {
          analysis.inputs.income[key][year] = 0;
        });
      });
      incomeInputs.forEach((input) => {
        input.value = "";
      });
      updateIncomeValidation();
      saveAll();
    });
  }

  function initCashflow() {
    initYearTable("cashflow", analysis.inputs.cashflow);
    const numericInputs = Array.from(document.querySelectorAll('[data-table="cashflow"] input[data-key]:not([data-type="text"])'));
    const textInputs = Array.from(document.querySelectorAll('[data-table="cashflow"] [data-type="text"]'));

    textInputs.forEach((input) => {
      const key = input.dataset.key;
      const year = input.dataset.year;
      input.value = analysis.inputs.cashflow[key][year];
      input.addEventListener("input", () => {
        analysis.inputs.cashflow[key][year] = input.value;
        saveAll();
      });
    });

    document.getElementById("clearCashflowBtn")?.addEventListener("click", () => {
      const numericKeys = ["capex", "deltaWcr", "dividends", "undrawnCommitted"];
      numericKeys.forEach((key) => {
        YEAR_KEYS.forEach((year) => {
          analysis.inputs.cashflow[key][year] = 0;
        });
      });
      YEAR_KEYS.forEach((year) => {
        analysis.inputs.cashflow.undrawnMaturity[year] = "";
      });
      numericInputs.forEach((input) => {
        input.value = "";
      });
      textInputs.forEach((input) => {
        input.value = "";
      });
      saveAll();
    });
  }

  function initEconomicBalance() {
    computeScoring();
    computeRisk();
    const e = analysis.economicBalance;
    const map = {
      wcrValue: e.wcr,
      immoValue: e.immobilisations,
      ecoAssetsValue: e.economicAssets,
      grossDebtValue: e.grossFinancialDebt,
      netDebtValue: e.netDebt,
      investedValue: e.investedCapital
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmtCurrency(val);
    });
  }

  function initScoring() {
    const governance = document.getElementById("governanceScore");
    const strategy = document.getElementById("strategyScore");
    if (governance) governance.value = analysis.scores.indicators.governanceQ || 5;
    if (strategy) strategy.value = analysis.scores.indicators.strategyQ || 5;

    const refresh = () => {
      computeScoring({
        governance: toNumber(governance?.value || 5),
        strategy: toNumber(strategy?.value || 5)
      });
      computeRisk();
      renderScoringResults();
      saveAll();
    };

    governance?.addEventListener("input", refresh);
    strategy?.addEventListener("input", refresh);
    renderMatrixTable("scoringMatrix");
    refresh();
  }

  function renderScoringResults() {
    const sc = analysis.scores;
    const ids = {
      levier: sc.indicators.leverage,
      couverture: sc.indicators.coverage,
      fcf: sc.indicators.fcfRatio,
      liquidite: sc.indicators.liquidityCt,
      volCa: sc.indicators.revenueVol,
      volEbitda: sc.indicators.ebitdaVol,
      pairStructure: sc.pairs.structure,
      pairLiquidite: sc.pairs.liquidite,
      pairBusiness: sc.pairs.business,
      pairGouv: sc.pairs.gouvernance,
      globalScore: sc.global,
      globalRating: sc.rating
    };
    Object.entries(ids).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === "globalRating") {
        el.textContent = value;
      } else if (typeof value === "number") {
        el.textContent = value < 1 ? value.toFixed(3) : value.toFixed(2);
      }
    });

    const pairLegend = document.getElementById("pairLegend");
    if (pairLegend) {
      pairLegend.textContent = [
        `Structure: ${riskBand(sc.pairs.structure)}`,
        `Liquidité: ${riskBand(sc.pairs.liquidite)}`,
        `Business: ${riskBand(sc.pairs.business)}`,
        `Gouvernance: ${riskBand(sc.pairs.gouvernance)}`
      ].join(" | ");
    }

    renderHeatmap("heatmapStructure", sc.indicatorScores.leverage, sc.indicatorScores.coverage);
    renderHeatmap("heatmapLiquidite", sc.indicatorScores.fcfRatio, sc.indicatorScores.liquidityCt);
    renderHeatmap("heatmapBusiness", sc.indicatorScores.revenueVol, sc.indicatorScores.ebitdaVol);
    renderHeatmap("heatmapGouv", sc.indicatorScores.governanceQ, sc.indicatorScores.strategyQ);
  }

  function renderHeatmap(id, scoreA, scoreB) {
    const container = document.getElementById(id);
    if (!container) return;
    container.className = "heatmap";
    const rows = [];
    for (let y = 10; y >= 1; y -= 1) {
      for (let x = 1; x <= 10; x += 1) {
        const pair = pairScoreFromMatrix(x, y);
        const levelClass = riskColor(pair);
        const pointClass = x === scoreA && y === scoreB ? "heatmap-point" : "";
        rows.push(`<div class="heatmap-cell ${pointClass}" style="background:${levelClass}" title="(${x},${y}) => ${pair}"></div>`);
      }
    }
    container.innerHTML = rows.join("");
  }

  function initRunPage() {
    computeScoring();
    computeRisk();
    computeStress();
    runMonteCarlo();
    renderRunResults();

    const lboToggle = document.getElementById("lboEnabled");
    const lboFields = ["seniorDebt", "mezzDebt", "unitrancheDebt", "averageRate", "amortization", "exitMultipleRisk"];
    if (lboToggle) lboToggle.checked = analysis.lbo.enabled;
    lboFields.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = analysis.lbo[id] || 0;
      el.addEventListener("input", () => {
        analysis.lbo[id] = toNumber(el.value);
        computeLboAdjustment();
        renderRunResults();
        saveAll();
      });
    });
    lboToggle?.addEventListener("change", () => {
      analysis.lbo.enabled = !!lboToggle.checked;
      computeLboAdjustment();
      renderRunResults();
      saveAll();
    });
    computeLboAdjustment();
  }

  function computeLboAdjustment() {
    const ebitda = Math.max(toNumber(analysis.inputs.income.ebitda.N), 1);
    const service = analysis.lbo.seniorDebt * (analysis.lbo.averageRate / 100) + analysis.lbo.amortization;
    analysis.lbo.dscr = safeDiv(ebitda, Math.max(service, 1));
    analysis.lbo.cashSweep = safeDiv(analysis.scores.indicators.fcf || 0, Math.max(analysis.economicBalance.grossFinancialDebt, 1));
    const levier = analysis.scores.indicators.leverage || 0;
    const adj = 1 + 0.15 * Math.max(0, (levier - 4) / 2);
    analysis.lbo.pdFinal = analysis.risk.pd * (analysis.lbo.enabled ? adj : 1);
  }

  function renderRunResults() {
    const stress = analysis.stress;
    const map = {
      baseScore: stress.base.score,
      baseRating: stress.base.rating,
      basePd: stress.base.pd * 100,
      s1Score: stress.stressEbitda.score,
      s1Rating: stress.stressEbitda.rating,
      s1Pd: stress.stressEbitda.pd * 100,
      s2Score: stress.stressRates.score,
      s2Rating: stress.stressRates.rating,
      s2Pd: stress.stressRates.pd * 100,
      pdValue: analysis.risk.pd * 100,
      lgdValue: analysis.risk.lgd * 100,
      eadValue: analysis.risk.ead,
      elValue: analysis.risk.el,
      elPctValue: analysis.risk.elPctEad * 100,
      mcMean: analysis.monteCarlo.meanPd * 100,
      mcP95: analysis.monteCarlo.p95Pd * 100,
      lboDscr: analysis.lbo.dscr,
      lboSweep: analysis.lbo.cashSweep * 100,
      lboPdFinal: analysis.lbo.pdFinal * 100
    };

    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id.endsWith("Rating")) el.textContent = value;
      else if (id === "eadValue" || id === "elValue") el.textContent = fmtCurrency(value);
      else el.textContent = Number(value).toFixed(2);
    });

    renderHistogram("monteCarloHist", analysis.monteCarlo.histogram);
  }

  function renderHistogram(id, data) {
    const host = document.getElementById(id);
    if (!host) return;
    host.className = "bars";
    const maxCount = Math.max(...data.map((b) => b.c), 1);
    host.innerHTML = data
      .map((b) => `<div class="bar" style="height:${Math.max(3, (b.c / maxCount) * 100)}%" title="${(b.x * 100).toFixed(2)}%"></div>`)
      .join("");
  }

  function initResults() {
    computeScoring();
    computeRisk();
    computeStress();
    runMonteCarlo();
    computeLboAdjustment();
    saveAll();

    const summaryMap = {
      summaryScore: analysis.scores.global,
      summaryRating: analysis.scores.rating,
      summaryPd: analysis.risk.pd * 100,
      summaryEl: analysis.risk.el
    };
    Object.entries(summaryMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === "summaryRating") el.textContent = val;
      else if (id === "summaryEl") el.textContent = fmtCurrency(val);
      else el.textContent = Number(val).toFixed(2);
    });

    const comments = [
      autoComment("Structure", analysis.scores.pairs.structure),
      autoComment("Liquidité", analysis.scores.pairs.liquidite),
      autoComment("Business", analysis.scores.pairs.business),
      autoComment("Gouvernance", analysis.scores.pairs.gouvernance)
    ];
    const commentsEl = document.getElementById("autoComments");
    if (commentsEl) commentsEl.innerHTML = comments.map((c) => `<li>${c}</li>`).join("");

    const pairTable = document.getElementById("pairsTableBody");
    if (pairTable) {
      pairTable.innerHTML = Object.entries(analysis.scores.pairs)
        .map(([k, v]) => `<tr><td>${k}</td><td>${Number(v).toFixed(2)}</td><td>${riskBand(v)}</td></tr>`)
        .join("");
    }

    renderHeatmap("resultsHeatmap", analysis.scores.indicatorScores.leverage, analysis.scores.indicatorScores.coverage);
    renderHistogram("resultsHist", analysis.monteCarlo.histogram);
    renderLeverageChart("leverageChart");

    const saveBtn = document.getElementById("saveAnalysisBtn");
    saveBtn?.addEventListener("click", () => {
      saveAll();
      alert("Analyse enregistrée en localStorage.");
    });
  }

  function autoComment(label, score) {
    const risk = riskBand(score);
    if (risk === "Très faible" || risk === "Faible") return `${label}: profil solide, risque contenu.`;
    if (risk === "Moyen") return `${label}: points de vigilance modérés à surveiller.`;
    return `${label}: facteur de risque élevé, approfondir les leviers correctifs.`;
  }

  function renderLeverageChart(id) {
    const svg = document.getElementById(id);
    if (!svg) return;
    const b = analysis.inputs.balance;
    const i = analysis.inputs.income;
    const levSeries = YEAR_KEYS.map((y) => safeDiv(toNumber(b.shortTermDebt[y]) + toNumber(b.longTermDebt[y]) - toNumber(b.cash[y]), toNumber(i.ebitda[y]) || 1));
    const maxVal = Math.max(...levSeries, 1);
    const points = levSeries.map((v, idx) => {
      const x = 40 + idx * 150;
      const y = 190 - (v / maxVal) * 150;
      return `${x},${y}`;
    });
    svg.innerHTML = `
      <line x1="30" y1="190" x2="370" y2="190" stroke="#9aa9bb" />
      <line x1="30" y1="20" x2="30" y2="190" stroke="#9aa9bb" />
      <polyline points="${points.join(" ")}" fill="none" stroke="#1f4e79" stroke-width="3" />
      ${points
        .map((p, idx) => {
          const [x, y] = p.split(",");
          return `<circle cx="${x}" cy="${y}" r="4" fill="#0b2a4a"><title>${YEAR_KEYS[idx]}: ${levSeries[idx].toFixed(2)}</title></circle>`;
        })
        .join("")}
    `;
  }

  function initPdf() {
    const dateEl = document.getElementById("reportDate");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("fr-FR");
    document.getElementById("printBtn")?.addEventListener("click", () => {
      window.print();
    });
  }

  function initMethodology() {
    const fields = [
      ["weightStructure", methodology.weights.structure],
      ["weightLiquidity", methodology.weights.liquidite],
      ["weightBusiness", methodology.weights.business],
      ["weightGovernance", methodology.weights.gouvernance],
      ["pdA", methodology.pd.a],
      ["pdB", methodology.pd.b],
      ["pdHorizon", methodology.pd.horizonYears],
      ["stressEbitda", methodology.stress.ebitdaShock],
      ["stressRates", methodology.stress.ratesBps],
      ["lgdMin", methodology.lgd.min],
      ["lgdMax", methodology.lgd.max],
      ["eadCcf", methodology.ead.ccf],
      ["sectors", methodology.sectors.join(", ")]
    ];
    fields.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    renderMatrixTable("methodologyMatrix");

    document.getElementById("methodologyForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      methodology.weights.structure = toNumber(document.getElementById("weightStructure").value);
      methodology.weights.liquidite = toNumber(document.getElementById("weightLiquidity").value);
      methodology.weights.business = toNumber(document.getElementById("weightBusiness").value);
      methodology.weights.gouvernance = toNumber(document.getElementById("weightGovernance").value);
      methodology.pd.a = toNumber(document.getElementById("pdA").value);
      methodology.pd.b = toNumber(document.getElementById("pdB").value);
      methodology.pd.horizonYears = toNumber(document.getElementById("pdHorizon").value);
      methodology.stress.ebitdaShock = toNumber(document.getElementById("stressEbitda").value);
      methodology.stress.ratesBps = toNumber(document.getElementById("stressRates").value);
      methodology.lgd.min = toNumber(document.getElementById("lgdMin").value);
      methodology.lgd.max = toNumber(document.getElementById("lgdMax").value);
      methodology.ead.ccf = toNumber(document.getElementById("eadCcf").value);
      methodology.sectors = document
        .getElementById("sectors")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      saveAll();
      alert("Paramètres sauvegardés.");
    });
  }

  function fmtCurrency(n) {
    return `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  }

  function riskColor(score) {
    if (score <= 19) return "#0e8a16";
    if (score <= 39) return "#f2f50d";
    if (score <= 69) return "#f2b907";
    if (score <= 89) return "#f26419";
    return "#ed1c24";
  }

  function renderMatrixTable(id) {
    const table = document.getElementById(id);
    if (!table) return;
    const header = `<tr><th>A\\B</th>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}</tr>`;
    let selectedDone = false;
    const rows = Array.from({ length: 10 }, (_, rowIdx) => {
      const rowLabel = `<th>${rowIdx + 1}</th>`;
      const cells = Array.from({ length: 10 }, (_, colIdx) => {
        const val = PAIR_SCORE_MATRIX[rowIdx][colIdx];
        let selectedClass = "";
        if (!selectedDone && val === 90) {
          selectedClass = "matrix-cell-selected";
          selectedDone = true;
        }
        return `<td class="${selectedClass}" style="background:${riskColor(val)}">${val}</td>`;
      }).join("");
      return `<tr>${rowLabel}${cells}</tr>`;
    }).join("");
    table.innerHTML = `<thead>${header}</thead><tbody>${rows}</tbody>`;
  }

  function boot() {
    applyLayout();
    renderStepper();
    const page = document.body.dataset.page || "";

    if (page === "home") initHome();
    if (page === "simulation-preamble") initPreamble();
    if (page === "simulation-balance") initBalanceSheet();
    if (page === "simulation-income") initIncomeStatement();
    if (page === "simulation-cashflow") initCashflow();
    if (page === "simulation-economic") initEconomicBalance();
    if (page === "simulation-scoring") initScoring();
    if (page === "simulation-run") initRunPage();
    if (page === "report-results") initResults();
    if (page === "export-pdf") initPdf();
    if (page === "settings-methodology") initMethodology();

    saveAll();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
