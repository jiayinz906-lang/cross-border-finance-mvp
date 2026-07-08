import { reportRepository } from "../repositories/report.repository.js";

export const reportService = {
  getMonthlyReport(month?: string) {
    return reportRepository.getMonthlyReport(month);
  }
};
