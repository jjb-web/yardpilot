import type {
  Contact,
  Project,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";
import {
  calculateEstimate,
  combinedLaborHours,
  formatMoney,
  propertyAddress,
} from "../lib/estimate";

type EstimateDocumentProps = {
  project: Project;
  company: User;
  contact?: Contact | null;
  property?: Property | null;
  photos?: PropertyPhoto[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EstimateDocument({
  project,
  company,
  contact,
  property,
  photos = [],
}: EstimateDocumentProps) {
  const totals = calculateEstimate(project);
  const laborHours = combinedLaborHours(project);
  const serviceAddress =
    propertyAddress(property) ||
    [project.address, project.city].filter(Boolean).join(", ");
  const billingLabel =
    project.billingMethod === "hourly"
      ? "Time & materials — based on total hours"
      : "Fixed price — due at job completion";

  return (
    <article className="estimate-print-root mx-auto w-full max-w-[850px] bg-white text-gray-900 shadow-sm border border-gray-200 rounded-2xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none">
      <div className="bg-green-950 text-white px-8 py-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between print:bg-green-950 print:text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/95 overflow-hidden flex items-center justify-center shrink-0">
            <img
              src="/yardpilot-logo.png"
              alt="YardPilotUSA logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight">
              {company.company || "YardPilotUSA"}
            </p>
            <p className="text-green-200 text-sm mt-1">
              Professional landscaping estimate
            </p>
            <div className="text-xs text-green-100/80 mt-2 space-y-0.5">
              {company.name && <p>{company.name}</p>}
              {company.phone && <p>{company.phone}</p>}
              {company.email && <p>{company.email}</p>}
            </div>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-green-300 font-bold">
            Estimate
          </p>
          <p className="text-2xl font-extrabold mt-1">
            {project.estimateNumber}
          </p>
          <p className="text-sm text-green-100 mt-2 capitalize">
            {project.estimateStatus}
          </p>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-2">
              Prepared for
            </p>
            <p className="font-bold text-lg">
              {contact?.name || project.client || "Client"}
            </p>
            {contact?.email && <p className="text-sm text-gray-600 mt-1">{contact.email}</p>}
            {contact?.phone && <p className="text-sm text-gray-600">{contact.phone}</p>}
          </div>

          <div className="sm:text-right">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:inline-grid">
              <span className="text-gray-500">Issued</span>
              <span className="font-semibold">{formatDate(project.issueDate)}</span>
              <span className="text-gray-500">Valid until</span>
              <span className="font-semibold">{formatDate(project.validUntil)}</span>
              <span className="text-gray-500">Project type</span>
              <span className="font-semibold">{project.projectType}</span>
              <span className="text-gray-500">Pricing method</span>
              <span className="font-semibold">{billingLabel}</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-2">
            Property and project
          </p>
          <p className="font-bold text-gray-900">
            {property?.name || project.name}
          </p>
          <p className="text-sm text-gray-600 mt-1">{serviceAddress || "No property address"}</p>
          {property?.description && (
            <p className="text-sm text-gray-700 mt-3 leading-relaxed">
              {property.description}
            </p>
          )}
          {project.scopeDescription && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-1">
                Scope of work
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {project.scopeDescription}
              </p>
            </div>
          )}
        </section>

        {project.aiEstimate && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-5">
            <p className="text-xs uppercase tracking-wider font-bold text-green-700 mb-2">
              Estimate overview
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {project.aiEstimate}
            </p>
          </section>
        )}

        <section>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-gray-400">
                Cost breakdown
              </p>
              <h2 className="text-lg font-bold mt-1">Services and materials</h2>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Description</th>
                  <th className="text-right font-semibold px-4 py-3">Qty</th>
                  <th className="text-right font-semibold px-4 py-3">Rate</th>
                  <th className="text-right font-semibold px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {project.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">
                      {item.description || "Material or service"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {item.qty} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatMoney(item.unitCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(item.qty * item.unitCost)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3 font-medium">Total combined labor hours</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {laborHours.toLocaleString("en-US")} hours
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    Total combined hours
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(totals.labor)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 ml-auto w-full max-w-sm rounded-xl bg-gray-50 border border-gray-200 p-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Materials</span>
              <span className="font-semibold">{formatMoney(totals.materials)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Total combined labor hours</span>
              <span className="font-semibold">{laborHours.toLocaleString("en-US")}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Labor</span>
              <span className="font-semibold">{formatMoney(totals.labor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold">{formatMoney(totals.subtotal)}</span>
            </div>
            {project.taxRate > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Tax ({project.taxRate}%)</span>
                <span className="font-semibold">{formatMoney(totals.tax)}</span>
              </div>
            )}
            {project.discountAmount > 0 && (
              <div className="flex justify-between gap-4 text-green-700">
                <span>Discount</span>
                <span className="font-semibold">-{formatMoney(totals.discount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-end gap-4">
              <span className="font-bold text-gray-900">Estimated total</span>
              <span className="text-2xl font-extrabold text-green-800">
                {formatMoney(totals.total)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 leading-relaxed max-w-xl ml-auto">
            {project.billingMethod === "hourly"
              ? "This estimate is based on projected combined crew hours and materials. The final invoice may be adjusted to the actual combined labor hours and materials used."
              : "This is a fixed-price estimate for the described scope. Payment is due according to the terms, normally when the job is completed."}
          </p>
        </section>

        {photos.filter((photo) => photo.url).length > 0 && (
          <section>
            <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-3">
              Property photos
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos
                .filter((photo) => photo.url)
                .map((photo) => (
                  <figure key={photo.id} className="break-inside-avoid">
                    <img
                      src={photo.url}
                      alt={photo.caption || "Property photo"}
                      className="w-full aspect-[4/3] object-cover rounded-lg border border-gray-200"
                    />
                    {photo.caption && (
                      <figcaption className="text-xs text-gray-500 mt-1.5">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
            </div>
          </section>
        )}

        {(property?.clientNotes || project.clientNotes) && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-5">
            <p className="text-xs uppercase tracking-wider font-bold text-green-700 mb-2">
              Notes for the client
            </p>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap space-y-3">
              {property?.clientNotes && <p>{property.clientNotes}</p>}
              {project.clientNotes && <p>{project.clientNotes}</p>}
            </div>
          </section>
        )}

        {project.respondedAt && (
          <section className={`rounded-xl border p-5 ${
            project.estimateStatus === "accepted"
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}>
            <p className={`text-xs uppercase tracking-wider font-bold mb-2 ${
              project.estimateStatus === "accepted"
                ? "text-green-700"
                : "text-red-700"
            }`}>
              Client response — {project.estimateStatus}
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {project.responseName || "Client"}
            </p>
            {project.responseMessage && (
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                {project.responseMessage}
              </p>
            )}
            {project.signatureData && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Signature</p>
                <img
                  src={project.signatureData}
                  alt={`Signature from ${project.responseName || "client"}`}
                  className="max-h-24 max-w-xs object-contain bg-white rounded-lg border border-gray-200 px-3 py-2"
                />
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">
              Responded {new Date(project.respondedAt).toLocaleString("en-US")}
            </p>
          </section>
        )}

        {project.terms && (
          <section>
            <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-2">
              Terms
            </p>
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
              {project.terms}
            </p>
          </section>
        )}

        <footer className="border-t border-gray-200 pt-5 text-xs text-gray-400 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>This estimate is based on the described scope and may change if the scope changes.</p>
          <p className="font-semibold">Powered by YardPilotUSA</p>
        </footer>
      </div>
    </article>
  );
}
