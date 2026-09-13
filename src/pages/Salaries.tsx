import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Operator, SalaryPayment } from "../types";
import { useAuth } from "../lib/AuthContext";

export default function Salaries() {
  const { hasPermission } = useAuth();
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalaryPayment | null>(null);

  async function load() {
    const [{ data: p }, { data: o }] = await Promise.all([
      supabase.from("salary_payments").select("*").order("pay_period_start", { ascending: false }).limit(100),
      supabase.from("operators").select("*").order("name"),
    ]);
    setPayments((p ?? []) as SalaryPayment[]);
    setOperators((o ?? []) as Operator[]);
  }

  useEffect(() => { load(); }, []);

  const monthStr = new Date().toISOString().slice(0, 7);
  const monthTotal = payments.filter((p) => p.pay_period_start.startsWith(monthStr)).reduce((s, p) => s + Number(p.net_amount ?? p.amount), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Salaries</h1>
        {hasPermission("salaries.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Record payment"}</button>
        )}
      </div>

      <div className="panel" style={{ padding: 16, marginBottom: 20, maxWidth: 240 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Paid this month</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>₹{monthTotal.toLocaleString()}</div>
      </div>

      {showForm && <SalaryForm key="new" operators={operators} onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <SalaryForm key={editing.id} operators={operators} payment={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Staff</th><th>Period</th><th>Gross</th><th>Advance</th><th>Net</th><th>Paid date</th><th>Method</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.staff_name}</td>
                <td>{p.pay_period_start} → {p.pay_period_end}</td>
                <td>₹{Number(p.gross_amount ?? p.amount).toLocaleString()}</td>
                <td>₹{Number(p.advance_adjustment ?? 0).toLocaleString()}</td>
                <td>₹{Number(p.net_amount ?? p.amount).toLocaleString()}</td>
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

function SalaryForm({ operators, payment, onSaved, onCancel }: { operators: Operator[]; payment?: SalaryPayment; onSaved: () => void; onCancel?: () => void }) {
  const [operatorId, setOperatorId] = useState(payment?.operator_id ?? "");
  const [staffName, setStaffName] = useState(payment?.staff_name ?? "");
  const [periodStart, setPeriodStart] = useState(payment?.pay_period_start ?? new Date().toISOString().slice(0, 8) + "01");
  const [periodEnd, setPeriodEnd] = useState(payment?.pay_period_end ?? new Date().toISOString().slice(0, 10));
  const [grossAmount, setGrossAmount] = useState(payment?.gross_amount?.toString() ?? payment?.amount?.toString() ?? "");
  const [advanceAdjustment, setAdvanceAdjustment] = useState(payment?.advance_adjustment?.toString() ?? "0");
  const [paidDate, setPaidDate] = useState(payment?.paid_date ?? new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(payment?.payment_method ?? "cash");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const netAmount = Math.max(0, Number(grossAmount || 0) - Number(advanceAdjustment || 0));

  function selectOperator(id: string) {
    setOperatorId(id);
    const op = operators.find((o) => o.id === id);
    if (op) setStaffName(op.name);
  }

  async function submit() {
    setSaving(true);
    setError(null);

    const values = {
      operator_id: operatorId || null,
      staff_name: staffName,
      pay_period_start: periodStart,
      pay_period_end: periodEnd,
      gross_amount: Number(grossAmount || 0),
      advance_adjustment: Number(advanceAdjustment || 0),
      net_amount: netAmount,
      amount: netAmount,
      paid_date: paidDate,
      payment_method: method,
      notes: notes || null,
    };

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
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {operators.length > 0 && (
          <div className="field-group">
            <label className="field">Employee (optional)</label>
            <select className="input" value={operatorId} onChange={(e) => selectOperator(e.target.value)}>
              <option value="">— type name manually —</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <div className="field-group">
          <label className="field">Staff name</label>
          <input className="input" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
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
      <button className="btn btn-primary" onClick={submit} disabled={saving || !grossAmount || !staffName}>{saving ? "Saving…" : payment ? "Update payment" : "Save payment"}</button>{onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
