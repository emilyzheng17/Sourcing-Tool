import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

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

function inFoundedEra(year, label) {
  if (label === "Any Era" || year == null || Number.isNaN(Number(year))) return true;
  const y = Number(year);
  if (label === "2020–Present") return y >= 2020;
  if (label === "2015–2019") return y >= 2015 && y <= 2019;
  if (label === "2010–2014") return y >= 2010 && y <= 2014;
  if (label === "2000–2009") return y >= 2000 && y <= 2009;
  if (label === "Before 2000") return y < 2000;
  return true;
}
const REVENUE_RANGES = ["Any Revenue","< $1M","$1M–$5M","$5M–$20M","$20M–$50M","$50M–$200M","$200M+"];
const EMPLOYEE_RANGES = ["Any Size","1–10","11–50","51–200","201–500","501–1,000","1,000+"];
const FOUNDED_RANGES = ["Any Era","2020–Present","2015–2019","2010–2014","2000–2009","Before 2000"];
const QUALITY_TIERS = ["—","Bronze","Silver","Gold","Platinum"];

const defaultMeta = () => ({ website:"", contactName:"", role:"", email:"", quality:"—", comments:"" });

export default function CompanySourcingTool() {
  const [activeProduct, setActiveProduct] = useState("ERP & Operations");
  const [selectedTags, setSelectedTags] = useState({});
  const [selectedVerticals, setSelectedVerticals] = useState([]);
  const [ownershipFilter, setOwnershipFilter] = useState("Any Ownership");
  const [revenueFilter, setRevenueFilter] = useState("Any Revenue");
  const [sizeFilter, setSizeFilter] = useState("Any Size");
  const [foundedFilter, setFoundedFilter] = useState("Any Era");
  const [searchQuery, setSearchQuery] = useState("");
  const [companyMeta, setCompanyMeta] = useState(() => {
    try {
      return JSON.parse(typeof localStorage !== "undefined" ? localStorage.getItem("sourcingCompanyMeta") || "{}" : "{}");
    } catch {
      return {};
    }
  });
  const [activeTab, setActiveTab] = useState("discover");
  const [sidebarSection, setSidebarSection] = useState("product");
  const [exportFlash, setExportFlash] = useState(false);

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

  const loadSavedRows = useCallback(() => {
    fetch("/api/universe?savedOnly=1&limit=500")
      .then((r) => r.json())
      .then((d) => setSavedRows(d.companies || []))
      .catch(() => setSavedRows([]));
  }, []);

  const loadUniverseRows = useCallback(() => {
    fetch("/api/universe?limit=200")
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

  useEffect(() => {
    loadSavedRows();
  }, [loadSavedRows]);

  useEffect(() => {
    if (activeTab === "universe") loadUniverseRows();
  }, [activeTab, loadUniverseRows]);

  const toggleTag = (group, tag) => setSelectedTags(prev => { const c=prev[group]||[]; return {...prev,[group]:c.includes(tag)?c.filter(t=>t!==tag):[...c,tag]}; });
  const toggleVertical = v => setSelectedVerticals(prev => prev.includes(v)?prev.filter(x=>x!==v):[...prev,v]);
  const allSelectedTags = Object.values(selectedTags).flat();

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
    (revenueFilter !== "Any Revenue" ? 1 : 0) +
    (sizeFilter !== "Any Size" ? 1 : 0) +
    (foundedFilter !== "Any Era" ? 1 : 0) +
    thesisFilterCount;

  const clearAll = () => {
    setSelectedTags({});
    setSelectedVerticals([]);
    setOwnershipFilter("Any Ownership");
    setRevenueFilter("Any Revenue");
    setSizeFilter("Any Size");
    setFoundedFilter("Any Era");
    setThesisRequireMissionCritical(false);
    setThesisRequireVertIntegrated(false);
    setThesisRequireProprietary(false);
    setThesisRequireFounderVintage(false);
    setMinOwnershipConfidence(0);
  };

  const runSearch = async (findMore = false) => {
    setSearching(true);
    setSearchDone(false);
    setSearchError("");
    if (!findMore) setSearchResults([]);
    setSearchLog("Starting deterministic pipeline…");
    try {
      const excludeDomains = findMore
        ? searchResults.map((c) => c.domain).filter(Boolean)
        : [];
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProduct,
          selectedVerticals,
          selectedTags: allSelectedTags,
          ownershipFilter,
          revenueFilter,
          sizeFilter,
          foundedFilter,
          excludeDomains,
          settings: { llmProvider },
          thesis: {
            requireMissionCritical: thesisRequireMissionCritical,
            requireVerticallyIntegrated: thesisRequireVertIntegrated,
            requireProprietary: thesisRequireProprietary,
            requireFounderVintage: thesisRequireFounderVintage,
            minOwnershipConfidence,
          },
        }),
      });
      if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
      const { jobId } = await res.json();
      if (!jobId) throw new Error("No jobId returned");

      await new Promise((r) => setTimeout(r, 80));

      const es = new EventSource(`/api/search/${jobId}/stream`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "log") setSearchLog(msg.message || "");
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
          }
          if (msg.type === "done") {
            es.close();
            setSearching(false);
            setSearchDone(true);
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
      };
    } catch (e) {
      setSearchError(e.message || "Search failed");
      setSearching(false);
      setSearchDone(true);
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
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
      { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sourcing");
    XLSX.writeFile(wb, "sourcing-file.xlsx");
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 1800);
  };

  const prodData = SOFTWARE_PRODUCTS[activeProduct];
  const ownerColor = {
    "VC-Backed": "#4af0c4",
    "Private Equity": "#c44af0",
    "Founder-Owned": "#f0c44a",
    "Founder-Operated": "#f0c44a",
    "Vintage PE": "#c44af0",
    "Recent PE": "#9a7af0",
    Unknown: "#5a5a7a",
    Acquired: "#f08a4a",
    "Family-Owned": "#4a8af0",
    "Employee-Owned (ESOP)": "#f04a8a",
    "Publicly Traded": "#8af04a",
  };
  const qualityColor = { Bronze: "#cd7f32", Silver: "#c0c0c0", Gold: "#ffd700", Platinum: "#e5e4e2" };

  const displayedResults = searchResults
    .filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !(c.description || "").toLowerCase().includes(q) &&
          !(c.verticals || []).some((v) => v.toLowerCase().includes(q)) &&
          !(c.sourceTags || []).some((s) => String(s).toLowerCase().includes(q))
        )
          return false;
      }
      if (ownershipFilter !== "Any Ownership") {
        const oc = c.ownership_class || c.ownership;
        if (oc !== ownershipFilter) return false;
      }
      if (revenueFilter !== "Any Revenue" && c.revenue && c.revenue !== revenueFilter) return false;
      if (sizeFilter !== "Any Size" && c.employees && c.employees !== sizeFilter) return false;
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
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e8e4d9"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#0a0a0f}
        ::-webkit-scrollbar-thumb{background:#1e1e30;border-radius:2px}
        .tag-btn{cursor:pointer;border:1px solid #1e1e30;background:transparent;color:#6a6a8a;padding:4px 10px;border-radius:3px;font-family:inherit;font-size:11px;letter-spacing:.04em;transition:all .15s;white-space:nowrap}
        .tag-btn:hover{border-color:#c4f04a;color:#c4f04a}
        .tag-btn.active{border-color:#c4f04a;background:rgba(196,240,74,.1);color:#c4f04a}
        .vert-btn{cursor:pointer;border:1px solid #1e1e30;background:transparent;color:#6a6a8a;padding:5px 10px;border-radius:3px;font-family:inherit;font-size:11px;transition:all .15s;text-align:left;width:100%;display:flex;align-items:center;gap:6px}
        .vert-btn:hover{border-color:#f0844a;color:#f0844a}
        .vert-btn.active{border-color:#f0844a;background:rgba(240,132,74,.1);color:#f0844a}
        .prod-btn{cursor:pointer;background:transparent;border:none;border-left:2px solid transparent;color:#4a4a6a;font-family:'Syne',sans-serif;font-size:11px;font-weight:600;letter-spacing:.05em;padding:7px 12px;text-transform:uppercase;transition:all .18s;display:flex;align-items:center;gap:8px;width:100%;text-align:left}
        .prod-btn:hover{color:#c8c4b8;border-left-color:#2a2a4a}
        .prod-btn.active{color:#c4f04a;border-left-color:#c4f04a;background:rgba(196,240,74,.04)}
        .sidebar-tab{cursor:pointer;background:transparent;border:none;border-bottom:2px solid transparent;color:#4a4a6a;font-family:'Syne',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:9px 0;transition:all .2s;flex:1}
        .sidebar-tab:hover{color:#9a9ab8}
        .sidebar-tab.active{color:#e8e4d9;border-bottom-color:#e8e4d9}
        .card{border:1px solid #131320;background:#0d0d1a;border-radius:5px;padding:15px 17px;transition:all .18s}
        .card:hover{border-color:#1e1e35;background:#10101f}
        .card.expanded{border-color:rgba(196,240,74,.2);background:#10101f}
        .score-ring{width:33px;height:33px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:'Syne',sans-serif;flex-shrink:0}
        .save-btn{background:transparent;border:1px solid #1e1e30;color:#4a4a6a;padding:4px 11px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px;transition:all .15s;flex-shrink:0}
        .save-btn:hover{border-color:#c4f04a;color:#c4f04a}
        .save-btn.saved{border-color:#c4f04a;background:rgba(196,240,74,.1);color:#c4f04a}
        .sel{background:#0d0d1a;border:1px solid #131320;color:#8a8aaa;padding:6px 8px;border-radius:3px;font-family:inherit;font-size:11px;cursor:pointer;outline:none;width:100%;transition:border-color .15s}
        .sel:hover,.sel:focus{border-color:#1e1e35;color:#e8e4d9}
        .main-tab{background:transparent;border:none;color:#4a4a6a;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:10px 16px;cursor:pointer;transition:all .2s;border-bottom:2px solid transparent}
        .main-tab:hover{color:#e8e4d9}
        .main-tab.active{color:#c4f04a;border-bottom-color:#c4f04a}
        .clr{background:transparent;border:1px solid #1e1e30;color:#6a6a8a;padding:5px 12px;border-radius:3px;font-family:inherit;font-size:10px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:all .15s;width:100%}
        .clr:hover{border-color:#ff6b6b;color:#ff6b6b}
        .search-btn{background:#c4f04a;color:#0a0a0f;border:none;padding:11px 22px;border-radius:4px;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px;white-space:nowrap}
        .search-btn:hover{background:#d4ff5a;transform:translateY(-1px)}
        .search-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .export-btn{background:rgba(196,240,74,.1);border:1px solid rgba(196,240,74,.3);color:#c4f04a;padding:7px 16px;border-radius:4px;font-family:'Syne',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:7px}
        .export-btn:hover{background:rgba(196,240,74,.18)}
        .export-btn.flash{background:#c4f04a;color:#0a0a0f}
        .export-btn:disabled{opacity:.35;cursor:not-allowed}
        .meta-in{background:#0a0a12;border:1px solid #131320;color:#c8c4b8;padding:5px 8px;border-radius:3px;font-family:inherit;font-size:11px;width:100%;outline:none;transition:border-color .15s}
        .meta-in:focus{border-color:#2a2a4a}
        .meta-in::placeholder{color:#222235}
        .meta-sel{background:#0a0a12;border:1px solid #131320;color:#c8c4b8;padding:5px 8px;border-radius:3px;font-family:inherit;font-size:11px;width:100%;outline:none;cursor:pointer}
        .pulse{animation:pulse 1.5s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .spin{animation:spin 1.2s linear infinite;display:inline-block}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .fi{animation:fi .3s ease-out}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .srch{background:transparent;border:none;color:#e8e4d9;font-family:inherit;font-size:13px;outline:none;width:100%}
        .srch::placeholder{color:#222235}
        .fl{font-size:9px;color:#3a3a5a;letter-spacing:.16em;text-transform:uppercase;margin-bottom:5px;margin-top:11px;display:block}
        .scan-row{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(196,240,74,.04);border:1px solid rgba(196,240,74,.1);border-radius:4px;font-size:11px;color:#6a8a6a}
        .gear-btn{cursor:pointer;background:transparent;border:1px solid #1e1e30;color:#6a6a8a;padding:4px 10px;border-radius:3px;font-size:11px}
        .gear-btn:hover{border-color:#c4f04a;color:#c4f04a}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
        .modal-box{background:#0d0d1a;border:1px solid #1a1a2a;border-radius:8px;max-width:420px;width:100%;padding:18px 20px}
        .chk-row{display:flex;align-items:center;gap:8px;font-size:11px;color:#8a8aaa;margin-top:6px;cursor:pointer}
      `}</style>

      {/* ── Header ── */}
      <div style={{borderBottom:"1px solid #131320",padding:"12px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#e8e4d9",letterSpacing:"-0.02em"}}>SOURCE</span>
          <span style={{fontSize:10,color:"#222235",letterSpacing:"0.2em",textTransform:"uppercase"}}>Software Intelligence</span>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          <button type="button" className="gear-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
          {activeFilterCount>0&&<div style={{background:"rgba(240,132,74,.08)",border:"1px solid rgba(240,132,74,.2)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#f0844a"}}>{activeFilterCount} filter{activeFilterCount>1?"s":""} active</div>}
          {searchDone&&<div style={{background:"rgba(196,240,74,.06)",border:"1px solid rgba(196,240,74,.15)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#c4f04a"}}>{searchResults.length} found</div>}
          <div style={{background:"rgba(196,240,74,.06)",border:"1px solid rgba(196,240,74,.15)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#c4f04a"}}>{savedRows.length} saved</div>
        </div>
      </div>

      <div style={{display:"flex",height:"calc(100vh - 48px)"}}>

        {/* ── Sidebar ── */}
        <div style={{width:215,borderRight:"1px solid #131320",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{display:"flex",borderBottom:"1px solid #131320",padding:"0 14px"}}>
            {[["product","Product"],["vertical","Vertical"],["company","Company"]].map(([id,lbl])=>(
              <button key={id} className={`sidebar-tab ${sidebarSection===id?"active":""}`} onClick={()=>setSidebarSection(id)}>{lbl}</button>
            ))}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"12px 0"}}>
            {sidebarSection==="product"&&(
              <div className="fi">
                <div style={{fontSize:9,color:"#222235",letterSpacing:"0.18em",textTransform:"uppercase",padding:"0 14px 10px"}}>Software Type</div>
                {Object.entries(SOFTWARE_PRODUCTS).map(([name,data])=>(
                  <button key={name} className={`prod-btn ${activeProduct===name?"active":""}`}
                    onClick={()=>{setActiveProduct(name);setSelectedTags({});setSearchResults([]);setSearchDone(false);setSearchLog("");}}
                    title={data.description}>
                    <span style={{fontSize:12,flexShrink:0}}>{data.icon}</span><span style={{lineHeight:1.3}}>{name}</span>
                  </button>
                ))}
              </div>
            )}
            {sidebarSection==="vertical"&&(
              <div className="fi" style={{padding:"0 12px"}}>
                <div style={{fontSize:9,color:"#222235",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:10}}>Industry Verticals</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {VERTICALS.map(v=>(
                    <button key={v} className={`vert-btn ${selectedVerticals.includes(v)?"active":""}`} onClick={()=>toggleVertical(v)}>
                      <span style={{width:12,opacity:selectedVerticals.includes(v)?1:0,flexShrink:0}}>✓</span>{v}
                    </button>
                  ))}
                </div>
                {selectedVerticals.length>0&&<button className="clr" style={{marginTop:12}} onClick={()=>setSelectedVerticals([])}>Clear ({selectedVerticals.length})</button>}
              </div>
            )}
            {sidebarSection==="company"&&(
              <div className="fi" style={{padding:"0 12px"}}>
                <div style={{fontSize:9,color:"#222235",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:4}}>Company Attributes</div>
                <span className="fl" style={{marginTop:10}}>Ownership</span>
                <select className="sel" value={ownershipFilter} onChange={e=>setOwnershipFilter(e.target.value)}>{OWNERSHIP_TYPES.map(s=><option key={s}>{s}</option>)}</select>
                <span className="fl">Revenue</span>
                <select className="sel" value={revenueFilter} onChange={e=>setRevenueFilter(e.target.value)}>{REVENUE_RANGES.map(s=><option key={s}>{s}</option>)}</select>
                <span className="fl">Employees</span>
                <select className="sel" value={sizeFilter} onChange={e=>setSizeFilter(e.target.value)}>{EMPLOYEE_RANGES.map(s=><option key={s}>{s}</option>)}</select>
                <span className="fl">Year Founded</span>
                <select className="sel" value={foundedFilter} onChange={e=>setFoundedFilter(e.target.value)}>{FOUNDED_RANGES.map(s=><option key={s}>{s}</option>)}</select>
                <div style={{fontSize:9,color:"#222235",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:14,marginBottom:6}}>PE thesis filters</div>
                <label className="chk-row"><input type="checkbox" checked={thesisRequireMissionCritical} onChange={e=>setThesisRequireMissionCritical(e.target.checked)}/> Mission-critical</label>
                <label className="chk-row"><input type="checkbox" checked={thesisRequireVertIntegrated} onChange={e=>setThesisRequireVertIntegrated(e.target.checked)}/> Vertically integrated</label>
                <label className="chk-row"><input type="checkbox" checked={thesisRequireProprietary} onChange={e=>setThesisRequireProprietary(e.target.checked)}/> Proprietary stack</label>
                <label className="chk-row"><input type="checkbox" checked={thesisRequireFounderVintage} onChange={e=>setThesisRequireFounderVintage(e.target.checked)}/> Founder-op or vintage PE</label>
                <span className="fl">Min ownership confidence</span>
                <input type="range" min={0} max={1} step={0.05} value={minOwnershipConfidence} onChange={e=>setMinOwnershipConfidence(Number(e.target.value))} style={{width:"100%"}}/>
                <div style={{fontSize:10,color:"#3a3a5a",marginTop:2}}>{minOwnershipConfidence.toFixed(2)}</div>
                {activeFilterCount>0&&<button className="clr" style={{marginTop:14}} onClick={clearAll}>Clear all filters</button>}
              </div>
            )}
          </div>
        </div>

        {/* ── Main ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Tab bar */}
          <div style={{borderBottom:"1px solid #131320",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px"}}>
            <div style={{display:"flex"}}>
              {[["discover","Discover"],["saved",`Saved (${savedRows.length})`],["universe",`Universe (${universeTotal})`]].map(([id,lbl])=>(
                <button key={id} className={`main-tab ${activeTab===id?"active":""}`} onClick={()=>setActiveTab(id)}>{lbl}</button>
              ))}
            </div>
            {activeTab==="saved"&&(
              <button className={`export-btn ${exportFlash?"flash":""}`} onClick={exportToExcel} disabled={!savedRows.length}>
                <span>↓</span>{exportFlash?"Exported!":"Export to Excel"}
              </button>
            )}
          </div>

          {/* Capability filter bar */}
          {activeTab==="discover"&&(
            <div style={{borderBottom:"1px solid #131320",padding:"9px 20px",display:"flex",flexDirection:"column",gap:7,background:"#08080e"}}>
              <div style={{fontSize:10,color:"#c4f04a",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'Syne',sans-serif",fontWeight:700}}>
                {prodData.icon} {activeProduct}
                <span style={{marginLeft:10,fontSize:10,color:"#2a2a4a",fontFamily:"'DM Mono',monospace",fontWeight:400,textTransform:"none",letterSpacing:0}}>{prodData.description}</span>
              </div>
              {Object.entries(prodData.filters).map(([group,tags])=>(
                <div key={group} style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,color:"#2a2a4a",letterSpacing:".14em",textTransform:"uppercase",minWidth:110,flexShrink:0}}>{group}</span>
                  {tags.map(tag=>(
                    <button key={tag} className={`tag-btn ${(selectedTags[group]||[]).includes(tag)?"active":""}`} onClick={()=>toggleTag(group,tag)}>{tag}</button>
                  ))}
                </div>
              ))}
              {selectedVerticals.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,color:"#2a2a4a",letterSpacing:".14em",textTransform:"uppercase",minWidth:110,flexShrink:0}}>Verticals</span>
                  {selectedVerticals.map(v=>(
                    <button key={v} style={{cursor:"pointer",border:"1px solid rgba(240,132,74,.4)",background:"rgba(240,132,74,.07)",color:"#f0844a",padding:"4px 9px",borderRadius:3,fontFamily:"inherit",fontSize:11}} onClick={()=>toggleVertical(v)}>✕ {v}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>

            {/* ─ Discover ─ */}
            {activeTab==="discover"&&(
              <div className="fi">

                {/* Search launcher */}
                <div style={{background:"#0d0d1a",border:"1px solid #1a1a2a",borderRadius:6,padding:"18px 20px",marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:260}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#e8e4d9",marginBottom:5}}>
                        Find Companies
                      </div>
                      <div style={{fontSize:12,color:"#3a3a5a",lineHeight:1.6}}>
                        Deterministic pipeline: PE portfolio pages, trade-association links, G2/Capterra listings, Brave/Exa (optional keys in <code style={{color:"#5a5a7a"}}>.env</code>), homepage scrape, OpenCorporates, and rule-based thesis scoring. Optional LLM classification from Settings.
                      </div>
                      <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:"#c4f04a",background:"rgba(196,240,74,.08)",border:"1px solid rgba(196,240,74,.15)",padding:"3px 9px",borderRadius:3}}>{prodData.icon} {activeProduct}</span>
                        {selectedVerticals.map(v=><span key={v} style={{fontSize:11,color:"#f0844a",background:"rgba(240,132,74,.08)",border:"1px solid rgba(240,132,74,.15)",padding:"3px 9px",borderRadius:3}}>{v}</span>)}
                        {allSelectedTags.map(t=><span key={t} style={{fontSize:11,color:"#6a6a8a",background:"#0a0a12",border:"1px solid #1a1a2a",padding:"3px 9px",borderRadius:3}}>{t}</span>)}
                        {ownershipFilter!=="Any Ownership"&&<span style={{fontSize:11,color:"#9a7af0",background:"rgba(154,122,240,.08)",border:"1px solid rgba(154,122,240,.2)",padding:"3px 9px",borderRadius:3}}>{ownershipFilter}</span>}
                        {revenueFilter!=="Any Revenue"&&<span style={{fontSize:11,color:"#7af0c4",background:"rgba(122,240,196,.08)",border:"1px solid rgba(122,240,196,.2)",padding:"3px 9px",borderRadius:3}}>{revenueFilter}</span>}
                        {sizeFilter!=="Any Size"&&<span style={{fontSize:11,color:"#7af0c4",background:"rgba(122,240,196,.08)",border:"1px solid rgba(122,240,196,.2)",padding:"3px 9px",borderRadius:3}}>{sizeFilter} emp</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                    <button className="search-btn" onClick={()=>runSearch(false)} disabled={searching}>
                      {searching ? <><span className="spin">◌</span>Scanning…</> : <><span>⌕</span>Search All Sources</>}
                    </button>
                    <button className="clr" style={{width:"auto",padding:"10px 16px"}} onClick={()=>runSearch(true)} disabled={searching||!searchResults.length} title="Exclude current domains and run again">
                      Find more
                    </button>
                    </div>
                  </div>

                  {/* Status / progress */}
                  {searching&&(
                    <div className="scan-row" style={{marginTop:14}}>
                      <span className="pulse" style={{width:6,height:6,borderRadius:"50%",background:"#c4f04a",display:"inline-block",flexShrink:0}}/>
                      <span>{searchLog}</span>
                    </div>
                  )}
                  {searchError&&<div style={{marginTop:12,fontSize:12,color:"#f04a4a",padding:"8px 12px",background:"rgba(240,74,74,.06)",border:"1px solid rgba(240,74,74,.15)",borderRadius:3}}>{searchError}</div>}
                </div>

                {/* Results */}
                {displayedResults.length > 0 && (
                  <>
                    {/* Filter within results */}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,background:"#0d0d1a",border:"1px solid #131320",borderRadius:4,padding:"7px 13px"}}>
                      <span style={{color:"#222235",fontSize:15}}>⌕</span>
                      <input className="srch" placeholder={`Filter ${displayedResults.length} results…`} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
                      <span style={{fontSize:11,color:"#2a2a4a",flexShrink:0}}>{displayedResults.length} shown</span>
                    </div>

                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {displayedResults.map(c=>{
                        const isExp=expandedCompany===c.id;
                        const isSaved=!!c.is_saved;
                        const sc=(c.score||0)>=90?"#c4f04a":(c.score||0)>=80?"#4af0c4":(c.score||0)>=70?"#f0c44a":"#f0844a";
                        const ownLabel = c.ownership_class || c.ownership;
                        const oc=ownerColor[ownLabel]||"#5a5a7a";
                        const triageBtn = (field, val) => (
                          <button type="button" className="save-btn" style={{padding:"2px 6px",fontSize:10}} onClick={(e)=>{e.stopPropagation();patchClassify(c.id,{[field]:val});}}>{val}</button>
                        );
                        return (
                          <div key={c.id} className={`card ${isExp?"expanded":""}`} style={{cursor:"pointer"}} onClick={()=>setExpandedCompany(isExp?null:c.id)}>
                            <div style={{display:"flex",alignItems:"flex-start",gap:13}}>
                              <div className="score-ring" style={{background:`${sc}10`,border:`1px solid ${sc}30`,color:sc}}>{c.score ?? "—"}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                                    <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#e8e4d9"}}>{c.name}</span>
                                    {ownLabel&&<span style={{fontSize:10,background:`${oc}12`,border:`1px solid ${oc}30`,color:oc,padding:"2px 7px",borderRadius:2}}>{ownLabel}</span>}
                                    {c.classificationSource&&<span style={{fontSize:9,color:"#3a3a5a"}}>{c.classificationSource}</span>}
                                    {c.foundedYear&&<span style={{fontSize:10,color:"#2a2a4a"}}>Est. {c.foundedYear}</span>}
                                    {c.website&&<a href={c.website} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#3a3a6a",textDecoration:"none",background:"#0a0a12",padding:"2px 7px",borderRadius:2,border:"1px solid #131320"}} onClick={e=>e.stopPropagation()}>↗ website</a>}
                                  </div>
                                  <button className={`save-btn ${isSaved?"saved":""}`} onClick={e=>{e.stopPropagation();saveCompany(c.id,!isSaved);}}>
                                    {isSaved?"✓ Saved":"+ Save"}
                                  </button>
                                </div>
                                <div style={{fontSize:11,color:"#4a4a6a",marginBottom:4}}>
                                  MC:{c.missionCritical?"Y":"N"} · VI:{c.verticallyIntegrated?"Y":"N"} · Prop:{c.proprietaryStack?"Y":"N"}
                                  {typeof c.ownership_confidence==="number"&&<span style={{marginLeft:8}}>conf {c.ownership_confidence.toFixed(2)}</span>}
                                </div>
                                <div style={{fontSize:12,color:"#565670",marginBottom:8,lineHeight:1.5}}>{c.description}</div>
                                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                                  {(c.sourceTags||[]).map(s=><span key={s} style={{fontSize:10,color:"#7af0c4",background:"rgba(122,240,196,.08)",padding:"2px 7px",borderRadius:2,border:"1px solid rgba(122,240,196,.2)"}}>{s}</span>)}
                                  {(c.verticals||[]).map(v=><span key={v} style={{fontSize:10,color:"#f0844a",background:"rgba(240,132,74,.06)",padding:"2px 7px",borderRadius:2,border:"1px solid rgba(240,132,74,.15)"}}>{v}</span>)}
                                  {(c.tags||[]).map(t=><span key={t} style={{fontSize:10,color:"#2a2a4a",background:"#0a0a12",padding:"2px 7px",borderRadius:2,border:"1px solid #0f0f1e"}}>{t}</span>)}
                                </div>
                              </div>
                            </div>
                            {isExp&&(
                              <div className="fi" style={{marginTop:13,paddingTop:13,borderTop:"1px solid #131320"}}>
                                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:12}}>
                                  {[["Founded",c.foundedYear||"—"],["HQ",c.hq||"—"],["Country",c.country||"—"],["Employees",c.employees||"—"],["Revenue",c.revenue||"—"]].map(([k,v])=>(
                                    <div key={k}><div style={{fontSize:9,color:"#1e1e30",letterSpacing:".15em",textTransform:"uppercase",marginBottom:4}}>{k}</div><div style={{fontSize:12,color:"#b8b4a8"}}>{v}</div></div>
                                  ))}
                                </div>
                                {(c.acquisitionHistory||[]).length>0&&(
                                  <div style={{fontSize:11,color:"#6a6a8a",marginBottom:8}}>
                                    <span style={{color:"#2a2a4a",letterSpacing:".12em",textTransform:"uppercase",fontSize:9}}>Acquisitions</span>{" "}
                                    {(c.acquisitionHistory||[]).map((a,i)=><span key={i}>{a.year||"?"} {a.acquirer||""}{i<(c.acquisitionHistory||[]).length-1?"; ":""}</span>)}
                                  </div>
                                )}
                                {(c.missionCriticalReasonLLM||c.verticalIntegrationReasonLLM)&&(
                                  <div style={{fontSize:11,color:"#6a6a8a",marginBottom:8,lineHeight:1.5}}>
                                    {c.missionCriticalReasonLLM&&<div><b style={{color:"#8a8aaa"}}>LLM MC:</b> {c.missionCriticalReasonLLM}</div>}
                                    {c.verticalIntegrationReasonLLM&&<div><b style={{color:"#8a8aaa"}}>LLM VI:</b> {c.verticalIntegrationReasonLLM}</div>}
                                  </div>
                                )}
                                {(c.sources||[]).length>0&&(
                                  <div style={{fontSize:10,color:"#3a3a5a",marginBottom:10}}>
                                    {(c.sources||[]).slice(0,6).map((u,i)=><div key={i} style={{marginTop:3}}><a href={u} target="_blank" rel="noopener noreferrer" style={{color:"#5a5a8a"}} onClick={e=>e.stopPropagation()}>{u}</a></div>)}
                                  </div>
                                )}
                                <div style={{fontSize:10,color:"#8a8aaa",marginBottom:6}}>Manual triage</div>
                                <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                                  <span style={{color:"#3a3a5a"}}>Mission-critical</span>
                                  {triageBtn("manualMissionCritical","yes")}
                                  {triageBtn("manualMissionCritical","no")}
                                  {triageBtn("manualMissionCritical","maybe")}
                                  {triageBtn("manualMissionCritical","unset")}
                                  <span style={{color:"#3a3a5a",marginLeft:12}}>Vertical</span>
                                  {triageBtn("manualVerticallyIntegrated","yes")}
                                  {triageBtn("manualVerticallyIntegrated","no")}
                                  {triageBtn("manualVerticallyIntegrated","maybe")}
                                  {triageBtn("manualVerticallyIntegrated","unset")}
                                </div>
                                {c.homepageTextSample&&(
                                  <pre style={{marginTop:10,maxHeight:120,overflow:"auto",fontSize:9,color:"#4a4a6a",whiteSpace:"pre-wrap",background:"#08080e",padding:8,borderRadius:4,border:"1px solid #131320"}}>{String(c.homepageTextSample).slice(0,1200)}</pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Empty states */}
                {!searching&&!searchDone&&searchResults.length===0&&(
                  <div style={{textAlign:"center",padding:"50px 0",color:"#1e1e30"}}>
                    <div style={{fontSize:32,marginBottom:12}}>⌕</div>
                    <div style={{fontSize:13,color:"#2a2a4a"}}>Set your filters and click Search All Sources</div>
                    <div style={{fontSize:11,marginTop:6,color:"#1a1a2a"}}>Run npm run dev (starts API + Vite). Add Brave/Exa keys in .env for more coverage.</div>
                  </div>
                )}
                {!searching&&searchDone&&displayedResults.length===0&&(
                  <div style={{textAlign:"center",padding:"50px 0",color:"#2a2a4a"}}>
                    <div style={{fontSize:28,marginBottom:10}}>◌</div>
                    <div style={{fontSize:13}}>No results found — try broader filters</div>
                  </div>
                )}
              </div>
            )}

            {/* ─ Saved ─ */}
            {activeTab==="saved"&&(
              <div className="fi">
                {savedRows.length===0?(
                  <div style={{textAlign:"center",padding:"58px 0",color:"#2a2a4a"}}>
                    <div style={{fontSize:28,marginBottom:10}}>◌</div>
                    <div style={{fontSize:13}}>No saved companies yet</div>
                    <div style={{fontSize:11,marginTop:5,color:"#1a1a2a"}}>Search and save companies from Discover</div>
                  </div>
                ):(
                  <>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,padding:"10px 14px",background:"rgba(196,240,74,.04)",border:"1px solid rgba(196,240,74,.1)",borderRadius:4}}>
                      <div>
                        <span style={{fontSize:12,color:"#c4f04a",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{savedRows.length} compan{savedRows.length===1?"y":"ies"} in your sourcing file</span>
                        <span style={{fontSize:11,color:"#3a3a5a",marginLeft:10}}>Fill in contact details, then export</span>
                      </div>
                      <button className={`export-btn ${exportFlash?"flash":""}`} onClick={exportToExcel}>
                        <span>↓</span>{exportFlash?"Exported!":"Export to Excel"}
                      </button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {savedRows.map(c=>{
                        const m=companyMeta[c.id]||defaultMeta();
                        const ownLabel=c.ownership_class||c.ownership;
                        const oc=ownerColor[ownLabel]||"#5a5a7a";
                        const qc=qualityColor[m.quality];
                        return (
                          <div key={c.id} style={{border:"1px solid #1a1a2a",background:"#0d0d1a",borderRadius:5,overflow:"hidden"}}>
                            <div style={{padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:"1px solid #131320"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",minWidth:0}}>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#e8e4d9"}}>{c.name}</span>
                                {ownLabel&&<span style={{fontSize:10,background:`${oc}12`,border:`1px solid ${oc}30`,color:oc,padding:"2px 7px",borderRadius:2}}>{ownLabel}</span>}
                                {c.hq&&<span style={{fontSize:10,color:"#3a3a5a"}}>{c.hq}</span>}
                                {c.foundedYear&&<span style={{fontSize:10,color:"#2a2a4a"}}>Est. {c.foundedYear}</span>}
                                {c.employees&&<span style={{fontSize:10,color:"#2a2a4a"}}>{c.employees} emp</span>}
                                {c.revenue&&<span style={{fontSize:10,color:"#2a2a4a"}}>{c.revenue}</span>}
                              </div>
                              <button className="save-btn saved" style={{flexShrink:0}} onClick={()=>saveCompany(c.id,false)}>Remove</button>
                            </div>
                            <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 2fr",gap:10,alignItems:"start"}}>
                              {[["Website","website","https://…"],["Contact Name","contactName","Full name"],["Role","role","Title"],["Email","email","email@co.com"]].map(([lbl,field,ph])=>(
                                <div key={field}>
                                  <div style={{fontSize:9,color:"#2a2a4a",letterSpacing:".15em",textTransform:"uppercase",marginBottom:4}}>{lbl}</div>
                                  <input className="meta-in" placeholder={ph} value={m[field]} onChange={e=>updateMeta(c.id,field,e.target.value)} onClick={ev=>ev.stopPropagation()}/>
                                </div>
                              ))}
                              <div>
                                <div style={{fontSize:9,color:"#2a2a4a",letterSpacing:".15em",textTransform:"uppercase",marginBottom:4}}>Quality</div>
                                <select className="meta-sel" value={m.quality} onChange={e=>updateMeta(c.id,"quality",e.target.value)} onClick={ev=>ev.stopPropagation()}
                                  style={{color:qc||"#c8c4b8",borderColor:qc?`${qc}60`:"#131320",background:qc?`${qc}12`:"#0a0a12"}}>
                                  {QUALITY_TIERS.map(t=><option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div>
                                <div style={{fontSize:9,color:"#2a2a4a",letterSpacing:".15em",textTransform:"uppercase",marginBottom:4}}>Comments</div>
                                <input className="meta-in" placeholder="Notes, next steps, flags…" value={m.comments} onChange={e=>updateMeta(c.id,"comments",e.target.value)} onClick={ev=>ev.stopPropagation()}/>
                              </div>
                            </div>
                            <div style={{padding:"0 16px 12px",display:"flex",gap:5,flexWrap:"wrap"}}>
                              {(c.verticals||[]).map(v=><span key={v} style={{fontSize:10,color:"#f0844a",background:"rgba(240,132,74,.06)",padding:"2px 7px",borderRadius:2,border:"1px solid rgba(240,132,74,.15)"}}>{v}</span>)}
                              {(c.products||[]).map(p=><span key={p} style={{fontSize:10,color:"#3a3a5a",background:"#0a0a12",padding:"2px 7px",borderRadius:2,border:"1px solid #131320"}}>{p}</span>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab==="universe"&&(
              <div className="fi">
                <div style={{fontSize:12,color:"#3a3a5a",marginBottom:12}}>
                  All companies persisted in <code style={{color:"#5a5a7a"}}>universe.db</code> ({universeTotal} total, showing {universeRows.length}).
                </div>
                <button className="clr" style={{width:"auto",marginBottom:12}} onClick={loadUniverseRows}>Refresh</button>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {universeRows.map((c)=>{
                    const ownLabel=c.ownership_class||c.ownership;
                    const oc=ownerColor[ownLabel]||"#5a5a7a";
                    return (
                      <div key={c.id} className="card" style={{cursor:"default"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#e8e4d9"}}>{c.name}</span>
                            {ownLabel&&<span style={{fontSize:10,background:`${oc}12`,border:`1px solid ${oc}30`,color:oc,padding:"2px 7px",borderRadius:2}}>{ownLabel}</span>}
                            {c.is_saved&&<span style={{fontSize:10,color:"#c4f04a"}}>saved</span>}
                            <span style={{fontSize:10,color:"#3a3a5a"}}>{c.domain}</span>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <a className="save-btn" href={c.website} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>↗ site</a>
                            <button className="save-btn" onClick={()=>saveCompany(c.id,!c.is_saved)}>{c.is_saved?"Unsave":"Save"}</button>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:"#4a4a6a",marginTop:6}}>Score {(c.score ?? c.thesisScore) || "—"} · {(c.sourceTags||[]).join(" · ")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-bg" onClick={() => setSettingsOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,marginBottom:10}}>Settings</div>
            <div style={{fontSize:11,color:"#6a6a8a",marginBottom:12}}>API keys live in server <code>.env</code> (never in the browser). Badges show what the server detected.</div>
            <span className="fl" style={{marginTop:0}}>LLM classifier (optional)</span>
            <select className="sel" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
              {["none","openai","anthropic","gemini","ollama"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div style={{marginTop:14,fontSize:10,color:"#3a3a5a",lineHeight:1.6}}>
              <div>Brave: {apiStatus.brave ? "on" : "off"}</div>
              <div>Exa: {apiStatus.exa ? "on" : "off"}</div>
              <div>Apollo: {apiStatus.apollo ? "on" : "off"}</div>
              <div>Crunchbase: {apiStatus.crunchbase ? "on" : "off"}</div>
              <div>OpenAI: {apiStatus.openai ? "on" : "off"}</div>
              <div>Anthropic: {apiStatus.anthropic ? "on" : "off"}</div>
              <div>Gemini: {apiStatus.gemini ? "on" : "off"}</div>
            </div>
            <button className="search-btn" style={{marginTop:16,width:"100%",justifyContent:"center"}} type="button" onClick={() => setSettingsOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
