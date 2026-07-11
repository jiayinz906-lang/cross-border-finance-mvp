import { Alert, Input, Modal, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText: string;
  danger?: boolean;
  reasonRequired?: boolean;
  loading?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function ReasonActionModal({ open, title, description, confirmText, danger, reasonRequired = true, loading, children, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      okText={confirmText}
      cancelText="取消"
      okButtonProps={{ danger, disabled: reasonRequired && !reason.trim() }}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => onConfirm(reason.trim())}
      destroyOnClose
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        {description ? <Alert type={danger ? "warning" : "info"} showIcon message={description} /> : null}
        {children}
        <div>
          <Typography.Text strong>操作原因{reasonRequired ? "（必填）" : "（选填）"}</Typography.Text>
          <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} showCount autoSize={{ minRows: 3, maxRows: 6 }} placeholder="请填写便于后续审计追溯的原因" />
        </div>
      </Space>
    </Modal>
  );
}
