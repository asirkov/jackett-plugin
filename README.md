# 🎮 Jackett Plugin

This self-hostable addon for [Stremio](https://www.stremio.com/) to stream movies and shows from torrent trackers.

Service integrates with [Jackett](https://github.com/Jackett/Jackett) and uses The Movie Database (TMDb) API to enhance torrent search. The main goal is to filter results based on size, seeders count, and release quality.

## 🌐 API Endpoints

The service exposes the following HTTP endpoints:

---

## `GET /manifest.json`

Returns a [Stremio](https://www.stremio.com/) add-on manifest.

### Response

**Content-Type**: `application/json`

**Purpose**: Includes metadata for Stremio to register the add-on

### Example

```json
{
  "id": "org.stremio.jackett-stremio",
  "version": "x.x.x",
  "name": "Jackett",
  "description": "Stremio addon that fetches Ukrainian torrents from Jackett.",
  "logo": "https://raw.githubusercontent.com/linuxserver/docker-templates/refs/heads/master/linuxserver.io/img/jackett-logo.png",
  "icon": "https://raw.githubusercontent.com/linuxserver/docker-templates/refs/heads/master/linuxserver.io/img/jacket-icon.png",
  "resources": ["stream"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt", "tmdb"],
  "behaviorHints": {
    "configurationRequired": false,
    "p2p": true,
    "configurable": false,
    "adult": false
  },
  "catalogs": []
}
```

---

## `GET /stream/{type}/{id}`

Returns streaming links (torrent magnet URIs) for the specified content type and ID.

### Path Parameters

- `type` — `"movie"` or `"series"`
- `id` — TMDb or IMDb ID (e.g. `tt10366206`)

### Query Parameters

- `extra` (optional) — passed through for Stremio compatibility

### Behavior

- Fetches metadata from TMDb
- Queries Jackett for matching torrents
- Filters results based on configuration (`minimumSeeders`, `maximumSize`, etc.)
- Returns a list of streamable magnet links

### Example Response

```json
{
  "streams": [
    {
      "fileIdx": 0,
      "name": "720p",
      "tag": "720p",
      "type": "movie",
      "infoHash": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "title": "Джон Уік 4 / Джон Вік 4 / John Wick: Chapter 4 (2023) BDRip 720p 3xUkr/Eng | Sub Ukr/Eng\n\n👤 4/4  💾 8.6 gb ⚙️ toloka\n📅 21 вересня 2023 р.",
      "seeders": 4,
      "published": "2023-09-21T21:00:00.000Z",
      "sources": [
        "tracker:http://bt.toloka.to/announce/?h=xxxxxx&",
        "tracker:http://bt.hurtom.com/announce/?h=xxxxxx&",
        "tracker:http://bt.toloka.tv/announce/?h=xxxxxx&",
        "dht:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      ],
      "behaviorHints": {
        "bingeGroup": "tt10366206"
      }
    }
  ]
}
```

### Notes

- `published` — ISO 8601 date of torrent appearance
- `title` — includes torrent metadata such as resolution, audio/subtitle tracks, size, and source
- `seeders` — number of reported seeders at time of scraping
- `sources` — array of announce URLs and DHT hashes
- `behaviorHints.bingeGroup` — groups torrents for better UX in Stremio

## ⚙️ Configuration

Configuration is handled via environment variables or default values.

### Parameters

| Environment Variable | Description                             | Type    | Default Value |
| -------------------- | --------------------------------------- | ------- | ------------- |
| `PORT`               | Port the server listens on              | number  | `7000`        |
| `DEBUG`              | Debug mode for logging (`true`/`false`) | boolean | `false`       |
| `NAME`               | Plugin name to display                  | string  | `Jackett`     |

### Jackett

| Environment Variable | Description                | Type   | Default Value           |
| -------------------- | -------------------------- | ------ | ----------------------- |
| `JACKETT_URL`        | URL to the Jackett service | string | `http://127.0.0.1:9117` |
| `JACKETT_API_KEY`    | API key for Jackett        | string | -                       |

### TMDb

| Environment Variable | Description                                     | Type      | Default Value |
| -------------------- | ----------------------------------------------- | --------- | ------------- |
| `TMDB_API_KEY`       | API key for [TMDb](https://www.themoviedb.org/) | string    | -             |
| `LANGUAGES`          | Languages for TMDb requests (comma-separated)   | string\[] | `["en-US"]`   |

### Filtering Results

| Environment Variable | Description                            | Type   | Default Value |
| -------------------- | -------------------------------------- | ------ | ------------- |
| `MAXIMUM_SIZE`       | Maximum release size (e.g., `"10GB"`)  | string | `"10GB"`      |
| `MINIMUM_SEEDERS`    | Minimum number of seeders              | number | `5`           |
| `MAXIMUM_COUNT`      | Minimum number of releases to find     | number | `10`          |
| `IGNORE_TITLES`      | RegExp string for excluding bad titles | string | see below     |

> **ignoreTitles** (default value):

```js
/\b(Telecine|CAMRip)\b|\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\b|\b(?:HD-?)?CAM\b|\b(?:HQ-?)?CAM\b/;
```

This regular expression filters out low-quality releases such as CAMRip, HDCAM, Telesync, etc.

### Caching

| Environment Variable | Description                              | Type    | Default Value    |
| -------------------- | ---------------------------------------- | ------- | ---------------- |
| `CACHE_ENABLED`      | Flag to enable/disabled requests caching | boolean | `true`           |
| `CACHE_TTL_MS`       | Cache TTL in milliseconds                | number  | `300000` (5 min) |
| `CACHE_MAXIMUM_SIZE` | Max number of entries in cache           | number  | `100`            |

### Other

| Environment Variable | Description                        | Type   | Default Value |
| -------------------- | ---------------------------------- | ------ | ------------- |
| `REQUEST_TIMEOUT_MS` | Timeout for external requests (ms) | number | `8000`        |

## 🚀 Usage

### Using Docker

```bash
docker run --rm -p 7000:7000 asirkov/jackett-plugin
```

### Using Docker Compose (the addon and Jackett simultaneously)

See [Stremio Service](https://github.com/asirkov/stremio-service)

### Using Node.js

```bash
# Install dependencies
npm install

# Run with custom environment variables
PORT=7001 \
JACKETT_URL=http://localhost:9117 \
JACKETT_API_KEY=your_api_key \
TMDB_API_KEY=your_tmdb_key \
node index.js
```

Or with `.env` file:

```dotenv
PORT=7001
DEBUG=true
NAME=Jackett
JACKETT_URL=http://localhost:9117
JACKETT_API_KEY=your_api_key
TMDB_API_KEY=your_tmdb_key
LANGUAGES=en-US,uk-UA
MAXIMUM_SIZE=8GB
MINIMUM_SEEDERS=10
IGNORE_TITLES=\b(CAM|TS)\b
```

## 📝 License

MIT License
