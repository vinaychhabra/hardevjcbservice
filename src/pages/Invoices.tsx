import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "../lib/supabase";
import { Customer, DailyEntry, Invoice } from "../types";
import { useAuth } from "../lib/AuthContext";

interface LineItemDraft {
  description: string;
  quantity: number;
  rate: number;
  tax_rate_pct: number;
}

const formatMoney = (value: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

export default function Invoices() {
  const { hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pendingSales, setPendingSales] = useState<DailyEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [quickInvoiceCustomerId, setQuickInvoiceCustomerId] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  async function load() {
    const [{ data: inv }, { data: cu }, { data: sales }] = await Promise.all([
      supabase.from("invoices").select("*").order("issue_date", { ascending: false }),
      supabase.from("customers").select("*"),
      supabase.from("daily_entries").select("*").neq("payment_status", "paid").order("entry_date", { ascending: false }),
    ]);
    setInvoices((inv ?? []) as Invoice[]);
    setCustomers((cu ?? []) as Customer[]);
    setPendingSales((sales ?? []) as DailyEntry[]);
  }

  async function deleteInvoice(id: string) {
    if (!window.confirm("Delete this invoice?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (!error) load();
  }

  async function downloadInvoice(invoice: Invoice) {
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("id", { ascending: true });

    const customer = customers.find((c) => c.id === invoice.customer_id);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = 56;

    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageWidth, 86, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.text("Hardev JCB", margin, 32);
    pdf.setFontSize(10);
    pdf.text("Operations Suite", margin, 48);

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.text("Invoice", pageWidth - margin - 70, 32, { align: "right" });
    pdf.setFontSize(10);
    pdf.text(`Invoice # ${invoice.invoice_number || "-"}`, pageWidth - margin, 48, { align: "right" });
    pdf.text(`Issue date: ${invoice.issue_date || "-"}`, pageWidth - margin, 62, { align: "right" });
    pdf.text(`Due date: ${invoice.due_date || "-"}`, pageWidth - margin, 76, { align: "right" });

    y = 110;
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(margin, y - 16, pageWidth - margin * 2, 52, 10, 10, "F");
    pdf.setFontSize(11);
    pdf.setTextColor(71, 85, 105);
    pdf.text("Bill to", margin + 16, y - 2);
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(16);
    pdf.text(customer?.name ?? "Customer", margin + 16, y + 18);

    const rows = (lineItems ?? []).length ? (lineItems ?? []) : [{ description: "No line items", quantity: 0, rate: 0, amount: 0 }];

    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(10);
    const columns = [
      { title: "Description", x: margin, width: 260 },
      { title: "Qty", x: margin + 270, width: 40 },
      { title: "Rate", x: margin + 320, width: 60 },
      { title: "Amount", x: margin + 390, width: 80 },
    ];

    y += 46;
    columns.forEach((column) => {
      pdf.text(column.title, column.x, y);
    });

    pdf.setDrawColor(148, 163, 184);
    pdf.line(margin, y + 4, pageWidth - margin, y + 4);

    y += 18;
    rows.forEach((item, idx) => {
      if (y > pageHeight - 110) {
        pdf.addPage();
        y = 50;
      }

      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(10);
      const desc = item.description || "-";
      pdf.text(String(desc).slice(0, 44), margin, y);
      pdf.text(String(Number(item.quantity ?? 0)), margin + 280, y);
      pdf.text(`INR ${formatMoney(Number(item.rate ?? 0))}`, margin + 330, y);
      pdf.text(`INR ${formatMoney(Number(item.amount ?? 0))}`, margin + 400, y);
      pdf.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 18;

      if (idx === 0 && !(lineItems ?? []).length) {
        pdf.setTextColor(100, 116, 139);
      }
    });

    const totalY = Math.min(pageHeight - 124, y + 18);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(pageWidth - 200, totalY - 12, 160, 86, 10, 10, "F");
    pdf.setFontSize(11);
    pdf.setTextColor(71, 85, 105);
    const pendingAmount = Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0));
    pdf.text("Subtotal", pageWidth - 170, totalY);
    pdf.text(`INR ${formatMoney(Number(invoice.subtotal ?? 0))}`, pageWidth - margin, totalY, { align: "right" });
    pdf.text("Tax", pageWidth - 170, totalY + 16);
    pdf.text(`INR ${formatMoney(Number(invoice.tax_total ?? 0))}`, pageWidth - margin, totalY + 16, { align: "right" });
    pdf.text("Total", pageWidth - 170, totalY + 32);
    pdf.text(`INR ${formatMoney(Number(invoice.total ?? 0))}`, pageWidth - margin, totalY + 32, { align: "right" });
    pdf.text("Paid", pageWidth - 170, totalY + 48);
    pdf.text(`INR ${formatMoney(Number(invoice.amount_paid ?? 0))}`, pageWidth - margin, totalY + 48, { align: "right" });
    pdf.text("Pending", pageWidth - 170, totalY + 64);
    pdf.text(`INR ${formatMoney(pendingAmount)}`, pageWidth - margin, totalY + 64, { align: "right" });

    pdf.save(`${invoice.invoice_number || "invoice"}.pdf`);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const pendingBalance = (invoice: Invoice) => Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0));
  const salesByCustomer = useMemo(() => {
    const map = new Map<string, DailyEntry[]>();
    pendingSales.forEach((sale) => {
      if (!sale.customer_id) return;
      const list = map.get(sale.customer_id) ?? [];
      list.push(sale);
      map.set(sale.customer_id, list);
    });
    return map;
  }, [pendingSales]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Invoices</h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Create invoices from sales, add billing details, and keep the due dates aligned with customer work.
          </p>
        </div>
        {hasPermission("invoices.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!customers.length}>
            {showForm ? "Cancel" : "New invoice"}
          </button>
        )}
      </div>

      {showForm && (
        <InvoiceForm
          customers={customers}
          pendingSales={pendingSales}
          initialCustomerId={quickInvoiceCustomerId ?? customers[0]?.id ?? ""}
          onSaved={() => {
            setShowForm(false);
            setQuickInvoiceCustomerId(null);
            load();
          }}
        />
      )}
      {payingInvoice && (
        <PaymentForm invoice={payingInvoice} onSaved={() => { setPayingInvoice(null); load(); }} onCancel={() => setPayingInvoice(null)} />
      )}

      <div className="panel" style={{ marginBottom: 18, padding: 14 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 10 }}>
          Pending sales ready to invoice
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {customers.filter((customer) => (salesByCustomer.get(customer.id) ?? []).length > 0).map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="panel"
              style={{ padding: "8px 10px", background: "var(--surface-alt)", textAlign: "left", cursor: "pointer" }}
              onClick={() => {
                setQuickInvoiceCustomerId(customer.id);
                setShowForm(true);
              }}
            >
              <strong>{customer.name}</strong>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {(salesByCustomer.get(customer.id) ?? []).length} unpaid sales item(s)
              </div>
              <div style={{ color: "var(--primary)", fontSize: 11, fontWeight: 700, marginTop: 4 }}>Create invoice</div>
            </button>
          ))}
          {!customers.some((customer) => (salesByCustomer.get(customer.id) ?? []).length > 0) && (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No unpaid sales are waiting to be invoiced.</div>
          )}
        </div>
      </div>

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
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={`status-chip status-${inv.status === "paid" ? "available" : inv.status === "overdue" ? "breakdown" : "on_rent"}`}>{inv.status.replace("_", " ")}</span>
                    {pendingBalance(inv) > 0 && <small style={{ color: "var(--text-muted)", fontSize: 11 }}>Pending: ₹{pendingBalance(inv).toLocaleString()}</small>}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn" style={{ padding: "4px 8px" }} onClick={() => downloadInvoice(inv)}>Download</button>
                    {inv.status !== "paid" && hasPermission("payments.write") && (
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => setPayingInvoice(inv)}>Record payment</button>
                    )}
                    {hasPermission("invoices.write") && (
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => deleteInvoice(inv.id)}>Delete</button>
                    )}
                  </div>
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

function InvoiceForm({ customers, pendingSales, initialCustomerId, onSaved }: { customers: Customer[]; pendingSales: DailyEntry[]; initialCustomerId?: string; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState(initialCustomerId ?? customers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemDraft[]>([{ description: "", quantity: 1, rate: 0, tax_rate_pct: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  const customerSales = pendingSales.filter((sale) => sale.customer_id === customerId && sale.payment_status !== "paid");

  useEffect(() => {
    if (!customerId) return;
    if (customerSales.length > 0) {
      setItems(
        customerSales.map((entry) => ({
          description: `${entry.entry_date} • ${entry.site_name || "Site work"} • ${entry.billing_type}`,
          quantity: 1,
          rate: Number(entry.amount || 0),
          tax_rate_pct: 0,
        }))
      );
    }
  }, [customerId, pendingSales]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxTotal = items.reduce((sum, item) => sum + (item.quantity * item.rate * item.tax_rate_pct) / 100, 0);
  const total = subtotal + taxTotal;

  function updateItem(i: number, patch: Partial<LineItemDraft>) {
    setItems((its) => its.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function autoFillFromSales() {
    const sales = customerSales.length
      ? customerSales.map((entry) => ({
          description: `${entry.entry_date} • ${entry.site_name || "Site work"} • ${entry.billing_type}`,
          quantity: 1,
          rate: Number(entry.amount || 0),
          tax_rate_pct: 0,
        }))
      : [{ description: "Service / equipment billing", quantity: 1, rate: 0, tax_rate_pct: 0 }];
    setItems(sales);
  }

  async function submit() {
    setSaving(true);
    setError(null);

    const validItems = items.filter((item) => item.description.trim() && Number(item.rate) >= 0 && Number(item.quantity) > 0);
    if (!customerId || !validItems.length) {
      setSaving(false);
      setError("Select a customer and add at least one valid invoice line item.");
      return;
    }

    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .insert({
        customer_id: customerId,
        invoice_number: "",
        issue_date: issueDate,
        due_date: dueDate,
        status,
        notes: notes || null,
      })
      .select()
      .single();

    if (invError || !invoice) {
      setSaving(false);
      setError(invError?.message ?? "Could not create invoice");
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_line_items").insert(
      validItems.map((item) => ({
        invoice_id: invoice.id,
        description: item.description.trim(),
        quantity: Number(item.quantity),
        rate: Number(item.rate),
        amount: Number(item.quantity) * Number(item.rate),
        tax_rate_pct: Number(item.tax_rate_pct || 0),
      }))
    );

    setSaving(false);
    if (itemsError) {
      setError(itemsError.message);
      return;
    }
    setSuccessMessage("Invoice created successfully.");
    window.setTimeout(() => onSaved(), 250);
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div className="message-banner error">{error}</div>}
      {successMessage && <div className="message-banner success">{successMessage}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
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
        <div className="field-group">
          <label className="field">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['draft','sent','partially_paid','paid','overdue','void'].map((value) => (
              <option key={value} value={value}>{value.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <div className="field-group">
          <label className="field">Billing notes</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Project details, agreement notes, terms, etc." />
        </div>
        <div className="field-group">
          <label className="field">Quick actions</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minHeight: 42 }}>
            <button type="button" className="btn" onClick={autoFillFromSales}>
              Auto-fill from unpaid sales
            </button>
            <button type="button" className="btn" onClick={() => setItems([{ description: "", quantity: 1, rate: 0, tax_rate_pct: 0 }])}>
              Clear items
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>Line items</label>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {customerSales.length} unpaid sales record(s) linked to this customer
        </div>
      </div>

      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2.2fr 90px 110px 90px", gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
          <input className="input" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Rate" value={it.rate} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Tax %" value={it.tax_rate_pct} onChange={(e) => updateItem(i, { tax_rate_pct: Number(e.target.value) })} />
        </div>
      ))}

      <button className="btn" onClick={() => setItems((its) => [...its, { description: "", quantity: 1, rate: 0, tax_rate_pct: 0 }])} style={{ marginBottom: 16 }}>
        + Add line
      </button>

      <div className="panel" style={{ marginBottom: 16, padding: 12, background: "var(--surface-alt)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div><span style={{ color: "var(--text-muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Subtotal</span><div style={{ fontSize: 18, fontWeight: 800 }}>₹{subtotal.toLocaleString()}</div></div>
          <div><span style={{ color: "var(--text-muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tax</span><div style={{ fontSize: 18, fontWeight: 800 }}>₹{taxTotal.toLocaleString()}</div></div>
          <div><span style={{ color: "var(--text-muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</span><div style={{ fontSize: 22, fontWeight: 800 }}>₹{total.toLocaleString()}</div></div>
        </div>
      </div>

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
