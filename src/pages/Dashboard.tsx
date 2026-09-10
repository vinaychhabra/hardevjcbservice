import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Summary {
  assetStatusCounts: Record<string, number>;
  monthSales: number;
  monthExpenses: number;
  monthSalaries: number;
  overdueCount: number;
  overdueAmount: number;
  upcomingMaintenance: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    const todayStr = new Date().toISOString().slice(0, 10);
    const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const [
      { data: assets },
      { data: dailyEntries },
      { data: expenses },
      { data: salaries },
      { data: overdueInvoices },
      { count: maintenanceDue },
    ] = await Promise.all([
      supabase.from("assets").select("status").eq("is_active", true),
      supabase.from("daily_entries").select("amount").gte("entry_date", monthStart),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      supabase.from("salary_payments").select("amount").gte("pay_period_start", monthStart),
      supabase.from("invoices").select("total, amount_paid").in("status", ["sent", "partially_paid"]).lt("due_date", todayStr),
      supabase.from("maintenance_records").select("*", { count: "exact", head: true }).lte("next_due_date", twoWeeksOut).not("next_due_date", "is", null),
    ]);

    const assetStatusCounts: Record<string, number> = {};
    (assets ?? []).forEach((a: any) => { assetStatusCounts[a.status] = (assetStatusCounts[a.status] ?? 0) + 1; });

    setSummary({
      assetStatusCounts,
      monthSales: (dailyEntries ?? []).reduce((s: number, e: any) => s + e.amount, 0),
      monthExpenses: (expenses ?? []).reduce((s: number, e: any) => s + e.amount, 0),
      monthSalaries: (salaries ?? []).reduce((s: number, e: any) => s + e.amount, 0),
      overdueCount: (overdueInvoices ?? []).length,
      overdueAmount: (overdueInvoices ?? []).reduce((s: number, inv: any) => s + (inv.total - inv.amount_paid), 0),
      upcomingMaintenance: maintenanceDue ?? 0,
    });
  }

  if (!summary) return <div>Loading…</div>;

  const netThisMonth = summary.monthSales - summary.monthExpenses - summary.monthSalaries;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Dashboard</h1>

      <h2 style={{ fontSize: 15, marginBottom: 12 }}>This month</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Sales" value={`₹${summary.monthSales.toLocaleString()}`} />
        <StatCard label="Expenses" value={`₹${summary.monthExpenses.toLocaleString()}`} />
        <StatCard label="Salaries" value={`₹${summary.monthSalaries.toLocaleString()}`} />
        <StatCard label="Net" value={`₹${netThisMonth.toLocaleString()}`} accent={netThisMonth >= 0} negative={netThisMonth < 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Overdue invoices" value={summary.overdueCount} />
        <StatCard label="Overdue amount" value={`₹${summary.overdueAmount.toLocaleString()}`} />
        <StatCard label="Maintenance due (14 days)" value={summary.upcomingMaintenance} negative={summary.upcomingMaintenance > 0} />
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
          <p style={{ color: "var(--text-muted)" }}>No excavators yet — add one under Machines.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, negative }: { label: string; value: string | number; accent?: boolean; negative?: boolean }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: negative ? "var(--red)" : accent ? "var(--green)" : "var(--text)" }}>{value}</div>
    </div>
  );
}
