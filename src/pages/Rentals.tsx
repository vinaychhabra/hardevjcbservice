import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, Customer, RentalContract } from "../types";
import { useAuth } from "../lib/AuthContext";

const CONTRACT_TYPES = ["hourly", "fixed_daily", "fixed_monthly"];
const BILLING_UNITS = ["hour", "day", "month"];

function calculateContractDueAmount(contract: Pick<RentalContract, "rate" | "start_date" | "end_date" | "billing_unit" | "contract_type">) {
  const rate = Number(contract.rate ?? 0);
  if (!rate) return 0;

  const start = contract.start_date ? new Date(`${contract.start_date}T00:00:00`) : new Date();
  const end = contract.end_date ? new Date(`${contract.end_date}T00:00:00`) : start;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return rate;

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  if (contract.billing_unit === "month" || contract.contract_type === "fixed_monthly") {
    return rate * (days / 30);
  }

  if (contract.billing_unit === "day" || contract.contract_type === "fixed_daily") {
    return rate * days;
  }

  if (contract.billing_unit === "hour" || contract.contract_type === "hourly") {
    return rate * (days * 24);
  }

  return rate;
}

export default function Rentals() {
  const { hasPermission } = useAuth();
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<RentalContract | null>(null);

  async function syncAssetStatus(contract: RentalContract, nextStatus: "available" | "on_rent") {
    if (!contract.asset_id) return;
    await supabase.from("assets").update({ status: nextStatus }).eq("id", contract.asset_id);
  }

  async function load() {
    const [{ data: rc }, { data: cu }, { data: as }] = await Promise.all([
      supabase.from("rental_contracts").select("*").order("start_date", { ascending: false }),
      supabase.from("customers").select("*"),
      supabase.from("assets").select("*"),
    ]);

    const activeAssetIds = new Set((rc ?? []).filter((contract: any) => contract.status === "active").map((contract: any) => contract.asset_id));
    const normalizedAssets = (as ?? []).map((asset: any) => {
      const desiredStatus = activeAssetIds.has(asset.id) ? "on_rent" : asset.status === "on_rent" ? "available" : asset.status;
      return { ...asset, status: desiredStatus };
    });

    setContracts((rc ?? []) as RentalContract[]);
    setCustomers((cu ?? []) as Customer[]);
    setAssets(normalizedAssets as Asset[]);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const assetCode = (id: string) => assets.find((a) => a.id === id)?.internal_code ?? "—";

  async function syncContractToReceivable(contract: RentalContract) {
    const contractDate = contract.start_date || new Date().toISOString().slice(0, 10);
    const dueDate = contract.end_date || contractDate;
    const proratedAmount = calculateContractDueAmount(contract);
    const values = {
      entry_date: contractDate,
      due_date: dueDate,
      asset_id: contract.asset_id,
      contract_id: contract.id,
      customer_name_freeform: customerName(contract.customer_id),
      customer_id: contract.customer_id,
      site_name: null,
      billing_type: contract.contract_type === "fixed_monthly" ? "fixed_daily" : contract.contract_type === "fixed_daily" ? "fixed_daily" : "hourly",
      hours_worked: null,
      start_time: null,
      end_time: null,
      rate: Number(contract.rate ?? 0),
      amount: proratedAmount,
      amount_paid: 0,
      diesel_included: contract.diesel_included ?? true,
      diesel_cost: contract.diesel_included === false ? 0 : null,
      payment_status: "pending",
      notes: `Contract ${contract.contract_number}. ${contract.notes ?? ""}`.trim(),
    };

    const { data: existingRows } = await supabase.from("daily_entries").select("id").eq("contract_id", contract.id);
    const rows = existingRows ?? [];

    if (rows.length > 1) {
      const duplicateIds = rows.slice(1).map((row: any) => row.id);
      if (duplicateIds.length) {
        await supabase.from("daily_entries").delete().in("id", duplicateIds);
      }
    }

    const keepRowId = rows[0]?.id;

    if (keepRowId) {
      await supabase.from("daily_entries").update(values).eq("id", keepRowId);
    } else {
      await supabase.from("daily_entries").insert(values);
    }
  }

  async function completeContract(contract: RentalContract) {
    const contractDate = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("rental_contracts").update({
      status: "completed",
      completed_date: contractDate,
      end_date: contract.end_date || contractDate,
    }).eq("id", contract.id);

    if (!error) {
      await syncAssetStatus({ ...contract, status: "completed" }, "available");
      await syncContractToReceivable({ ...contract, status: "completed", completed_date: contractDate, end_date: contract.end_date || contractDate });
    }

    setSelectedContract(null);
    await load();
  }

  async function deleteContract(id: string) {
    if (!window.confirm("Delete this contract? This will remove the agreement record.")) return;
    await supabase.from("daily_entries").delete().eq("contract_id", id);
    await supabase.from("rental_contracts").delete().eq("id", id);
    setSelectedContract(null);
    await load();
  }

  async function cancelContract(id: string) {
    const contract = contracts.find((item) => item.id === id);
    await supabase.from("daily_entries").delete().eq("contract_id", id);
    await supabase.from("rental_contracts").update({ status: "cancelled" }).eq("id", id);
    if (contract) await syncAssetStatus(contract, "available");
    setSelectedContract(null);
    await load();
  }

  async function reopenContract(contract: RentalContract) {
    const { error } = await supabase.from("rental_contracts").update({
      status: "active",
      completed_date: null,
      end_date: null,
    }).eq("id", contract.id);

    if (!error) {
      await syncAssetStatus({ ...contract, status: "active" }, "on_rent");
      await syncContractToReceivable({ ...contract, status: "active", completed_date: null, end_date: null });
    }

    setSelectedContract(null);
    await load();
  }

  const statusColors: Record<string, string> = {
    active: "var(--primary)",
    draft: "var(--text-muted)",
    suspended: "var(--warning)",
    completed: "var(--success)",
    cancelled: "var(--danger)",
    expired: "var(--warning)",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Formal contracts</h1><p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Long-term rentals and service contracts. Use Sales for fast daily work.</p></div>
        {hasPermission("rentals.write") && (
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setShowForm((s) => !s); }} disabled={!customers.length || !assets.length}>
            {showForm ? "Cancel" : "New contract"}
          </button>
        )}
      </div>
      {(!customers.length || !assets.length) && (
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Add a customer and a machine first.</p>
      )}

      {showForm && (
        <ContractForm
          customers={customers}
          assets={assets.filter((a) => a.status === "available")}
          existing={editingId ? contracts.find((c) => c.id === editingId) ?? null : null}
          onSyncContract={syncContractToReceivable}
          onSaved={() => { setShowForm(false); setEditingId(null); load(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      <div className="panel" style={{ overflowX: "hidden", padding: 10 }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap", padding: "8px 6px" }}>Contract</th>
              <th style={{ padding: "8px 6px" }}>Customer</th>
              <th style={{ padding: "8px 6px" }}>Machine</th>
              <th style={{ whiteSpace: "nowrap", padding: "8px 6px" }}>Type</th>
              <th style={{ whiteSpace: "nowrap", padding: "8px 6px" }}>Rate</th>
              <th style={{ whiteSpace: "nowrap", padding: "8px 6px" }}>Status</th>
              <th style={{ width: 100, padding: "8px 6px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} style={{ verticalAlign: "top", background: "transparent" }}>
                <td className="mono" onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", whiteSpace: "nowrap", fontWeight: 700, padding: "8px 6px" }}>{c.contract_number}</td>
                <td onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", padding: "8px 6px", maxWidth: 140, wordBreak: "break-word" }}>{customerName(c.customer_id)}</td>
                <td className="mono" onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", padding: "8px 6px", maxWidth: 110, wordBreak: "break-word" }}>{assetCode(c.asset_id)}</td>
                <td onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", whiteSpace: "nowrap", padding: "8px 6px" }}>{c.contract_type.replace("_", " ")}</td>
                <td onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", whiteSpace: "nowrap", padding: "8px 6px" }}>₹{c.rate.toLocaleString()} / {c.billing_unit}</td>
                <td onClick={() => setSelectedContract(c)} style={{ cursor: "pointer", padding: "8px 6px" }}>
                  <span className="status-chip" style={{ background: `${statusColors[c.status] ?? "var(--text-muted)"}18`, color: statusColors[c.status] ?? "var(--text-muted)", border: `1px solid ${statusColors[c.status] ?? "var(--text-muted)"}40`, whiteSpace: "nowrap", fontSize: 11 }}>{c.status}</span>
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap" }}>
                    {hasPermission("rentals.write") && (
                      <>
                        <button className="btn" title="Edit contract" style={{ padding: "5px 7px", minWidth: 30, fontSize: 12 }} onClick={() => { setEditingId(c.id); setShowForm(true); }}>✎</button>
                        <button className="btn" title="Delete contract" style={{ padding: "5px 7px", minWidth: 30, fontSize: 12 }} onClick={() => deleteContract(c.id)}>🗑</button>
                        {c.status === "active" && (
                          <>
                            <button className="btn" title="Complete contract" style={{ padding: "5px 7px", minWidth: 30, fontSize: 12 }} onClick={() => completeContract(c)}>✓</button>
                            <button className="btn" title="Cancel contract" style={{ padding: "5px 7px", minWidth: 30, fontSize: 12 }} onClick={() => cancelContract(c.id)}>✕</button>
                          </>
                        )}
                        {c.status === "completed" && (
                          <button className="btn" title="Continue contract" style={{ padding: "5px 7px", minWidth: 30, fontSize: 12 }} onClick={() => reopenContract(c)}>↺</button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No contracts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedContract && (
        <>
          <div onClick={() => setSelectedContract(null)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.38)", zIndex: 40 }} />
          <div role="dialog" aria-modal="true" style={{ position: "fixed", top: 24, right: 24, bottom: 24, width: "min(520px, calc(100vw - 32px))", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)", zIndex: 41, padding: 20, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contract overview</div>
                <h2 style={{ margin: "6px 0 0", fontSize: 20 }}>{selectedContract.contract_number}</h2>
              </div>
              <button className="btn" onClick={() => setSelectedContract(null)}>Close</button>
            </div>

            <div className="summary-grid" style={{ marginBottom: 18 }}>
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Rate</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>₹{selectedContract.rate.toLocaleString()} / {selectedContract.billing_unit}</div>
              </div>
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Diesel</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedContract.diesel_included ? "Included" : "Excluded"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Customer</div><div style={{ marginTop: 6, fontWeight: 700 }}>{customerName(selectedContract.customer_id)}</div></div>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Machine</div><div style={{ marginTop: 6, fontWeight: 700 }}>{assetCode(selectedContract.asset_id)}</div></div>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Type</div><div style={{ marginTop: 6, fontWeight: 700 }}>{selectedContract.contract_type.replace("_", " ")}</div></div>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Start</div><div style={{ marginTop: 6, fontWeight: 700 }}>{selectedContract.start_date}</div></div>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>End</div><div style={{ marginTop: 6, fontWeight: 700 }}>{selectedContract.end_date || "—"}</div></div>
              <div className="panel" style={{ padding: 12 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</div><div style={{ marginTop: 6, fontWeight: 700 }}>{selectedContract.status}</div></div>
            </div>

            <div className="panel" style={{ padding: 14, marginTop: 18 }}>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Notes</h3>
              <div style={{ color: "var(--text-soft)" }}>{selectedContract.notes || "No notes added."}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContractForm({ customers, assets, existing, onSyncContract, onSaved, onCancel }: { customers: Customer[]; assets: Asset[]; existing: RentalContract | null; onSyncContract: (contract: RentalContract) => Promise<void>; onSaved: () => void; onCancel: () => void }) {
  const [customerId, setCustomerId] = useState(existing?.customer_id ?? customers[0]?.id ?? "");
  const [assetId, setAssetId] = useState(existing?.asset_id ?? assets[0]?.id ?? "");
  const [contractType, setContractType] = useState(existing?.contract_type ?? "hourly");
  const [billingUnit, setBillingUnit] = useState(existing?.billing_unit ?? "hour");
  const [rate, setRate] = useState(existing?.rate ? String(existing.rate) : "");
  const [dieselIncluded, setDieselIncluded] = useState(existing?.diesel_included ?? true);
  const [startDate, setStartDate] = useState(existing?.start_date ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(existing?.end_date ?? "");
  const [discount, setDiscount] = useState(existing?.discount_amount ? String(existing.discount_amount) : "0");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  async function submit() {
    if (saving) return;

    setSaving(true);
    setError(null);

    const payload = {
      customer_id: customerId,
      asset_id: assetId,
      contract_type: contractType,
      billing_unit: billingUnit,
      rate: Number(rate),
      start_date: startDate,
      end_date: endDate || null,
      diesel_included: dieselIncluded,
      discount_amount: Number(discount || 0),
      notes: notes.trim() || null,
      status: existing?.status ?? "active",
      contract_number: existing?.contract_number ?? `RC-${Date.now().toString().slice(-6)}`,
    };

    const { data: savedContract, error } = existing
      ? await supabase.from("rental_contracts").update(payload).eq("id", existing.id).select().single()
      : await supabase.from("rental_contracts").insert(payload).select().single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (savedContract && (savedContract.status === "active" || savedContract.status === "completed" || savedContract.status === "suspended")) {
      await onSyncContract(savedContract as RentalContract);
      await supabase.from("assets").update({
        status: savedContract.status === "completed" ? "available" : "on_rent",
      }).eq("id", savedContract.asset_id);
    }

    setSuccessMessage(existing ? "Rental updated successfully." : "Rental created successfully.");
    window.setTimeout(() => onSaved(), 250);
  }

  if (!assets.length) {
    return <div className="panel" style={{ padding: 20, marginBottom: 20, color: "var(--text-muted)" }}>No available assets to rent out right now.</div>;
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div className="message-banner error">{error}</div>}
      {successMessage && <div className="message-banner success">{successMessage}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <div className="field-group">
          <label className="field">Customer</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Machine</label>
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Contract type</label>
          <select className="input" value={contractType} onChange={(e) => setContractType(e.target.value)}>
            {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Billing unit</label>
          <select className="input" value={billingUnit} onChange={(e) => setBillingUnit(e.target.value)}>
            {BILLING_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Rate</label>
          <input className="input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Discount</label>
          <input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Diesel</label>
          <select className="input" value={dieselIncluded ? "included" : "excluded"} onChange={(e) => setDieselIncluded(e.target.value === "included")}>
            <option value="included">Included in rate</option>
            <option value="excluded">Not included (customer arranges/pays)</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field">Start date</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">End date (optional)</label>
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="field-group" style={{ gridColumn: "1 / -1" }}>
          <label className="field">Notes</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contract notes, service terms, extra conditions, discount details..." />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !rate || !customerId || !assetId}>
          {saving ? "Saving…" : existing ? "Update contract" : "Create contract"}
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
