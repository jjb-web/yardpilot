import type {
  LaborAssignment,
  LineItem,
  Project,
  Property,
} from "../data/types";

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
  const materials = project.lineItems.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost),
    0
  );
  const assignedLabor = laborAssignmentsTotal(project.laborAssignments ?? []);
  const legacyLabor = Number(project.laborHours) * Number(project.laborRate);
  const labor = project.laborAssignments?.length ? assignedLabor : legacyLabor;
  const subtotal = materials + labor;
  const tax = subtotal * (Number(project.taxRate) / 100);
  const discount = Math.max(0, Number(project.discountAmount));
  const total = Math.max(0, subtotal + tax - discount);

  return { materials, labor, subtotal, tax, discount, total };
}

export function lineItemsTotal(lineItems: LineItem[]) {
  return lineItems.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost),
    0
  );
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
