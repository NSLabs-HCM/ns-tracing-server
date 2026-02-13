const express = require("express");
const diskStore = require("../storage/disk-store");

const router = express.Router();

router.get("/:id/video", (req, res) => {
  const videoPath = diskStore.getVideoPath(req.params.id);
  if (!videoPath) {
    return res.status(404).json({ ok: false, error: "Video not found" });
  }
  // res.sendFile handles Range requests automatically
  res.sendFile(videoPath);
});

module.exports = router;
