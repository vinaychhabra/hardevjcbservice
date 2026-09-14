import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Asset, EquipmentCategory } from "../types";
import { useAuth } from "../lib/AuthContext";

const STATUSES = [
  "available", "reserved", "quoted_held", "dispatched", "on_rent", "on_site",
  "returning", "inspection", "breakdown", "lost_missing", "sold", "inactive",
];

export default function Assets() {
  const { hasPermission } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [usageHoursByAsset, setUsageHoursByAsset] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [serviceModal, setServiceModal] = useState<Asset | null>(null);
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceCost, setServiceCost] = useState("0");
  const [serviceVendor, setServiceVendor] = useState("");
  const [serviceParts, setServiceParts] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceError, setServiceError] = useState<string | null>(null);

  async function load() {
    const [{ data: a }, { data: c }, { data: usage }] = await Promise.all([
      supabase.from("assets").select("*").eq("is_active", true).order("internal_code"),
      supabase.from("equipment_categories").select("*"),
      supabase.from("daily_entries").select("asset_id, hours_worked").not("hours_worked", "is", null),
    ]);
    setAssets((a ?? []) as Asset[]);
    setCategories((c ?? []) as EquipmentCategory[]);
    setUsageHoursByAsset((usage ?? []).reduce((acc: Record<string, number>, entry: any) => {
      const hours = Number(entry.hours_worked ?? 0);
      if (!hours) return acc;
      acc[entry.asset_id] = (acc[entry.asset_id] ?? 0) + hours;
      return acc;
    }, {}));
  }

  const getAssetRunningHours = (asset: Asset) => usageHoursByAsset[asset.id] ?? Number(asset.current_meter_reading ?? 0);

  const serviceDueLabel = (asset: Asset) => {
    const serviceHours = Number(asset.last_service_hours ?? 0);
    const currentHours = getAssetRunningHours(asset);
    const interval = Number(asset.next_service_due_hours ?? 500);
    const dueHours = Math.max(0, currentHours - serviceHours);

    if (dueHours >= interval) return `Due now (${dueHours.toFixed(1)}h since service)`;
    if (dueHours >= interval - 50) return `Due soon (${(interval - dueHours).toFixed(1)}h left)`;
    return `${(interval - dueHours).toFixed(1)}h to next service`;
  };

  const getServiceSeverity = (asset: Asset) => {
    const serviceHours = Number(asset.last_service_hours ?? 0);
    const currentHours = getAssetRunningHours(asset);
    const interval = Number(asset.next_service_due_hours ?? 500);
    const dueHours = Math.max(0, currentHours - serviceHours);

    if (dueHours >= interval) return { label: "Due", color: "var(--danger)" };
    if (dueHours >= interval - 50) return { label: "Soon", color: "var(--warning)" };
    return { label: "OK", color: "var(--success)" };
  };

  async function markServiceDone(asset: Asset) {
    setServiceModal(asset);
    setServiceDate(new Date().toISOString().slice(0, 10));
    setServiceCost("0");
    setServiceVendor("");
    setServiceParts("");
    setServiceNotes("");
    setServiceError(null);
  }

  async function saveServiceRecord() {
    if (!serviceModal) return;
    const dateValue = serviceDate || new Date().toISOString().slice(0, 10);
    const currentHours = usageHoursByAsset[serviceModal.id] ?? Number(serviceModal.current_meter_reading ?? 0);
    const nextInterval = Number(serviceModal.next_service_due_hours ?? 500);
    const totalCost = Number(serviceCost || 0);
    const description = [
      serviceParts ? `Parts/components changed: ${serviceParts}` : null,
      serviceNotes ? `Notes: ${serviceNotes}` : null,
      `Service completed on ${dateValue}.`,
    ].filter(Boolean).join(" | ");

    const [{ error: maintenanceError }, { error: expenseError }] = await Promise.all([
      supabase.from("maintenance_records").insert({
        asset_id: serviceModal.id,
        maintenance_date: dateValue,
        type: "service",
        meter_reading: currentHours,
        cost: totalCost,
        vendor: serviceVendor || null,
        description,
        next_due_date: null,
        next_due_meter: currentHours + nextInterval,
      }),
      supabase.from("expenses").insert({
        expense_date: dateValue,
        category: "repair",
        asset_id: serviceModal.id,
        vendor: serviceVendor || null,
        amount: totalCost,
        payment_method: "cash",
        notes: description,
      })
    ]);

    if (maintenanceError || expenseError) {
      setServiceError(maintenanceError?.message ?? expenseError?.message ?? "Unable to save service record.");
      return;
    }

    const { error } = await supabase.from("assets").update({
      last_service_date: dateValue,
      last_service_hours: currentHours,
      last_service_notes: description,
    }).eq("id", serviceModal.id);

    if (error) {
      setServiceError(error.message);
      return;
    }

    setServiceModal(null);
    setServiceError(null);
    load();
  }

  async function deleteAsset(id: string) {
    if (!window.confirm("Delete this machine? This will archive it instead of removing historical records.")) return;
    const { error } = await supabase.from("assets").update({ is_active: false, status: "inactive" }).eq("id", id);
    if (!error) load();
    else window.alert(`Delete failed: ${error.message}`);
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
      {editing && <AssetForm categories={categories} asset={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      {serviceModal && (
        <>
          <div onClick={() => setServiceModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)", zIndex: 30 }} />
          <div role="dialog" aria-modal="true" style={{ position: "fixed", top: 40, left: "50%", transform: "translateX(-50%)", width: "min(560px, calc(100vw - 32px))", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)", zIndex: 31, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Machine service</div>
                <h3 style={{ margin: "6px 0 0" }}>{serviceModal.internal_code}</h3>
              </div>
              <button className="btn" onClick={() => setServiceModal(null)}>Close</button>
            </div>
            {serviceError && <div style={{ color: "var(--red)", marginBottom: 12 }}>{serviceError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div className="field-group">
                <label className="field">Service date</label>
                <input className="input" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field">Service cost</label>
                <input className="input" type="number" value={serviceCost} onChange={(e) => setServiceCost(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field">Workshop / vendor</label>
                <input className="input" value={serviceVendor} onChange={(e) => setServiceVendor(e.target.value)} placeholder="Workshop / vendor" />
              </div>
              <div className="field-group" style={{ gridColumn: "1 / -1" }}>
                <label className="field">Parts / components changed</label>
                <textarea className="input" rows={3} value={serviceParts} onChange={(e) => setServiceParts(e.target.value)} placeholder="Oil filter, hydraulic hoses, bucket teeth, etc." />
              </div>
              <div className="field-group" style={{ gridColumn: "1 / -1" }}>
                <label className="field">Maintenance notes</label>
                <textarea className="input" rows={3} value={serviceNotes} onChange={(e) => setServiceNotes(e.target.value)} placeholder="Service summary, issues found, next recommendations..." />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={saveServiceRecord}>Save service & expense</button>
              <button className="btn" onClick={() => setServiceModal(null)}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Category</th><th>Manufacturer / model</th><th>Meter</th><th>Insurance / RC</th><th>Service</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.internal_code}</td>
                <td>{categoryName(a.category_id)}</td>
                <td>{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                <td className="mono">{a.current_meter_reading} {a.meter_type.replace("_", " ")}</td>
                <td>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <div><strong>Ins:</strong> {a.insurance_policy_number || "—"}</div>
                    <div><strong>RC:</strong> {a.registration_certificate_number || "—"}</div>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 12, lineHeight: 1.5, display: "grid", gap: 4 }}>
                    <div>{a.last_service_date ? `Last: ${a.last_service_date}` : "No service logged"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{serviceDueLabel(a)}</span>
                      <span className="status-chip" style={{ background: `${getServiceSeverity(a).color}18`, color: getServiceSeverity(a).color, border: `1px solid ${getServiceSeverity(a).color}40`, fontSize: 10, padding: "2px 6px" }}>
                        {getServiceSeverity(a).label}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`status-chip status-${a.status}`}>{a.status.replace("_", " ")}</span>
                  {hasPermission("equipment.write") && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditing(a)}>Edit</button>
                      <button className="btn" style={{ padding: "3px 7px" }} onClick={() => markServiceDone(a)}>Service done</button>
                      <button className="btn" style={{ padding: "3px 7px" }} onClick={() => deleteAsset(a.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No machines yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetForm({ categories, asset, onSaved, onCancel }: { categories: EquipmentCategory[]; asset?: Asset; onSaved: () => void; onCancel?: () => void }) {
  const [categoryId, setCategoryId] = useState(asset?.category_id ?? categories[0]?.id ?? "");
  const [internalCode, setInternalCode] = useState(asset?.internal_code ?? "");
  const [manufacturer, setManufacturer] = useState(asset?.manufacturer ?? "");
  const [model, setModel] = useState(asset?.model ?? "");
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState(asset?.insurance_policy_number ?? "");
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState(asset?.insurance_expiry_date ?? "");
  const [registrationCertificateNumber, setRegistrationCertificateNumber] = useState(asset?.registration_certificate_number ?? "");
  const [registrationCertificateExpiryDate, setRegistrationCertificateExpiryDate] = useState(asset?.registration_certificate_expiry_date ?? "");
  const [lastServiceDate, setLastServiceDate] = useState(asset?.last_service_date ?? "");
  const [lastServiceHours, setLastServiceHours] = useState(asset?.last_service_hours ? String(asset.last_service_hours) : "0");
  const [nextServiceDueHours, setNextServiceDueHours] = useState(asset?.next_service_due_hours ? String(asset.next_service_due_hours) : "500");
  const [lastServiceNotes, setLastServiceNotes] = useState(asset?.last_service_notes ?? "");
  const [customFields, setCustomFields] = useState<Record<string, string>>(() => {
    const initial = asset?.custom_fields ?? {};
    return Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value ?? "")]));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId);

  async function submit() {
    setSaving(true);
    setError(null);
    const payload = {
      category_id: categoryId,
      internal_code: internalCode,
      manufacturer: manufacturer || null,
      model: model || null,
      insurance_policy_number: insurancePolicyNumber || null,
      insurance_expiry_date: insuranceExpiryDate || null,
      registration_certificate_number: registrationCertificateNumber || null,
      registration_certificate_expiry_date: registrationCertificateExpiryDate || null,
      last_service_date: lastServiceDate || null,
      last_service_hours: Number(lastServiceHours || 0),
      next_service_due_hours: Number(nextServiceDueHours || 500),
      last_service_notes: lastServiceNotes || null,
      meter_type: category?.default_meter_type ?? asset?.meter_type ?? "engine_hours",
      status: asset?.status ?? "available",
      custom_fields: Object.keys(customFields).length ? customFields : null,
    };

    const { error } = asset
      ? await supabase.from("assets").update(payload).eq("id", asset.id)
      : await supabase.from("assets").insert({ ...payload, status: "available" });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
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
        <div className="field-group">
          <label className="field">Manufacturer</label>
          <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Model</label>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 8 }}>
        <div className="field-group">
          <label className="field">Insurance policy no.</label>
          <input className="input" value={insurancePolicyNumber} onChange={(e) => setInsurancePolicyNumber(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Insurance expiry</label>
          <input className="input" type="date" value={insuranceExpiryDate} onChange={(e) => setInsuranceExpiryDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">RC number</label>
          <input className="input" value={registrationCertificateNumber} onChange={(e) => setRegistrationCertificateNumber(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">RC expiry</label>
          <input className="input" type="date" value={registrationCertificateExpiryDate} onChange={(e) => setRegistrationCertificateExpiryDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 8 }}>
        <div className="field-group">
          <label className="field">Last service date</label>
          <input className="input" type="date" value={lastServiceDate} onChange={(e) => setLastServiceDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Last service hours</label>
          <input className="input" type="number" value={lastServiceHours} onChange={(e) => setLastServiceHours(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Next service due at</label>
          <input className="input" type="number" value={nextServiceDueHours} onChange={(e) => setNextServiceDueHours(e.target.value)} />
        </div>
      </div>

      <div className="field-group" style={{ marginTop: 8 }}>
        <label className="field">Service notes</label>
        <textarea className="input" rows={2} value={lastServiceNotes} onChange={(e) => setLastServiceNotes(e.target.value)} placeholder="Service details, oil change, tyre replacement, etc." />
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
        {saving ? "Saving…" : asset ? "Update machine" : "Save machine"}
      </button>
      {onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
