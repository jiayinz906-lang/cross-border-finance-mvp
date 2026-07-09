import { Input } from "antd";
import { useSelectedMonth } from "../contexts/MonthContext";

export function MonthSelector() {
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();

  return (
    <Input
      type="month"
      value={selectedMonth}
      onChange={(event) => setSelectedMonth(event.target.value)}
      style={{ width: 150 }}
    />
  );
}
