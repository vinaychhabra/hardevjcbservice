import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, Customer, DailyEntry } from "../types";
import { useAuth } from "../lib/AuthContext";
import { getSetting } from "../lib/settingsApi";

export default function DailySales() {
  const { hasPermission } = useAuth();
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DailyEntry | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const [{ data: e, error: salesError }, { data: a }, { data: c }] = await Promise.all([
      supabase.from("daily_entries").select("*").order("entry_date", { ascending: false }),
      supabase.from("assets").select("*"),
      supabase.from("customers").select("*").order("name"),
    ]);
    setEntries((e ?? []) as DailyEntry[]);
    setAssets((a ?? []) as Asset[]);
    setCustomers((c ?? []) as Customer[]);
    setLoadError(salesError?.message.includes("end_time") || salesError?.message.includes("start_time")
      ? "Sales time fields are not installed in Supabase. Run 0010_daily_sales_times.sql, then refresh."
      : salesError?.message ?? null);
  }

  useEffect(() => { load(); }, []);

  const assetCode = (id: string) => assets.find((a) => a.id === id)?.internal_code ?? "—";
  const filteredEntries = entries.filter((entry) =>
    (!fromDate || entry.entry_date >= fromDate) &&
    (!toDate || entry.entry_date <= toDate) &&
    (!assetFilter || entry.asset_id === assetFilter)
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTotal = filteredEntries.filter((e) => e.entry_date === todayStr).reduce((s, e) => s + e.amount, 0);
  const monthStr = todayStr.slice(0, 7);
  const monthTotal = filteredEntries.filter((e) => e.entry_date.startsWith(monthStr)).reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Sales</h1>
        {hasPermission("daily_sales.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!assets.length}>
            {showForm ? "Cancel" : "New sale"}
          </button>
        )}
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "-8px 0 20px" }}>
        Record every machine job here. Contracts are optional and only needed when a customer requires a formal agreement.
      </p>
      {loadError && <div className="panel" style={{ padding: 12, marginBottom: 16, color: "var(--red)" }}>{loadError}</div>}

      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <div className="panel" style={{ padding: 16, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Today</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>₹{todayTotal.toLocaleString()}</div>
        </div>
        <div className="panel" style={{ padding: 16, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>This month</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>₹{monthTotal.toLocaleString()}</div>
        </div>
      </div>

      {!assets.length && <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Add an excavator under Machines first.</p>}
      <div className="panel" style={{ padding: 14, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div><label className="field">From</label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
        <div><label className="field">To</label><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        <div><label className="field">Excavator</label><select className="input" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}><option value="">All excavators</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}</select></div>
      </div>
      {showForm && <DailyEntryForm key="new" assets={assets} customers={customers} onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <DailyEntryForm key={editing.id} assets={assets} customers={customers} entry={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="panel">
        <table className="data-table sales-list-table">
          <thead>
            <tr>
              <th>Date</th><th>Machine</th><th>Customer / site</th><th>Billing</th><th>Time / hours</th><th>Amount</th><th>Diesel</th><th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={e.id}>
                <td data-label="Date">{e.entry_date}</td>
                <td data-label="Machine" className="mono">{assetCode(e.asset_id)}</td>
                <td data-label="Customer / site">{[e.customer_name_freeform, e.site_name].filter(Boolean).join(" · ") || "—"}</td>
                <td data-label="Billing">{e.billing_type.replace("_", " ")}</td>
                <td data-label="Time / hours">{e.start_time && e.end_time ? `${e.start_time.slice(0, 5)} - ${e.end_time.slice(0, 5)}` : e.hours_worked != null ? `${e.hours_worked} h` : "—"}</td>
                <td data-label="Amount">₹{e.amount.toLocaleString()}</td>
                <td data-label="Diesel">{e.diesel_included ? "Included" : e.diesel_cost ? `Extra ₹${e.diesel_cost}` : "Excluded"}</td>
                <td data-label="Payment"><span className={`status-chip status-${e.payment_status === "paid" ? "available" : "pending"}`}>{e.payment_status}</span><div style={{ display: "flex", gap: 6, marginTop: 6 }}><button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditing(e)}>Edit</button><button className="btn" style={{ padding: "3px 7px" }} onClick={async () => { if (window.confirm("Delete this sale?")) { await supabase.from("daily_entries").delete().eq("id", e.id); load(); } }}>Delete</button></div></td>
              </tr>
            ))}
            {filteredEntries.length === 0 && (
              <tr><td colSpan={8} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyEntryForm({ assets, customers, entry, onSaved, onCancel }: { assets: Asset[]; customers: Customer[]; entry?: DailyEntry; onSaved: () => void; onCancel?: () => void }) {
  const [assetId, setAssetId] = useState(entry?.asset_id ?? assets[0]?.id ?? "");
  const [entryDate, setEntryDate] = useState(entry?.entry_date ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(entry?.due_date ?? new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState(entry?.customer_name_freeform ?? customers.find((customer) => customer.id === entry?.customer_id)?.name ?? "");
  const [customerId, setCustomerId] = useState(entry?.customer_id ?? "");
  const [customerPhone, setCustomerPhone] = useState(entry?.customer_phone ?? customers.find((customer) => customer.id === entry?.customer_id)?.phone ?? "");
  const [siteName, setSiteName] = useState(entry?.site_name ?? "");
  const [billingType, setBillingType] = useState(entry?.billing_type ?? "hourly");
  const [hoursMode, setHoursMode] = useState<"direct" | "time">(entry?.start_time && entry?.end_time ? "time" : "direct");
  const [hours, setHours] = useState(entry?.hours_worked?.toString() ?? "");
  const [startTime, setStartTime] = useState(entry?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(entry?.end_time?.slice(0, 5) ?? "");
  const [rate, setRate] = useState(entry?.rate?.toString() ?? "");
  const [amount, setAmount] = useState(entry?.amount?.toString() ?? "");
  const [dieselIncluded, setDieselIncluded] = useState(entry?.diesel_included ?? true);
  const [dieselCost, setDieselCost] = useState(entry?.diesel_cost?.toString() ?? "");
  const [paymentStatus, setPaymentStatus] = useState(entry?.payment_status ?? "paid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState({ sales_customer_name: false, sales_customer_phone: false });

  useEffect(() => { getSetting("field_requirements", "config", { sales_customer_name: false, sales_customer_phone: false }).then((config) => setRequirements(config)); }, []);

  function selectCustomer(name: string) {
    setCustomerName(name);
    const customer = customers.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    setCustomerId(customer?.id ?? "");
    setCustomerPhone(customer?.phone ?? "");
  }

  function minutesBetween(startValue: string, endValue: string) {
    if (!startValue || !endValue) return 0;
    const [startHour, startMinute] = startValue.split(":").map(Number);
    const [endHour, endMinute] = endValue.split(":").map(Number);
    let difference = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (difference < 0) difference += 24 * 60;
    return difference;
  }

  function formatHoursForDisplay(decimalHours: number) {
    const totalMinutes = Math.round(decimalHours * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hrs}h ${mins}m`;
  }

  const effectiveMinutes = hoursMode === "time" ? minutesBetween(startTime, endTime) : Math.round((Number(hours || 0)) * 60);
  const effectiveHours = effectiveMinutes / 60;
  const computedAmount = billingType === "hourly" && effectiveHours && rate ? effectiveHours * Number(rate) : Number(amount || 0);

  async function submit() {
    setSaving(true);
    setError(null);
    let resolvedCustomerId = customerId;
    if (requirements.sales_customer_name && !customerName.trim()) { setSaving(false); setError("Customer name is required by Settings."); return; }
    if (requirements.sales_customer_phone && !customerPhone.trim()) { setSaving(false); setError("Customer phone is required by Settings."); return; }
    if (customerName.trim() && !resolvedCustomerId) {
      const { data: createdId, error: customerError } = await supabase.rpc("ensure_customer_for_sale", { p_name: customerName, p_phone: customerPhone || null, p_address: null });
      if (customerError) {
        setSaving(false);
        setError(customerError.message.includes("ensure_customer_for_sale")
          ? "Customer setup is not installed in Supabase. Run migration 0009_customer_sales_fields.sql, then refresh this page."
          : customerError.message);
        return;
      }
      resolvedCustomerId = createdId as string;
    }
    const values = {
      entry_date: entryDate,
      due_date: dueDate,
      asset_id: assetId,
      customer_name_freeform: customerName || null,
      customer_id: resolvedCustomerId || null,
      customer_phone: customerPhone || null,
      site_name: siteName || null,
      billing_type: billingType,
      hours_worked: billingType === "hourly" && effectiveHours ? effectiveHours : null,
      start_time: billingType === "hourly" && hoursMode === "time" && startTime ? startTime : null,
      end_time: billingType === "hourly" && hoursMode === "time" && endTime ? endTime : null,
      rate: rate ? Number(rate) : null,
      amount: billingType === "hourly" ? computedAmount : Number(amount || 0),
      diesel_included: dieselIncluded,
      diesel_cost: !dieselIncluded && dieselCost ? Number(dieselCost) : null,
      payment_status: paymentStatus,
    };
    const { error } = entry
      ? await supabase.from("daily_entries").update(values).eq("id", entry.id)
      : await supabase.from("daily_entries").insert(values);
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Date</label>
          <input className="input" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment due date</label>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Excavator</label>
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Billing type</label>
          <select className="input" value={billingType} onChange={(e) => setBillingType(e.target.value)}>
            <option value="hourly">Hourly</option>
            <option value="fixed_daily">Fixed for the day</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field">Customer name {requirements.sales_customer_name ? "(required)" : "(optional)"}</label>
          <input className="input" list="sales-customers" value={customerName} onChange={(e) => selectCustomer(e.target.value)} placeholder="Choose or type a new customer" />
          <datalist id="sales-customers">{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.phone ?? ""}</option>)}</datalist>
        </div>
        <div className="field-group"><label className="field">Customer phone {requirements.sales_customer_phone ? "(required)" : "(optional)"}</label><input className="input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
        <div className="field-group">
          <label className="field">Site / location</label>
          <input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        </div>
        <div />

        {billingType === "hourly" ? (
          <>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field">How do you want to enter hours?</label>
              <div style={{ display: "flex", gap: 6 }}><button type="button" className="btn" onClick={() => setHoursMode("direct")} style={{ background: hoursMode === "direct" ? "var(--amber)" : undefined }}>Enter hours directly</button><button type="button" className="btn" onClick={() => setHoursMode("time")} style={{ background: hoursMode === "time" ? "var(--amber)" : undefined }}>Use start and end time</button></div>
            </div>
            {hoursMode === "direct" ? <div className="field-group"><label className="field">Hours worked</label><input className="input" type="number" min="0" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></div> : <><div className="field-group"><label className="field">Start time</label><input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div><div className="field-group"><label className="field">End time</label><input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div></>}
            <div className="field-group">
              <label className="field">Rate per hour</label>
              <input className="input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field">{hoursMode === "time" && effectiveMinutes ? `${formatHoursForDisplay(effectiveHours)} · amount` : "Amount (auto)"}</label>
              <input className="input" value={`₹${computedAmount.toLocaleString()}`} disabled />
            </div>
          </>
        ) : (
          <div className="field-group">
            <label className="field">Fixed amount for the day</label>
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}

        <div className="field-group">
          <label className="field">Diesel</label>
          <select className="input" value={dieselIncluded ? "included" : "excluded"} onChange={(e) => setDieselIncluded(e.target.value === "included")}>
            <option value="included">Included in rate</option>
            <option value="excluded">Customer/owner pays separately</option>
          </select>
        </div>
        {!dieselIncluded && (
          <div className="field-group">
            <label className="field">Diesel cost today (optional)</label>
            <input className="input" type="number" value={dieselCost} onChange={(e) => setDieselCost(e.target.value)} />
          </div>
        )}
        <div className="field-group">
          <label className="field">Payment status</label>
          <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !assetId}>{saving ? "Saving…" : entry ? "Update entry" : "Save entry"}</button>{onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
