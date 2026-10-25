import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = typeof sessionStorage === "undefined"
    ? null
    : sessionStorage.getItem("aris-desktop-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});