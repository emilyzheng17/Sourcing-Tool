import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "./hooks/useTheme.js";
import { DashboardShell } from "./components/DashboardShell.jsx";
import { AppBar } from "./components/AppBar.jsx";
import { FilterDrawer } from "./components/FilterDrawer.jsx";
import { DiscoverFilterPanel } from "./components/DiscoverFilterPanel.jsx";
import { SettingsDrawer } from "./components/SettingsDrawer.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { BackToTopButton } from "./components/BackToTopButton.jsx";
import { DEFAULT_ALLOWED_COUNTRY_CODES } from "../shared/geoCountry.js";
import { companyPassesDiscoverFilters } from "../shared/discoverCompanyFilter.js";

// #region Config & constants
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

const SOFTWARE_PRODUCT_KEYS = Object.keys(SOFTWARE_PRODUCTS);

const PUBLIC_EXCLUSION_REASON = "public_listing";

function isPublicAutoExcluded(c) {
  return c?.exclusionReason === PUBLIC_EXCLUSION_REASON;
}

const OWNERSHIP_TYPES = [
  "Any Ownership",
  "Founder Owned",
  "Founder Operated",
  "VC Backed",
  "PE Owned",
  "Unknown",
];

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

const OWNER_BADGE_CLASS = {
  "Founder Owned": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Founder Operated": "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100",
  "VC Backed": "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
  "PE Owned": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  Unknown: "border-border bg-muted text-muted-foreground",
  // Legacy class names kept for existing DB rows
  "Founder-Owned": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Founder-Operated": "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100",
  "VC-Backed": "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
  "Private Equity": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  "Vintage PE": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  "Recent PE": "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  Acquired: "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  "Family-Owned": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Employee-Owned (ESOP)": "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  "Publicly Traded": "border-border bg-muted text-muted-foreground",
};
// #endregion

// #region UI helpers
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

function defaultUniverseCriteria() {
  return {
    ownershipFilter: "Any Ownership",
    companyTypeFilter: "Any Type",
    revenueFilter: "Any Revenue",
    sizeFilter: "Any Size",
    foundedFilter: "Any Era",
    thesisRequireMissionCritical: false,
    thesisRequireVertIntegrated: false,
    thesisRequireProprietary: false,
    thesisRequireFounderVintage: false,
    minOwnershipConfidence: 0,
    allowedCountryCodes: [...DEFAULT_ALLOWED_COUNTRY_CODES],
    selectedVerticals: [],
    selectedProducts: [],
    selectedTags: [],
  };
}

function countUniverseCriteriaFilters(c, strictVerticalFit) {
  const thesisFilterCount =
    (c.thesisRequireMissionCritical ? 1 : 0) +
    (c.thesisRequireVertIntegrated ? 1 : 0) +
    (c.thesisRequireProprietary ? 1 : 0) +
    (c.thesisRequireFounderVintage ? 1 : 0) +
    (c.minOwnershipConfidence > 0 ? 1 : 0);
  return (
    (c.selectedVerticals?.length || 0) +
    (c.selectedProducts?.length || 0) +
    (strictVerticalFit ? 1 : 0) +
    (c.ownershipFilter !== "Any Ownership" ? 1 : 0) +
    (c.companyTypeFilter !== "Any Type" ? 1 : 0) +
    (c.revenueFilter !== "Any Revenue" ? 1 : 0) +
    (c.sizeFilter !== "Any Size" ? 1 : 0) +
    (c.foundedFilter !== "Any Era" ? 1 : 0) +
    thesisFilterCount +
    ((c.allowedCountryCodes?.length || 0) > 0 ? 1 : 0)
  );
}
// #endregion

export default function CompanySourcingTool() {
  // #region State
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedVerticals, setSelectedVerticals] = useState([]);
  const [ownershipFilter, setOwnershipFilter] = useState("Any Ownership");
  const [companyTypeFilter, setCompanyTypeFilter] = useState("Any Type");
  const [revenueFilter, setRevenueFilter] = useState("Any Revenue");
  const [sizeFilter, setSizeFilter] = useState("Any Size");
  const [foundedFilter, setFoundedFilter] = useState("Any Era");
  const [maxCompanies, setMaxCompanies] = useState(1000);
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
  const [searchResults, setSearchResults] = useState([]);
  const [savedRows, setSavedRows] = useState([]);
  const [universeRows, setUniverseRows] = useState([]);
  const [universeTotal, setUniverseTotal] = useState(0);
  const [rejectedRows, setRejectedRows] = useState([]);
  const [rejectedTotal, setRejectedTotal] = useState(0);
  const [selectedDeletedAnchorIds, setSelectedDeletedAnchorIds] = useState([]);
  const [similarMatches, setSimilarMatches] = useState([]);
  const [similarModalOpen, setSimilarModalOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarMinScore, setSimilarMinScore] = useState(0.84);
  const [selectedSimilarIds, setSelectedSimilarIds] = useState([]);
  const [bulkRejectLoading, setBulkRejectLoading] = useState(false);
  const [restoreSelectedLoading, setRestoreSelectedLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchLog, setSearchLog] = useState("");
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem("sourcingLlmProvider") || "none");
  const [strictVerticalFit, setStrictVerticalFit] = useState(() => localStorage.getItem("sourcingStrictVerticalFit") === "1");
  const [apiStatus, setApiStatus] = useState({});
  const [thesisRequireMissionCritical, setThesisRequireMissionCritical] = useState(false);
  const [thesisRequireVertIntegrated, setThesisRequireVertIntegrated] = useState(false);
  const [thesisRequireProprietary, setThesisRequireProprietary] = useState(false);
  const [thesisRequireFounderVintage, setThesisRequireFounderVintage] = useState(false);
  const [minOwnershipConfidence, setMinOwnershipConfidence] = useState(0);
  const [allowedCountryCodes, setAllowedCountryCodes] = useState(() => [...DEFAULT_ALLOWED_COUNTRY_CODES]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [universeFilterDrawerOpen, setUniverseFilterDrawerOpen] = useState(false);
  const [universeSidebarSection, setUniverseSidebarSection] = useState("vertical");
  const [universeSelectedProducts, setUniverseSelectedProducts] = useState([]);
  const [universeSelectedVerticals, setUniverseSelectedVerticals] = useState([]);
  const [universeOwnershipFilter, setUniverseOwnershipFilter] = useState("Any Ownership");
  const [universeCompanyTypeFilter, setUniverseCompanyTypeFilter] = useState("Any Type");
  const [universeRevenueFilter, setUniverseRevenueFilter] = useState("Any Revenue");
  const [universeSizeFilter, setUniverseSizeFilter] = useState("Any Size");
  const [universeFoundedFilter, setUniverseFoundedFilter] = useState("Any Era");
  const [universeThesisRequireMissionCritical, setUniverseThesisRequireMissionCritical] = useState(false);
  const [universeThesisRequireVertIntegrated, setUniverseThesisRequireVertIntegrated] = useState(false);
  const [universeThesisRequireProprietary, setUniverseThesisRequireProprietary] = useState(false);
  const [universeThesisRequireFounderVintage, setUniverseThesisRequireFounderVintage] = useState(false);
  const [universeMinOwnershipConfidence, setUniverseMinOwnershipConfidence] = useState(0);
  const [universeAllowedCountryCodes, setUniverseAllowedCountryCodes] = useState(() => [...DEFAULT_ALLOWED_COUNTRY_CODES]);
  const [universeAppliedCriteria, setUniverseAppliedCriteria] = useState(defaultUniverseCriteria);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [savedContactExpanded, setSavedContactExpanded] = useState({});
  const resultsFilterInputRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  // Build Universe state
  const [buildDepth, setBuildDepth] = useState("standard");
  const [buildMaxCandidates, setBuildMaxCandidates] = useState(5000);
  const [buildMaxRunHours, setBuildMaxRunHours] = useState(8);
  const [buildStageBThreshold, setBuildStageBThreshold] = useState(40);
  const [buildUseOllama, setBuildUseOllama] = useState(false);
  const [buildBreadth, setBuildBreadth] = useState("exhaustive");
  const [buildVerticals, setBuildVerticals] = useState([]);
  const [buildProducts, setBuildProducts] = useState([]);
  const [buildJobId, setBuildJobId] = useState(null);
  const [buildStatus, setBuildStatus] = useState(null);
  const [buildStats, setBuildStats] = useState({ discovered: 0, basicEnriched: 0, fullyEnriched: 0, classified: 0, failed: 0, skipped: 0 });
  const [buildLog, setBuildLog] = useState("");
  const [buildStartedAt, setBuildStartedAt] = useState(null);
  const [buildHistory, setBuildHistory] = useState([]);
  const buildEventSourceRef = useRef(null);
  const mainScrollRef = useRef(null);
  // #endregion

  // #region Derived criteria
  const activeProduct = selectedProducts[0] ?? null;

  const discoverCriteriaForPredicate = useMemo(
    () => ({
      ownershipFilter,
      companyTypeFilter,
      revenueFilter,
      sizeFilter,
      foundedFilter,
      thesisRequireMissionCritical,
      thesisRequireVertIntegrated,
      thesisRequireProprietary,
      thesisRequireFounderVintage,
      minOwnershipConfidence,
      allowedCountryCodes,
      selectedVerticals,
      selectedProducts,
      selectedTags: [],
      strictVerticalFit,
    }),
    [
      ownershipFilter,
      companyTypeFilter,
      revenueFilter,
      sizeFilter,
      foundedFilter,
      thesisRequireMissionCritical,
      thesisRequireVertIntegrated,
      thesisRequireProprietary,
      thesisRequireFounderVintage,
      minOwnershipConfidence,
      allowedCountryCodes,
      selectedVerticals,
      selectedProducts,
      strictVerticalFit,
    ],
  );

  const universeCriteriaForPredicate = useMemo(
    () => ({
      ownershipFilter: universeOwnershipFilter,
      companyTypeFilter: universeCompanyTypeFilter,
      revenueFilter: universeRevenueFilter,
      sizeFilter: universeSizeFilter,
      foundedFilter: universeFoundedFilter,
      thesisRequireMissionCritical: universeThesisRequireMissionCritical,
      thesisRequireVertIntegrated: universeThesisRequireVertIntegrated,
      thesisRequireProprietary: universeThesisRequireProprietary,
      thesisRequireFounderVintage: universeThesisRequireFounderVintage,
      minOwnershipConfidence: universeMinOwnershipConfidence,
      allowedCountryCodes: universeAllowedCountryCodes,
      selectedVerticals: universeSelectedVerticals,
      selectedProducts: universeSelectedProducts,
      selectedTags: [],
    }),
    [
      universeOwnershipFilter,
      universeCompanyTypeFilter,
      universeRevenueFilter,
      universeSizeFilter,
      universeFoundedFilter,
      universeThesisRequireMissionCritical,
      universeThesisRequireVertIntegrated,
      universeThesisRequireProprietary,
      universeThesisRequireFounderVintage,
      universeMinOwnershipConfidence,
      universeAllowedCountryCodes,
      universeSelectedVerticals,
      universeSelectedProducts,
    ],
  );
  // #endregion

  // #region Effects & API loading
  useEffect(() => {
    localStorage.setItem("sourcingCompanyMeta", JSON.stringify(companyMeta));
  }, [companyMeta]);

  useEffect(() => {
    localStorage.setItem("sourcingLlmProvider", llmProvider);
  }, [llmProvider]);

  useEffect(() => {
    localStorage.setItem("sourcingStrictVerticalFit", strictVerticalFit ? "1" : "0");
  }, [strictVerticalFit]);

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
    const hinted = (recPreview.matchedProductHints || []).filter((x) => SOFTWARE_PRODUCT_KEYS.includes(String(x)));
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

  const fetchUniverseFirstPage = useCallback(
    async (signal, criteriaOverride) => {
      const criteria = {
        ...(criteriaOverride ?? universeAppliedCriteria),
        strictVerticalFit,
        textQuery: "",
      };
      try {
        const r = await fetch("/api/universe/query", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ criteria, offset: 0, limit: 500 }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) {
          setUniverseRows([]);
          setUniverseTotal(0);
          return;
        }
        setUniverseRows(d.companies || []);
        setUniverseTotal(d.total ?? 0);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setUniverseRows([]);
        setUniverseTotal(0);
      }
    },
    [universeAppliedCriteria, strictVerticalFit],
  );

  const loadUniverseRows = useCallback(() => {
    fetchUniverseFirstPage();
  }, [fetchUniverseFirstPage]);

  const applyUniverseFilters = useCallback(() => {
    const next = { ...universeCriteriaForPredicate };
    setUniverseAppliedCriteria(next);
    fetchUniverseFirstPage(undefined, next);
    setUniverseFilterDrawerOpen(false);
  }, [universeCriteriaForPredicate, fetchUniverseFirstPage]);


  const loadMoreUniverse = useCallback(() => {
    const offset = universeRows.length;
    const criteria = { ...universeAppliedCriteria, strictVerticalFit, textQuery: "" };
    fetch("/api/universe/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criteria, offset, limit: 500 }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!r.ok || d.ok === false) return;
        const next = d.companies || [];
        setUniverseRows((prev) => [...prev, ...next]);
        setUniverseTotal(d.total ?? 0);
      })
      .catch(() => {});
  }, [universeRows.length, universeAppliedCriteria, strictVerticalFit]);

  const loadRejectedRows = useCallback(() => {
    fetch("/api/universe?rejectedOnly=1&limit=500&offset=0")
      .then((r) => r.json())
      .then((d) => {
        setRejectedRows(d.companies || []);
        setRejectedTotal(d.total || 0);
      })
      .catch(() => {
        setRejectedRows([]);
        setRejectedTotal(0);
      });
  }, []);

  const loadMoreRejected = useCallback(() => {
    const offset = rejectedRows.length;
    fetch(`/api/universe?rejectedOnly=1&limit=500&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        const next = d.companies || [];
        setRejectedRows((prev) => [...prev, ...next]);
        setRejectedTotal(d.total || 0);
      })
      .catch(() => {});
  }, [rejectedRows.length]);

  const refreshRejectedTotal = useCallback(() => {
    fetch("/api/universe?rejectedOnly=1&limit=1&offset=0")
      .then((r) => r.json())
      .then((d) => setRejectedTotal(d.total || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSavedRows();
    refreshRejectedTotal();
  }, [loadSavedRows, refreshRejectedTotal]);

  useEffect(() => {
    if (activeTab !== "universe") return undefined;
    const ac = new AbortController();
    fetchUniverseFirstPage(ac.signal);
    return () => ac.abort();
    // Only refetch when entering the universe tab; Apply / Refresh trigger loads explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "deleted") loadRejectedRows();
  }, [activeTab, loadRejectedRows]);

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
  // #endregion

  // #region Handlers
  const toggleSavedContact = (id) =>
    setSavedContactExpanded((p) => ({ ...p, [id]: !p[id] }));

  const toggleVertical = (v) =>
    setSelectedVerticals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const toggleUniverseVertical = (v) =>
    setUniverseSelectedVerticals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const updateMeta = (id,field,val) => setCompanyMeta(prev=>({...prev,[id]:{...(prev[id]||defaultMeta()),[field]:val}}));
  // #endregion

  // #region API — company mutations
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

  const setCompanyRejected = async (id, rejected) => {
    try {
      const r = await fetch(`/api/companies/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejected }),
      });
      const updated = await r.json();
      if (!r.ok) {
        window.alert(updated?.message || `Could not update company (HTTP ${r.status}).`);
        return;
      }
      setSearchResults((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      if (rejected) {
        setExpandedCompany((e) => (e === id ? null : e));
        setCompanyMeta((p) => {
          const n = { ...p };
          delete n[id];
          return n;
        });
      }
      loadSavedRows();
      loadUniverseRows();
      refreshRejectedTotal();
      if (activeTab === "deleted") loadRejectedRows();
    } catch {
      /* ignore */
    }
  };

  const toggleDeletedAnchor = (id) => {
    setSelectedDeletedAnchorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const runSimilarToRejected = async () => {
    if (!selectedDeletedAnchorIds.length) return;
    setSimilarLoading(true);
    setSelectedSimilarIds([]);
    try {
      const r = await fetch("/api/universe/similar-to-rejected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorIds: selectedDeletedAnchorIds,
          limit: 100,
          minScore: similarMinScore,
        }),
      });
      const d = await r.json();
      const matches = d.matches || [];
      setSimilarMatches(matches);
      setSimilarModalOpen(true);
    } catch {
      setSimilarMatches([]);
    } finally {
      setSimilarLoading(false);
    }
  };

  const toggleSimilarSelected = (id) => {
    setSelectedSimilarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const bulkRejectSimilarSelected = async () => {
    if (!selectedSimilarIds.length) return;
    setBulkRejectLoading(true);
    try {
      const r = await fetch("/api/companies/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedSimilarIds }),
      });
      await r.json();
      setSelectedSimilarIds([]);
      setSimilarModalOpen(false);
      setSimilarMatches([]);
      loadSavedRows();
      loadUniverseRows();
      refreshRejectedTotal();
      loadRejectedRows();
    } catch {
      /* ignore */
    } finally {
      setBulkRejectLoading(false);
    }
  };

  const restoreSelectedFromDeleted = async () => {
    const ids = [...new Set(selectedDeletedAnchorIds.map((x) => Number(x)).filter(Number.isFinite))];
    const restorableIds = ids.filter((id) => {
      const row = rejectedRows.find((c) => c.id === id);
      return !row || !isPublicAutoExcluded(row);
    });
    if (!restorableIds.length) {
      window.alert("Selected companies were auto-excluded as publicly listed and cannot be restored.");
      return;
    }
    if (restorableIds.length < ids.length) {
      window.alert(
        `${ids.length - restorableIds.length} publicly listed exclusion(s) skipped; restoring ${restorableIds.length} other(s).`
      );
    }
    const n = restorableIds.length;
    if (
      !window.confirm(
        `Restore ${n} selected ${n === 1 ? "company" : "companies"} to the active universe?`
      )
    ) {
      return;
    }
    setRestoreSelectedLoading(true);
    try {
      const r = await fetch("/api/companies/bulk-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: restorableIds }),
      });
      let d = {};
      try {
        d = await r.json();
      } catch {
        window.alert("Restore failed: could not read server response. Is the API running?");
        return;
      }
      if (!r.ok) {
        window.alert(d.message || `Restore failed (HTTP ${r.status}).`);
        return;
      }
      if (!d.ok) {
        window.alert(d.message || "Restore was not applied.");
        return;
      }
      const restored = new Set(restorableIds);
      setSelectedDeletedAnchorIds([]);
      setSearchResults((prev) =>
        prev.map((c) => (restored.has(c.id) ? { ...c, is_rejected: false } : c))
      );
      loadSavedRows();
      loadUniverseRows();
      refreshRejectedTotal();
      loadRejectedRows();
      if (typeof d.restoredCount === "number" && d.restoredCount === 0 && n > 0) {
        window.alert(
          "No rows were updated. Those companies may already be active, or IDs may be out of sync. Try Refresh on this tab."
        );
      }
    } catch (e) {
      window.alert(e?.message || "Restore failed.");
    } finally {
      setRestoreSelectedLoading(false);
    }
  };
  // #endregion

  // #region Filters
  const thesisFilterCount =
    (thesisRequireMissionCritical ? 1 : 0) +
    (thesisRequireVertIntegrated ? 1 : 0) +
    (thesisRequireProprietary ? 1 : 0) +
    (thesisRequireFounderVintage ? 1 : 0) +
    (minOwnershipConfidence > 0 ? 1 : 0);

  const activeFilterCount =
    selectedVerticals.length +
    selectedProducts.length +
    (strictVerticalFit ? 1 : 0) +
    (ownershipFilter !== "Any Ownership" ? 1 : 0) +
    (companyTypeFilter !== "Any Type" ? 1 : 0) +
    (revenueFilter !== "Any Revenue" ? 1 : 0) +
    (sizeFilter !== "Any Size" ? 1 : 0) +
    (foundedFilter !== "Any Era" ? 1 : 0) +
    thesisFilterCount +
    (allowedCountryCodes.length > 0 ? 1 : 0);

  const universeActiveFilterCount = countUniverseCriteriaFilters(
    universeCriteriaForPredicate,
    strictVerticalFit,
  );

  const universeAppliedFilterCount = useMemo(
    () => countUniverseCriteriaFilters(universeAppliedCriteria, strictVerticalFit),
    [universeAppliedCriteria, strictVerticalFit],
  );

  const clearAll = () => {
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
    setAllowedCountryCodes([]);
  };

  const clearAllUniverse = () => {
    setUniverseSelectedVerticals([]);
    setUniverseSelectedProducts([]);
    setUniverseOwnershipFilter("Any Ownership");
    setUniverseCompanyTypeFilter("Any Type");
    setUniverseRevenueFilter("Any Revenue");
    setUniverseSizeFilter("Any Size");
    setUniverseFoundedFilter("Any Era");
    setUniverseThesisRequireMissionCritical(false);
    setUniverseThesisRequireVertIntegrated(false);
    setUniverseThesisRequireProprietary(false);
    setUniverseThesisRequireFounderVintage(false);
    setUniverseMinOwnershipConfidence(0);
    setUniverseAllowedCountryCodes([...DEFAULT_ALLOWED_COUNTRY_CODES]);
  };

  const clearUniverseFiltersAndReload = useCallback(() => {
    clearAllUniverse();
    const next = defaultUniverseCriteria();
    setUniverseAppliedCriteria(next);
    fetchUniverseFirstPage(undefined, next);
  }, [fetchUniverseFirstPage]);

  const applyIdealProfile = () => {
    setFoundedFilter("Before 2017 (ideal)");
    setSizeFilter("15-100 (ideal)");
    setRevenueFilter("$2M-$10M (ideal)");
    setThesisRequireProprietary(true);
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

  const applyIdealProfileUniverse = () => {
    setUniverseFoundedFilter("Before 2017 (ideal)");
    setUniverseSizeFilter("15-100 (ideal)");
    setUniverseRevenueFilter("$2M-$10M (ideal)");
    setUniverseThesisRequireProprietary(true);
    setUniverseMinOwnershipConfidence(0.5);
  };

  const resetIdealProfileUniverse = () => {
    setUniverseFoundedFilter("Any Era");
    setUniverseSizeFilter("Any Size");
    setUniverseRevenueFilter("Any Revenue");
    setUniverseThesisRequireProprietary(false);
    setUniverseThesisRequireMissionCritical(false);
    setUniverseMinOwnershipConfidence(0);
  };
  // #endregion

  // #region Search pipeline
  const runSearch = async (findMore = false) => {
    if (selectedProducts.length === 0) {
      setSearchError("Select at least one software category under Filters → Product before searching.");
      return;
    }
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
        selectedTagsByProduct: {},
        selectedTags: [],
        selectedVerticals,
        ownershipFilter,
        revenueFilter,
        sizeFilter,
        foundedFilter,
        excludeDomains,
        maxCompanies,
        breadth,
        settings: { llmProvider },
        strictVerticalFit,
        allowedCountries: allowedCountryCodes,
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

  // #endregion

  // #region Build Universe
  const fetchBuildHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/universe/builds");
      const d = await r.json();
      if (d.ok) setBuildHistory(d.builds || []);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (activeTab === "build") fetchBuildHistory();
  }, [activeTab, fetchBuildHistory]);

  const startBuild = async () => {
    setBuildStatus("starting");
    setBuildStats({ discovered: 0, basicEnriched: 0, fullyEnriched: 0, classified: 0, failed: 0, skipped: 0 });
    setBuildLog("Starting overnight universe build...");
    setBuildStartedAt(Date.now());
    try {
      const payload = {
        selectedVerticals: buildVerticals,
        selectedProducts: buildProducts,
        maxCandidates: buildMaxCandidates,
        maxRunTimeHours: buildMaxRunHours,
        depth: buildDepth,
        stageBThreshold: buildStageBThreshold,
        useOllama: buildUseOllama,
        breadth: buildBreadth,
      };
      const res = await fetch("/api/universe/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { jobId } = await res.json();
      setBuildJobId(jobId);
      setBuildStatus("running");

      if (buildEventSourceRef.current) buildEventSourceRef.current.close();
      const es = new EventSource(`/api/universe/build/${jobId}/stream`);
      buildEventSourceRef.current = es;
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type?.startsWith("build:log")) {
            setBuildLog(msg.message || "");
          }
          if (msg.discovered !== undefined) {
            setBuildStats((prev) => ({
              ...prev,
              discovered: msg.discovered ?? prev.discovered,
              basicEnriched: msg.basicEnriched ?? prev.basicEnriched,
              fullyEnriched: msg.fullyEnriched ?? prev.fullyEnriched,
              classified: msg.classified ?? prev.classified,
              failed: msg.failed ?? prev.failed,
              skipped: msg.skipped ?? prev.skipped,
            }));
          }
          if (msg.type === "build:error") {
            setBuildStatus("error");
            setBuildLog(msg.message || "Build error");
          }
          if (msg.type === "build:timeout") {
            setBuildStatus("stopped");
            setBuildLog("Run ended: maximum run time reached.");
            es.close();
            buildEventSourceRef.current = null;
            fetchBuildHistory();
          }
        } catch { /* */ }
      };
      es.onerror = () => {
        es.close();
        buildEventSourceRef.current = null;
      };
    } catch (e) {
      setBuildStatus("error");
      setBuildLog(e.message || "Failed to start build");
    }
  };

  const pauseBuild = async () => {
    if (!buildJobId) return;
    await fetch(`/api/universe/build/${buildJobId}/pause`, { method: "POST" });
    setBuildStatus("paused");
  };

  const resumeBuildFn = async () => {
    if (!buildJobId) return;
    await fetch(`/api/universe/build/${buildJobId}/resume`, { method: "POST" });
    setBuildStatus("running");
  };

  const stopBuildFn = async () => {
    if (!buildJobId) return;
    await fetch(`/api/universe/build/${buildJobId}/stop`, { method: "POST" });
    setBuildStatus("stopped");
    if (buildEventSourceRef.current) {
      buildEventSourceRef.current.close();
      buildEventSourceRef.current = null;
    }
    fetchBuildHistory();
  };

  const buildElapsed = buildStartedAt ? Math.round((Date.now() - buildStartedAt) / 1000) : 0;
  const buildThroughput = buildElapsed > 10 && buildStats.discovered > 0
    ? Math.round((buildStats.discovered / buildElapsed) * 3600)
    : null;
  const buildRemainingSeconds = buildStartedAt
    ? Math.max(0, Math.round(buildMaxRunHours * 3600 - buildElapsed))
    : null;
  const buildRemainingLabel =
    buildRemainingSeconds == null
      ? null
      : `${Math.floor(buildRemainingSeconds / 3600)}h ${Math.floor((buildRemainingSeconds % 3600) / 60)}m remaining`;
  // #endregion

  // #region Excel export
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
        "Industry match (scraped)": (c.verticals || []).join(", "),
        "Search verticals": (c.searchVerticals || []).join(", "),
        "Vertical fit score": typeof c.verticalFitScore === "number" ? c.verticalFitScore : "",
        "Vertical fit notes": (c.verticalFitReasons || []).join(" | "),
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
      { wch: 26 },
      { wch: 22 },
      { wch: 10 },
      { wch: 36 },
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
  // #endregion

  // #region Command palette
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
        id: "build",
        label: "Go to Build Universe",
        group: "Navigate",
        keywords: "overnight builder",
        action: () => setActiveTab("build"),
      },
      {
        id: "deleted",
        label: "Go to Deleted",
        group: "Navigate",
        action: () => setActiveTab("deleted"),
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
    [searching, searchResults.length, selectedProducts.length, theme, toggleTheme, runSearch, exportToExcel],
  );

  const displayedResults = searchResults
    .filter((c) =>
      companyPassesDiscoverFilters(c, {
        ...discoverCriteriaForPredicate,
        textQuery: searchQuery,
        excludeRejected: true,
      }),
    )
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  // #endregion

  // #region Render
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
              ["build", "Build Universe"],
              ["deleted", `Deleted (${rejectedTotal})`],
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

        <div ref={mainScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          {/* Discover tab */}
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
                      disabled={searching || selectedProducts.length === 0}
                      title={selectedProducts.length === 0 ? "Choose at least one software category in Filters → Product" : undefined}
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
                      disabled={searching || !searchResults.length || selectedProducts.length === 0}
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
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border border-destructive/40 px-3 py-1 text-data font-medium text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCompanyRejected(c.id, true);
                                    }}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    className={`rounded-md border px-3 py-1 text-data font-medium transition-colors ${
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
                                {(c.verticals || []).length > 0 ? (
                                  (c.verticals || []).map((v) => (
                                    <span key={v} className={`${pillBase} border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100`}>
                                      {v}
                                    </span>
                                  ))
                                ) : (c.searchVerticals || []).length > 0 ? (
                                  <span className={`${pillBase} border-muted-foreground/30 bg-muted/40 text-muted-foreground`}>
                                    No scraped industry match
                                    {typeof c.verticalFitScore === "number" ? ` (${c.verticalFitScore})` : ""}
                                  </span>
                                ) : null}
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
                              {(c.searchVerticals || []).length > 0 && (
                                <p className="text-data text-muted-foreground">
                                  <span className="font-semibold text-foreground">Search verticals</span> {" "}
                                  {(c.searchVerticals || []).join(" · ")}
                                  {typeof c.verticalFitScore === "number" && (
                                    <>
                                      {" "}
                                      · Overall fit score {c.verticalFitScore}/100
                                    </>
                                  )}
                                </p>
                              )}
                              {(c.verticalFitReasons || []).length > 0 && (
                                <p className="text-data text-muted-foreground">
                                  <span className="font-semibold text-foreground">Industry signals</span>{" "}
                                  {(c.verticalFitReasons || []).join("; ")}
                                </p>
                              )}
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
              <div className="space-y-2">
                <p className="max-w-2xl text-data text-muted-foreground">
                  Active universe in <code>universe.db</code> (not deleted). Use filters to narrow this list. Showing{" "}
                  {universeRows.length} of {universeTotal} matching.
                </p>
                <button
                  type="button"
                  onClick={() => setUniverseFilterDrawerOpen(true)}
                  className="text-left text-data text-primary hover:underline"
                >
                  {universeAppliedFilterCount === 0
                    ? "No filters applied · Add filters"
                    : `${universeAppliedFilterCount} filter${universeAppliedFilterCount === 1 ? "" : "s"} applied · Edit filters`}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyUniverseFilters}
                  className="rounded-md border border-primary bg-primary px-3 py-2 text-data font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Apply filters
                </button>
                <button
                  type="button"
                  onClick={loadUniverseRows}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={clearUniverseFiltersAndReload}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                >
                  Clear filters
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
                  const scoreRaw = c.score ?? c.thesisScore;
                  const scoreCls = scoreTierClasses(scoreRaw);
                  const ctBad = companyTypeBadge(c.companyType);
                  const productPills = c.matchedProducts || c.products || [];
                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/25"
                    >
                      <div className="flex gap-3">
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-data font-semibold ${scoreCls}`}
                        >
                          {scoreRaw ?? "—"}
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
                              {c.is_saved && <span className="text-data font-medium text-primary">saved</span>}
                              <span className="truncate text-data text-muted-foreground">{c.domain}</span>
                              {c.website && (
                                <a
                                  className={`${pillBase} border-border text-primary`}
                                  href={c.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Website
                                </a>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setCompanyRejected(c.id, true)}
                                className="rounded-md border border-destructive/40 px-3 py-1.5 text-data font-medium text-destructive hover:bg-destructive/10"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => saveCompany(c.id, !c.is_saved)}
                                className="rounded-md border border-border px-3 py-1.5 text-data font-medium hover:bg-muted"
                              >
                                {c.is_saved ? "Unsave" : "Save"}
                              </button>
                            </div>
                          </div>
                          <p className="text-data text-muted-foreground">
                            MC:{c.missionCritical ? "Y" : "N"} · VI:{c.verticallyIntegrated ? "Y" : "N"} · Prop:
                            {c.proprietaryStack ? "Y" : "N"}
                            {typeof c.ownership_confidence === "number" && (
                              <span className="ms-2">conf {c.ownership_confidence.toFixed(2)}</span>
                            )}
                          </p>
                          {c.description && (
                            <p className="text-data leading-relaxed text-muted-foreground">{c.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {(c.sourceTags || []).map((s) => (
                              <span
                                key={s}
                                className={`${pillBase} border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100`}
                              >
                                {s}
                              </span>
                            ))}
                            {(c.verticals || []).length > 0 ? (
                              (c.verticals || []).map((v) => (
                                <span
                                  key={v}
                                  className={`${pillBase} border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100`}
                                >
                                  {v}
                                </span>
                              ))
                            ) : (c.searchVerticals || []).length > 0 ? (
                              <span
                                className={`${pillBase} border-muted-foreground/30 bg-muted/40 text-muted-foreground`}
                              >
                                No scraped industry match
                                {typeof c.verticalFitScore === "number" ? ` (${c.verticalFitScore})` : ""}
                              </span>
                            ) : null}
                            {productPills.map((mp) => (
                              <span
                                key={mp}
                                className={`${pillBase} border-violet-500/30 bg-violet-500/5 text-violet-900 dark:text-violet-100`}
                              >
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "build" && (
            <div className="animate-in-fade space-y-5">
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-5">
                <div>
                  <h2 className="text-ui font-semibold text-foreground">Overnight Universe Builder</h2>
                  <p className="mt-1 text-data text-muted-foreground">
                    Discover and enrich companies in the background. Discovery is permissive &mdash; every candidate is stored even if it doesn&apos;t match current filters.
                  </p>
                </div>

                {/* Config panel — only shown when not running */}
                {(!buildStatus || buildStatus === "stopped" || buildStatus === "error") && (
                  <div className="space-y-4">
                    {/* Depth */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Depth</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ["metadata_only", "Metadata Only", "Stage A only — fast, 10k+ overnight"],
                          ["standard", "Standard", "Stage A + B — full enrichment, 2-4k overnight"],
                          ["deep", "Deep", "Stage A + B + Ollama — richest, 1-2k overnight"],
                        ].map(([val, lbl, desc]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setBuildDepth(val);
                              if (val === "deep") setBuildStageBThreshold(55);
                              else if (val === "standard") setBuildStageBThreshold(40);
                            }}
                            className={`rounded-md border px-3 py-2 text-left text-data transition-colors ${
                              buildDepth === val
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            <span className="font-semibold">{lbl}</span>
                            <span className="ms-2 text-muted-foreground">{desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Volume & threshold */}
                    <div className="flex flex-wrap gap-4">
                      <div className="min-w-[180px] space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target volume</label>
                        <input
                          type="range"
                          min={500}
                          max={50000}
                          step={500}
                          value={buildMaxCandidates}
                          onChange={(e) => setBuildMaxCandidates(Number(e.target.value))}
                          className="w-full"
                        />
                        <span className="text-data text-foreground">{buildMaxCandidates.toLocaleString()} companies</span>
                      </div>
                      <div className="min-w-[180px] space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Maximum run time</label>
                        <input
                          type="range"
                          min={1}
                          max={24}
                          step={1}
                          value={buildMaxRunHours}
                          onChange={(e) => setBuildMaxRunHours(Number(e.target.value))}
                          className="w-full"
                        />
                        <span className="text-data text-foreground">
                          {buildMaxRunHours} hour{buildMaxRunHours === 1 ? "" : "s"}
                        </span>
                      </div>
                      {buildDepth !== "metadata_only" && (
                        <div className="min-w-[180px] space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage B threshold</label>
                          <input
                            type="range"
                            min={0}
                            max={80}
                            step={5}
                            value={buildStageBThreshold}
                            onChange={(e) => setBuildStageBThreshold(Number(e.target.value))}
                            className="w-full"
                          />
                          <span className="text-data text-foreground">
                            Priority score &ge; {buildStageBThreshold} for deep enrichment
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Breadth */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breadth</label>
                      <select
                        value={buildBreadth}
                        onChange={(e) => setBuildBreadth(e.target.value)}
                        className="rounded-md border border-border bg-card px-3 py-2 text-data text-foreground"
                      >
                        <option value="focused">Focused (1x)</option>
                        <option value="broad">Broad (2x)</option>
                        <option value="exhaustive">Exhaustive (4x)</option>
                      </select>
                    </div>

                    {/* Ollama toggle (deep only) */}
                    {buildDepth === "deep" && (
                      <label className="flex items-center gap-2 text-data text-foreground">
                        <input
                          type="checkbox"
                          checked={buildUseOllama}
                          onChange={(e) => setBuildUseOllama(e.target.checked)}
                          className="rounded border-border"
                        />
                        Use Ollama classifier (local LLM)
                      </label>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBuildVerticals([...VERTICALS]);
                          setBuildProducts([...SOFTWARE_PRODUCT_KEYS]);
                        }}
                        className="rounded-md border border-border px-3 py-1.5 text-data text-foreground hover:bg-muted/50"
                      >
                        Select all filters
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildVerticals([]);
                          setBuildProducts([]);
                        }}
                        className="rounded-md border border-border px-3 py-1.5 text-data text-muted-foreground hover:bg-muted/50"
                      >
                        Clear filters
                      </button>
                    </div>

                    {/* Verticals */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verticals</label>
                      <div className="flex flex-wrap gap-1.5">
                        {VERTICALS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              setBuildVerticals((prev) =>
                                prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                              )
                            }
                            className={`rounded-md border px-2 py-1 text-data transition-colors ${
                              buildVerticals.includes(v)
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Products */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Products</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SOFTWARE_PRODUCT_KEYS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              setBuildProducts((prev) =>
                                prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                              )
                            }
                            className={`rounded-md border px-2 py-1 text-data transition-colors ${
                              buildProducts.includes(p)
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            {SOFTWARE_PRODUCTS[p]?.icon} {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={startBuild}
                      disabled={buildProducts.length === 0}
                      className="rounded-md bg-primary px-6 py-2.5 text-ui font-semibold text-primary-foreground hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Start Build
                    </button>
                  </div>
                )}

                {/* Progress panel — shown when running/paused */}
                {buildStatus && buildStatus !== "stopped" && buildStatus !== "error" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-data font-semibold ${
                        buildStatus === "running"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                          : buildStatus === "paused"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                            : "border-border bg-muted text-muted-foreground"
                      }`}>
                        {buildStatus === "running" && "Running"}
                        {buildStatus === "paused" && "Paused"}
                        {buildStatus === "starting" && "Starting..."}
                      </span>
                      {buildThroughput && (
                        <span className="text-data text-muted-foreground">
                          ~{buildThroughput.toLocaleString()} discovered/hr
                        </span>
                      )}
                      {buildRemainingLabel && (
                        <span className="text-data text-muted-foreground">{buildRemainingLabel}</span>
                      )}
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      {[
                        ["Discovered", buildStats.discovered, "text-foreground"],
                        ["Basic Enriched", buildStats.basicEnriched, "text-sky-600 dark:text-sky-400"],
                        ["Fully Enriched", buildStats.fullyEnriched, "text-emerald-600 dark:text-emerald-400"],
                        ["Classified", buildStats.classified, "text-violet-600 dark:text-violet-400"],
                        ["Failed", buildStats.failed, "text-destructive"],
                        ["Skipped", buildStats.skipped, "text-muted-foreground"],
                      ].map(([lbl, val, cls]) => (
                        <div key={lbl} className="rounded-md border border-border bg-card p-3 text-center">
                          <div className={`text-lg font-bold tabular-nums ${cls}`}>{val.toLocaleString()}</div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{lbl}</div>
                        </div>
                      ))}
                    </div>

                    {buildLog && (
                      <p className="truncate text-data text-muted-foreground">{buildLog}</p>
                    )}

                    {/* Control buttons */}
                    <div className="flex flex-wrap gap-2">
                      {buildStatus === "running" && (
                        <button
                          type="button"
                          onClick={pauseBuild}
                          className="rounded-md border border-amber-500/40 px-4 py-2 text-data font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                        >
                          Pause
                        </button>
                      )}
                      {buildStatus === "paused" && (
                        <button
                          type="button"
                          onClick={resumeBuildFn}
                          className="rounded-md border border-primary/40 px-4 py-2 text-data font-medium text-primary hover:bg-primary/10"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={stopBuildFn}
                        className="rounded-md border border-destructive/40 px-4 py-2 text-data font-medium text-destructive hover:bg-destructive/10"
                      >
                        Stop
                      </button>
                    </div>
                  </div>
                )}

                {/* Completion / error state */}
                {(buildStatus === "stopped" || buildStatus === "error") && buildStats.discovered > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
                    <p className="text-data font-semibold text-foreground">
                      {buildStats.discovered.toLocaleString()} companies discovered
                      {buildStats.fullyEnriched > 0 && ` — ${buildStats.fullyEnriched.toLocaleString()} fully enriched`}
                      {buildStats.classified > 0 && `, ${buildStats.classified.toLocaleString()} scored`}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setActiveTab("universe"); loadUniverseRows(); }}
                      className="rounded-md bg-primary px-4 py-2 text-data font-semibold text-primary-foreground hover:opacity-95"
                    >
                      Browse Universe
                    </button>
                  </div>
                )}
              </div>

              {/* Build history */}
              {buildHistory.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
                  <h3 className="text-ui font-semibold text-foreground">Recent Builds</h3>
                  <div className="space-y-2">
                    {buildHistory.map((b) => (
                      <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-data">
                        <span className={`rounded-full border px-2 py-0.5 text-data font-medium ${
                          b.status === "RUNNING" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                          : b.status === "DONE" ? "border-primary/40 bg-primary/10 text-primary"
                          : b.status === "PAUSED" ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          : "border-border bg-muted text-muted-foreground"
                        }`}>
                          {b.status}
                        </span>
                        <span className="text-muted-foreground">{b.config?.depth || "standard"}</span>
                        <span className="tabular-nums text-foreground">
                          {(b.stats?.discovered || 0).toLocaleString()} disc
                        </span>
                        <span className="tabular-nums text-foreground">
                          {(b.stats?.fullyEnriched || 0).toLocaleString()} enriched
                        </span>
                        <span className="tabular-nums text-foreground">
                          {(b.stats?.classified || 0).toLocaleString()} classified
                        </span>
                        <span className="text-muted-foreground">{b.created_at}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "deleted" && (
            <div className="animate-in-fade space-y-4">
              <p className="text-data text-muted-foreground">
                Companies you <span className="text-foreground">delete</span> stay here. Use them as anchors to find
                similar names still in the active universe, then bulk-reject matches.
              </p>
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="min-w-0 flex-1 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="similar-min">
                    Min similarity (0–1)
                  </label>
                  <input
                    id="similar-min"
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={similarMinScore}
                    onChange={(e) => setSimilarMinScore(parseFloat(e.target.value) || 0)}
                    className="w-full max-w-[8rem] rounded-md border border-border bg-background px-2 py-1.5 text-data text-foreground"
                  />
                </div>
                <button
                  type="button"
                  disabled={!selectedDeletedAnchorIds.length || similarLoading}
                  onClick={runSimilarToRejected}
                  className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-data font-semibold text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {similarLoading ? "…" : "Find similar in universe"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadRejectedRows}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                >
                  Refresh
                </button>
                {rejectedRows.length < rejectedTotal && (
                  <button
                    type="button"
                    onClick={loadMoreRejected}
                    className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80"
                  >
                    Load more
                  </button>
                )}
                <button
                  type="button"
                  disabled={!rejectedRows.length}
                  onClick={() => setSelectedDeletedAnchorIds(rejectedRows.map((c) => c.id))}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={!selectedDeletedAnchorIds.length}
                  onClick={() => setSelectedDeletedAnchorIds([])}
                  className="rounded-md border border-border bg-card px-3 py-2 text-data font-medium text-foreground shadow-sm hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  disabled={!selectedDeletedAnchorIds.length || restoreSelectedLoading}
                  onClick={restoreSelectedFromDeleted}
                  className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-data font-semibold text-primary shadow-sm hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {restoreSelectedLoading ? "…" : "Restore selected"}
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {rejectedRows.length === 0 ? (
                  <p className="text-data text-muted-foreground">No deleted companies.</p>
                ) : (
                  rejectedRows.map((c) => {
                    const checked = selectedDeletedAnchorIds.includes(c.id);
                    const ownLabel = c.ownership_class || c.ownership;
                    const ownCls = ownerBadgeClasses(ownLabel);
                    return (
                      <div
                        key={c.id}
                        className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/25"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDeletedAnchor(c.id)}
                              className="size-4 shrink-0 rounded border-border"
                              title="Use as anchor for similarity search"
                              aria-label={`Select ${c.name} as anchor`}
                            />
                            <span className="font-semibold text-foreground">{c.name}</span>
                            {ownLabel && (
                              <span className={`rounded border px-2 py-0.5 text-data ${ownCls}`}>{ownLabel}</span>
                            )}
                            {isPublicAutoExcluded(c) && (
                              <span className="rounded border border-border bg-muted px-2 py-0.5 text-data text-muted-foreground">
                                Auto-excluded (public listing)
                              </span>
                            )}
                            <span className="truncate text-data text-muted-foreground">{c.domain}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {c.website && (
                              <a
                                className="rounded-md border border-border px-3 py-1.5 text-data text-primary hover:bg-muted"
                                href={c.website}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Site
                              </a>
                            )}
                            {!isPublicAutoExcluded(c) && (
                              <button
                                type="button"
                                onClick={() => setCompanyRejected(c.id, false)}
                                className="rounded-md border border-border px-3 py-1.5 text-data font-medium text-primary hover:bg-muted"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-data text-muted-foreground">
                          Score {(c.score ?? c.thesisScore) || "—"} · {(c.sourceTags || []).join(" · ")}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {similarModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="similar-modal-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <h2 id="similar-modal-title" className="text-ui font-semibold text-foreground">
                Similar companies in universe
              </h2>
              <p className="mt-1 text-data text-muted-foreground">
                Select rows to move to Deleted.
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {similarMatches.length === 0 ? (
                <p className="px-2 py-6 text-center text-data text-muted-foreground">No matches at this threshold.</p>
              ) : (
                <ul className="space-y-1">
                  {similarMatches.map((m) => {
                    const on = selectedSimilarIds.includes(m.id);
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-muted/50">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleSimilarSelected(m.id)}
                            className="size-4 shrink-0 rounded border-border"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">{m.name}</span>
                            <span className="ms-2 truncate text-data text-muted-foreground">{m.domain}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-data text-muted-foreground">
                            {(m.score * 100).toFixed(1)}%
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
              <button
                type="button"
                onClick={() => {
                  setSimilarModalOpen(false);
                  setSimilarMatches([]);
                  setSelectedSimilarIds([]);
                }}
                className="rounded-md border border-border px-3 py-2 text-data font-medium hover:bg-muted"
              >
                Close
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!similarMatches.length}
                  onClick={() => {
                    setSelectedSimilarIds(similarMatches.map((m) => m.id));
                  }}
                  className="rounded-md border border-border px-3 py-2 text-data font-medium hover:bg-muted disabled:opacity-40"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={!selectedSimilarIds.length || bulkRejectLoading}
                  onClick={bulkRejectSimilarSelected}
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-data font-semibold text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {bulkRejectLoading ? "…" : `Reject selected (${selectedSimilarIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <FilterDrawer open={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)}>
        <DiscoverFilterPanel
          sidebarSection={sidebarSection}
          setSidebarSection={setSidebarSection}
          geoHelpText="Discover shows companies whose resolved headquarters country is in your selection. Leave all regions unchecked for worldwide."
          verticals={VERTICALS}
          selectedVerticals={selectedVerticals}
          setSelectedVerticals={setSelectedVerticals}
          onToggleVertical={toggleVertical}
          softwareProducts={SOFTWARE_PRODUCTS}
          softwareProductKeys={SOFTWARE_PRODUCT_KEYS}
          selectedProducts={selectedProducts}
          setSelectedProducts={setSelectedProducts}
          companyTypes={COMPANY_TYPES}
          ownershipTypes={OWNERSHIP_TYPES}
          revenueRanges={REVENUE_RANGES}
          employeeRanges={EMPLOYEE_RANGES}
          foundedRanges={FOUNDED_RANGES}
          companyTypeFilter={companyTypeFilter}
          setCompanyTypeFilter={setCompanyTypeFilter}
          ownershipFilter={ownershipFilter}
          setOwnershipFilter={setOwnershipFilter}
          revenueFilter={revenueFilter}
          setRevenueFilter={setRevenueFilter}
          sizeFilter={sizeFilter}
          setSizeFilter={setSizeFilter}
          foundedFilter={foundedFilter}
          setFoundedFilter={setFoundedFilter}
          allowedCountryCodes={allowedCountryCodes}
          setAllowedCountryCodes={setAllowedCountryCodes}
          thesisRequireMissionCritical={thesisRequireMissionCritical}
          setThesisRequireMissionCritical={setThesisRequireMissionCritical}
          thesisRequireVertIntegrated={thesisRequireVertIntegrated}
          setThesisRequireVertIntegrated={setThesisRequireVertIntegrated}
          thesisRequireProprietary={thesisRequireProprietary}
          setThesisRequireProprietary={setThesisRequireProprietary}
          thesisRequireFounderVintage={thesisRequireFounderVintage}
          setThesisRequireFounderVintage={setThesisRequireFounderVintage}
          minOwnershipConfidence={minOwnershipConfidence}
          setMinOwnershipConfidence={setMinOwnershipConfidence}
          activeFilterCount={activeFilterCount}
          onClearAll={clearAll}
          onApplyIdealProfile={applyIdealProfile}
          onResetIdealProfile={resetIdealProfile}
        />
      </FilterDrawer>

      <FilterDrawer
        title="Universe filters"
        open={universeFilterDrawerOpen}
        onClose={() => setUniverseFilterDrawerOpen(false)}
      >
        <DiscoverFilterPanel
          sidebarSection={universeSidebarSection}
          setSidebarSection={setUniverseSidebarSection}
          geoHelpText="Universe list uses the same country allowlist logic. Leave all regions unchecked for worldwide. Strict vertical fit follows Settings."
          verticals={VERTICALS}
          selectedVerticals={universeSelectedVerticals}
          setSelectedVerticals={setUniverseSelectedVerticals}
          onToggleVertical={toggleUniverseVertical}
          softwareProducts={SOFTWARE_PRODUCTS}
          softwareProductKeys={SOFTWARE_PRODUCT_KEYS}
          selectedProducts={universeSelectedProducts}
          setSelectedProducts={setUniverseSelectedProducts}
          companyTypes={COMPANY_TYPES}
          ownershipTypes={OWNERSHIP_TYPES}
          revenueRanges={REVENUE_RANGES}
          employeeRanges={EMPLOYEE_RANGES}
          foundedRanges={FOUNDED_RANGES}
          companyTypeFilter={universeCompanyTypeFilter}
          setCompanyTypeFilter={setUniverseCompanyTypeFilter}
          ownershipFilter={universeOwnershipFilter}
          setOwnershipFilter={setUniverseOwnershipFilter}
          revenueFilter={universeRevenueFilter}
          setRevenueFilter={setUniverseRevenueFilter}
          sizeFilter={universeSizeFilter}
          setSizeFilter={setUniverseSizeFilter}
          foundedFilter={universeFoundedFilter}
          setFoundedFilter={setUniverseFoundedFilter}
          allowedCountryCodes={universeAllowedCountryCodes}
          setAllowedCountryCodes={setUniverseAllowedCountryCodes}
          thesisRequireMissionCritical={universeThesisRequireMissionCritical}
          setThesisRequireMissionCritical={setUniverseThesisRequireMissionCritical}
          thesisRequireVertIntegrated={universeThesisRequireVertIntegrated}
          setThesisRequireVertIntegrated={setUniverseThesisRequireVertIntegrated}
          thesisRequireProprietary={universeThesisRequireProprietary}
          setThesisRequireProprietary={setUniverseThesisRequireProprietary}
          thesisRequireFounderVintage={universeThesisRequireFounderVintage}
          setThesisRequireFounderVintage={setUniverseThesisRequireFounderVintage}
          minOwnershipConfidence={universeMinOwnershipConfidence}
          setMinOwnershipConfidence={setUniverseMinOwnershipConfidence}
          activeFilterCount={universeActiveFilterCount}
          onClearAll={clearAllUniverse}
          onApplyIdealProfile={applyIdealProfileUniverse}
          onResetIdealProfile={resetIdealProfileUniverse}
        />
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
          onChange={(e) => setMaxCompanies(Math.min(5000, Math.max(50, parseInt(e.target.value, 10) || 1000)))}
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
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-data leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
            checked={strictVerticalFit}
            onChange={(e) => setStrictVerticalFit(e.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">Strict vertical fit</span>
            <span className="mt-1 block text-muted-foreground">
              Only keep companies whose site text signals the industries you picked. Also available server-side via{" "}
              <code className="text-data">STRICT_VERTICAL_FIT=1</code>.
            </span>
          </span>
        </label>
        <div className="mt-4 space-y-1 rounded-md border border-border bg-muted/30 p-3 font-mono text-data text-muted-foreground">
          <div>Brave: {apiStatus.brave ? "on" : "off"}</div>
          <div>Exa: {apiStatus.exa ? "on" : "off"}</div>
          <div>Apollo: {apiStatus.apollo ? "on" : "off"}</div>
          <div>Crunchbase: {apiStatus.crunchbase ? "on" : "off"}</div>
          <div>Tavily: {apiStatus.tavily ? "on" : "off"}</div>
          <div className="border-t border-border pt-2">
            <div className="font-sans font-medium text-foreground">LinkedIn export (offline)</div>
            {apiStatus.linkedInExport?.ready ? (
              <div className="mt-1 text-emerald-700 dark:text-emerald-400">Ready — ingests on search/build</div>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {!apiStatus.linkedInExport?.enabled && (
                  <li>
                    Set <code className="text-data">ENABLE_HIGH_TOS_SOURCES=1</code> in <code className="text-data">.env</code>
                  </li>
                )}
                {apiStatus.linkedInExport?.enabled && !apiStatus.linkedInExport?.path && (
                  <li>
                    Set <code className="text-data">LINKEDIN_EXPORT_PATH</code> to your CSV or JSON file
                  </li>
                )}
                {apiStatus.linkedInExport?.enabled && apiStatus.linkedInExport?.path && !apiStatus.linkedInExport?.fileExists && (
                  <li>
                    File not found: <code className="break-all text-data">{apiStatus.linkedInExport.path}</code> (copy{" "}
                    <code className="text-data">linkedin-export.example.json</code>)
                  </li>
                )}
              </ul>
            )}
            {apiStatus.linkedInExport?.path && (
              <div className="mt-1 break-all opacity-80">
                Path: {apiStatus.linkedInExport.path}
              </div>
            )}
            <p className="mt-1 font-sans text-[11px] leading-snug opacity-80">
              User-provided export only — no live LinkedIn scraping.
            </p>
          </div>
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
      <BackToTopButton scrollRef={mainScrollRef} />
    </DashboardShell>
  );
  // #endregion
}
