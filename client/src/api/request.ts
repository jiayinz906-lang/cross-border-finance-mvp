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
