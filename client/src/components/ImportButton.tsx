import { UploadOutlined } from "@ant-design/icons";
import { Button, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { importFinanceExcel } from "../api/finance.api";
import type { ImportResult } from "../types/finance.types";

type Props = {
  onImported?: (result: ImportResult) => void;
};

export function ImportButton({ onImported }: Props) {
  const props: UploadProps = {
    accept: ".xlsx,.xls",
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const response = await importFinanceExcel(file as File);
        const result = response.data as ImportResult;
        message.success(`导入完成：${result.importedOrders} 个订单，${result.importedRows} 行明细`);
        onImported?.(result);
        onSuccess?.(result);
      } catch (error) {
        message.error("Excel 导入失败，请检查文件格式和表头");
        onError?.(error as Error);
      }
    }
  };

  return (
    <Upload {...props}>
      <Button type="primary" icon={<UploadOutlined />}>上传 Excel 导入</Button>
    </Upload>
  );
}
