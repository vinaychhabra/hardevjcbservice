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
import SettingsHome from "./pages/settings/SettingsHome";
import BillingUnitsSettings from "./pages/settings/BillingUnitsSettings";
import RolesUsersSettings from "./pages/settings/RolesUsersSettings";
import NumberingSettings from "./pages/settings/NumberingSettings";

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
        <Route path="assets" element={<Assets />} />
        <Route path="rentals" element={<Rentals />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="settings" element={<SettingsHome />} />
        <Route path="settings/billing-units" element={<BillingUnitsSettings />} />
        <Route path="settings/roles-users" element={<RolesUsersSettings />} />
        <Route path="settings/numbering" element={<NumberingSettings />} />
      </Route>
    </Routes>
  );
}
