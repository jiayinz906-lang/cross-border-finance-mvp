import fs from "node:fs";
import path from "node:path";

type FloatField = {
  model: string;
  field: string;
  currentType: string;
  targetType: string;
  category: "money" | "rate" | "score";
};

const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
const schema = fs.readFileSync(schemaPath, "utf8");
const fields: FloatField[] = [];
let currentModel = "";

function targetFor(model: string, field: string) {
  if (field === "score") return { category: "score" as const, targetType: "Decimal @db.Decimal(9,6)" };
  if (/rate/i.test(field) && !(model === "OperatorPerformanceOverride" && field === "rate")) {
    return { category: "rate" as const, targetType: "Decimal @db.Decimal(18,8)" };
  }
  return { category: "money" as const, targetType: "Decimal @db.Decimal(24,8)" };
}

for (const rawLine of schema.split(/\r?\n/)) {
  const modelMatch = rawLine.match(/^model\s+(\w+)\s*\{/);
  if (modelMatch) {
    currentModel = modelMatch[1];
    continue;
  }
  if (currentModel && rawLine.trim() === "}") {
    currentModel = "";
    continue;
  }
  if (!currentModel) continue;

  const fieldMatch = rawLine.match(/^\s+(\w+)\s+(Float\??)\b/);
  if (!fieldMatch) continue;
  const [, field, currentType] = fieldMatch;
  fields.push({ model: currentModel, field, currentType, ...targetFor(currentModel, field) });
}

const byCategory = fields.reduce<Record<string, number>>((result, item) => {
  result[item.category] = (result[item.category] ?? 0) + 1;
  return result;
}, {});

console.log(`Financial precision audit: ${fields.length} Float fields remain in ${schemaPath}`);
console.log(`Categories: ${JSON.stringify(byCategory)}`);
console.table(fields);
console.log("Migration is intentionally staged. See DECIMAL_MIGRATION_PLAN.md before changing production columns.");

if (process.argv.includes("--strict") && fields.length > 0) process.exitCode = 1;
