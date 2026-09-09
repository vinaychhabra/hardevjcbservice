import { useEffect, useState } from "react";
import { getSetting, upsertSetting } from "../../lib/settingsApi";

interface NumberingConfig { prefix: string; next_seq: number }

export default function NumberingSettings() {
  const [invoice, setInvoice] = useState<NumberingConfig>({ prefix: "INV-", next_seq: 1 });
  const [quote, setQuote] = useState<NumberingConfig>({ prefix: "QTE-", next_seq: 1 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting("numbering", "invoice", invoice).then(setInvoice);
    getSetting("numbering", "quote", quote).then(setQuote);
  }, []);

  async function save() {
    setSaving(true);
    await Promise.all([
      upsertSetting("numbering", "invoice", invoice as unknown as Record<string, unknown>),
      upsertSetting("numbering", "quote", quote as unknown as Record<string, unknown>),
    ]);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Document numbering</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        A database trigger fills in the next number automatically when you create an invoice or
        quote — this is just where the prefix and starting sequence live.
      </p>

      <div className="panel" style={{ padding: 20, maxWidth: 500 }}>
        <label className="field">Invoice numbering</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <input className="input" placeholder="Prefix" value={invoice.prefix} onChange={(e) => setInvoice({ ...invoice, prefix: e.target.value })} />
          <input className="input" type="number" placeholder="Next number" value={invoice.next_seq} onChange={(e) => setInvoice({ ...invoice, next_seq: Number(e.target.value) })} />
        </div>

        <label className="field">Quote numbering</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <input className="input" placeholder="Prefix" value={quote.prefix} onChange={(e) => setQuote({ ...quote, prefix: e.target.value })} />
          <input className="input" type="number" placeholder="Next number" value={quote.next_seq} onChange={(e) => setQuote({ ...quote, next_seq: Number(e.target.value) })} />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
