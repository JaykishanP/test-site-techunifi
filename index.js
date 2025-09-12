import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// ---------- Helper to decode Base64 ----------
function decodeB64(val) {
  return Buffer.from(val || "", "base64").toString("utf8").trim();
}

// ---------- QuickBooks Credentials ----------
const QBO_CLIENT_ID = decodeB64(process.env.QBO_CLIENT_ID_B64);
const QBO_CLIENT_SECRET = decodeB64(process.env.QBO_CLIENT_SECRET_B64);
const QBO_REFRESH_TOKEN = process.env.QBO_REFRESH_TOKEN;
const QBO_REALM_ID = process.env.QBO_REALM_ID;

// ---------- Zoho Credentials ----------
const ZOHO_CLIENT_ID = decodeB64(process.env.ZOHO_CLIENT_ID_B64);
const ZOHO_CLIENT_SECRET = decodeB64(process.env.ZOHO_CLIENT_SECRET_B64);
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID;
const ZOHO_API_BASE = process.env.ZOHO_API_BASE || "https://www.zohoapis.com/books/v3";

// ---------- QuickBooks Auth ----------
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function getQuickBooksAccessToken(refreshToken) {
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

  // Encode clientId:clientSecret as Base64
  const basicAuth = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString("base64");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await axios.post(tokenUrl, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
  });

  return res.data;
}


// ---------- Zoho Auth ----------
async function getZohoAccessToken() {
  const tokenUrl = "https://accounts.zoho.com/oauth/v2/token";
  const response = await axios.post(
    tokenUrl,
    new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.access_token;
}

// ---------- QuickBooks Data ----------
async function getQuickBooksData(accessToken) {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Invoice%20maxresults%2010`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  return response.data.QueryResponse.Invoice || [];
}

// ---------- Zoho Create Invoice ----------
async function createZohoInvoice(accessToken, invoiceData) {
  const url = `${ZOHO_API_BASE}/invoices`;
  const response = await axios.post(url, invoiceData, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
      "Content-Type": "application/json",
    },
  });
  console.log("✅ Invoice created in Zoho:", response.data);
}

// ---------- Migration Process ----------
export async function migrateData() {
  console.log("🔑 Getting QuickBooks access token...");
  const qbToken = await getQuickBooksAccessToken();

  console.log("📥 Fetching invoices from QuickBooks...");
  const qbData = await getQuickBooksData(qbToken);

  console.log("🔑 Getting Zoho access token...");
  const zohoToken = await getZohoAccessToken();

  console.log("🚀 Migrating invoices...");
  for (const qbInvoice of qbData) {
    const zohoInvoice = {
      customer_id: "123456789", // Replace with mapped Zoho customer ID
      line_items: [
        {
          name: "Migrated Item",
          rate: qbInvoice.TotalAmt,
          quantity: 1,
        },
      ],
    };
    await createZohoInvoice(zohoToken, zohoInvoice);
  }

  console.log("🎉 Migration complete!");
}
