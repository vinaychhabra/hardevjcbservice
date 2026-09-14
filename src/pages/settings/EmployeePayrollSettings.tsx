import { useEffect, useState } from "react";
import { getSetting, upsertSetting } from "../../lib/settingsApi";

interface EmployeePayrollSettingsConfig {
  roles: string[];
  default_salary_frequency: string;
  default_salary_amount: number;
  default_salary_day: number;
  salary_grace_days: number;
  reminder_enabled: boolean;
}

const DEFAULT_CONFIG: EmployeePayrollSettingsConfig = {
  roles: ["Driver", "Operator", "Helper", "Supervisor", "Mechanic", "Accountant"],
  default_salary_frequency: "monthly",
  default_salary_amount: 0,
  default_salary_day: 7,
  salary_grace_days: 2,
  reminder_enabled: true,
};

export default function EmployeePayrollSettings() {
  const [config, setConfig] = useState<EmployeePayrollSettingsConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSetting<EmployeePayrollSettingsConfig>("employee_roles", "config", DEFAULT_CONFIG).then((data) => {
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        roles: Array.isArray(data.roles) ? data.roles : DEFAULT_CONFIG.roles,
      });
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
    setError(null);
    const result = await upsertSetting("employee_roles", "config", config as unknown as Record<string, unknown>);
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Employee payroll</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Configure staff roles, the payroll cycle, salary day, and reminders so your team is paid on time without manual chasing.
      </p>

      <div className="panel" style={{ padding: 20, maxWidth: 760 }}>
        <label className="field">Roles</label>
        <textarea
          className="input"
          rows={4}
          value={config.roles.join(", ")}
          onChange={(e) => updateRoles(e.target.value)}
          placeholder="Driver, Operator, Helper, Supervisor"
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14, marginTop: 16 }}>
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
            <label className="field">Default salary day</label>
            <input
              className="input"
              type="number"
              min={1}
              max={31}
              value={config.default_salary_day}
              onChange={(e) => setConfig({ ...config, default_salary_day: Number(e.target.value) || 1 })}
            />
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

          <div className="field-group">
            <label className="field">Grace period (days)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={config.salary_grace_days}
              onChange={(e) => setConfig({ ...config, salary_grace_days: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="field-group" style={{ marginTop: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={config.reminder_enabled}
              onChange={(e) => setConfig({ ...config, reminder_enabled: e.target.checked })}
            />
            Enable salary alerts and reminders
          </label>
        </div>

        {error && <div style={{ color: "var(--danger)", marginTop: 16, fontSize: 13 }}>{error}</div>}

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 18 }}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
