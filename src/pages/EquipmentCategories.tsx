import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { CustomFieldDef, EquipmentCategory } from "../types";
import { useAuth } from "../lib/AuthContext";

const BILLING_UNITS = ["hour", "day", "week", "month", "shift", "km", "cycle", "quantity", "fixed", "custom"];
const METER_TYPES = ["engine_hours", "operating_hours", "kilometres", "cycles", "days", "units_produced", "custom"];
const FIELD_TYPES = ["text", "number", "date", "boolean", "select"];

export default function EquipmentCategories() {
  const { hasPermission } = useAuth();
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EquipmentCategory | null>(null);

  async function load() {
    const { data } = await supabase.from("equipment_categories").select("*").order("name");
    setCategories((data ?? []) as EquipmentCategory[]);
  }

  async function deleteCategory(id: string) {
    if (!window.confirm("Delete this equipment category?")) return;
    const { error } = await supabase.from("equipment_categories").delete().eq("id", id);
    if (!error) load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 22 }}>Equipment categories</h1>
        {hasPermission("equipment.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add category"}
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Define your own equipment types — nothing here is hard-coded. Each category can have its
        own custom fields (e.g. bucket capacity, KVA rating) that show up when adding a machine.
      </p>

      {showForm && <CategoryForm onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <CategoryForm category={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {categories.map((c) => (
          <div key={c.id} className="panel" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {c.default_meter_type.replace("_", " ")} · billed per {c.default_billing_unit}
            </div>
            {c.custom_fields_schema && c.custom_fields_schema.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {c.custom_fields_schema.map((f) => (
                  <span key={f.key} className="mono" style={{ fontSize: 11, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 3, padding: "2px 6px" }}>
                    {f.label}
                  </span>
                ))}
              </div>
            )}
            {hasPermission("equipment.write") && (
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button className="btn" style={{ padding: "4px 8px" }} onClick={() => setEditing(c)}>Edit</button>
                <button className="btn" style={{ padding: "4px 8px" }} onClick={() => deleteCategory(c.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && <p style={{ color: "var(--text-muted)" }}>No categories yet.</p>}
      </div>
    </div>
  );
}

function CategoryForm({ category, onSaved, onCancel }: { category?: EquipmentCategory; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [meterType, setMeterType] = useState(category?.default_meter_type ?? "engine_hours");
  const [billingUnit, setBillingUnit] = useState(category?.default_billing_unit ?? "day");
  const [fields, setFields] = useState<CustomFieldDef[]>(category?.custom_fields_schema ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  function addField() {
    setFields((f) => [...f, { key: "", label: "", type: "text" }]);
  }
  function updateField(i: number, patch: Partial<CustomFieldDef>) {
    setFields((f) => f.map((field, idx) => (idx === i ? { ...field, ...patch } : field)));
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const cleanFields = fields
      .filter((f) => f.label)
      .map((f) => ({ ...f, key: f.key || f.label.toLowerCase().replace(/\s+/g, "_") }));

    const payload = {
      name,
      default_meter_type: meterType,
      default_billing_unit: billingUnit,
      custom_fields_schema: cleanFields.length ? cleanFields : null,
    };

    const { error } = category
      ? await supabase.from("equipment_categories").update(payload).eq("id", category.id)
      : await supabase.from("equipment_categories").insert(payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccessMessage(category ? "Category updated successfully." : "Category created successfully.");
    window.setTimeout(() => onSaved(), 250);
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div className="message-banner error">{error}</div>}
      {successMessage && <div className="message-banner success">{successMessage}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 8 }}>
        <div className="field-group">
          <label className="field">Category name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backhoe Loader" />
        </div>
        <div className="field-group">
          <label className="field">Meter type</label>
          <select className="input" value={meterType} onChange={(e) => setMeterType(e.target.value)}>
            {METER_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Default billing unit</label>
          <select className="input" value={billingUnit} onChange={(e) => setBillingUnit(e.target.value)}>
            {BILLING_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <label className="field">Custom fields for this category</label>
      {fields.map((f, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 32px", gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Field label (e.g. Bucket Capacity)" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
          <select className="input" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as CustomFieldDef["type"] })}>
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span />
          <button className="btn" onClick={() => removeField(i)} style={{ padding: "6px 8px" }}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={addField} style={{ marginBottom: 16 }}>+ Add field</button>

      <div>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !name}>
          {saving ? "Saving…" : category ? "Update category" : "Save category"}
        </button>
        {onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
      </div>
    </div>
  );
}
