import type {
  Contact,
  Invoice,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";
import {
  combinedLaborHours,
  formatMoney,
  laborTotal,
  lineItemsTotal,
  propertyAddress,
} from "../lib/estimate";

function fullContactAddress(contact: Contact | null) {
  if (!contact) return "";
  const locality = [contact.city, contact.state, contact.zip]
    .filter(Boolean)
    .join(" ");
  return [contact.address, locality].filter(Boolean).join(", ");
}

export default function InvoiceDocument({
  invoice,
  company,
  contact,
  property,
  photos,
}: {
  invoice: Invoice;
  company: User;
  contact: Contact | null;
  property: Property | null;
  photos: PropertyPhoto[];
}) {
  const snapshot = invoice.estimateSnapshot;
  const lineItems = snapshot?.lineItems ?? [];
  const materials = lineItemsTotal(lineItems);
  const hours = snapshot
    ? combinedLaborHours({
        laborHours: snapshot.laborHours,
        laborAssignments: snapshot.laborAssignments,
      })
    : 0;
  const labor = snapshot
    ? laborTotal({
        laborHours: snapshot.laborHours,
        laborRate: snapshot.laborRate,
        laborAssignments: snapshot.laborAssignments,
      })
    : 0;
  const subtotal = materials + labor;
  const tax = subtotal * (Number(snapshot?.taxRate ?? 0) / 100);
  const discount = Number(snapshot?.discountAmount ?? 0);
  const address =
    propertyAddress(property) ||
    [snapshot?.address, snapshot?.city].filter(Boolean).join(", ") ||
    fullContactAddress(contact);

  return (
    <article className="invoice-print-root mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="p-6 sm:p-10">
        <header className="flex flex-col gap-7 border-b border-gray-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/yardpilot-logo.png"
                alt="YardPilotUSA"
                className="h-11 w-11 rounded-lg object-contain"
              />
              <div>
                <p className="text-xl font-extrabold text-gray-900">
                  {company.company || company.name || "YardPilotUSA"}
                </p>
                <p className="text-sm text-gray-500">Final invoice</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-gray-500">
              {company.name && <p>{company.name}</p>}
              {company.phone && <p>{company.phone}</p>}
              {company.email && <p>{company.email}</p>}
              {(company.city || company.state) && (
                <p>{[company.city, company.state].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              Invoice
            </p>
            <p className="mt-1 text-2xl font-extrabold text-gray-900">
              {invoice.invoiceNumber}
            </p>
            <div className="mt-3 space-y-1 text-sm text-gray-500">
              <p>Issued {new Date(`${invoice.issueDate}T12:00:00`).toLocaleDateString("en-US")}</p>
              <p>Due {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}</p>
              <p className="font-semibold capitalize text-gray-700">{invoice.status}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-gray-200 py-7 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Bill to
            </p>
            <p className="mt-2 font-bold text-gray-900">
              {contact?.name || snapshot?.client || "Customer"}
            </p>
            {contact?.email && <p className="mt-1 text-sm text-gray-500">{contact.email}</p>}
            {contact?.phone && <p className="text-sm text-gray-500">{contact.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Job / property
            </p>
            <p className="mt-2 font-bold text-gray-900">
              {snapshot?.name || property?.name || "Completed landscaping work"}
            </p>
            {address && <p className="mt-1 text-sm text-gray-500">{address}</p>}
            {snapshot?.projectType && (
              <p className="mt-1 text-sm text-gray-500">{snapshot.projectType}</p>
            )}
          </div>
        </section>

        {(snapshot?.aiEstimate || snapshot?.scopeDescription) && (
          <section className="py-7">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Work completed
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {snapshot.aiEstimate || snapshot.scopeDescription}
            </p>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={4}>
                    Final agreed landscaping services
                  </td>
                </tr>
              ) : (
                lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {item.description || "Service"}
                      {item.unit && (
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          / {item.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.qty}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatMoney(item.unitCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatMoney(item.qty * item.unitCost)}
                    </td>
                  </tr>
                ))
              )}
              {hours > 0 && (
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    Total combined labor hours
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{hours}</td>
                  <td className="px-4 py-3 text-right text-gray-400">Combined crew</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatMoney(labor)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-6 ml-auto max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-4 text-gray-600">
            <span>Materials and services</span>
            <span>{formatMoney(materials)}</span>
          </div>
          <div className="flex justify-between gap-4 text-gray-600">
            <span>Labor</span>
            <span>{formatMoney(labor)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between gap-4 text-gray-600">
              <span>Tax</span>
              <span>{formatMoney(tax)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between gap-4 text-gray-600">
              <span>Discount</span>
              <span>-{formatMoney(discount)}</span>
            </div>
          )}
          <div className="mt-3 flex items-end justify-between gap-4 border-t border-gray-200 pt-4">
            <span className="font-bold text-gray-900">Amount due</span>
            <span className="text-3xl font-extrabold text-gray-900">
              {formatMoney(invoice.amount)}
            </span>
          </div>
        </section>

        {photos.filter((photo) => photo.url).length > 0 && (
          <section className="mt-8 border-t border-gray-200 pt-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              Property photos
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos
                .filter((photo) => photo.url)
                .map((photo) => (
                  <figure key={photo.id}>
                    <img
                      src={photo.url}
                      alt={photo.caption || "Property"}
                      className="aspect-[4/3] w-full rounded-lg border border-gray-200 object-cover"
                    />
                    {photo.caption && (
                      <figcaption className="mt-1 text-xs text-gray-500">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
            </div>
          </section>
        )}

        {snapshot?.signatureData && (
          <section className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Accepted estimate
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {snapshot.responseName || "Client"}
            </p>
            <img
              src={snapshot.signatureData}
              alt="Client signature"
              className="mt-3 max-h-24 max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 object-contain"
            />
          </section>
        )}

        {invoice.notes && (
          <section className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Invoice notes
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {invoice.notes}
            </p>
          </section>
        )}

        <footer className="mt-8 flex flex-col gap-2 border-t border-gray-200 pt-5 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Thank you for your business.</p>
          <p className="font-semibold">Powered by YardPilotUSA</p>
        </footer>
      </div>
    </article>
  );
}
