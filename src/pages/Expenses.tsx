import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, Expense } from "../types";
import { useAuth } from "../lib/AuthContext";
import { openFinanceAttachment, uploadFinanceAttachment } from "../lib/attachments";

const CATEGORIES = ["diesel", "repair", "spare_parts", "tyres", "transport", "insurance", "other"];

export default function Expenses() {
  const { hasPermission } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assetFilter, setAssetFilter] = useState("");

  async function load() {
    const [{ data: e }, { data: a }] = await Promise.all([
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("assets").select("*"),
    ]);
    setExpenses((e ?? []) as Expense[]);
    setAssets((a ?? []) as Asset[]);
  }

  useEffect(() => { load(); }, []);

  const assetCode = (id: string | null) => (id ? assets.find((a) => a.id === id)?.internal_code ?? "—" : "—");
  const filteredExpenses = expenses.filter((expense) =>
    (!fromDate || expense.expense_date >= fromDate) &&
    (!toDate || expense.expense_date <= toDate) &&
    (!assetFilter || expense.asset_id === assetFilter)
  );
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthTotal = filteredExpenses.filter((e) => e.expense_date.startsWith(monthStr)).reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Expenses</h1>
        {hasPermission("expenses.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Add expense"}</button>
        )}
      </div>

      <div className="panel" style={{ padding: 16, marginBottom: 20, maxWidth: 200 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>This month</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--red)" }}>₹{monthTotal.toLocaleString()}</div>
      </div>

      <div className="panel" style={{ padding: 14, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}><div><label className="field">From</label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><label className="field">To</label><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div><div><label className="field">Excavator</label><select className="input" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}><option value="">All excavators</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}</select></div></div>
      {showForm && <ExpenseForm key="new" assets={assets} onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <ExpenseForm key={editing.id} assets={assets} expense={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Category</th><th>Machine</th><th>Vendor</th><th>Amount</th><th>Method</th></tr></thead>
          <tbody>
            {filteredExpenses.map((e) => (
              <tr key={e.id}>
                <td>{e.expense_date}</td>
                <td>{e.category.replace("_", " ")}</td>
                <td className="mono">{assetCode(e.asset_id)}</td>
                <td>{e.vendor ?? "—"}</td>
                <td>₹{e.amount.toLocaleString()}</td>
                <td>{e.payment_method.replace("_", " ")} {e.receipt_url && <button className="btn" style={{ padding: "3px 7px", marginLeft: 6 }} onClick={() => openFinanceAttachment(e.receipt_url)}>Receipt</button>}<div style={{ display: "flex", gap: 6, marginTop: 6 }}><button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditing(e)}>Edit</button><button className="btn" style={{ padding: "3px 7px" }} onClick={async () => { if (window.confirm("Delete this expense?")) { await supabase.from("expenses").delete().eq("id", e.id); load(); } }}>Delete</button></div></td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No expenses logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenseForm({ assets, expense, onSaved, onCancel }: { assets: Asset[]; expense?: Expense; onSaved: () => void; onCancel?: () => void }) {
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(expense?.category ?? "diesel");
  const [assetId, setAssetId] = useState(expense?.asset_id ?? "");
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [method, setMethod] = useState(expense?.payment_method ?? "cash");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  async function submit() {
    setSaving(true);
    setError(null);
    const values = {
      expense_date: expenseDate, category, asset_id: assetId || null, vendor: vendor || null,
      amount: Number(amount), payment_method: method,
    };
    const result = expense
      ? await supabase.from("expenses").update(values).eq("id", expense.id).select("id").single()
      : await supabase.from("expenses").insert(values).select("id").single();
    let error = result.error;
    if (!error && receipt && result.data) {
      try { const path = await uploadFinanceAttachment(receipt, "expense", result.data.id); const update = await supabase.from("expenses").update({ receipt_url: path }).eq("id", result.data.id); error = update.error; } catch (uploadError) { error = uploadError as typeof error; }
    }
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccessMessage(expense ? "Expense updated successfully." : "Expense saved successfully.");
    window.setTimeout(() => onSaved(), 250);
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div className="message-banner error">{error}</div>}
      {successMessage && <div className="message-banner success">{successMessage}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Date</label>
          <input className="input" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Excavator (if applicable)</label>
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">— none —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Vendor</label>
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "upi", "bank_transfer", "card", "credit"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>
      <div className="field-group"><label className="field">Receipt or bill photo</label><input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !amount}>{saving ? "Saving…" : expense ? "Update expense" : "Save expense"}</button>{onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
