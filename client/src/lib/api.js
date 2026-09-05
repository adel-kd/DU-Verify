import axios from "axios";

const configuredApiUrl = import.meta.env.VITE_API_URL;
const localApiUrl = "http://localhost:5000";
const remoteApiUrls = [
  configuredApiUrl,
  "https://gory-starry-undercoat.ngrok-free.dev",
];

const isLocalFrontend = ["localhost", "127.0.0.1"].includes(
  window.location.hostname
);

const baseURLs = [
  ...(isLocalFrontend ? [localApiUrl, ...remoteApiUrls] : [...remoteApiUrls, localApiUrl]),
]
  .filter(Boolean)
  .map((url) => url.replace(/\/+$/, ""))
  .filter((url, index, urls) => urls.indexOf(url) === index);

const clients = baseURLs.map((baseURL) => {
  const client = axios.create({ baseURL: `${baseURL}/api` });
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("dv_token");
    if (token) config.headers.authorization = `Bearer ${token}`;
    return config;
  });
  return client;
});

function shouldFailover(error) {
  const status = error.response?.status;
  return !error.response || status === 0 || status >= 500;
}

async function requestWithFallback(config) {
  let lastError;
  for (const client of clients) {
    try {
      return await client.request(config);
    } catch (error) {
      lastError = error;
      if (!shouldFailover(error)) throw error;
    }
  }
  throw lastError;
}

const api = {
  baseURLs,
  request: requestWithFallback,
  get: (url, config) => requestWithFallback({ ...config, method: "get", url }),
  delete: (url, config) => requestWithFallback({ ...config, method: "delete", url }),
  head: (url, config) => requestWithFallback({ ...config, method: "head", url }),
  options: (url, config) => requestWithFallback({ ...config, method: "options", url }),
  post: (url, data, config) => requestWithFallback({ ...config, method: "post", url, data }),
  put: (url, data, config) => requestWithFallback({ ...config, method: "put", url, data }),
  patch: (url, data, config) => requestWithFallback({ ...config, method: "patch", url, data }),
};

export default api;
