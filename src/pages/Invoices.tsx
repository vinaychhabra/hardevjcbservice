import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Customer, Invoice } from "../types";
import { useAuth } from "../lib/AuthContext";

interface LineItemDraft {
  description: string;
  quantity: number;
  rate: number;
  tax_rate_pct: number;
}

export default function Invoices() {
  const { hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  async function load() {
    const [{ data: inv }, { data: cu }] = await Promise.all([
      supabase.from("invoices").select("*").order("issue_date", { ascending: false }),
      supabase.from("customers").select("*"),
    ]);
    setInvoices((inv ?? []) as Invoice[]);
    setCustomers((cu ?? []) as Customer[]);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Invoices</h1>
        {hasPermission("invoices.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!customers.length}>
            {showForm ? "Cancel" : "New invoice"}
          </button>
        )}
      </div>

      {showForm && <InvoiceForm customers={customers} onSaved={() => { setShowForm(false); load(); }} />}
      {payingInvoice && (
        <PaymentForm invoice={payingInvoice} onSaved={() => { setPayingInvoice(null); load(); }} onCancel={() => setPayingInvoice(null)} />
      )}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th><th>Customer</th><th>Issue date</th><th>Due date</th><th>Total</th><th>Paid</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="mono">{inv.invoice_number}</td>
                <td>{customerName(inv.customer_id)}</td>
                <td>{inv.issue_date}</td>
                <td>{inv.due_date}</td>
                <td>₹{inv.total.toLocaleString()}</td>
                <td>₹{inv.amount_paid.toLocaleString()}</td>
                <td><span className={`status-chip status-${inv.status === "paid" ? "available" : inv.status === "overdue" ? "breakdown" : "on_rent"}`}>{inv.status.replace("_", " ")}</span></td>
                <td>
                  {inv.status !== "paid" && hasPermission("payments.write") && (
                    <button className="btn" style={{ padding: "4px 8px" }} onClick={() => setPayingInvoice(inv)}>Record payment</button>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={8} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceForm({ customers, onSaved }: { customers: Customer[]; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<LineItemDraft[]>([{ description: "", quantity: 1, rate: 0, tax_rate_pct: 18 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(i: number, patch: Partial<LineItemDraft>) {
    setItems((its) => its.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    // invoice_number left blank — a Postgres trigger (set_invoice_number)
    // fills it in from Settings > Numbering automatically.
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .insert({ customer_id: customerId, invoice_number: "", issue_date: issueDate, due_date: dueDate })
      .select()
      .single();
    if (invError || !invoice) {
      setSaving(false);
      setError(invError?.message ?? "Could not create invoice");
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_line_items").insert(
      items.filter((it) => it.description).map((it) => ({
        invoice_id: invoice.id,
        description: it.description,
        quantity: it.quantity,
        rate: it.rate,
        amount: it.quantity * it.rate,
        tax_rate_pct: it.tax_rate_pct,
      }))
    );
    setSaving(false);
    if (itemsError) setError(itemsError.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
        <div className="field-group">
          <label className="field">Customer</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Issue date</label>
          <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Due date</label>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <label className="field">Line items</label>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 80px", gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
          <input className="input" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Rate" value={it.rate} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Tax %" value={it.tax_rate_pct} onChange={(e) => updateItem(i, { tax_rate_pct: Number(e.target.value) })} />
        </div>
      ))}
      <button className="btn" onClick={() => setItems((its) => [...its, { description: "", quantity: 1, rate: 0, tax_rate_pct: 18 }])} style={{ marginBottom: 16 }}>
        + Add line
      </button>

      <div>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !customerId}>
          {saving ? "Saving…" : "Create invoice"}
        </button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, onSaved, onCancel }: { invoice: Invoice; onSaved: () => void; onCancel: () => void }) {
  const balance = invoice.total - invoice.amount_paid;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("bank_transfer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("payments").insert({
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      amount: Number(amount),
      payment_date: new Date().toISOString().slice(0, 10),
      method,
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Record payment — {invoice.invoice_number}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Balance due: ₹{balance.toLocaleString()}</div>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <div className="field-group">
          <label className="field">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "cheque", "upi", "bank_transfer", "card"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !amount}>{saving ? "Saving…" : "Record payment"}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
