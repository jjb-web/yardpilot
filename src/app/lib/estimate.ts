import type {
  EstimateJob,
  LaborAssignment,
  LineItem,
  Project,
  Property,
} from "../data/types";

export function assignmentHours(assignments: LaborAssignment[]) {
  return assignments.reduce(
    (sum, assignment) => sum + Number(assignment.hours || 0),
    0
  );
}

export function assignmentLabor(assignments: LaborAssignment[]) {
  return assignments.reduce(
    (sum, assignment) =>
      sum +
      Number(assignment.hours || 0) * Number(assignment.hourlyRate || 0),
    0
  );
}

export function combinedLaborHours(
  project: Pick<Project, "laborHours" | "laborAssignments" | "jobSections">
) {
  if (project.jobSections?.length) {
    return project.jobSections.reduce((sum, job) => {
      const hours = job.laborAssignments?.length
        ? assignmentHours(job.laborAssignments)
        : Number(job.laborHours || 0);
      return sum + hours;
    }, 0);
  }

  return project.laborAssignments?.length
    ? assignmentHours(project.laborAssignments)
    : Number(project.laborHours || 0);
}

export function laborTotal(
  project: Pick<
    Project,
    "laborHours" | "laborRate" | "laborAssignments" | "jobSections"
  >
) {
  if (project.jobSections?.length) {
    return project.jobSections.reduce((sum, job) => {
      if (job.laborAssignments?.length) {
        return sum + assignmentLabor(job.laborAssignments);
      }
      return sum + Number(job.laborHours || 0) * Number(job.laborRate || 0);
    }, 0);
  }

  if (project.laborAssignments?.length) {
    return assignmentLabor(project.laborAssignments);
  }

  return Number(project.laborHours || 0) * Number(project.laborRate || 0);
}

export function lineItemsTotal(lineItems: LineItem[]) {
  return lineItems.reduce(
    (sum, item) =>
      sum + Number(item.qty || 0) * Number(item.unitCost || 0),
    0
  );
}

export function jobMaterialsTotal(job: EstimateJob) {
  return (
    lineItemsTotal(job.lineItems ?? []) +
    Number(job.squareFootage || 0) * Number(job.pricePerSquareFoot || 0)
  );
}

export function calculateJob(job: EstimateJob) {
  const materials = jobMaterialsTotal(job);
  const hours = job.laborAssignments?.length
    ? assignmentHours(job.laborAssignments)
    : Number(job.laborHours || 0);
  const labor = job.laborAssignments?.length
    ? assignmentLabor(job.laborAssignments)
    : Number(job.laborHours || 0) * Number(job.laborRate || 0);

  return {
    materials,
    labor,
    hours,
    subtotal: materials + labor,
  };
}

export function calculateEstimate(
  project: Pick<
    Project,
    | "lineItems"
    | "laborHours"
    | "laborRate"
    | "laborAssignments"
    | "jobSections"
    | "taxRate"
    | "discountAmount"
  >
) {
  const hasJobs = Boolean(project.jobSections?.length);
  const materials = hasJobs
    ? project.jobSections.reduce(
        (sum, job) => sum + jobMaterialsTotal(job),
        0
      )
    : lineItemsTotal(project.lineItems);
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
