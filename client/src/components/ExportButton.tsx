import { DownloadOutlined } from "@ant-design/icons";
import { Button } from "antd";

export function ExportButton() {
  return <Button icon={<DownloadOutlined />} disabled>Excel导出占位</Button>;
}
