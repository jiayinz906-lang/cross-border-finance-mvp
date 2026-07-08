import { DownloadOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { monthlyReportExportUrl } from "../api/workflow.api";

export function ExportButton() {
  return (
    <Button icon={<DownloadOutlined />} onClick={() => window.open(monthlyReportExportUrl(), "_blank")}>
      导出 Excel
    </Button>
  );
}
