import { DownloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Empty, Spin, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getMonthlyReport } from "../../api/reports.api";
import { downloadMonthlyReport } from "../../api/workflow.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";

export default function Reports() {
  const [report, setReport] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const { selectedMonth } = useSelectedMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getMonthlyReport(selectedMonth);
      setReport(response.data);
    } catch {
      setReport(undefined);
      setError("月度报表加载失败，请检查登录状态或后端服务。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { void load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadMonthlyReport(selectedMonth);
      message.success("管理层月报已下载");
    } catch {
      message.error("月报下载失败，请重新登录后重试");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader title="月度报表" description="CFO摘要、经营分析和Excel导出。" />
      <Card>
        {loading ? <div className="page-state"><Spin tip="正在加载月度报表" /></div> : error ? <Alert type="error" showIcon message={error} action={<Button onClick={load}>重试</Button>} /> : !report ? <Empty description="当前月份暂无报表数据" /> : (
          <>
            <Button type="primary" loading={downloading} icon={<DownloadOutlined />} style={{ marginBottom: 16 }} onClick={download}>导出管理层月报Excel</Button>
            <Descriptions column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="月份">{report.summary?.month ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="风险记录">{report.risks?.length ?? 0}</Descriptions.Item>
              <Descriptions.Item label="提成记录">{report.commissions?.length ?? 0}</Descriptions.Item>
              <Descriptions.Item label="服务类确认">{report.serviceRecords?.length ?? 0}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>
    </>
  );
}
