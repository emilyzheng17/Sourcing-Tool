import {
  DEFAULT_ALLOWED_COUNTRY_CODES,
  GEO_OPTIONAL_TECH_HUB_ROWS,
  GEO_REGION_ROWS,
  mergeGeoAllowlist,
} from "../../shared/geoCountry.js";

/**
 * Shared Vertical / Product / Company filter UI for Discover vs Universe drawers.
 * All state is controlled by the parent.
 */
export function DiscoverFilterPanel({
  sidebarSection,
  setSidebarSection,
  geoHelpText,
  verticals,
  selectedVerticals,
  setSelectedVerticals,
  onToggleVertical,
  softwareProducts,
  softwareProductKeys,
  selectedProducts,
  setSelectedProducts,
  companyTypes,
  ownershipTypes,
  revenueRanges,
  employeeRanges,
  foundedRanges,
  companyTypeFilter,
  setCompanyTypeFilter,
  ownershipFilter,
  setOwnershipFilter,
  revenueFilter,
  setRevenueFilter,
  sizeFilter,
  setSizeFilter,
  foundedFilter,
  setFoundedFilter,
  allowedCountryCodes,
  setAllowedCountryCodes,
  thesisRequireMissionCritical,
  setThesisRequireMissionCritical,
  thesisRequireVertIntegrated,
  setThesisRequireVertIntegrated,
  thesisRequireProprietary,
  setThesisRequireProprietary,
  thesisRequireFounderVintage,
  setThesisRequireFounderVintage,
  minOwnershipConfidence,
  setMinOwnershipConfidence,
  activeFilterCount,
  onClearAll,
  onApplyIdealProfile,
  onResetIdealProfile,
}) {
  // #region Render
  return (
    <>
      <div className="mb-4 flex gap-0 border-b border-border">
        {[
          ["vertical", "Vertical"],
          ["product", "Product"],
          ["company", "Company"],
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedVerticals([...verticals])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedVerticals([])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Clear
            </button>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Industry verticals</p>
          <div className="flex flex-col gap-2">
            {verticals.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onToggleVertical(v)}
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
        </div>
      )}

      {sidebarSection === "product" && (
        <div className="space-y-3 animate-in-fade">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedProducts([...softwareProductKeys])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedProducts([])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Clear
            </button>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Software type</p>
          <div className="flex flex-col border-t border-border">
            {Object.entries(softwareProducts).map(([name, data]) => {
              const on = selectedProducts.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={data.description}
                  onClick={() => {
                    setSelectedProducts((prev) => {
                      if (prev.includes(name)) {
                        return prev.filter((x) => x !== name);
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
              onClick={onApplyIdealProfile}
              className="w-full rounded-md bg-primary px-3 py-2 text-ui font-semibold text-primary-foreground"
            >
              Apply ideal profile
            </button>
            <button
              type="button"
              onClick={onResetIdealProfile}
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
            {companyTypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ownership</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
            value={ownershipFilter}
            onChange={(e) => setOwnershipFilter(e.target.value)}
          >
            {ownershipTypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
            value={revenueFilter}
            onChange={(e) => setRevenueFilter(e.target.value)}
          >
            {revenueRanges.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employees</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
          >
            {employeeRanges.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Year founded</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-data text-foreground outline-none focus:ring-2 focus:ring-primary/25"
            value={foundedFilter}
            onChange={(e) => setFoundedFilter(e.target.value)}
          >
            {foundedRanges.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Headquarters region</p>
          <p className="text-data leading-relaxed text-muted-foreground">{geoHelpText}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllowedCountryCodes([...DEFAULT_ALLOWED_COUNTRY_CODES])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Select default regions
            </button>
            <button
              type="button"
              onClick={() => setAllowedCountryCodes([])}
              className="rounded-md border border-border px-3 py-1.5 text-data hover:bg-muted"
            >
              Clear regions
            </button>
          </div>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
            {GEO_REGION_ROWS.map((row) => {
              const allOn = row.codes.every((code) => allowedCountryCodes.includes(code));
              return (
                <label key={row.label} className="flex cursor-pointer items-start gap-2 text-data">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={allOn}
                    onChange={() =>
                      setAllowedCountryCodes((prev) => mergeGeoAllowlist(new Set(prev), row.codes, allOn))
                    }
                  />
                  <span>
                    <span className="text-foreground">{row.label}</span>
                    {row.hint ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{row.hint}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Optional tech hubs</p>
          <p className="text-data text-muted-foreground">
            Not included in “Select default regions” — turn on when you want these jurisdictions in the allowlist.
          </p>
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-lg border border-border border-dashed p-3">
            {GEO_OPTIONAL_TECH_HUB_ROWS.map((row) => {
              const allOn = row.codes.every((code) => allowedCountryCodes.includes(code));
              return (
                <label key={row.label} className="flex cursor-pointer items-start gap-2 text-data">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={allOn}
                    onChange={() =>
                      setAllowedCountryCodes((prev) => mergeGeoAllowlist(new Set(prev), row.codes, allOn))
                    }
                  />
                  <span>
                    <span className="text-foreground">{row.label}</span>
                    {row.hint ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{row.hint}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PE thesis filters</p>
          <label className="flex items-center gap-2 text-data text-muted-foreground">
            <input
              type="checkbox"
              checked={thesisRequireMissionCritical}
              onChange={(e) => setThesisRequireMissionCritical(e.target.checked)}
            />
            Mission-critical
          </label>
          <label className="flex items-center gap-2 text-data text-muted-foreground">
            <input
              type="checkbox"
              checked={thesisRequireVertIntegrated}
              onChange={(e) => setThesisRequireVertIntegrated(e.target.checked)}
            />
            Vertically integrated
          </label>
          <label className="flex items-center gap-2 text-data text-muted-foreground">
            <input type="checkbox" checked={thesisRequireProprietary} onChange={(e) => setThesisRequireProprietary(e.target.checked)} />
            Proprietary stack
          </label>
          <label className="flex items-center gap-2 text-data text-muted-foreground">
            <input
              type="checkbox"
              checked={thesisRequireFounderVintage}
              onChange={(e) => setThesisRequireFounderVintage(e.target.checked)}
            />
            Founder-owned or operated
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
              onClick={onClearAll}
              className="mt-3 w-full rounded-md border border-destructive/40 py-2 text-data font-medium text-destructive hover:bg-destructive/10"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </>
  );
  // #endregion
}
