import { useEffect, useState } from "react";
import { getSetting, upsertSetting } from "../../lib/settingsApi";

interface EmployeePayrollSettingsConfig {
  roles: string[];
  default_salary_frequency: string;
  default_salary_amount: number;
}

const DEFAULT_CONFIG: EmployeePayrollSettingsConfig = {
  roles: ["Driver", "Operator", "Helper", "Supervisor", "Mechanic", "Accountant"],
  default_salary_frequency: "monthly",
  default_salary_amount: 0,
};

export default function EmployeePayrollSettings() {
  const [config, setConfig] = useState<EmployeePayrollSettingsConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting<EmployeePayrollSettingsConfig>("employee_roles", "config", DEFAULT_CONFIG).then((data) => {
      setConfig({ ...DEFAULT_CONFIG, ...data, roles: Array.isArray(data.roles) ? data.roles : DEFAULT_CONFIG.roles });
    });
  }, []);

  function updateRoles(raw: string) {
    const next = raw
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    setConfig((prev) => ({ ...prev, roles: next.length ? next : DEFAULT_CONFIG.roles }));
  }

  async function save() {
    setSaving(true);
    await upsertSetting("employee_roles", "config", config as unknown as Record<string, unknown>);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Employee payroll</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Configure staff roles, the default payroll cycle, and the default salary values used in the employee screen.
      </p>

      <div className="panel" style={{ padding: 20, maxWidth: 620 }}>
        <label className="field">Roles</label>
        <textarea
          className="input"
          rows={4}
          value={config.roles.join(", ")}
          onChange={(e) => updateRoles(e.target.value)}
          placeholder="Driver, Operator, Helper, Supervisor"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          <div className="field-group">
            <label className="field">Default salary frequency</label>
            <select
              className="input"
              value={config.default_salary_frequency}
              onChange={(e) => setConfig({ ...config, default_salary_frequency: e.target.value })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="field-group">
            <label className="field">Default salary amount</label>
            <input
              className="input"
              type="number"
              value={config.default_salary_amount}
              onChange={(e) => setConfig({ ...config, default_salary_amount: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 18 }}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
