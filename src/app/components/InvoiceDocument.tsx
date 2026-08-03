import type { Contact, EstimateJob, Invoice, Property, PropertyPhoto, User } from "../data/types";
import { calculateJob, formatMoney, propertyAddress } from "../lib/estimate";

type Props = {
  invoice: Invoice;
  company: User;
  contact?: Contact | null;
  property?: Property | null;
  photos?: PropertyPhoto[];
};

function date(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function legacyJob(invoice: Invoice): EstimateJob | null {
  const snapshot = invoice.estimateSnapshot;
  if (!snapshot) return null;
  return {
    id: "legacy-job",
    title: snapshot.name,
    projectType: snapshot.projectType,
    scopeDescription: snapshot.scopeDescription,
    internalNotes: "",
    squareFootage: 0,
    pricePerSquareFoot: 0,
    scheduledStart: null,
    scheduledEnd: null,
    laborRate: snapshot.laborRate,
    laborHours: snapshot.laborHours,
    laborAssignments: snapshot.laborAssignments,
    lineItems: snapshot.lineItems,
    photoIds: [],
  };
}

export default function InvoiceDocument({ invoice, company, contact, property }: Props) {
  const snapshot = invoice.estimateSnapshot;
  const jobs = snapshot?.jobSections?.length
    ? snapshot.jobSections
    : legacyJob(invoice)
      ? [legacyJob(invoice)!]
      : [];
  const address = propertyAddress(property) || [snapshot?.address, snapshot?.city].filter(Boolean).join(", ");

  return (
    <article className="invoice-print-root mx-auto w-full max-w-[900px] overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="flex flex-col gap-5 bg-slate-950 px-8 py-7 text-white sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white"><img src="/yardpilot-logo.png" alt="YardPilot logo" className="h-full w-full object-contain" /></div>
          <div><p className="text-xl font-extrabold">{company.company || "YardPilot"}</p><p className="mt-1 text-sm text-slate-300">Final invoice</p>{company.email && <p className="mt-2 text-xs text-slate-400">{company.email}</p>}</div>
        </div>
        <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Invoice</p><p className="mt-1 text-2xl font-extrabold">{invoice.invoiceNumber}</p><p className="mt-2 text-sm capitalize text-slate-300">{invoice.status}</p></div>
      </header>

      <div className="space-y-7 px-8 py-7">
        <section className="grid gap-5 border-b border-gray-200 pb-6 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Bill to</p><p className="mt-2 font-bold">{contact?.name || snapshot?.client || "Customer"}</p>{address && <p className="mt-2 text-sm text-gray-500">{address}</p>}</div>
          <div className="sm:text-right"><p className="text-sm text-gray-500">Issued {date(invoice.issueDate)}</p><p className="mt-1 text-sm text-gray-500">Due {date(invoice.dueDate)}</p><p className="mt-3 text-lg font-bold">{snapshot?.name || "Services"}</p></div>
        </section>

        {jobs.map((job, index) => {
          const totals = calculateJob(job);
          const hours = job.laborAssignments.length
            ? job.laborAssignments.reduce((sum, assignment) => sum + Number(assignment.hours || 0), 0)
            : job.laborHours;
          return (
            <section key={job.id} className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex items-start justify-between gap-4 bg-gray-50 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Job {index + 1}</p><h2 className="mt-1 font-bold">{job.title}</h2><p className="mt-1 text-sm text-gray-500">{job.projectType}</p></div><p className="font-bold">{formatMoney(totals.subtotal)}</p></div>
              <div className="divide-y divide-gray-100">
                {job.squareFootage > 0 && <div className="flex justify-between gap-4 px-5 py-3 text-sm"><span>Square-foot work · {job.squareFootage.toLocaleString()} sq ft × {formatMoney(job.pricePerSquareFoot)}</span><span className="font-semibold">{formatMoney(job.squareFootage * job.pricePerSquareFoot)}</span></div>}
                {job.lineItems.map((item) => <div key={item.id} className="flex justify-between gap-4 px-5 py-3 text-sm"><span>{item.description || "Material or service"} · {item.qty} {item.unit}</span><span className="font-semibold">{formatMoney(item.qty * item.unitCost)}</span></div>)}
                {hours > 0 && <div className="flex justify-between gap-4 px-5 py-3 text-sm"><span>Combined labor · {hours.toLocaleString()} crew hours</span><span className="font-semibold">{formatMoney(totals.labor)}</span></div>}
              </div>
            </section>
          );
        })}

        <section className="ml-auto max-w-md border-t border-gray-200 pt-5">
          <div className="flex items-end justify-between"><span className="font-bold">Amount due</span><span className="text-3xl font-extrabold">{formatMoney(invoice.amount)}</span></div>
        </section>
        {invoice.notes && <section className="rounded-xl bg-gray-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{invoice.notes}</p></section>}
      </div>
    </article>
  );
}
