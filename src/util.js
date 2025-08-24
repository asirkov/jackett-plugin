const videoNameParser = require("video-name-parser");

const util = {
  toBytesSize(stringSize) {
    const sizeString =
      typeof stringSize === "string" ? stringSize : stringSize.toString();
    const sizeRegex = /^(\d+(\.\d+)?)\s*([kKmMgGtT]?[bB]?)$/;
    const match = sizeString.match(sizeRegex);

    if (!match) {
      console.error(
        "Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB"
      );
      return 10000000000;
    }

    const numericPart = parseFloat(match[1]);
    const unit = match[3].toUpperCase();

    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    if (Object.prototype.hasOwnProperty.call(unit, units)) {
      console.error(
        "Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB"
      );
      return 10000000000;
    }

    return parseInt(numericPart * units[unit]);
  },

  toStringSize: (bytesSize) => {
    if (Math.abs(bytesSize) < 1024) {
      return bytesSize + " B";
    }

    const units = ["kb", "mb", "gb", "tb"];

    let i = -1;
    do {
      bytesSize /= 1024;
      ++i;
    } while (Math.abs(bytesSize) >= 1024 && i < units.length - 1);

    return bytesSize.toFixed(1) + " " + units[i];
  },

  insertSorted: (array, newObj, property, maxSize) => {
    const insertIndex = array.findIndex(
      (item) => item[property] < newObj[property]
    );

    if (insertIndex === -1) {
      if (array.length < maxSize) {
        array.push(newObj);
        return true;
      }
      return false;
    }

    array.splice(insertIndex, 0, newObj);

    if (array.length > maxSize) {
      array.pop();
    }

    return true;
  },

  extractEpisodeTag: (season, episode) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `S${pad(season)}E${pad(episode)}`;
  },

  findQuality: (tag) => {
    if (typeof tag !== "string") {
      return "";
    }

    const qualityRegex = /\b(4K|[0-9]{3,4}[pi])\b/i;
    const sourceRegex =
      /\b(DLRip|HDTV|DivX|XviD|DL(?:MUX)?|WEB(?:-DL|-Rip|MUX)?|BDMUX|BRMUX|Telecine|CAMRip|HQCAM|Bluray|VHSSCR|R5|PPVRip|TC|HDTVRip|TVRip|DVDscr|DVDR\d?|DVDRip|BDRip|BRRip|HDRip|HDTS|HD(?:CAM|TS|Rip)|TS|CAM)\b/i;

    const sourceMatch = tag.match(sourceRegex);
    const qualityMatch = tag.match(qualityRegex);

    return qualityMatch?.[0] ?? sourceMatch?.[0] ?? "";
  },

  cleanName: (name) => {
    if (typeof name !== "string" || name.length === 0) {
      return "";
    }

    return name
      .replace(/[._\-–()[\]:,]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/'/g, "")
      .replace(/\\\\/g, "\\")
      .replace(/\\'|\\"/g, "");
  },

  normalizeTitle: (torrent, info) => {
    const defaultName = "👤 11/2 💾 2 gb ⚙️ therarbg";
    let name = defaultName;
    let found = false;

    const titles = torrent.title.split("\n");

    for (const line of titles) {
      if (!line.includes("👤")) continue;

      name = line;

      if (!name.includes("⚙️")) {
        name += " ⚙️ therarbg";
      }

      const match = name.match(/👤 (\d+)/);
      if (!match) continue;

      const peers = parseInt(match[1], 10);
      if (!/👤 \d+\/\d+/.test(name)) {
        const seeds = Math.round(peers / 1.1);
        const leechers = Math.round(peers * 0.6);

        name = name.replace(/👤 \d+/, `👤 ${seeds}/${leechers}`).toLowerCase();

        const extra =
          info.season && info.episode
            ? util.extractEpisodeTag(info.season, info.episode)
            : info.year;

        torrent.title = `${info.name} ${extra}\n\r\n${name}`;
        torrent.seeders = seeds;
        found = true;
        break;
      }
    }

    if (!found) {
      const extra =
        info.season && info.episode
          ? util.extractEpisodeTag(info.season, info.episode)
          : info.year;

      torrent.title = `${info.name} ${extra}\n\r\n${defaultName}`;
      torrent.seeders = 11;
    }
  },

  parseVideoName: (name) => {
    return videoNameParser(name + ".mp4");
  },

  extractExtraTag: (name) => {
    const parsed = util.parseVideoName(name + ".mp4");
    let extraTag = util.cleanName(name);

    if (parsed.name) {
      extraTag = extraTag.replace(new RegExp(parsed.name, "gi"), "");
    }

    if (parsed.year) {
      extraTag = extraTag.replace(parsed.year.toString(), "");
    }

    const hasEpisode = parsed.season && parsed.episode?.length;
    if (hasEpisode) {
      const episodeTag = util.extractEpisodeTag(
        parsed.season,
        parsed.episode[0]
      );
      extraTag = extraTag.replace(new RegExp(episodeTag, "gi"), "");
    }

    extraTag = extraTag.trim();
    let extraParts = extraTag.split(/\s+/);

    if (hasEpisode && extraParts[0]?.length === 2 && !isNaN(extraParts[0])) {
      const possibleEpTag = `${util.extractEpisodeTag(
        parsed.season,
        parsed.episode[0]
      )}-${extraParts[0]}`;
      if (name.toLowerCase().includes(possibleEpTag.toLowerCase())) {
        extraParts[0] = possibleEpTag;
      }
    }

    const foundIndex = name.toLowerCase().indexOf(extraParts[0]?.toLowerCase());
    if (foundIndex > -1) {
      extraTag = name.substring(foundIndex);
      extraTag = extraTag.replace(/[_()[\],]/g, " ");

      if ((extraTag.match(/\./g) || []).length > 1) {
        extraTag = extraTag.replace(/\./g, " ");
      }

      extraTag = extraTag.replace(/\s+/g, " ").trim();
    }

    return extraTag;
  },
};

module.exports = util;
