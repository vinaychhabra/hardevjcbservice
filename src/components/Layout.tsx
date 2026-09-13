import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const MAIN_NAV = [
  { title: "Overview", items: [{ to: "/", label: "Dashboard", end: true } as { to: string; label: string; end?: boolean }] },
  {
    title: "Operations",
    items: [
      { to: "/daily-sales", label: "Sales" },
      { to: "/employees", label: "Employees" },
      { to: "/rentals", label: "Contracts" },
      { to: "/machines", label: "Machines" },
      { to: "/customers", label: "Customers" },
      { to: "/invoices", label: "Invoices" },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/receivables", label: "Receivables" },
      { to: "/expenses", label: "Expenses" },
      { to: "/salaries", label: "Salaries" },
    ],
  },
  {
    title: "Reports & setup",
    items: [
      { to: "/reports/monthly", label: "Monthly report" },
      { to: "/equipment-categories", label: "Equipment categories" },
    ],
  },
];

export default function Layout() {
  const { profile, signOut } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Overview: true,
    Finance: true,
    Operations: true,
    "Reports & setup": true,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("equiprent-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("equiprent-theme", theme);
  }, [theme]);

  function toggleGroup(title: string) {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand-wrap">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            ☰
          </button>

          {!sidebarCollapsed && (
            <div>
              <div className="brand-name">Hardev JCB</div>
              <div className="brand-subtitle">Operations Suite</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {MAIN_NAV.map((group) => (
            <div key={group.title} className="nav-group">
              <button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.title)}>
                {!sidebarCollapsed && <span>{group.title}</span>}
                <span>{expanded[group.title] ? "▾" : "▸"}</span>
              </button>

              {expanded[group.title] && (
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/settings"
            title={sidebarCollapsed ? "Settings" : undefined}
            className={({ isActive }) => `nav-link settings-link ${isActive ? "active" : ""}`}
          >
            Settings
          </NavLink>

          {!sidebarCollapsed && (
            <div className="user-card">
              <div>
                <div className="user-label">Signed in</div>
                <div className="user-name">{profile?.full_name || "User"}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-block" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div>
            <h1 className="page-title">Overview</h1>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              aria-label="Toggle color theme"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              <span>{theme === "light" ? "☀️" : "🌙"}</span>
              <span>{theme === "light" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>

        <div className="page-shell">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
