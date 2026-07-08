import { receivableRepository } from "../repositories/receivable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

export const receivableService = {
  async listReceivables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return receivableRepository.listReceivables(selectedMonth);
  }
};
