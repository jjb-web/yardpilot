import type { EstimateJob, ProjectBillingMethod } from "../data/types";
import { formatMoney } from "./estimate";

type DescriptionInput = {
  estimateName: string;
  clientName: string;
  address: string;
  city: string;
  billingMethod: ProjectBillingMethod;
  jobs: EstimateJob[];
  total: number;
};

function pick<T>(values: readonly T[]): T {
  const index = Math.floor(Math.random() * values.length);
  return values[index] ?? values[0]!;
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hoursFor(job: EstimateJob) {
  return job.laborAssignments.length
    ? job.laborAssignments.reduce(
        (sum, assignment) => sum + Number(assignment.hours || 0),
        0
      )
    : Number(job.laborHours || 0);
}

function jobSpecificSentence(job: EstimateJob) {
  const searchable = `${job.title} ${job.projectType} ${job.scopeDescription}`.toLowerCase();
  const title = clean(job.title) || clean(job.projectType) || "the listed work";
  const verbs: string[] = [];

  if (/mow|lawn|edg/.test(searchable)) {
    verbs.push(
      "mowing the designated lawn areas, trimming edges, and leaving hard surfaces clean",
      "cutting and edging the lawn areas shown in the scope, followed by a tidy site cleanup",
      "completing the scheduled lawn service with attention to borders, obstacles, and finished appearance"
    );
  }
  if (/mulch|bed|garden/.test(searchable)) {
    verbs.push(
      "preparing the identified beds and placing material to an even, finished depth",
      "servicing the landscape beds, distributing materials evenly, and cleaning adjacent surfaces",
      "completing the bed work described in the scope with a clean transition around plants and borders"
    );
  }
  if (/clean|leaf|debris|brush/.test(searchable)) {
    verbs.push(
      "collecting and removing the listed debris while leaving the work areas orderly",
      "completing the requested cleanup in the identified areas and hauling or staging debris as specified",
      "clearing the described material and finishing with a thorough site cleanup"
    );
  }
  if (/irrig|sprinkler/.test(searchable)) {
    verbs.push(
      "inspecting and completing the listed irrigation work, then checking the affected zones for proper operation",
      "performing the specified irrigation service and testing the completed work before departure",
      "addressing the described irrigation items with attention to coverage, leaks, and final system operation"
    );
  }
  if (/paver|patio|walkway|hardscape|retaining/.test(searchable)) {
    verbs.push(
      "preparing the work area, installing the specified hardscape materials, and completing final alignment and cleanup",
      "constructing the described hardscape area in the planned layout with attention to base preparation and finish",
      "completing the listed installation steps and leaving the surrounding area clean and ready for use"
    );
  }
  if (/tree|shrub|prun|trim/.test(searchable)) {
    verbs.push(
      "performing the specified pruning or plant-care work and removing resulting debris",
      "shaping and servicing the identified plants according to the listed scope, followed by cleanup",
      "completing the requested tree and shrub work with attention to access, appearance, and debris removal"
    );
  }
  if (/pressure|wash/.test(searchable)) {
    verbs.push(
      "cleaning the designated surfaces and completing a final rinse of the surrounding work area",
      "pressure washing the listed areas with attention to edges, buildup, and adjacent surfaces",
      "performing the described exterior cleaning and leaving the work area ready for normal use"
    );
  }
  if (/sod|turf|seed|aerat|dethatch|fertiliz|weed/.test(searchable)) {
    verbs.push(
      "completing the specified turf-care work and applying or installing the listed materials evenly",
      "servicing the lawn areas according to the listed treatment or installation scope",
      "performing the requested turf work with attention to even coverage and site cleanup"
    );
  }

  const general = [
    `completing the work described for ${title} and leaving the area clean`,
    `performing the listed tasks for ${title} with attention to the saved property details and scope`,
    `carrying out ${title} according to the quantities, instructions, and schedule included in this estimate`,
  ];

  const task = pick(verbs.length ? verbs : general);
  const extras: string[] = [];
  if (job.squareFootage > 0) {
    extras.push(
      `${job.squareFootage.toLocaleString("en-US")} square feet are included in this portion of the work`
    );
  }
  const hours = hoursFor(job);
  if (hours > 0) {
    extras.push(`${hours.toLocaleString("en-US")} estimated combined labor hours are planned`);
  }
  const materialCount = job.lineItems.filter(
    (item) => item.description.trim() && (item.qty > 0 || item.unitCost > 0)
  ).length;
  if (materialCount > 0) {
    extras.push(
      `${materialCount} ${materialCount === 1 ? "material or service line is" : "material or service lines are"} included`
    );
  }

  return `${title} includes ${task}${extras.length ? `; ${extras.join("; ")}` : ""}.`;
}

function scaleSentence(total: number, jobCount: number) {
  if (total < 250) {
    return pick([
      "This is a focused service visit intended to address the specific items listed below.",
      "The estimate covers a targeted scope with a straightforward service plan.",
      "This proposal is sized for a limited, clearly defined service visit.",
    ]);
  }
  if (total < 1_000) {
    return pick([
      "The work is organized as a focused property-service project with the listed labor and materials.",
      "This estimate covers a defined service scope and the resources expected to complete it.",
      "The project is structured around the listed tasks, quantities, and combined labor requirements.",
    ]);
  }
  if (total < 5_000) {
    return pick([
      "This is a multi-step property improvement with labor, materials, and scheduling coordinated as one estimate.",
      "The proposed work combines the listed services into a coordinated project plan.",
      "This estimate organizes the required crew time and materials into a complete project scope.",
    ]);
  }
  if (total < 15_000) {
    return pick([
      "This is a substantial property project that will require coordinated labor, materials, and site sequencing.",
      "The scope represents a larger property improvement with several resources planned together.",
      "The work is structured as a coordinated project with the listed job phases and combined labor requirements.",
    ]);
  }
  return pick([
    "This is a large coordinated property project with multiple work phases, crew requirements, and material quantities.",
    "The estimate covers a significant improvement project that will be organized across the listed job sections.",
    "The proposed scope is a major property project requiring coordinated scheduling, labor, and materials.",
  ]).replace("multiple", jobCount > 1 ? "multiple" : "detailed");
}

export function generateEstimateDescription(input: DescriptionInput) {
  const jobs = input.jobs.filter((job) => job.title.trim() || job.scopeDescription.trim());
  const location = clean([input.address, input.city].filter(Boolean).join(", "));
  const client = clean(input.clientName);
  const name = clean(input.estimateName) || "the proposed work";

  const openings = [
    `This estimate outlines ${name}${client ? ` for ${client}` : ""}${location ? ` at ${location}` : ""}.`,
    `The proposed scope for ${name}${location ? ` at ${location}` : ""} is summarized below.`,
    `${client ? `${client}'s` : "This"} estimate combines the described work into one clear project plan${location ? ` for ${location}` : ""}.`,
  ];

  const workSentences = jobs.map(jobSpecificSentence);
  const billing =
    input.billingMethod === "hourly"
      ? pick([
          "Pricing is based on the estimated combined labor hours and listed materials; the final invoice may reflect the actual work completed.",
          "The total uses projected combined labor time and materials, with final billing adjusted to the actual completed scope when appropriate.",
          "Labor is estimated as combined crew hours, and final time-and-material billing may vary with actual site conditions and work performed.",
        ])
      : pick([
          "The listed total is the fixed price for the described scope, subject to approved changes or unforeseen site conditions.",
          "This fixed-price estimate covers the work described below unless the customer approves a change in scope.",
          "The combined total applies to the stated scope and may change only for approved additions or unexpected site conditions.",
        ]);

  const closing = pick([
    "Scheduling can be confirmed after approval.",
    "Work can be scheduled once the estimate is accepted.",
    "Approval allows the team to confirm timing and prepare the listed resources.",
    `The current estimated total is ${formatMoney(input.total)}, with scheduling finalized after acceptance.`,
  ]);

  return [
    `${pick(openings)} ${scaleSentence(input.total, jobs.length || 1)}`,
    workSentences.join(" "),
    `${billing} ${closing}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
