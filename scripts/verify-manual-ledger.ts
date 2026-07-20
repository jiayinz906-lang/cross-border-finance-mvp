import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apiUrl = process.env.UI_SMOKE_API_URL || "http://localhost:4000/api";
const testMonth = "2099-12";
let token = "";
let entryId = 0;

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as T : {} as T;
}

async function main() {
  const login = await jsonRequest<{ token: string }>("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.UI_SMOKE_USERNAME || "admin", password: process.env.UI_SMOKE_PASSWORD || "admin123" })
  });
  token = login.token;
  assert.ok(token, "login token should be returned");

  const form = new FormData();
  Object.entries({
    month: testMonth,
    transactionDate: "2099-12-15",
    sourceType: "image_statement",
    direction: "payable",
    counterparty: "专项验证供应商",
    originalAmount: "-12.50",
    currency: "USD",
    exchangeRate: "6.85",
    orderNo: "VERIFY-MANUAL-001",
    note: "原始流水专项自动验证"
  }).forEach(([key, value]) => form.append(key, value));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n7sAAAAASUVORK5CYII=", "base64");
  form.append("files", new Blob([png], { type: "image/png" }), "verify-ledger.png");

  const created = await jsonRequest<{ id: number; entryNo: string; localAmount: number; attachments: Array<{ id: number }> }>("/finance/manual-entries", { method: "POST", body: form });
  entryId = created.id;
  assert.ok(created.entryNo.startsWith("ML209912-"));
  assert.equal(created.localAmount, -85.63, "signed amount and entered exchange rate must be preserved");
  assert.equal(created.attachments.length, 1);

  const listed = await jsonRequest<{ rows: Array<{ id: number }>; total: number }>(`/finance/manual-entries?month=${testMonth}`);
  assert.equal(listed.total, 1);
  assert.equal(listed.rows[0].id, entryId);

  const summary = await jsonRequest<{ payable: number; attachmentCount: number; draftRecords: number }>(`/finance/manual-entries/summary?month=${testMonth}`);
  assert.equal(summary.payable, -85.63);
  assert.equal(summary.attachmentCount, 1);
  assert.equal(summary.draftRecords, 1);

  const attachmentResponse = await fetch(`${apiUrl}/finance/manual-entries/${entryId}/attachments/${created.attachments[0].id}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(attachmentResponse.status, 200);
  assert.equal(attachmentResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await attachmentResponse.arrayBuffer()), png);

  const confirmed = await jsonRequest<{ status: string }>(`/finance/manual-entries/${entryId}/confirm`, { method: "POST" });
  assert.equal(confirmed.status, "confirmed");
  const voided = await jsonRequest<{ status: string; voidReason: string }>(`/finance/manual-entries/${entryId}/void`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "专项验证完成后清理" })
  });
  assert.equal(voided.status, "voided");
  assert.equal(voided.voidReason, "专项验证完成后清理");

  console.log("Manual ledger and image evidence checks passed.");
}

main().finally(async () => {
  if (entryId) {
    await prisma.actionLog.deleteMany({ where: { entityType: "manual_ledger_entry", entityId: String(entryId) } });
    await prisma.manualLedgerEntry.deleteMany({ where: { id: entryId } });
  }
  await prisma.$disconnect();
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
