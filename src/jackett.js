import xmlJs from "xml-js";
import qs from "qs";
import parse_torrent from "parse-torrent";

import config from "./config.js";
import cache from "./cache.js";
import util from "./util.js";

function parsePubDate(strDate) {
  if (!strDate) {
    return null;
  }
  const date = new Date(strDate);
  if (isNaN(date)) {
    console.error("Invalid date");
  }

  return date;
}

async function getIndexers(host, apiKey) {
  const url = `${host}/api/v2.0/indexers/all/results/torznab/api`;
  const params = {
    apikey: apiKey,
    t: "indexers",
    configured: true,
  };

  const response = await cache.get(url, params, { responseType: "text" });
  if (!response) {
    console.error("No indexers found.");
    return [];
  }

  try {
    return xmlJs.xml2js(response);
  } catch (err) {
    console.error("Could not parse indexers for ", host, err);
    return [];
  }
}

function parseIndexers(indexers, host) {
  if (!indexers || !indexers.elements || !indexers.elements[0] || !indexers.elements[0].elements) {
    console.error("Could not find indexers for ", host);
    return [];
  }

  const elements = indexers.elements[0].elements;

  elements.forEach((element, index) => {
    if (!element.elements[5].elements[3].elements) {
      return;
    }

    for (const category of element.elements[5].elements[3].elements) {
      if (elements[index].movie && elements[index].series) {
        break;
      }
      if (!category.attributes.id) {
        continue;
      }

      if (category.attributes.id === "2000") {
        elements[index].movie = true;
        continue;
      } else if (category.attributes.id === "5000") {
        elements[index].series = true;
        continue;
      }
    }
  });

  return elements;
}

function getIndexerTorrentQuery(info, apiKey) {
  const query = {
    apikey: apiKey,
    limit: 100,
    offset: 0,
  };

  if (info.type == "movie") {
    query.t = "search";
  }

  if (info.type == "series") {
    query.t = "tvsearch";
    query.season = info.season;
    query.ep = info.episode;
  }

  // TODO: check if encodeURIComponent is needed
  let cleanName = util.cleanName(info.name);
  query.q = cleanName;

  return query;
}

async function getIndexerTorrentMap(info, indexers, host, apiKey) {
  if (!indexers || !Array.isArray(indexers) || indexers.length === 0) {
    console.error("No indexers found for ", host);
    return [];
  }

  return await Promise.all(
    indexers.map(async (indexer) => {
      if (!indexer || !indexer.attributes || !indexer.attributes.id) {
        return [];
      }

      if (!indexer[info.type]) {
        // console.error("Skipping " + indexer.attributes.id + " because it has no category " + info.type)
        return [];
      }

      const url = `${host}/api/v2.0/indexers/${indexer.attributes.id}/results/torznab/api`;
      const params = getIndexerTorrentQuery(info, apiKey);

      const response = await cache.get(url, params, { responseType: "text" });
      if (!response) {
        console.error("Error when calling: ", indexer.attributes.id, response);
        return [];
      }

      try {
        return [indexer, xmlJs.xml2js(response)];
      } catch (err) {
        console.error("Could not parse torrents for: ", host, err);
        return [];
      }
    })
  );
}

function parseIndexerTorrents(indexer, torrents, host, type, id) {
  if (
    !torrents.elements ||
    !torrents.elements[0] ||
    !torrents.elements[0].elements ||
    !torrents.elements[0].elements[0] ||
    !torrents.elements[0].elements[0].elements
  ) {
    console.error("Could not find any torrents for: ", host, type, id);
    return [];
  }

  const elements = torrents.elements[0].elements[0].elements;
  const result = [];

  elements.forEach((element) => {
    if (element.type != "element" || element.name != "item" || !element.elements) {
      return;
    }

    const newObj = {};
    const tempObj = {};

    element.elements.forEach((subElement) => {
      if (
        subElement.name == "torznab:attr" &&
        subElement.attributes &&
        subElement.attributes.name &&
        subElement.attributes.value
      )
        tempObj[subElement.attributes.name] = subElement.attributes.value;
      else if (subElement.elements && subElement.elements.length)
        tempObj[subElement.name] = subElement.elements[0].text;
    });

    const ofInterest = ["title", "link", "magneturl", "pubDate"];
    ofInterest.forEach((ofInterestElm) => {
      if (tempObj[ofInterestElm]) {
        newObj[ofInterestElm] = tempObj[ofInterestElm];
      }
    });

    const ignoreTitles = config.ignoreTitles;
    if (ignoreTitles && new RegExp(ignoreTitles, "i").test(newObj.title)) {
      config.debug && console.log("Ignoring title:", newObj.title);
      return;
    }

    const toInt = ["seeders", "peers", "size", "files"];
    toInt.forEach((toIntElm) => {
      if (tempObj[toIntElm]) {
        newObj[toIntElm] = parseInt(tempObj[toIntElm]);
      }
    });

    if (!config.debug && newObj.seeders < config.minimumSeeders) {
      config.debug && console.log("Skipping torrent due to low seeders:", newObj.title);
      return;
    }
    const maximumSizeBytes = util.toBytesSize(config.maximumSize);
    if (!config.debug && newObj.size > maximumSizeBytes) {
      config.debug && console.log("Skipping torrent due to high size:", newObj.title);
      return;
    }

    if (
      newObj.magneturl &&
      newObj.magneturl.startsWith("magnet:") &&
      newObj.link &&
      /^https?:\/\//i.test(newObj.link)
    ) {
      newObj.link = newObj.magneturl;
    }
    if (newObj.link && newObj.link.startsWith("magnet:") && !newObj.magneturl) {
      newObj.magneturl = newObj.link;
    }

    if (tempObj.pubDate) {
      newObj.jackettDate = new Date(tempObj.pubDate).getTime();
    }

    newObj.published = parsePubDate(tempObj["pubDate"]);

    newObj.from = indexer.attributes.id;
    newObj.extraTag = util.extractExtraTag(newObj.title);

    result.push(newObj);
  });

  return result;
}

async function parseTorrent(torrent) {
  if (!torrent || !torrent.link) {
    return null;
  }

  const [url, query] = torrent.link.split("?");
  if (url.startsWith("magnet:")) {
    try {
      return parse_torrent(torrent.link);
    } catch (e) {
      // config.debug &&
      console.warn("Error fetching torrent magnet:", e);
      return null;
    }
  }

  const params = query ? qs.parse(query) : {};

  const response = await cache.get(url, params, { responseType: "arraybuffer" });
  if (!response || response.length === 0) {
    // config.debug &&
    console.warn("Error fetching torrent file: ", response);
    return null;
  }

  let buffer;
  try {
    buffer = Buffer.from(response);
  } catch (err) {
    console.error("Failed to create torrent file buffer:", err.message);
    return null;
  }

  if (!buffer || buffer.length === 0) {
    console.error("Torrent file buffer is empty after conversion");
    return null;
  }

  try {
    return parse_torrent(buffer);
  } catch (e) {
    console.error("Torrent file parse error:", e);
    return null;
  }
}

async function search(info, host, apiKey) {
  const indexers = await getIndexers(host, apiKey);
  const parsedIndexers = parseIndexers(indexers, host);

  const indexerTorrentMap = await getIndexerTorrentMap(info, parsedIndexers, host, apiKey);

  const indexerTorrents = indexerTorrentMap
    // Only process entries with [indexer, torrents]
    .filter((item) => Array.isArray(item) && item.length === 2)
    .flatMap(([indexer, torrents]) => parseIndexerTorrents(indexer, torrents, host, info.type, info.id));
  // config.debug && console.log("indexerTorrents:", JSON.stringify(indexerTorrents));

  const torrents = await Promise.all(
    indexerTorrents.map(async (indexerTorrent) => {
      const parsedTorrent = await parseTorrent(indexerTorrent);
      return {
        indexerTorrent: indexerTorrent,
        parsedTorrent: parsedTorrent,
      };
    })
  );

  return torrents.filter((torrent) => torrent.indexerTorrent && torrent.parsedTorrent);
}

export default { search };
