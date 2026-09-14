import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

interface InvoiceRow { id: string; invoice_number: string; customer_id: string; due_date: string; total: number; amount_paid: number }
interface Customer { id: string; name: string }
interface JobRow { id: string; customer_name_freeform: string | null; site_name: string | null; due_date: string; amount: number; amount_paid: number; entry_date: string }
interface PaymentHistoryRow { id: string; amount: number; payment_date: string; method: string; reference: string | null; notes: string | null }
interface InvoiceLineItem { id: string; description: string; quantity: number; rate: number; amount: number }
interface PaymentEntry extends PaymentHistoryRow {
  kind: "invoice" | "job";
  customer: string;
  customerId?: string;
  source: string;
  sourceId: string;
  invoice_id?: string;
  daily_entry_id?: string;
}
interface PaymentFormState { kind: "invoice" | "job"; id: string; customer: string; customerId?: string; balance: number }
interface ReceivableDetail {
  kind: "invoice" | "job";
  id: string;
  customer: string;
  title: string;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  sourceLabel: string;
  metadata: Array<{ label: string; value: string }>;
  payments: PaymentHistoryRow[];
  lineItems?: InvoiceLineItem[];
  jobDetails?: { entryDate: string; siteName: string | null; notes: string | null; baseAmount: number; dieselCharge: number; totalAmount: number };
}

const money = (value: number) => `₹${value.toLocaleString()}`;
const daysLate = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000));
const totalDueForEntry = (entry: { amount: number; diesel_included?: boolean | null; diesel_cost?: number | null }) => {
  const base = Number(entry.amount ?? 0);
  const dieselExtra = entry.diesel_included === false ? Number(entry.diesel_cost ?? 0) : 0;
  return base + dieselExtra;
};

export default function Receivables() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payment, setPayment] = useState<PaymentFormState | null>(null);
  const [selected, setSelected] = useState<ReceivableDetail | null>(null);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<PaymentEntry | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "0-30" | "31-60" | "61-90" | "90+">("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: invoiceRows }, { data: jobRows }, { data: customerRows }, { data: invoicePayments }, { data: jobPayments }, { data: dailyRows }] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, customer_id, due_date, total, amount_paid").neq("status", "paid").order("due_date"),
      supabase.from("daily_entries").select("id, customer_name_freeform, site_name, due_date, amount, amount_paid, entry_date, diesel_included, diesel_cost").neq("payment_status", "paid").order("due_date"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("payments").select("id, invoice_id, customer_id, amount, payment_date, method, reference, notes").order("payment_date", { ascending: false }),
      supabase.from("daily_entry_payments").select("id, daily_entry_id, amount, payment_date, method, reference, notes").order("payment_date", { ascending: false }),
      supabase.from("daily_entries").select("id, customer_name_freeform, customer_id, amount, amount_paid, site_name").order("entry_date", { ascending: false }),
    ]);

    const invoiceMap = new Map((invoiceRows ?? []).map((row: any) => [row.id, row]));
    const dailyMap = new Map((dailyRows ?? []).map((row: any) => [row.id, row]));

    const mappedInvoicePayments = (invoicePayments ?? []).map((paymentRow: any) => {
      const invoice = invoiceMap.get(paymentRow.invoice_id);
      const customerNameValue = customerRows?.find((customer) => customer.id === paymentRow.customer_id)?.name ?? "Unknown customer";
      return {
        id: paymentRow.id,
        kind: "invoice" as const,
        customer: customerNameValue,
        customerId: paymentRow.customer_id,
        source: invoice ? `Invoice ${invoice.invoice_number}` : "Invoice",
        sourceId: paymentRow.invoice_id,
        invoice_id: paymentRow.invoice_id,
        amount: Number(paymentRow.amount ?? 0),
        payment_date: paymentRow.payment_date,
        method: paymentRow.method,
        reference: paymentRow.reference,
        notes: paymentRow.notes,
      };
    });

    const mappedDailyPayments = (jobPayments ?? []).map((paymentRow: any) => {
      const job = dailyMap.get(paymentRow.daily_entry_id);
      const customerNameValue = job?.customer_name_freeform || "Walk-in / unnamed";
      return {
        id: paymentRow.id,
        kind: "job" as const,
        customer: customerNameValue,
        source: job?.site_name ? `Daily Sales · ${job.site_name}` : "Daily Sales",
        sourceId: paymentRow.daily_entry_id,
        daily_entry_id: paymentRow.daily_entry_id,
        amount: Number(paymentRow.amount ?? 0),
        payment_date: paymentRow.payment_date,
        method: paymentRow.method,
        reference: paymentRow.reference,
        notes: paymentRow.notes,
      };
    });

    setInvoices((invoiceRows ?? []) as InvoiceRow[]);
    setJobs((jobRows ?? []) as JobRow[]);
    setCustomers((customerRows ?? []) as Customer[]);
    setPaymentEntries([...mappedInvoicePayments, ...mappedDailyPayments]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? "Unknown customer";

  const openDetails = async (kind: "invoice" | "job", id: string, customer: string, customerId?: string) => {
    if (kind === "invoice") {
      const [{ data: invoiceDetail }, { data: lineItems }, { data: paymentRows }] = await Promise.all([
        supabase.from("invoices").select("id, invoice_number, customer_id, issue_date, due_date, total, amount_paid").eq("id", id).single(),
        supabase.from("invoice_line_items").select("id, description, quantity, rate, amount").eq("invoice_id", id).order("id"),
        supabase.from("payments").select("id, amount, payment_date, method, reference, notes").eq("invoice_id", id).order("payment_date", { ascending: false }),
      ]);

      if (!invoiceDetail) return;

      const detail = {
        kind,
        id,
        customer,
        title: `Invoice ${invoiceDetail.invoice_number}`,
        dueDate: invoiceDetail.due_date,
        total: Number(invoiceDetail.total ?? 0),
        paid: Number(invoiceDetail.amount_paid ?? 0),
        balance: Math.max(0, Number(invoiceDetail.total ?? 0) - Number(invoiceDetail.amount_paid ?? 0)),
        sourceLabel: `Invoice ${invoiceDetail.invoice_number}`,
        metadata: [
          { label: "Invoice number", value: invoiceDetail.invoice_number },
          { label: "Issued", value: invoiceDetail.issue_date },
          { label: "Due date", value: invoiceDetail.due_date },
          { label: "Customer", value: customer },
        ],
        payments: (paymentRows ?? []) as PaymentHistoryRow[],
        lineItems: (lineItems ?? []) as InvoiceLineItem[],
      } satisfies ReceivableDetail;

      setSelected(detail);
      return;
    }

    const [{ data: jobDetail }, { data: paymentRows }] = await Promise.all([
      supabase.from("daily_entries").select("id, customer_name_freeform, site_name, entry_date, due_date, amount, amount_paid, notes, diesel_included, diesel_cost").eq("id", id).single(),
      supabase.from("daily_entry_payments").select("id, amount, payment_date, method, reference, notes").eq("daily_entry_id", id).order("payment_date", { ascending: false }),
    ]);

    if (!jobDetail) return;

    const totalDue = totalDueForEntry(jobDetail as any);
    const detail = {
      kind,
      id,
      customer,
      title: jobDetail.site_name ? `Daily Sales · ${jobDetail.site_name}` : "Daily Sales",
      dueDate: jobDetail.due_date,
      total: totalDue,
      paid: Number(jobDetail.amount_paid ?? 0),
      balance: Math.max(0, totalDue - Number(jobDetail.amount_paid ?? 0)),
      sourceLabel: jobDetail.site_name ? `Daily Sales · ${jobDetail.site_name}` : "Daily Sales",
      metadata: [
        { label: "Work date", value: jobDetail.entry_date },
        { label: "Site", value: jobDetail.site_name || "—" },
        { label: "Due date", value: jobDetail.due_date },
        { label: "Customer", value: customer },
      ],
      payments: (paymentRows ?? []) as PaymentHistoryRow[],
      jobDetails: {
        entryDate: jobDetail.entry_date,
        siteName: jobDetail.site_name,
        notes: jobDetail.notes,
        baseAmount: Number(jobDetail.amount ?? 0),
        dieselCharge: jobDetail.diesel_included === false ? Number(jobDetail.diesel_cost ?? 0) : 0,
        totalAmount: totalDue,
      },
    } satisfies ReceivableDetail;

    setSelected(detail);
  };

  const invoiceBalance = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.amount_paid), 0);
  const jobBalance = jobs.reduce((sum, job) => sum + Math.max(0, totalDueForEntry(job) - job.amount_paid), 0);
  const total = invoiceBalance + jobBalance;
  const customerBalances = new Map<string, { name: string; balance: number; days: number }>();

  invoices.forEach((invoice) => {
    const name = customerName(invoice.customer_id);
    const current = customerBalances.get(name) ?? { name, balance: 0, days: 0 };
    current.balance += Math.max(0, invoice.total - invoice.amount_paid);
    current.days = Math.max(current.days, daysLate(invoice.due_date));
    customerBalances.set(name, current);
  });

  jobs.forEach((job) => {
    const name = job.customer_name_freeform || "Walk-in / unnamed";
    const current = customerBalances.get(name) ?? { name, balance: 0, days: 0 };
    const totalDue = totalDueForEntry(job);
    current.balance += Math.max(0, totalDue - job.amount_paid);
    current.days = Math.max(current.days, daysLate(job.due_date));
    customerBalances.set(name, current);
  });

  const exportReceivablesCsv = () => {
    const rows: string[][] = [
      ["Customer", "Source", "Due date", "Original", "Paid", "Balance"],
      ...tableRows.map((row) => [
        row.customer,
        row.source,
        row.dueDate,
        String(row.original),
        String(row.paid),
        String(row.balance),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "receivables_report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const printReceivablesReport = () => {
    window.print();
  };

  const tableRows = useMemo(
    () => [
      ...invoices.map((invoice) => ({
        key: `invoice-${invoice.id}`,
        kind: "invoice" as const,
        customer: customerName(invoice.customer_id),
        customerId: invoice.customer_id,
        source: `Invoice ${invoice.invoice_number}`,
        dueDate: invoice.due_date,
        original: invoice.total,
        paid: invoice.amount_paid,
        balance: Math.max(0, invoice.total - invoice.amount_paid),
        id: invoice.id,
        days: daysLate(invoice.due_date),
      })),
      ...jobs.map((job) => {
        const totalDue = totalDueForEntry(job);
        return {
          key: `job-${job.id}`,
          kind: "job" as const,
          customer: job.customer_name_freeform || "Walk-in / unnamed",
          customerId: undefined,
          source: `Daily Sales${job.site_name ? ` · ${job.site_name}` : ""}`,
          dueDate: job.due_date,
          original: totalDue,
          paid: job.amount_paid,
          balance: Math.max(0, totalDue - job.amount_paid),
          id: job.id,
          days: daysLate(job.due_date),
        };
      }),
    ],
    [customers, invoices, jobs],
  );

  const agingBuckets = {
    "0-30": tableRows.filter((row) => row.days >= 0 && row.days <= 30).reduce((sum, row) => sum + row.balance, 0),
    "31-60": tableRows.filter((row) => row.days >= 31 && row.days <= 60).reduce((sum, row) => sum + row.balance, 0),
    "61-90": tableRows.filter((row) => row.days >= 61 && row.days <= 90).reduce((sum, row) => sum + row.balance, 0),
    "90+": tableRows.filter((row) => row.days > 90).reduce((sum, row) => sum + row.balance, 0),
  };

  const filteredTableRows = useMemo(() => {
    return tableRows.filter((row) => {
      const matchesSearch = row.customer.toLowerCase().includes(search.toLowerCase()) || row.source.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === "all") return true;

      if (filter === "0-30") return row.days >= 0 && row.days <= 30;
      if (filter === "31-60") return row.days >= 31 && row.days <= 60;
      if (filter === "61-90") return row.days >= 61 && row.days <= 90;
      if (filter === "90+") return row.days > 90;

      return true;
    });
  }, [tableRows, search, filter]);

  const getRowSeverity = (days: number) => {
    if (days > 90) return { label: "Critical", tone: "var(--danger)", bg: "rgba(185, 28, 28, 0.08)", border: "rgba(185, 28, 28, 0.28)" };
    if (days > 60) return { label: "Watch", tone: "var(--warning)", bg: "rgba(245, 158, 11, 0.07)", border: "rgba(245, 158, 11, 0.22)" };
    if (days > 30) return { label: "Risk", tone: "#a16207", bg: "rgba(217, 119, 6, 0.06)", border: "rgba(217, 119, 6, 0.18)" };
    return { label: "Healthy", tone: "var(--success)", bg: "rgba(21, 128, 61, 0.06)", border: "rgba(21, 128, 61, 0.18)" };
  };

  const customerPaymentTimeline = useMemo(() => {
    const map = new Map<string, { customer: string; collected: number; outstanding: number; entries: PaymentEntry[] }>();

    for (const entry of paymentEntries) {
      const current = map.get(entry.customer) ?? { customer: entry.customer, collected: 0, outstanding: 0, entries: [] };
      current.collected += entry.amount;
      current.entries.push(entry);
      map.set(entry.customer, current);
    }

    for (const row of tableRows) {
      const current = map.get(row.customer) ?? { customer: row.customer, collected: 0, outstanding: 0, entries: [] };
      current.outstanding += row.balance;
      map.set(row.customer, current);
    }

    return Array.from(map.values())
      .map((item) => ({ ...item, entries: item.entries.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()) }))
      .sort((a, b) => b.collected + b.outstanding - (a.collected + a.outstanding));
  }, [paymentEntries, tableRows]);

  const updatePaymentEntryAmount = async (entry: PaymentEntry, nextAmount: number, nextDate: string, nextMethod: string, nextReference: string, nextNotes: string) => {
    const delta = nextAmount - entry.amount;

    if (entry.kind === "invoice" && entry.invoice_id) {
      const { data: invoice } = await supabase.from("invoices").select("amount_paid, total").eq("id", entry.invoice_id).single();
      const nextPaid = Math.max(0, Number(invoice?.amount_paid ?? 0) + delta);
      await supabase.from("invoices").update({ amount_paid: nextPaid, status: nextPaid >= Number(invoice?.total ?? 0) ? "paid" : "partially_paid" }).eq("id", entry.invoice_id);
      await supabase.from("payments").update({ amount: nextAmount, payment_date: nextDate, method: nextMethod, reference: nextReference || null, notes: nextNotes || null }).eq("id", entry.id);
    }

    if (entry.kind === "job" && entry.daily_entry_id) {
      const { data: dailyEntry } = await supabase.from("daily_entries").select("amount_paid, amount, payment_status").eq("id", entry.daily_entry_id).single();
      const nextPaid = Math.max(0, Number(dailyEntry?.amount_paid ?? 0) + delta);
      await supabase.from("daily_entries").update({
        amount_paid: nextPaid,
        payment_status: nextPaid >= Number(dailyEntry?.amount ?? 0) ? "paid" : (nextPaid > 0 ? "partially_paid" : "pending"),
      }).eq("id", entry.daily_entry_id);
      await supabase.from("daily_entry_payments").update({ amount: nextAmount, payment_date: nextDate, method: nextMethod, reference: nextReference || null, notes: nextNotes || null }).eq("id", entry.id);
    }

    setEditingEntry(null);
    await load();
  };

  const deletePaymentEntry = async (entry: PaymentEntry) => {
    if (!window.confirm(`Delete this payment of ${money(entry.amount)} for ${entry.customer}?`)) return;

    if (entry.kind === "invoice" && entry.invoice_id) {
      const { data: invoice } = await supabase.from("invoices").select("amount_paid, total").eq("id", entry.invoice_id).single();
      const nextPaid = Math.max(0, Number(invoice?.amount_paid ?? 0) - entry.amount);
      await supabase.from("invoices").update({ amount_paid: nextPaid, status: nextPaid >= Number(invoice?.total ?? 0) ? "paid" : "partially_paid" }).eq("id", entry.invoice_id);
      await supabase.from("payments").delete().eq("id", entry.id);
    }

    if (entry.kind === "job" && entry.daily_entry_id) {
      const { data: dailyEntry } = await supabase.from("daily_entries").select("amount_paid, amount, payment_status").eq("id", entry.daily_entry_id).single();
      const nextPaid = Math.max(0, Number(dailyEntry?.amount_paid ?? 0) - entry.amount);
      await supabase.from("daily_entries").update({
        amount_paid: nextPaid,
        payment_status: nextPaid >= Number(dailyEntry?.amount ?? 0) ? "paid" : (nextPaid > 0 ? "partially_paid" : "pending"),
      }).eq("id", entry.daily_entry_id);
      await supabase.from("daily_entry_payments").delete().eq("id", entry.id);
    }

    setSelected(null);
    await load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Receivables</h1>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Outstanding invoices and Daily Sales jobs, including partial payments.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={exportReceivablesCsv}>Export CSV</button>
          <button className="btn" onClick={printReceivablesReport}>Print / PDF</button>
          <div className="panel" style={{ padding: "10px 16px" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total outstanding</div>
            <strong style={{ fontSize: 22 }}>{money(total)}</strong>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Customer-wise outstanding report</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
          {Object.entries(agingBuckets).map(([label, value]) => (
            <div key={label} className="panel" style={{ padding: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{money(value)}</div>
            </div>
          ))}
        </div>

        <table className="data-table">
          <thead>
            <tr><th>Customer</th><th>Outstanding</th><th>Oldest overdue</th></tr>
          </thead>
          <tbody>
            {Array.from(customerBalances.values()).sort((a, b) => b.balance - a.balance).map((customer) => (
              <tr key={customer.name}>
                <td>{customer.name}</td>
                <td><strong>{money(customer.balance)}</strong></td>
                <td>{customer.days} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Receivables list</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or source"
              style={{ minWidth: 220 }}
            />
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="all">All aging</option>
              <option value="0-30">0-30 days</option>
              <option value="31-60">31-60 days</option>
              <option value="61-90">61-90 days</option>
              <option value="90+">90+ days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th><th>Source</th><th>Due date</th><th>Days overdue</th><th>Original</th><th>Paid</th><th>Balance</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTableRows.map((row) => {
              const overdueColor = row.days > 90 ? "var(--danger)" : row.days > 60 ? "var(--warning)" : "var(--text)";
              const severity = getRowSeverity(row.days);
              const isExpanded = selected && selected.id === row.id && selected.kind === row.kind;

              return (
                <>
                  <tr
                    key={row.key}
                    onClick={() => {
                      if (isExpanded) {
                        setSelected(null);
                        return;
                      }
                      openDetails(row.kind, row.id, row.customer, row.customerId);
                    }}
                    style={{
                      cursor: "pointer",
                      background: isExpanded ? "rgba(37, 99, 235, 0.05)" : severity.bg,
                      borderLeft: `4px solid ${severity.tone}`,
                    }}
                    title="Click to view payment history and work details"
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{row.customer}</span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 999,
                            fontSize: 10,
                            padding: "2px 8px",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            background: `${severity.tone}15`,
                            color: severity.tone,
                            border: `1px solid ${severity.tone}33`,
                          }}
                        >
                          {severity.label}
                        </span>
                      </div>
                    </td>
                    <td>{row.source}</td>
                    <td>{row.dueDate}</td>
                    <td style={{ color: overdueColor, fontWeight: 700 }}>{row.days}</td>
                    <td>{money(row.original)}</td>
                    <td>{money(row.paid)}</td>
                    <td><strong>{money(row.balance)}</strong></td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(null);
                            setPayment({
                              kind: row.kind,
                              id: row.id,
                              customer: row.customer,
                              customerId: row.customerId,
                              balance: row.balance,
                            });
                          }}
                        >
                          Record payment
                        </button>
                      </div>
                    </td>
                  </tr>

                </>
              );
            })}

            {!loading && !filteredTableRows.length && (
              <tr>
                <td colSpan={8} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>Nothing outstanding.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.42)",
              zIndex: 40,
            }}
          />

          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              top: 20,
              right: 20,
              bottom: 20,
              width: "min(520px, calc(100vw - 32px))",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(15, 23, 42, 0.22)",
              overflowY: "auto",
              zIndex: 41,
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Receivable detail</div>
                <h2 style={{ margin: "6px 0 0", fontSize: 20 }}>{selected.title}</h2>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn"
                  onClick={() => {
                    setSelected(null);
                    setPayment({
                      kind: selected.kind,
                      id: selected.id,
                      customer: selected.customer,
                      customerId: selected.metadata.find((item) => item.label === "Customer")?.value || undefined,
                      balance: selected.balance,
                    });
                  }}
                >
                  Record payment
                </button>
                <button className="btn" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>

            <div className="summary-grid" style={{ marginBottom: 18 }}>
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Original</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{money(selected.total)}</div>
              </div>
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Paid</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{money(selected.paid)}</div>
              </div>
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Balance</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{money(selected.balance)}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
              {selected.metadata.map((item) => (
                <div key={item.label} className="panel" style={{ padding: 12 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{item.label}</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {selected.kind === "job" && selected.jobDetails && (
              <div className="panel" style={{ padding: 14, marginBottom: 18 }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Work details</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                  <div><strong>Entry date:</strong> {selected.jobDetails.entryDate}</div>
                  <div><strong>Site:</strong> {selected.jobDetails.siteName || "—"}</div>
                  <div><strong>Source:</strong> {selected.sourceLabel}</div>
                  <div style={{ gridColumn: "1 / -1" }}><strong>Notes:</strong> {selected.jobDetails.notes || "—"}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <div className="panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Base amount</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{money(selected.jobDetails.baseAmount)}</div>
                  </div>
                  <div className="panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Diesel extra</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{money(selected.jobDetails.dieselCharge)}</div>
                  </div>
                  <div className="panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total due</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{money(selected.jobDetails.totalAmount)}</div>
                  </div>
                </div>
              </div>
            )}

            {selected.kind === "invoice" && selected.lineItems && selected.lineItems.length > 0 && (
              <div className="panel" style={{ padding: 14, marginBottom: 18 }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Invoice work details</h3>
                <table className="data-table">
                  <thead>
                    <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {selected.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{money(Number(item.rate ?? 0))}</td>
                        <td>{money(Number(item.amount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Payment history</h3>
              {selected.payments.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {selected.payments.map((paymentRow) => {
                      const mappedEntry: PaymentEntry = {
                        id: paymentRow.id,
                        kind: selected.kind,
                        customer: selected.customer,
                        source: selected.sourceLabel,
                        sourceId: selected.id,
                        amount: Number(paymentRow.amount ?? 0),
                        payment_date: paymentRow.payment_date,
                        method: paymentRow.method,
                        reference: paymentRow.reference,
                        notes: paymentRow.notes,
                        invoice_id: selected.kind === "invoice" ? selected.id : undefined,
                        daily_entry_id: selected.kind === "job" ? selected.id : undefined,
                      };

                      return (
                        <tr key={paymentRow.id}>
                          <td>{paymentRow.payment_date}</td>
                          <td>{money(Number(paymentRow.amount ?? 0))}</td>
                          <td>{paymentRow.method?.replace("_", " ") ?? "—"}</td>
                          <td>{paymentRow.reference || "—"}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>{paymentRow.notes || "—"}</span>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditingEntry(mappedEntry)}>Edit</button>
                                <button className="btn" style={{ padding: "3px 7px" }} onClick={() => deletePaymentEntry(mappedEntry)}>Delete</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ margin: 0, color: "var(--text-muted)" }}>No payments recorded yet for this receivable.</p>
              )}
            </div>
          </div>
        </>
      )}

      {editingEntry && (
        <PaymentEditor
          entry={editingEntry}
          onSave={async (nextAmount, nextDate, nextMethod, nextReference, nextNotes) => {
            await updatePaymentEntryAmount(editingEntry, nextAmount, nextDate, nextMethod, nextReference, nextNotes);
          }}
          onCancel={() => setEditingEntry(null)}
        />
      )}

      {payment && <ReceivablePayment payment={payment} onSaved={() => { setPayment(null); setSelected(null); load(); }} onCancel={() => setPayment(null)} />}
    </div>
  );
}

function PaymentEditor({ entry, onSave, onCancel }: { entry: PaymentEntry; onSave: (nextAmount: number, nextDate: string, nextMethod: string, nextReference: string, nextNotes: string) => Promise<void>; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.payment_date || new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(entry.method || "cash");
  const [reference, setReference] = useState(entry.reference || "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    setSaving(true);
    await onSave(value, date, method, reference, notes);
    setSaving(false);
  }

  return (
    <div className="panel" style={{ padding: 20, marginTop: 20, maxWidth: 620 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Edit payment for {entry.customer}</h2>
      {error && <div style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field-group">
          <label className="field">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "upi", "bank_transfer", "cheque", "card"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Reference</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="field-group" style={{ gridColumn: "1 / -1" }}>
          <label className="field">Notes</label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Update payment"}</button>
      <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
    </div>
  );
}

function ReceivablePayment({ payment, onSaved, onCancel }: { payment: PaymentFormState; onSaved: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(payment.balance));
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = Number(amount);
    if (!value || value <= 0 || value > payment.balance) {
      setError(`Enter an amount up to ${money(payment.balance)}.`);
      return;
    }

    setSaving(true);
    const result = payment.kind === "job"
      ? await supabase.from("daily_entry_payments").insert({
          daily_entry_id: payment.id,
          amount: value,
          payment_date: date,
          method,
          reference: reference || null,
        })
      : await supabase.from("payments").insert({
          invoice_id: payment.id,
          customer_id: payment.customerId,
          amount: value,
          payment_date: date,
          method,
          reference: reference || null,
        });

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginTop: 20, maxWidth: 620 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Record payment for {payment.customer}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Balance due: {money(payment.balance)}</p>
      {error && <div style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field-group">
          <label className="field">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "upi", "bank_transfer", "cheque", "card"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Reference</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save payment"}</button>
      <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
    </div>
  );
}