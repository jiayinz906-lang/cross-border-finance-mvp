import { request } from "./request";

export type BusinessCase = {
  id: number; caseNo: string; month: string; caseType: string; title: string; customerName: string;
  salespersonName?: string | null; customerServiceName?: string | null; status: string;
  productName?: string | null; contactName?: string | null; contactPhone?: string | null;
  startDate?: string | null; endDate?: string | null; deliveryDate?: string | null; arrivalDate?: string | null;
  remark?: string | null; attachmentUrls?: string | null; updatedAt: string;
  items?: Array<{ id: number; serialNo: number; name: string; brand?: string | null; model?: string | null; status: string }>;
  comments?: Array<{ id: number; content: string; createdBy: string; createdAt: string }>;
};

export const listBusinessCases = (params: { month: string; caseType?: string; status?: string; keyword?: string }) => request.get<{ rows: BusinessCase[] }>("/business-cases", { params });
export const createBusinessCase = (payload: Record<string, unknown>) => request.post<BusinessCase>("/business-cases", payload);
export const updateBusinessCase = (id: number, payload: Record<string, unknown>) => request.patch<BusinessCase>(`/business-cases/${id}`, payload);
export const commentBusinessCase = (id: number, content: string) => request.post(`/business-cases/${id}/comments`, { content });
