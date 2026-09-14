import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  pendingSalary: number;
  pendingSalaryCount: number;
  pendingSalaryNames: string[];
  nextSalaryDate: string | null;
  customerCount: number;
  activeContractCount: number;
  pendingSalesCount: number;
  pendingReceivablesAmount: number;
  discrepancyCount: number;
  serviceAlerts: Array<{ id: string; internal_code: string; dueKm: number }>;
  documentAlerts: Array<{ id: string; internal_code: string }>;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const navigate = useNavigate();

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
      supabase.from("assets").select("id, internal_code, status, current_meter_reading, last_service_hours, next_service_due_hours").eq("is_active", true),
      supabase.from("daily_entries").select("asset_id, hours_worked, amount, payment_status, diesel_included, diesel_cost, entry_date").order("entry_date", { ascending: false }),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      supabase.from("salary_payments").select("*"),
      supabase.from("invoices").select("total, amount_paid").in("status", ["sent", "partially_paid", "overdue"]).lt("due_date", todayStr),
      supabase.from("operators").select("advance_balance, is_active, salary_amount, salary_frequency, name"),
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

    const getEntryDueAmount = (entry: any) => {
      const baseAmount = Number(entry.amount ?? 0);
      const dieselExtra = entry.diesel_included === false ? Number(entry.diesel_cost ?? 0) : 0;
      return baseAmount + dieselExtra;
    };

    const normalizeName = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
    const salaryRows = (salaries ?? []).length ? salaries ?? [] : [];
    const activeEmployees = (employees ?? []).filter((employee: any) => employee.is_active !== false && Number(employee.salary_amount ?? 0) > 0);

    const dueByEmployee = activeEmployees.map((employee: any) => {
      const paidThisCycle = salaryRows
        .filter((row: any) => {
          const sameOperator = row.operator_id === employee.id;
          const sameStaffName = normalizeName(row.staff_name) === normalizeName(employee.name);
          if (!sameOperator && !sameStaffName) return false;

          const sourceDate = row.paid_date ?? row.pay_period_end ?? row.pay_period_start;
          return sourceDate && sourceDate.startsWith(monthKey);
        })
        .reduce((sum: number, row: any) => sum + getSalaryAmount(row), 0);

      return {
        name: employee.name,
        due: Math.max(Number(employee.salary_amount ?? 0) - paidThisCycle, 0),
      };
    });

    const pendingDueEmployees = dueByEmployee.filter((item) => item.due > 0);
    const pendingSalary = pendingDueEmployees.reduce((sum, item) => sum + item.due, 0);
    const nextSalaryDate = pendingDueEmployees.length ? new Date().toISOString().slice(0, 10) : null;

    const monthEntries = (dailyEntries ?? []).filter((entry: any) => entry.entry_date >= monthStart);

    const pendingReceivablesAmount = monthEntries
      .filter((entry: any) => entry.payment_status !== "paid")
      .reduce((sum: number, entry: any) => sum + getEntryDueAmount(entry), 0);

    const discrepancyCount = (dailyEntries ?? []).filter((entry: any) => entry.discrepancy_flag).length;

    const usageHoursByAsset = (dailyEntries ?? []).reduce((acc: Record<string, number>, entry: any) => {
      const hours = Number(entry.hours_worked ?? 0);
      if (!hours) return acc;
      acc[entry.asset_id] = (acc[entry.asset_id] ?? 0) + hours;
      return acc;
    }, {});

    const machineServiceAlerts = (assets ?? [])
      .filter((asset: any) => {
        const currentHours = usageHoursByAsset[asset.id] ?? Number(asset.current_meter_reading ?? 0);
        const lastHours = Number(asset.last_service_hours ?? 0);
        const interval = Number(asset.next_service_due_hours ?? 500);
        return currentHours - lastHours >= interval;
      })
      .map((asset: any) => ({
        id: asset.id,
        internal_code: asset.internal_code,
        dueKm: Math.max(0, (usageHoursByAsset[asset.id] ?? Number(asset.current_meter_reading ?? 0)) - Number(asset.last_service_hours ?? 0)),
      }));

    const documentExpiryAlerts = (assets ?? [])
      .filter((asset: any) => {
        const expiryFields = [
          { value: asset.insurance_expiry_date, label: "Insurance" },
          { value: asset.registration_certificate_expiry_date, label: "Registration" },
        ];

        return expiryFields.some(({ value }) => {
          if (!value) return false;
          const expiryDate = new Date(`${value}T00:00:00`);
          if (Number.isNaN(expiryDate.getTime())) return false;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return expiryDate <= today || expiryDate.getTime() - today.getTime() <= 30 * 24 * 60 * 60 * 1000;
        });
      })
      .map((asset: any) => ({
        id: asset.id,
        internal_code: asset.internal_code,
      }));

    setSummary({
      assetStatusCounts,
      monthSales: monthEntries.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
      monthExpenses: (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
      monthSalaries: salaryRows.reduce((s: number, row: any) => s + getSalaryAmount(row), 0),
      overdueCount: (overdueInvoices ?? []).length,
      overdueAmount: (overdueInvoices ?? []).reduce((s: number, inv: any) => s + Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)), 0),
      employeeCount: (employees ?? []).filter((e: any) => e.is_active !== false).length,
      advanceOutstanding: (employees ?? []).reduce((s: number, e: any) => s + Number(e.advance_balance ?? 0), 0),
      pendingSalary,
      pendingSalaryCount: pendingDueEmployees.length,
      pendingSalaryNames: pendingDueEmployees.slice(0, 2).map((item) => item.name),
      nextSalaryDate,
      customerCount: (customers ?? []).length,
      activeContractCount: (contracts ?? []).filter((c: any) => c.status === "active").length,
      pendingSalesCount: (dailyEntries ?? []).filter((e: any) => e.payment_status !== "paid").length,
      pendingReceivablesAmount,
      discrepancyCount,
      serviceAlerts: machineServiceAlerts,
      documentAlerts: documentExpiryAlerts,
    });
  }

  if (!summary) return <div className="panel" style={{ padding: 24 }}>Loading…</div>;

  const netThisMonth = summary.monthSales - summary.monthExpenses - summary.monthSalaries;
  const financeMix = [
    { label: "Sales", value: summary.monthSales, color: "var(--primary)" },
    { label: "Expenses", value: summary.monthExpenses, color: "var(--warning)" },
    { label: "Salaries", value: summary.monthSalaries, color: "var(--success)" },
  ].filter((item) => item.value > 0);

  const pieChartTotal = financeMix.reduce((sum, item) => sum + item.value, 0) || 1;
  let pieChartStart = 0;
  const pieChartBackground = `conic-gradient(${financeMix.map((item) => {
    const pieChartEnd = pieChartStart + (item.value / pieChartTotal) * 100;
    const segment = `${item.color} ${pieChartStart}% ${pieChartEnd}%`;
    pieChartStart = pieChartEnd;
    return segment;
  }).join(", ")})`;

  const quickStats = [
    { label: "Running contracts", value: summary.activeContractCount, tone: "primary" },
    { label: "Customers", value: summary.customerCount, tone: "success" },
    { label: "Receivables due", value: `₹${summary.pendingReceivablesAmount.toLocaleString()}`, tone: "warning" },
    { label: "Payroll due", value: `₹${summary.pendingSalary.toLocaleString()}`, tone: "danger" },
  ];
  const pendingLabel = summary.pendingSalaryCount <= 2
    ? summary.pendingSalaryNames.length ? summary.pendingSalaryNames.join(", ") : "employees"
    : `${summary.pendingSalaryCount} employees`;

  const notifications = [
    summary.pendingSalary > 0
      ? {
          title: "Payroll due",
          message: `${summary.pendingSalaryCount <= 2 ? pendingLabel : `${summary.pendingSalaryCount} employees`} need salary of ₹${summary.pendingSalary.toLocaleString()}.`,
          route: "/salaries?focus=salary",
          tone: "warning",
        }
      : null,
    summary.pendingReceivablesAmount > 0
      ? {
          title: "Receivables due",
          message: `₹${summary.pendingReceivablesAmount.toLocaleString()} is still pending across sales entries.`,
          route: "/receivables",
          tone: "warning",
        }
      : null,
    summary.discrepancyCount > 0
      ? {
          title: "Discrepancy review",
          message: `${summary.discrepancyCount} daily machine log(s) need operator review.`,
          route: "/discrepancy-review",
          tone: "danger",
        }
      : null,
    summary.overdueCount > 0
      ? {
          title: "Bills due",
          message: `${summary.overdueCount} bill(s) are overdue for follow-up.`,
          route: "/invoices",
          tone: "warning",
        }
      : null,
    summary.serviceAlerts.length > 0
      ? {
          title: "Service reminder",
          message: `${summary.serviceAlerts.length} machine(s) crossed the 500-hour service window.`,
          route: "/assets",
          tone: "warning",
        }
      : null,
    summary.documentAlerts.length > 0
      ? {
          title: "Document expiry",
          message: `${summary.documentAlerts.length} machine(s) need insurance or RC review.`,
          route: "/assets",
          tone: "warning",
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; message: string; route: string; tone: string }>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="panel notifications-panel">
        <div className="notifications-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
            <span className="notification-bell" aria-hidden="true">🔔</span>
            Notifications
          </div>
          <span className="notification-count">{notifications.length}</span>
        </div>

        {notifications.length > 0 ? (
          <div className="notification-list">
            {notifications.map((item) => (
              <button
                key={item.title}
                type="button"
                className="notification-item warning"
                onClick={() => navigate(item.route)}
              >
                <div className="notification-item-label">{item.title}</div>
                <div className="notification-item-message">{item.message}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="notification-empty">No new notifications right now.</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(3, minmax(150px, 1fr))", gap: 12 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Cash flow
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
        <StatCard label="Outstanding" value={`₹${summary.overdueAmount.toLocaleString()}`} negative={summary.overdueAmount > 0} />
        <StatCard label="Bills due" value={summary.overdueCount} />
        <StatCard label="Staff" value={summary.employeeCount} />
        <StatCard label="Advances" value={`₹${summary.advanceOutstanding.toLocaleString()}`} negative={summary.advanceOutstanding > 0} />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Business mix</h2>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Monthly view
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, alignItems: "center" }}>
          <div className="pie-chart" style={{ background: pieChartBackground }} aria-label="Monthly business mix chart" />
          <div style={{ display: "grid", gap: 8 }}>
            {financeMix.map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, display: "inline-block" }} />
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                </div>
                <strong>₹{item.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>
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
