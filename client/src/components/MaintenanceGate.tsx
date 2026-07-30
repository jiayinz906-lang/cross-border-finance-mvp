import Button from "antd/es/button";
import Result from "antd/es/result";
import Spin from "antd/es/spin";
import { useEffect, useState, type ReactNode } from "react";
import { apiBaseUrl } from "../api/request";

type MaintenanceState = { active: boolean; message: string; checking: boolean };

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MaintenanceState>({ active: false, message: "", checking: false });

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setState({ active: true, message: detail?.message || "系统正在维护，请稍后重试。", checking: false });
    };
    window.addEventListener("xjd-maintenance-mode", listener);
    return () => window.removeEventListener("xjd-maintenance-mode", listener);
  }, []);

  async function retry() {
    setState((current) => ({ ...current, checking: true }));
    try {
      const response = await fetch(`${apiBaseUrl}/health`, { cache: "no-store" });
      const body = await response.json() as { maintenance?: { enabled?: boolean; message?: string } };
      if (!body.maintenance?.enabled) {
        window.location.reload();
        return;
      }
      setState({ active: true, checking: false, message: body.maintenance.message || state.message });
    } catch {
      setState((current) => ({ ...current, checking: false }));
    }
  }

  if (!state.active) return children;
  return (
    <main className="maintenance-page">
      <Result
        status="warning"
        title="系统维护中"
        subTitle={state.message}
        extra={<Button type="primary" disabled={state.checking} onClick={retry}>{state.checking ? <Spin size="small" /> : "重新检查"}</Button>}
      />
    </main>
  );
}
