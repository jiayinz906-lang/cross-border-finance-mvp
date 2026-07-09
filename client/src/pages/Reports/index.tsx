import { Card, Descriptions } from "antd";
import { useEffect, useState } from "react";
import { getMonthlyReport } from "../../api/reports.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";

export default function Reports() {
  const [report, setReport] = useState<any>();
  const { selectedMonth } = useSelectedMonth();

  useEffect(() => {
    getMonthlyReport(selectedMonth).then((res) => setReport(res.data));
  }, [selectedMonth]);

  return (
    <>
      <PageHeader title="月度报表" description="CFO 摘要、经营分析和 Excel 导出结构。" />
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
