import { Prisma } from "@prisma/client";

export type NumericValue = number | string | Prisma.Decimal | null | undefined;

function decimal(value: NumericValue) {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number" && !Number.isFinite(value)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(String(value));
}

/**
 * Converts financial values through Decimal before returning a JSON-safe number.
 * Raw Excel aggregations use 8 decimal places; posted money normally uses 2.
 */
export function roundNumber(value: NumericValue, scale = 8) {
  return decimal(value).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function roundMoney(value: NumericValue, scale = 2) {
  return roundNumber(value, scale);
}

export function sumNumbers(values: Iterable<NumericValue>, scale = 8) {
  let total = new Prisma.Decimal(0);
  for (const value of values) total = total.plus(decimal(value));
  return total.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function addNumbers(left: NumericValue, right: NumericValue, scale = 8) {
  return decimal(left).plus(decimal(right)).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function subtractNumbers(left: NumericValue, right: NumericValue, scale = 8) {
  return decimal(left).minus(decimal(right)).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function multiplyNumbers(left: NumericValue, right: NumericValue, scale = 8) {
  return decimal(left).times(decimal(right)).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function safeRate(numerator: NumericValue, denominator: NumericValue) {
  const base = decimal(denominator);
  if (base.isZero()) return null;
  return decimal(numerator).div(base).toDecimalPlaces(12, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
