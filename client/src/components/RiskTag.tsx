import { Tag } from "antd";

export function RiskTag({ type }: { type?: string }) {
  const color = type === "abnormal_high_profit" ? "orange" : "red";
  const text = type === "abnormal_high_profit" ? "异常高利润" : "高风险";
  return <Tag color={color}>{text}</Tag>;
}
