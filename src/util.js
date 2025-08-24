import videoNameParser from "video-name-parser";

const util = {
  toBytesSize(stringSize) {
    const sizeString = typeof stringSize === "string" ? stringSize : stringSize.toString();

    const sizeRegex = /^(\d+(\.\d+)?)\s*([kKmMgGtT]?[bB]?)$/;
    const match = sizeString.match(sizeRegex);

    if (!match) {
      console.error("Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example: 5GB");
      return 10 * 1024 ** 3; // 10 GiB default
    }

    const numericPart = parseFloat(match[1]);
    const rawUnit = (match[3] || "B").toUpperCase();
    const unit = rawUnit.endsWith("B") ? rawUnit : rawUnit + "B";

    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    if (!Object.hasOwn(units, unit)) {
      console.error("Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example: 5GB");

      return 10 * 1024 ** 3; // 10 GiB default
    }

    return Math.round(numericPart * units[unit]);
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

  cleanTorrentName: (name) => {
    if (typeof name !== "string" || name.length === 0) {
      return "";
    }
    let cleaned = name;

    // Extract year if it exists in parentheses or after the title
    let yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
    let year = yearMatch ? yearMatch[0] : "";

    // Keep only the main title (before slash/pipe/newline)
    cleaned = cleaned.split(/[\/|]/)[0].split(/\r?\n/)[0];

    // Remove technical tags: resolution, codecs, HDR/SDR, language tags
    cleaned = cleaned.replace(
      /\b(1080p|720p|uhd|bdrip|bdremux|dvdrip|webrip|web-dl|h\.265|h\.264|hdr|sdr|avc|hevc|x264|x265|hd|bluray|dvdscr|cam|line)\b/gi,
      ""
    );
    cleaned = cleaned.replace(/\b(ukr|eng|fre|kor|jpn|sub|2xukr|2xeng|3xukr)\b/gi, "");

    // Remove unnecessary characters (keep all letters/numbers, spaces, (), :)
    cleaned = cleaned.replace(/[^\p{L}\p{N}\s():]/gu, " ");

    // Replace multiple spaces with a single one
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Add year back if it was found
    if (year) {
      cleaned = `${cleaned} ${year}`;
    }

    return cleaned;
  },

  parseVideoName: (name) => {
    return videoNameParser(name + ".mp4");
  },

  extractExtraTag: (name) => {
    const parsed = util.parseVideoName(name);
    let extraTag = util.cleanName(name);

    if (parsed.name) {
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escaped = escapeRegExp(parsed.name);
      extraTag = extraTag.replace(new RegExp(escaped, "gi"), "");
    }

    if (parsed.year) {
      extraTag = extraTag.replace(parsed.year.toString(), "");
    }

    const hasEpisode = parsed.season != null && (parsed.episode?.length ?? 0) > 0;
    if (hasEpisode) {
      const episodeTag = util.extractEpisodeTag(parsed.season, parsed.episode[0]);
      extraTag = extraTag.replace(new RegExp(episodeTag, "gi"), "");
    }

    extraTag = extraTag.trim();
    let extraParts = extraTag.split(/\s+/);

    if (hasEpisode && extraParts[0]?.length === 2 && !isNaN(extraParts[0])) {
      const possibleEpTag = `${util.extractEpisodeTag(parsed.season, parsed.episode[0])}-${extraParts[0]}`;
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

export default util;
