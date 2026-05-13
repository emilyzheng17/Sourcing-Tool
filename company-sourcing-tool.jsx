import { useState, useRef } from "react";
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

const OWNERSHIP_TYPES = ["Any Ownership","Founder-Owned","VC-Backed","Private Equity","Acquired","Publicly Traded","Family-Owned","Employee-Owned (ESOP)"];
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
  const [savedCompanies, setSavedCompanies] = useState([]);
  const [companyMeta, setCompanyMeta] = useState({});
  const [activeTab, setActiveTab] = useState("discover");
  const [sidebarSection, setSidebarSection] = useState("product");
  const [exportFlash, setExportFlash] = useState(false);

  // AI search state
  const [searchResults, setSearchResults] = useState([]); // array of company objects from AI
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchLog, setSearchLog] = useState(""); // streaming status messages
  const [expandedCompany, setExpandedCompany] = useState(null);

  const toggleTag = (group, tag) => setSelectedTags(prev => { const c=prev[group]||[]; return {...prev,[group]:c.includes(tag)?c.filter(t=>t!==tag):[...c,tag]}; });
  const toggleVertical = v => setSelectedVerticals(prev => prev.includes(v)?prev.filter(x=>x!==v):[...prev,v]);
  const allSelectedTags = Object.values(selectedTags).flat();
  const saveCompany = id => { setSavedCompanies(prev=>[...prev,id]); setCompanyMeta(prev=>({...prev,[id]:defaultMeta()})); };
  const unsaveCompany = id => setSavedCompanies(prev=>prev.filter(x=>x!==id));
  const updateMeta = (id,field,val) => setCompanyMeta(prev=>({...prev,[id]:{...(prev[id]||defaultMeta()),[field]:val}}));

  const activeFilterCount = allSelectedTags.length + selectedVerticals.length +
    (ownershipFilter!=="Any Ownership"?1:0) + (revenueFilter!=="Any Revenue"?1:0) +
    (sizeFilter!=="Any Size"?1:0) + (foundedFilter!=="Any Era"?1:0);

  const clearAll = () => { setSelectedTags({}); setSelectedVerticals([]); setOwnershipFilter("Any Ownership"); setRevenueFilter("Any Revenue"); setSizeFilter("Any Size"); setFoundedFilter("Any Era"); };

  const savedList = searchResults.filter(c => savedCompanies.includes(c.id));

  // ── AI-powered company search ──
  const runSearch = async () => {
    setSearching(true);
    setSearchDone(false);
    setSearchError("");
    setSearchResults([]);
    setSearchLog("Preparing search criteria…");

    const verticalContext = selectedVerticals.length ? selectedVerticals.join(", ") : "any industrial vertical";
    const tagContext = allSelectedTags.length ? allSelectedTags.join(", ") : "no specific feature filters";
    const ownerCtx = ownershipFilter !== "Any Ownership" ? ownershipFilter : "any ownership";
    const revCtx = revenueFilter !== "Any Revenue" ? revenueFilter : "any revenue";
    const sizeCtx = sizeFilter !== "Any Size" ? sizeFilter : "any size";
    const foundedCtx = foundedFilter !== "Any Era" ? foundedFilter : "any era";

    const systemPrompt = `You are an exhaustive B2B software market researcher. Your job is to find the MAXIMUM number of real, verifiable software companies that match a sourcing brief. Use your web_search tool aggressively — run at least 8-12 searches with varied queries to find as many companies as possible. Search for: company directories (G2, Capterra, Software Advice, GetApp, Gartner Peer Insights), industry blogs, market reports, niche forums, LinkedIn searches, news articles, and any other source. Do NOT stop after a few results. Keep searching until you have exhausted all angles.

For each company found, return a JSON object. After ALL searches are complete, return ONLY a single JSON array (no markdown, no explanation, just the raw JSON array) of company objects. Each object must have these exact keys:
{
  "id": <unique integer>,
  "name": <string>,
  "website": <string, full URL>,
  "country": <2-letter code, default "US">,
  "foundedYear": <integer or null>,
  "employees": <string range like "11–50" or null>,
  "revenue": <string like "$1M–$5M" or null>,
  "ownership": <one of: "Founder-Owned","VC-Backed","Private Equity","Acquired","Publicly Traded","Family-Owned","Employee-Owned (ESOP)" or null>,
  "hq": <city, state/country string>,
  "verticals": <array of strings from: Metals & Mining, Bulk Materials, Bulk Liquids, Forestry & Lumber, Structure Design & Analysis, Contractor Solutions, Equipment & Parts, Waste & Recycling, Safety & Compliance>,
  "products": [<the software product type: "${activeProduct}">],
  "tags": <array of relevant feature/capability strings>,
  "description": <2-sentence description of what they do>,
  "score": <integer 1-100 relevance score>
}

Aim for 20-40+ companies. Include both well-known vendors AND smaller niche players. Be thorough.`;

    const userPrompt = `Find every software company you can that sells ${activeProduct} software, targeting these industrial verticals: ${verticalContext}.

Additional filters to consider:
- Feature tags: ${tagContext}
- Ownership: ${ownerCtx}
- Revenue range: ${revCtx}  
- Company size: ${sizeCtx}
- Founded: ${foundedCtx}

Search exhaustively. Run many searches. Return as many real companies as possible as a raw JSON array.`;

    try {
      setSearchLog("Scanning software directories, G2, Capterra, market reports…");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        })
      });

      const data = await res.json();

      // Count how many web searches were run
      const searchCalls = (data.content||[]).filter(b => b.type === "tool_use" && b.name === "web_search");
      if (searchCalls.length > 0) {
        setSearchLog(`Ran ${searchCalls.length} web searches — parsing results…`);
      }

      // Extract the final text block
      const textBlock = (data.content||[]).filter(b => b.type === "text").map(b => b.text).join("\n");

      // Parse JSON from the response
      let companies = [];
      // Try to find a JSON array in the response
      const jsonMatch = textBlock.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          companies = JSON.parse(jsonMatch[0]);
        } catch(e) {
          // Try cleaning up common issues
          const cleaned = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
          try { companies = JSON.parse(cleaned); } catch(e2) {
            setSearchError("Received results but couldn't parse them. Try searching again.");
          }
        }
      } else {
        setSearchError("No structured results returned. Please try again.");
      }

      if (companies.length > 0) {
        // Re-assign IDs to avoid collisions, ensure array fields
        const cleaned = companies.map((c, i) => ({
          ...c,
          id: i + 1,
          verticals: Array.isArray(c.verticals) ? c.verticals : [c.verticals].filter(Boolean),
          products: Array.isArray(c.products) ? c.products : [activeProduct],
          tags: Array.isArray(c.tags) ? c.tags : [],
          score: typeof c.score === "number" ? c.score : 75,
          foundedYear: c.foundedYear || null,
        }));
        setSearchResults(cleaned);
        setSearchLog(`Found ${cleaned.length} companies`);
      }
      setSearchDone(true);
    } catch(e) {
      setSearchError("Search failed. Please try again.");
      setSearchLog("");
    }
    setSearching(false);
  };

  // ── Excel Export ──
  const exportToExcel = () => {
    if (!savedList.length) return;
    const rows = savedList.map(c => {
      const m = companyMeta[c.id] || defaultMeta();
      return {
        "Website":        m.website || c.website || "",
        "Company":        c.name,
        "Vertical":       (c.verticals||[]).join(", "),
        "Country":        c.country || "",
        "Year Founded":   c.foundedYear || "",
        "Employees":      c.employees || "",
        "Quality":        m.quality !== "—" ? m.quality : "",
        "Est. Revenue":   c.revenue || "",
        "Overview":       c.description || "",
        "Ownership":      c.ownership || "",
        "Contact Name":   m.contactName,
        "Role":           m.role,
        "Email":          m.email,
        "Comments":       m.comments,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:35},{wch:25},{wch:28},{wch:8},{wch:13},{wch:12},{wch:10},{wch:14},{wch:55},{wch:22},{wch:20},{wch:18},{wch:28},{wch:40}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sourcing");
    XLSX.writeFile(wb, "sourcing-file.xlsx");
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 1800);
  };

  const prodData = SOFTWARE_PRODUCTS[activeProduct];
  const ownerColor = {"VC-Backed":"#4af0c4","Private Equity":"#c44af0","Founder-Owned":"#f0c44a","Acquired":"#f08a4a","Family-Owned":"#4a8af0","Employee-Owned (ESOP)":"#f04a8a","Publicly Traded":"#8af04a"};
  const qualityColor = {"Bronze":"#cd7f32","Silver":"#c0c0c0","Gold":"#ffd700","Platinum":"#e5e4e2"};

  // Apply any local filters to search results
  const displayedResults = searchResults.filter(c => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.description||"").toLowerCase().includes(q) && !(c.verticals||[]).some(v=>v.toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a,b) => b.score - a.score);

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
      `}</style>

      {/* ── Header ── */}
      <div style={{borderBottom:"1px solid #131320",padding:"12px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#e8e4d9",letterSpacing:"-0.02em"}}>SOURCE</span>
          <span style={{fontSize:10,color:"#222235",letterSpacing:"0.2em",textTransform:"uppercase"}}>Software Intelligence</span>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          {activeFilterCount>0&&<div style={{background:"rgba(240,132,74,.08)",border:"1px solid rgba(240,132,74,.2)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#f0844a"}}>{activeFilterCount} filter{activeFilterCount>1?"s":""} active</div>}
          {searchDone&&<div style={{background:"rgba(196,240,74,.06)",border:"1px solid rgba(196,240,74,.15)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#c4f04a"}}>{searchResults.length} found</div>}
          <div style={{background:"rgba(196,240,74,.06)",border:"1px solid rgba(196,240,74,.15)",borderRadius:3,padding:"3px 9px",fontSize:11,color:"#c4f04a"}}>{savedCompanies.length} saved</div>
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
              {[["discover","Discover"],["saved",`Saved (${savedCompanies.length})`]].map(([id,lbl])=>(
                <button key={id} className={`main-tab ${activeTab===id?"active":""}`} onClick={()=>setActiveTab(id)}>{lbl}</button>
              ))}
            </div>
            {activeTab==="saved"&&(
              <button className={`export-btn ${exportFlash?"flash":""}`} onClick={exportToExcel} disabled={!savedList.length}>
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
                        AI will scan G2, Capterra, industry directories, news, and the web to find every matching vendor. Set your filters in the sidebar and tag bar above, then hit search.
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
                    <button className="search-btn" onClick={runSearch} disabled={searching}>
                      {searching ? <><span className="spin">◌</span>Scanning…</> : <><span>⌕</span>Search All Sources</>}
                    </button>
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
                        const isSaved=savedCompanies.includes(c.id);
                        const sc=c.score>=90?"#c4f04a":c.score>=80?"#4af0c4":c.score>=70?"#f0c44a":"#f0844a";
                        const oc=ownerColor[c.ownership]||"#5a5a7a";
                        return (
                          <div key={c.id} className={`card ${isExp?"expanded":""}`} style={{cursor:"pointer"}} onClick={()=>setExpandedCompany(isExp?null:c.id)}>
                            <div style={{display:"flex",alignItems:"flex-start",gap:13}}>
                              <div className="score-ring" style={{background:`${sc}10`,border:`1px solid ${sc}30`,color:sc}}>{c.score}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                                    <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#e8e4d9"}}>{c.name}</span>
                                    {c.ownership&&<span style={{fontSize:10,background:`${oc}12`,border:`1px solid ${oc}30`,color:oc,padding:"2px 7px",borderRadius:2}}>{c.ownership}</span>}
                                    {c.foundedYear&&<span style={{fontSize:10,color:"#2a2a4a"}}>Est. {c.foundedYear}</span>}
                                    {c.website&&<a href={c.website} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#3a3a6a",textDecoration:"none",background:"#0a0a12",padding:"2px 7px",borderRadius:2,border:"1px solid #131320"}} onClick={e=>e.stopPropagation()}>↗ website</a>}
                                  </div>
                                  <button className={`save-btn ${isSaved?"saved":""}`} onClick={e=>{e.stopPropagation();isSaved?unsaveCompany(c.id):saveCompany(c.id);}}>
                                    {isSaved?"✓ Saved":"+ Save"}
                                  </button>
                                </div>
                                <div style={{fontSize:12,color:"#565670",marginBottom:8,lineHeight:1.5}}>{c.description}</div>
                                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                                  {(c.verticals||[]).map(v=><span key={v} style={{fontSize:10,color:"#f0844a",background:"rgba(240,132,74,.06)",padding:"2px 7px",borderRadius:2,border:"1px solid rgba(240,132,74,.15)"}}>{v}</span>)}
                                  {(c.tags||[]).map(t=><span key={t} style={{fontSize:10,color:"#2a2a4a",background:"#0a0a12",padding:"2px 7px",borderRadius:2,border:"1px solid #0f0f1e"}}>{t}</span>)}
                                </div>
                              </div>
                            </div>
                            {isExp&&(
                              <div className="fi" style={{marginTop:13,paddingTop:13,borderTop:"1px solid #131320",display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                                {[["Founded",c.foundedYear||"—"],["HQ",c.hq||"—"],["Country",c.country||"—"],["Employees",c.employees||"—"],["Revenue",c.revenue||"—"]].map(([k,v])=>(
                                  <div key={k}><div style={{fontSize:9,color:"#1e1e30",letterSpacing:".15em",textTransform:"uppercase",marginBottom:4}}>{k}</div><div style={{fontSize:12,color:"#b8b4a8"}}>{v}</div></div>
                                ))}
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
                    <div style={{fontSize:11,marginTop:6,color:"#1a1a2a"}}>AI will scan G2, Capterra, directories, and the web</div>
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
                {savedList.length===0?(
                  <div style={{textAlign:"center",padding:"58px 0",color:"#2a2a4a"}}>
                    <div style={{fontSize:28,marginBottom:10}}>◌</div>
                    <div style={{fontSize:13}}>No saved companies yet</div>
                    <div style={{fontSize:11,marginTop:5,color:"#1a1a2a"}}>Search and save companies from Discover</div>
                  </div>
                ):(
                  <>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,padding:"10px 14px",background:"rgba(196,240,74,.04)",border:"1px solid rgba(196,240,74,.1)",borderRadius:4}}>
                      <div>
                        <span style={{fontSize:12,color:"#c4f04a",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{savedList.length} compan{savedList.length===1?"y":"ies"} in your sourcing file</span>
                        <span style={{fontSize:11,color:"#3a3a5a",marginLeft:10}}>Fill in contact details, then export</span>
                      </div>
                      <button className={`export-btn ${exportFlash?"flash":""}`} onClick={exportToExcel}>
                        <span>↓</span>{exportFlash?"Exported!":"Export to Excel"}
                      </button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {savedList.map(c=>{
                        const m=companyMeta[c.id]||defaultMeta();
                        const oc=ownerColor[c.ownership]||"#5a5a7a";
                        const qc=qualityColor[m.quality];
                        return (
                          <div key={c.id} style={{border:"1px solid #1a1a2a",background:"#0d0d1a",borderRadius:5,overflow:"hidden"}}>
                            <div style={{padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:"1px solid #131320"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",minWidth:0}}>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#e8e4d9"}}>{c.name}</span>
                                {c.ownership&&<span style={{fontSize:10,background:`${oc}12`,border:`1px solid ${oc}30`,color:oc,padding:"2px 7px",borderRadius:2}}>{c.ownership}</span>}
                                {c.hq&&<span style={{fontSize:10,color:"#3a3a5a"}}>{c.hq}</span>}
                                {c.foundedYear&&<span style={{fontSize:10,color:"#2a2a4a"}}>Est. {c.foundedYear}</span>}
                                {c.employees&&<span style={{fontSize:10,color:"#2a2a4a"}}>{c.employees} emp</span>}
                                {c.revenue&&<span style={{fontSize:10,color:"#2a2a4a"}}>{c.revenue}</span>}
                              </div>
                              <button className="save-btn saved" style={{flexShrink:0}} onClick={()=>unsaveCompany(c.id)}>Remove</button>
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

          </div>
        </div>
      </div>
    </div>
  );
}
