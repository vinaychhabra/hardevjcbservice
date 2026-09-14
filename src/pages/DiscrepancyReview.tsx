import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface DailyEntryReview {
  id: string;
  entry_date: string;
  asset_code: string;
  customer_name: string;
  discrepancy_note: string | null;
  office_departure_time: string | null;
  office_return_time: string | null;
  start_time: string | null;
  end_time: string | null;
  is_reviewed: boolean;
}

export default function DiscrepancyReview() {
  const [rows, setRows] = useState<DailyEntryReview[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: entries }, { data: assets }] = await Promise.all([
      supabase.from("daily_entries").select("id, entry_date, asset_id, customer_name_freeform, discrepancy_note, office_departure_time, office_return_time, start_time, end_time, discrepancy_flag, is_reviewed").eq("discrepancy_flag", true).order("entry_date", { ascending: false }),
      supabase.from("assets").select("id, internal_code"),
    ]);

    const assetMap = new Map((assets ?? []).map((asset: any) => [asset.id, asset.internal_code]));
    setRows((entries ?? [])
      .filter((entry: any) => !entry.is_reviewed)
      .map((entry: any) => ({
        id: entry.id,
        entry_date: entry.entry_date,
        asset_code: assetMap.get(entry.asset_id) ?? "—",
        customer_name: entry.customer_name_freeform ?? "—",
        discrepancy_note: entry.discrepancy_note ?? "Discrepancy flagged for review.",
        office_departure_time: entry.office_departure_time,
        office_return_time: entry.office_return_time,
        start_time: entry.start_time,
        end_time: entry.end_time,
        is_reviewed: Boolean(entry.is_reviewed),
      })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markReviewed(id: string) {
    const { error } = await supabase.from("daily_entries").update({
      is_reviewed: true,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);

    if (!error) load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Discrepancy review</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Review flagged daily machine logs, mismatch notes, and operator concerns before payment or follow-up.
      </p>

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Machine</th>
              <th>Customer</th>
              <th>Work time</th>
              <th>Office route</th>
              <th>Issue</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.entry_date}</td>
                <td className="mono">{row.asset_code}</td>
                <td>{row.customer_name}</td>
                <td>{row.start_time && row.end_time ? `${row.start_time.slice(0, 5)} - ${row.end_time.slice(0, 5)}` : "—"}</td>
                <td>{row.office_departure_time && row.office_return_time ? `${row.office_departure_time.slice(0, 5)} - ${row.office_return_time.slice(0, 5)}` : "—"}</td>
                <td style={{ color: "var(--danger)", fontWeight: 600 }}>{row.discrepancy_note}</td>
                <td><button className="btn btn-primary" onClick={() => markReviewed(row.id)}>Mark reviewed</button></td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
                  No flagged discrepancies right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
