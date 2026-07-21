import assert from "node:assert/strict";
import { prisma } from "../server/src/prisma/client.js";
import { financeService } from "../server/src/services/finance.service.js";
import { operationsService } from "../server/src/services/operations.service.js";
import { addNumbers, multiplyNumbers, safeRate, subtractNumbers, sumNumbers } from "../server/src/utils/number.js";

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname),
    `Refusing to run data-foundation verification against ${databaseUrl.hostname}`
  );
}

async function verifyDecimalBoundary() {
  assert.equal(sumNumbers([0.1, 0.2]), 0.3);
  assert.equal(addNumbers(941218.0623, -0.00000001), 941218.06229999);
  assert.equal(subtractNumbers(941218.0623, 782638.13534), 158579.92696);
  assert.equal(multiplyNumbers(158579.92696, 0.15, 2), 23786.99);
  assert.equal(safeRate(1, 3), 0.333333333333);
}

async function verifyMonthlyRuleVersion() {
  const effectiveMonth = "2099-01";
  const ruleKey = "risk_profit_rate_threshold";
  const before = await financeService.listParameterRules("2098-12");
  const beforeRule = before.rows.find((row) => row.ruleKey === ruleKey);
  assert.ok(beforeRule);

  await financeService.updateParameterRule(ruleKey, {
    effectiveMonth,
    valueJson: JSON.stringify({ highRiskBelow: 0.1234, abnormalHighAbove: 0.5678 }),
    description: "isolated verification rule",
    updatedBy: "verify-data-foundation"
  });

  const [past, current] = await Promise.all([
    financeService.listParameterRules("2098-12"),
    financeService.listParameterRules(effectiveMonth)
  ]);
  const pastRule = past.rows.find((row) => row.ruleKey === ruleKey);
  const currentRule = current.rows.find((row) => row.ruleKey === ruleKey);
  assert.deepEqual(pastRule?.value, beforeRule.value, "Future rule version must not change prior months");
  assert.deepEqual(currentRule?.value, { highRiskBelow: 0.1234, abnormalHighAbove: 0.5678 });
  assert.equal(currentRule?.effectiveMonth, effectiveMonth);
  assert.equal(currentRule?.source, "monthly");

  const rule = await prisma.parameterRule.findUniqueOrThrow({ where: { ruleKey } });
  await prisma.parameterRuleVersion.deleteMany({ where: { parameterRuleId: rule.id, effectiveMonth } });
}

async function verifyPartnerAliases() {
  const marker = Date.now().toString(36);
  const name = `验证供应商 ${marker}`;
  const alias = `验证供应商简称${marker}`;
  const partner = await operationsService.savePartner({
    name,
    partnerType: "supplier",
    aliases: `${alias}\n${name.replace(" ", "　")}`,
    paymentTermDays: 30
  }, "verify-data-foundation");

  const result = await operationsService.listPartners({ keyword: alias, page: 1, pageSize: 20 });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, partner.id);
  assert.ok(result.rows[0].aliases.some((item) => item.alias === alias));
  await prisma.businessPartner.delete({ where: { id: partner.id } });
}

async function main() {
  assertLocalDatabase();
  await verifyDecimalBoundary();
  await verifyMonthlyRuleVersion();
  await verifyPartnerAliases();
  console.log("Data foundation checks passed: decimal arithmetic, monthly rules, partner aliases.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
