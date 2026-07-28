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
  const labor =
    Number(project.laborHours || 0) * Number(project.laborRate || 0);
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

  const location = project.address?.trim()
    ? ` at ${project.address.trim()}`
    : "";
  const customer = project.client?.trim()
    ? ` for ${project.client.trim()}`
    : "";

  const breakdownParts = [
    materials > 0 ? `${money(materials)} in materials and services` : "",
    labor > 0
      ? `${money(labor)} in labor (${Number(project.laborHours || 0)} hours)`
      : "",
    tax > 0 ? `${money(tax)} in tax` : "",
    discount > 0 ? `${money(discount)} discount` : "",
  ].filter(Boolean);

  const breakdown = breakdownParts.length
    ? `The cost breakdown includes ${breakdownParts.join(", ")}, for an estimated total of ${money(total)}.`
    : `The current estimated total is ${money(total)}.`;

  return `${workSummary} This estimate is prepared${customer}${location}. ${breakdown} Final pricing may change if the scope, quantities, access conditions, or requested work changes.`;
}
