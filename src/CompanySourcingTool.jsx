import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "./hooks/useTheme.js";
import { DashboardShell } from "./components/DashboardShell.jsx";
import { AppBar } from "./components/AppBar.jsx";
import { FilterDrawer } from "./components/FilterDrawer.jsx";
import { SettingsDrawer } from "./components/SettingsDrawer.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";

const VERTICALS = [
  "Metals & Mining","Bulk Materials","Bulk Liquids","Forestry & Lumber",
  "Structure Design & Analysis","Contractor Solutions","Equipment & Parts",
  "Waste & Recycling","Safety & Compliance",
];

const SOFTWARE_PRODUCTS = {
  "ERP & Operations": { icon:"⬡", description:"Enterprise resource planning, financials, procurement, and core ops", filters:{ "Module Focus":["Financials","Procurement","Inventory","HR & Payroll","Project Accounting","Multi-entity"], "Deployment":["Cloud (SaaS)","On-Premise","Hybrid"], "Pricing":["Per Seat","Usage-Based","Flat Fee","Custom Enterprise"], "Integrations":["API-First","EDI","Native Connectors","Open Source"] } },
  "Fleet & Asset Management": { icon:"◈", description:"Vehicle tracking, equipment lifecycle, maintenance scheduling", filters:{ "Asset Type":["Heavy Equipment","Fleet Vehicles","Fixed Assets","Mobile Equipment","Mixed Fleet"], "Capabilities":["GPS Tracking","Predictive Maintenance","Fuel Management","Telematics","Work Orders"], "Deployment":["Cloud (SaaS)","On-Premise","Mobile-First"], "Integrations":["OEM Telematics","ERP Connector","API-First","IoT Sensors"] } },
  "Safety & Compliance Management": { icon:"◎", description:"Incident reporting, audits, permits, regulatory compliance tracking", filters:{ "Capabilities":["Incident Reporting","Audit Management","Permit-to-Work","Risk Assessment","Training Tracking"], "Certifications":["ISO 45001","OSHA","ISO 14001","MSHA","EPA Compliance"], "Deployment":["Cloud (SaaS)","On-Premise","Hybrid","Mobile-First"], "Integrations":["API-First","ERP Connector","IoT/Sensors","Native Connectors"] } },
  "Field Service Management": { icon:"◇", description:"Work order dispatch, technician scheduling, job site coordination", filters:{ "Capabilities":["Work Order Management","Scheduling & Dispatch","Mobile Workforce","Customer Portal","Invoicing"], "Industry Fit":["Construction","Utilities","Mining","Oil & Gas","Forestry"], "Deployment":["Cloud (SaaS)","Mobile-First","Hybrid"], "Integrations":["ERP Connector","GPS/Maps","API-First","Accounting"] } },
  "Estimating & Bidding": { icon:"⬠", description:"Project cost estimation, bid management, takeoff tools", filters:{ "Capabilities":["Digital Takeoff","Cost Database","Bid Templates","Subcontractor Mgmt","Change Orders"], "Industry Fit":["Civil/Structural","Contractor","Mining","Forestry","Industrial"], "Deployment":["Cloud (SaaS)","Desktop","Hybrid"], "Integrations":["CAD/BIM","ERP Connector","Accounting","CRM"] } },
  "Supply Chain & Inventory": { icon:"◉", description:"Procurement, warehousing, demand planning, materials tracking", filters:{ "Capabilities":["Demand Planning","Warehouse Mgmt","Supplier Portal","Materials Tracking","Multi-location"], "Industry Fit":["Bulk Materials","Mining","Lumber","Chemicals","Manufacturing"], "Deployment":["Cloud (SaaS)","On-Premise","Hybrid"], "Integrations":["ERP Connector","EDI","API-First","IoT/RFID"] } },
  "Dispatch & Logistics": { icon:"◑", description:"Route optimization, load planning, carrier management, haul tracking", filters:{ "Capabilities":["Route Optimization","Load Planning","Carrier Management","Real-time Tracking","ePOD"], "Freight Type":["Bulk Liquid","Bulk Dry","Heavy Haul","Timber/Log","Waste/Recycling"], "Deployment":["Cloud (SaaS)","Mobile-First","Hybrid"], "Integrations":["Telematics","ERP Connector","API-First","EDI"] } },
  "Environmental & Waste Management": { icon:"◫", description:"Waste tracking, recycling ops, environmental reporting, regulatory filings", filters:{ "Capabilities":["Waste Manifests","Recycling Ops","Environmental Reporting","Regulatory Filings","Carbon Tracking"], "Certifications":["EPA","ISO 14001","RCRA","State DEQ","EU Taxonomy"], "Deployment":["Cloud (SaaS)","On-Premise","Hybrid"], "Integrations":["ERP Connector","API-First","GIS/Mapping","Lab Systems"] } },
  "Structural & Engineering Design": { icon:"△", description:"FEA, structural analysis, CAD/BIM, engineering calculation tools", filters:{ "Capabilities":["FEA / Simulation","Structural Analysis","BIM Integration","Load Calculations","Drawing Management"], "Industry Fit":["Civil Engineering","Mining","Industrial Facilities","Oil & Gas","Bridges & Infrastructure"], "Deployment":["Desktop","Cloud (SaaS)","Hybrid"], "Integrations":["CAD/BIM","API-First","ERP Connector","Cloud Rendering"] } },
  "Project Management": { icon:"▣", description:"Project scheduling, resource planning, budget tracking, collaboration", filters:{ "Capabilities":["Gantt / Scheduling","Resource Planning","Budget Tracking","Document Control","RFI & Submittals"], "Industry Fit":["Construction","Mining","Engineering","Forestry","Industrial"], "Deployment":["Cloud (SaaS)","Hybrid","Mobile-First"], "Integrations":["ERP Connector","CAD/BIM","API-First","Accounting"] } },
  "Maintenance Management (CMMS)": { icon:"⚙", description:"Preventive maintenance, work orders, parts inventory, downtime tracking", filters:{ "Capabilities":["Preventive Maintenance","Work Orders","Parts Inventory","Downtime Tracking","Condition Monitoring"], "Asset Focus":["Heavy Equipment","Plant & Facility","Vehicles","Mining Equipment","Processing Equipment"], "Deployment":["Cloud (SaaS)","On-Premise","Mobile-First"], "Integrations":["IoT/Sensors","ERP Connector","Telematics","API-First"] } },
  "Weighbridge & Ticketing": { icon:"◭", description:"Scale/weighbridge software, load ticketing, material reconciliation", filters:{ "Capabilities":["Scale Integration","Load Ticketing","Material Reconciliation","Driver Self-serve","Reporting"], "Industry Fit":["Bulk Materials","Mining","Waste & Recycling","Forestry","Quarry"], "Deployment":["On-Premise","Cloud (SaaS)","Hybrid"], "Integrations":["ERP Connector","Dispatch","API-First","Hardware/Scales"] } },
  "CRM & Sales": { icon:"◐", description:"Customer relationship management, quoting, pipeline, account management", filters:{ "Capabilities":["Pipeline Management","Quoting & CPQ","Account Management","Email Sequences","Reporting"], "Industry Fit":["Industrial B2B","Contractor","Equipment Dealer","Distributor","Services"], "Deployment":["Cloud (SaaS)","Hybrid"], "Integrations":["ERP Connector","Email/Calendar","API-First","Marketing Tools"] } },
  "HR & Workforce Management": { icon:"◯", description:"Payroll, time & attendance, scheduling, onboarding, certifications", filters:{ "Capabilities":["Payroll","Time & Attendance","Shift Scheduling","Onboarding","Cert Tracking"], "Industry Fit":["Construction","Mining","Forestry","Field Services","Industrial"], "Deployment":["Cloud (SaaS)","Mobile-First","Hybrid"], "Integrations":["ERP Connector","Payroll Providers","API-First","Biometric/Clock"] } },
  "Business Intelligence & Reporting": { icon:"▦", description:"Dashboards, KPIs, analytics, data integration, operational reporting", filters:{ "Capabilities":["Custom Dashboards","KPI Tracking","Data Integration","Predictive Analytics","Scheduled Reports"], "Industry Fit":["Mining","Contractor","Logistics","Manufacturing","Multi-site Ops"], "Deployment":["Cloud (SaaS)","On-Premise","Hybrid"], "Integrations":["ERP Connector","API-First","Data Warehouse","Native Connectors"] } },
};

const OWNERSHIP_TYPES = [
  "Any Ownership",
  "Founder-Operated",
  "Vintage PE",
  "Recent PE",
  "Unknown",
  "VC-Backed",
  "Private Equity",
  "Acquired",
  "Publicly Traded",
  "Family-Owned",
  "Employee-Owned (ESOP)",
];

const DEFAULT_PRODUCT_KEY = Object.keys(SOFTWARE_PRODUCTS)[0];

function inFoundedEra(year, label) {
  if (label === "Any Era" || year == null || Number.isNaN(Number(year))) return true;
  const y = Number(year);
  if (label === "Before 2017 (ideal)") return y < 2017;
  if (label === "Before 2010") return y < 2010;
  if (label === "2017–Present" || label === "2017-Present") return y >= 2017;
  if (label === "2020–Present") return y >= 2020;
  if (label === "2015–2019") return y >= 2015 && y <= 2019;
  if (label === "2010–2016") return y >= 2010 && y <= 2016;
  if (label === "2010–2014") return y >= 2010 && y <= 2014;
  if (label === "2000–2009") return y >= 2000 && y <= 2009;
  if (label === "Before 2000") return y < 2000;
  return true;
}

/** Midpoint headcount for UI band labels (aligns with server/score.js) */
function employeeBandMidpoint(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase().replace(/–/g, "-");
  if (t.includes("1000+") || t.includes("1,000+")) return 1500;
  if (t.includes("501") && t.includes("1,000")) return 750;
  if (t.includes("201") && t.includes("500")) return 350;
  if (t.includes("51") && t.includes("200")) return 125;
  if (t.includes("15") && t.includes("100")) return 57;
  if (t.includes("11") && t.includes("50")) return 30;
  if (t.includes("1-10") || t.includes("1–10")) return 5;
  return null;
}

function revenueBandMidpointMillions(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase().replace(/–/g, "-");
  if (t.includes("200m+") || t.includes("$200m")) return 300;
  if (t.includes("50m") && t.includes("200m")) return 125;
  if (t.includes("20m") && t.includes("50m")) return 35;
  if (t.includes("5m") && t.includes("20m")) return 12;
  if (t.includes("2m") && t.includes("10m")) return 6;
  if (t.includes("1m") && t.includes("5m")) return 3;
  if (t.includes("< $1m") || t.includes("<$1m")) return 0.5;
  return null;
}

function matchesEmployeeFilter(c, filter) {
  if (filter === "Any Size") return true;
  if (!c.employees) return true;
  if (filter === "15-100 (ideal)") {
    const mid = employeeBandMidpoint(c.employees);
    if (mid == null) return true;
    return mid >= 15 && mid <= 100;
  }
  return c.employees === filter;
}

function matchesRevenueFilter(c, filter) {
  if (filter === "Any Revenue") return true;
  if (!c.revenue) return true;
  if (filter === "$2M-$10M (ideal)") {
    const m = revenueBandMidpointMillions(c.revenue);
    if (m == null) return true;
    return m >= 2 && m <= 10;
  }
  return c.revenue === filter;
}

const REVENUE_RANGES = [
  "Any Revenue",
  "< $1M",
  "$1M-$5M",
  "$2M-$10M (ideal)",
  "$5M-$20M",
  "$20M-$50M",
  "$50M-$200M",
  "$200M+",
];
const EMPLOYEE_RANGES = [
  "Any Size",
  "1-10",
  "11-50",
  "15-100 (ideal)",
  "51-200",
  "201-500",
  "501-1,000",
  "1,000+",
];
const FOUNDED_RANGES = [
  "Any Era",
  "Before 2017 (ideal)",
  "Before 2010",
  "2017-Present",
  "2010-2016",
  "2000-2009",
  "Before 2000",
  "2020-Present",
  "2015-2019",
  "2010-2014",
];
const QUALITY_TIERS = ["—","Bronze","Silver","Gold","Platinum"];
const COMPANY_TYPES = ["Any Type", "Software", "Hardware", "Hybrid", "Unknown"];

function matchesCompanyTypeFilter(c, filter) {
  if (filter === "Any Type") return true;
  const t = (c.companyType || "unknown").toLowerCase();
  if (filter === "Software") return t === "software" || t === "unknown";
  if (filter === "Hardware") return t === "hardware" || t === "hybrid";
  if (filter === "Hybrid") return t === "hybrid";
  if (filter === "Unknown") return t === "unknown";
  return true;
}

const OWNER_BADGE_CLASS = {
  "VC-Backed": "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
  "Private Equity": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  "Founder-Owned": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Founder-Operated": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Vintage PE": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  "Recent PE": "border-indigo-500/35 bg-indigo-500/10 text-indigo-950 dark:text-indigo-100",
  Unknown: "border-border bg-muted text-muted-foreground",
  Acquired: "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100",
  "Family-Owned": "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100",
  "Employee-Owned (ESOP)": "border-rose-500/35 bg-rose-500/10 text-rose-950 dark:text-rose-100",
  "Publicly Traded": "border-lime-500/35 bg-lime-500/10 text-lime-950 dark:text-lime-100",
};

function ownerBadgeClasses(label) {
  return OWNER_BADGE_CLASS[label] || OWNER_BADGE_CLASS.Unknown;
}

function scoreTierClasses(score) {
  const s = typeof score === "number" ? score : 0;
  if (s >= 90) return "border-primary/50 bg-primary/10 text-primary";
  if (s >= 80) return "border-sky-500/45 bg-sky-500/10 text-sky-950 dark:text-sky-100";
  if (s >= 70) return "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100";
  return "border-orange-500/45 bg-orange-500/10 text-orange-950 dark:text-orange-100";
}

const COMPANY_TYPE_BADGE = {
  software: { lbl: "SW", cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100" },
  hardware: { lbl: "HW", cls: "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100" },
  hybrid: { lbl: "Hybrid", cls: "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100" },
  unknown: { lbl: "?", cls: "border-border bg-muted text-muted-foreground" },
};

function companyTypeBadge(companyType) {
  const t = (companyType || "unknown").toLowerCase();
  return COMPANY_TYPE_BADGE[t] || COMPANY_TYPE_BADGE.unknown;
}

const QUALITY_SELECT_CLASS = {
  "—": "",
  Bronze: "text-amber-900 dark:text-amber-100 border-amber-500/40",
  Silver: "text-slate-800 dark:text-slate-100 border-slate-400/40",
  Gold: "text-amber-950 dark:text-amber-50 border-amber-600/45",
  Platinum: "text-slate-900 dark:text-slate-50 border-slate-300/50",
};

const pillBase =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-data";

const defaultMeta = () => ({ website:"", contactName:"", role:"", email:"", quality:"—", comments:"" });

export default function CompanySourcingTool() {
  const [selectedProducts, setSelectedProducts] = useState([DEFAULT_PRODUCT_KEY]);
  const [selectedTagsByProduct, setSelectedTagsByProduct] = useState({});
  const [selectedVerticals, setSelectedVerticals] = useState([]);
  const [ownershipFilter, setOwnershipFilter] = useState("Any Ownership");
  const [companyTypeFilter, setCompanyTypeFilter] = useState("Any Type");
  const [revenueFilter, setRevenueFilter] = useState("Any Revenue");
  const [sizeFilter, setSizeFilter] = useState("Any Size");
  const [foundedFilter, setFoundedFilter] = useState("Any Era");
  const [maxCompanies, setMaxCompanies] = useState(500);
  const [breadth, setBreadth] = useState("focused");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchProgress, setSearchProgress] = useState(null);
  const [companyMeta, setCompanyMeta] = useState(() => {
    try {
      return JSON.parse(typeof localStorage !== "undefined" ? localStorage.getItem("sourcingCompanyMeta") || "{}" : "{}");
    } catch {
      return {};
    }
  });
  const [activeTab, setActiveTab] = useState("discover");
  const [sidebarSection, setSidebarSection] = useState("vertical");
  const [exportFlash, setExportFlash] = useState(false);
  const pendingDiscoveryBoostRef = useRef(null);
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recPreview, setRecPreview] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  /** Which product's tag filters are shown in Discover when multiple products are selected */
  const [discoverCapabilityProduct, setDiscoverCapabilityProduct] = useState(DEFAULT_PRODUCT_KEY);

  const [searchResults, setSearchResults] = useState([]);
  const [savedRows, setSavedRows] = useState([]);
  const [universeRows, setUniverseRows] = useState([]);
  const [universeTotal, setUniverseTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchLog, setSearchLog] = useState("");
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem("sourcingLlmProvider") || "none");
  const [apiStatus, setApiStatus] = useState({});
  const [thesisRequireMissionCritical, setThesisRequireMissionCritical] = useState(false);
  const [thesisRequireVertIntegrated, setThesisRequireVertIntegrated] = useState(false);
  const [thesisRequireProprietary, setThesisRequireProprietary] = useState(false);
  const [thesisRequireFounderVintage, setThesisRequireFounderVintage] = useState(false);
  const [minOwnershipConfidence, setMinOwnershipConfidence] = useState(0);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [savedContactExpanded, setSavedContactExpanded] = useState({});
  const resultsFilterInputRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  const activeProduct = selectedProducts[0] || DEFAULT_PRODUCT_KEY;

  useEffect(() => {
    setDiscoverCapabilityProduct((prev) =>
      selectedProducts.includes(prev) ? prev : selectedProducts[0] || DEFAULT_PRODUCT_KEY
    );
  }, [selectedProducts]);

  const capabilityFocusProduct = selectedProducts.includes(discoverCapabilityProduct)
    ? discoverCapabilityProduct
    : selectedProducts[0] || DEFAULT_PRODUCT_KEY;

  useEffect(() => {
    localStorage.setItem("sourcingCompanyMeta", JSON.stringify(companyMeta));
  }, [companyMeta]);

  useEffect(() => {
    localStorage.setItem("sourcingLlmProvider", llmProvider);
  }, [llmProvider]);

  const refreshApiStatus = useCallback(() => {
    fetch("/api/settings-status")
      .then((r) => r.json())
      .then(setApiStatus)
      .catch(() => setApiStatus({}));
  }, []);

  useEffect(() => {
    refreshApiStatus();
  }, [refreshApiStatus, settingsOpen]);

  const fetchSimilarRecommendations = useCallback(async () => {
    setRecLoading(true);
    try {
      const r = await fetch("/api/recommendations/from-saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { llmProvider }, maxSaved: 60 }),
      });
      const d = await r.json();
      setRecPreview(d);
      setRecModalOpen(true);
    } catch {
      setRecPreview({ ok: false, message: "Failed to fetch recommendations." });
      setRecModalOpen(true);
    } finally {
      setRecLoading(false);
    }
  }, [llmProvider]);

  const applyRecommendationPreview = () => {
    if (!recPreview?.ok || !Array.isArray(recPreview.selectedVerticals)) return;
    setSelectedVerticals(recPreview.selectedVerticals);
    const hinted = (recPreview.matchedProductHints || []).filter((x) => Object.keys(SOFTWARE_PRODUCTS).includes(String(x)));
    if (hinted.length) setSelectedProducts(hinted);
    pendingDiscoveryBoostRef.current = {
      additionalSearchQueries: [...(recPreview.additionalSearchQueries || [])],
      recommendationExaQueries: [...(recPreview.recommendationExaQueries || [])],
    };
    setRecModalOpen(false);
    setSidebarSection("vertical");
    setActiveTab("discover");
  };

  const loadSavedRows = useCallback(() => {
    fetch("/api/universe?savedOnly=1&limit=500")
      .then((r) => r.json())
      .then((d) => setSavedRows(d.companies || []))
      .catch(() => setSavedRows([]));
  }, []);

  const loadUniverseRows = useCallback(() => {
    fetch("/api/universe?limit=500&offset=0")
      .then((r) => r.json())
      .then((d) => {
        setUniverseRows(d.companies || []);
        setUniverseTotal(d.total || 0);
      })
      .catch(() => {
        setUniverseRows([]);
        setUniverseTotal(0);
      });
  }, []);

  const loadMoreUniverse = useCallback(() => {
    const offset = universeRows.length;
    fetch(`/api/universe?limit=500&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        const next = d.companies || [];
        setUniverseRows((prev) => [...prev, ...next]);
        setUniverseTotal(d.total || 0);
      })
      .catch(() => {});
  }, [universeRows.length]);

  useEffect(() => {
    loadSavedRows();
  }, [loadSavedRows]);

  useEffect(() => {
    if (activeTab === "universe") loadUniverseRows();
  }, [activeTab, loadUniverseRows]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSavedContact = (id) =>
    setSavedContactExpanded((p) => ({ ...p, [id]: !p[id] }));

  const toggleTag = (productName, group, tag) =>
    setSelectedTagsByProduct((prev) => {
      const prod = prev[productName] || {};
      const c = prod[group] || [];
      const nextTags = c.includes(tag) ? c.filter((t) => t !== tag) : [...c, tag];
      return { ...prev, [productName]: { ...prod, [group]: nextTags } };
    });

  const allSelectedTags = selectedProducts.flatMap((p) =>
    Object.values(selectedTagsByProduct[p] || {}).flat()
  );
  const toggleVertical = (v) =>
    setSelectedVerticals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const updateMeta = (id,field,val) => setCompanyMeta(prev=>({...prev,[id]:{...(prev[id]||defaultMeta()),[field]:val}}));

  const saveCompany = async (id, saved) => {
    try {
      const r = await fetch(`/api/companies/${id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved }),
      });
      const updated = await r.json();
      setSearchResults((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      if (saved && !companyMeta[id]) setCompanyMeta((p) => ({ ...p, [id]: defaultMeta() }));
      if (!saved) setCompanyMeta((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      loadSavedRows();
      loadUniverseRows();
    } catch {
      /* ignore */
    }
  };

  const patchClassify = async (id, body) => {
    try {
      const r = await fetch(`/api/companies/${id}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await r.json();
      setSearchResults((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      loadSavedRows();
      loadUniverseRows();
    } catch {
      /* ignore */
    }
  };

  const thesisFilterCount =
    (thesisRequireMissionCritical ? 1 : 0) +
    (thesisRequireVertIntegrated ? 1 : 0) +
    (thesisRequireProprietary ? 1 : 0) +
    (thesisRequireFounderVintage ? 1 : 0) +
    (minOwnershipConfidence > 0 ? 1 : 0);

  const activeFilterCount =
    allSelectedTags.length +
    selectedVerticals.length +
    (ownershipFilter !== "Any Ownership" ? 1 : 0) +
    (companyTypeFilter !== "Any Type" ? 1 : 0) +
    (revenueFilter !== "Any Revenue" ? 1 : 0) +
    (sizeFilter !== "Any Size" ? 1 : 0) +
    (foundedFilter !== "Any Era" ? 1 : 0) +
    thesisFilterCount;

  const clearAll = () => {
    setSelectedTagsByProduct({});
    setSelectedVerticals([]);
    setOwnershipFilter("Any Ownership");
    setCompanyTypeFilter("Any Type");
    setRevenueFilter("Any Revenue");
    setSizeFilter("Any Size");
    setFoundedFilter("Any Era");
    setThesisRequireMissionCritical(false);
    setThesisRequireVertIntegrated(false);
    setThesisRequireProprietary(false);
    setThesisRequireFounderVintage(false);
    setMinOwnershipConfidence(0);
  };

  const applyIdealProfile = () => {
    setFoundedFilter("Before 2017 (ideal)");
    setSizeFilter("15-100 (ideal)");
    setRevenueFilter("$2M-$10M (ideal)");
    setThesisRequireProprietary(true);
    setThesisRequireMissionCritical(true);
    setMinOwnershipConfidence(0.5);
  };

  const resetIdealProfile = () => {
    setFoundedFilter("Any Era");
    setSizeFilter("Any Size");
    setRevenueFilter("Any Revenue");
    setThesisRequireProprietary(false);
    setThesisRequireMissionCritical(false);
    setMinOwnershipConfidence(0);
  };

  const runSearch = async (findMore = false) => {
    setSearching(true);
    setSearchDone(false);
    setSearchError("");
    if (!findMore) setSearchResults([]);
    setSearchLog("Starting deterministic pipeline…");
    setSearchProgress(null);
    try {
      const excludeDomains = findMore
        ? searchResults.map((c) => c.domain).filter(Boolean)
        : [];
      const discoveryBoostSnap = pendingDiscoveryBoostRef.current;
      const payload = {
        activeProduct,
        selectedProducts,
        selectedTagsByProduct,
        selectedTags: allSelectedTags,
        selectedVerticals,
        ownershipFilter,
        revenueFilter,
        sizeFilter,
        foundedFilter,
        excludeDomains,
        maxCompanies,
        breadth,
        settings: { llmProvider },
        thesis: {
          requireMissionCritical: thesisRequireMissionCritical,
          requireVerticallyIntegrated: thesisRequireVertIntegrated,
          requireProprietary: thesisRequireProprietary,
          requireFounderVintage: thesisRequireFounderVintage,
          minOwnershipConfidence,
        },
        ...(discoveryBoostSnap
          ? {
              additionalSearchQueries: discoveryBoostSnap.additionalSearchQueries,
              recommendationExaQueries: discoveryBoostSnap.recommendationExaQueries,
            }
          : {}),
      };
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        pendingDiscoveryBoostRef.current = discoveryBoostSnap;
        throw new Error(`Search HTTP ${res.status}`);
      }
      const { jobId } = await res.json();
      if (!jobId) {
        pendingDiscoveryBoostRef.current = discoveryBoostSnap;
        throw new Error("No jobId returned");
      }
      pendingDiscoveryBoostRef.current = null;

      await new Promise((r) => setTimeout(r, 80));

      const es = new EventSource(`/api/search/${jobId}/stream`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "log") setSearchLog(msg.message || "");
          if (msg.type === "browserConsole" && typeof msg.message === "string") {
            if (msg.level === "warn") console.warn(msg.message);
            else console.log(msg.message);
          }
          if (msg.type === "progress") setSearchProgress({ processed: msg.processed, total: msg.total });
          if (msg.type === "company" && msg.company) {
            setSearchResults((prev) => {
              const c = msg.company;
              const i = prev.findIndex((x) => x.id === c.id);
              if (i >= 0) {
                const n = [...prev];
                n[i] = { ...n[i], ...c };
                return n;
              }
              return [...prev, c];
            });
          }
          if (msg.type === "error") {
            setSearchError(msg.message || "Search error");
            es.close();
            setSearching(false);
            setSearchDone(true);
            setSearchProgress(null);
          }
          if (msg.type === "done") {
            es.close();
            setSearching(false);
            setSearchDone(true);
            setSearchProgress(null);
            loadUniverseRows();
            loadSavedRows();
          }
        } catch {
          /* ignore malformed SSE */
        }
      };
      es.onerror = () => {
        es.close();
        setSearching(false);
        setSearchDone(true);
        setSearchError("Stream disconnected");
        setSearchProgress(null);
      };
    } catch (e) {
      setSearchError(e.message || "Search failed");
      setSearching(false);
      setSearchDone(true);
      setSearchProgress(null);
    }
  };

  // ── Excel Export ──
  const exportToExcel = async () => {
    let rowsSrc = savedRows;
    if (!rowsSrc.length) {
      try {
        const r = await fetch("/api/universe?savedOnly=1&limit=500");
        const d = await r.json();
        rowsSrc = d.companies || [];
        setSavedRows(rowsSrc);
      } catch {
        rowsSrc = [];
      }
    }
    if (!rowsSrc.length) return;
    const rows = rowsSrc.map((c) => {
      const m = companyMeta[c.id] || defaultMeta();
      const own = c.ownership_class || c.ownership || "";
      return {
        Website: m.website || c.website || "",
        Company: c.name,
        Vertical: (c.verticals || []).join(", "),
        Country: c.country || "",
        "Year Founded": c.foundedYear || "",
        Employees: c.employees || "",
        Quality: m.quality !== "—" ? m.quality : "",
        "Est. Revenue": c.revenue || "",
        Overview: c.description || "",
        Ownership: own,
        "Thesis Score": c.score ?? c.thesisScore ?? "",
        "Mission Critical (rule)": c.missionCriticalRule != null ? String(c.missionCriticalRule) : "",
        "Mission Critical (LLM)": c.missionCriticalLLM != null ? String(c.missionCriticalLLM) : "",
        "Mission Critical (manual)": c.manual_mission_critical || "",
        "Vertically Integrated (rule)": c.verticallyIntegratedRule != null ? String(c.verticallyIntegratedRule) : "",
        "Vertically Integrated (LLM)": c.verticallyIntegratedLLM != null ? String(c.verticallyIntegratedLLM) : "",
        "Vertically Integrated (manual)": c.manual_vertically_integrated || "",
        "Acquisition Year": (c.acquisitionHistory || []).map((a) => a.year).filter(Boolean).join("; ") || "",
        Acquirer: (c.acquisitionHistory || []).map((a) => a.acquirer).filter(Boolean).join("; ") || "",
        "Founder Still CEO": String(c.founderStillOperating ?? ""),
        "Ownership Confidence": c.ownership_confidence ?? "",
        "Classification Source": c.classificationSource || "",
        "Age score": c.ageScore ?? "",
        "Employee score": c.employeeScore ?? "",
        "Revenue score": c.revenueScore ?? "",
        "Company Type": c.companyType || "",
        "Company Type Confidence": typeof c.companyTypeConfidence === "number" ? c.companyTypeConfidence : "",
        "Company Type Bonus": c.companyTypeBonus ?? "",
        "Matched products": (c.matchedProducts || []).join("; "),
        Leadership: (c.leadership || []).map((L) => `${L.name} (${L.title})`).join("; "),
        HQ: c.hq || "",
        "Pricing model": c.pricingModel || "",
        "Tech hints": (c.techHints || []).join("; "),
        LinkedIn: c.social?.linkedin || "",
        "Headcount hint": c.employeesText || "",
        "Sources Found Via": (c.sourceTags || []).join(" · "),
        "Source URLs": (c.sources || []).join(" | "),
        "Contact Name": m.contactName,
        Role: m.role,
        Email: m.email,
        Comments: m.comments,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 35 },
      { wch: 25 },
      { wch: 28 },
      { wch: 8 },
      { wch: 13 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 55 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 28 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 40 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
      { wch: 40 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 28 },
      { wch: 36 },
      { wch: 28 },
      { wch: 16 },
      { wch: 32 },
      { wch: 28 },
      { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sourcing");
    XLSX.writeFile(wb, "sourcing-file.xlsx");
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 1800);
  };

  const commandItems = useMemo(
    () => [
      {
        id: "filters",
        label: "Open filters",
        group: "Layout",
        keywords: "drawer",
        action: () => setFilterDrawerOpen(true),
      },
      {
        id: "settings",
        label: "Open settings",
        group: "Layout",
        action: () => setSettingsOpen(true),
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        group: "Layout",
        action: () => toggleTheme(),
      },
      {
        id: "discover",
        label: "Go to Discover",
        group: "Navigate",
        action: () => setActiveTab("discover"),
      },
      {
        id: "saved",
        label: "Go to Saved",
        group: "Navigate",
        action: () => setActiveTab("saved"),
      },
      {
        id: "universe",
        label: "Go to Universe",
        group: "Navigate",
        action: () => setActiveTab("universe"),
      },
      {
        id: "focus-results",
        label: "Focus results search",
        group: "Discover",
        keywords: "filter find",
        action: () => {
          setActiveTab("discover");
          setTimeout(() => resultsFilterInputRef.current?.focus(), 0);
        },
      },
      {
        id: "run-search",
        label: "Run search",
        group: "Discover",
        keywords: "scan pipeline",
        action: () => {
          if (!searching) runSearch(false);
        },
      },
      {
        id: "find-more",
        label: "Find more (exclude current)",
        group: "Discover",
        action: () => {
          if (!searching && searchResults.length) runSearch(true);
        },
      },
      {
        id: "export",
        label: "Export to Excel",
        group: "Saved",
        action: () => exportToExcel(),
      },
    ],
    [searching, searchResults.length, theme, toggleTheme, runSearch, exportToExcel],
  );

  const displayedResults = searchResults
    .filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !(c.description || "").toLowerCase().includes(q) &&
          !(c.verticals || []).some((v) => v.toLowerCase().includes(q)) &&
          !(c.sourceTags || []).some((s) => String(s).toLowerCase().includes(q)) &&
          !(c.matchedProducts || []).some((p) => String(p).toLowerCase().includes(q))
        )
          return false;
      }
      if (ownershipFilter !== "Any Ownership") {
        const oc = c.ownership_class || c.ownership;
        if (oc !== ownershipFilter) return false;
      }
      if (!matchesCompanyTypeFilter(c, companyTypeFilter)) return false;
      if (revenueFilter !== "Any Revenue" && !matchesRevenueFilter(c, revenueFilter)) return false;
      if (sizeFilter !== "Any Size" && !matchesEmployeeFilter(c, sizeFilter)) return false;
      if (!inFoundedEra(c.foundedYear, foundedFilter)) return false;
      if (thesisRequireMissionCritical && !c.missionCritical) return false;
      if (thesisRequireVertIntegrated && !c.verticallyIntegrated) return false;
      if (thesisRequireProprietary && !c.proprietaryStack) return false;
      if (
        thesisRequireFounderVintage &&
        !["Founder-Operated", "Vintage PE"].includes(c.ownership_class || "")
      )
        return false;
      if (minOwnershipConfidence > 0 && (c.ownership_confidence || 0) < minOwnershipConfidence) return false;
      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <DashboardShell>
      <AppBar
        onOpenFilters={() => setFilterDrawerOpen(true)}
        activeFilterCount={activeFilterCount}
        searchDone={searchDone}
        searchResultsLength={searchResults.length}
        savedCount={savedRows.length}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      <div className="flex min-h-0 min-h-[calc(100vh-57px)] flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 md:px-6">
          <nav className="flex min-w-0">
            {[
              ["discover", "Discover"],
              ["saved", `Saved (${savedRows.length})`],
              ["universe", `Universe (${universeTotal})`],
            ].map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`border-b-2 px-3 py-3 text-ui font-semibold transition-colors sm:px-4 ${
                  activeTab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {lbl}
              </button>
            ))}
          </nav>
          {activeTab === "saved" && (
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2 sm:mb-0">
              <button
                type="button"
                onClick={() => fetchSimilarRecommendations()}
                disabled={recLoading || !savedRows.length}
                className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-data font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {recLoading ? "…" : "Suggest similar"}
              </button>
              <button
                type="button"
                onClick={exportToExcel}
                disabled={!savedRows.length}
                className={`inline-flex items-center gap-2 rounded-md border border-primary/30 px-3 py-2 text-data font-semibold transition-colors sm:mb-0 ${
                  exportFlash
                    ? "bg-primary text-primary-foreground"
                    : "text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                }`}
              >
                {exportFlash ? "Exported" : "Export Excel"}
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          {activeTab === "discover" && (
            <div className="animate-in-fade space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 md:p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <h1 className="text-ui font-semibold tracking-tight text-foreground">
                      Find companies
                    </h1>
                    <p className="text-data leading-relaxed text-muted-foreground">
                      Discovery is <span className="text-foreground/90">vertical-first</span>, then product filters narrow sources. Deterministic pipeline (PE portfolios, directories, optional Brave/Exa in{" "}
                      <code>.env</code>
                      ). Configure filters from the drawer — keyboard <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">⌘K</kbd> for commands.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilterDrawerOpen(true)}
                      className="text-left text-data text-primary hover:underline"
                    >
                      {activeFilterCount === 0
                        ? "No filters applied · Add filters"
                        : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active · Edit filters`}
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:flex-col lg:items-stretch">
                    <button
                      type="button"
                      onClick={() => runSearch(false)}
                      disabled={searching}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-ui font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {searching ? (
                        <>
                          <span className="animate-spin-slow inline-block">◌</span>
                          Scanning…
                        </>
                      ) : (
                        <>
                          <span aria-hidden>⌕</span>
                          Search all sources
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchSimilarRecommendations()}
                      disabled={searching || recLoading || savedRows.length === 0}
                      className="rounded-md border border-primary/40 bg-background px-4 py-2.5 text-ui font-medium text-primary shadow-sm transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Use saved companies to suggest verticals and extra search queries"
                    >
                      {recLoading ? "Analyzing…" : "Suggest similar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => runSearch(true)}
                      disabled={searching || !searchResults.length}
                      className="rounded-md border border-border bg-background px-4 py-2.5 text-ui font-medium text-foreground shadow-sm transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Exclude current domains and run again"
                    >
                      Find more
                    </button>
                  </div>
                </div>

                {searching && (
                  <div className="mt-4 space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-data text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary size-2 shrink-0 animate-pulse-soft rounded-full" aria-hidden />
                      <span>{searchLog}</span>
                    </div>
                    {searchProgress && searchProgress.total > 0 && (
                      <p className="text-muted-foreground">
                        Progress: {searchProgress.processed} / {searchProgress.total} enriched
                      </p>
                    )}
                  </div>
                )}
                {searchError && (
                  <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-data text-destructive">
                    {searchError}
                  </div>
                )}
              </div>

              {displayedResults.length > 0 && (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                    <span className="text-muted-foreground" aria-hidden>
                      ⌕
                    </span>
                    <input
                      ref={resultsFilterInputRef}
                      className="min-w-0 flex-1 bg-transparent text-data text-foreground outline-none placeholder:text-muted-foreground"
                      placeholder={`Filter ${displayedResults.length} results…`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <span className="shrink-0 tabular-nums text-data text-muted-foreground">
                      {displayedResults.length} shown
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {displayedResults.map((c) => {
                      const isExp = expandedCompany === c.id;
                      const isSaved = !!c.is_saved;
                      const ownLabel = c.ownership_class || c.ownership;
                      const ownCls = ownerBadgeClasses(ownLabel);
                      const scoreCls = scoreTierClasses(c.score);
                      const ctBad = companyTypeBadge(c.companyType);
                      const triageBtn = (field, val) => (
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-data text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            patchClassify(c.id, { [field]: val });
                          }}
                        >
                          {val}
                        </button>
                      );
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedCompany(isExp ? null : c.id);
                            }
                          }}
                          onClick={() => setExpandedCompany(isExp ? null : c.id)}
                          className={`cursor-pointer rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30 ${
                            isExp ? "ring-2 ring-primary/20" : ""
                          }`}
                        >
                          <div className="flex gap-3">
                            <div
                              className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-data font-semibold ${scoreCls}`}
                            >
                              {c.score ?? "—"}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="text-ui font-semibold text-foreground">{c.name}</span>
                                  {ownLabel && (
                                    <span className={`rounded border px-2 py-0.5 text-data ${ownCls}`}>{ownLabel}</span>
                                  )}
                                  <span
                                    title={`Company type: ${(c.companyType || "unknown").toLowerCase()}`}
                                    className={`rounded border px-2 py-0.5 text-data ${ctBad.cls}`}
                                  >
                                    {ctBad.lbl}
                                  </span>
                                  {c.classificationSource && (
                                    <span className="text-data text-muted-foreground">{c.classificationSource}</span>
                                  )}
                                  {c.foundedYear && (
                                    <span className="text-data text-muted-foreground">Est. {c.foundedYear}</span>
                                  )}
                                  {c.website && (
                                    <a
                                      href={c.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`${pillBase} border-border text-primary`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Website
                                    </a>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={`shrink-0 rounded-md border px-3 py-1 text-data font-medium transition-colors ${
                                    isSaved
                                      ? "border-primary/40 bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveCompany(c.id, !isSaved);
                                  }}
                                >
                                  {isSaved ? "Saved" : "Save"}
                                </button>
                              </div>
                              <p className="text-data text-muted-foreground">
                                MC:{c.missionCritical ? "Y" : "N"} · VI:{c.verticallyIntegrated ? "Y" : "N"} · Prop:
                                {c.proprietaryStack ? "Y" : "N"}
                                {typeof c.ownership_confidence === "number" && (
                                  <span className="ms-2">conf {c.ownership_confidence.toFixed(2)}</span>
                                )}
                              </p>
                              <p className="text-data leading-relaxed text-muted-foreground">{c.description}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(c.sourceTags || []).map((s) => (
                                  <span key={s} className={`${pillBase} border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100`}>
                                    {s}
                                  </span>
                                ))}
                                {(c.verticals || []).map((v) => (
                                  <span key={v} className={`${pillBase} border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100`}>
                                    {v}
                                  </span>
                                ))}
                                {(c.matchedProducts || []).map((mp) => (
                                  <span key={mp} className={`${pillBase} border-violet-500/30 bg-violet-500/5 text-violet-900 dark:text-violet-100`}>
                                    {mp}
                                  </span>
                                ))}
                                {(c.tags || []).map((t) => (
                                  <span key={t} className={`${pillBase} border-border bg-muted/50 text-muted-foreground`}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          {isExp && (
                            <div className="animate-in-fade mt-4 space-y-4 border-t border-border pt-4">
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                {[
                                  ["Founded", c.foundedYear || "—"],
                                  ["HQ", c.hq || "—"],
                                  ["Country", c.country || "—"],
                                  ["Employees", c.employees || "—"],
                                  ["Revenue", c.revenue || "—"],
                                ].map(([k, v]) => (
                                  <div key={k}>
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {k}
                                    </div>
                                    <div className="text-data text-foreground">{v}</div>
                                  </div>
                                ))}
                              </div>
                              {(c.matchedProducts || []).length > 0 && (
                                <p className="text-data text-muted-foreground">
                                  <span className="font-semibold uppercase tracking-wider text-data">Matched products</span>{" "}
                                  {(c.matchedProducts || []).join(" · ")}
                                </p>
                              )}
                              {c.companyType && (
                                <p className="text-data text-muted-foreground">
                                  Company type {c.companyType} (
                                  {(typeof c.companyTypeConfidence === "number" ? c.companyTypeConfidence : 0).toFixed(2)}) · bonus{" "}
                                  {c.companyTypeBonus ?? 0}
                                </p>
                              )}
                              {(typeof c.ageScore === "number" ||
                                typeof c.employeeScore === "number" ||
                                typeof c.revenueScore === "number") && (
                                <p className="text-data text-muted-foreground">
                                  Score parts — age {c.ageScore ?? "—"} · employees {c.employeeScore ?? "—"} · revenue{" "}
                                  {c.revenueScore ?? "—"}
                                </p>
                              )}
                              {(c.leadership || []).length > 0 && (
                                <p className="text-data text-muted-foreground">
                                  <span className="font-semibold uppercase tracking-wider text-data">Leadership</span>{" "}
                                  {(c.leadership || []).map((L, i) => (
                                    <span key={i}>
                                      {L.name} ({L.title})
                                      {i < (c.leadership || []).length - 1 ? "; " : ""}
                                    </span>
                                  ))}
                                </p>
                              )}
                              {c.employeesText && (
                                <p className="text-data text-muted-foreground">Headcount hint: {c.employeesText}</p>
                              )}
                              {c.pricingModel && <p className="text-data text-muted-foreground">Pricing: {c.pricingModel}</p>}
                              {(c.techHints || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {(c.techHints || []).map((h) => (
                                    <span key={h} className={`${pillBase} border-border text-muted-foreground`}>
                                      {h}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {c.social &&
                                (c.social.linkedin || c.social.twitter || c.social.youtube || c.social.github) && (
                                  <div className="flex flex-wrap gap-3 text-data" onClick={(e) => e.stopPropagation()}>
                                    {c.social.linkedin && (
                                      <a className="text-primary hover:underline" href={c.social.linkedin} target="_blank" rel="noopener noreferrer">
                                        LinkedIn
                                      </a>
                                    )}
                                    {c.social.twitter && (
                                      <a className="text-primary hover:underline" href={c.social.twitter} target="_blank" rel="noopener noreferrer">
                                        Twitter/X
                                      </a>
                                    )}
                                    {c.social.youtube && (
                                      <a className="text-primary hover:underline" href={c.social.youtube} target="_blank" rel="noopener noreferrer">
                                        YouTube
                                      </a>
                                    )}
                                    {c.social.github && (
                                      <a className="text-primary hover:underline" href={c.social.github} target="_blank" rel="noopener noreferrer">
                                        GitHub
                                      </a>
                                    )}
                                  </div>
                                )}
                              {(c.acquisitionHistory || []).length > 0 && (
                                <p className="text-data text-muted-foreground">
                                  <span className="font-semibold uppercase tracking-wider text-data">Acquisitions</span>{" "}
                                  {(c.acquisitionHistory || []).map((a, i) => (
                                    <span key={i}>
                                      {a.year || "?"} {a.acquirer || ""}
                                      {i < (c.acquisitionHistory || []).length - 1 ? "; " : ""}
                                    </span>
                                  ))}
                                </p>
                              )}
                              {(c.missionCriticalReasonLLM || c.verticalIntegrationReasonLLM) && (
                                <div className="space-y-1 text-data leading-relaxed text-muted-foreground">
                                  {c.missionCriticalReasonLLM && (
                                    <p>
                                      <span className="font-medium text-foreground">LLM MC:</span> {c.missionCriticalReasonLLM}
                                    </p>
                                  )}
                                  {c.verticalIntegrationReasonLLM && (
                                    <p>
                                      <span className="font-medium text-foreground">LLM VI:</span> {c.verticalIntegrationReasonLLM}
                                    </p>
                                  )}
                                </div>
                              )}
                              {(c.sources || []).length > 0 && (
                                <div className="space-y-1 text-data text-muted-foreground">
                                  {(c.sources || []).slice(0, 6).map((u, i) => (
                                    <div key={i}>
                                      <a
                                        href={u}
                                        className="break-all text-primary hover:underline"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {u}
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="text-data text-muted-foreground">
                                <div className="mb-2 font-medium text-foreground">Manual triage</div>
                                <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <span>Mission-critical</span>
                                  {triageBtn("manualMissionCritical", "yes")}
                                  {triageBtn("manualMissionCritical", "no")}
                                  {triageBtn("manualMissionCritical", "maybe")}
                                  {triageBtn("manualMissionCritical", "unset")}
                                  <span className="ms-2">Vertical</span>
                                  {triageBtn("manualVerticallyIntegrated", "yes")}
                                  {triageBtn("manualVerticallyIntegrated", "no")}
                                  {triageBtn("manualVerticallyIntegrated", "maybe")}
                                  {triageBtn("manualVerticallyIntegrated", "unset")}
                                </div>
                              </div>
                              {c.homepageTextSample && (
                                <pre className="max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                                  {String(c.homepageTextSample).slice(0, 1200)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!searching && !searchDone && searchResults.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <div className="mb-3 text-3xl" aria-hidden>
                    ⌕
                  </div>
                  <p className="text-ui font-medium text-foreground">Configure filters and run search</p>
                  <p className="mt-2 text-data">Use npm run dev. Add Brave/Exa keys in .env for broader coverage.</p>
                </div>
              )}
              {!searching && searchDone && displayedResults.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <p className="text-ui font-medium text-foreground">No results</p>
                  <p className="mt-2 text-data">Try broader filters in the filter drawer.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "saved" && (
            <div className="animate-in-fade space-y-4">
              {savedRows.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <p className="text-ui font-medium text-foreground">No saved companies</p>
                  <p className="mt-2 text-data">Save leads from Discover.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-ui font-semibold text-foreground">
                        {savedRows.length} {savedRows.length === 1 ? "company" : "companies"} in your file
                      </p>
                      <p className="mt-1 text-data text-muted-foreground">Add contacts, then export.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fetchSimilarRecommendations()}
                        disabled={recLoading}
                        className="rounded-md border border-primary/40 px-4 py-2 text-ui font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {recLoading ? "…" : "Suggest similar"}
                      </button>
                      <button
                        type="button"
                        onClick={exportToExcel}
                        className={`rounded-md border px-4 py-2 text-ui font-semibold transition-colors ${
                          exportFlash ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 text-primary hover:bg-primary/10"
                        }`}
                      >
                        {exportFlash ? "Exported" : "Export Excel"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    {savedRows.map((c) => {
                      const m = companyMeta[c.id] || defaultMeta();
                      const ownLabel = c.ownership_class || c.ownership;
                      const ownCls = ownerBadgeClasses(ownLabel);
                      const qCls = QUALITY_SELECT_CLASS[m.quality] || "";
                      const contactOpen = !!savedContactExpanded[c.id];
                      return (
                        <div
                          key={c.id}
                          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/20"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-ui font-semibold text-foreground">{c.name}</span>
                              {ownLabel && (
                                <span className={`rounded border px-2 py-0.5 text-data ${ownCls}`}>{ownLabel}</span>
                              )}
                              {c.hq && <span className="text-data text-muted-foreground">{c.hq}</span>}
                              {c.foundedYear && <span className="text-data text-muted-foreground">Est. {c.foundedYear}</span>}
                              {c.employees && <span className="text-data text-muted-foreground">{c.employees} emp</span>}
                              {c.revenue && <span className="text-data text-muted-foreground">{c.revenue}</span>}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => toggleSavedContact(c.id)}
                                className="rounded-md border border-border px-3 py-1.5 text-data font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                {contactOpen ? "Hide contact" : "Contact & CRM"}
                              </button>
                              <button
                                type="button"
                                onClick={() => saveCompany(c.id, false)}
                                className="rounded-md border border-destructive/40 px-3 py-1.5 text-data font-medium text-destructive hover:bg-destructive/10"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          {contactOpen && (
                            <div className="space-y-4 p-4">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {[
                                  ["Website", "website", "https://…"],
                                  ["Contact name", "contactName", "Full name"],
                                  ["Role", "role", "Title"],
                                  ["Email", "email", "email@co.com"],
                                ].map(([lbl, field, ph]) => (
                                  <div key={field}>
                                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {lbl}
                                    </label>
                                    <input
                                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                                      placeholder={ph}
                                      value={m[field]}
                                      onChange={(e) => updateMeta(c.id, field, e.target.value)}
                                    />
                                  </div>
                                ))}
                                <div>
                                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Quality
                                  </label>
                                  <select
                                    className={`w-full rounded-md border bg-background px-3 py-2 text-data outline-none focus:ring-2 focus:ring-primary/25 ${qCls}`}
                                    value={m.quality}
                                    onChange={(e) => updateMeta(c.id, "quality", e.target.value)}
                                  >
                                    {QUALITY_TIERS.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Comments
                                  </label>
                                  <input
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                                    placeholder="Notes, next steps…"
                                    value={m.comments}
                                    onChange={(e) => updateMeta(c.id, "comments", e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5 border-t border-border p-4 pt-3">
                            {(c.verticals || []).map((v) => (
                              <span key={v} className={`${pillBase} border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100`}>
                                {v}
                              </span>
                            ))}
                            {(c.products || []).map((p) => (
                              <span key={p} className={`${pillBase} border-border bg-muted/50 text-muted-foreground`}>
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "universe" && (
            <div className="animate-in-fade space-y-4">
              <p className="text-data text-muted-foreground">
                All companies in <code>universe.db</code> ({universeTotal} total, showing {universeRows.length}).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadUniverseRows}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                >
                  Refresh
                </button>
                {universeRows.length < universeTotal && (
                  <button
                    type="button"
                    onClick={loadMoreUniverse}
                    className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                  >
                    Load more
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {universeRows.map((c) => {
                  const ownLabel = c.ownership_class || c.ownership;
                  const ownCls = ownerBadgeClasses(ownLabel);
                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/25"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{c.name}</span>
                          {ownLabel && (
                            <span className={`rounded border px-2 py-0.5 text-data ${ownCls}`}>{ownLabel}</span>
                          )}
                          {c.is_saved && <span className="text-data font-medium text-primary">saved</span>}
                          <span className="truncate text-data text-muted-foreground">{c.domain}</span>
                        </div>
                        <div className="flex gap-2">
                          <a
                            className="rounded-md border border-border px-3 py-1.5 text-data text-primary hover:bg-muted"
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Site
                          </a>
                          <button
                            type="button"
                            onClick={() => saveCompany(c.id, !c.is_saved)}
                            className="rounded-md border border-border px-3 py-1.5 text-data font-medium hover:bg-muted"
                          >
                            {c.is_saved ? "Unsave" : "Save"}
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-data text-muted-foreground">
                        Score {(c.score ?? c.thesisScore) || "—"} · {(c.sourceTags || []).join(" · ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <FilterDrawer open={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)}>
        <div className="mb-4 flex gap-0 border-b border-border">
          {[
            ["vertical", "Vertical"],
            ["product", "Product"],
            ["company", "Company"],
            ["tags", "Tags"],
          ].map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSidebarSection(id)}
              className={`flex-1 border-b-2 py-2.5 text-data font-semibold uppercase tracking-wide transition-colors ${
                sidebarSection === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {sidebarSection === "vertical" && (
          <div className="space-y-3 animate-in-fade">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Industry verticals</p>
            <div className="flex flex-col gap-2">
              {VERTICALS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVertical(v)}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-data transition-colors ${
                    selectedVerticals.includes(v)
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <span style={{ opacity: selectedVerticals.includes(v) ? 1 : 0 }} className="w-3 shrink-0">
                    ✓
                  </span>
                  {v}
                </button>
              ))}
            </div>
            {selectedVerticals.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedVerticals([])}
                className="w-full rounded-md border border-border py-2 text-data text-muted-foreground hover:bg-muted"
              >
                Clear ({selectedVerticals.length})
              </button>
            )}
          </div>
        )}

        {sidebarSection === "product" && (
          <div className="space-y-3 animate-in-fade">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedProducts(Object.keys(SOFTWARE_PRODUCTS))}
                className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedProducts([DEFAULT_PRODUCT_KEY]);
                  setSelectedTagsByProduct({});
                }}
                className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
              >
                Clear
              </button>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Software type</p>
            <div className="flex flex-col border-t border-border">
              {Object.entries(SOFTWARE_PRODUCTS).map(([name, data]) => {
                const on = selectedProducts.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    title={data.description}
                    onClick={() => {
                      setSelectedProducts((prev) => {
                        if (prev.includes(name)) {
                          const next = prev.filter((x) => x !== name);
                          return next.length ? next : [DEFAULT_PRODUCT_KEY];
                        }
                        return [...prev, name];
                      });
                    }}
                    className={`flex w-full items-center gap-2 border-l-2 py-2.5 ps-3 text-left text-data transition-colors ${
                      on
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                    }`}
                  >
                    <span className="w-3 shrink-0" style={{ opacity: on ? 1 : 0 }}>
                      ✓
                    </span>
                    <span className="shrink-0">{data.icon}</span>
                    <span className="leading-snug">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sidebarSection === "company" && (
          <div className="space-y-3 animate-in-fade">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <button
                type="button"
                onClick={applyIdealProfile}
                className="w-full rounded-md bg-primary px-3 py-2 text-ui font-semibold text-primary-foreground"
              >
                Apply ideal profile
              </button>
              <button
                type="button"
                onClick={resetIdealProfile}
                className="w-full rounded-md border border-border py-2 text-data font-medium text-muted-foreground hover:bg-muted"
              >
                Reset profile filters
              </button>
              <p className="text-data leading-relaxed text-muted-foreground">
                Founded before 2017, 15–100 employees, $2–10M revenue, proprietary. Unknown revenue/employees are kept.
              </p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company attributes</p>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company type</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
              value={companyTypeFilter}
              onChange={(e) => setCompanyTypeFilter(e.target.value)}
            >
              {COMPANY_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ownership</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value)}
            >
              {OWNERSHIP_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
              value={revenueFilter}
              onChange={(e) => setRevenueFilter(e.target.value)}
            >
              {REVENUE_RANGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employees</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
            >
              {EMPLOYEE_RANGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Year founded</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
              value={foundedFilter}
              onChange={(e) => setFoundedFilter(e.target.value)}
            >
              {FOUNDED_RANGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PE thesis filters</p>
            <label className="flex items-center gap-2 text-data text-muted-foreground">
              <input type="checkbox" checked={thesisRequireMissionCritical} onChange={(e) => setThesisRequireMissionCritical(e.target.checked)} />
              Mission-critical
            </label>
            <label className="flex items-center gap-2 text-data text-muted-foreground">
              <input type="checkbox" checked={thesisRequireVertIntegrated} onChange={(e) => setThesisRequireVertIntegrated(e.target.checked)} />
              Vertically integrated
            </label>
            <label className="flex items-center gap-2 text-data text-muted-foreground">
              <input type="checkbox" checked={thesisRequireProprietary} onChange={(e) => setThesisRequireProprietary(e.target.checked)} />
              Proprietary stack
            </label>
            <label className="flex items-center gap-2 text-data text-muted-foreground">
              <input type="checkbox" checked={thesisRequireFounderVintage} onChange={(e) => setThesisRequireFounderVintage(e.target.checked)} />
              Founder-op or vintage PE
            </label>
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Min ownership confidence
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minOwnershipConfidence}
              onChange={(e) => setMinOwnershipConfidence(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-data text-muted-foreground">{minOwnershipConfidence.toFixed(2)}</p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="mt-3 w-full rounded-md border border-destructive/40 py-2 text-data font-medium text-destructive hover:bg-destructive/10"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {sidebarSection === "tags" && (
          <div className="space-y-4 animate-in-fade">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {selectedProducts.length} product categor{selectedProducts.length === 1 ? "y" : "ies"} selected
            </p>
            {selectedProducts.length > 1 && (
              <div className="space-y-2">
                <p className="text-data text-muted-foreground">Pick a category to edit capability tags</p>
                <div className="flex flex-wrap gap-2">
                  {selectedProducts.map((productName) => {
                    const pdata = SOFTWARE_PRODUCTS[productName];
                    if (!pdata) return null;
                    const active = capabilityFocusProduct === productName;
                    return (
                      <button
                        key={productName}
                        type="button"
                        onClick={() => setDiscoverCapabilityProduct(productName)}
                        className={`rounded-md border px-2.5 py-1.5 text-left text-data transition-colors ${
                          active
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span className="me-1">{pdata.icon}</span>
                        {productName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {(() => {
              const productName = capabilityFocusProduct;
              const pdata = SOFTWARE_PRODUCTS[productName];
              if (!pdata) return null;
              return (
                <div className="space-y-3 border-t border-border pt-3">
                  <div>
                    <span className="me-2">{pdata.icon}</span>
                    <span className="text-ui font-semibold text-foreground">{productName}</span>
                    <p className="mt-1 text-data leading-relaxed text-muted-foreground">{pdata.description}</p>
                  </div>
                  {Object.entries(pdata.filters).map(([group, tags]) => (
                    <div key={productName + group} className="space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => {
                          const active = ((selectedTagsByProduct[productName] || {})[group] || []).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(productName, group, tag)}
                              className={`rounded-md border px-2.5 py-1 text-data transition-colors ${
                                active
                                  ? "border-primary/50 bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:border-muted-foreground/50"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {selectedVerticals.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verticals</span>
                {selectedVerticals.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVertical(v)}
                    className={`${pillBase} border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-100`}
                  >
                    ✕ {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </FilterDrawer>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <p className="mb-4 text-data leading-relaxed text-muted-foreground">
          API keys stay in server <code>.env</code>. Status reflects what the server detected.
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Run options</p>
        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target volume</label>
        <input
          type="number"
          min={50}
          max={5000}
          step={50}
          value={maxCompanies}
          onChange={(e) => setMaxCompanies(Math.min(5000, Math.max(50, parseInt(e.target.value, 10) || 500)))}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
        />
        <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discovery breadth</label>
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
          value={breadth}
          onChange={(e) => setBreadth(e.target.value)}
        >
          <option value="focused">Focused</option>
          <option value="broad">Broad</option>
          <option value="exhaustive">Exhaustive</option>
        </select>
        <p className="mt-6 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">LLM classifier (optional)</p>
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
          value={llmProvider}
          onChange={(e) => setLlmProvider(e.target.value)}
        >
          {["none", "openai", "anthropic", "gemini", "ollama"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="mt-4 space-y-1 rounded-md border border-border bg-muted/30 p-3 font-mono text-data text-muted-foreground">
          <div>Brave: {apiStatus.brave ? "on" : "off"}</div>
          <div>Exa: {apiStatus.exa ? "on" : "off"}</div>
          <div>Apollo: {apiStatus.apollo ? "on" : "off"}</div>
          <div>Crunchbase: {apiStatus.crunchbase ? "on" : "off"}</div>
          <div>OpenAI: {apiStatus.openai ? "on" : "off"}</div>
          <div>Anthropic: {apiStatus.anthropic ? "on" : "off"}</div>
          <div>Gemini: {apiStatus.gemini ? "on" : "off"}</div>
        </div>
      </SettingsDrawer>

      {recModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-[1px] dark:bg-background/60"
          onClick={() => setRecModalOpen(false)}
          role="presentation">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="rec-modal-title">
            <h2 id="rec-modal-title" className="text-ui font-semibold text-foreground">
              Similar companies
            </h2>
            {!recPreview || !recPreview.ok ? (
              <p className="mt-3 text-data text-muted-foreground">{recPreview?.message || "No suggestion data."}</p>
            ) : (
              <div className="mt-3 space-y-4 text-data">
                <p className="text-muted-foreground">
                  Source: {recPreview.source === "llm" ? `LLM (${llmProvider})` : "Heuristic fallback"}
                </p>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested verticals</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(recPreview.selectedVerticals || []).map((v) => (
                      <span
                        key={v}
                        className="inline-flex rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-data text-amber-900 dark:text-amber-100">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                {(recPreview.matchedProductHints || []).length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product hints</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recPreview.matchedProductHints.map((p) => (
                        <span
                          key={p}
                          className="inline-flex rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-data text-primary">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Extra Brave queries</div>
                  <ul className="mt-2 max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-muted-foreground">
                    {(recPreview.additionalSearchQueries || []).map((q, i) => (
                      <li key={`${i}-${q.slice(0, 48)}`}>{q}</li>
                    ))}
                  </ul>
                </div>
                {(recPreview.recommendationExaQueries || []).length > 0 && apiStatus?.exa && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Exa neural</div>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                      {(recPreview.recommendationExaQueries || []).map((q, i) => (
                        <li key={`${i}-${q.slice(0, 48)}`}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-muted-foreground">
                  Apply updates your filters and attaches these queries to your{" "}
                  <span className="font-semibold text-foreground">next</span> search only, then clears them.
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRecModalOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-data font-medium text-muted-foreground hover:bg-muted">
                Close
              </button>
              {recPreview?.ok ? (
                <button
                  type="button"
                  onClick={applyRecommendationPreview}
                  className="rounded-md bg-primary px-4 py-2 text-ui font-semibold text-primary-foreground hover:opacity-95">
                  Apply & go to Discover
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} items={commandItems} />
    </DashboardShell>
  );
}
