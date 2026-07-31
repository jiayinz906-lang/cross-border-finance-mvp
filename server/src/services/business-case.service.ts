import { prisma } from "../prisma/client.js";
import { AppError } from "../errors/app-error.js";

const allowedTypes = new Set(["clearance", "company_registration", "eac", "other_service"]);
const allowedStatuses = new Set(["draft", "processing", "waiting_customer", "completed", "archived"]);

function requiredText(value: unknown, label: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new AppError(400, "BUSINESS_CASE_FIELD_REQUIRED", `Required field: ${label}`);
  return result;
}
function optionalText(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}
function optionalDate(value: unknown) {
  if (!value) return null;
  const result = new Date(String(value));
  if (Number.isNaN(result.getTime())) throw new AppError(400, "INVALID_BUSINESS_CASE_DATE", "Invalid business case date.");
  return result;
}
async function writeLog(action: string, id: number, month: string, operator: string, payload: unknown) {
  await prisma.actionLog.create({ data: { month, entityType: "business_case", entityId: String(id), action, operator, payloadJson: JSON.stringify(payload) } });
}

export const businessCaseService = {
  async list(query: { month?: string; caseType?: string; status?: string; keyword?: string }) {
    const keyword = query.keyword?.trim();
    return prisma.businessCase.findMany({
      where: {
        ...(query.month ? { month: query.month } : {}),
        ...(query.caseType ? { caseType: query.caseType } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(keyword ? { OR: [
          { caseNo: { contains: keyword, mode: "insensitive" } },
          { title: { contains: keyword, mode: "insensitive" } },
          { customerName: { contains: keyword, mode: "insensitive" } },
          { productName: { contains: keyword, mode: "insensitive" } }
        ] } : {})
      },
      include: { items: { orderBy: { serialNo: "asc" } }, comments: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
  },

  async create(input: any, operator: string) {
    const month = requiredText(input.month, "month");
    const caseType = requiredText(input.caseType, "caseType");
    if (!allowedTypes.has(caseType)) throw new AppError(400, "INVALID_BUSINESS_CASE_TYPE", "Unsupported business case type.");
    const caseNo = optionalText(input.caseNo) || `BIZ-${month.replace("-", "")}-${Date.now().toString().slice(-8)}`;
    const row = await prisma.businessCase.create({
      data: {
        caseNo, month, caseType,
        title: requiredText(input.title, "title"),
        customerName: requiredText(input.customerName, "customerName"),
        customerCode: optionalText(input.customerCode), salespersonName: optionalText(input.salespersonName),
        customerServiceName: optionalText(input.customerServiceName), status: allowedStatuses.has(input.status) ? input.status : "draft",
        startDate: optionalDate(input.startDate), endDate: optionalDate(input.endDate), deliveryDate: optionalDate(input.deliveryDate), arrivalDate: optionalDate(input.arrivalDate),
        contactName: optionalText(input.contactName), contactPhone: optionalText(input.contactPhone), address: optionalText(input.address),
        productName: optionalText(input.productName), taxNumber: optionalText(input.taxNumber),
        detailsJson: input.details ? JSON.stringify(input.details) : optionalText(input.detailsJson),
        attachmentUrls: optionalText(input.attachmentUrls), remark: optionalText(input.remark), createdBy: operator,
        items: Array.isArray(input.items) && input.items.length ? { create: input.items.map((item: any, index: number) => ({
          serialNo: Number(item.serialNo) || index + 1, name: requiredText(item.name, "item.name"), brand: optionalText(item.brand),
          model: optionalText(item.model), manufacturer: optionalText(item.manufacturer), material: optionalText(item.material),
          purpose: optionalText(item.purpose), description: optionalText(item.description), imageUrl: optionalText(item.imageUrl),
          linkUrl: optionalText(item.linkUrl), certificate: optionalText(item.certificate), hsCode: optionalText(item.hsCode), remark: optionalText(item.remark)
        })) } : undefined
      },
      include: { items: true, comments: true }
    });
    await writeLog("create_business_case", row.id, month, operator, { caseNo, caseType });
    return row;
  },

  async update(id: number, input: any, operator: string) {
    const existing = await prisma.businessCase.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "BUSINESS_CASE_NOT_FOUND", "Business case not found.");
    if (input.caseType && !allowedTypes.has(input.caseType)) throw new AppError(400, "INVALID_BUSINESS_CASE_TYPE", "Unsupported business case type.");
    if (input.status && !allowedStatuses.has(input.status)) throw new AppError(400, "INVALID_BUSINESS_CASE_STATUS", "Unsupported business case status.");
    const data: any = { updatedBy: operator };
    for (const field of ["title", "customerName", "customerCode", "salespersonName", "customerServiceName", "status", "contactName", "contactPhone", "address", "productName", "taxNumber", "attachmentUrls", "remark", "caseType"]) {
      if (field in input) data[field] = optionalText(input[field]);
    }
    for (const field of ["startDate", "endDate", "deliveryDate", "arrivalDate"]) if (field in input) data[field] = optionalDate(input[field]);
    if ("details" in input) data.detailsJson = JSON.stringify(input.details ?? {});
    const row = await prisma.businessCase.update({ where: { id }, data, include: { items: true, comments: { orderBy: { createdAt: "desc" } } } });
    await writeLog("update_business_case", id, existing.month, operator, { before: existing, after: data });
    return row;
  },

  async addComment(id: number, input: any, operator: string) {
    const existing = await prisma.businessCase.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "BUSINESS_CASE_NOT_FOUND", "Business case not found.");
    const row = await prisma.businessCaseComment.create({ data: { businessCaseId: id, content: requiredText(input.content, "content"), attachmentUrls: optionalText(input.attachmentUrls), createdBy: operator } });
    await writeLog("comment_business_case", id, existing.month, operator, { commentId: row.id });
    return row;
  }
};
