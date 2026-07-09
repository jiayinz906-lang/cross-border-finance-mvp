export const agencyRuntimeProfile = {
  source: "agency-agents-main",
  financeAgents: [
    {
      name: "FP&A Analyst",
      sourcePath: "external_refs/agency-agents-main/finance/finance-fpa-analyst.md",
      role: "月度经营、预算差异、毛利率、风险和管理层摘要"
    },
    {
      name: "Financial Analyst",
      sourcePath: "external_refs/agency-agents-main/finance/finance-financial-analyst.md",
      role: "原始数据校验、场景分析、应收应付和现金流口径"
    }
  ],
  testingAgents: [
    {
      name: "API Tester",
      sourcePath: "external_refs/agency-agents-main/testing/testing-api-tester.md",
      role: "导入接口、健康检查、异常输入和安全边界验证"
    },
    {
      name: "Reality Checker",
      sourcePath: "external_refs/agency-agents-main/testing/testing-reality-checker.md",
      role: "上线前证据复核：接口、页面、数据落库必须有实际验证"
    },
    {
      name: "Test Automation Engineer",
      sourcePath: "external_refs/agency-agents-main/testing/testing-test-automation-engineer.md",
      role: "自动化回归测试和导入链路测试"
    }
  ],
  importRules: [
    "Excel 导入必须先做表头自动映射，再写入数据库。",
    "应收、应付、毛利、风险和提成必须从单票明细聚合，不能只写汇总。",
    "导入结果必须返回字段映射、模板差异和使用的 agent 规则，便于测试复核。",
    "上线前必须通过后端构建、健康检查、GitHub Pages 或本地页面访问验证。"
  ]
};
