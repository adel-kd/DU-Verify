import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dv_token");
  if (token) config.headers.authorization = `Bearer ${token}`;
  return config;
});

export default api;
