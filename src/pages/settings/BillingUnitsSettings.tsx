import { useEffect, useState } from "react";
import { getSetting, upsertSetting } from "../../lib/settingsApi";

const ALL_UNITS = ["hour", "day", "week", "month", "shift", "km", "cycle", "quantity", "fixed"];

interface BillingConfig {
  enabled_units: string[];
  min_billable_hours: number;
  grace_period_minutes: number;
  overtime_multiplier: number;
  default_tax_rate_pct: number;
}

const DEFAULT_CONFIG: BillingConfig = {
  enabled_units: ["hour", "day", "week", "month"],
  min_billable_hours: 4,
  grace_period_minutes: 15,
  overtime_multiplier: 1.5,
  default_tax_rate_pct: 18,
};

export default function BillingUnitsSettings() {
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting("billing_units", "config", DEFAULT_CONFIG).then(setConfig);
  }, []);

  function toggleUnit(unit: string) {
    setConfig((c) => ({
      ...c,
      enabled_units: c.enabled_units.includes(unit) ? c.enabled_units.filter((u) => u !== unit) : [...c.enabled_units, unit],
    }));
  }

  async function save() {
    setSaving(true);
    await upsertSetting("billing_units", "config", config as unknown as Record<string, unknown>);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Billing units & tax</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Controls which billing units show up when creating a rental contract, and the default
        rules applied across all contracts.
      </p>

      <div className="panel" style={{ padding: 20, maxWidth: 500 }}>
        <label className="field">Enabled billing units</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {ALL_UNITS.map((u) => (
            <button
              key={u}
              onClick={() => toggleUnit(u)}
              className="btn"
              style={{
                background: config.enabled_units.includes(u) ? "var(--amber)" : "var(--paper-raised)",
                borderColor: config.enabled_units.includes(u) ? "var(--amber)" : "var(--line)",
              }}
            >
              {u}
            </button>
          ))}
        </div>

        <div className="field-group">
          <label className="field">Minimum billable hours (hourly contracts)</label>
          <input className="input" type="number" value={config.min_billable_hours} onChange={(e) => setConfig({ ...config, min_billable_hours: Number(e.target.value) })} />
        </div>
        <div className="field-group">
          <label className="field">Grace period (minutes)</label>
          <input className="input" type="number" value={config.grace_period_minutes} onChange={(e) => setConfig({ ...config, grace_period_minutes: Number(e.target.value) })} />
        </div>
        <div className="field-group">
          <label className="field">Overtime multiplier</label>
          <input className="input" type="number" step="0.1" value={config.overtime_multiplier} onChange={(e) => setConfig({ ...config, overtime_multiplier: Number(e.target.value) })} />
        </div>
        <div className="field-group">
          <label className="field">Default tax rate (%)</label>
          <input className="input" type="number" value={config.default_tax_rate_pct} onChange={(e) => setConfig({ ...config, default_tax_rate_pct: Number(e.target.value) })} />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
