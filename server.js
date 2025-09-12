// server.js
// const express = require("express");
import express from 'express'
const { migrateData } = require("./index"); // import migration function
const app = express();
const PORT = process.env.PORT || 3000;

// Attach token fetcher routes
require("./fetch-tokens")(app); 

// Migration trigger
app.get("/migrate", async (req, res) => {
  try {
    await migrateData();
    res.send("✅ Migration completed successfully!");
  } catch (err) {
    res.status(500).send("❌ Migration failed: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Service running on http://localhost:${PORT}`);
  console.log("👉 OAuth endpoints ready");
  console.log("👉 Trigger migration at /migrate");
});
