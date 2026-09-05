import { useEffect, useState } from "react";
import api from "../lib/api.js";

let cachedContent = null;
let pendingRequest = null;

function loadContent() {
  if (cachedContent) return Promise.resolve(cachedContent);
  if (!pendingRequest) {
    pendingRequest = api
      .get("/platform/content")
      .then(({ data }) => {
        cachedContent = data.content || {};
        return cachedContent;
      })
      .finally(() => {
        pendingRequest = null;
      });
  }
  return pendingRequest;
}

export async function refreshPlatformContent() {
  cachedContent = null;
  const content = await loadContent();
  window.dispatchEvent(new CustomEvent("platform-content-updated", { detail: content }));
  return content;
}

export default function usePlatformContent() {
  const [content, setContent] = useState(cachedContent || {});

  useEffect(() => {
    let active = true;
    const handleUpdate = (event) => setContent(event.detail || {});
    window.addEventListener("platform-content-updated", handleUpdate);
    loadContent()
      .then((value) => {
        if (active) setContent(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener("platform-content-updated", handleUpdate);
    };
  }, []);

  return content;
}
