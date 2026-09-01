import axios from "axios";

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  "https://gory-starry-undercoat.ngrok-free.dev";

const api = axios.create({ baseURL: `${apiBaseUrl}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dv_token");
  if (token) config.headers.authorization = `Bearer ${token}`;
  return config;
});

export default api;
