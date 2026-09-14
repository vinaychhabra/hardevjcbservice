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
  customerCount: number;
  activeContractCount: number;
  pendingSalesCount: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    const monthKey = monthStart.slice(0, 7);
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      { data: assets },
      { data: dailyEntries },
      { data: expenses },
      { data: salaries },
      { data: overdueInvoices },
      { data: employees },
      { data: customers },
      { data: contracts },
    ] = await Promise.all([
      supabase.from("assets").select("status").eq("is_active", true),
      supabase.from("daily_entries").select("amount, payment_status").gte("entry_date", monthStart),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      supabase.from("salary_payments").select("*"),
      supabase.from("invoices").select("total, amount_paid").in("status", ["sent", "partially_paid", "overdue"]).lt("due_date", todayStr),
      supabase.from("operators").select("advance_balance, is_active"),
      supabase.from("customers").select("id"),
      supabase.from("rental_contracts").select("status"),
    ]);

    const assetStatusCounts: Record<string, number> = {};
    (assets ?? []).forEach((a: any) => {
      assetStatusCounts[a.status] = (assetStatusCounts[a.status] ?? 0) + 1;
    });

    const getSalaryAmount = (row: any) => {
      const values = [row.net_amount, row.gross_amount, row.amount, row.total_amount, row.salary_amount];
      let highestAmount = 0;
      for (const value of values) {
        const numericValue = Number(value ?? 0);
        if (Number.isFinite(numericValue) && numericValue > 0) {
          highestAmount = numericValue;
        }
      }
      return highestAmount;
    };

    const salaryRows = (salaries ?? []).length ? salaries ?? [] : [];

    setSummary({
      assetStatusCounts,
      monthSales: (dailyEntries ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
      monthExpenses: (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
      monthSalaries: salaryRows.reduce((s: number, row: any) => s + getSalaryAmount(row), 0),
      overdueCount: (overdueInvoices ?? []).length,
      overdueAmount: (overdueInvoices ?? []).reduce((s: number, inv: any) => s + Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)), 0),
      employeeCount: (employees ?? []).filter((e: any) => e.is_active !== false).length,
      advanceOutstanding: (employees ?? []).reduce((s: number, e: any) => s + Number(e.advance_balance ?? 0), 0),
      customerCount: (customers ?? []).length,
      activeContractCount: (contracts ?? []).filter((c: any) => c.status === "active").length,
      pendingSalesCount: (dailyEntries ?? []).filter((e: any) => e.payment_status !== "paid").length,
    });
  }

  if (!summary) return <div className="panel" style={{ padding: 24 }}>Loading…</div>;

  const netThisMonth = summary.monthSales - summary.monthExpenses - summary.monthSalaries;
  const quickStats = [
    { label: "Active contracts", value: summary.activeContractCount, tone: "primary" },
    { label: "Customers", value: summary.customerCount, tone: "success" },
    { label: "Pending sales", value: summary.pendingSalesCount, tone: "warning" },
    { label: "Advance", value: `₹${summary.advanceOutstanding.toLocaleString()}`, tone: "danger" },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
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

      <div className="metric-grid">
        <StatCard label="Overdue" value={`₹${summary.overdueAmount.toLocaleString()}`} negative={summary.overdueAmount > 0} />
        <StatCard label="Invoices" value={summary.overdueCount} />
        <StatCard label="Employees" value={summary.employeeCount} />
        <StatCard label="Advance" value={`₹${summary.advanceOutstanding.toLocaleString()}`} negative={summary.advanceOutstanding > 0} />
      </div>

      <div className="metric-grid compact">
        {quickStats.map((item) => (
          <div key={item.label} className="mini-panel">
            <div className="mini-label">{item.label}</div>
            <div className={`mini-value ${item.tone}`}>{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</div>
          </div>
        ))}
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
