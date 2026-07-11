export function externalSignatureUrl(signatureUrl?: string | null) {
  if (!signatureUrl) return "";
  const route = signatureUrl.startsWith("/") ? signatureUrl : `/${signatureUrl}`;
  const configuredPublicUrl = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const currentAppUrl = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
  return `${configuredPublicUrl || currentAppUrl}#${route}`;
}
