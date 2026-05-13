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
];
