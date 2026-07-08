import { DEFAULT_USD_RATE } from "./constants.js";

export function isUsdCurrency(currency: string) {
  return ["USD", "美金", "美元", "$"].includes(currency.trim().toUpperCase());
}

export function toCny(amount: number, currency: string, exchangeRate?: number | null) {
  return isUsdCurrency(currency) ? amount * (exchangeRate ?? DEFAULT_USD_RATE) : amount;
}
