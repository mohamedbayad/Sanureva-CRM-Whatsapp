export function Loading({ label = "Loading CRM…" }: { label?: string }) {
  return <div className="loading"><div className="loader"/><span>{label}</span></div>;
}
