/**
 * Shared category slug/path maps keyed by brief.activeProduct.
 * Used by free directory scrapers (G2-family sites, SourceForge, SaaSHub, etc.).
 */

/** @type {Record<string, string | string[]>} */
export const SOFTWARE_ADVICE_PATHS = {
  "ERP & Operations": ["erp", "distribution", "manufacturing-management"],
  "Fleet & Asset Management": ["fleet-management", "asset-management"],
  "Safety & Compliance Management": ["compliance", "ehs"],
  "Field Service Management": ["field-service"],
  "Estimating & Bidding": ["construction-estimating"],
  "Supply Chain & Inventory": ["supply-chain-management", "inventory-management"],
  "Dispatch & Logistics": ["transportation-management", "route-planning"],
  "Environmental & Waste Management": ["waste-management"],
  "Structural & Engineering Design": ["structural-engineering"],
  "Project Management": ["construction/project-management-software-comparison"],
  "Maintenance Management (CMMS)": ["cmms"],
  "Weighbridge & Ticketing": ["erp"],
  "CRM & Sales": ["crm"],
  "HR & Workforce Management": ["hr", "payroll"],
  "Business Intelligence & Reporting": ["business-intelligence"],
};

/** @type {Record<string, string | string[]>} */
export const SOURCEFORGE_PATHS = {
  "ERP & Operations": ["erp", "manufacturing-management"],
  "Fleet & Asset Management": ["fleet-management", "asset-management"],
  "Safety & Compliance Management": ["compliance", "ehs-management"],
  "Field Service Management": ["field-service-management"],
  "Estimating & Bidding": ["construction-estimating"],
  "Supply Chain & Inventory": ["supply-chain-management", "inventory-management"],
  "Dispatch & Logistics": ["transportation-management", "route-planning"],
  "Environmental & Waste Management": ["waste-management"],
  "Structural & Engineering Design": ["structural-engineering"],
  "Project Management": ["construction-project-management"],
  "Maintenance Management (CMMS)": ["cmms"],
  "Weighbridge & Ticketing": ["erp"],
  "CRM & Sales": ["crm"],
  "HR & Workforce Management": ["human-resources", "payroll"],
  "Business Intelligence & Reporting": ["business-intelligence"],
};

/** @type {Record<string, string | string[]>} */
export const SLASHDOT_PATHS = {
  "ERP & Operations": ["erp", "manufacturing"],
  "Fleet & Asset Management": ["fleet-management", "asset-management"],
  "Safety & Compliance Management": ["compliance", "ehs"],
  "Field Service Management": ["field-service"],
  "Estimating & Bidding": ["construction-estimating"],
  "Supply Chain & Inventory": ["supply-chain-management"],
  "Dispatch & Logistics": ["transportation-management", "route-planning"],
  "Environmental & Waste Management": ["waste-management"],
  "Structural & Engineering Design": ["structural-engineering"],
  "Project Management": ["construction-project-management"],
  "Maintenance Management (CMMS)": ["cmms"],
  "Weighbridge & Ticketing": ["erp"],
  "CRM & Sales": ["crm"],
  "HR & Workforce Management": ["human-resources"],
  "Business Intelligence & Reporting": ["business-intelligence"],
};

/** @type {Record<string, string | string[]>} */
export const SAASHUB_PATHS = {
  "ERP & Operations": ["best-erp-software", "best-inventory-management-software"],
  "Fleet & Asset Management": ["best-fleet-management-software"],
  "Safety & Compliance Management": ["best-compliance-software", "best-ehs-software"],
  "Field Service Management": ["best-field-management-software", "best-field-service-management-software"],
  "Estimating & Bidding": ["best-construction-management-software"],
  "Supply Chain & Inventory": ["best-supply-chain-management-software"],
  "Dispatch & Logistics": ["best-logistics-software"],
  "Environmental & Waste Management": ["best-waste-management-software"],
  "Structural & Engineering Design": ["best-cad-software"],
  "Project Management": ["best-project-management-software", "best-construction-management-software"],
  "Maintenance Management (CMMS)": ["best-cmms-software"],
  "Weighbridge & Ticketing": ["best-erp-software"],
  "CRM & Sales": ["best-crm-software"],
  "HR & Workforce Management": ["best-hr-software"],
  "Business Intelligence & Reporting": ["best-business-intelligence-software"],
};

/** @type {Record<string, string | string[]>} */
export const ALTERNATIVETO_PATHS = {
  "ERP & Operations": ["erp", "inventory-management"],
  "Fleet & Asset Management": ["fleet-management"],
  "Safety & Compliance Management": ["compliance", "environmental-health-and-safety"],
  "Field Service Management": ["field-service-management"],
  "Estimating & Bidding": ["construction-estimating"],
  "Supply Chain & Inventory": ["supply-chain-management"],
  "Dispatch & Logistics": ["logistics", "transportation-management"],
  "Environmental & Waste Management": ["waste-management"],
  "Structural & Engineering Design": ["structural-engineering", "computer-aided-design"],
  "Project Management": ["project-management", "construction-project-management"],
  "Maintenance Management (CMMS)": ["cmms", "maintenance-management"],
  "Weighbridge & Ticketing": ["erp"],
  "CRM & Sales": ["customer-relationship-manager"],
  "HR & Workforce Management": ["human-resources", "payroll"],
  "Business Intelligence & Reporting": ["business-intelligence"],
};

/**
 * @param {Record<string, string | string[]>} map
 * @param {string} [activeProduct]
 * @param {string} [fallback]
 */
export function pathsForProduct(map, activeProduct, fallback) {
  const raw = (activeProduct && map[activeProduct]) || fallback || Object.values(map)[0];
  return Array.isArray(raw) ? raw : [raw];
}
