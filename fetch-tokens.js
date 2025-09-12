// fetch-tokens.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  qbo: {
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope: "com.intuit.quickbooks.accounting",
    clientId: process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    redirectUri: "https://test-site-techunifi-ynkd.onrender.com/callback/qbo",
    state: "secureRandomString123", // required by QuickBooks
  },
  zoho: {
    authUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    scope: "ZohoBooks.fullaccess.all",
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    redirectUri: "https://test-site-techunifi-ynkd.onrender.com/callback/zoho",
  },
};

// ==================== HELPERS ====================
function buildAuthUrl(service) {
  const cfg = CONFIG[service];
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope,
    access_type: "offline",
    prompt: "consent",
  });

  if (service === "qbo") {
    params.append("state", cfg.state);
  }

  return `${cfg.authUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(service, code) {
  const cfg = CONFIG[service];
  const params = new URLSearchParams({
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await axios.post(cfg.tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return res.data;
}

// ==================== EXPORT FUNCTION ====================
export default function attachAuthRoutes(app) {
  app.get("/auth/:service", (req, res) => {
    const { service } = req.params;
    if (!CONFIG[service]) return res.status(400).send("Unknown service");
    res.redirect(buildAuthUrl(service));
  });

  app.get("/callback/:service", async (req, res) => {
    const { service } = req.params;
    const { code, realmId, state } = req.query;

    if (service === "qbo" && state !== CONFIG.qbo.state) {
      return res.status(400).send("Invalid state parameter");
    }

    try {
      const tokenData = await exchangeCodeForToken(service, code);

      res.send(`
        <h2>${service.toUpperCase()} Tokens</h2>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
        ${service === "qbo" ? `<p><b>realmId:</b> ${realmId}</p>` : ""}
        <p>✅ Copy <b>refresh_token</b> into your .env file</p>
      `);

      console.log(`=== ${service.toUpperCase()} TOKENS ===`);
      console.log(tokenData);
      if (realmId) console.log("Realm ID:", realmId);
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(500).send("Token exchange failed");
    }
  });
}
