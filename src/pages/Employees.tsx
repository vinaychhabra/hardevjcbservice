import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSetting } from "../lib/settingsApi";
import { useAuth } from "../lib/AuthContext";
import { Operator } from "../types";

const DEFAULT_EMPLOYEE_ROLES = ["Driver", "Operator", "Helper", "Supervisor", "Mechanic", "Accountant"];

export default function Employees() {
  const { hasPermission } = useAuth();
  const [employees, setEmployees] = useState<Operator[]>([]);
  const [roles, setRoles] = useState<string[]>(DEFAULT_EMPLOYEE_ROLES);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const [employeesResult, rolesResult] = await Promise.all([
      supabase.from("operators").select("*").order("name"),
      getSetting<{ roles: string[] }>("employee_roles", "config", { roles: DEFAULT_EMPLOYEE_ROLES }),
    ]);

    setEmployees((employeesResult.data ?? []) as Operator[]);
    setRoles((rolesResult.roles ?? DEFAULT_EMPLOYEE_ROLES).filter(Boolean));
  }

  useEffect(() => { load(); }, []);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => {
      const haystack = [
        employee.name,
        employee.phone,
        employee.license_number,
        employee.driving_license_number,
        employee.aadhaar_number,
        employee.employee_role,
        employee.designation,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, search]);

  const totalAdvance = employees.reduce((sum, employee) => sum + Number(employee.advance_balance ?? 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Employees</h1>
        {hasPermission("operators.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add employee"}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Employees</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{employees.length}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Advance outstanding</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>₹{totalAdvance.toLocaleString()}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: 14, marginBottom: 20 }}>
        <label className="field">Search employee</label>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, Aadhar, license..." />
      </div>

      {showForm && <EmployeeForm roles={roles} onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <EmployeeForm roles={roles} employee={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Salary</th>
              <th>License / Aadhaar</th>
              <th>Advance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{employee.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{employee.phone ?? "—"}</div>
                </td>
                <td>{employee.employee_role || employee.designation || "—"}</td>
                <td>₹{Number(employee.salary_amount ?? 0).toLocaleString()}</td>
                <td>
                  <div>{employee.driving_license_number ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{employee.aadhaar_number ?? "—"}</div>
                </td>
                <td>₹{Number(employee.advance_balance ?? 0).toLocaleString()}</td>
                <td>
                  <span className={`status-chip status-${employee.is_active ? "available" : "inactive"}`}>{employee.is_active ? "Active" : "Inactive"}</span>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {hasPermission("operators.write") && (
                      <button className="btn" style={{ padding: "3px 7px" }} onClick={() => setEditing(employee)}>Edit</button>
                    )}
                    {hasPermission("operators.write") && (
                      <button className="btn" style={{ padding: "3px 7px" }} onClick={async () => {
                        if (!window.confirm("Delete this employee?")) return;

                        const { error: salaryLinkError } = await supabase
                          .from("salary_payments")
                          .update({ operator_id: null })
                          .eq("operator_id", employee.id);

                        if (salaryLinkError) {
                          window.alert(`Could not detach salary records before deleting this employee: ${salaryLinkError.message}`);
                          return;
                        }

                        await supabase.from("operators").delete().eq("id", employee.id);
                        load();
                      }}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredEmployees.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No employees found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeForm({ roles, employee, onSaved, onCancel }: { roles: string[]; employee?: Operator; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [roleName, setRoleName] = useState(employee?.employee_role ?? roles[0] ?? "");
  const [designation, setDesignation] = useState(employee?.designation ?? "");
  const [salaryAmount, setSalaryAmount] = useState(employee?.salary_amount?.toString() ?? "");
  const [salaryFrequency, setSalaryFrequency] = useState(employee?.salary_frequency ?? "monthly");
  const [licenseNumber, setLicenseNumber] = useState(employee?.driving_license_number ?? employee?.license_number ?? "");
  const [licenseExpiry, setLicenseExpiry] = useState(employee?.license_expiry ?? "");
  const [aadhaarNumber, setAadhaarNumber] = useState(employee?.aadhaar_number ?? "");
  const [advanceBalance, setAdvanceBalance] = useState(employee?.advance_balance?.toString() ?? "0");
  const [joinDate, setJoinDate] = useState(employee?.join_date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [isActive, setIsActive] = useState(employee?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  async function submit() {
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      employee_role: roleName || null,
      designation: designation || null,
      salary_amount: salaryAmount ? Number(salaryAmount) : null,
      salary_frequency: salaryFrequency,
      driving_license_number: licenseNumber || null,
      license_number: licenseNumber || null,
      license_expiry: licenseExpiry || null,
      aadhaar_number: aadhaarNumber || null,
      advance_balance: Number(advanceBalance || 0),
      join_date: joinDate || null,
      notes: notes || null,
      is_active: isActive,
    };

    const { error: submitError } = employee
      ? await supabase.from("operators").update(payload).eq("id", employee.id)
      : await supabase.from("operators").insert(payload);

    setSaving(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setSuccessMessage(employee ? "Employee updated successfully." : "Employee saved successfully.");
    window.setTimeout(() => onSaved(), 250);
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div className="message-banner error">{error}</div>}
      {successMessage && <div className="message-banner success">{successMessage}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Role</label>
          <select className="input" value={roleName} onChange={(e) => setRoleName(e.target.value)}>
            <option value="">Select role</option>
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Designation</label>
          <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Salary amount</label>
          <input className="input" type="number" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Salary frequency</label>
          <select className="input" value={salaryFrequency} onChange={(e) => setSalaryFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field">Driving license number</label>
          <input className="input" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">License expiry</label>
          <input className="input" type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Aadhaar number</label>
          <input className="input" value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Advance balance</label>
          <input className="input" type="number" value={advanceBalance} onChange={(e) => setAdvanceBalance(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Join date</label>
          <input className="input" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
        </div>
        <div className="field-group" style={{ gridColumn: "1 / -1" }}>
          <label className="field">Notes</label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="field-group">
          <label className="field">Status</label>
          <select className="input" value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim()}>{saving ? "Saving…" : employee ? "Update employee" : "Save employee"}</button>
      {onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
