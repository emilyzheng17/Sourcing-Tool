/**
 * Portfolio / acquisitions / hub pages for serial acquirers and rollup platforms (Valsoft-adjacent).
 * Entries use `pageUrl` + `name` for tagging as `Rollup:<name>` in merger output.
 *
 * Prefer dedicated listing pages where they reliably link to acquired companies; homepage fallbacks
 * remain useful for Cheerio outbound links when no index exists.
 */
export const ROLLUP_PAGES = [
  { id: "valsoft-portfolio", name: "Valsoft", pageUrl: "https://www.valsoftcorp.com/portfolio" },
  { id: "valsoft-fluent", name: "Valsoft Fluent Software Group", pageUrl: "https://www.valsoftcorp.com/groups/fluent" },
  { id: "lighthouse", name: "Lighthouse Software Group", pageUrl: "https://www.lighthousesoftwaregroup.com/" },
  { id: "aspire", name: "Aspire Software", pageUrl: "https://www.aspiresoftware.com/" },
  {
    id: "jonas-csi",
    name: "Jonas Software",
    pageUrl: "https://jonassoftware.com/our-companies/",
  },
  { id: "volaris-press", name: "Volaris Group", pageUrl: "https://www.volarisgroup.com/press-room" },
  { id: "harris-csi", name: "Harris Computer", pageUrl: "https://www.harriscomputer.com/" },
  { id: "vela-csi", name: "Vela Software", pageUrl: "https://www.velasoftware.com/" },
  {
    id: "perseus-csi",
    name: "Perseus Group",
    pageUrl: "https://www.perseuscorp.com/companies-weve-acquired/",
  },
  { id: "csisoftware-groups", name: "Constellation Software", pageUrl: "https://www.csisoftware.com/operating-groups/" },
  { id: "banyan-portfolio", name: "Banyan Software", pageUrl: "https://www.banyansoftware.com/portfolio/" },
  { id: "alpine-asg", name: "Alpine Software Group (Alpine.gg)", pageUrl: "https://www.alpine.gg/portfolio/companies/all" },
  {
    id: "big-band",
    name: "Big Band Software",
    pageUrl: "https://www.bigbandsoftware.com/portfolio/",
  },
  {
    id: "teamfront",
    name: "Teamfront",
    pageUrl: "https://www.teamfront.com/",
  },
  {
    id: "main-capital-portfolio",
    name: "Main Capital Partners",
    pageUrl: "https://www.main-capital.com/portfolio",
  },
  {
    id: "evergreen-sg",
    name: "Evergreen Services Group",
    pageUrl: "https://www.evergreensg.com/",
  },
  {
    id: "volaris-companies",
    name: "Volaris Group Operating Companies",
    pageUrl: "https://www.volarisgroup.com/our-businesses/",
  },
  { id: "topicus", name: "Topicus (TSS)", pageUrl: "https://www.topicus.com/companies" },
  { id: "everfield", name: "Everfield", pageUrl: "https://www.everfield.com/portfolio/" },
  { id: "arcadea", name: "Arcadea Group", pageUrl: "https://www.arcadeagroup.com/portfolio/" },
  { id: "lumine", name: "Lumine Group", pageUrl: "https://www.luminegroup.com/companies/" },
  { id: "modaxo", name: "Modaxo", pageUrl: "https://www.modaxo.com/companies/" },
  { id: "vencora", name: "Vencora", pageUrl: "https://www.vencora.com/our-companies/" },
  { id: "valantic", name: "Valantic", pageUrl: "https://www.valantic.com/en/companies/" },
  { id: "tss-total", name: "Total Specific Solutions", pageUrl: "https://www.totalspecificsolutions.com/companies" },
  { id: "romulus", name: "Romulus Capital / Software Holdco", pageUrl: "https://www.romuluscap.com/portfolio" },
  { id: "csi-modaxo-style", name: "Vela Software (CSI)", pageUrl: "https://www.velasoftware.com/our-companies" },
  { id: "lumine-volaris", name: "Harris Operating Companies", pageUrl: "https://www.harriscomputer.com/our-companies" },
  { id: "modaxo-transit", name: "Modaxo Operating Brands", pageUrl: "https://www.modaxo.com/brands" },

  // Publicly-listed Nordic / European serial software acquirers
  { id: "vitec-acquisitions", name: "Vitec Software Group", pageUrl: "https://www.vitecsoftware.com/en/acquisitions/" },
  { id: "addnode", name: "Addnode Group", pageUrl: "https://www.addnodegroup.com/en/divisions/" },
  { id: "visma", name: "Visma", pageUrl: "https://www.visma.com/companies/" },
  { id: "enghouse", name: "Enghouse Systems", pageUrl: "https://www.enghouse.com/divisions/" },
  { id: "hawk-infinity", name: "Hawk Infinity", pageUrl: "https://hawkinfinity.com/portfolio" },

  // Additional CSI operating groups
  { id: "csi-andromeda", name: "CSI Andromeda", pageUrl: "https://www.csiandromeda.com/" },
  { id: "csi-alpha", name: "CSI Alpha", pageUrl: "https://www.csialpha.com/about-us/" },
  { id: "csi-perseus-new", name: "Perseus Group (CSI)", pageUrl: "https://www.csiperseus.com/companies/" },

  // North American software holdcos
  { id: "pride-capital", name: "Pride Capital", pageUrl: "https://www.pridecapital.nl/portfolio" },
  { id: "k1ops", name: "K1 Operations Portfolio", pageUrl: "https://www.k1.com/companies/" },
  { id: "synova-holdco", name: "Synova Software", pageUrl: "https://www.synova.co.uk/portfolio/" },
  { id: "idera", name: "Idera (TA Associates holdco)", pageUrl: "https://www.idera.com/products/" },
  { id: "minimax-software", name: "Access Holdings", pageUrl: "https://www.theaccessgroup.com/en-gb/software-solutions/" },

  // European software acquirer holdcos
  { id: "cint-group", name: "Cint Group (Nordic acquirer)", pageUrl: "https://www.cint.com/investors/" },
  { id: "proact-it", name: "Proact IT Group", pageUrl: "https://www.proact.com/about-proact/" },
  { id: "tieto-evry", name: "TietoEVRY (Tietoevry)", pageUrl: "https://www.tietoevry.com/en/about-us/our-businesses/" },
  { id: "atea", name: "Atea", pageUrl: "https://www.atea.com/about-atea/companies/" },
  { id: "sollentuna-software", name: "Fortnox Holdings", pageUrl: "https://www.fortnox.se/om-fortnox/" },
  { id: "projectplace", name: "Planview (TPG holdco)", pageUrl: "https://www.planview.com/company/" },

  // Valsoft sub-groups (Asgard, Allevia, Trafera, Velocity, etc.)
  { id: "valsoft-groups-index", name: "Valsoft Groups", pageUrl: "https://www.valsoftcorp.com/groups" },
  { id: "valsoft-asgard", name: "Valsoft Asgard Group", pageUrl: "https://www.valsoftcorp.com/groups/asgard" },
  { id: "valsoft-allevia", name: "Valsoft Allevia Group", pageUrl: "https://www.valsoftcorp.com/groups/allevia" },
  { id: "valsoft-trafera", name: "Valsoft Trafera Group", pageUrl: "https://www.valsoftcorp.com/groups/trafera" },
  { id: "valsoft-velocity", name: "Valsoft Velocity Group", pageUrl: "https://www.valsoftcorp.com/groups/velocity" },
  { id: "aspire-portfolio", name: "Aspire Software Portfolio", pageUrl: "https://www.aspiresoftware.com/portfolio/" },

  // Additional Constellation Software operating groups + sub-units
  { id: "csi-jonas-group", name: "Jonas Group (CSI)", pageUrl: "https://jonasgroup.com/companies/" },
  { id: "csi-trapeze", name: "Trapeze Group (Modaxo)", pageUrl: "https://www.trapezegroup.com/about-us" },
  { id: "csi-friedman", name: "Friedman Operating Group (CSI)", pageUrl: "https://www.friedmangroup.com/companies/" },
  { id: "csi-vela-divisions", name: "Vela Software Divisions", pageUrl: "https://www.velasoftware.com/divisions" },

  // Other large diversified serial acquirers of vertical software
  { id: "roper-businesses", name: "Roper Technologies", pageUrl: "https://www.ropertech.com/our-businesses/" },
  { id: "sylogist-products", name: "Sylogist", pageUrl: "https://www.sylogist.com/products/" },
  { id: "asseco-companies", name: "Asseco Group", pageUrl: "https://asseco.com/about-us/group-companies/" },
  { id: "tyler-products", name: "Tyler Technologies", pageUrl: "https://www.tylertech.com/products" },
  { id: "trimble-businesses", name: "Trimble", pageUrl: "https://www.trimble.com/en/our-company/businesses" },
  { id: "n-able-portfolio", name: "N-able portfolio", pageUrl: "https://www.n-able.com/about/companies" },
  { id: "ifs-businesses", name: "IFS", pageUrl: "https://www.ifs.com/about/our-businesses" },

  // Banyan and adjacent small-cap software holdcos
  { id: "banyan-acquired", name: "Banyan Software Acquired", pageUrl: "https://www.banyansoftware.com/companies-acquired" },
  { id: "tilia-holdings", name: "Tilia Holdings", pageUrl: "https://tiliaholdings.com/portfolio/" },
  { id: "trilantic-software", name: "Trilantic North America", pageUrl: "https://www.trilantic.com/portfolio/" },

  // ESW Capital / Trilogy family (Aurea, GFI, Jive, Crossover)
  { id: "esw-capital", name: "ESW Capital", pageUrl: "https://espuk.com/companies/" },
  { id: "trilogy", name: "Trilogy", pageUrl: "https://www.trilogy.com/" },
  { id: "aurea", name: "Aurea Software", pageUrl: "https://www.aurea.com/library/" },
  { id: "gfi-software", name: "GFI Software", pageUrl: "https://www.gfi.com/products" },
  { id: "jive-software", name: "Jive Software (Aurea)", pageUrl: "https://www.jivesoftware.com/" },
  { id: "crossover", name: "Crossover (Trilogy)", pageUrl: "https://www.crossover.com/" },

  // Mid-market vertical-software acquirers
  { id: "eci-software", name: "ECI Software Solutions", pageUrl: "https://www.ecisolutions.com/products/" },

  // Bootstrapped / micro-SaaS holdcos
  { id: "saas-group", name: "saas.group", pageUrl: "https://saas.group/brands/" },
  { id: "sureswift", name: "SureSwift Capital", pageUrl: "https://sureswiftcapital.com/our-companies/" },
  { id: "dura-software", name: "Dura Software", pageUrl: "https://durasoftware.com/our-companies/" },
  { id: "tiny", name: "Tiny", pageUrl: "https://www.tiny.com/companies" },
  { id: "bending-spoons", name: "Bending Spoons", pageUrl: "https://bendingspoons.com/products.html" },

  // Everfield operating brands (deeper than the portfolio index above)
  { id: "everfield-companies", name: "Everfield Companies", pageUrl: "https://www.everfield.com/companies/" },

  // Deeper Constellation Software sub-units / operating groups
  { id: "csi-jonas-club", name: "Jonas Club Software (CSI)", pageUrl: "https://www.jonasclub.com/" },
  { id: "csi-jonas-fitness", name: "Jonas Fitness (CSI)", pageUrl: "https://www.jonasfitness.com/" },
  { id: "csi-mediware", name: "WellSky / Mediware (CSI-adjacent)", pageUrl: "https://wellsky.com/our-solutions/" },
  { id: "csi-volaris-trapeze", name: "Trapeze Group Companies (Modaxo)", pageUrl: "https://www.trapezegroup.com/solutions" },
  { id: "csi-harris-healthcare", name: "Harris Healthcare (CSI)", pageUrl: "https://www.harrishealthcare.com/companies/" },
  { id: "csi-harris-utilities", name: "Harris Utilities (CSI)", pageUrl: "https://harriscomputer.com/en/our-companies" },
  { id: "csi-gworks", name: "gWorks (Harris/CSI)", pageUrl: "https://www.gworks.com/" },
  { id: "csi-vela-public", name: "Vela Public Sector (CSI)", pageUrl: "https://www.velasoftware.com/companies" },
];
