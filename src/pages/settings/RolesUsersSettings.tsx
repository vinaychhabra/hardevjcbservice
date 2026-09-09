import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Profile, Role } from "../../types";

const ALL_PERMISSIONS = [
  "customers.read", "customers.write", "sites.read", "sites.write",
  "equipment.read", "equipment.write", "operators.read", "operators.write",
  "leads.read", "leads.write", "quotes.read", "quotes.write",
  "rentals.read", "rentals.write", "usage.read", "usage.write",
  "invoices.read", "invoices.write", "payments.read", "payments.write",
  "reports.read", "settings.read", "settings.manage",
];

export default function RolesUsersSettings() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  async function load() {
    const [{ data: r }, { data: u }] = await Promise.all([
      supabase.from("roles").select("*").order("name"),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    setRoles((r ?? []) as Role[]);
    setUsers((u ?? []) as Profile[]);
  }

  useEffect(() => { load(); }, []);

  function togglePermission(role: Role, perm: string) {
    if (role.is_system) return;
    const next = role.permissions.includes(perm) ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, permissions: next } : r)));
  }

  async function saveRole(role: Role) {
    setSavingRole(role.id);
    await supabase.from("roles").update({ permissions: role.permissions }).eq("id", role.id);
    setSavingRole(null);
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "—";

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Roles & users</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        System roles (owner, manager, field_staff, accountant, read_only) can't be edited — clone
        one into a custom role instead. Team members are added via the Supabase dashboard for
        now (an invite flow needs a small Edge Function, coming in a later phase).
      </p>

      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Roles</h2>
      {roles.map((role) => (
        <div key={role.id} className="panel" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {role.name} {role.is_system && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>(system)</span>}
            </div>
            {!role.is_system && (
              <button className="btn" onClick={() => saveRole(role)} disabled={savingRole === role.id}>
                {savingRole === role.id ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {role.permissions.includes("*") ? (
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>all permissions</span>
            ) : (
              ALL_PERMISSIONS.map((perm) => {
                const active = role.permissions.includes(perm);
                return (
                  <button
                    key={perm}
                    onClick={() => togglePermission(role, perm)}
                    disabled={role.is_system}
                    className="mono"
                    style={{
                      fontSize: 11, padding: "3px 7px", borderRadius: 3,
                      border: "1px solid " + (active ? "var(--amber)" : "var(--line)"),
                      background: active ? "#fbeedb" : "var(--paper-raised)",
                      color: active ? "var(--amber-dark)" : "var(--text-muted)",
                      cursor: role.is_system ? "default" : "pointer",
                    }}
                  >
                    {perm}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 15, margin: "24px 0 12px" }}>Team members</h2>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{roleName(u.role_id)}</td>
                <td>{u.is_active ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
