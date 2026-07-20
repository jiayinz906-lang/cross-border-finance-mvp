import { Tag } from "antd";

export type BillingStatus = "unsettled" | "partial" | "settled" | "refund_due";

const statusMeta: Record<BillingStatus, { color: string; label: string }> = {
  unsettled: { color: "default", label: "待结算" },
  partial: { color: "processing", label: "部分结算" },
  settled: { color: "success", label: "已结清" },
  refund_due: { color: "warning", label: "待退款/冲销" }
};

export function BillingStatusTag({ status }: { status: BillingStatus }) {
  const meta = statusMeta[status] ?? statusMeta.unsettled;
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
