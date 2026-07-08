export function formatMoney(value?: number | null) {
  if (typeof value !== "number") {
    return "-";
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY"
  }).format(value);
}
