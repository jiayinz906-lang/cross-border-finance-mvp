import { Button, Descriptions, Modal, Typography } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";

type OrderIdentity = {
  orderNo?: string | null;
  customerOrderNo?: string | null;
  customerName?: string | null;
  businessType?: string | null;
};

type Props = {
  order: OrderIdentity;
  children?: ReactNode;
};

export function OrderNoPopup({ order, children }: Props) {
  const [open, setOpen] = useState(false);
  const orderNo = order.orderNo || "未提供";
  const customerOrderNo = order.customerOrderNo || "未提供";

  return (
    <>
      <Button type="link" className="order-no-link" onClick={() => setOpen(true)}>
        {children ?? orderNo}
      </Button>
      <Modal
        title="订单编号详情"
        open={open}
        onCancel={() => setOpen(false)}
        footer={<Button type="primary" onClick={() => setOpen(false)}>关闭</Button>}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="系统订单编号">
            <Typography.Text copyable>{orderNo}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="用户订单号">
            <Typography.Text copyable={customerOrderNo !== "未提供"}>{customerOrderNo}</Typography.Text>
          </Descriptions.Item>
          {order.customerName ? <Descriptions.Item label="客户">{order.customerName}</Descriptions.Item> : null}
          {order.businessType ? <Descriptions.Item label="业务类型">{order.businessType}</Descriptions.Item> : null}
        </Descriptions>
      </Modal>
    </>
  );
}
