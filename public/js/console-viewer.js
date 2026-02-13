class ConsoleViewer {
  constructor(container, filtersContainer) {
    this.container = container;
    this.entries = [];
    this.startTime = 0;
    this.activeFilter = "all";
    this._elements = [];
    this._visibleUpTo = -1;

    // Setup filter buttons
    filtersContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filtersContainer.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.activeFilter = btn.dataset.level;
      this._applyFilter();
    });
  }

  init(consoleLogs, startTime) {
    this.startTime = startTime;
    this.entries = (consoleLogs || [])
      .map((entry) => ({
        ...entry,
        relativeMs: entry.timestamp - startTime,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    this._buildDOM();
    this._visibleUpTo = -1;
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
        el.classList.add("time-hidden");
      }

      el.classList.remove("active-entry");
    }

    if (closestIdx >= 0 && closestDist < 1500) {
      this._elements[closestIdx].classList.add("active-entry");
    }

    if (lastVisible >= 0 && lastVisible !== this._visibleUpTo) {
      this._visibleUpTo = lastVisible;
      this._elements[lastVisible].scrollIntoView({ block: "nearest", behavior: "auto" });
    }

    this._applyFilter();
  }

  _formatTime(relativeMs) {
    const ms = Math.max(0, relativeMs);
    const totalSec = Math.floor(ms / 1000);
    const millis = String(Math.floor(ms % 1000)).padStart(3, "0");
    const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const sec = String(totalSec % 60).padStart(2, "0");
    return `${min}:${sec}.${millis}`;
  }

  /** Detect whether entry uses new CDP format or old format */
  _isNewFormat(entry) {
    return entry.source !== undefined;
  }

  /** Render args for display — handles both old and new CDP formats */
  _renderArgs(entry) {
    // New CDP format: args are serialized RemoteObjects
    if (this._isNewFormat(entry)) {
      if (entry.source === "exception" || entry.source === "browser") {
        return this._escapeHtml(entry.message || "");
      }
      if (!Array.isArray(entry.args)) return String(entry.args || "");
      return entry.args
        .map((arg) => this._renderRemoteObject(arg))
        .join(" ");
    }

    // Old format: args are plain values
    if (!Array.isArray(entry.args)) return this._escapeHtml(String(entry.args));
    return entry.args
      .map((arg) => {
        if (arg === null) return "null";
        if (arg === undefined || arg === "undefined") return "undefined";
        if (typeof arg === "object") {
          if (arg.type === "Error") return this._escapeHtml(`${arg.message}\n${arg.stack || ""}`);
          try { return this._escapeHtml(JSON.stringify(arg)); } catch { return String(arg); }
        }
        return this._escapeHtml(String(arg));
      })
      .join(" ");
  }

  /** Render a CDP RemoteObject to HTML string */
  _renderRemoteObject(obj) {
    if (!obj) return "undefined";

    switch (obj.type) {
      case "undefined":
        return '<span class="ro-undefined">undefined</span>';
      case "boolean":
        return `<span class="ro-boolean">${obj.value}</span>`;
      case "number":
        return `<span class="ro-number">${obj.description || obj.value}</span>`;
      case "bigint":
        return `<span class="ro-number">${obj.description || obj.value}n</span>`;
      case "string":
        return `<span class="ro-string">${this._escapeHtml(obj.value != null ? obj.value : obj.description || "")}</span>`;
      case "symbol":
        return `<span class="ro-symbol">${this._escapeHtml(obj.description || "Symbol()")}</span>`;
      case "function":
        return `<span class="ro-function">\u0192 ${this._escapeHtml(obj.description || "anonymous")}</span>`;
      case "object":
        return this._renderObjectPreview(obj);
      default:
        return this._escapeHtml(obj.description || String(obj.value));
    }
  }

  /** Render object/array preview */
  _renderObjectPreview(obj) {
    if (obj.subtype === "null") return '<span class="ro-null">null</span>';

    if (obj.subtype === "error") {
      return `<span class="ro-error">${this._escapeHtml(obj.description || "Error")}</span>`;
    }

    if (obj.subtype === "regexp") {
      return `<span class="ro-regexp">${this._escapeHtml(obj.description || "")}</span>`;
    }

    if (obj.subtype === "date") {
      return `<span class="ro-date">${this._escapeHtml(obj.description || "")}</span>`;
    }

    if (obj.preview) {
      return this._renderPreview(obj.preview, obj.className);
    }

    // No preview available
    return `<span class="ro-object">${this._escapeHtml(obj.description || obj.className || "Object")}</span>`;
  }

  /** Render ObjectPreview */
  _renderPreview(preview, className) {
    if (!preview.properties || preview.properties.length === 0) {
      if (preview.subtype === "array") return "[]";
      return className ? `${className} {}` : "{}";
    }

    const isArray = preview.subtype === "array";
    const open = isArray ? "[" : (className && className !== "Object" ? `${className} {` : "{");
    const close = isArray ? "]" : "}";

    const props = preview.properties.map((p) => {
      const val = this._renderPreviewValue(p);
      if (isArray) return val;
      return `<span class="ro-prop-name">${this._escapeHtml(p.name)}</span>: ${val}`;
    }).join(", ");

    const overflow = preview.overflow ? ", ..." : "";
    return `${open}${props}${overflow}${close}`;
  }

  _renderPreviewValue(prop) {
    if (prop.valuePreview) {
      return this._renderPreview(prop.valuePreview, prop.valuePreview.description);
    }

    switch (prop.type) {
      case "string":
        return `<span class="ro-string">"${this._escapeHtml(prop.value || "")}"</span>`;
      case "number":
      case "bigint":
        return `<span class="ro-number">${prop.value}</span>`;
      case "boolean":
        return `<span class="ro-boolean">${prop.value}</span>`;
      case "undefined":
        return '<span class="ro-undefined">undefined</span>';
      case "function":
        return '<span class="ro-function">\u0192</span>';
      case "object":
        if (prop.subtype === "null") return '<span class="ro-null">null</span>';
        return `<span class="ro-object">${this._escapeHtml(prop.value || "Object")}</span>`;
      default:
        return this._escapeHtml(prop.value || "");
    }
  }

  /** Render stack trace as collapsible details element */
  _renderStackTrace(stackTrace) {
    if (!stackTrace || stackTrace.length === 0) return "";

    let html = '<details class="stack-trace"><summary>Stack trace</summary><div class="stack-frames">';
    for (const frame of stackTrace) {
      if (frame.asyncBoundary) {
        html += `<div class="stack-frame async-boundary">--- ${this._escapeHtml(frame.asyncBoundary)} ---</div>`;
        continue;
      }
      const fnName = frame.originalName || frame.functionName;
      const location = frame.originalSource
        ? `${frame.originalSource}:${frame.originalLine + 1}:${frame.originalColumn + 1}`
        : (frame.url ? `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}` : "");
      html += `<div class="stack-frame">at <span class="stack-fn">${this._escapeHtml(fnName)}</span>`;
      if (location) html += ` <span class="stack-location">(${this._escapeHtml(location)})</span>`;
      html += `</div>`;
    }
    html += "</div></details>";
    return html;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _getLevel(entry) {
    if (this._isNewFormat(entry)) {
      if (entry.source === "exception") return "error";
      if (entry.source === "browser") return entry.level || "info";
      return entry.level || "log";
    }
    return entry.level || "log";
  }

  _getLevelLabel(entry) {
    if (this._isNewFormat(entry)) {
      if (entry.source === "exception") return "EXCEPTION";
      if (entry.source === "browser") return "BROWSER";
    }
    return (this._getLevel(entry) || "log").toUpperCase();
  }

  _getFilterLevel(entry) {
    if (this._isNewFormat(entry)) {
      if (entry.source === "exception") return "exception";
      if (entry.source === "browser") return "browser";
    }
    return this._getLevel(entry);
  }

  _buildDOM() {
    this.container.innerHTML = "";
    this._elements = [];

    for (const entry of this.entries) {
      const div = document.createElement("div");
      const level = this._getLevel(entry);
      const filterLevel = this._getFilterLevel(entry);
      div.className = `console-entry`;
      if (entry.source === "exception") div.classList.add("exception-entry");
      if (entry.source === "browser") div.classList.add("browser-entry");
      div.dataset.level = filterLevel;
      div._relativeMs = entry.relativeMs;
      div._entry = entry;

      const time = document.createElement("span");
      time.className = "console-time";
      time.textContent = this._formatTime(entry.relativeMs);

      const levelEl = document.createElement("span");
      levelEl.className = `console-level level-${level}`;
      levelEl.textContent = this._getLevelLabel(entry);

      const msg = document.createElement("span");
      msg.className = "console-msg";
      msg.innerHTML = this._renderArgs(entry);

      // Add stack trace if present
      if (entry.stackTrace && entry.stackTrace.length > 0) {
        const stackHtml = this._renderStackTrace(entry.stackTrace);
        if (stackHtml) {
          const stackEl = document.createElement("div");
          stackEl.className = "console-stack-container";
          stackEl.innerHTML = stackHtml;
          msg.appendChild(stackEl);
        }
      }

      // Add source location if present (exception/browser)
      if ((entry.originalSource || entry.url) && (entry.source === "exception" || entry.source === "browser")) {
        const locEl = document.createElement("span");
        locEl.className = "console-source-location";
        if (entry.originalSource) {
          const line = entry.originalLine != null ? `:${entry.originalLine + 1}` : "";
          const col = entry.originalColumn != null ? `:${entry.originalColumn + 1}` : "";
          locEl.textContent = `${entry.originalSource}${line}${col}`;
        } else {
          const line = entry.lineNumber != null ? `:${entry.lineNumber + 1}` : "";
          const col = entry.columnNumber != null ? `:${entry.columnNumber + 1}` : "";
          locEl.textContent = `${entry.url}${line}${col}`;
        }
        msg.appendChild(locEl);
      }

      div.appendChild(time);
      div.appendChild(levelEl);
      div.appendChild(msg);

      div.addEventListener("click", (e) => {
        if (e.target.closest(".stack-trace")) return;
        if (e.target.closest(".console-detail")) return;
        this._toggleDetail(div, entry);
      });

      this.container.appendChild(div);
      this._elements.push(div);
    }
  }

  _toggleDetail(div, entry) {
    const existing = div.querySelector(".console-detail");
    if (existing) {
      existing.remove();
      div.classList.remove("detail-open");
      return;
    }

    // Close other open details
    this.container.querySelectorAll(".console-detail").forEach((d) => d.remove());
    this.container.querySelectorAll(".detail-open").forEach((d) => d.classList.remove("detail-open"));

    const detail = document.createElement("div");
    detail.className = "console-detail";
    let html = "";

    // Timestamp
    html += `<div class="detail-section"><h4>Time</h4><pre>${this._formatTime(entry.relativeMs)}</pre></div>`;

    // Level / Source
    const levelLabel = this._getLevelLabel(entry);
    const sourceLabel = entry.source ? ` (${this._escapeHtml(entry.source)})` : "";
    html += `<div class="detail-section"><h4>Level</h4><pre>${levelLabel}${sourceLabel}</pre></div>`;

    // Full args (expanded)
    if (this._isNewFormat(entry) && Array.isArray(entry.args)) {
      html += `<div class="detail-section"><h4>Arguments</h4>`;
      for (let i = 0; i < entry.args.length; i++) {
        html += `<div class="console-detail-arg"><span class="detail-arg-index">[${i}]</span> `;
        html += this._renderFullRemoteObject(entry.args[i]);
        html += `</div>`;
      }
      html += `</div>`;
    } else if (entry.message) {
      html += `<div class="detail-section"><h4>Message</h4><pre>${this._escapeHtml(entry.message)}</pre></div>`;
    }

    // Source location
    if (entry.originalSource || entry.url) {
      let sourceText;
      if (entry.originalSource) {
        const line = entry.originalLine != null ? `:${entry.originalLine + 1}` : "";
        const col = entry.originalColumn != null ? `:${entry.originalColumn + 1}` : "";
        sourceText = `${entry.originalSource}${line}${col}`;
      } else {
        const line = entry.lineNumber != null ? `:${entry.lineNumber + 1}` : "";
        const col = entry.columnNumber != null ? `:${entry.columnNumber + 1}` : "";
        sourceText = `${entry.url}${line}${col}`;
      }
      html += `<div class="detail-section"><h4>Source</h4><pre>${this._escapeHtml(sourceText)}</pre></div>`;
    }

    // Stack trace (fully expanded)
    if (entry.stackTrace && entry.stackTrace.length > 0) {
      html += `<div class="detail-section"><h4>Stack Trace</h4><div class="stack-frames">`;
      for (const frame of entry.stackTrace) {
        if (frame.asyncBoundary) {
          html += `<div class="stack-frame async-boundary">--- ${this._escapeHtml(frame.asyncBoundary)} ---</div>`;
          continue;
        }
        const fnName = frame.originalName || frame.functionName || "(anonymous)";
        const location = frame.originalSource
          ? `${frame.originalSource}:${frame.originalLine + 1}:${frame.originalColumn + 1}`
          : (frame.url ? `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}` : "");
        html += `<div class="stack-frame">at <span class="stack-fn">${this._escapeHtml(fnName)}</span>`;
        if (location) html += ` <span class="stack-location">(${this._escapeHtml(location)})</span>`;
        html += `</div>`;
      }
      html += `</div></div>`;
    }

    detail.innerHTML = html;
    div.appendChild(detail);
    div.classList.add("detail-open");
  }

  _renderFullRemoteObject(obj) {
    if (!obj) return '<span class="ro-undefined">undefined</span>';

    if (obj.type === "object" && obj.preview && obj.preview.properties) {
      const isArray = obj.preview.subtype === "array";
      const label = isArray ? "Array" : (obj.className || "Object");
      let html = `<div class="ro-expanded"><span class="ro-object-label">${this._escapeHtml(label)}</span>`;
      html += `<div class="ro-properties">`;
      for (const prop of obj.preview.properties) {
        html += `<div class="ro-prop-row"><span class="ro-prop-name">${this._escapeHtml(prop.name)}</span>: ${this._renderPreviewValue(prop)}</div>`;
      }
      if (obj.preview.overflow) {
        html += `<div class="ro-prop-row ro-overflow">...</div>`;
      }
      html += `</div></div>`;
      return html;
    }

    return this._renderRemoteObject(obj);
  }

  _applyFilter() {
    for (const el of this._elements) {
      if (el.classList.contains("time-hidden")) continue;
      if (this.activeFilter === "all" || el.dataset.level === this.activeFilter) {
        el.classList.remove("filter-hidden");
      } else {
        el.classList.add("filter-hidden");
      }
    }
  }
}
