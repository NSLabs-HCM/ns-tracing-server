# ns-tracing-server

A local server for storing and viewing recordings captured by the [ns-tracing Chrome extension](../ns-tracing-extension). Provides a web-based viewer with synchronized video playback, console log inspection, and network request analysis.

## Features

- **Recording Storage** — Receives and stores recordings (video + logs) uploaded from the Chrome extension
- **Video Playback** — Custom HTML5 video player with seek, speed control (0.5x–2x), volume, and keyboard shortcuts
- **Timeline Markers** — Visual markers on the video timeline for console errors (red) and network requests (blue)
- **Console Viewer** — Browse console logs with level filtering (Log, Warn, Error, Info, Debug, Exception, Browser), expandable detail view with stack traces and source map locations
- **Network Viewer** — Inspect HTTP requests with type filtering (Fetch/XHR, JS, CSS, Img, Doc, Font, Media, WS), headers, bodies, timing breakdown, and cURL export
- **WebSocket Viewer** — View WebSocket connections with sent/received frames
- **Synchronized Playback** — Console and network entries highlight and auto-scroll as the video plays

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ns-tracing-server                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Express.js Backend (TypeScript)                      │   │
│  │                                                       │   │
│  │  POST /api/recordings         → Upload recording      │   │
│  │  GET  /api/recordings/:id     → Metadata + logs JSON  │   │
│  │  GET  /api/recordings/:id/video → Stream WebM video   │   │
│  │  GET  /view/:id               → Viewer SPA            │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│                          ▼                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  File-based Storage                                   │   │
│  │  data/{hex-id}/                                       │   │
│  │    ├── metadata.json                                  │   │
│  │    ├── recording.webm                                 │   │
│  │    ├── console-logs.json                              │   │
│  │    ├── network-requests.json                          │   │
│  │    └── websocket-logs.json (optional)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Frontend (Tailwind CSS v4)                     │   │
│  │                                                       │   │
│  │  VideoPlayer  │  ConsoleViewer  │  NetworkViewer       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Source Structure

```
src/
├── server.ts                       # Express app: CORS, static files, route mounting
├── routes/
│   ├── upload.ts                   # POST /api/recordings — multipart upload (multer)
│   ├── recordings.ts               # GET /api/recordings/:id — metadata + logs
│   └── video.ts                    # GET /api/recordings/:id/video — video streaming
├── storage/
│   └── disk-store.ts               # File-based storage under data/{hex-id}/
└── frontend/
    ├── index.tsx                   # React root entry point
    ├── App.tsx                     # Main component: data fetching, layout, tab/timeline state
    ├── app.css                     # Tailwind CSS v4 config + custom theme (GitHub dark)
    ├── types.ts                    # TypeScript interfaces for all data types
    └── components/
        ├── VideoPlayer.tsx         # Video playback with custom controls, timeline markers
        ├── ConsoleViewer.tsx       # Console log display with filtering, CDP format parsing
        └── NetworkViewer.tsx       # Network request display, WebSocket support, cURL export
```

## Getting Started

### Prerequisites

- Node.js (v18+)

### Install & Build

```bash
npm install
npm run build
```

### Run

```bash
npm start
# Server starts on http://localhost:3000
```

Override the port with `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Development

```bash
npm run dev           # Watch mode: backend + frontend JS + Tailwind CSS (all in parallel)
npm run dev:frontend  # Watch mode: frontend only (JS + CSS)
npm run typecheck     # Type check both backend and frontend
```

## API Reference

### Upload Recording

```
POST /api/recordings
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video` | File | No | WebM video file (max 500MB) |
| `consoleLogs` | JSON string | Yes | Array of console log entries |
| `networkRequests` | JSON string | Yes | Array of network request entries (max 50MB) |
| `webSocketLogs` | JSON string | No | Array of WebSocket log entries |
| `metadata` | JSON string | Yes | Recording metadata (URL, duration, timestamps) |

**Response (201):**
```json
{
  "ok": true,
  "id": "6e406096",
  "url": "/view/6e406096"
}
```

### Get Recording

```
GET /api/recordings/:id
```

**Response (200):**
```json
{
  "ok": true,
  "metadata": { "url": "...", "duration": 27598, ... },
  "consoleLogs": [...],
  "networkRequests": [...],
  "webSocketLogs": [...]
}
```

### Stream Video

```
GET /api/recordings/:id/video
```

Returns the WebM video file. Supports Range requests for seeking.

### View Recording

```
GET /view/:id
```

Serves the React-based viewer SPA.

## Viewer UI

The viewer presents a two-column layout:

- **Left** — Video player with custom controls (play/pause, seek, speed, volume) and timeline markers
- **Right** — Tabbed panel switching between Console and Network views

### Keyboard Shortcuts (Video Player)

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` / `→` | Seek -5s / +5s |
| `1` – `4` | Set playback speed (0.5x, 1x, 1.5x, 2x) |

### Console Viewer

- Filter by level: All, Log, Warn, Error, Info, Debug, Exception, Browser
- Click any entry to expand details: full timestamp, arguments with syntax highlighting, stack traces with source-mapped locations

### Network Viewer

- Filter by type: All, Fetch/XHR, JS, CSS, Img, Doc, Font, Media, WS, Other
- Click any request to see: URL, method, headers, request/response bodies, timing breakdown, initiator stack trace, redirect chain
- **Copy cURL** — copies the equivalent `curl` command
- **WebSocket section** — listed separately at the bottom with frame history

## Storage Format

Each recording is stored in `data/{hex-id}/`:

```
data/6e406096/
├── metadata.json           # { url, duration, startTime, timestamp, id, createdAt }
├── recording.webm          # Video file (VP9/VP8 + Opus)
├── console-logs.json       # Array of ConsoleLogEntry
├── network-requests.json   # Array of NetworkLogEntry (HAR-like)
└── websocket-logs.json     # Array of WsLogEntry (optional)
```

Recording IDs are random hex strings (`crypto.randomBytes`) validated with `/^[a-f0-9]+$/`.

## Tech Stack

### Backend
- **[Express.js](https://expressjs.com/)** — HTTP server
- **[multer](https://www.npmjs.com/package/multer)** — Multipart file upload handling
- **[cors](https://www.npmjs.com/package/cors)** — Cross-origin resource sharing
- **[tsx](https://www.npmjs.com/package/tsx)** — TypeScript execution for development

### Frontend
- **[React 19](https://react.dev/)** — UI framework
- **[Tailwind CSS v4](https://tailwindcss.com/)** — Utility-first CSS with custom GitHub-dark theme
- **[esbuild](https://esbuild.github.io/)** — Frontend bundler (IIFE output)

### Build
- **TypeScript** — Backend compiled via `tsc` (CommonJS), frontend type-checked with separate tsconfig
- **esbuild** — Bundles frontend React app → `public/js/viewer.bundle.js`
- **Tailwind CLI** — Builds CSS → `public/css/viewer.css`

## Related

- **[ns-tracing-extension](../ns-tracing-extension)** — Chrome extension that captures recordings

## License

Private
