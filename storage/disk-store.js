const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function generateId() {
  for (let i = 0; i < 10; i++) {
    const id = crypto.randomBytes(4).toString("hex");
    if (!fs.existsSync(path.join(DATA_DIR, id))) {
      return id;
    }
  }
  // Fallback to longer ID
  return crypto.randomBytes(8).toString("hex");
}

async function saveRecording({ video, consoleLogs, networkRequests, webSocketLogs, metadata }) {
  const id = generateId();
  const dir = path.join(DATA_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  // Write video
  if (video) {
    fs.writeFileSync(path.join(dir, "recording.webm"), video);
  }

  // Write console logs
  fs.writeFileSync(path.join(dir, "console-logs.json"), consoleLogs || "[]");

  // Write network requests
  fs.writeFileSync(path.join(dir, "network-requests.json"), networkRequests || "{}");

  // Write WebSocket logs
  if (webSocketLogs) {
    fs.writeFileSync(path.join(dir, "websocket-logs.json"), webSocketLogs);
  }

  // Parse and enrich metadata
  let meta = {};
  try {
    meta = JSON.parse(metadata || "{}");
  } catch {}
  meta.id = id;
  meta.createdAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta, null, 2));

  return id;
}

function exists(id) {
  // Validate ID to prevent path traversal
  if (!id || !/^[a-f0-9]+$/.test(id)) return false;
  return fs.existsSync(path.join(DATA_DIR, id, "metadata.json"));
}

function getRecording(id) {
  if (!exists(id)) return null;
  const dir = path.join(DATA_DIR, id);

  const metadata = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf-8"));
  const consoleLogs = JSON.parse(fs.readFileSync(path.join(dir, "console-logs.json"), "utf-8"));
  const networkRequests = JSON.parse(fs.readFileSync(path.join(dir, "network-requests.json"), "utf-8"));

  let webSocketLogs = [];
  const wsPath = path.join(dir, "websocket-logs.json");
  if (fs.existsSync(wsPath)) {
    webSocketLogs = JSON.parse(fs.readFileSync(wsPath, "utf-8"));
  }

  return { metadata, consoleLogs, networkRequests, webSocketLogs };
}

function getVideoPath(id) {
  if (!exists(id)) return null;
  const videoPath = path.join(DATA_DIR, id, "recording.webm");
  if (!fs.existsSync(videoPath)) return null;
  return videoPath;
}

module.exports = { saveRecording, exists, getRecording, getVideoPath };
