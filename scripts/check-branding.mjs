import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const includeDist = process.argv.includes("--dist");

const skippedDirectories = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".vercel",
  ".supabase",
  "backups",
  ".next",
  ...(includeDist ? [] : ["dist"]),
]);

const allowedExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".html", ".css", ".scss", ".sass",
  ".json", ".webmanifest", ".md", ".txt",
  ".xml", ".svg", ".yml", ".yaml", ".toml",
]);

const exactNames = new Set([
  "package.json",
  "index.html",
  "README",
  "README.md",
  "README.txt",
  "SECURITY.md",
  "CHANGELOG.md",
  "ATTRIBUTIONS.md",
  "MANUAL-SETTINGS.md",
  "TEST-CHECKLIST.md",
  "IMPLEMENTED.md",
  "FIXES-APPLIED.md",
  ".env.example",
]);

const legacyPatterns = [
  {
    label: "standalone YardPilot",
    regex: /(?<![A-Za-z0-9_])YardPilot(?![A-Za-z0-9_])/g,
  },
  {
    label: "incorrect Yardpilot capitalization",
    regex: /(?<![A-Za-z0-9_])Yardpilot(?![A-Za-z0-9_])/g,
  },
  {
    label: "spaced YardPilot USA",
    regex: /YardPilot USA/g,
  },
];

function isSkipped(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");

  // Do not scan the checker itself; it intentionally contains the legacy
  // spelling inside detection expressions.
  if (normalized === "scripts/check-branding.mjs") {
    return true;
  }

  const parts = relativePath.split(path.sep);
  if (parts.some((part) => skippedDirectories.has(part))) {
    return true;
  }

  // Internal SQL identifiers and migration history are intentionally excluded.
  return parts[0] === "supabase" && parts[1] === "sql";
}

function isEligible(relativePath) {
  const basename = path.basename(relativePath);
  return exactNames.has(basename) ||
    allowedExtensions.has(path.extname(relativePath).toLowerCase());
}

async function walk(directory, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);

    if (isSkipped(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(absolute, output);
    } else if (entry.isFile() && isEligible(relative)) {
      output.push({ absolute, relative });
    }
  }

  return output;
}

const failures = [];
const files = await walk(root);

for (const file of files) {
  let content;

  try {
    content = await readFile(file.absolute, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of legacyPatterns) {
      pattern.regex.lastIndex = 0;

      if (pattern.regex.test(lines[index])) {
        failures.push(
          `${file.relative}:${index + 1}: ${pattern.label}: ${lines[index].trim()}`
        );
      }
    }
  }
}

async function requireText(fileName, expected) {
  const absolute = path.join(root, fileName);

  try {
    const content = await readFile(absolute, "utf8");
    if (!content.includes(expected)) {
      failures.push(
        `${fileName}: expected branding was not found: ${expected}`
      );
    }
  } catch {
    failures.push(`${fileName}: required branding file is missing`);
  }
}

await requireText("index.html", "<title>YardPilotUSA</title>");
await requireText(
  "index.html",
  'name="application-name" content="YardPilotUSA"'
);
await requireText(
  "index.html",
  'name="apple-mobile-web-app-title" content="YardPilotUSA"'
);
await requireText(
  "public/site.webmanifest",
  '"name": "YardPilotUSA"'
);
await requireText(
  "public/site.webmanifest",
  '"short_name": "YardPilotUSA"'
);

if (failures.length > 0) {
  console.error("\nBranding verification FAILED.\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "\nInternal lowercase identifiers such as yardpilot_* are deliberately allowed."
  );
  process.exit(1);
}

console.log(
  `Branding verification passed across ${files.length} text files.`
);
console.log(
  "Visible application branding is consistently YardPilotUSA."
);
