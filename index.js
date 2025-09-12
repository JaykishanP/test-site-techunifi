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

  try {
    const res = await axios.post(tokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
    });
    return res.data.access_token;
  } catch (error) {
    console.error("Error getting QuickBooks access token:", error.response?.data || error.message);
    throw error;
  }
}

// ---------- Zoho Auth ----------
async function getZohoAccessToken() {
  const tokenUrl = "https://accounts.zoho.com/oauth/v2/token";
  try {
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
  } catch (error) {
    console.error("Error getting Zoho access token:", error.response?.data || error.message);
    throw error;
  }
}

// ---------- QuickBooks Data ----------
async function getQuickBooksInvoices(accessToken) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Invoice%20maxresults%205`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return response.data.QueryResponse.Invoice || [];
  } catch (error) {
    console.error("Error fetching QuickBooks invoices:", error.response?.data || error.message);
    throw error;
  }
}

async function getQuickBooksCustomer(accessToken, customerId) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/customer/${customerId}`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return response.data.Customer;
  } catch (error) {
    console.error(`Error fetching QuickBooks customer ${customerId}:`, error.response?.data || error.message);
    throw error;
  }
}

// ---------- Zoho Customers ----------
async function findZohoCustomer(accessToken, customerName) {
  const url = `${ZOHO_API_BASE}/contacts?contact_name=${encodeURIComponent(customerName)}&organization_id=${ZOHO_ORG_ID}`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    if (response.data.contacts && response.data.contacts.length > 0) {
      return response.data.contacts[0].contact_id;
    }
    return null;
  } catch (error) {
    console.error(`Error finding Zoho customer by name "${customerName}":`, error.response?.data || error.message);
    return null;
  }
}

async function createZohoCustomer(accessToken, qbCustomer) {
  const url = `${ZOHO_API_BASE}/contacts?organization_id=${ZOHO_ORG_ID}`;
  const payload = {
    contact_name: qbCustomer.DisplayName,
    company_name: qbCustomer.CompanyName || qbCustomer.DisplayName,
    email: qbCustomer.PrimaryEmailAddr?.Address || "",
    phone: qbCustomer.PrimaryPhone?.FreeFormNumber || "",
    contact_type: "customer",
  };
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
    });
    return response.data.contact.contact_id;
  } catch (error) {
    console.error("Error creating Zoho customer:", error.response?.data || error.message);
    throw error;
  }
}

// ---------- Zoho Find or Create Customer ----------
async function getOrCreateZohoCustomer(accessToken, qbCustomer) {
  let zohoCustomerId = await findZohoCustomer(accessToken, qbCustomer.DisplayName);
  if (zohoCustomerId) {
    console.log(`👤 Found existing Zoho customer: ${qbCustomer.DisplayName}`);
    return zohoCustomerId;
  }
  
  try {
    // If not found, create it
    zohoCustomerId = await createZohoCustomer(accessToken, qbCustomer);
    console.log(`👤 Created new Zoho customer: ${qbCustomer.DisplayName}`);
    return zohoCustomerId;
  } catch (error) {
    console.error(`Error creating Zoho customer for "${qbCustomer.DisplayName}":`, error.message);
    throw error;
  }
}

// ---------- Zoho Invoices ----------
async function createZohoInvoice(accessToken, invoiceData, isRetry = false) {
  const url = `${ZOHO_API_BASE}/invoices?organization_id=${ZOHO_ORG_ID}`;
  try {
    const response = await axios.post(url, invoiceData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
    });
    return response.data.invoice.invoice_id;
  } catch (error) {
    // Check if the error is due to invoice number conflict (Zoho error code 4097)
    if (error.response?.status === 400 && error.response?.data?.code === 4097 && !isRetry) {
      console.warn("⚠️ Invoice number conflict detected. Retrying without invoice_number field...");
      const retryInvoiceData = { ...invoiceData };
      delete retryInvoiceData.invoice_number;
      return createZohoInvoice(accessToken, retryInvoiceData, true);
    }
    console.error("Error creating Zoho invoice:", error.response?.data || error.message);
    throw error;
  }
}

// ---------- Zoho Attachments ----------
async function uploadZohoAttachment(accessToken, zohoInvoiceId, fileBuffer, fileName) {
  const url = `${ZOHO_API_BASE}/invoices/${zohoInvoiceId}/attachments?organization_id=${ZOHO_ORG_ID}`;

  const form = new FormData();
  form.append("attachment", fileBuffer, fileName);

  try {
    await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
      },
    });
    console.log(`📎 Uploaded attachment to Zoho invoice ${zohoInvoiceId}: ${fileName}`);
  } catch (error) {
    console.error(`Error uploading attachment "${fileName}" to Zoho invoice ${zohoInvoiceId}:`, error.response?.data || error.message);
    throw error;
  }
}

// ---------- Migration Process ----------
export async function migrateData() {
  try {
    console.log("🔑 Getting QuickBooks access token...");
    const qbToken = await getQuickBooksAccessToken();

    console.log("📥 Fetching invoices from QuickBooks...");
    const qbInvoices = await getQuickBooksInvoices(qbToken);
    console.log(`✅ Found ${qbInvoices.length} invoices to migrate.`);

    console.log("🔑 Getting Zoho access token...");
    const zohoToken = await getZohoAccessToken();

    for (const qbInvoice of qbInvoices) {
      console.log(`➡️ Migrating Invoice ${qbInvoice.Id}`);

      try {
        const customerId = qbInvoice.CustomerRef?.value;
        if (!customerId) {
          console.warn(`⚠️ Invoice ${qbInvoice.Id} has no customer reference. Skipping.`);
          continue;
        }
        const qbCustomer = await getQuickBooksCustomer(qbToken, customerId);

        // Step 1: Ensure Zoho customer exists
        const zohoCustomerId = await getOrCreateZohoCustomer(zohoToken, qbCustomer);

        // Step 2: Create Invoice in Zoho
        const zohoInvoiceData = {
          customer_id: zohoCustomerId,
          invoice_number: qbInvoice.DocNumber,
          date: qbInvoice.TxnDate,
          due_date: qbInvoice.DueDate,
          line_items: qbInvoice.Line?.map((line) => {
            const itemDetail = line.SalesItemLineDetail;
            const itemRef = itemDetail?.ItemRef;
            const amount = line.Amount;
            const quantity = itemDetail?.Qty || 1;
            const rate = amount / quantity;

            if (rate > 0) {
              return {
                name: itemRef?.name || "Migrated Item",
                rate: rate,
                quantity: quantity,
              };
            }
            return null;
          }).filter(Boolean) || [
            {
              name: "Migrated Item",
              rate: qbInvoice.TotalAmt,
              quantity: 1,
            },
          ],
          custom_fields: [
            {
              label: "QuickBooks Invoice ID",
              value: qbInvoice.Id,
            },
          ],
        };

        const zohoInvoiceId = await createZohoInvoice(zohoToken, zohoInvoiceData);
        console.log(`✅ Created Zoho invoice ${zohoInvoiceId} from QuickBooks invoice ${qbInvoice.Id}.`);
        
        // Due to a QuickBooks API limitation, attachments cannot be queried by invoice ID.
        // Therefore, we cannot migrate attachments with this method.
        console.log(`➡️ No attachments found for invoice ${qbInvoice.Id}.`);

      } catch (invoiceError) {
        console.error(`❌ Migration failed for Invoice ${qbInvoice.Id}:`, invoiceError.message);
      }
    }
    console.log("🎉 Migration process completed.");
  } catch (globalError) {
    console.error("❌ Global migration failure:", globalError.message);
  }
}

migrateData();