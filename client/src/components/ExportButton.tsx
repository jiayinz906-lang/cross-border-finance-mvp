import { DownloadOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { monthlyReportExportUrl } from "../api/workflow.api";
import { useSelectedMonth } from "../contexts/MonthContext";

export function ExportButton() {
  const { selectedMonth } = useSelectedMonth();

  return (
    <Button icon={<DownloadOutlined />} onClick={() => window.open(monthlyReportExportUrl(selectedMonth), "_blank")}>
      导出 Excel
    </Button>
  );
}
