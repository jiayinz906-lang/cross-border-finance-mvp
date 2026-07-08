import { Card, Descriptions } from "antd";
import { useEffect, useState } from "react";
import { getMonthlyReport } from "../../api/reports.api";
import { PageHeader } from "../../components/PageHeader";

export default function Reports() {
  const [report, setReport] = useState<any>();
  useEffect(() => { getMonthlyReport().then((res) => setReport(res.data)); }, []);
  return (
    <>
      <PageHeader title="月度报表" description="预留 CFO 摘要、经营分析和 Excel 导出结构。" />
      <Card>
        <Descriptions column={2}>
          <Descriptions.Item label="月份">{report?.summary?.month ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="风险记录">{report?.risks?.length ?? 0}</Descriptions.Item>
          <Descriptions.Item label="提成记录">{report?.commissions?.length ?? 0}</Descriptions.Item>
          <Descriptions.Item label="服务类确认">{report?.serviceRecords?.length ?? 0}</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );
}
