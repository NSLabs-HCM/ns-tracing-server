(async function () {
  const loadingEl = document.getElementById("loading");
  const errorView = document.getElementById("error-view");
  const mainContent = document.getElementById("main-content");
  const metaUrl = document.getElementById("meta-url");
  const metaDuration = document.getElementById("meta-duration");

  // Tab switching
  const logsTabs = document.querySelectorAll(".logs-tab");
  const tabContents = document.querySelectorAll(".tab-content");
  logsTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      logsTabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add("active");
    });
  });

  // Extract recording ID from URL: /view/:id
  const pathParts = window.location.pathname.split("/");
  const recordingId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

  if (!recordingId) {
    showError();
    return;
  }

  try {
    // Fetch recording data
    const response = await fetch(`/api/recordings/${recordingId}`);
    if (!response.ok) {
      showError();
      return;
    }

    const data = await response.json();
    if (!data.ok) {
      showError();
      return;
    }

    const { metadata, consoleLogs, networkRequests, webSocketLogs } = data;
    const startTime = metadata.startTime || new Date(metadata.timestamp).getTime();

    // Update page title and meta
    document.title = `ns-tracing - ${metadata.url || "Recording"}`;
    metaUrl.textContent = metadata.url || "";
    metaDuration.textContent = formatDuration(metadata.duration);

    // Initialize video player
    const videoEl = document.getElementById("video-player");
    const videoPlayer = new VideoPlayer(videoEl);
    videoPlayer.setSrc(`/api/recordings/${recordingId}/video`);
    if (metadata.duration) {
      videoPlayer.setDuration(metadata.duration);
    }

    // Initialize console viewer
    const consoleContainer = document.getElementById("console-entries");
    const consoleFilters = document.getElementById("console-filters");
    const consoleViewer = new ConsoleViewer(consoleContainer, consoleFilters);
    consoleViewer.init(consoleLogs, startTime);

    // Initialize network viewer
    const networkContainer = document.getElementById("network-entries");
    const networkSummary = document.getElementById("network-summary");
    const networkFilters = document.getElementById("network-filters");
    const networkViewer = new NetworkViewer(networkContainer, networkSummary, networkFilters);
    networkViewer.init(networkRequests, startTime, webSocketLogs);

    // Initialize timeline sync
    new TimelineSync(videoPlayer, consoleViewer, networkViewer);

    // Build timeline markers after video metadata is loaded
    videoEl.addEventListener("loadedmetadata", () => {
      const markers = [];

      // Red markers for console errors/exceptions
      for (const entry of consoleViewer.entries) {
        const level = entry.source === "exception" ? "error" :
                      (entry.source === "browser" ? (entry.level || "info") : (entry.level || "log"));
        if (level === "error") {
          markers.push({
            timeMs: entry.relativeMs,
            color: "#f85149",
            label: `Error: ${(entry.message || entry.args?.[0]?.description || "").slice(0, 80)}`,
          });
        }
      }

      // Blue markers for network requests
      for (const entry of networkViewer.entries) {
        const url = entry.request?.url || entry.url || "";
        const method = entry.request?.method || entry.method || "GET";
        markers.push({
          timeMs: entry.relativeMs,
          color: "#58a6ff",
          label: `${method} ${url}`.slice(0, 80),
        });
      }

      videoPlayer.setMarkers(markers);
    });

    // Show content
    loadingEl.classList.add("hidden");
    mainContent.classList.remove("hidden");
  } catch (e) {
    console.error("Failed to load recording:", e);
    showError();
  }

  function showError() {
    loadingEl.classList.add("hidden");
    mainContent.classList.add("hidden");
    errorView.classList.remove("hidden");
  }

  function formatDuration(ms) {
    if (!ms) return "";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  }
})();
