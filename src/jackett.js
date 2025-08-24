const xmlJs = require("xml-js");
const axios = require("axios");
const parse_torrent = require("parse-torrent");

const config = require("./config");
const util = require("./util");

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
  const params = {
    apikey: apiKey,
    t: "indexers",
    configured: true,
  };
  const response = await axios
    .get(`${host}/api/v2.0/indexers/all/results/torznab/api`, {
      params: params,
      timeout: config.requestTimeoutMs,
      responseType: "text",
    })
    .catch((err) => console.error("Error fetching indexers:", err.message));

  if (!response || !response.data) {
    console.error("No indexers found.");
    return [];
  }

  try {
    return xmlJs.xml2js(response.data);
  } catch (err) {
    console.error("Could not parse indexers for ", host, err);
    return [];
  }
}

function parseIndexers(indexers, host) {
  if (
    !indexers ||
    !indexers.elements ||
    !indexers.elements[0] ||
    !indexers.elements[0].elements
  ) {
    console.error("Could not find indexers for ", host);
    return [];
  }

  elements = indexers.elements[0].elements;

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

      const params = getIndexerTorrentQuery(info, apiKey);
      const response = await axios.get(
        `${host}/api/v2.0/indexers/${indexer.attributes.id}/results/torznab/api`,
        {
          params: params,
          timeout: config.requestTimeoutMs,
          responseType: "text",
        }
      );

      if (!response || !response.data) {
        console.error(
          "Error when calling: ",
          indexer.attributes.id,
          response.err
        );
        return [];
      }

      try {
        return [indexer, xmlJs.xml2js(response.data)];
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
    if (
      element.type != "element" ||
      element.name != "item" ||
      !element.elements
    ) {
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

    if (
      !config.debug &&
      type != "series" &&
      newObj.seeders < config.minimumSeeders
    ) {
      config.debug &&
        console.log("Skipping torrent due to low seeders:", newObj.title);
      return;
    }
    const maximumSizeBytes = util.toBytesSize(config.maximumSize);
    if (!config.debug && newObj.size > maximumSizeBytes) {
      config.debug &&
        console.log("Skipping torrent due to high size:", newObj.title);
      return;
    }

    if (
      newObj.magneturl &&
      newObj.magneturl.startsWith("magnet:") &&
      newObj.link &&
      newObj.link.startsWith("http://")
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
  const response = await axios.get(torrent.link, {
    timeout: config.requestTimeoutMs,
    maxRedirects: 0,
    validateStatus: null,
    responseType: "arraybuffer",
  });
  if (!response || response.status != 200 || !response.data) {
    // too many error like this, remove log if not debug
    config.debug &&
      console.error("Error fetching torrent data: ", response.statusText);
    return null;
  }

  const buffer = Buffer.from(response.data);
  const parsedTorrent = parse_torrent(buffer);

  return parsedTorrent;
}

async function search(info, host, apiKey) {
  const indexers = await getIndexers(host, apiKey);
  const parsedIndexers = parseIndexers(indexers, host);

  const indexerTorrentMap = await getIndexerTorrentMap(
    info,
    parsedIndexers,
    host,
    apiKey
  );

  const indexerTorrents = indexerTorrentMap
    // Only process entries with [indexer, torrents]
    .filter(item => Array.isArray(item) && item.length === 2)
    .flatMap(([indexer, torrents]) =>
      parseIndexerTorrents(
        indexer,
        torrents,
        host,
        info.type,
        info.id
      )
    );
  config.debug &&
    console.log("indexerTorrents:", JSON.stringify(indexerTorrents));

  const torrents = await Promise.all(
    indexerTorrents.map(async (indexerTorrent) => {
      const parsedTorrent = await parseTorrent(indexerTorrent);
      return {
        indexerTorrent: indexerTorrent,
        parsedTorrent: parsedTorrent,
      };
    })
  );

  return torrents.filter(
    (torrent) => torrent.indexerTorrent && torrent.parsedTorrent
  );
}

module.exports = { search };
