const DIRECT_BLOCKLIST = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "faggot",
  "nigger",
  "nigga",
  "kike",
  "spic",
  "chink",
  "retard",
  "whore",
  "slut",
];

const SYMBOL_MAP: Record<string, string> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "3": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "+": "t",
};

export type ContentSafetyResult = {
  safe: boolean;
  message: string;
};

export function normalizeForModeration(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .split("")
    .map((character) => SYMBOL_MAP[character] ?? character)
    .join("")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(.)\1+/g, "$1");
}

export function checkTextSafety(value: string, fieldLabel = "This field"): ContentSafetyResult {
  const normalized = normalizeForModeration(value);
  if (!normalized) return { safe: true, message: "" };

  const match = DIRECT_BLOCKLIST.find((blocked) =>
    normalized.includes(normalizeForModeration(blocked))
  );

  if (!match) return { safe: true, message: "" };
  return {
    safe: false,
    message: `${fieldLabel} contains language that is not allowed. Edit the wording and try again.`,
  };
}

export function assertSafeText(value: string, fieldLabel = "This field") {
  const result = checkTextSafety(value, fieldLabel);
  if (!result.safe) throw new Error(result.message);
}

export function assertSafeValues(
  values: Array<{ value: string | null | undefined; label: string }>
) {
  for (const item of values) {
    assertSafeText(item.value ?? "", item.label);
  }
}
