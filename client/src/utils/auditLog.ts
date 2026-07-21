const entityLabels: Record<string, string> = {
  app_user: "用户账号",
  bank_transaction: "银行流水",
  business_partner: "往来单位",
  commission_record: "物流提成记录",
  confirmation_document: "电子签名确认单",
  export_job: "导出任务",
  finance_invoice: "应收应付账单",
  finance_order: "财务订单",
  import_batch: "Excel 导入批次",
  manual_ledger_entry: "原始数据记录",
  month_close: "月度锁账",
  operator_performance_override: "操作员绩效调整",
  operator_performance_setting: "操作员绩效设置",
  parameter_rule: "参数规则",
  reconciliation_match: "银行核销记录",
  risk_record: "风险复核记录",
  service_business: "注册与服务业务",
  service_business_record: "注册与服务提成记录",
  settlement_record: "收付款记录",
  system: "系统",
  workflow_task: "财务工作任务"
};

const actionLabels: Record<string, string> = {
  adjust_and_confirm_commission: "调整并确认物流提成",
  adjust_commission_rate: "调整提成比例",
  batch_generate: "批量生成确认单",
  batch_generate_salary_documents: "批量生成薪资确认单",
  change_password: "修改密码",
  confirm_commission: "确认物流提成",
  confirm_manual_ledger_entry: "确认原始数据记录",
  confirm_reconciliation: "确认银行核销",
  confirm_service_commission: "确认注册与服务提成",
  create_bank_transaction: "新增银行流水",
  create_export_job: "创建导出任务",
  create_manual_ledger_entry: "新增原始数据记录",
  create_partner: "新增往来单位",
  create_user: "新增用户账号",
  download_confirmation_pdf: "下载确认单 PDF",
  download_confirmation_png: "下载确认单 PNG",
  employee_sign: "员工电子签名",
  generate_signature_link: "生成签名链接",
  import_excel: "导入 Excel 台账",
  lock_month: "月度锁账",
  login_failed: "登录失败",
  login_success: "登录成功",
  mark_reviewed: "标记风险已复核",
  record_payment: "登记付款",
  record_receipt: "登记回款",
  record_signature_notification: "记录签名通知",
  reset_business_data: "清理业务数据",
  resolve_task: "完成财务任务",
  review_risk_with_note: "风险复核并填写说明",
  rollback_and_restore_previous_import: "回滚并恢复上一导入批次",
  rollback_import_batch: "回滚导入批次",
  send_signature_notification: "发送签名通知",
  signature_notification_failed: "签名通知发送失败",
  suggest_reconciliation: "生成银行核销建议",
  supervisor_confirm: "主管确认",
  sync_invoices: "同步应收应付账单",
  unlock_month: "月度解锁",
  update_operator_performance_override: "调整操作员绩效",
  update_operator_performance_payout_note: "更新绩效发放说明",
  update_partner: "更新往来单位",
  update_user: "更新用户账号",
  void_for_resign: "作废并重新签名",
  void_manual_ledger_entry: "作废原始数据记录",
  void_payment: "作废付款",
  void_receipt: "作废回款"
};

const entityIdLabels: Record<string, string> = {
  logistics_commission: "物流提成确认单",
  operator_performance: "操作员绩效确认单",
  salary_confirmation: "薪资确认单",
  service_commission: "注册与服务提成确认单"
};

const roleLabels: Record<string, string> = {
  admin: "系统管理员",
  executive: "管理层",
  finance: "财务",
  sales: "销售代表",
  supervisor: "主管"
};

const statusLabels: Record<string, string> = {
  active: "生效中",
  confirmed: "已确认",
  failed: "失败",
  matched: "已匹配",
  open: "未锁账",
  paid: "已付款",
  partial: "部分完成",
  partial_paid: "部分付款",
  partial_received: "部分回款",
  pending: "待处理",
  received: "已回款",
  reverted: "已回滚",
  signed: "已签名",
  superseded: "已被替换",
  voided: "已作废"
};

const changedFieldLabels: Record<string, string> = {
  dingtalkUserId: "钉钉用户 ID",
  displayName: "姓名",
  isActive: "账号状态",
  mustChangePassword: "首次登录改密状态",
  passwordChangedAt: "密码修改时间",
  passwordHash: "登录密码",
  passwordSalt: "密码安全信息",
  role: "角色"
};

export const auditEntityOptions = Object.entries(entityLabels).map(([value, label]) => ({ value, label }));
export const auditActionOptions = Object.entries(actionLabels).map(([value, label]) => ({ value, label }));

export function auditEntityLabel(value: string) {
  return entityLabels[value] ?? "其他审计对象";
}

export function auditEntityIdLabel(value: string) {
  return entityIdLabels[value] ?? value;
}

export function auditActionLabel(value: string) {
  return actionLabels[value] ?? "其他操作";
}

export function auditOperatorLabel(value: string) {
  if (!value) return "系统";
  if (roleLabels[value]) return roleLabels[value];
  if (value.startsWith("verify-")) return "系统自动校验";
  if (value === "system") return "系统";
  if (value === "unknown") return "未知操作人";
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value: unknown) {
  const number = asNumber(value);
  return number === null ? "-" : `¥${number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percentage(value: unknown) {
  const number = asNumber(value);
  return number === null ? "-" : `${(number * 100).toFixed(2)}%`;
}

function status(value: unknown) {
  const text = asText(value);
  return statusLabels[text] ?? text;
}

function changedFields(value: unknown) {
  if (!Array.isArray(value)) return "账号资料";
  return value.map((item) => changedFieldLabels[String(item)] ?? "账号资料").filter((item, index, rows) => rows.indexOf(item) === index).join("、");
}

export function auditPayloadSummary(payloadJson: string | null | undefined, action: string) {
  if (!payloadJson) return "未记录补充说明";

  let payload: Record<string, unknown>;
  try {
    const parsed = asRecord(JSON.parse(payloadJson));
    if (!parsed) return "已记录操作明细";
    payload = parsed;
  } catch {
    return "已记录操作说明";
  }

  const before = asRecord(payload.before);
  const after = asRecord(payload.after);

  switch (action) {
    case "batch_generate_salary_documents":
      return `生成销售代表薪资确认单 ${asText(payload.salesCount)} 份，操作员薪资确认单 ${asText(payload.customerServiceCount)} 份`;
    case "batch_generate":
      return `批量生成确认单 ${asText(payload.count)} 份`;
    case "confirm_service_commission":
      return `确认提成 ${money(after?.finalCommission)}，状态由“${status(before?.confirmStatus)}”变为“${status(after?.confirmStatus)}”`;
    case "adjust_commission_rate":
      return `订单 ${asText(payload.orderNo)}：提成比例由 ${percentage(payload.beforeRate)} 调整为 ${percentage(payload.afterRate)}，金额由 ${money(payload.beforeAmount)} 调整为 ${money(payload.afterAmount)}；原因：${asText(payload.reason)}`;
    case "adjust_and_confirm_commission":
    case "confirm_commission":
      return `确认提成合计 ${money(payload.totalCommission)}${payload.adjustReason ? `；调整原因：${asText(payload.adjustReason)}` : ""}`;
    case "import_excel":
      return `批次 ${asText(payload.batchNo)}，文件：${asText(payload.fileName)}`;
    case "rollback_and_restore_previous_import": {
      const parts = [`回滚批次 ${asText(payload.revertedBatchNo)}`];
      if (payload.restoredFromBatchNo) parts.push(`从批次 ${asText(payload.restoredFromBatchNo)} 恢复`);
      if (payload.restoredBatchNo) parts.push(`新批次 ${asText(payload.restoredBatchNo)}`);
      return parts.join("，");
    }
    case "rollback_import_batch":
      return `已回滚导入批次 ${asText(payload.batchNo ?? payload.revertedBatchNo)}`;
    case "record_receipt":
      return `订单 ${asText(payload.orderNo)} 登记回款 ${money(payload.amount)}，累计回款 ${money(payload.afterSettled)}`;
    case "record_payment":
      return `订单 ${asText(payload.orderNo)} 登记付款 ${money(payload.amount)}，累计付款 ${money(payload.afterSettled)}`;
    case "void_receipt":
      return `订单 ${asText(payload.orderNo)} 作废回款 ${money(payload.amount)}；原因：${asText(payload.reason)}`;
    case "void_payment":
      return `订单 ${asText(payload.orderNo)} 作废付款 ${money(payload.amount)}；原因：${asText(payload.reason)}`;
    case "confirm_reconciliation":
      return `确认银行核销 ${money(payload.amount)}，收付款记录编号 ${asText(payload.settlementRecordId)}`;
    case "suggest_reconciliation":
      return `生成核销建议 ${asText(payload.suggestionCount)} 条`;
    case "create_bank_transaction":
      return `流水 ${asText(payload.transactionNo)}，对方：${asText(payload.counterparty)}，金额：${money(payload.localAmount)}`;
    case "update_operator_performance_override":
      return `实际票数 ${asText(payload.orderCount)}，基础票数 ${asText(payload.baseCount)}，绩效规则值 ${asText(payload.rate)}`;
    case "update_operator_performance_payout_note":
      return `发放说明：${asText(payload.payoutNote)}`;
    case "create_manual_ledger_entry":
    case "confirm_manual_ledger_entry":
    case "void_manual_ledger_entry":
      return `原始数据编号 ${asText(payload.entryNo)}${payload.voidReason ? `；作废原因：${asText(payload.voidReason)}` : ""}`;
    case "generate_signature_link":
      return `签名链接有效期至 ${asText(payload.expiresAt)}`;
    case "send_signature_notification":
    case "record_signature_notification":
      return `通过 ${asText(payload.notificationChannel)} 发送，发送时间 ${asText(payload.notifiedAt)}`;
    case "signature_notification_failed":
      return `通过 ${asText(payload.notificationChannel)} 发送失败；原因：${asText(payload.notificationError)}`;
    case "employee_sign":
      return `员工已完成电子签名，签名时间 ${asText(payload.signedAt ?? payload.timestamp)}`;
    case "supervisor_confirm":
      return `主管已确认${payload.adjustReason ? `；调整原因：${asText(payload.adjustReason)}` : ""}`;
    case "void_for_resign":
      return `确认单已作废并重新签名；原因：${asText(payload.voidReason)}`;
    case "lock_month":
      return `已锁定月份${payload.note ? `；说明：${asText(payload.note)}` : ""}`;
    case "unlock_month":
      return `已解锁月份${payload.note ? `；说明：${asText(payload.note)}` : ""}`;
    case "login_success":
      return `账号 ${asText(payload.username)} 登录成功，角色：${roleLabels[asText(payload.role)] ?? asText(payload.role)}`;
    case "login_failed":
      return `账号 ${asText(payload.username)} 登录失败：账号或密码错误`;
    case "create_user":
      return `新增账号 ${asText(payload.username)}，角色：${roleLabels[asText(payload.role)] ?? asText(payload.role)}`;
    case "update_user":
      return `更新账号资料：${changedFields(payload.changed)}`;
    case "change_password":
      return `账号 ${asText(payload.username)} 已修改密码`;
    case "create_export_job":
      return `已创建导出任务${payload.fileName ? `：${asText(payload.fileName)}` : ""}`;
    case "reset_business_data":
      return "已清理业务数据，并保留本条审计记录";
    default:
      if (payload.batchNo) return `批次 ${asText(payload.batchNo)}${payload.fileName ? `，文件：${asText(payload.fileName)}` : ""}`;
      if (payload.note) return `说明：${asText(payload.note)}`;
      if (payload.count !== undefined) return `数量：${asText(payload.count)}`;
      if (payload.reason) return `原因：${asText(payload.reason)}`;
      return "已记录完整审计明细";
  }
}
