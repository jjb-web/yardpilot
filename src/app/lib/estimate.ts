import type { LineItem, Project, Property } from "../data/types";

export function calculateEstimate(project: Pick<
  Project,
  | "lineItems"
  | "laborHours"
  | "laborRate"
  | "taxRate"
  | "discountAmount"
>) {
  const materials = project.lineItems.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost),
    0
  );
  const labor = Number(project.laborHours) * Number(project.laborRate);
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
