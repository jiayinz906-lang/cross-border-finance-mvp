import { env } from "../config/env.js";

export const exchangeRateService = {
  async getUsdCnyRate() {
    // TODO:
    // 1. 从 EXCHANGE_RATE_API_KEY 读取 API Key；
    // 2. 调用 ExchangeRate-API 获取 USD/CNY；
    // 3. 如果 API 不可用，返回汇率待确认状态；
    // 4. 不得硬编码 API Key。
    if (!env.exchangeRateApiKey || env.exchangeRateApiKey === "your_exchange_rate_api_key_here") {
      return { status: "pending", rate: null, message: "汇率待确认" };
    }

    return { status: "todo", rate: null, message: "第一阶段不真正接入外部汇率 API" };
  }
};
