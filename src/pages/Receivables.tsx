import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface InvoiceRow { id: string; invoice_number: string; customer_id: string; due_date: string; total: number; amount_paid: number }
interface Customer { id: string; name: string }
interface JobRow { id: string; customer_name_freeform: string | null; site_name: string | null; due_date: string; amount: number; amount_paid: number; entry_date: string }
interface PaymentFormState { kind: "invoice" | "job"; id: string; customer: string; customerId?: string; balance: number }

const money = (value: number) => `₹${value.toLocaleString()}`;
const daysLate = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000));

export default function Receivables() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payment, setPayment] = useState<PaymentFormState | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: invoiceRows }, { data: jobRows }, { data: customerRows }] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, customer_id, due_date, total, amount_paid").neq("status", "paid").order("due_date"),
      supabase.from("daily_entries").select("id, customer_name_freeform, site_name, due_date, amount, amount_paid, entry_date").neq("payment_status", "paid").order("due_date"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setInvoices((invoiceRows ?? []) as InvoiceRow[]);
    setJobs((jobRows ?? []) as JobRow[]);
    setCustomers((customerRows ?? []) as Customer[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? "Unknown customer";
  const invoiceBalance = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.amount_paid), 0);
  const jobBalance = jobs.reduce((sum, job) => sum + Math.max(0, job.amount - job.amount_paid), 0);
  const total = invoiceBalance + jobBalance;
  const customerBalances = new Map<string, { name: string; balance: number; days: number }>();
  invoices.forEach((invoice) => { const name = customerName(invoice.customer_id); const current = customerBalances.get(name) ?? { name, balance: 0, days: 0 }; current.balance += Math.max(0, invoice.total - invoice.amount_paid); current.days = Math.max(current.days, daysLate(invoice.due_date)); customerBalances.set(name, current); });
  jobs.forEach((job) => { const name = job.customer_name_freeform || "Walk-in / unnamed"; const current = customerBalances.get(name) ?? { name, balance: 0, days: 0 }; current.balance += Math.max(0, job.amount - job.amount_paid); current.days = Math.max(current.days, daysLate(job.due_date)); customerBalances.set(name, current); });

  return <div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Receivables</h1><p style={{ color: "var(--text-muted)", margin: 0 }}>Outstanding invoices and Daily Sales jobs, including partial payments.</p></div><div className="panel" style={{ padding: "10px 16px" }}><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total outstanding</div><strong style={{ fontSize: 22 }}>{money(total)}</strong></div></div>
    <div className="panel" style={{ marginBottom: 20 }}><table className="data-table"><thead><tr><th>Customer</th><th>Outstanding</th><th>Oldest overdue</th></tr></thead><tbody>{Array.from(customerBalances.values()).sort((a, b) => b.balance - a.balance).map((customer) => <tr key={customer.name}><td>{customer.name}</td><td><strong>{money(customer.balance)}</strong></td><td>{customer.days} days</td></tr>)}</tbody></table></div>
    <div className="panel"><table className="data-table"><thead><tr><th>Customer</th><th>Source</th><th>Due date</th><th>Days overdue</th><th>Original</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
      {invoices.map((invoice) => { const balance = Math.max(0, invoice.total - invoice.amount_paid); return <tr key={`invoice-${invoice.id}`}><td>{customerName(invoice.customer_id)}</td><td className="mono">Invoice {invoice.invoice_number}</td><td>{invoice.due_date}</td><td>{daysLate(invoice.due_date)}</td><td>{money(invoice.total)}</td><td>{money(invoice.amount_paid)}</td><td><strong>{money(balance)}</strong></td><td><button className="btn" onClick={() => setPayment({ kind: "invoice", id: invoice.id, customer: customerName(invoice.customer_id), customerId: invoice.customer_id, balance })}>Record payment</button></td></tr>; })}
      {jobs.map((job) => { const balance = Math.max(0, job.amount - job.amount_paid); return <tr key={`job-${job.id}`}><td>{job.customer_name_freeform || "Walk-in / unnamed"}</td><td>Daily Sales{job.site_name ? ` · ${job.site_name}` : ""}</td><td>{job.due_date}</td><td>{daysLate(job.due_date)}</td><td>{money(job.amount)}</td><td>{money(job.amount_paid)}</td><td><strong>{money(balance)}</strong></td><td><button className="btn" onClick={() => setPayment({ kind: "job", id: job.id, customer: job.customer_name_freeform || "Unnamed customer", balance })}>Record payment</button></td></tr>; })}
      {!loading && !invoices.length && !jobs.length && <tr><td colSpan={8} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>Nothing outstanding.</td></tr>}
    </tbody></table></div>
    {payment && <ReceivablePayment payment={payment} onSaved={() => { setPayment(null); load(); }} onCancel={() => setPayment(null)} />}
  </div>;
}

function ReceivablePayment({ payment, onSaved, onCancel }: { payment: PaymentFormState; onSaved: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(payment.balance)); const [method, setMethod] = useState("cash"); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [reference, setReference] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { const value = Number(amount); if (!value || value <= 0 || value > payment.balance) { setError(`Enter an amount up to ${money(payment.balance)}.`); return; } setSaving(true); const result = payment.kind === "job" ? await supabase.from("daily_entry_payments").insert({ daily_entry_id: payment.id, amount: value, payment_date: date, method, reference: reference || null }) : await supabase.from("payments").insert({ invoice_id: payment.id, customer_id: payment.customerId, amount: value, payment_date: date, method, reference: reference || null }); setSaving(false); if (result.error) setError(result.error.message); else onSaved(); }
  return <div className="panel" style={{ padding: 20, marginTop: 20, maxWidth: 620 }}><h2 style={{ fontSize: 16, marginTop: 0 }}>Record payment for {payment.customer}</h2><p style={{ color: "var(--text-muted)", fontSize: 13 }}>Balance due: {money(payment.balance)}</p>{error && <div style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div className="field-group"><label className="field">Amount</label><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div className="field-group"><label className="field">Payment date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div className="field-group"><label className="field">Method</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "upi", "bank_transfer", "cheque", "card"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></div><div className="field-group"><label className="field">Reference</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></div></div><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save payment"}</button><button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button></div>;
}