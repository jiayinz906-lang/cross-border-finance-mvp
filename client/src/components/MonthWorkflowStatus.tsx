import { Alert, Card, Progress, Space, Tag } from "antd";
import { useEffect, useState } from "react";
import { getMonthWorkflowStatus, type MonthWorkflowStatus as MonthWorkflowStatusData } from "../api/workflow.api";

const labels: Record<string, string> = {
  excel_imported: "Excel导入",
  import_audit_passed: "导入审计",
  risk_review_pending: "风险复核",
  service_confirm_pending: "注册确认",
  commission_signature_pending: "提成签名",
  operator_signature_pending: "操作员签名",
  receivable_payable_pending: "应收应付",
  cfo_ready: "CFO就绪",
  locked: "锁账"
};

const colors: Record<string, string> = {
  done: "green",
  active: "blue",
  blocked: "red",
  pending: "gold"
};

export function MonthWorkflowStatus({ month }: { month: string }) {
  const [data, setData] = useState<MonthWorkflowStatusData | null>(null);

  useEffect(() => {
    let mounted = true;
    getMonthWorkflowStatus(month)
      .then((res) => {
        if (mounted) setData(res.data);
      })
      .catch(() => {
        if (mounted) setData(null);
      });
    return () => {
      mounted = false;
    };
  }, [month]);

  if (!data) return null;

  const done = data.steps.filter((item) => item.status === "done").length;
  const percent = data.steps.length ? Math.round((done / data.steps.length) * 100) : 0;

  return (
    <Card className="month-workflow-card">
      <div className="month-workflow-head">
        <div>
          <strong>{month} 月度闭环进度</strong>
          <span>{data.readyToClose ? "当前月份已满足锁账前置条件" : "锁账前必须完成以下卡点"}</span>
        </div>
        <Tag color={data.locked ? "green" : data.readyToClose ? "blue" : "orange"}>
          {data.locked ? "已锁账" : data.readyToClose ? "可锁账" : "处理中"}
        </Tag>
      </div>
      <Progress percent={percent} showInfo={false} strokeColor="#3d78ed" trailColor="#e9eef6" />
      <div className="month-workflow-steps">
        {data.steps.map((step) => (
          <div key={step.key} className={`month-workflow-step is-${step.status}`}>
            <Tag color={colors[step.status] ?? "default"}>{step.status}</Tag>
            <b>{labels[step.key] ?? step.key}</b>
            <span>{step.count > 0 ? `${step.count} 项` : "无待办"}</span>
            <em>{step.nextAction}</em>
          </div>
        ))}
      </div>
      {!data.readyToClose && data.blockers.length > 0 && (
        <Alert
          className="month-workflow-alert"
          type="warning"
          showIcon
          message="当前月份暂不能锁账"
          description={<Space wrap>{data.blockers.map((item) => <Tag key={item} color="orange">{item}</Tag>)}</Space>}
        />
      )}
    </Card>
  );
}
