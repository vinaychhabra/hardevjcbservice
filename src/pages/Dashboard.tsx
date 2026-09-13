import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Summary {
  assetStatusCounts: Record<string, number>;
  monthSales: number;
  monthExpenses: number;
  monthSalaries: number;
  overdueCount: number;
  overdueAmount: number;
  employeeCount: number;
  advanceOutstanding: number;
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
      { data: employees },
    ] = await Promise.all([
      supabase.from("assets").select("status").eq("is_active", true),
      supabase.from("daily_entries").select("amount").gte("entry_date", monthStart),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      supabase.from("salary_payments").select("amount, net_amount, gross_amount, advance_adjustment").gte("pay_period_start", monthStart),
      supabase.from("invoices").select("total, amount_paid").in("status", ["sent", "partially_paid"]).lt("due_date", todayStr),
      supabase.from("operators").select("advance_balance, is_active"),
    ]);

    const assetStatusCounts: Record<string, number> = {};
    (assets ?? []).forEach((a: any) => { assetStatusCounts[a.status] = (assetStatusCounts[a.status] ?? 0) + 1; });

    setSummary({
      assetStatusCounts,
      monthSales: (dailyEntries ?? []).reduce((s: number, e: any) => s + e.amount, 0),
      monthExpenses: (expenses ?? []).reduce((s: number, e: any) => s + e.amount, 0),
      monthSalaries: (salaries ?? []).reduce((s: number, e: any) => s + (e.net_amount ?? e.amount), 0),
      overdueCount: (overdueInvoices ?? []).length,
      overdueAmount: (overdueInvoices ?? []).reduce((s: number, inv: any) => s + (inv.total - inv.amount_paid), 0),
      employeeCount: (employees ?? []).filter((e: any) => e.is_active !== false).length,
      advanceOutstanding: (employees ?? []).reduce((s: number, e: any) => s + Number(e.advance_balance ?? 0), 0),
    });
  }

  if (!summary) return <div>Loading…</div>;

  const netThisMonth = summary.monthSales - summary.monthExpenses - summary.monthSalaries;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(3, minmax(150px, 1fr))", gap: 12 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Net this month
            </div>
            <span className={`status-chip ${netThisMonth >= 0 ? "status-available" : "status-breakdown"}`}>
              {netThisMonth >= 0 ? "Positive" : "Watch"}
            </span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.05em" }}>₹{netThisMonth.toLocaleString()}</div>
        </div>

        <StatCard label="Sales" value={`₹${summary.monthSales.toLocaleString()}`} />
        <StatCard label="Expenses" value={`₹${summary.monthExpenses.toLocaleString()}`} />
        <StatCard label="Salaries" value={`₹${summary.monthSalaries.toLocaleString()}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Overdue" value={`₹${summary.overdueAmount.toLocaleString()}`} negative={summary.overdueAmount > 0} />
        <StatCard label="Invoices" value={summary.overdueCount} />
        <StatCard label="Employees" value={summary.employeeCount} />
        <StatCard label="Advance" value={`₹${summary.advanceOutstanding.toLocaleString()}`} negative={summary.advanceOutstanding > 0} />
      </div>

      <div className="panel" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Fleet status</h2>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {Object.keys(summary.assetStatusCounts).length} states
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          {Object.entries(summary.assetStatusCounts).map(([status, count]) => (
            <div key={status} className="panel" style={{ padding: "8px 10px" }}>
              <span className={`status-chip status-${status}`}>{status.replace("_", " ")}</span>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{count}</div>
            </div>
          ))}
          {Object.keys(summary.assetStatusCounts).length === 0 && (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No excavators yet — add one under Machines.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, negative }: { label: string; value: string | number; accent?: boolean; negative?: boolean }) {
  return (
    <div className="panel" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, letterSpacing: "-0.04em", color: negative ? "var(--danger)" : accent ? "var(--success)" : "var(--text)" }}>{value}</div>
    </div>
  );
}
