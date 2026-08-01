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
    ["Contacts", String(report.contacts)],
    ["Active jobs", String(report.activeJobs)],
    ["Completed jobs", String(report.completedJobs)],
    ["Accepted estimate value", formatMoney(report.acceptedEstimateValue)],
    ["Paid invoice revenue", formatMoney(report.paidRevenue)],
    ["Outstanding invoices", formatMoney(report.outstandingRevenue)],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div><h1 className="text-2xl font-bold">Reports</h1><p className="mt-1 text-sm text-gray-500">Workspace job, estimate, and invoice overview.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
      </div>
    </div>
  );
}
