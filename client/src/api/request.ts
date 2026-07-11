import axios from "axios";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000
});

let lastAuthNoticeAt = 0;

request.interceptors.request.use((config) => {
  const token = localStorage.getItem("xjd-finance-token");
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  if (import.meta.env.DEV) {
    const role = localStorage.getItem("xjd-finance-role") || "admin";
    config.headers.set("x-finance-role", role);
  }
  return config;
});

request.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      const isLoginRequest = String(error?.config?.url ?? "").includes("/auth/login");
      if (isLoginRequest) return Promise.reject(error);
      const message = status === 401
        ? "登录状态已失效，请重新登录。"
        : "当前账号没有执行该操作的权限。";
      if (status === 401) {
        localStorage.removeItem("xjd-finance-token");
        localStorage.removeItem("xjd-finance-user");
        window.dispatchEvent(new Event("xjd-auth-changed"));
      }
      const now = Date.now();
      if (now - lastAuthNoticeAt > 1500) {
        lastAuthNoticeAt = now;
        window.dispatchEvent(new CustomEvent("xjd-api-auth-error", { detail: { status, message } }));
      }
      if (!error.response.data?.message) {
        error.response.data = { ...(error.response.data ?? {}), message };
      }
    }
    return Promise.reject(error);
  }
);
