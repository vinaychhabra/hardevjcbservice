import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Assets from "./pages/Assets";
import EquipmentCategories from "./pages/EquipmentCategories";
import Rentals from "./pages/Rentals";
import Invoices from "./pages/Invoices";
import DailySales from "./pages/DailySales";
import Expenses from "./pages/Expenses";
import Salaries from "./pages/Salaries";
import Maintenance from "./pages/Maintenance";
import MonthlyReport from "./pages/MonthlyReport";
import Receivables from "./pages/Receivables";
import SettingsHome from "./pages/settings/SettingsHome";
import BillingUnitsSettings from "./pages/settings/BillingUnitsSettings";
import RolesUsersSettings from "./pages/settings/RolesUsersSettings";
import NumberingSettings from "./pages/settings/NumberingSettings";
import FieldRequirementsSettings from "./pages/settings/FieldRequirementsSettings";

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="equipment-categories" element={<EquipmentCategories />} />
        <Route path="machines" element={<Assets />} />
        <Route path="assets" element={<Navigate to="/machines" replace />} />
        <Route path="rentals" element={<Rentals />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="daily-sales" element={<DailySales />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="salaries" element={<Salaries />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="reports/monthly" element={<MonthlyReport />} />
        <Route path="receivables" element={<Receivables />} />
        <Route path="settings" element={<SettingsHome />} />
        <Route path="settings/billing-units" element={<BillingUnitsSettings />} />
        <Route path="settings/roles-users" element={<RolesUsersSettings />} />
        <Route path="settings/numbering" element={<NumberingSettings />} />
        <Route path="settings/field-requirements" element={<FieldRequirementsSettings />} />
      </Route>
    </Routes>
  );
}
