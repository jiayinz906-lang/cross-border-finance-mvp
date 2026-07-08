import { Card, Statistic } from "antd";

type Props = {
  title: string;
  value: string | number;
  suffix?: string;
};

export function StatCard({ title, value, suffix }: Props) {
  return (
    <Card className="stat-card">
      <Statistic title={title} value={value} suffix={suffix} />
    </Card>
  );
}
