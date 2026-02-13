const express = require("express");
const cors = require("cors");
const path = require("path");
const uploadRouter = require("./routes/upload");
const recordingsRouter = require("./routes/recordings");
const videoRouter = require("./routes/video");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow chrome-extension:// origins and localhost
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, etc.) and chrome-extension://
      if (!origin || origin.startsWith("chrome-extension://") || origin.startsWith("http://localhost")) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for MVP
      }
    },
  })
);

// Static files
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api/recordings", uploadRouter);
app.use("/api/recordings", recordingsRouter);
app.use("/api/recordings", videoRouter);

// Viewer route - serve viewer.html for /view/:id
app.get("/view/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "viewer.html"));
});

app.listen(PORT, () => {
  console.log(`ns-tracing-server running at http://localhost:${PORT}`);
});
