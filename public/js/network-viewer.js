class NetworkViewer {
  constructor(container, summaryEl, filtersContainer) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.entries = [];
    this.startTime = 0;
    this._elements = [];
    this._visibleCount = 0;
    this._showWs = false;
    this._wsEntries = [];
    this._wsElements = [];
    this.activeTypeFilter = "all";

    this._typeMap = {
      fetch: ["XHR", "Fetch"],
      js: ["Script"],
      css: ["Stylesheet"],
      img: ["Image"],
      doc: ["Document"],
      font: ["Font"],
      media: ["Media"],
      ws: ["WebSocket"],
    };

    if (filtersContainer) {
      filtersContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        filtersContainer.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeTypeFilter = btn.dataset.type;
        this._applyTypeFilter();
      });
    }
  }

  init(networkData, startTime, webSocketLogs) {
    this.startTime = startTime;

    // Parse HAR-like format
    let rawEntries = [];
    if (networkData && networkData.log && networkData.log.entries) {
      rawEntries = networkData.log.entries;
    } else if (Array.isArray(networkData)) {
      rawEntries = networkData;
    }

    // Pre-compute relativeMs for each entry and sort
    this.entries = rawEntries
      .map((entry) => {
        let relativeMs = 0;
        if (entry.wallTime) {
          relativeMs = entry.wallTime * 1000 - startTime;
        } else if (entry.timestamp) {
          relativeMs = entry.timestamp * 1000 - startTime;
        }
        return { ...entry, relativeMs };
      })
      .sort((a, b) => a.relativeMs - b.relativeMs);

    // WebSocket entries
    this._wsEntries = webSocketLogs || [];

    this._buildDOM();
    this._visibleCount = 0;
  }

  revealAtTime(videoTimeMs) {
    let lastVisible = -1;
    let closestIdx = -1;
    let closestDist = Infinity;

    for (let i = 0; i < this._elements.length; i++) {
      const el = this._elements[i];
      const relMs = el._relativeMs;

      if (relMs <= videoTimeMs) {
        el.classList.remove("time-hidden");
        lastVisible = i;

        const dist = Math.abs(relMs - videoTimeMs);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      } else {
        // Don't hide entries with open details
        if (!el.querySelector(".network-detail")) {
          el.classList.add("time-hidden");
        }
      }

      el.classList.remove("active-entry");
    }

    if (closestIdx >= 0 && closestDist < 1500) {
      this._elements[closestIdx].classList.add("active-entry");
    }

    if (lastVisible >= 0 && lastVisible !== this._visibleCount - 1) {
      this._visibleCount = lastVisible + 1;
      this._elements[lastVisible].scrollIntoView({ block: "nearest", behavior: "auto" });
    }

    this._applyTypeFilter();
  }

  _getFilterType(entry) {
    const resourceType = entry.resourceType || "";
    for (const [filterKey, types] of Object.entries(this._typeMap)) {
      if (types.includes(resourceType)) return filterKey;
    }
    return "other";
  }

  _applyTypeFilter() {
    let visibleCount = 0;
    for (const el of this._elements) {
      if (el.classList.contains("time-hidden")) continue;
      if (this.activeTypeFilter === "all" || el.dataset.filterType === this.activeTypeFilter) {
        el.classList.remove("filter-hidden");
        visibleCount++;
      } else {
        el.classList.add("filter-hidden");
      }
    }
    this._updateSummary(visibleCount);
  }

  _updateSummary(filteredCount) {
    const total = this.entries.length;
    const wsCount = this._wsEntries.length;
    let text = `${filteredCount}/${total} requests`;
    if (this.activeTypeFilter !== "all") {
      text += ` (${this.activeTypeFilter})`;
    }
    if (wsCount > 0) text += ` | ${wsCount} WS`;
    this.summaryEl.textContent = text;
  }

  _formatSize(bytes) {
    if (!bytes || bytes <= 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  _getStatusClass(status) {
    if (!status) return "status-0";
    if (status >= 200 && status < 300) return "status-2xx";
    if (status >= 300 && status < 400) return "status-3xx";
    if (status >= 400 && status < 500) return "status-4xx";
    return "status-5xx";
  }

  _truncateUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path.length > 60 ? path.slice(0, 60) + "..." : path;
    } catch {
      return url && url.length > 60 ? url.slice(0, 60) + "..." : url;
    }
  }

  _formatHeaders(headers) {
    if (!headers) return "(none)";
    if (Array.isArray(headers)) {
      return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
    }
    if (typeof headers === "object") {
      return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");
    }
    return String(headers);
  }

  _formatTime(relativeMs) {
    const ms = Math.max(0, relativeMs);
    const totalSec = Math.floor(ms / 1000);
    const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const sec = String(totalSec % 60).padStart(2, "0");
    return `${min}:${sec}`;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _buildDOM() {
    this.container.innerHTML = "";
    this._elements = [];

    // Header row
    const header = document.createElement("div");
    header.className = "network-header";
    header.innerHTML = "<span>Method</span><span>URL</span><span>Status</span><span>Type</span><span>Size</span>";
    this.container.appendChild(header);

    for (const entry of this.entries) {
      const request = entry.request || {};
      const response = entry.response || {};
      const content = response.content || {};

      const div = document.createElement("div");
      div.className = "network-entry";
      div._relativeMs = entry.relativeMs;
      div._entry = entry;
      div.dataset.filterType = this._getFilterType(entry);

      const method = document.createElement("span");
      method.className = "net-method";
      method.textContent = request.method || entry.method || "GET";

      const url = document.createElement("span");
      url.className = "net-url";
      url.textContent = this._truncateUrl(request.url || entry.url || "");
      url.title = request.url || entry.url || "";

      const status = document.createElement("span");
      const statusCode = response.status || entry.status || 0;
      status.className = `net-status ${this._getStatusClass(statusCode)}`;
      status.textContent = statusCode || (entry.error ? "ERR" : "-");

      const type = document.createElement("span");
      type.className = "net-type";
      type.textContent = entry.resourceType || content.mimeType || "-";

      const size = document.createElement("span");
      size.className = "net-size";
      size.textContent = this._formatSize(content.size || entry.encodedDataLength);

      div.appendChild(method);
      div.appendChild(url);
      div.appendChild(status);
      div.appendChild(type);
      div.appendChild(size);

      div.addEventListener("click", (e) => {
        if (e.target.closest(".network-detail")) return;
        this._toggleDetail(div, entry);
      });

      this.container.appendChild(div);
      this._elements.push(div);
    }

    // Build WebSocket section if there are WS entries
    if (this._wsEntries.length > 0) {
      this._buildWebSocketSection();
    }
  }

  _buildWebSocketSection() {
    const wsHeader = document.createElement("div");
    wsHeader.className = "ws-section-header";
    wsHeader.innerHTML = `<h3>WebSocket Connections (${this._wsEntries.length})</h3>`;
    this.container.appendChild(wsHeader);

    for (const ws of this._wsEntries) {
      const div = document.createElement("div");
      div.className = "ws-entry";

      const url = document.createElement("span");
      url.className = "ws-url";
      url.textContent = ws.url || "";
      url.title = ws.url || "";

      const frameCount = document.createElement("span");
      frameCount.className = "ws-frame-count";
      frameCount.textContent = `${(ws.frames || []).length} frames`;

      const statusEl = document.createElement("span");
      statusEl.className = `ws-status ${ws.closed ? "ws-closed" : "ws-open"}`;
      statusEl.textContent = ws.closed ? "Closed" : "Open";

      div.appendChild(url);
      div.appendChild(frameCount);
      div.appendChild(statusEl);

      div.addEventListener("click", (e) => {
        if (e.target.closest(".ws-detail")) return;
        this._toggleWsDetail(div, ws);
      });

      this.container.appendChild(div);
    }
  }

  _toggleWsDetail(div, ws) {
    const existing = div.querySelector(".ws-detail");
    if (existing) {
      existing.remove();
      return;
    }

    // Remove any other expanded detail
    this.container.querySelectorAll(".ws-detail").forEach((d) => d.remove());

    const detail = document.createElement("div");
    detail.className = "ws-detail";

    let html = `<div class="detail-section"><h4>URL</h4><pre>${this._escapeHtml(ws.url || "")}</pre></div>`;

    if (ws.frames && ws.frames.length > 0) {
      html += `<div class="detail-section"><h4>Frames (${ws.frames.length})</h4>`;
      html += `<div class="ws-frames-table">`;
      html += `<div class="ws-frame-header"><span>Dir</span><span>Data</span></div>`;
      const maxFrames = Math.min(ws.frames.length, 100);
      for (let i = 0; i < maxFrames; i++) {
        const f = ws.frames[i];
        const dir = f.direction === "sent" ? "↑" : "↓";
        const dirClass = f.direction === "sent" ? "ws-dir-sent" : "ws-dir-recv";
        const data = f.payloadData || "";
        const truncated = data.length > 200 ? data.slice(0, 200) + "..." : data;
        html += `<div class="ws-frame-row"><span class="${dirClass}">${dir}</span><span class="ws-frame-data">${this._escapeHtml(truncated)}</span></div>`;
      }
      if (ws.frames.length > maxFrames) {
        html += `<div class="ws-frame-row"><span></span><span class="ws-frame-data">... ${ws.frames.length - maxFrames} more frames</span></div>`;
      }
      html += `</div></div>`;
    }

    detail.innerHTML = html;
    div.appendChild(detail);
  }

  _toggleDetail(div, entry) {
    const existing = div.querySelector(".network-detail");
    if (existing) {
      existing.remove();
      return;
    }

    // Remove any other expanded detail
    this.container.querySelectorAll(".network-detail").forEach((d) => d.remove());

    const detail = document.createElement("div");
    detail.className = "network-detail";

    const request = entry.request || {};
    const response = entry.response || {};
    const content = response.content || {};

    let html = "";

    // Time
    html += `<div class="detail-section"><h4>Time</h4><pre>${this._formatTime(entry.relativeMs)}</pre></div>`;

    // Redirect chain
    if (entry.redirectChain && entry.redirectChain.length > 0) {
      html += `<div class="detail-section"><h4>Redirect Chain</h4><div class="redirect-chain">`;
      for (const r of entry.redirectChain) {
        html += `<div class="redirect-step"><span class="redirect-status status-3xx">${r.status}</span> <span class="redirect-url">${this._escapeHtml(r.url || "")}</span></div>`;
      }
      html += `<div class="redirect-step redirect-final"><span class="redirect-status status-2xx">${response.status || ""}</span> <span class="redirect-url">${this._escapeHtml(request.url || entry.url || "")}</span></div>`;
      html += `</div></div>`;
    }

    // Full URL
    html += `<div class="detail-section"><h4>URL</h4><pre>${this._escapeHtml(request.url || entry.url || "-")}</pre></div>`;

    // Request headers
    html += `<div class="detail-section"><h4>Request Headers</h4><pre>${this._escapeHtml(this._formatHeaders(request.headers || entry.requestHeaders))}</pre></div>`;

    // Post data
    if (request.postData || entry.postData) {
      const postText = typeof request.postData === "object" ? request.postData.text : request.postData || entry.postData;
      html += `<div class="detail-section"><h4>Request Body</h4><pre>${this._escapeHtml(postText || "(empty)")}</pre></div>`;
    }

    // Response headers
    html += `<div class="detail-section"><h4>Response Headers</h4><pre>${this._escapeHtml(this._formatHeaders(response.headers || entry.responseHeaders))}</pre></div>`;

    // Response body
    if (content.text) {
      html += this._renderResponseBody(content);
    }

    // Timing
    const timings = entry.timings || {};
    if (Object.keys(timings).length > 0) {
      html += `<div class="detail-section"><h4>Timing</h4><div class="timing-bar">`;
      for (const [key, val] of Object.entries(timings)) {
        if (val != null && val >= 0) {
          html += `<span class="timing-item">${key}: <span class="timing-value">${val.toFixed(1)}ms</span></span>`;
        }
      }
      html += `</div></div>`;
    }

    // Initiator / Call Stack
    if (entry.initiator) {
      html += this._renderInitiator(entry.initiator);
    }

    // Error
    if (entry.error) {
      html += `<div class="detail-section"><h4>Error</h4><pre style="color:#f85149">${this._escapeHtml(entry.error)}</pre></div>`;
    }

    // Copy action buttons
    html += `<div class="detail-actions">`;
    html += `<button class="detail-action-btn" data-action="copy-curl">Copy cURL</button>`;
    if (content.text) {
      html += `<button class="detail-action-btn" data-action="copy-response">Copy Response</button>`;
      html += `<button class="detail-action-btn" data-action="copy-all">Copy cURL + Response</button>`;
    }
    html += `</div>`;

    detail.innerHTML = html;
    div.appendChild(detail);

    // Attach "Show full" button handler
    const showFullBtn = detail.querySelector(".response-body-show-full");
    if (showFullBtn) {
      showFullBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pre = detail.querySelector(".response-body-content");
        if (pre) {
          pre.textContent = content.text;
          pre.classList.remove("truncated");
        }
        showFullBtn.remove();
      });
    }

    // Attach copy action handlers
    detail.querySelectorAll(".detail-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const curl = this._generateCurl(entry);
        let text = "";
        if (action === "copy-curl") {
          text = curl;
        } else if (action === "copy-response") {
          text = content.text || "";
        } else if (action === "copy-all") {
          text = curl + "\n\n--- Response ---\n\n" + (content.text || "");
        }
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => {
            if (action === "copy-curl") btn.textContent = "Copy cURL";
            else if (action === "copy-response") btn.textContent = "Copy Response";
            else btn.textContent = "Copy cURL + Response";
          }, 1500);
        });
      });
    });
  }

  _renderInitiator(initiator) {
    let html = `<div class="detail-section"><h4>Initiator</h4>`;
    html += `<pre>${this._escapeHtml(initiator.type || "other")}</pre>`;

    if (initiator.originalSource || initiator.url) {
      let locText;
      if (initiator.originalSource) {
        const line = initiator.originalLine != null ? `:${initiator.originalLine + 1}` : "";
        const col = initiator.originalColumn != null ? `:${initiator.originalColumn + 1}` : "";
        locText = `${initiator.originalSource}${line}${col}`;
      } else {
        const line = initiator.lineNumber != null ? `:${initiator.lineNumber + 1}` : "";
        const col = initiator.columnNumber != null ? `:${initiator.columnNumber + 1}` : "";
        locText = `${initiator.url}${line}${col}`;
      }
      html += `<pre class="initiator-location">${this._escapeHtml(locText)}</pre>`;
    }

    // Stack trace from initiator
    const stack = initiator.stack;
    if (stack) {
      html += this._renderInitiatorStack(stack);
    }

    html += `</div>`;
    return html;
  }

  _renderInitiatorStack(stack) {
    const frames = stack.callFrames || [];
    if (frames.length === 0 && !stack.parent) return "";

    let html = `<div class="stack-frames">`;
    for (const frame of frames) {
      const fnName = frame.originalName || frame.functionName || "(anonymous)";
      const location = frame.originalSource
        ? `${frame.originalSource}:${(frame.originalLine || 0) + 1}:${(frame.originalColumn || 0) + 1}`
        : (frame.url ? `${frame.url}:${(frame.lineNumber || 0) + 1}:${(frame.columnNumber || 0) + 1}` : "");
      html += `<div class="stack-frame">at <span class="stack-fn">${this._escapeHtml(fnName)}</span>`;
      if (location) html += ` <span class="stack-location">(${this._escapeHtml(location)})</span>`;
      html += `</div>`;
    }

    // Async parent
    if (stack.parent) {
      const desc = stack.parent.description || "async";
      html += `<div class="stack-frame async-boundary">--- ${this._escapeHtml(desc)} ---</div>`;
      html += this._renderInitiatorStack(stack.parent);
    }

    html += `</div>`;
    return html;
  }

  _generateCurl(entry) {
    const request = entry.request || {};
    const url = request.url || entry.url || "";
    const method = request.method || entry.method || "GET";
    let parts = [`curl '${url.replace(/'/g, "'\\''")}'`];

    if (method !== "GET") {
      parts.push(`-X ${method}`);
    }

    // Headers
    const headers = request.headers || entry.requestHeaders;
    if (headers) {
      const headerList = Array.isArray(headers)
        ? headers
        : Object.entries(headers).map(([name, value]) => ({ name, value }));
      for (const h of headerList) {
        parts.push(`-H '${h.name}: ${String(h.value).replace(/'/g, "'\\''")}'`);
      }
    }

    // Post data
    const postData = typeof request.postData === "object"
      ? request.postData?.text
      : request.postData || entry.postData;
    if (postData) {
      parts.push(`--data-raw '${postData.replace(/'/g, "'\\''")}'`);
    }

    return parts.join(" \\\n  ");
  }

  _renderResponseBody(content) {
    if (content.encoding === "base64") {
      const sizeEstimate = content.text ? Math.round(content.text.length * 0.75) : 0;
      return `<div class="detail-section"><h4>Response Body</h4><pre class="response-body-content">(binary data, ~${this._formatSize(sizeEstimate)})</pre></div>`;
    }

    let bodyText = content.text;
    const maxDisplay = 10240; // 10KB display limit
    let truncated = false;

    // Try to format JSON
    if (content.mimeType && content.mimeType.includes("json")) {
      try {
        const parsed = JSON.parse(bodyText);
        bodyText = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep as-is
      }
    }

    if (bodyText.length > maxDisplay) {
      truncated = true;
    }

    const displayText = truncated ? bodyText.slice(0, maxDisplay) : bodyText;
    let html = `<div class="detail-section"><h4>Response Body</h4>`;
    html += `<pre class="response-body-content${truncated ? " truncated" : ""}">${this._escapeHtml(displayText)}</pre>`;
    if (truncated) {
      html += `<button class="response-body-show-full">Show full (${this._formatSize(bodyText.length)})</button>`;
    }
    html += `</div>`;
    return html;
  }
}
