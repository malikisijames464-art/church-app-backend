require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Fix DNS Resolution Issue
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Route Imports
const departmentPostRoutes = require("./routes/departmentPost");
const cellRoutes = require("./routes/cell");

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
  });

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/members", require("./routes/member"));
app.use("/api/departments", require("./routes/department"));
app.use("/api/projects", require("./routes/project"));
app.use("/api/messages", require("./routes/message"));
app.use("/api/giving", require("./routes/giving"));
app.use("/api/cells", cellRoutes);

app.use("/department-posts", departmentPostRoutes);

// Home Route
app.get("/", (req, res) => {
  res.json({
    message: "Church App Backend is Running 🚀",
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Allow enough time for larger video uploads
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 16 * 60 * 1000;
server.keepAliveTimeout = 65 * 1000;