import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, FileText, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type WorkOrder = {
  work_order_id: string;
  request_id: string;
  request_title: string;
  workspace_id: string;
  business_name: string;
  bid_amount: number | null;
  work_status: string;
  project_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_payment_status: string | null;
  invoice_share_token: string | null;
  invoice_share_enabled: boolean;
  invoice_paid_at: string | null;
  updated_at: string;
};

function money(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function ClientPayments() {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc("get_my_marketplace_work_orders");
      if (!active) return;
      setLoading(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setRows((data ?? []) as WorkOrder[]);
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900"><CreditCard size={24} /> Payments</h1>
        <p className="mt-1 text-sm text-slate-500">Accepted bids appear here. The company uses YardPilot's existing estimate, job, and invoice workflow; once it shares an invoice, you can open and pay it here.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading payments…</p> : (
        <div className="space-y-4">
          {rows.map((row) => {
            const paid = row.invoice_payment_status === "paid" || Boolean(row.invoice_paid_at);
            const invoiceReady = Boolean(row.invoice_share_enabled && row.invoice_share_token);
            return (
              <article key={row.work_order_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.work_status.replaceAll("_", " ")}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{row.request_title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{row.business_name}</p>
                  </div>
                  {paid ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} /> Paid</span> : row.invoice_amount != null ? <p className="text-xl font-bold text-slate-900">{money(row.invoice_amount)}</p> : row.bid_amount != null ? <p className="text-sm font-semibold text-slate-700">Accepted bid {money(row.bid_amount)}</p> : null}
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  {row.invoice_id ? (
                    <>
                      <p><strong>Invoice:</strong> {row.invoice_number || "Created"}</p>
                      <p className="mt-1"><strong>Payment status:</strong> {row.invoice_payment_status || "unpaid"}</p>
                    </>
                  ) : row.project_id ? (
                    <p>The company has created the estimate/job. The invoice will appear here after it is created and shared.</p>
                  ) : (
                    <p>The company has accepted the work order but has not created the YardPilot estimate yet.</p>
                  )}
                </div>

                {invoiceReady && (
                  <a href={`/invoice/share/${row.invoice_share_token}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                    <FileText size={16} /> {paid ? "View paid invoice" : "Open and pay invoice"}
                  </a>
                )}
              </article>
            );
          })}
          {rows.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No accepted marketplace projects yet.</div>}
        </div>
      )}
    </div>
  );
}
