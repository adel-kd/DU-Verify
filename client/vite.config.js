import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readApiPort() {
  try {
    const serverEnv = fs.readFileSync(path.resolve(__dirname, "../server/.env"), "utf8");
    return serverEnv.match(/^PORT\s*=\s*(\d+)\s*$/m)?.[1] || "5000";
  } catch {
    return "5000";
  }
}

export default defineConfig(() => {
  // Read only PORT; never load backend secrets into Vite's environment.
  const apiPort = process.env.API_PORT || readApiPort();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
