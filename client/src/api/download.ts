import { request } from "./request";

function fileNameFromDisposition(disposition: string | undefined, fallback: string) {
  const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  try {
    return decodeURIComponent(utf8 || plain || fallback);
  } catch {
    return fallback;
  }
}

export async function downloadAuthenticatedFile(path: string, fallbackFileName: string, params?: Record<string, unknown>) {
  const response = await request.get(path, { params, responseType: "blob", timeout: 120000 });
  const fileName = fileNameFromDisposition(response.headers["content-disposition"] as string | undefined, fallbackFileName);
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return fileName;
}
