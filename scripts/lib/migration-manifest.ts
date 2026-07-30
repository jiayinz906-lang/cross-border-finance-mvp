import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export type MigrationManifest = {
  formatVersion: 1;
  generatedAt: string;
  database: { host: string; port: string; name: string; schema: string; version: string; sizeBytes: string; encoding: string; timezone: string; collation: string };
  gitSha: string;
  schemaSha256: string;
  tables: Record<string, { count: string; minId: string | null; maxId: string | null }>;
  monthlyOrderCounts: Record<string, string>;
  specialCounts: Record<string, string>;
  financialTotals: Record<string, string>;
  monthCloseStates: Array<{ month: string; status: string; lockedAt: string | null; unlockedAt: string | null }>;
  migrations: Array<{ name: string; checksum: string; finishedAt: string | null; rolledBackAt: string | null }>;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function databaseIdentity(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    name: parsed.pathname.replace(/^\//, ""),
    schema: parsed.searchParams.get("schema") || "public"
  };
}

async function tableExists(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS present",
    table
  );
  return Boolean(rows[0]?.present);
}

async function scalar(prisma: PrismaClient, sql: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(sql);
  return text(rows[0]?.value) ?? "0";
}

export function prismaForUrl(databaseUrl: string) {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

export function prismaSchemaSha256() {
  return crypto.createHash("sha256").update(fs.readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"))).digest("hex");
}

export async function createMigrationManifest(databaseUrl: string): Promise<MigrationManifest> {
  const prisma = prismaForUrl(databaseUrl);
  try {
    const identity = databaseIdentity(databaseUrl);
    const metadata = await prisma.$queryRaw<Array<{ version: string; size_bytes: bigint; encoding: string; timezone: string; collation: string }>>`
      SELECT version() AS version,
             pg_database_size(current_database()) AS size_bytes,
             pg_encoding_to_char(encoding) AS encoding,
             current_setting('TimeZone') AS timezone,
             datcollate AS collation
      FROM pg_database WHERE datname = current_database()
    `;
    const tableRows = await prisma.$queryRaw<Array<{ table_name: string; has_id: boolean }>>`
      SELECT t.table_name,
             EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='id') AS has_id
      FROM information_schema.tables t
      WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND t.table_name <> '_prisma_migrations'
      ORDER BY t.table_name
    `;
    const tables: MigrationManifest["tables"] = {};
    for (const row of tableRows) {
      const table = quoteIdentifier(row.table_name);
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint; min_id: unknown; max_id: unknown }>>(
        row.has_id
          ? `SELECT COUNT(*) AS count, MIN(id) AS min_id, MAX(id) AS max_id FROM ${table}`
          : `SELECT COUNT(*) AS count, NULL AS min_id, NULL AS max_id FROM ${table}`
      );
      tables[row.table_name] = {
        count: text(rows[0]?.count) ?? "0",
        minId: text(rows[0]?.min_id),
        maxId: text(rows[0]?.max_id)
      };
    }

    const monthlyOrderCounts: Record<string, string> = {};
    if (await tableExists(prisma, "FinanceOrder")) {
      const rows = await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`SELECT month, COUNT(*) AS count FROM "FinanceOrder" GROUP BY month ORDER BY month`;
      for (const row of rows) monthlyOrderCounts[row.month] = String(row.count);
    }

    const specialCounts: Record<string, string> = {
      rawLedgerLines: tables.RawLedgerLine?.count ?? "0",
      financeChargeLines: tables.FinanceChargeLine?.count ?? "0",
      importBatches: tables.ImportBatch?.count ?? "0",
      users: tables.AppUser?.count ?? "0",
      confirmationDocuments: tables.ConfirmationDocument?.count ?? "0",
      signatureEvidence: await tableExists(prisma, "ConfirmationDocument")
        ? await scalar(prisma, `SELECT COUNT(*)::text AS value FROM "ConfirmationDocument" WHERE "signatureEvidenceJson" IS NOT NULL OR "signedAt" IS NOT NULL`)
        : "0",
      actionLogs: tables.ActionLog?.count ?? "0",
      sourceExcelFiles: await tableExists(prisma, "ImportBatch")
        ? await scalar(prisma, `SELECT COUNT(*)::text AS value FROM "ImportBatch" WHERE "sourceFileData" IS NOT NULL`)
        : "0",
      sourceExcelBytes: await tableExists(prisma, "ImportBatch")
        ? await scalar(prisma, `SELECT COALESCE(SUM(octet_length("sourceFileData")),0)::text AS value FROM "ImportBatch"`)
        : "0",
      attachmentFiles: await tableExists(prisma, "LedgerAttachment")
        ? await scalar(prisma, `SELECT COUNT(*)::text AS value FROM "LedgerAttachment"`)
        : "0",
      attachmentBytes: await tableExists(prisma, "LedgerAttachment")
        ? await scalar(prisma, `SELECT COALESCE(SUM(octet_length("fileData")),0)::text AS value FROM "LedgerAttachment"`)
        : "0"
    };

    const latestDocuments = `SELECT DISTINCT ON (month, "documentType", "ownerName") * FROM "ConfirmationDocument" WHERE "documentStatus" <> 'voided' ORDER BY month, "documentType", "ownerName", version DESC, id DESC`;
    const financialTotals: Record<string, string> = {
      receivable: await tableExists(prisma, "FinanceOrder") ? await scalar(prisma, `SELECT COALESCE(SUM("adjustedReceivable"::numeric),0)::text AS value FROM "FinanceOrder"`) : "0",
      payable: await tableExists(prisma, "FinanceOrder") ? await scalar(prisma, `SELECT COALESCE(SUM("adjustedPayable"::numeric),0)::text AS value FROM "FinanceOrder"`) : "0",
      received: await tableExists(prisma, "SettlementRecord") ? await scalar(prisma, `SELECT COALESCE(SUM(amount::numeric),0)::text AS value FROM "SettlementRecord" WHERE status='active' AND direction='receivable'`) : "0",
      paid: await tableExists(prisma, "SettlementRecord") ? await scalar(prisma, `SELECT COALESCE(SUM(amount::numeric),0)::text AS value FROM "SettlementRecord" WHERE status='active' AND direction='payable'`) : "0",
      grossProfit: await tableExists(prisma, "FinanceOrder") ? await scalar(prisma, `SELECT COALESCE(SUM("adjustedGrossProfit"::numeric),0)::text AS value FROM "FinanceOrder"`) : "0",
      logisticsCommission: await tableExists(prisma, "CommissionRecord") ? await scalar(prisma, `SELECT COALESCE(SUM(COALESCE("manualCommissionAmount", "commissionAmount")::numeric),0)::text AS value FROM "CommissionRecord"`) : "0",
      serviceCommission: await tableExists(prisma, "ServiceBusinessRecord") ? await scalar(prisma, `SELECT COALESCE(SUM(COALESCE("supervisorFinalCommission",0)::numeric),0)::text AS value FROM "ServiceBusinessRecord"`) : "0",
      operatorPerformance: await tableExists(prisma, "ConfirmationDocument") ? await scalar(prisma, `SELECT COALESCE(SUM("commissionAmount"::numeric),0)::text AS value FROM (${latestDocuments}) d WHERE "documentType" IN ('operator_performance','customer_service_salary')`) : "0"
    };

    const monthCloseStates = await tableExists(prisma, "MonthClose")
      ? (await prisma.$queryRaw<Array<{ month: string; status: string; lockedAt: Date | null; unlockedAt: Date | null }>>`
          SELECT month, status, "lockedAt", "unlockedAt" FROM "MonthClose" ORDER BY month
        `).map((row) => ({ month: row.month, status: row.status, lockedAt: text(row.lockedAt), unlockedAt: text(row.unlockedAt) }))
      : [];
    const migrations = await tableExists(prisma, "_prisma_migrations")
      ? (await prisma.$queryRaw<Array<{ name: string; checksum: string; finishedAt: Date | null; rolledBackAt: Date | null }>>`
          SELECT migration_name AS name, checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
          FROM "_prisma_migrations" ORDER BY started_at
        `).map((row) => ({ name: row.name, checksum: row.checksum, finishedAt: text(row.finishedAt), rolledBackAt: text(row.rolledBackAt) }))
      : [];
    const meta = metadata[0];
    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      database: { ...identity, version: meta?.version ?? "unknown", sizeBytes: String(meta?.size_bytes ?? 0), encoding: meta?.encoding ?? "unknown", timezone: meta?.timezone ?? "unknown", collation: meta?.collation ?? "unknown" },
      gitSha: process.env.BUILD_GIT_SHA || process.env.GITHUB_SHA || "local",
      schemaSha256: prismaSchemaSha256(),
      tables,
      monthlyOrderCounts,
      specialCounts,
      financialTotals,
      monthCloseStates,
      migrations
    };
  } finally {
    await prisma.$disconnect();
  }
}

export function writeManifest(manifest: MigrationManifest, outputPath: string) {
  const absolute = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return absolute;
}
