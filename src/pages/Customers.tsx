import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Customer } from "../types";
import { useAuth } from "../lib/AuthContext";

const CUSTOMER_TYPES = ["individual", "company", "contractor", "dealer", "broker", "government", "enterprise"];

export default function Customers() {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if (!error) setCustomers((data ?? []) as Customer[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Customers</h1>
        {hasPermission("customers.write") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add customer"}
          </button>
        )}
      </div>

      {showForm && <CustomerForm onSaved={() => { setShowForm(false); load(); }} />}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Tax ID</th>
              <th>Payment terms</th>
              <th>Credit limit</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.customer_type}</td>
                <td className="mono">{c.tax_id ?? "—"}</td>
                <td>{c.payment_terms_days} days</td>
                <td>{c.credit_limit != null ? `₹${c.credit_limit.toLocaleString()}` : "—"}</td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [customerType, setCustomerType] = useState("company");
  const [taxId, setTaxId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(0);
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("customers").insert({
      name,
      customer_type: customerType,
      tax_id: taxId || null,
      payment_terms_days: paymentTerms,
      credit_limit: creditLimit ? Number(creditLimit) : null,
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      {error && <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field-group">
          <label className="field">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Type</label>
          <select className="input" value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
            {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field">Tax ID (GST/VAT)</label>
          <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Payment terms (days)</label>
          <input className="input" type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} />
        </div>
        <div className="field-group">
          <label className="field">Credit limit</label>
          <input className="input" type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !name}>
        {saving ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}
