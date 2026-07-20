const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function resolveMonth(value?: string | null) {
  return value && monthPattern.test(value) ? value : currentMonth();
}
