export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function safeRate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}
