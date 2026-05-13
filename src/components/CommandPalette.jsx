import { useEffect, useMemo, useState } from "react";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {void} props.onClose
 * @param {{ id: string, label: string, group?: string, keywords?: string, action: () => void }[]} props.items
 */
export function CommandPalette({ open, onClose, items }) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.keywords || ""} ${it.group || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      }
      if (e.key === "Enter" && filtered[highlight]) {
        e.preventDefault();
        filtered[highlight].action();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, filtered, highlight]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20 dark:bg-background/70"
        onClick={onClose}
        aria-label="Close command palette"
      />
      <div
        className="animate-in-fade relative z-10 flex max-h-[min(70vh,520px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          className="w-full shrink-0 border-b border-border bg-card px-4 py-3 text-ui text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:ring-0"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-data text-muted-foreground">No matches</li>
          )}
          {filtered.map((it, i) => (
            <li key={it.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-data ${
                  i === highlight
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
                onClick={() => {
                  it.action();
                  onClose();
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span>{it.label}</span>
                {it.group ? (
                  <span className="shrink-0 text-data text-muted-foreground">{it.group}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
