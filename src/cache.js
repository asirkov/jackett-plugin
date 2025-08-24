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

  const decoded = {};
  for (const key in merged) {
    const cleanKey = decodeURIComponent(key);
    const val = merged[key];
    decoded[cleanKey] = typeof val === "string" ? decodeURIComponent(val) : val;
  }

  for (const key of ignoreKeys) {
    delete decoded[key];
  }

  const normalizedQuery = qs.stringify(decoded, {
    encode: false,
    sort: (a, b) => a.localeCompare(b),
  });

  const fullString = normalizedQuery ? `${baseUrl}?${normalizedQuery}` : baseUrl;

  return crypto.createHash("sha256").update(fullString).digest("hex");
}

async function get(url, params = {}, options = {}) {
  const cacheKey = buildCacheKey(url, params);

  if (config.cacheEnabled) {
    const cached = cache.get(cacheKey);

    if (cached) {
      config.debug && console.log("✅ Cache HIT:", cacheKey);
      stats.hits += 1;
      return cached;
    }
  }

  return axios
    .get(url, {
      params,
      validateStatus: null,
      ...options,
    })
    .then((response) => {
      if (config.cacheEnabled) {
        cache.set(cacheKey, response.data);
        config.debug && console.log("📥 Cache MISS:", cacheKey);
        stats.misses += 1;
      }

      return response.data;
    })
    .catch((err) => {
      console.error("❌ Error while GET:", url, err.message);
      return null;
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
    console.log({
      method: request.method,
      url: request.url,
      params: request.params,
    });
    return request;
  });

  axios.interceptors.response.use((response) => {
    console.log({
      status: response.status,
      data: response.data,
    });
    return response;
  });
}

export default { get, stats: getStats };
