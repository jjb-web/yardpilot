import type { Project } from "../data/types";

// Replace this with your actual API key to enable real AI estimates.
// For production, load from an environment variable (VITE_ANTHROPIC_KEY).
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

export async function generateEstimate(project: Partial<Project>): Promise<string> {
  const materialsCost = (project.lineItems || []).reduce(
    (sum, item) => sum + item.qty * item.unitCost,
    0
  );
  const laborCost = (project.laborHours || 0) * (project.laborRate || 0);
  const totalCost = materialsCost + laborCost;

  if (!API_KEY) {
    // Fallback mock when no API key is configured
    await new Promise((r) => setTimeout(r, 1200));
    return generateMockEstimate(project, materialsCost, laborCost, totalCost);
  }

  const prompt = `You are a landscaping business estimating assistant. Based on this project data, provide a concise professional estimate summary (3-5 sentences max). Include cost breakdown insight, any risks or recommendations, and a suggested total range.

Project: ${project.name}
Type: ${project.projectType}
Location: ${project.address}
Square footage: ${project.squareFootage} sq ft
Labor: ${project.laborHours} hours at $${project.laborRate}/hr = $${laborCost.toFixed(0)}
Materials total: $${materialsCost.toFixed(0)}
Line items: ${(project.lineItems || []).map((i) => `${i.description}: ${i.qty} ${i.unit} @ $${i.unitCost}`).join(", ")}
Notes: ${project.notes}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    return data.content?.[0]?.text || generateMockEstimate(project, materialsCost, laborCost, totalCost);
  } catch {
    return generateMockEstimate(project, materialsCost, laborCost, totalCost);
  }
}

function generateMockEstimate(
  project: Partial<Project>,
  materialsCost: number,
  laborCost: number,
  totalCost: number
): string {
  const low = Math.round(totalCost * 0.95);
  const high = Math.round(totalCost * 1.12);
  const laborPct = totalCost > 0 ? Math.round((laborCost / totalCost) * 100) : 0;
  const sqft = project.squareFootage || 0;
  const perSqft = sqft > 0 ? (totalCost / sqft).toFixed(2) : "N/A";

  return `Based on the project scope, estimated total is $${low.toLocaleString()}–$${high.toLocaleString()}. Labor accounts for approximately ${laborPct}% of the cost at $${laborCost.toLocaleString()}, with materials at $${materialsCost.toLocaleString()}. Cost per square foot works out to ~$${perSqft}. ${
    materialsCost > laborCost
      ? "Material costs are driving the majority of this estimate — confirm supplier pricing before finalizing the proposal."
      : "Labor is the primary cost driver — consider crew scheduling and weather windows when planning the timeline."
  } Recommend adding a 10% contingency buffer before presenting to the client.`;
}
