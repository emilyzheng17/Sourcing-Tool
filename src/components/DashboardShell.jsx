/** Root layout wrapper for the sourcing dashboard. */
export function DashboardShell({ children }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">{children}</div>
  );
}
