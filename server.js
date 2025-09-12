// server.js
import express from "express";
import { migrateData } from "./index.js";
import attachAuthRoutes from "./fetch-tokens.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Attach token fetcher routes
attachAuthRoutes(app);

// Migration trigger
app.get("/migrate", async (req, res) => {
  try {
    await migrateData();
    res.send("✅ Migration completed successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Migration failed: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("👉 QuickBooks Auth URL: https://test-site-techunifi-ynkd.onrender.com/auth/qbo");
  console.log("👉 Zoho Auth URL:       https://test-site-techunifi-ynkd.onrender.com/auth/zoho");
  console.log("👉 Trigger migration:   https://test-site-techunifi-ynkd.onrender.com/migrate");
});
