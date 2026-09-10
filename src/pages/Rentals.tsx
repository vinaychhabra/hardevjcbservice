import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, Customer, RentalContract } from "../types";
import { useAuth } from "../lib/AuthContext";

const CONTRACT_TYPES = ["hourly", "fixed_daily", "fixed_monthly"];
const BILLING_UNITS = ["hour", "day", "month"];

export default function Rentals() {
  const { hasPermission } = useAuth();
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [{ data: rc }, { data: cu }, { data: as }] = await Promise.all([
      supabase.from("rental_contracts").select("*").order("start_date", { ascending: false }),
      supabase.from("customers").select("*"),
      supabase.from("assets").select("*"),
    ]);
    setContracts((rc ?? []) as RentalContract[]);
    setCustomers((cu ?? []) as Customer[]);
    setAssets((as ?? []) as Asset[]);
  }

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const assetCode = (id: string) => assets.find((a) => a.id === id)?.internal_code ?? "—";

  async function completeContract(id: string) {
    await supabase.from("rental_contracts").update({ status: "completed" }).eq("id", id);
    load();
  }
  async function cancelContract(id: string) {
    await supabase.from("rental_contracts").update({ status: "cancelled" }).eq("id", id);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Formal contracts</h1><p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Optional: use this for customers who require a written rental agreement. For normal jobs, use Sales.</p></div>
        {hasPermission("rentals.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!customers.length || !assets.length}>
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
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Contract #</th><th>Customer</th><th>Machine</th><th>Type</th><th>Rate</th><th>Diesel</th><th>Start</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.contract_number}</td>
                <td>{customerName(c.customer_id)}</td>
                <td className="mono">{assetCode(c.asset_id)}</td>
                <td>{c.contract_type.replace("_", " ")}</td>
                <td>₹{c.rate.toLocaleString()} / {c.billing_unit}</td>
                <td>{c.diesel_included ? "Included" : "Excluded"}</td>
                <td>{c.start_date}</td>
                <td><span className={`status-chip status-${c.status === "active" ? "on_rent" : c.status}`}>{c.status}</span></td>
                <td>
                  {c.status === "active" && hasPermission("rentals.write") && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => completeContract(c.id)}>Complete</button>
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => cancelContract(c.id)}>Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr><td colSpan={9} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No contracts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractForm({ customers, assets, onSaved }: { customers: Customer[]; assets: Asset[]; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [contractType, setContractType] = useState("hourly");
  const [billingUnit, setBillingUnit] = useState("hour");
  const [rate, setRate] = useState("");
  const [dieselIncluded, setDieselIncluded] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("rental_contracts").insert({
      contract_number: `RC-${Date.now().toString().slice(-6)}`,
      customer_id: customerId,
      asset_id: assetId,
      contract_type: contractType,
      billing_unit: billingUnit,
      rate: Number(rate),
      start_date: startDate,
      end_date: endDate || null,
      diesel_included: dieselIncluded,
      status: "active",
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  if (!assets.length) {
    return <div className="panel" style={{ padding: 20, marginBottom: 20, color: "var(--text-muted)" }}>No available assets to rent out right now.</div>;
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !rate || !customerId || !assetId}>
        {saving ? "Saving…" : "Create contract"}
      </button>
    </div>
  );
}
