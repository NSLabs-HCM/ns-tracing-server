# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local web server for storing and viewing recordings captured by the ns-tracing Chrome extension. Provides synchronized video playback with console log inspection and network request analysis.

## Commands

```bash
# Development (parallel watch: backend + frontend + CSS)
npm run dev                  # Full dev mode with hot reload
npm run dev:frontend         # Frontend watch only
npm run typecheck            # Type check both backend and frontend

# Build & Run
npm run build                # Build backend + frontend + CSS
npm run build:backend        # Backend only (tsc)
npm run build:frontend       # Frontend only (esbuild + tailwind)
npm start                    # Start server (default port 3000, or PORT env var)
```

## Architecture

### Backend — Express.js (TypeScript, CommonJS)

```
src/
├── server.ts                # Express app entry point
├── routes/
│   ├── upload.ts            # POST /api/recordings (multer multipart upload)
│   ├── recordings.ts        # GET /api/recordings/:id (metadata + logs)
│   └── video.ts             # GET /api/recordings/:id/video (Range streaming)
├── storage/
│   └── disk-store.ts        # File-based storage (data/{hex-id}/)
└── types/                   # (types defined in frontend/types.ts)
```

### Frontend — React 19 SPA (esbuild bundle, IIFE)

```
src/frontend/
├── index.tsx                # React root entry
├── App.tsx                  # Main component (fetches recording, manages tabs)
├── app.css                  # Tailwind v4 config + GitHub dark theme
├── types.ts                 # TypeScript interfaces (ConsoleLogEntry, NetworkLogEntry, etc.)
└── components/
    ├── VideoPlayer.tsx      # Custom video controls + timeline markers
    ├── ConsoleViewer.tsx    # Console log viewer with level filters
    └── NetworkViewer.tsx    # Network request viewer + WebSocket support
```

### Build System

Dual TypeScript configs:
- `tsconfig.json` — Backend: ES2022, CommonJS, output to `dist/`
- `tsconfig.frontend.json` — Frontend: ES2020, react-jsx, noEmit (type-check only)
- `esbuild.frontend.mjs` — Frontend bundler (IIFE format to `public/js/viewer.bundle.js`)
- Tailwind CLI processes `src/frontend/app.css` to `public/css/viewer.css`

### Storage

File-based under `data/{hex-id}/` (gitignored):
- `metadata.json` — URL, duration, timestamps, extension version
- `recording.webm` — VP9/VP8 + Opus video
- `console-logs.json` — CDP-format console entries
- `network-requests.json` — HAR-like network data
- `websocket-logs.json` — Optional WebSocket frames

IDs: 4-byte random hex (8 chars), collision-resistant with retry.

### Key Features

- **Synchronized playback**: Console and network viewers auto-scroll and highlight entries matching current video time
- **Timeline markers**: Red for console errors, blue for network requests
- **Console viewer**: 8 filter levels, CDP RemoteObject rendering, stack traces
- **Network viewer**: 10 type filters, HAR-compatible data, cURL export, WebSocket frames
- **Video controls**: Custom player with speed (0.5x-2x), keyboard shortcuts (Space, arrows, 1-4)

### Upload Limits

multer config: 500MB video file, 50MB per text field (logs/metadata).

## Conventions

- Backend: kebab-case files, Express routers, pure functions (no classes)
- Frontend: PascalCase components, functional React with hooks
- Styling: Tailwind v4 with custom GitHub dark theme (OKLCH colors)
- Performance: `useMemo`/`useCallback` for derived data and handlers

## Related

- **ns-tracing-extension** (`../ns-tracing-extension`) — Chrome extension that captures and uploads recordings to this server
