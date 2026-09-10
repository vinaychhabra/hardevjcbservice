import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface MonthRow { month: string; sales: number; expenses: number; salaries: number; net: number }
const money = (value: number) => `₹${value.toLocaleString()}`;

export default function MonthlyReport() {
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: sales }, { data: expenses }, { data: salaries }] = await Promise.all([
        supabase.from("daily_entries").select("entry_date, amount"),
        supabase.from("expenses").select("expense_date, amount"),
        supabase.from("salary_payments").select("pay_period_start, amount"),
      ]);
      const months = new Map<string, MonthRow>();
      const get = (month: string) => {
        const existing = months.get(month) ?? { month, sales: 0, expenses: 0, salaries: 0, net: 0 };
        months.set(month, existing);
        return existing;
      };
      (sales ?? []).forEach((row) => { get(row.entry_date.slice(0, 7)).sales += Number(row.amount); });
      (expenses ?? []).forEach((row) => { get(row.expense_date.slice(0, 7)).expenses += Number(row.amount); });
      (salaries ?? []).forEach((row) => { get(row.pay_period_start.slice(0, 7)).salaries += Number(row.amount); });
      const result = Array.from(months.values()).map((row) => ({ ...row, net: row.sales - row.expenses - row.salaries })).sort((a, b) => b.month.localeCompare(a.month));
      setRows(result);
      setLoading(false);
    }
    load();
  }, []);

  return <div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Monthly report</h1><p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>Sales, operating expenses, salaries, and net profit for every month with recorded data.</p><div className="panel"><table className="data-table"><thead><tr><th>Month</th><th>Sales</th><th>Expenses</th><th>Salaries</th><th>Net profit</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month}><td className="mono">{row.month}</td><td>{money(row.sales)}</td><td>{money(row.expenses)}</td><td>{money(row.salaries)}</td><td style={{ color: row.net >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{money(row.net)}</td></tr>)}{!loading && !rows.length && <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>No financial data yet.</td></tr>}</tbody></table></div></div>;
}