import fs from "node:fs";
import path from "node:path";

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function argumentValue(name: string) {
  const exactPrefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(exactPrefix));
  if (inline) return inline.slice(exactPrefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function loadEnvironmentFile(fileName?: string) {
  if (!fileName) return null;
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`);
  }

  const inheritedKeys = new Set(Object.keys(process.env));
  for (const sourceLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (inheritedKeys.has(key)) continue;
    process.env[key] = stripQuotes(line.slice(separator + 1));
  }

  return filePath;
}

export function firstEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveVerificationCredentials() {
  return {
    username: firstEnvironmentValue(
      "VERIFY_USERNAME",
      "FINANCE_TEST_USERNAME",
      "FINANCE_DOCTOR_USERNAME",
      "UI_SMOKE_USERNAME",
      "BOOTSTRAP_ADMIN_USERNAME"
    ),
    password: firstEnvironmentValue(
      "VERIFY_PASSWORD",
      "FINANCE_TEST_PASSWORD",
      "FINANCE_DOCTOR_PASSWORD",
      "UI_SMOKE_PASSWORD",
      "BOOTSTRAP_ADMIN_PASSWORD"
    )
  };
}
