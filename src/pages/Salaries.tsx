import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Operator, SalaryPayment } from "../types";
import { useAuth } from "../lib/AuthContext";
import { getSetting } from "../lib/settingsApi";

interface SalaryPolicy {
  roles: string[];
  default_salary_frequency: string;
  default_salary_amount: number;
  default_salary_day: number;
  salary_grace_days: number;
  reminder_enabled: boolean;
}

const DEFAULT_POLICY: SalaryPolicy = {
  roles: ["Driver", "Operator", "Helper", "Supervisor", "Mechanic", "Accountant"],
  default_salary_frequency: "monthly",
  default_salary_amount: 0,
  default_salary_day: 7,
  salary_grace_days: 2,
  reminder_enabled: true,
};

function formatCurrency(value: number) {
  return `₹${value.toLocaleString()}`;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getNextPayday(date: Date, cycle: string, salaryDay: number) {
  const safeDay = Math.min(Math.max(Number(salaryDay) || 7, 1), 31);
  const next = new Date(date);

  if (cycle === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (cycle === "weekly") {
    next.setDate(next.getDate() + ((7 - next.getDay() + 1) % 7 || 7));
    return next;
  }

  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  const monthDay = Math.min(safeDay, lastDay);
  const monthDate = new Date(next.getFullYear(), next.getMonth(), monthDay);

  if (monthDate < next) {
    monthDate.setMonth(monthDate.getMonth() + 1);
  }

  return monthDate;
}

export default function Salaries() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [policy, setPolicy] = useState<SalaryPolicy>(DEFAULT_POLICY);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalaryPayment | null>(null);
  const [quickPay, setQuickPay] = useState<{ employeeId?: string; name?: string; amount?: number } | null>(null);

  async function load() {
    const [salaryResult, operatorsResult, settingsResult] = await Promise.all([
      supabase.from("salary_payments").select("*").order("paid_date", { ascending: false }).limit(100),
      supabase.from("operators").select("*").order("name"),
      getSetting<SalaryPolicy>("employee_roles", "config", DEFAULT_POLICY),
    ]);

    setPayments((salaryResult.data ?? []) as SalaryPayment[]);
    setOperators((operatorsResult.data ?? []) as Operator[]);
    setPolicy({ ...DEFAULT_POLICY, ...settingsResult });
  }

  useEffect(() => { load(); }, []);

  const currentMonthKey = monthKey(new Date());
  const activeEmployees = useMemo(
    () => operators.filter((employee) => employee.is_active !== false && Number(employee.salary_amount ?? 0) > 0),
    [operators],
  );

  const monthPaid = payments
    .filter((payment) => {
      const paidDate = payment.paid_date ?? payment.pay_period_end ?? payment.pay_period_start;
      return paidDate && paidDate.startsWith(currentMonthKey);
    })
    .reduce((sum, payment) => sum + Number(payment.net_amount ?? payment.gross_amount ?? payment.amount ?? 0), 0);

  const pendingRows = useMemo(() => {
    return activeEmployees
      .map((employee) => {
        const salaryAmount = Number(employee.salary_amount ?? 0);
        const cycle = employee.salary_frequency ?? policy.default_salary_frequency ?? "monthly";
        const paidThisCycle = payments
          .filter((payment) => payment.operator_id === employee.id)
          .filter((payment) => {
            const sourceDate = payment.paid_date ?? payment.pay_period_end ?? payment.pay_period_start;
            return sourceDate && sourceDate.startsWith(currentMonthKey);
          })
          .reduce((sum, payment) => sum + Number(payment.net_amount ?? payment.gross_amount ?? payment.amount ?? 0), 0);

        const due = Math.max(salaryAmount - paidThisCycle, 0);
        const status = paidThisCycle > 0 && paidThisCycle < salaryAmount ? "partial" : "pending";

        return {
          employee,
          cycle,
          nextPayday: getNextPayday(new Date(), cycle, policy.default_salary_day),
          due,
          status,
          paidThisCycle,
        };
      })
      .filter((row) => row.due > 0)
      .sort((a, b) => a.nextPayday.getTime() - b.nextPayday.getTime());
  }, [activeEmployees, currentMonthKey, payments, policy.default_salary_day, policy.default_salary_frequency]);

  const pendingCount = pendingRows.filter((row) => row.status === "pending").length;
  const partialCount = pendingRows.filter((row) => row.status === "partial").length;

  useEffect(() => {
    if (searchParams.get("focus") !== "salary") return;

    const firstPending = pendingRows[0];
    const employeeId = searchParams.get("employeeId") ?? firstPending?.employee.id ?? "";
    const employeeName = searchParams.get("employeeName") ?? firstPending?.employee.name ?? "";
    const amount = Number(searchParams.get("amount") ?? firstPending?.due ?? 0);

    if (employeeId || employeeName || amount > 0) {
      setShowForm(true);
      setQuickPay({
        employeeId: employeeId || firstPending?.employee.id,
        name: employeeName || firstPending?.employee.name,
        amount: amount || firstPending?.due || 0,
      });
    }
  }, [pendingRows, searchParams]);

  const totalPayrollCommitment = activeEmployees.reduce((sum, employee) => sum + Number(employee.salary_amount ?? 0), 0);
  const pendingTotal = pendingRows.reduce((sum, row) => sum + row.due, 0);
  const nextPayday = pendingRows[0]?.nextPayday ?? getNextPayday(new Date(), policy.default_salary_frequency, policy.default_salary_day);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Salaries</h1>
        {hasPermission("salaries.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Record payment"}</button>
        )}
      </div>

      <div className="summary-grid">
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Payroll commitment</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{formatCurrency(totalPayrollCommitment)}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Paid this month</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{formatCurrency(monthPaid)}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Pending salaries</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{formatCurrency(pendingTotal)}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Next payday</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{nextPayday.toLocaleDateString()}</div>
        </div>
      </div>

      {pendingRows.length > 0 && (
        <div className="panel alert-banner">
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--warning)" }}>Salary alert</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
            {pendingRows.length} employee{pendingRows.length > 1 ? "s" : ""} still need {formatCurrency(pendingTotal)} payment.
          </div>
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
            {pendingCount > 0 ? `${pendingCount} pending, ` : ""}{partialCount > 0 ? `${partialCount} partial` : ""} • next payout planned for {nextPayday.toLocaleDateString()}.
          </div>
        </div>
      )}

      {showForm && (
        <SalaryForm
          key={quickPay ? `quick-${quickPay.employeeId ?? "manual"}-${quickPay.amount ?? "0"}` : "new"}
          operators={operators}
          prefill={quickPay ?? undefined}
          onSaved={() => { setShowForm(false); setQuickPay(null); load(); }}
          onCancel={() => { setShowForm(false); setQuickPay(null); }}
        />
      )}
      {editing && <SalaryForm key={editing.id} operators={operators} payment={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      {pendingRows.length > 0 && (
        <div className="panel" style={{ padding: 14, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Pending salary list</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Cycle</th>
                <th>Salary</th>
                <th>Due date</th>
                <th>Due amount</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map(({ employee, cycle, nextPayday: payday, due, status }) => (
                <tr
                  key={employee.id}
                  onClick={() => {
                    setQuickPay({ employeeId: employee.id, name: employee.name, amount: due });
                    setShowForm(true);
                  }}
                  style={{ cursor: "pointer" }}
                  title="Click to record this pending salary"
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{employee.name}</span>
                      <span
                        className="status-chip"
                        style={{
                          background: status === "partial" ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)",
                          color: status === "partial" ? "var(--warning)" : "var(--danger)",
                          border: "none",
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 999,
                          textTransform: "uppercase",
                        }}
                      >
                        {status}
                      </span>
                    </div>
                  </td>
                  <td>{cycle}</td>
                  <td>{formatCurrency(Number(employee.salary_amount ?? 0))}</td>
                  <td>{payday.toLocaleDateString()}</td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Staff</th><th>Period</th><th>Gross</th><th>Advance</th><th>Net</th><th>Paid date</th><th>Method</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.staff_name}</td>
                <td>{p.pay_period_start} → {p.pay_period_end}</td>
                <td>{formatCurrency(Number(p.gross_amount ?? p.amount))}</td>
                <td>{formatCurrency(Number(p.advance_adjustment ?? 0))}</td>
                <td>{formatCurrency(Number(p.net_amount ?? p.amount))}</td>
                <td>{p.paid_date ?? "—"}</td>
                <td>{p.payment_method.replace("_", " ")}<div style={{ display: "flex", gap: 6, marginTop: 6 }}><button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditing(p)}>Edit</button><button className="btn" style={{ padding: "3px 7px" }} onClick={async () => { if (window.confirm("Delete this salary payment?")) { await supabase.from("salary_payments").delete().eq("id", p.id); load(); } }}>Delete</button></div></td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No salary payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryForm({ operators, payment, prefill, onSaved, onCancel }: { operators: Operator[]; payment?: SalaryPayment; prefill?: { employeeId?: string; name?: string; amount?: number }; onSaved: () => void; onCancel?: () => void }) {
  const [operatorId, setOperatorId] = useState(payment?.operator_id ?? prefill?.employeeId ?? "");
  const [staffName, setStaffName] = useState(payment?.staff_name ?? prefill?.name ?? "");
  const [manualEntry, setManualEntry] = useState(!payment?.operator_id && !prefill?.employeeId);
  const [periodStart, setPeriodStart] = useState(payment?.pay_period_start ?? new Date().toISOString().slice(0, 8) + "01");
  const [periodEnd, setPeriodEnd] = useState(payment?.pay_period_end ?? new Date().toISOString().slice(0, 10));
  const [grossAmount, setGrossAmount] = useState(payment?.gross_amount?.toString() ?? payment?.amount?.toString() ?? "");
  const [advanceAdjustment, setAdvanceAdjustment] = useState(payment?.advance_adjustment?.toString() ?? "0");
  const [paidDate, setPaidDate] = useState(payment?.paid_date ?? new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(payment?.payment_method ?? "cash");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;

    if (prefill.employeeId) {
      setOperatorId(prefill.employeeId);
      setManualEntry(false);
      setStaffName(prefill.name ?? staffName);
    } else {
      setOperatorId("");
      setManualEntry(true);
      if (prefill.name) setStaffName(prefill.name);
    }

    if (typeof prefill.amount === "number" && prefill.amount > 0) {
      setGrossAmount(String(prefill.amount));
    }
  }, [prefill]);

  const netAmount = Math.max(0, Number(grossAmount || 0) - Number(advanceAdjustment || 0));

  function selectOperator(id: string) {
    if (!id) {
      setOperatorId("");
      setManualEntry(true);
      return;
    }

    const op = operators.find((o) => o.id === id);
    setOperatorId(id);
    setManualEntry(false);
    if (op) setStaffName(op.name);
  }

  function toggleManualEntry() {
    setManualEntry(true);
    setOperatorId("");
  }

  async function submit() {
    setSaving(true);
    setError(null);

    const finalStaffName = staffName.trim();
    const baseValues = {
      operator_id: operatorId || null,
      staff_name: finalStaffName,
      pay_period_start: periodStart,
      pay_period_end: periodEnd,
      amount: Number(netAmount || 0),
      paid_date: paidDate,
      payment_method: method,
      notes: notes || null,
    };

    const { error: schemaError } = await supabase.from("salary_payments").select("gross_amount, advance_adjustment, net_amount").limit(1);
    const values = { ...baseValues } as Record<string, any>;

    if (!schemaError) {
      values.gross_amount = Number(grossAmount || 0);
      values.advance_adjustment = Number(advanceAdjustment || 0);
      values.net_amount = netAmount;
    }

    const { error: saveError } = payment
      ? await supabase.from("salary_payments").update(values).eq("id", payment.id)
      : await supabase.from("salary_payments").insert(values);

    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }

    if (operatorId) {
      const { data: employee } = await supabase.from("operators").select("advance_balance").eq("id", operatorId).single();
      const currentAdvance = Number(employee?.advance_balance ?? 0);
      const nextAdvance = Math.max(0, currentAdvance - Number(advanceAdjustment || 0));
      await supabase.from("operators").update({ advance_balance: nextAdvance }).eq("id", operatorId);
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {operators.length > 0 && (
          <div className="field-group">
            <label className="field">Employee (optional)</label>
            <select className="input" value={operatorId} onChange={(e) => selectOperator(e.target.value)}>
              <option value="">— manual entry —</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {operatorId && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn" style={{ padding: "6px 10px" }} onClick={toggleManualEntry}>Use manual name</button>
              </div>
            )}
          </div>
        )}
        <div className="field-group">
          <label className="field">Staff name</label>
          <input className="input" value={staffName} onChange={(e) => setStaffName(e.target.value)} disabled={!!operatorId && !manualEntry} />
        </div>
        <div className="field-group">
          <label className="field">Gross salary</label>
          <input className="input" type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Advance adjustment</label>
          <input className="input" type="number" value={advanceAdjustment} onChange={(e) => setAdvanceAdjustment(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Net payable</label>
          <input className="input" value={`₹${netAmount.toLocaleString()}`} readOnly />
        </div>
        <div className="field-group">
          <label className="field">Period start</label>
          <input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Period end</label>
          <input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Paid date</label>
          <input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "upi", "bank_transfer"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ gridColumn: "1 / -1" }}>
          <label className="field">Notes</label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !grossAmount || !staffName.trim()}>{saving ? "Saving…" : payment ? "Update payment" : "Save payment"}</button>{onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
