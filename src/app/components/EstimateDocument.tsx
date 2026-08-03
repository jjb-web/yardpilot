import type {
  Contact,
  EstimateJob,
  Project,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";
import {
  calculateEstimate,
  calculateJob,
  formatMoney,
  propertyAddress,
} from "../lib/estimate";

type Props = {
  project: Project;
  company: User;
  contact?: Contact | null;
  property?: Property | null;
  photos?: PropertyPhoto[];
};

function date(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fallbackJob(project: Project): EstimateJob {
  return {
    id: "legacy-job",
    title: project.name,
    projectType: project.projectType,
    scopeDescription: project.scopeDescription,
    internalNotes: "",
    squareFootage: project.squareFootage,
    pricePerSquareFoot: 0,
    scheduledStart: project.scheduledStart,
    scheduledEnd: project.scheduledEnd,
    laborRate: project.laborRate,
    laborHours: project.laborHours,
    laborAssignments: project.laborAssignments,
    lineItems: project.lineItems,
    photoIds: [],
  };
}

export default function EstimateDocument({
  project,
  company,
  contact,
  property,
  photos = [],
}: Props) {
  const totals = calculateEstimate(project);
  const jobs = project.jobSections?.length
    ? project.jobSections
    : [fallbackJob(project)];
  const serviceAddress =
    propertyAddress(property) ||
    [project.address, project.city].filter(Boolean).join(", ");

  return (
    <article className="estimate-print-root mx-auto w-full max-w-[900px] overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="flex flex-col gap-5 bg-green-950 px-8 py-7 text-white sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95">
            <img src="/yardpilot-logo.png" alt="YardPilot logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-xl font-extrabold">{company.company || "YardPilot"}</p>
            <p className="mt-1 text-sm text-green-200">Professional landscaping estimate</p>
            <div className="mt-2 space-y-0.5 text-xs text-green-100/80">
              {company.name && <p>{company.name}</p>}
              {company.phone && <p>{company.phone}</p>}
              {company.email && <p>{company.email}</p>}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-green-300">Estimate</p>
          <p className="mt-1 text-2xl font-extrabold">{project.estimateNumber}</p>
          <p className="mt-2 text-sm capitalize text-green-100">{project.estimateStatus}</p>
        </div>
      </header>

      <div className="space-y-8 px-8 py-7">
        <section className="grid gap-5 border-b border-gray-200 pb-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Prepared for</p>
            <p className="mt-2 font-bold">{contact?.name || project.client || "Customer"}</p>
            {contact?.email && <p className="mt-1 text-sm text-gray-500">{contact.email}</p>}
            {contact?.phone && <p className="text-sm text-gray-500">{contact.phone}</p>}
            {serviceAddress && <p className="mt-2 text-sm text-gray-500">{serviceAddress}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-gray-500">Issued {date(project.issueDate)}</p>
            <p className="mt-1 text-sm text-gray-500">Valid until {date(project.validUntil)}</p>
            <p className="mt-3 text-lg font-bold">{project.name}</p>
            <p className="mt-1 text-sm text-gray-500">{jobs.length} {jobs.length === 1 ? "job" : "jobs"} included</p>
          </div>
        </section>

        <section className="space-y-6">
          {jobs.map((job, index) => {
            const jobTotals = calculateJob(job);
            const jobPhotos = photos.filter((photo) => job.photoIds.includes(photo.id));
            const laborHours = job.laborAssignments.length
              ? job.laborAssignments.reduce((sum, assignment) => sum + Number(assignment.hours || 0), 0)
              : job.laborHours;
            return (
              <div key={job.id} className="overflow-hidden rounded-xl border border-gray-200">
                <div className="flex flex-wrap items-start justify-between gap-3 bg-gray-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Job {index + 1}</p>
                    <h2 className="mt-1 text-lg font-bold">{job.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{job.projectType}</p>
                  </div>
                  <p className="text-lg font-bold">{formatMoney(jobTotals.subtotal)}</p>
                </div>
                <div className="space-y-5 px-5 py-5">
                  {job.scopeDescription && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Scope</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{job.scopeDescription}</p>
                    </div>
                  )}

                  {(job.squareFootage > 0 || job.lineItems.length > 0) && (
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-4 bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                        <span>Description</span><span>Quantity</span><span>Amount</span>
                      </div>
                      {job.squareFootage > 0 && (
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-gray-100 px-4 py-3 text-sm">
                          <span>Square-foot work at {formatMoney(job.pricePerSquareFoot)} / sq ft</span>
                          <span className="text-gray-500">{job.squareFootage.toLocaleString()} sq ft</span>
                          <span className="font-semibold">{formatMoney(job.squareFootage * job.pricePerSquareFoot)}</span>
                        </div>
                      )}
                      {job.lineItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-gray-100 px-4 py-3 text-sm">
                          <span>{item.description || "Material or service"}</span>
                          <span className="text-gray-500">{item.qty} {item.unit}</span>
                          <span className="font-semibold">{formatMoney(item.qty * item.unitCost)}</span>
                        </div>
                      ))}
                      {laborHours > 0 && (
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-gray-100 px-4 py-3 text-sm">
                          <span>Combined labor</span>
                          <span className="text-gray-500">{laborHours.toLocaleString()} combined hours</span>
                          <span className="font-semibold">{formatMoney(jobTotals.labor)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {jobPhotos.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {jobPhotos.map((photo) => (
                        <figure key={photo.id} className="overflow-hidden rounded-lg border border-gray-200">
                          <img src={photo.url} alt={photo.caption || job.title} className="aspect-[4/3] w-full object-cover" />
                          {photo.caption && <figcaption className="p-2 text-xs text-gray-500">{photo.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="ml-auto max-w-md space-y-2 border-t border-gray-200 pt-5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Materials and services</span><span>{formatMoney(totals.materials)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Combined labor</span><span>{formatMoney(totals.labor)}</span></div>
          {totals.tax > 0 && <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatMoney(totals.tax)}</span></div>}
          {totals.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{formatMoney(totals.discount)}</span></div>}
          <div className="mt-3 flex items-end justify-between border-t border-gray-200 pt-4">
            <span className="font-bold">Estimate total</span>
            <span className="text-3xl font-extrabold">{formatMoney(totals.total)}</span>
          </div>
        </section>

        {project.clientNotes && (
          <section><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Customer notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{project.clientNotes}</p></section>
        )}
        {project.terms && (
          <section className="rounded-xl bg-gray-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Terms</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-500">{project.terms}</p></section>
        )}
      </div>
    </article>
  );
}
