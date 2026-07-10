import axios from "axios";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem("xjd-finance-token");
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  const role = localStorage.getItem("xjd-finance-role") || "admin";
  config.headers.set("x-finance-role", role);
  return config;
});

request.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      const message = status === 401
        ? "请先在参数规则页登录后再执行该操作。"
        : "当前账号权限不足，请在参数规则页切换有权限账号。";
      window.dispatchEvent(new CustomEvent("xjd-api-auth-error", { detail: { status, message } }));
      if (!error.response.data?.message) {
        error.response.data = { ...(error.response.data ?? {}), message };
      }
    }
    return Promise.reject(error);
  }
);
