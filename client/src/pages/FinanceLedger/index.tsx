import { Button, Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getFinanceLedger } from "../../api/finance.api";
import { ExportButton } from "../../components/ExportButton";
import { FinanceTable } from "../../components/FinanceTable";
import { ImportButton } from "../../components/ImportButton";
import { MonthSelector } from "../../components/MonthSelector";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { FinanceOrder } from "../../types/finance.types";

export default function FinanceLedger() {
  const [data, setData] = useState<FinanceOrder[]>([]);
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();

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
        description="Excel 上传后由后端按订单编号聚合应收、应付、毛利和复核状态。"
        extra={(
          <Space wrap>
            <ImportButton onImported={(result) => setSelectedMonth(result.month)} />
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
