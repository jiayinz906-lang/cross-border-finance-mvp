import axios from "axios";

export const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000
});

request.interceptors.request.use((config) => {
  const role = localStorage.getItem("xjd-finance-role") || "admin";
  config.headers.set("x-finance-role", role);
  return config;
});
