import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/daily-sales", label: "Sales" },
  { to: "/receivables", label: "Receivables" },
  { to: "/expenses", label: "Expenses" },
  { to: "/salaries", label: "Salaries" },
  { to: "/maintenance", label: "Maintenance" },
  { to: "/reports/monthly", label: "Monthly report" },
  { to: "/rentals", label: "Contracts (optional)" },
  { to: "/machines", label: "Machines" },
  { to: "/customers", label: "Customers" },
  { to: "/invoices", label: "Invoices" },
  { to: "/equipment-categories", label: "Equipment categories" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { profile, signOut } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          background: "var(--graphite-800)",
          color: "#fff",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 20px 24px", fontWeight: 800, fontSize: 16, letterSpacing: 0.2 }}>
          EquipRent OS
        </div>
        <nav style={{ flex: 1 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 20px",
                color: isActive ? "var(--amber)" : "rgba(255,255,255,0.8)",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                textDecoration: "none",
                borderLeft: isActive ? "3px solid var(--amber)" : "3px solid transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{profile?.full_name}</div>
          <button
            onClick={signOut}
            className="btn"
            style={{ marginTop: 8, width: "100%", background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 1200 }}>
        <Outlet />
      </main>
    </div>
  );
}
