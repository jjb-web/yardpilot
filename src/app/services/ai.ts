import type { Project } from "../data/types";

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/**
 * Builds a clean estimate description from structured estimate data.
 * This is intentionally deterministic and does not call an AI service.
 */
export async function generateEstimate(
  project: Partial<Project>
): Promise<string> {
  await new Promise((resolve) => window.setTimeout(resolve, 250));

  const items = project.lineItems ?? [];
  const materials = items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0),
    0
  );
  const laborAssignments = project.laborAssignments ?? [];
  const assignedLabor = laborAssignments.reduce(
    (sum, assignment) =>
      sum + Number(assignment.hours || 0) * Number(assignment.hourlyRate || 0),
    0
  );
  const labor = laborAssignments.length
    ? assignedLabor
    : Number(project.laborHours || 0) * Number(project.laborRate || 0);
  const subtotal = materials + labor;
  const tax = subtotal * (Number(project.taxRate || 0) / 100);
  const discount = Number(project.discountAmount || 0);
  const total = Math.max(0, subtotal + tax - discount);

  const itemDescriptions = items
    .filter((item) => item.description.trim())
    .slice(0, 5)
    .map((item) => `${item.qty} ${item.unit} of ${item.description.trim()}`);

  const scope = project.scopeDescription?.trim();
  const workSummary = scope
    ? scope
    : itemDescriptions.length
      ? `The proposed work includes ${itemDescriptions.join(", ")}.`
      : `The proposed work covers the listed ${project.projectType || "landscaping"} services.`;

  const locationText = [project.address?.trim(), project.city?.trim()]
    .filter(Boolean)
    .join(", ");
  const location = locationText ? ` at ${locationText}` : "";
  const customer = project.client?.trim()
    ? ` for ${project.client.trim()}`
    : "";

  const breakdownParts = [
    materials > 0 ? `${money(materials)} in materials and services` : "",
    labor > 0
      ? `${money(labor)} in labor (${laborAssignments.length
          ? laborAssignments.reduce(
              (sum, assignment) => sum + Number(assignment.hours || 0),
              0
            )
          : Number(project.laborHours || 0)} hours)`
      : "",
    tax > 0 ? `${money(tax)} in tax` : "",
    discount > 0 ? `${money(discount)} discount` : "",
  ].filter(Boolean);

  const breakdown = breakdownParts.length
    ? `The cost breakdown includes ${breakdownParts.join(", ")}, for an estimated total of ${money(total)}.`
    : `The current estimated total is ${money(total)}.`;

  const pricing =
    project.billingMethod === "hourly"
      ? "Pricing is based on estimated combined crew hours and materials; the final invoice may reflect actual hours and materials used."
      : "This is a fixed-price estimate for the described scope, with payment due according to the stated job-completion terms.";

  return `${workSummary} This estimate is prepared${customer}${location}. ${breakdown} ${pricing} Final pricing may change if the scope, quantities, access conditions, or requested work changes.`;
}
