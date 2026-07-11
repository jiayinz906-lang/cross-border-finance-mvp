import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getFinanceMonths } from "../api/finance.api";
import { useAuth } from "./AuthContext";

type MonthContextValue = {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  availableMonths: string[];
  ready: boolean;
};

const storageKey = "xjd-finance-selected-month";
const MonthContext = createContext<MonthContextValue | null>(null);

function normalizeMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month) ? month : "";
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [selectedMonth, setSelectedMonthState] = useState(() => normalizeMonth(localStorage.getItem(storageKey) ?? ""));
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const setSelectedMonth = (month: string) => {
    const nextMonth = normalizeMonth(month);
    if (!nextMonth) return;
    setSelectedMonthState(nextMonth);
    localStorage.setItem(storageKey, nextMonth);
  };

  useEffect(() => {
    if (selectedMonth) localStorage.setItem(storageKey, selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setReady(true);
      return;
    }
    setReady(false);
    getFinanceMonths()
      .then((response) => {
        if (!mounted) return;
        const months = (response.data.rows ?? []).map((row: { month: string }) => row.month).filter(Boolean);
        setAvailableMonths(months);
        const stored = normalizeMonth(localStorage.getItem(storageKey) ?? "");
        const next = stored && months.includes(stored) ? stored : months[0] ?? stored ?? new Date().toISOString().slice(0, 7);
        setSelectedMonthState(next);
      })
      .catch(() => {
        if (!mounted) return;
        const fallback = normalizeMonth(localStorage.getItem(storageKey) ?? "") || new Date().toISOString().slice(0, 7);
        setSelectedMonthState(fallback);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  const value = useMemo(() => ({ selectedMonth, setSelectedMonth, availableMonths, ready }), [selectedMonth, availableMonths, ready]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useSelectedMonth() {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error("useSelectedMonth must be used inside MonthProvider");
  }
  return context;
}
