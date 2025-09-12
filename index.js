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

// FIX #3: Added a new function to fetch a specific customer from QuickBooks.
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

async function getQuickBooksAttachments(accessToken, txnId) {
  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20Attachable%20where%20EntityRef%20=%20'${txnId}'`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return response.data.QueryResponse.Attachable || [];
  } catch (error) {
    console.error("Error fetching QuickBooks attachments:", error.response?.data || error.message);
    return [];
  }
}

// ---------- Zoho Customers ----------
// FIX #2: Updated findZohoCustomer to consistently use the organization ID in the URL.
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
// FIX #2: Simplified logic to use the dedicated findZohoCustomer and createZohoCustomer functions.
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
async function createZohoInvoice(accessToken, invoiceData) {
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
    console.error("Error creating Zoho invoice:", error.response?.data || error.message);
    throw error;
  }
}

// ---------- Zoho Attachments ----------
// FIX #2: Updated uploadZohoAttachment URL to include organization ID.
// Also added error handling.
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
        // FIX #4: Fetch the full QuickBooks customer object based on CustomerRef.
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
          // FIX #5: Refined line item mapping for better data integrity.
          line_items: qbInvoice.Line?.map((line) => {
            const itemDetail = line.SalesItemLineDetail;
            const itemRef = itemDetail?.ItemRef;
            const amount = line.Amount;
            const quantity = itemDetail?.Qty || 1;
            const rate = amount / quantity; // Calculate rate

            // Only map items with a positive rate to avoid errors
            if (rate > 0) {
              return {
                name: itemRef?.name || "Migrated Item",
                rate: rate,
                quantity: quantity,
              };
            }
            return null; // Exclude zero-rate items
          }).filter(Boolean) || [
            // Fallback for invoices with no line items
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

        // Step 3: Attach files if any
        const attachments = await getQuickBooksAttachments(qbToken, qbInvoice.Id);
        if (attachments.length > 0) {
          for (const att of attachments) {
            if (!att.TempDownloadUri) {
              console.warn(`⚠️ Attachment ${att.Id} has no download URI. Skipping.`);
              continue;
            }
            // FIX #1: Added QuickBooks access token to the attachment download request headers.
            const fileResponse = await axios.get(att.TempDownloadUri, {
              headers: { Authorization: `Bearer ${qbToken}` },
              responseType: "arraybuffer"
            });
            const buffer = Buffer.from(fileResponse.data);
            await uploadZohoAttachment(zohoToken, zohoInvoiceId, buffer, att.FileName);
          }
        } else {
          console.log(`➡️ No attachments found for invoice ${qbInvoice.Id}.`);
        }
      } catch (invoiceError) {
        console.error(`❌ Migration failed for Invoice ${qbInvoice.Id}:`, invoiceError.message);
      }
    }
    console.log("🎉 Migration process completed.");
  } catch (globalError) {
    console.error("❌ Global migration failure:", globalError.message);
  }
}
