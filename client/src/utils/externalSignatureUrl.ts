import { apiBaseUrl } from "../api/request";

export const productionAppUrl = "https://jiayinz906-lang.github.io/cross-border-finance-mvp/";

export function usesLocalSignatureBackend() {
  try {
    const url = new URL(apiBaseUrl, window.location.origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function externalSignatureUrl(signatureUrl?: string | null) {
  if (!signatureUrl) return "";
  const route = signatureUrl.startsWith("/") ? signatureUrl : `/${signatureUrl}`;
  const configuredPublicUrl = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const currentAppUrl = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
  return `${configuredPublicUrl || currentAppUrl}#${route}`;
}
