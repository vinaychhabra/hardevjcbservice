import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Customer } from "../types";
import { useAuth } from "../lib/AuthContext";
import { getSetting } from "../lib/settingsApi";

const CUSTOMER_TYPES = ["individual", "company", "contractor", "dealer", "broker", "government", "enterprise"];

export default function Customers() {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if (!error) setCustomers((data ?? []) as Customer[]);
    setLoading(false);
  }

  async function deleteCustomer(id: string) {
    if (!window.confirm("Delete this customer?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (!error) load();
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

      {showForm && <CustomerForm key="new" onSaved={() => { setShowForm(false); load(); }} />}
      {editing && <CustomerForm key={editing.id} customer={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Tax ID</th>
              <th>Payment terms</th>
              <th>Credit limit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.customer_type}</td>
                <td>{c.phone ?? "—"}</td>
                <td>{c.billing_address ?? "—"}</td>
                <td className="mono">{c.tax_id ?? "—"}</td>
                <td>{c.payment_terms_days} days</td>
                <td>{c.credit_limit != null ? `₹${c.credit_limit.toLocaleString()}` : "—"}</td>
                <td>
                  {hasPermission("customers.write") && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => setEditing(c)}>Edit</button>
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={() => deleteCustomer(c.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr><td colSpan={8} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerForm({ customer, onSaved, onCancel }: { customer?: Customer; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [customerType, setCustomerType] = useState(customer?.customer_type ?? "company");
  const [taxId, setTaxId] = useState(customer?.tax_id ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.billing_address ?? "");
  const [paymentTerms, setPaymentTerms] = useState(customer?.payment_terms_days ?? 0);
  const [creditLimit, setCreditLimit] = useState(customer?.credit_limit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState({ customer_phone: false, customer_address: false });

  useEffect(() => { getSetting("field_requirements", "config", { customer_phone: false, customer_address: false }).then((config) => setRequirements(config)); }, []);

  async function submit() {
    setSaving(true);
    setError(null);
    const values = {
      name,
      customer_type: customerType,
      tax_id: taxId || null,
      phone: phone || null,
      billing_address: address || null,
      payment_terms_days: paymentTerms,
      credit_limit: creditLimit ? Number(creditLimit) : null,
    };
    const { error } = customer
      ? await supabase.from("customers").update(values).eq("id", customer.id)
      : await supabase.from("customers").insert(values);
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
        <div className="field-group"><label className="field">Phone {requirements.customer_phone ? "(required)" : "(optional)"}</label><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field-group"><label className="field">Address {requirements.customer_address ? "(required)" : "(optional)"}</label><textarea className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="field-group">
          <label className="field">Payment terms (days)</label>
          <input className="input" type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} />
        </div>
        <div className="field-group">
          <label className="field">Credit limit</label>
          <input className="input" type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !name || !customerType || (requirements.customer_phone && !phone.trim()) || (requirements.customer_address && !address.trim())}>{saving ? "Saving…" : customer ? "Update customer" : "Save customer"}</button>{onCancel && <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
    </div>
  );
}
