import { DownloadOutlined } from "@ant-design/icons";
import { Button, message } from "antd";
import { useState } from "react";
import { downloadMonthlyReport } from "../api/workflow.api";
import { useSelectedMonth } from "../contexts/MonthContext";

export function ExportButton() {
  const { selectedMonth } = useSelectedMonth();
  const [loading, setLoading] = useState(false);

  return (
    <Button loading={loading} icon={<DownloadOutlined />} onClick={async () => {
      setLoading(true);
      try {
        await downloadMonthlyReport(selectedMonth);
        message.success("月报已下载");
      } catch {
        message.error("月报下载失败，请检查登录状态或后端服务");
      } finally {
        setLoading(false);
      }
    }}>
      导出 Excel
    </Button>
  );
}
