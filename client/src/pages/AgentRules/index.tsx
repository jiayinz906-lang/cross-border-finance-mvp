import { Card, Descriptions, List } from "antd";
import { useEffect, useState } from "react";
import { getAgentRules } from "../../api/finance.api";
import { PageHeader } from "../../components/PageHeader";

type AgentRules = {
  agentName: string;
  path: string;
  status: string;
  coreRules: string[];
};

export default function AgentRules() {
  const [rules, setRules] = useState<AgentRules | null>(null);
  useEffect(() => { getAgentRules().then((res) => setRules(res.data)); }, []);
  return (
    <>
      <PageHeader title="Agent规则" description="FP&A Analyst Agent 的规则配置和核心财务口径摘要。" />
      <Card>
        <Descriptions column={1}>
          <Descriptions.Item label="Agent 名称">{rules?.agentName}</Descriptions.Item>
          <Descriptions.Item label="Agent 文件路径">{rules?.path}</Descriptions.Item>
          <Descriptions.Item label="规则状态">{rules?.status}</Descriptions.Item>
        </Descriptions>
        <List header="当前核心口径摘要" dataSource={rules?.coreRules ?? []} renderItem={(item) => <List.Item>{item}</List.Item>} />
      </Card>
    </>
  );
}
