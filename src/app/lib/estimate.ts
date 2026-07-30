import type {
  LaborAssignment,
  LineItem,
  Project,
  Property,
} from "../data/types";

export function combinedLaborHours(
  project: Pick<Project, "laborHours" | "laborAssignments">
) {
  return project.laborAssignments?.length
    ? project.laborAssignments.reduce(
        (sum, assignment) => sum + Number(assignment.hours || 0),
        0
      )
    : Number(project.laborHours || 0);
}

/**
 * Customer-facing labor total.
 *
 * When workers are assigned, each worker's hours are multiplied by that
 * worker's estimate rate. If no workers are assigned, the estimate falls back
 * to the manual labor hours and hourly rate fields.
 */
export function laborTotal(
  project: Pick<
    Project,
    "laborHours" | "laborRate" | "laborAssignments"
  >
) {
  if (project.laborAssignments?.length) {
    return project.laborAssignments.reduce(
      (sum, assignment) =>
        sum +
        Number(assignment.hours || 0) *
          Number(assignment.hourlyRate || 0),
      0
    );
  }

  return (
    Number(project.laborHours || 0) *
    Number(project.laborRate || 0)
  );
}

export function lineItemsTotal(lineItems: LineItem[]) {
  return lineItems.reduce(
    (sum, item) =>
      sum + Number(item.qty || 0) * Number(item.unitCost || 0),
    0
  );
}

export function calculateEstimate(
  project: Pick<
    Project,
    | "lineItems"
    | "laborHours"
    | "laborRate"
    | "laborAssignments"
    | "taxRate"
    | "discountAmount"
  >
) {
  const materials = lineItemsTotal(project.lineItems);
  const hours = combinedLaborHours(project);
  const labor = laborTotal(project);
  const subtotal = materials + labor;
  const tax = subtotal * (Number(project.taxRate || 0) / 100);
  const discount = Math.max(0, Number(project.discountAmount || 0));
  const total = Math.max(0, subtotal + tax - discount);

  return {
    materials,
    labor,
    hours,
    subtotal,
    tax,
    discount,
    total,
  };
}

export function propertyAddress(property: Property | null | undefined) {
  if (!property) return "";
  const cityStateZip = [property.city, property.state, property.zip]
    .filter(Boolean)
    .join(" ");
  return [property.address, cityStateZip].filter(Boolean).join(", ");
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

export function estimateShareUrl(shareToken: string) {
  return `${window.location.origin}/estimate/share/${shareToken}`;
}

export function invoiceShareUrl(shareToken: string) {
  return `${window.location.origin}/invoice/share/${shareToken}`;
}
