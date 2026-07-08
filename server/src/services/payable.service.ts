import { payableRepository } from "../repositories/payable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

export const payableService = {
  async listPayables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return payableRepository.listPayables(selectedMonth);
  }
};
