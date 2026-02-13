const express = require("express");
const diskStore = require("../storage/disk-store");

const router = express.Router();

router.get("/:id", (req, res) => {
  const data = diskStore.getRecording(req.params.id);
  if (!data) {
    return res.status(404).json({ ok: false, error: "Recording not found" });
  }
  res.json({ ok: true, ...data });
});

module.exports = router;
