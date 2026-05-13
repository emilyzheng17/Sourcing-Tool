/** Root layout wrapper for the sourcing dashboard. */
export function DashboardShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">{children}</div>
  );
}
