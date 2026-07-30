import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argumentValue } from "./lib/runtime-config.js";
import type { MigrationManifest } from "./lib/migration-manifest.js";

export type FindingLevel = "一致" | "警告" | "阻断";
export type MigrationFinding = {
  level: FindingLevel;
  field: string;
  source: unknown;
  target: unknown;
};

export type MigrationComparisonReport = {
  formatVersion: 1;
  generatedAt: string;
  result: "pass" | "warning" | "blocked";
  summary: { consistent: number; warnings: number; blockers: number };
  findings: MigrationFinding[];
};

function readManifest(fileName: string) {
  const absolute = path.resolve(process.cwd(), fileName);
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as MigrationManifest;
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported migration manifest format: ${parsed.formatVersion}`);
  }
  return parsed;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function add(findings: MigrationFinding[], field: string, source: unknown, target: unknown, mismatchLevel: Exclude<FindingLevel, "一致">) {
  findings.push({
    level: stable(source) === stable(target) ? "一致" : mismatchLevel,
    field,
    source,
    target
  });
}

function compareRecord(
  findings: MigrationFinding[],
  prefix: string,
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  mismatchLevel: Exclude<FindingLevel, "一致">
) {
  for (const key of [...new Set([...Object.keys(source), ...Object.keys(target)])].sort()) {
    add(findings, `${prefix}.${key}`, source[key], target[key], mismatchLevel);
  }
}

export function compareMigrationManifests(source: MigrationManifest, target: MigrationManifest): MigrationComparisonReport {
  const findings: MigrationFinding[] = [];

  // Counts and primary-key ranges protect against silent row loss or duplication.
  compareRecord(findings, "tables", source.tables, target.tables, "阻断");
  compareRecord(findings, "financialTotals", source.financialTotals, target.financialTotals, "阻断");
  compareRecord(findings, "specialCounts", source.specialCounts, target.specialCounts, "阻断");
  compareRecord(findings, "monthlyOrderCounts", source.monthlyOrderCounts, target.monthlyOrderCounts, "阻断");
  add(findings, "monthCloseStates", source.monthCloseStates, target.monthCloseStates, "阻断");
  add(findings, "migrations", source.migrations, target.migrations, "阻断");

  // These differences do not prove financial data loss, but must be reviewed.
  add(findings, "schemaSha256", source.schemaSha256, target.schemaSha256, "警告");
  add(findings, "database.encoding", source.database.encoding, target.database.encoding, "警告");
  add(findings, "database.timezone", source.database.timezone, target.database.timezone, "警告");
  add(findings, "database.collation", source.database.collation, target.database.collation, "警告");
  add(findings, "gitSha", source.gitSha, target.gitSha, "警告");

  const summary = {
    consistent: findings.filter((item) => item.level === "一致").length,
    warnings: findings.filter((item) => item.level === "警告").length,
    blockers: findings.filter((item) => item.level === "阻断").length
  };

  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    result: summary.blockers > 0 ? "blocked" : summary.warnings > 0 ? "warning" : "pass",
    summary,
    findings
  };
}

function writeReport(report: MigrationComparisonReport, outputPath: string) {
  const absolute = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return absolute;
}

function printReport(report: MigrationComparisonReport) {
  for (const level of ["阻断", "警告", "一致"] as const) {
    const rows = report.findings.filter((row) => row.level === level);
    console.log(`\n${level} (${rows.length})`);
    for (const row of rows) console.log(`- ${row.field}: ${JSON.stringify(row.source)} -> ${JSON.stringify(row.target)}`);
  }
  console.log(`\n迁移核对结果：${report.result}; 阻断 ${report.summary.blockers}; 警告 ${report.summary.warnings}; 一致 ${report.summary.consistent}`);
}

function main() {
  const sourcePath = argumentValue("source");
  const targetPath = argumentValue("target");
  if (!sourcePath || !targetPath) throw new Error("--source and --target are required.");

  const report = compareMigrationManifests(readManifest(sourcePath), readManifest(targetPath));
  printReport(report);

  const output = argumentValue("output");
  if (output) console.log(`JSON report: ${writeReport(report, output)}`);

  if (report.summary.blockers > 0) process.exitCode = 2;
  else if (report.summary.warnings > 0 && process.argv.includes("--fail-on-warnings")) process.exitCode = 3;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
