import { FileProtectOutlined } from "@ant-design/icons";
import { Button, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { importFinanceTemplate } from "../api/finance.api";
import type { ImportTemplateResult } from "../types/finance.types";

type Props = {
  onImported?: (result: ImportTemplateResult) => void;
};

export function TemplateImportButton({ onImported }: Props) {
  const props: UploadProps = {
    accept: ".xlsx,.xls",
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const response = await importFinanceTemplate(file as File);
        const result = response.data as ImportTemplateResult;
        message.success(`模板表头已保存：${result.headerCount} 列，不导入业务数据`);
        onImported?.(result);
        onSuccess?.(result);
      } catch (error) {
        message.error("模板表头保存失败，请检查是否包含运单号、收付类型、费用类型");
        onError?.(error as Error);
      }
    }
  };

  return (
    <Upload {...props}>
      <Button icon={<FileProtectOutlined />}>上传模板表头</Button>
    </Upload>
  );
}
