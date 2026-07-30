import { Button, Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFinanceLedger } from "../../api/finance.api";
import { ExportButton } from "../../components/ExportButton";
import { FinanceTable } from "../../components/FinanceTable";
import { MonthSelector } from "../../components/MonthSelector";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { FinanceOrder } from "../../types/finance.types";

export default function FinanceLedger() {
  const [data, setData] = useState<FinanceOrder[]>([]);
  const { selectedMonth } = useSelectedMonth();
  const navigate = useNavigate();

  const load = useCallback(() => {
    getFinanceLedger(selectedMonth).then((res) => setData(res.data));
  }, [selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <PageHeader
        title="财务台账"
        description="由已确认的 ERP 业务单按订单编号聚合应收、应付、毛利和复核状态。"
        extra={(
          <Space wrap>
            <Button type="primary" onClick={() => navigate("/raw-entry")}>录入业务单</Button>
            <Button onClick={load}>刷新</Button>
          </Space>
        )}
      />
      <Space wrap>
        <MonthSelector />
        <ExportButton />
      </Space>
      <FinanceTable data={data} />
    </Space>
  );
}
