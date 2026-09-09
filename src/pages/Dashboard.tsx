import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Summary {
  assetStatusCounts: Record<string, number>;
  activeContracts: number;
  overdueCount: number;
  overdueAmount: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: assets }, { count: activeContracts }, { data: overdueInvoices }] = await Promise.all([
      supabase.from("assets").select("status").eq("is_active", true),
      supabase.from("rental_contracts").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("invoices").select("total, amount_paid").in("status", ["sent", "partially_paid"]).lt("due_date", new Date().toISOString().slice(0, 10)),
    ]);

    const assetStatusCounts: Record<string, number> = {};
    (assets ?? []).forEach((a: any) => {
      assetStatusCounts[a.status] = (assetStatusCounts[a.status] ?? 0) + 1;
    });

    const overdueAmount = (overdueInvoices ?? []).reduce((sum: number, inv: any) => sum + (inv.total - inv.amount_paid), 0);

    setSummary({
      assetStatusCounts,
      activeContracts: activeContracts ?? 0,
      overdueCount: (overdueInvoices ?? []).length,
      overdueAmount,
    });
  }

  if (!summary) return <div>Loading…</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Active rentals" value={summary.activeContracts} />
        <StatCard label="Overdue invoices" value={summary.overdueCount} />
        <StatCard label="Overdue amount" value={`₹${summary.overdueAmount.toLocaleString()}`} accent />
      </div>

      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Fleet status</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(summary.assetStatusCounts).map(([status, count]) => (
          <div key={status} className="panel" style={{ padding: "10px 16px", minWidth: 120 }}>
            <span className={`status-chip status-${status}`}>{status.replace("_", " ")}</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{count}</div>
          </div>
        ))}
        {Object.keys(summary.assetStatusCounts).length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No assets yet — add one under Assets.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: accent ? "var(--amber-dark)" : "var(--text)" }}>{value}</div>
    </div>
  );
}
