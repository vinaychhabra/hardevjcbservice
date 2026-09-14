import { useEffect, useState } from "react";
import { getSetting, upsertSetting } from "../../lib/settingsApi";

interface Requirements { customer_phone: boolean; customer_address: boolean; sales_customer_name: boolean; sales_customer_phone: boolean }
const DEFAULTS: Requirements = { customer_phone: false, customer_address: false, sales_customer_name: false, sales_customer_phone: false };
const LABELS: Record<keyof Requirements, string> = { customer_phone: "Customer phone", customer_address: "Customer address", sales_customer_name: "Sales customer name", sales_customer_phone: "Sales customer phone" };

export default function FieldRequirementsSettings() {
  const [config, setConfig] = useState<Requirements>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getSetting("field_requirements", "config", DEFAULTS).then(setConfig); }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await upsertSetting("field_requirements", "config", config as unknown as Record<string, unknown>);
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Field requirements</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>Choose which contact fields admins must complete. All are optional by default.</p>
      <div className="panel" style={{ padding: 20, maxWidth: 560 }}>
        {(Object.keys(LABELS) as (keyof Requirements)[]).map((key) => (
          <label key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <span>{LABELS[key]}</span>
            <input type="checkbox" checked={config[key]} onChange={() => setConfig((current) => ({ ...current, [key]: !current[key] }))} />
          </label>
        ))}
        {error && <div style={{ color: "var(--danger)", marginTop: 16, fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 16 }}>
          {saving ? "Saving..." : saved ? "Saved" : "Save requirements"}
        </button>
      </div>
    </div>
  );
}
