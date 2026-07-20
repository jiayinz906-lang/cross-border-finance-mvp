const maxRecentDurations = 500;
const maxRecentErrors = 20;
const maxStringLength = 300;

const secretKeyPattern = /(api[_-]?key|token|secret|password|authorization|credential|private[_-]?key|access[_-]?key|refresh[_-]?token)/i;
const privateTextKeyPattern = /(prompt|content|body|args?|arguments?|result|response|input|query)/i;

type ErrorSeverity = "warn" | "error";

type ErrorEntry = {
  timestamp: string;
  key: string;
  severity: ErrorSeverity;
  message: string;
  requestId?: string;
};

const startedAtMs = Date.now();
const requestStats = {
  total: 0,
  active: 0,
  failed: 0,
  slow: 0,
  lastRequestAt: null as string | null,
  durations: [] as number[],
  byStatus: {} as Record<string, number>
};
const errorStats = {
  total: 0,
  byKey: {} as Record<string, { count: number; lastErrorAt: string; lastMessage: string }>,
  recent: [] as ErrorEntry[]
};

function truncate(value: unknown, max = maxStringLength) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max)}... [truncated]`;
}

function redactText(value: string) {
  return truncate(value)
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]");
}

export function sanitizeOperationalMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= 3) return "[truncated depth]";
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeOperationalMetadata(item, depth + 1));
  if (typeof value !== "object") return truncate(value);

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (secretKeyPattern.test(key)) output[key] = "[redacted]";
    else if (privateTextKeyPattern.test(key)) output[key] = typeof item === "string" ? `[redacted text: ${item.length} chars]` : "[redacted]";
    else output[key] = sanitizeOperationalMetadata(item, depth + 1);
  }
  return output;
}

export function sanitizeRequestPath(path: string) {
  return truncate(path.split("?")[0])
    .replace(/(\/workflow\/signature\/)[^/]+/g, "$1[redacted]");
}

export function recordRequestStarted() {
  requestStats.active += 1;
}

export function recordRequestFinished(input: { statusCode: number; durationMs: number; slowThresholdMs: number }) {
  requestStats.active = Math.max(0, requestStats.active - 1);
  requestStats.total += 1;
  requestStats.lastRequestAt = new Date().toISOString();
  if (input.statusCode >= 500) requestStats.failed += 1;
  if (input.durationMs >= input.slowThresholdMs) requestStats.slow += 1;
  const statusGroup = `${Math.floor(input.statusCode / 100)}xx`;
  requestStats.byStatus[statusGroup] = (requestStats.byStatus[statusGroup] ?? 0) + 1;
  requestStats.durations.push(Math.round(input.durationMs));
  if (requestStats.durations.length > maxRecentDurations) requestStats.durations.shift();
}

export function recordOperationalError(error: unknown, input: {
  scope: string;
  operation: string;
  severity?: ErrorSeverity;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  const timestamp = new Date().toISOString();
  const severity = input.severity ?? "error";
  const key = `${input.scope}.${input.operation}`;
  const source = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  const message = redactText(source.message || source.name);
  const entry: ErrorEntry = { timestamp, key, severity, message, requestId: input.requestId };

  errorStats.total += 1;
  const existing = errorStats.byKey[key] ?? { count: 0, lastErrorAt: timestamp, lastMessage: message };
  errorStats.byKey[key] = { count: existing.count + 1, lastErrorAt: timestamp, lastMessage: message };
  errorStats.recent.unshift(entry);
  errorStats.recent = errorStats.recent.slice(0, maxRecentErrors);

  const payload = {
    timestamp,
    event: "operational_error",
    severity,
    scope: input.scope,
    operation: input.operation,
    requestId: input.requestId,
    message,
    stack: source.stack ? redactText(source.stack) : undefined,
    metadata: sanitizeOperationalMetadata(input.metadata ?? {})
  };
  const sink = severity === "warn" ? console.warn : console.error;
  sink(JSON.stringify(payload));
  return payload;
}

export function getOperationsSnapshot() {
  const durations = [...requestStats.durations].sort((left, right) => left - right);
  const averageMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : 0;

  return {
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    requests: {
      total: requestStats.total,
      active: requestStats.active,
      failed: requestStats.failed,
      slow: requestStats.slow,
      averageMs,
      p95Ms: durations[p95Index] ?? 0,
      sampleSize: durations.length,
      lastRequestAt: requestStats.lastRequestAt,
      byStatus: { ...requestStats.byStatus }
    },
    errors: {
      total: errorStats.total,
      byKey: Object.fromEntries(Object.entries(errorStats.byKey).map(([key, value]) => [key, { ...value }])),
      recent: errorStats.recent.map((entry) => ({ ...entry }))
    }
  };
}

export function resetOperationsForTest() {
  requestStats.total = 0;
  requestStats.active = 0;
  requestStats.failed = 0;
  requestStats.slow = 0;
  requestStats.lastRequestAt = null;
  requestStats.durations = [];
  requestStats.byStatus = {};
  errorStats.total = 0;
  errorStats.byKey = {};
  errorStats.recent = [];
}
