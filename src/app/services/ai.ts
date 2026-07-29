import type { Project } from "../data/types";

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function sentenceList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

/**
 * Builds a clean client-facing description from estimate data.
 * This is deterministic and does not call an external AI service.
 */
export async function generateEstimate(
  project: Partial<Project>
): Promise<string> {
  await new Promise((resolve) => window.setTimeout(resolve, 250));

  const items = project.lineItems ?? [];
  const materials = items.reduce(
    (sum, item) =>
      sum + Number(item.qty || 0) * Number(item.unitCost || 0),
    0
  );
  const laborAssignments = project.laborAssignments ?? [];
  const combinedHours = laborAssignments.length
    ? laborAssignments.reduce(
        (sum, assignment) => sum + Number(assignment.hours || 0),
        0
      )
    : Number(project.laborHours || 0);
  // Individual assignment rates are internal payroll costs. The customer-facing
  // labor charge uses the estimate's combined billable crew rate.
  const labor = combinedHours * Number(project.laborRate || 0);

  const subtotal = materials + labor;
  const tax = subtotal * (Number(project.taxRate || 0) / 100);
  const discount = Math.max(0, Number(project.discountAmount || 0));
  const total = Math.max(0, subtotal + tax - discount);

  const describedItems = items
    .filter((item) => item.description.trim())
    .slice(0, 5)
    .map((item) => {
      const quantity = Number(item.qty || 0);
      const unit = item.unit.trim() || "unit";
      return quantity > 0
        ? `${quantity.toLocaleString("en-US")} ${unit} of ${item.description.trim()}`
        : item.description.trim();
    });

  const jobType = project.projectType?.trim() || "landscaping service";
  const scope = project.scopeDescription?.trim();
  const workSummary = scope
    ? scope
    : describedItems.length
      ? `The proposed ${jobType.toLowerCase()} work includes ${sentenceList(describedItems)}.`
      : `The proposed work covers the listed ${jobType} services.`;

  const destination = [project.address?.trim(), project.city?.trim()]
    .filter(Boolean)
    .join(", ");
  const clientLine = project.client?.trim()
    ? `This estimate is prepared for ${project.client.trim()}${
        destination ? ` at ${destination}` : ""
      }.`
    : destination
      ? `The work location is ${destination}.`
      : "";

  if (total === 0 && materials === 0 && labor === 0) {
    return [
      workSummary,
      clientLine,
      "Pricing has not been entered yet, so this description does not state a final total. Add material quantities, employee hours, or a fixed price before sending the estimate to the customer.",
      "Final pricing may change if the scope, quantities, access conditions, or requested work changes.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const breakdown: string[] = [];
  if (materials > 0) breakdown.push(`${money(materials)} in materials and services`);
  if (labor > 0) {
    breakdown.push(
      `${money(labor)} in combined labor${
        combinedHours > 0
          ? ` across ${combinedHours.toLocaleString("en-US")} total crew hours`
          : ""
      }`
    );
  }
  if (tax > 0) breakdown.push(`${money(tax)} in tax`);
  if (discount > 0) breakdown.push(`${money(discount)} in discounts`);

  const priceContext =
    total < 250
      ? "This is a very small estimate, so confirm that all minimum service charges, travel, disposal, and setup time are included."
      : total < 1000
        ? "This falls within a smaller service range and is likely driven by a limited scope or short visit."
        : total < 5000
          ? "This is a moderate landscaping estimate with a typical mix of labor and materials."
          : total < 15000
            ? "This is a larger project estimate, so supplier pricing, site access, and scheduling should be confirmed before work begins."
            : "This is a substantial project estimate; verify quantities, supplier quotes, access conditions, and the planned crew schedule before final approval.";

  let driver = "";
  if (subtotal > 0 && materials > 0 && labor > 0) {
    const materialShare = Math.round((materials / subtotal) * 100);
    const laborShare = Math.round((labor / subtotal) * 100);
    if (materialShare >= 60) {
      driver = `Materials are the primary cost driver at about ${materialShare}% of the pre-tax subtotal.`;
    } else if (laborShare >= 60) {
      driver = `Labor is the primary cost driver at about ${laborShare}% of the pre-tax subtotal.`;
    } else {
      driver = `The pre-tax cost is balanced between materials and labor (${materialShare}% materials and ${laborShare}% labor).`;
    }
  } else if (materials > 0) {
    driver = "The entered price is currently driven entirely by materials and service items.";
  } else if (labor > 0) {
    driver = "The entered price is currently driven entirely by combined crew labor.";
  }

  const pricingMethod =
    project.billingMethod === "hourly"
      ? "Pricing is based on estimated combined crew hours and materials, and the final invoice may reflect the actual hours and materials used."
      : "This is a fixed-price estimate for the described scope, with payment due according to the stated job-completion terms.";

  return [
    workSummary,
    clientLine,
    `The current price breakdown includes ${sentenceList(breakdown)}, producing an estimated total of ${money(total)}.`,
    driver,
    priceContext,
    pricingMethod,
    "Final pricing may change if the scope, quantities, access conditions, or requested work changes.",
  ]
    .filter(Boolean)
    .join(" ");
}
