import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, EquipmentCategory } from "../types";
import { useAuth } from "../lib/AuthContext";

const STATUSES = [
  "available", "reserved", "quoted_held", "dispatched", "on_rent", "on_site",
  "returning", "inspection", "maintenance", "breakdown", "lost_missing", "sold", "inactive",
];

export default function Assets() {
  const { hasPermission } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from("assets").select("*").order("internal_code"),
      supabase.from("equipment_categories").select("*"),
    ]);
    setAssets((a ?? []) as Asset[]);
    setCategories((c ?? []) as EquipmentCategory[]);
  }

  useEffect(() => { load(); }, []);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Machines</h1>
        {hasPermission("equipment.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={categories.length === 0}>
            {showForm ? "Cancel" : "Add machine"}
          </button>
        )}
      </div>
      {categories.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
          Create an equipment category first, then add machines against it.
        </p>
      )}

      {showForm && <AssetForm categories={categories} onSaved={() => { setShowForm(false); load(); }} />}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Category</th><th>Manufacturer / model</th><th>Meter reading</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.internal_code}</td>
                <td>{categoryName(a.category_id)}</td>
                <td>{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                <td className="mono">{a.current_meter_reading} {a.meter_type.replace("_", " ")}</td>
                <td><span className={`status-chip status-${a.status}`}>{a.status.replace("_", " ")}</span></td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No machines yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetForm({ categories, onSaved }: { categories: EquipmentCategory[]; onSaved: () => void }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [internalCode, setInternalCode] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId);

  async function submit() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("assets").insert({
      category_id: categoryId,
      internal_code: internalCode,
      manufacturer: manufacturer || null,
      model: model || null,
      meter_type: category?.default_meter_type ?? "engine_hours",
      status: "available",
      custom_fields: Object.keys(customFields).length ? customFields : null,
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Category</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Internal code / machine ID</label>
          <input className="input" value={internalCode} onChange={(e) => setInternalCode(e.target.value)} />
        </div>
        <div />
        <div className="field-group">
          <label className="field">Manufacturer</label>
          <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Model</label>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>

      {category?.custom_fields_schema && category.custom_fields_schema.length > 0 && (
        <>
          <label className="field" style={{ marginTop: 8 }}>{category.name} details</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 8 }}>
            {category.custom_fields_schema.map((f) => (
              <div className="field-group" key={f.key}>
                <label className="field">{f.label}</label>
                <input
                  className="input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={customFields[f.key] ?? ""}
                  onChange={(e) => setCustomFields((cf) => ({ ...cf, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn btn-primary" onClick={submit} disabled={saving || !internalCode || !categoryId}>
        {saving ? "Saving…" : "Save machine"}
      </button>
    </div>
  );
}
