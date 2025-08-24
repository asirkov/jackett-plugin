const defaultIgnoreTitles =
  "\\b(Telecine|CAMRip)\\b|\\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\\b|\\b(?:HD-?)?CAM\\b|\\b(?:HQ-?)?CAM\\b";

const config = {
  port: process.env.PORT || 7000,
  debug: process.env.DEBUG === "true" || false,
  name: process.env.NAME || "Jackett (S/H)",

  jackettUrl: process.env.JACKETT_URL || "http://127.0.0.1:9117",
  jackettApiKey: process.env.JACKETT_API_KEY,

  tmdbApiKey: process.env.TMDB_API_KEY,
  languages: process.env.LANGUAGES?.split(",") || ["en-US"],

  maximumSize: process.env.MAXIMUM_SIZE || "10GB",
  minimumSeeders: process.env.MINIMUM_SEEDERS || 5,
  maximumCount: process.env.MAXIMUM_COUNT || 10,

  requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS || 8 * 1000,

  ignoreTitles: process.env.IGNORE_TITLES || defaultIgnoreTitles,

  cacheEnabled: process.env.CACHE_ENABLED === "true" || false,
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000,
  cacheMaximumSize: Number(process.env.CACHE_MAXIMUM_SIZE) || 100,
};

if (config.cacheMaximumSize <= 0 || config.cacheTtlMs <= 0) {
  console.warn("Failed to init cache: CACHE_TTL_MS and CACHE_MAXIMUM_SIZE should be greated than zero");
  config.cacheEnabled = false;
}

export default config;
