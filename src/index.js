import StremioAddonSdk from "stremio-addon-sdk";
import fzf from "string-similarity";

const { addonBuilder, serveHTTP } = StremioAddonSdk;

import jackett from "./jackett.js";
import config from "./config.js";
import cache from "./cache.js";
import util from "./util.js";

import { default as pkg } from "../package.json" assert { type: "json" };
import { default as manifest } from "./manifest.json" assert { type: "json" };

const builder = new addonBuilder({
  ...manifest,
  name: config.name,
  version: pkg.version,
});

function parseId(id) {
  if (id.startsWith("tmdb:")) {
    return id.split(":")[1];
  } else if (id.startsWith("tt")) {
    return id.split(":")[0];
  }

  return null;
}

function parseSeason(id) {
  if (id.startsWith("tmdb:")) {
    return id.split(":")[2];
  } else if (id.startsWith("tt")) {
    return id.split(":")[1];
  }

  return null;
}

function parseEpisode(id) {
  if (id.startsWith("tmdb:")) {
    return id.split(":")[3];
  } else if (id.startsWith("tt")) {
    return id.split(":")[2];
  }

  return null;
}

function parseDb(id) {
  if (id.startsWith("tmdb:")) {
    return "tmdb";
  } else if (id.startsWith("tt")) {
    return "tt";
  }

  return null;
}

function parseTmdbType(type) {
  if (type === "movie") {
    return "movie";
  } else if (type === "series") {
    return "tv";
  }

  return null;
}

function parseTmdbYear(tmdbReleaseDate) {
  if (!tmdbReleaseDate) {
    return null;
  }

  const parts = tmdbReleaseDate.split("-");
  if (!parts || parts.length === 0) {
    return null;
  }

  const year = parseInt(parts[0], 10);
  if (isNaN(year)) {
    return null;
  }

  return year;
}

function parseTtYear(ttYear) {
  const year = parseInt(ttYear, 10);
  if (isNaN(year)) {
    return null;
  }

  return year;
}

async function findTmdbInfo(language, type, id) {
  const ttId = parseId(id);

  const url = `https://api.themoviedb.org/3/find/${ttId}`;
  const params = {
    api_key: config.tmdbApiKey,
    language: language,
    external_source: "imdb_id",
  };

  const response = await cache.get(url, params, { maxRedirects: 5 });
  if (!response) {
    console.error("Error fetching TMDB (find) data:", response);
    return [];
  }

  return parseTmdbFindInfo(type, id, response);
}

function parseTmdbFindInfo(type, id, tmdbInfo) {
  const tmdbId = parseId(id);
  const tmdbType = parseTmdbType(type);

  const tmdbInfoResults = tmdbInfo[`${tmdbType}_results`];
  if (!tmdbInfoResults || tmdbInfoResults.length == 0) {
    return [];
  }
  const tmdbInfoResult = tmdbInfoResults[0];
  if (!tmdbInfoResult) {
    return [];
  }

  const year = parseTmdbYear(tmdbInfoResult["release_date"]);

  const title = tmdbInfoResult["title"];
  const name = tmdbInfoResult["name"];

  const season = parseSeason(id);
  const episode = parseEpisode(id);

  const result = [];
  result.push({
    id: tmdbId,
    type: type,
    name: title || name,
    year: year,
    season: season,
    episode: episode,
    db: "tmdb",
  });

  if (config.additionalYearSearch && year) {
    result.push({
      id: tmdbId,
      type: type,
      name: `${title || name} ${year}`,
      year: year,
      season: season,
      episode: episode,
      db: "tmdb",
    });
  }
  if (config.additionalSeasonSearch && season) {
    result.push({
      id: tmdbId,
      type: type,
      name: `${title || name} S${season}`,
      season: season,
      episode: episode,
      db: "tmdb",
    });
  }

  return result;
}

async function getTtInfo(type, id) {
  const ttId = parseId(id);

  const url = `https://v3-cinemeta.strem.io/meta/${type}/${ttId}.json`;

  const response = await cache.get(url, {}, { maxRedirects: 5 });
  if (!response) {
    console.error("Error fetching Cinemeta data:", response);
    return [];
  }

  return parseTtInfo(type, id, response);
}

function parseTtInfo(type, id, ttInfo) {
  const ttId = parseId(id);
  if (!ttInfo) {
    return [];
  }
  const ttInfoMeta = ttInfo["meta"];
  if (!ttInfoMeta) {
    return [];
  }

  const year = parseTtYear(ttInfoMeta["year"]);

  const name = ttInfoMeta["name"];

  const season = parseSeason(id);
  const episode = parseEpisode(id);

  const result = [
    {
      id: ttId,
      type: type,
      name: name,
      year: year,
      season: season,
      episode: episode,
      db: "tt",
    },
  ];

  if (config.additionalYearSearch && year) {
    result.push({
      id: ttId,
      type: type,
      name: `${name} ${year}`,
      year: year,
      season: season,
      episode: episode,
      db: "tt",
    });
  }

  return result;
}

async function getTmdbInfo(language, type, id) {
  const tmdbId = parseId(id);
  if (!tmdbId) {
    return [];
  }
  const tmdbType = parseTmdbType(type);
  if (!tmdbType) {
    return [];
  }

  const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}`;
  const params = {
    api_key: config.tmdbApiKey,
    language: language,
  };

  const response = await cache.get(url, params, { maxRedirects: 5 });
  if (!response) {
    console.error("Error fetching TMDB info data:", response);
    return [];
  }

  return parseTmdbGetInfo(type, id, response);
}

function parseTmdbGetInfo(type, id, tmdbInfo) {
  const tmdbId = parseId(id);

  const year = parseTmdbYear(tmdbInfo["release_date"]);

  const title = tmdbInfo["title"];
  const name = tmdbInfo["name"];

  const season = parseSeason(id);
  const episode = parseEpisode(id);

  const result = [];
  result.push({
    id: tmdbId,
    type: type,
    name: title || name,
    year: year,
    season: season,
    episode: episode,
    db: "tmdb",
  });

  if (config.additionalYearSearch && year) {
    result.push({
      id: tmdbId,
      type: type,
      name: `${title || name} ${year}`,
      year: year,
      season: season,
      episode: episode,
      db: "tmdb",
    });
  }

  if (config.additionalSeasonSearch && season) {
    result.push({
      id: tmdbId,
      type: type,
      name: `${title || name} S${season}`,
      season: season,
      episode: episode,
      db: "tmdb",
    });
  }

  return result;
}

async function getInfo(type, id) {
  const db = parseDb(id);
  if (!db) {
    return [];
  }

  const languages = config.languages;
  if (db == "tmdb" && config.tmdbApiKey) {
    const nestedInfo = await Promise.all(languages.map((language) => getTmdbInfo(language, type, id)));
    const info = nestedInfo.flat();
    return info;
  }

  if (db == "tt") {
    if (config.tmdbApiKey) {
      const nestedInfo = await Promise.all(languages.map((language) => findTmdbInfo(language, type, id)));
      const info = nestedInfo.flat();
      if (info.length > 0) {
        return info;
      }
    }

    return await getTtInfo(type, id);
  }

  return [];
}

function findIndexBySeasonAndEpisode(files, season, episode) {
  const s = season.toString().padStart(1, "0"); // without leading zeros
  const ss = season.toString().padStart(2, "0"); // with leading zeros
  const e = episode.toString().padStart(1, "0");
  const ee = episode.toString().padStart(2, "0");

  const patterns = [
    new RegExp(`s${s}e${e}`, "i"), // s1e4 — without leading zeros (short)
    new RegExp(`s${ss}e${ee}`, "i"), // s01e04 — default format with leading zeros
    new RegExp(`\\b${s}[x\\-]${ee}\\b`, "i"), // 1x04 або 1-04 —  alternative season/episode format
    new RegExp(`e${ee}\\b`, "i"), // e04 — only episode number
    new RegExp(`\\b${ee}\\b`, "i"), // 04 episode number as separate word
    new RegExp(`\\b${e}\\b`, "i"), // 4 episode number as separate word without leading zeros
    new RegExp(`\\b${e}\\s*(з|із|of|/|\\\\)\\s*\\d{1,2}\\b`, "i"), // 4 з 13, 4 із 13, 4 of 13, 4/13 або 4\13 — specific formats for UA-uk names
  ];

  const matchingFiles = files.filter((file) => {
    return patterns.some((pattern) => pattern.test(file.name));
  });

  const videoIndex = findIndexByVideoExtension(matchingFiles);
  const file = matchingFiles[videoIndex];

  return files.indexOf(file);
}

function findIndexByVideoExtension(files) {
  const pattern = new RegExp("\\.(mkv|mp4|avi|mov|webm|flv|wmv|mpeg|mpg|3gp|ts|m4v)$", "i");

  return files.findIndex((file) => pattern.test(file.name));
}

function countByVideoExtencion(files) {
  const pattern = new RegExp("\\.(mkv|mp4|avi|mov|webm|flv|wmv|mpeg|mpg|3gp|ts|m4v)$", "i");

  return files.filter((file) => pattern.test(file.name)).length;
}

function findIndexByYear(files, year) {
  const patterns = [
    new RegExp(`\\b${year}\\b`), // just the year as a separate word, e.g. "Dune 2021 BDRip"
    new RegExp(`\\(${year}\\)`), // year in parentheses: "(2021)"
    new RegExp(`\\[${year}\\]`), // year in square brackets: "[2021]"
    new RegExp(`[^a-zA-Z]${year}[^a-zA-Z]`), // year surrounded by non-letters: " -2021 ", "_2021.", " 2021 "
  ];

  const matchingFiles = files.filter((file) => {
    return patterns.some((pattern) => pattern.test(file.name));
  });

  const videoIndex = findIndexByVideoExtension(matchingFiles);
  const file = matchingFiles[videoIndex];

  return files.indexOf(file);
}

function containsVideoFile(parsedTorrent) {
  if (!parsedTorrent || !parsedTorrent.files) {
    return false;
  }

  const files = parsedTorrent.files;
  const videoIdx = findIndexByVideoExtension(files);

  return videoIdx >= 0;
}
function relevanceScore(info, stream) {
  let score = 0;

  const infoTitle = info.name ? info.name.toLowerCase() : "";
  const streamTitle = stream.title ? util.cleanTorrentName(stream.title) : "";

  if (infoTitle.length > 0 && streamTitle.length > 0) {
    // TODO: try other liblaries: fast-levenshtein or fuse.js
    const similarity = fzf.compareTwoStrings(infoTitle, streamTitle); // 0..1
    score += similarity * 100;
  }

  if (info.type === "movie" && info.year && streamTitle.includes(info.year.toString())) {
    score += 30;
  }

  if (
    info.type === "series" &&
    info.season &&
    (streamTitle.includes("S" + info.season) ||
      streamTitle.includes("Season " + info.season) ||
      streamTitle.includes("Сезон " + info.season))
  ) {
    score += 50;
  }

  if (stream.tag) {
    if (stream.tag === "1080p") {
      score += 15;
    } else if (stream.tag.toLowerCase() === "bdrip") {
      score += 10;
    } else if (stream.tag.toLowerCase() === "dvdrip") {
      score += 5;
    }
  }

  if (stream.seeders) {
    score += stream.seeders * 2;
  }

  return score;
}

function parseStream(info, indexerTorrent, parsedTorrent) {
  const stream = {};
  const infoHash = parsedTorrent.infoHash.toLowerCase();

  if (!parsedTorrent || !parsedTorrent.files) {
    stream.fileIdx = null;
  } else {
    const files = parsedTorrent.files;
    if (files.length == 1) {
      stream.fileIdx = 0;
    } else {
      let fileIdx = null;
      if (info.type == "movie") {
        // if in torrent files several movies - find by year
        if (countByVideoExtencion(files) > 1) {
          fileIdx = findIndexByYear(files, info.year);
        } else {
          fileIdx = findIndexByVideoExtension(files);
        }
      } else if (info.type == "series") {
        // if in torrent several seasons/episodes - find by season and episode
        fileIdx = findIndexBySeasonAndEpisode(files, info.season, info.episode);
      }
      if (fileIdx != null && fileIdx >= 0) {
        stream.fileIdx = fileIdx;
      }
    }
  }

  let title = indexerTorrent.title;

  const published = indexerTorrent.published;
  const publishedDateStr = published.toLocaleDateString("uk-UA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subtitle1 = `👤 ${indexerTorrent.seeders}/${indexerTorrent.peers}  💾 ${util.toStringSize(
    indexerTorrent.size
  )} ⚙️ ${indexerTorrent.from}`;
  const subtitle2 = `📅 ${publishedDateStr}`;

  title = title.replace("\n", "");
  title += "\r\n\r\n" + subtitle1;
  title += "\r\n" + subtitle2;

  const quality = util.findQuality(indexerTorrent.extraTag);
  stream.name = quality;

  stream.tag = quality;
  stream.type = info.type;
  stream.infoHash = infoHash;
  stream.title = title;
  stream.seeders = indexerTorrent.seeders;
  stream.published = indexerTorrent.published;

  const trackers = Array.isArray(parsedTorrent.announce) ? parsedTorrent.announce : [];
  stream.sources = trackers.map((t) => "tracker:" + t).concat(["dht:" + infoHash]);

  const id = parseId(info.id);
  let bingeGroup = id;
  if (info.season) {
    bingeGroup += `-s${info.season}`;
  }
  stream.behaviorHints = {
    bingeGroup: bingeGroup,
  };

  const relevance = relevanceScore(info, stream);
  stream.relevance = relevance;

  config.debug && console.log("Parsed stream:", JSON.stringify(stream));
  return stream;
}

async function streamHandlerUnsafe({ type, id }) {
  if (!id) {
    return { streams: [] };
  }

  if (!config.jackettApiKey) {
    console.error("Error, JACKETT_API_KEY env variable is missed");
    return { streams: [] };
  }

  const info = await getInfo(type, id);
  config.debug && console.log("info:", info);

  const infoTorrents = await Promise.all(
    info.map(async (info) => {
      const torrents = await jackett.search(info, config.jackettUrl, config.jackettApiKey);
      return {
        info: info,
        torrents: torrents,
      };
    })
  );
  config.debug && console.log("infoTorrents:", infoTorrents);

  const streams = infoTorrents.flatMap((infoTorrent) =>
    infoTorrent.torrents
      .filter((torrent) => containsVideoFile(torrent.parsedTorrent))
      .map((torrent) => parseStream(infoTorrent.info, torrent.indexerTorrent, torrent.parsedTorrent))
  );

  const unique = Array.from(new Map(streams.map((stream) => [stream.infoHash, stream])).values());

  // TODO: consider moving sort parameter to config
  // const result = unique.sort((a, b) => b.seeders - a.seeders)
  // const result = unique.sort((a, b) => b.published - a.published);
  const result = unique.sort((a, b) => b.relevance - a.relevance).map(({ relevance, ...rest }) => rest);
  
  config.debug && console.log("Cache stats: ", cache.stats());
  return { streams: result.slice(0, config.maximumCount) };
}

async function streamHandler(args) {
  try {
    return await streamHandlerUnsafe(args);
  } catch (e) {
    console.error(e);
    return { streams: [] };
  }
}

builder.defineStreamHandler(streamHandler);

config.debug && console.log("Starting with config: ", JSON.stringify(config, null, 2));
serveHTTP(builder.getInterface(), { port: config.port });
