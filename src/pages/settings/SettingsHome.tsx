import { Link } from "react-router-dom";

const SECTIONS = [
  { to: "/settings/billing-units", title: "Billing units & tax", desc: "Which billing units are enabled, default tax rates, grace periods." },
  { to: "/settings/numbering", title: "Document numbering", desc: "Prefix and sequence for invoices and quotes." },
  { to: "/settings/roles-users", title: "Roles & users", desc: "Who has access, and what each role can do." },
  { to: "/settings/employee-payroll", title: "Employee payroll", desc: "Create employee roles, default salary settings, and payroll rules." },
  { to: "/settings/field-requirements", title: "Field requirements", desc: "Choose whether customer and Sales contact fields are required." },
];

export default function SettingsHome() {
  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Settings</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Equipment categories live under their own tab since they're used constantly — everything
        else that's configurable is here.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="panel" style={{ display: "block", padding: 18, textDecoration: "none" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
