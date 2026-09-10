import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, MaintenanceRecord } from "../types";
import { useAuth } from "../lib/AuthContext";
import { openFinanceAttachment, uploadFinanceAttachment } from "../lib/attachments";

const TYPES = ["service", "repair", "tyre", "breakdown", "inspection"];

export default function Maintenance() {
  const { hasPermission } = useAuth();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assetFilter, setAssetFilter] = useState("");

  async function load() {
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("maintenance_records").select("*").order("maintenance_date", { ascending: false }),
      supabase.from("assets").select("*"),
    ]);
    setRecords((r ?? []) as MaintenanceRecord[]);
    setAssets((a ?? []) as Asset[]);
  }

  useEffect(() => { load(); }, []);

  const assetCode = (id: string) => assets.find((a) => a.id === id)?.internal_code ?? "—";
  const filteredRecords = records.filter((record) =>
    (!fromDate || record.maintenance_date >= fromDate) &&
    (!toDate || record.maintenance_date <= toDate) &&
    (!assetFilter || record.asset_id === assetFilter)
  );
  const upcoming = records.filter((r) => r.next_due_date && r.next_due_date <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Maintenance</h1>
        {hasPermission("maintenance.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!assets.length}>
            {showForm ? "Cancel" : "Log maintenance"}
          </button>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="panel" style={{ padding: 14, marginBottom: 20, borderColor: "var(--amber)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Due within 14 days</div>
          {upcoming.map((r) => (
            <div key={r.id} style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {assetCode(r.asset_id)} — {r.type.replace("_", " ")} due {r.next_due_date}
            </div>
          ))}
        </div>
      )}

      {showForm && <MaintenanceForm assets={assets} onSaved={() => { setShowForm(false); load(); }} />}

      <div className="panel" style={{ padding: 14, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}><div><label className="field">From</label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><label className="field">To</label><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div><div><label className="field">Excavator</label><select className="input" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}><option value="">All excavators</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}</select></div></div>

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Machine</th><th>Type</th><th>Meter</th><th>Cost</th><th>Vendor</th><th>Next due</th></tr></thead>
          <tbody>
            {filteredRecords.map((r) => (
              <tr key={r.id}>
                <td>{r.maintenance_date}</td>
                <td className="mono">{assetCode(r.asset_id)}</td>
                <td>{r.type.replace("_", " ")}</td>
                <td>{r.meter_reading ?? "—"}</td>
                <td>₹{r.cost.toLocaleString()}</td>
                <td>{r.vendor ?? "—"}</td>
                <td>{r.next_due_date ?? "—"} {r.receipt_url && <button className="btn" style={{ padding: "3px 7px", marginLeft: 6 }} onClick={() => openFinanceAttachment(r.receipt_url)}>Receipt</button>}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No maintenance records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenanceForm({ assets, onSaved }: { assets: Asset[]; onSaved: () => void }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("service");
  const [meter, setMeter] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [nextDueMeter, setNextDueMeter] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.from("maintenance_records").insert({
      asset_id: assetId, maintenance_date: date, type,
      meter_reading: meter ? Number(meter) : null,
      cost: Number(cost || 0), vendor: vendor || null, description: description || null,
      next_due_date: nextDueDate || null, next_due_meter: nextDueMeter ? Number(nextDueMeter) : null,
    }).select("id").single();
    if (error) { setSaving(false); setError(error.message); return; }
    if (receipt && data?.id) {
      try { const path = await uploadFinanceAttachment(receipt, "maintenance", data.id); await supabase.from("maintenance_records").update({ receipt_url: path }).eq("id", data.id); } catch (uploadError) { setSaving(false); setError((uploadError as Error).message); return; }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Excavator</label>
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.internal_code}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Meter reading (hours)</label>
          <input className="input" type="number" value={meter} onChange={(e) => setMeter(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Cost</label>
          <input className="input" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Vendor / mechanic</label>
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </div>
        <div className="field-group" style={{ gridColumn: "1 / -1" }}>
          <label className="field">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Next due date (optional)</label>
          <input className="input" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Next due at meter reading (optional)</label>
          <input className="input" type="number" value={nextDueMeter} onChange={(e) => setNextDueMeter(e.target.value)} />
        </div>
      </div>
      <div className="field-group"><label className="field">Receipt or bill photo</label><input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !assetId}>{saving ? "Saving…" : "Save record"}</button>
    </div>
  );
}
