export function AppBar({
  onOpenFilters,
  activeFilterCount,
  searchDone,
  searchResultsLength,
  savedCount,
  onOpenSettings,
  onToggleTheme,
  theme,
  onOpenCommandPalette,
}) {
  const isDark = theme === "dark";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="min-w-0 truncate text-xl font-semibold leading-tight tracking-tight text-foreground">
          Source
        </span>
        <span className="shrink-0 text-[11px] font-normal leading-snug text-muted-foreground/45">
          by Emily Zheng and Marc Lampron
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-data text-muted-foreground shadow-sm sm:inline-flex"
          title="Command palette (⌘K)"
        >
          <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
          <span className="text-data">Commands</span>
        </button>

        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-data font-medium text-foreground shadow-sm transition-colors hover:bg-muted/80"
        >
          Filters
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-data tabular-nums text-primary">
              {activeFilterCount}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </button>

        {searchDone && (
          <div className="rounded-md border border-border bg-muted px-2.5 py-1 text-data tabular-nums text-foreground">
            {searchResultsLength} found
          </div>
        )}

        <div className="rounded-md border border-border bg-muted px-2.5 py-1 text-data tabular-nums text-foreground">
          {savedCount} saved
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-md border border-border bg-card p-2 text-data text-muted-foreground shadow-sm transition-colors hover:bg-muted/80 hover:text-foreground"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? "☀" : "☾"}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-data font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Settings"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
