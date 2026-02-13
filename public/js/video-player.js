class VideoPlayer {
  constructor(videoEl) {
    this.el = videoEl;
    this._timeListeners = [];
    this._seekListeners = [];
    this._lastEmit = 0;
    this._markers = [];
    this._isDragging = false;
    this._knownDurationMs = 0;

    // Cache control elements
    this._btnPlayPause = document.getElementById("btn-play-pause");
    this._iconPlay = this._btnPlayPause.querySelector(".icon-play");
    this._iconPause = this._btnPlayPause.querySelector(".icon-pause");
    this._timeCurrent = document.getElementById("vc-time-current");
    this._timeDuration = document.getElementById("vc-time-duration");
    this._progressWrapper = document.getElementById("vc-progress-wrapper");
    this._progressBar = document.getElementById("vc-progress-bar");
    this._progressPlayed = document.getElementById("vc-progress-played");
    this._progressBuffered = document.getElementById("vc-progress-buffered");
    this._progressMarkers = document.getElementById("vc-progress-markers");
    this._progressHandle = document.getElementById("vc-progress-handle");
    this._progressTooltip = document.getElementById("vc-progress-tooltip");
    this._btnSpeed = document.getElementById("btn-speed");
    this._speedMenu = document.getElementById("vc-speed-menu");
    this._btnMute = document.getElementById("btn-mute");
    this._volumeSlider = document.getElementById("vc-volume-slider");

    this._setupPlayPause();
    this._setupProgressBar();
    this._setupSpeedControl();
    this._setupVolumeControl();
    this._setupKeyboardShortcuts();
    this._setupVideoEvents();
  }

  // --- Public API ---

  setSrc(url) {
    this.el.src = url;
  }

  getCurrentTimeMs() {
    return this.el.currentTime * 1000;
  }

  seekTo(ms) {
    this.el.currentTime = Math.max(0, ms / 1000);
  }

  onTimeUpdate(fn) {
    this._timeListeners.push(fn);
  }

  onSeeked(fn) {
    this._seekListeners.push(fn);
  }

  getDurationMs() {
    return this._getDurationSec() * 1000;
  }

  setMarkers(markers) {
    this._markers = markers;
    this._renderMarkers();
  }

  /** Set known duration (from recording metadata) as fallback for WebM Infinity */
  setDuration(ms) {
    this._knownDurationMs = ms;
    this._timeDuration.textContent = this._formatTime(this._getDurationSec() * 1000);
    this._renderMarkers();
  }

  /** Get effective duration in seconds, preferring native if finite */
  _getDurationSec() {
    const native = this.el.duration;
    if (Number.isFinite(native) && native > 0) return native;
    return this._knownDurationMs / 1000;
  }

  // --- Play/Pause ---

  _setupPlayPause() {
    this._btnPlayPause.addEventListener("click", () => this._togglePlayPause());
    this.el.addEventListener("play", () => this._updatePlayPauseIcon());
    this.el.addEventListener("pause", () => this._updatePlayPauseIcon());
    this.el.addEventListener("ended", () => this._updatePlayPauseIcon());
  }

  _togglePlayPause() {
    if (this.el.paused || this.el.ended) {
      this.el.play();
    } else {
      this.el.pause();
    }
  }

  _updatePlayPauseIcon() {
    const playing = !this.el.paused && !this.el.ended;
    this._iconPlay.classList.toggle("hidden", playing);
    this._iconPause.classList.toggle("hidden", !playing);
  }

  // --- Progress Bar ---

  _setupProgressBar() {
    // Use wrapper (20px tall) instead of bar (4px) for easier clicking/dragging
    this._progressWrapper.addEventListener("mousedown", (e) => {
      this._isDragging = true;
      this._seekToMouse(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (this._isDragging) {
        this._seekToMouse(e);
      }
      if (this._isOverProgressBar(e)) {
        this._showTooltip(e);
      } else if (!this._isDragging) {
        this._progressTooltip.classList.add("hidden");
      }
    });

    document.addEventListener("mouseup", () => {
      this._isDragging = false;
    });

    this._progressWrapper.addEventListener("mouseenter", (e) => this._showTooltip(e));
    this._progressWrapper.addEventListener("mouseleave", () => {
      if (!this._isDragging) this._progressTooltip.classList.add("hidden");
    });

    // Touch support
    this._progressWrapper.addEventListener("touchstart", (e) => {
      this._isDragging = true;
      this._seekToTouch(e);
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (this._isDragging) {
        this._seekToTouch(e);
      }
    }, { passive: true });

    document.addEventListener("touchend", () => {
      this._isDragging = false;
    });
  }

  _isOverProgressBar(e) {
    const rect = this._progressWrapper.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right &&
           e.clientY >= rect.top && e.clientY <= rect.bottom;
  }

  _seekToMouse(e) {
    const rect = this._progressWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.el.currentTime = ratio * this._getDurationSec();
  }

  _seekToTouch(e) {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this._progressWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    this.el.currentTime = ratio * this._getDurationSec();
  }

  _showTooltip(e) {
    const rect = this._progressWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const timeMs = ratio * this._getDurationSec() * 1000;
    this._progressTooltip.textContent = this._formatTime(timeMs);
    this._progressTooltip.style.left = `${e.clientX - rect.left}px`;
    this._progressTooltip.classList.remove("hidden");
  }

  _updateProgress() {
    const duration = this._getDurationSec();
    if (duration <= 0) return;
    const ratio = this.el.currentTime / duration;
    const pct = (ratio * 100).toFixed(2) + "%";
    this._progressPlayed.style.width = pct;
    this._progressHandle.style.left = pct;
    this._timeCurrent.textContent = this._formatTime(this.el.currentTime * 1000);

    if (this.el.buffered.length > 0) {
      const bufferedEnd = this.el.buffered.end(this.el.buffered.length - 1);
      this._progressBuffered.style.width = ((bufferedEnd / duration) * 100).toFixed(2) + "%";
    }
  }

  // --- Speed Control ---

  _setupSpeedControl() {
    this._btnSpeed.addEventListener("click", (e) => {
      e.stopPropagation();
      this._speedMenu.classList.toggle("hidden");
    });

    this._speedMenu.addEventListener("click", (e) => {
      const opt = e.target.closest(".speed-option");
      if (!opt) return;
      const speed = parseFloat(opt.dataset.speed);
      this.el.playbackRate = speed;
      this._syncSpeedUI(speed);
      this._speedMenu.classList.add("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#vc-speed-control")) {
        this._speedMenu.classList.add("hidden");
      }
    });
  }

  _syncSpeedUI(speed) {
    this._btnSpeed.textContent = `${speed}x`;
    this._speedMenu.querySelectorAll(".speed-option").forEach((o) => {
      o.classList.toggle("active", parseFloat(o.dataset.speed) === speed);
    });
  }

  // --- Volume Control ---

  _setupVolumeControl() {
    this._btnMute.addEventListener("click", () => {
      this.el.muted = !this.el.muted;
      this._updateVolumeIcon();
    });

    this._volumeSlider.addEventListener("input", () => {
      this.el.volume = parseFloat(this._volumeSlider.value);
      this.el.muted = false;
      this._updateVolumeIcon();
    });
  }

  _updateVolumeIcon() {
    const muted = this.el.muted || this.el.volume === 0;
    this._btnMute.querySelector(".icon-volume").classList.toggle("hidden", muted);
    this._btnMute.querySelector(".icon-muted").classList.toggle("hidden", !muted);
    if (!this.el.muted) {
      this._volumeSlider.value = this.el.volume;
    }
  }

  // --- Keyboard Shortcuts ---

  _setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          this._togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.seekTo(this.getCurrentTimeMs() - (e.shiftKey ? 10000 : 5000));
          break;
        case "ArrowRight":
          e.preventDefault();
          this.seekTo(this.getCurrentTimeMs() + (e.shiftKey ? 10000 : 5000));
          break;
        case "Digit1":
          this.el.playbackRate = 0.5;
          this._syncSpeedUI(0.5);
          break;
        case "Digit2":
          this.el.playbackRate = 1;
          this._syncSpeedUI(1);
          break;
        case "Digit3":
          this.el.playbackRate = 1.5;
          this._syncSpeedUI(1.5);
          break;
        case "Digit4":
          this.el.playbackRate = 2;
          this._syncSpeedUI(2);
          break;
      }
    });
  }

  // --- Video Events ---

  _setupVideoEvents() {
    this.el.addEventListener("timeupdate", () => {
      const now = performance.now();
      if (now - this._lastEmit < 250) return;
      this._lastEmit = now;
      this._updateProgress();
      for (const fn of this._timeListeners) fn(this.getCurrentTimeMs());
    });

    this.el.addEventListener("seeked", () => {
      this._updateProgress();
      for (const fn of this._seekListeners) fn(this.getCurrentTimeMs());
    });

    this.el.addEventListener("loadedmetadata", () => {
      this._timeDuration.textContent = this._formatTime(this._getDurationSec() * 1000);
      this._renderMarkers();
    });

    // WebM from MediaRecorder may update duration later
    this.el.addEventListener("durationchange", () => {
      this._timeDuration.textContent = this._formatTime(this._getDurationSec() * 1000);
      this._renderMarkers();
    });
  }

  // --- Timeline Markers ---

  _renderMarkers() {
    if (!this._progressMarkers) return;
    this._progressMarkers.innerHTML = "";
    const duration = this._getDurationSec();
    if (duration <= 0 || this._markers.length === 0) return;

    for (const marker of this._markers) {
      const pct = (marker.timeMs / (duration * 1000)) * 100;
      if (pct < 0 || pct > 100) continue;
      const dot = document.createElement("div");
      dot.className = "vc-marker";
      dot.style.left = `${pct}%`;
      dot.style.backgroundColor = marker.color;
      dot.title = marker.label || "";
      this._progressMarkers.appendChild(dot);
    }
  }

  // --- Utility ---

  _formatTime(ms) {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const sec = String(totalSec % 60).padStart(2, "0");
    return `${min}:${sec}`;
  }
}
