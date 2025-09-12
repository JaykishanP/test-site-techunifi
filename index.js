import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";

dotenv.config();

// ---------- QuickBooks Credentials ----------
const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_REFRESH_TOKEN = process.env.QBO_REFRESH_TOKEN;
const QBO_REALM_ID = process.env.QBO_REALM_ID;

// ---------- Zoho Credentials ----------
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID;
const ZOHO_API_BASE = process.env.ZOHO_API_BASE || "https://www.zohoapis.com/books/v3";

// ---------- QuickBooks Auth ----------
async function getQuickBooksAccessToken(refreshToken = QBO_REFRESH_TOKEN) {
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const basicAuth = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString("base64");

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

  return res.data.access_token;
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
async function getQuickBooksCustomers(accessToken) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Customer`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  return response.data.QueryResponse.Customer || [];
}

async function getQuickBooksInvoices(accessToken) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Invoice%20maxresults%205`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  return response.data.QueryResponse.Invoice || [];
}

async function getQuickBooksAttachments(accessToken, txnId) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Attachable%20where%20EntityRef%20=%20'${txnId}'`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  return response.data.QueryResponse.Attachable || [];
}

// ---------- Zoho Customers ----------
async function findZohoCustomer(accessToken, customerName) {
  const url = `${ZOHO_API_BASE}/contacts?customer_name=${encodeURIComponent(customerName)}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
    },
  });

  if (response.data.contacts && response.data.contacts.length > 0) {
    return response.data.contacts[0].contact_id;
  }
  return null;
}

async function createZohoCustomer(accessToken, qbCustomer) {
  const url = `${ZOHO_API_BASE}/contacts`;
  const payload = {
    contact_name: qbCustomer.DisplayName,
    company_name: qbCustomer.CompanyName || qbCustomer.DisplayName,
    email: qbCustomer.PrimaryEmailAddr?.Address || "",
    phone: qbCustomer.PrimaryPhone?.FreeFormNumber || "",
    contact_type: "customer",
  };

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
      "Content-Type": "application/json",
    },
  });

  return response.data.contact.contact_id;
}

async function getOrCreateZohoCustomer(accessToken, qbCustomer) {
  const existingId = await findZohoCustomer(accessToken, qbCustomer.DisplayName);
  if (existingId) {
    console.log(`✅ Found existing Zoho customer for ${qbCustomer.DisplayName}`);
    return existingId;
  }
  console.log(`➕ Creating new Zoho customer for ${qbCustomer.DisplayName}`);
  return await createZohoCustomer(accessToken, qbCustomer);
}

// ---------- Zoho Invoices ----------
async function createZohoInvoice(accessToken, invoiceData) {
  const url = `${ZOHO_API_BASE}/invoices`;
  const response = await axios.post(url, invoiceData, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
      "Content-Type": "application/json",
    },
  });
  return response.data.invoice.invoice_id;
}

// ---------- Zoho Attachments ----------
async function uploadZohoAttachment(accessToken, zohoInvoiceId, fileBuffer, fileName) {
  const url = `${ZOHO_API_BASE}/invoices/${zohoInvoiceId}/attachments`;

  const form = new FormData();
  form.append("attachment", fileBuffer, fileName);

  await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
    },
  });

  console.log(`📎 Uploaded attachment to Zoho invoice ${zohoInvoiceId}: ${fileName}`);
}

// ---------- Migration Process ----------
export async function migrateData() {
  console.log("🔑 Getting QuickBooks access token...");
  const qbToken = await getQuickBooksAccessToken();

  console.log("📥 Fetching QuickBooks customers...");
  const qbCustomers = await getQuickBooksCustomers(qbToken);

  console.log("🔑 Getting Zoho access token...");
  const zohoToken = await getZohoAccessToken();

  // Map QBO CustomerId → Zoho CustomerId
  const customerMap = {};
  for (const qbCustomer of qbCustomers) {
    const zohoId = await getOrCreateZohoCustomer(zohoToken, qbCustomer);
    customerMap[qbCustomer.Id] = zohoId;
  }

  console.log("📥 Fetching QuickBooks invoices...");
  const qbInvoices = await getQuickBooksInvoices(qbToken);

  for (const qbInvoice of qbInvoices) {
    console.log(`➡️ Migrating Invoice ${qbInvoice.Id}`);

    const zohoCustomerId = customerMap[qbInvoice.CustomerRef?.value];
    if (!zohoCustomerId) {
      console.warn(`⚠️ No mapped customer found for Invoice ${qbInvoice.Id}, skipping.`);
      continue;
    }

    // Step 1: Create Invoice in Zoho
    const zohoInvoiceData = {
      customer_id: zohoCustomerId,
      line_items: qbInvoice.Line
        ? qbInvoice.Line.filter(l => l.SalesItemLineDetail).map(l => ({
            name: l.SalesItemLineDetail?.ItemRef?.name || "Migrated Item",
            rate: l.Amount,
            quantity: l.SalesItemLineDetail?.Qty || 1,
          }))
        : [
            {
              name: "Migrated Item",
              rate: qbInvoice.TotalAmt,
              quantity: 1,
            },
          ],
    };

    const zohoInvoiceId = await createZohoInvoice(zohoToken, zohoInvoiceData);

    // Step 2: Fetch and Upload Attachments
    const attachments = await getQuickBooksAttachments(qbToken, qbInvoice.Id);
    for (const att of attachments) {
      if (!att.TempDownloadUri) continue;

      const fileResponse = await axios.get(att.TempDownloadUri, { responseType: "arraybuffer" });
      const buffer = Buffer.from(fileResponse.data);

      await uploadZohoAttachment(zohoToken, zohoInvoiceId, buffer, att.FileName);
    }
  }

  console.log("🎉 Migration complete: Customers + Invoices + Attachments!");
}
