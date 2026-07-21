# Financial Decimal Migration Plan

## Current status

The production schema still uses Prisma `Float` for financial values. This is recorded as a launch-blocking precision risk, but the conversion must not be mixed with ordinary feature deployment. Prisma `Decimal` changes both PostgreSQL column types and application return types, so a blind schema edit can break aggregation, JSON responses, exports, and reconciliation.

Run the non-mutating inventory at any time:

```bash
pnpm audit:money-precision
```

Use `pnpm audit:money-precision -- --strict` in the dedicated Decimal migration branch to keep CI failing until every planned field has been converted.

## Target precision

| Data class | PostgreSQL / Prisma target | Reason |
| --- | --- | --- |
| Imported source amounts, signed charge lines, order totals, summaries, commissions | `Decimal @db.Decimal(24,8)` | Preserve the uploaded Excel value and all intermediate fractional digits. UI presentation may round to two decimals, storage must not. |
| Exchange rates and profit/commission ratios | `Decimal @db.Decimal(18,8)` | Avoid binary floating-point drift in conversion and percentage calculations. |
| Matching score | `Decimal @db.Decimal(9,6)` | Stable ordering and threshold comparisons. |
| Counts and statuses | Keep `Int` / `String` | Not monetary data. |

`OperatorPerformanceOverride.rate` is a money-per-ticket value in some categories and therefore uses `Decimal(24,8)`, not a percentage type.

## Required migration sequence

1. Freeze writes for one maintenance window and create a verified PostgreSQL backup.
2. Export reconciliation baselines for every month: charge-line totals, order totals, summary totals, settlements, invoices, commissions, and confirmation snapshots.
3. Add application conversion helpers that accept `Prisma.Decimal`, serialize API values as numbers/strings deliberately, and perform arithmetic with Decimal operations.
4. Convert one bounded group at a time: `FinanceChargeLine`, then `FinanceOrder`/`ImportBatch`/`FinanceSummary`, then settlements/invoices/bank matching, then commissions/services/confirmation documents.
5. For each group, use additive shadow decimal columns, backfill from the existing value, compare old and new aggregates, then switch reads and writes. Do not use `prisma db push`.
6. Require zero reconciliation difference before dropping old columns. Preserve eight decimal places even when the UI displays two.
7. Re-run `pnpm verify:import`, `pnpm verify:all`, report downloads, signature snapshots, and Docker smoke tests against a restored production copy.
8. Only after acceptance, deploy the reviewed migration with `prisma migrate deploy` and retain the rollback backup.

## Acceptance criteria

- Every imported source amount and sign matches the Excel row exactly.
- Charge lines, orders, monthly summaries, receivables, payables, bank allocations, and commissions reconcile with a difference of exactly zero at stored precision.
- Historical confirmation payloads and exported PDF/PNG/Excel values do not change.
- No production migration command contains `migrate reset`, `db push`, or `--accept-data-loss`.

This document deliberately does not execute the production type conversion. That conversion is a separate, backup-gated database migration rather than a routine application release.
