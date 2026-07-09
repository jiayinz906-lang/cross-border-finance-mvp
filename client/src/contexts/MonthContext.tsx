import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type MonthContextValue = {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
};

const storageKey = "xjd-finance-selected-month";
const MonthContext = createContext<MonthContextValue | null>(null);

function normalizeMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month) ? month : "2026-06";
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [selectedMonth, setSelectedMonthState] = useState(() => normalizeMonth(localStorage.getItem(storageKey) ?? "2026-06"));

  const setSelectedMonth = (month: string) => {
    const nextMonth = normalizeMonth(month);
    setSelectedMonthState(nextMonth);
    localStorage.setItem(storageKey, nextMonth);
  };

  useEffect(() => {
    localStorage.setItem(storageKey, selectedMonth);
  }, [selectedMonth]);

  const value = useMemo(() => ({ selectedMonth, setSelectedMonth }), [selectedMonth]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useSelectedMonth() {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error("useSelectedMonth must be used inside MonthProvider");
  }
  return context;
}
