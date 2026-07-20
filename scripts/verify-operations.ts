import assert from "node:assert/strict";
import {
  getOperationsSnapshot,
  recordOperationalError,
  recordRequestFinished,
  recordRequestStarted,
  resetOperationsForTest,
  sanitizeOperationalMetadata,
  sanitizeRequestPath
} from "../server/src/runtime/operations.js";

resetOperationsForTest();

const sanitized = sanitizeOperationalMetadata({
  apiKey: "secret-value",
  password: "password-value",
  label: "safe-value",
  nested: { token: "token-value" }
}) as Record<string, unknown>;
assert.equal(sanitized.apiKey, "[redacted]");
assert.equal(sanitized.password, "[redacted]");
assert.equal(sanitized.label, "safe-value");
assert.deepEqual(sanitized.nested, { token: "[redacted]" });

assert.equal(
  sanitizeRequestPath("/workflow/signature/private-signature-token/sign?debug=1"),
  "/workflow/signature/[redacted]/sign"
);

recordRequestStarted();
recordRequestFinished({ statusCode: 503, durationMs: 2500, slowThresholdMs: 2000 });

const originalError = console.error;
console.error = () => undefined;
try {
  recordOperationalError(new Error("database unavailable"), {
    scope: "health",
    operation: "database_probe",
    requestId: "request-1",
    metadata: { authorization: "Bearer private-token" }
  });
} finally {
  console.error = originalError;
}

const snapshot = getOperationsSnapshot();
assert.equal(snapshot.requests.total, 1);
assert.equal(snapshot.requests.active, 0);
assert.equal(snapshot.requests.failed, 1);
assert.equal(snapshot.requests.slow, 1);
assert.equal(snapshot.requests.p95Ms, 2500);
assert.equal(snapshot.errors.total, 1);
assert.equal(snapshot.errors.byKey["health.database_probe"].count, 1);
assert.equal(snapshot.errors.recent[0].requestId, "request-1");

console.log("Operations stability checks passed.");
