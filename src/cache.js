import axios from "axios";
import crypto from "crypto";
import qs from "qs";
import { LRUCache } from "lru-cache";

import config from "./config.js";

const ignoreKeys = ["path", "jackett_apikey", "api_key", "apikey"];

const stats = {
  hits: 0,
  misses: 0,
};

let cache;

function buildCacheKey(url, params = {}) {
  const [baseUrl, query] = url.split("?");

  const parsed = query ? qs.parse(query) : {};
  const merged = { ...parsed, ...params };

  for (const key of ignoreKeys) {
    delete merged[key];
  }

  const normalizedQuery = qs.stringify(merged, {
    encode: false,
    sort: (a, b) => a.localeCompare(b),
  });

  const fullString = normalizedQuery ? `${baseUrl}?${normalizedQuery}` : baseUrl;

  return crypto.createHash("sha256").update(fullString).digest("hex");
}

async function get(url, params = {}, options = {}) {
  const cacheKey = buildCacheKey(url, params);

  if (config.cacheEnabled && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    config.debug && console.log("✅ Cache HIT:", cacheKey);
    stats.hits += 1;
    return cached;
  }

  return axios
    .get(url, {
      params,
      validateStatus: () => true, // don't throw; inspect status manually
      ...options,
    })
    .then((response) => {
      const ok = response.status >= 200 && response.status < 300 && response.data != null;

      if (config.cacheEnabled) {
        if (ok) {
          cache.set(cacheKey, response.data);
          stats.misses += 1;
          config.debug && console.log("📥 Cache MISS:", cacheKey, { status: response.status });
        } else {
          config.debug && console.warn("↪️ Not caching non-2xx response", { status: response.status, url });
        }
      }

      return ok ? response.data : null;
    });
}

function getStats() {
  if (!config.cacheEnabled) {
    return {
      enabled: false,
    };
  }

  return {
    enabled: true,
    hits: stats.hits,
    misses: stats.misses,
    keys: cache.size,
    max: cache.max,
  };
}

if (config.cacheEnabled) {
  cache = new LRUCache({
    max: config.cacheMaximumSize,
    ttl: config.cacheTtlMs,
  });
}

if (config.debug) {
  axios.interceptors.request.use((request) => {
    const redact = (obj) =>
      obj
        ? Object.fromEntries(Object.entries(obj).map(([k, v]) => (ignoreKeys.includes(k) ? [k, "***"] : [k, v])))
        : obj;
    console.log({
      method: request.method,
      url: request.url,
      params: redact(request.params),
    });
    return request;
  });

  axios.interceptors.response.use((response) => {
    const isBinary = response.config?.responseType === "arraybuffer";
    console.log({
      status: response.status,
      data: isBinary ? `<arraybuffer:${response.data?.byteLength ?? response.data?.length ?? 0} bytes>` : response.data,
    });
    return response;
  });
}

export default { get, stats: getStats };
