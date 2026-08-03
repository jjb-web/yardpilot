import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { formatMoney } from "../lib/estimate";

export default function Reports() {
  const { projects, invoices, contacts } = useApp();
  const report = useMemo(() => {
    const paidInvoices = invoices.filter((invoice) => invoice.paymentStatus === "paid" || invoice.status === "paid");
    const outstanding = invoices.filter((invoice) => invoice.paymentStatus !== "paid" && invoice.status !== "void");
    return {
      contacts: contacts.length,
      activeJobs: projects.filter((project) => project.status === "active" && project.estimateStatus === "accepted").length,
      completedJobs: projects.filter((project) => project.status === "completed").length,
      acceptedEstimateValue: projects.filter((project) => project.estimateStatus === "accepted").reduce((sum, project) => sum + Number(project.totalEstimate || 0), 0),
      paidRevenue: paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      outstandingRevenue: outstanding.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    };
  }, [projects, invoices, contacts]);

  const cards = [
    ["Contacts", String(report.contacts), "Current contact records in this workspace."],
    ["Active jobs", String(report.activeJobs), "Accepted estimates whose project status is active."],
    ["Completed jobs", String(report.completedJobs), "Projects explicitly marked completed."],
    ["Accepted estimate value", formatMoney(report.acceptedEstimateValue), "Sum of accepted estimate totals. This is not collected revenue."],
    ["Paid invoice revenue", formatMoney(report.paidRevenue), "Sum of invoices marked paid. Refunds and processing fees are not deducted here."],
    ["Outstanding invoices", formatMoney(report.outstandingRevenue), "Unpaid, non-void invoice totals. This is not guaranteed future revenue."],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase text-amber-800">Beta</span></div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A small set of clearly defined workspace totals. Tax, payroll, profit, refunds, processing fees, and accounting exports are not calculated in this release.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value, definition]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{definition}</p></article>)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Use exported invoice and job records with a qualified accountant for taxes and financial statements. YardPilot reports are operational summaries, not accounting or tax reports.</div>
    </div>
  );
}
