class TimelineSync {
  constructor(videoPlayer, consoleViewer, networkViewer) {
    this.videoPlayer = videoPlayer;
    this.consoleViewer = consoleViewer;
    this.networkViewer = networkViewer;

    // Video time → progressively reveal entries in both panels
    this.videoPlayer.onTimeUpdate((timeMs) => {
      this.consoleViewer.revealAtTime(timeMs);
      this.networkViewer.revealAtTime(timeMs);
    });

    // Handle video seek (user drags the timeline bar)
    videoPlayer.onSeeked((timeMs) => {
      this.consoleViewer.revealAtTime(timeMs);
      this.networkViewer.revealAtTime(timeMs);
    });
  }
}
