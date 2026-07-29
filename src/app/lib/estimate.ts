import type {
  LaborAssignment,
  LineItem,
  Project,
  Property,
} from "../data/types";

/** Internal payroll estimate. This is never shown on client documents. */
export function laborAssignmentsTotal(assignments: LaborAssignment[]) {
  return assignments.reduce(
    (sum, assignment) =>
      sum + Number(assignment.hours || 0) * Number(assignment.hourlyRate || 0),
    0
  );
}

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

/** Customer-facing material/service revenue. */
export function lineItemsTotal(lineItems: LineItem[]) {
  return lineItems.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost),
    0
  );
}

/** Internal material/service cost. */
export function lineItemsInternalCost(lineItems: LineItem[]) {
  return lineItems.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.internalCost || 0),
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
    | "internalOtherCost"
  >
) {
  const materials = lineItemsTotal(project.lineItems);
  const hours = combinedLaborHours(project);

  // laborRate is the customer-facing billable crew rate. Individual team rates
  // in laborAssignments are internal payroll costs only.
  const labor = hours * Number(project.laborRate || 0);
  const subtotal = materials + labor;
  const tax = subtotal * (Number(project.taxRate) / 100);
  const discount = Math.max(0, Number(project.discountAmount));
  const total = Math.max(0, subtotal + tax - discount);

  const materialCost = lineItemsInternalCost(project.lineItems);
  const laborCost = laborAssignmentsTotal(project.laborAssignments ?? []);
  const otherCost = Math.max(0, Number(project.internalOtherCost || 0));
  const estimatedCost = materialCost + laborCost + otherCost;
  const grossProfit = total - estimatedCost;
  const marginPercent = total > 0 ? (grossProfit / total) * 100 : 0;

  return {
    materials,
    labor,
    hours,
    subtotal,
    tax,
    discount,
    total,
    materialCost,
    laborCost,
    otherCost,
    estimatedCost,
    grossProfit,
    marginPercent,
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
