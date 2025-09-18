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

// ---------- QuickBooks Data (Paginated Fetch) ----------
async function fetchPaginatedQuickBooksData(accessToken, entity, limit = 100) {
    let allData = [];
    let startPosition = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=select%20*%20from%20${entity}%20startposition%20${startPosition}%20maxresults%20${limit}`;
        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
            });
            const entityName = entity.toLowerCase();
            const responseData = response.data.QueryResponse[entity] || response.data.QueryResponse[entityName] || [];
            
            if (responseData.length > 0) {
                allData = allData.concat(responseData);
                startPosition += responseData.length;
            }

            hasMore = responseData.length === limit;

        } catch (error) {
            console.error(`Error fetching paginated QuickBooks ${entity} data:`, error.response?.data || error.message);
            throw error;
        }
    }

    return allData;
}

async function getQuickBooksInvoices(accessToken) {
  return fetchPaginatedQuickBooksData(accessToken, 'Invoice');
}

async function getQuickBooksCustomers(accessToken) {
  return fetchPaginatedQuickBooksData(accessToken, 'Customer');
}

async function getQuickBooksAttachments(accessToken) {
  return fetchPaginatedQuickBooksData(accessToken, 'Attachable');
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

// Helper function to create payload for both create and update
function createZohoCustomerPayload(qbCustomer) {
  const payload = {
    contact_name: qbCustomer.DisplayName,
    company_name: qbCustomer.CompanyName || qbCustomer.DisplayName,
    contact_type: "customer",
  };

  const contactPerson = {};

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = qbCustomer.PrimaryEmailAddr?.Address || qbCustomer.BillEmail?.Address;
  
  if (email && typeof email === 'string' && emailRegex.test(email.trim())) {
    contactPerson.email = email;
  }

  // Add phone number if it exists
  const phone = qbCustomer.PrimaryPhone?.FreeFormNumber || qbCustomer.Mobile?.FreeFormNumber;
  if (phone) {
    contactPerson.phone = phone;
  }
  
  // Add mobile number if it exists
  const mobile = qbCustomer.Mobile?.FreeFormNumber;
  if (mobile) {
    contactPerson.mobile = mobile;
  }

  // Add contact person to payload if any contact info is present
  if (Object.keys(contactPerson).length > 0) {
    payload.contact_persons = [contactPerson];
  }

  // Add billing address if it exists
  const billAddr = qbCustomer.BillAddr;
  if (billAddr && billAddr.Line1) {
    payload.billing_address = {
      address: billAddr.Line1,
      city: billAddr.City,
      state: billAddr.CountrySubDivisionCode,
      zip: billAddr.PostalCode,
      country: billAddr.Country,
    };
  }

  // Add shipping address if it exists
  const shipAddr = qbCustomer.ShipAddr;
  if (shipAddr && shipAddr.Line1) {
    payload.shipping_address = {
      address: shipAddr.Line1,
      city: shipAddr.City,
      state: shipAddr.CountrySubDivisionCode,
      zip: shipAddr.PostalCode,
      country: shipAddr.Country,
    };
  }

  return payload;
}

async function createZohoCustomer(accessToken, qbCustomer) {
  const url = `${ZOHO_API_BASE}/contacts?organization_id=${ZOHO_ORG_ID}`;
  const payload = createZohoCustomerPayload(qbCustomer);
  
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
    console.error(`❌ Error creating Zoho customer for "${qbCustomer.DisplayName}":`, error.response?.data || error.message);
    return null; 
  }
}

async function updateZohoCustomer(accessToken, zohoCustomerId, qbCustomer) {
  const url = `${ZOHO_API_BASE}/contacts/${zohoCustomerId}?organization_id=${ZOHO_ORG_ID}`;
  const payload = createZohoCustomerPayload(qbCustomer);
  
  try {
    const response = await axios.put(url, payload, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
    });
    return response.data.contact.contact_id;
  } catch (error) {
    console.error(`❌ Error updating Zoho customer ${zohoCustomerId} for "${qbCustomer.DisplayName}":`, error.response?.data || error.message);
    return null;
  }
}

// ---------- Zoho Find or Create Customer ----------
async function getOrCreateZohoCustomer(accessToken, qbCustomer) {
  console.log(`🔎 Checking for existing Zoho customer: ${qbCustomer.DisplayName}`);
  let zohoCustomerId = await findZohoCustomer(accessToken, qbCustomer.DisplayName);
  
  const payloadToLog = createZohoCustomerPayload(qbCustomer);
  console.log("Zoho Customer Payload:", JSON.stringify(payloadToLog, null, 2));
  
  if (zohoCustomerId) {
    console.log(`✅ Found existing Zoho customer: ${qbCustomer.DisplayName}. Attempting to update...`);
    await updateZohoCustomer(accessToken, zohoCustomerId, qbCustomer);
    return zohoCustomerId;
  }
  
  // If not found, create a new one
  console.log(`➡️ Creating new Zoho customer: ${qbCustomer.DisplayName}`);
  zohoCustomerId = await createZohoCustomer(accessToken, qbCustomer);
  if (zohoCustomerId) {
    console.log(`✅ Created new Zoho customer: ${qbCustomer.DisplayName}`);
  }
  return zohoCustomerId;
}

async function uploadZohoAttachment(accessToken, zohoInvoiceId, qbAttachment) {
  const url = `${ZOHO_API_BASE}/invoices/${zohoInvoiceId}/attachment?organization_id=${ZOHO_ORG_ID}`;
  
  try {
    // Fetch the attachment data from QuickBooks as a stream
    const attachmentData = (await axios.get(qbAttachment.FileAccessUri, {
      headers: { Authorization: `Bearer ${await getQuickBooksAccessToken()}` },
      responseType: 'stream'
    })).data;

    const form = new FormData();
    form.append('attachment', attachmentData, qbAttachment.FileName);

    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });
    console.log(`✅ Uploaded attachment for invoice ${zohoInvoiceId}: ${qbAttachment.FileName}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error uploading attachment for invoice ${zohoInvoiceId}:`, error.response?.data || error.message);
    // Do not throw, just log the error and continue to the next attachment
  }
}


// New function to handle uploading attachments to a Zoho contact
async function uploadZohoContactAttachment(accessToken, zohoContactId, qbAttachment) {
  const url = `${ZOHO_API_BASE}/contacts/${zohoContactId}/attachment?organization_id=${ZOHO_ORG_ID}`;
  
  try {
    // Fetch the attachment data from QuickBooks as a stream
    const attachmentData = (await axios.get(qbAttachment.FileAccessUri, {
      headers: { Authorization: `Bearer ${await getQuickBooksAccessToken()}` },
      responseType: 'stream'
    })).data;

    const form = new FormData();
    form.append('attachment', attachmentData, qbAttachment.FileName);

    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });
    console.log(`✅ Uploaded attachment for customer ${zohoContactId}: ${qbAttachment.FileName}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error uploading attachment for customer ${zohoContactId}:`, error.response?.data || error.message);
    // Do not throw, just log the error and continue to the next attachment
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

async function getOrCreateZohoUncategorizedContact(accessToken) {
    const contactName = "QuickBooks Uncategorized Attachments";
    console.log(`🔎 Checking for existing Zoho contact: "${contactName}"`);
    let zohoContactId = await findZohoCustomer(accessToken, contactName); // Re-using findZohoCustomer
    
    if (zohoContactId) {
        console.log(`✅ Found existing contact: "${contactName}".`);
        return zohoContactId;
    }

    console.log(`➡️ Creating new Zoho contact: "${contactName}"`);
    try {
        const url = `${ZOHO_API_BASE}/contacts?organization_id=${ZOHO_ORG_ID}`;
        const payload = {
            contact_name: contactName,
            contact_type: "customer",
        };
        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "X-com-zoho-books-organizationid": ZOHO_ORG_ID,
                "Content-Type": "application/json",
            },
        });
        console.log(`✅ Created new Zoho contact: "${contactName}".`);
        return response.data.contact.contact_id;
    } catch (error) {
        console.error(`❌ Error creating Zoho contact for uncategorized attachments:`, error.response?.data || error.message);
        return null;
    }
}


// ---------- Migration Process ----------
export async function migrateData() {
  try {
    console.log("🔑 Getting QuickBooks access token...");
    const qbToken = await getQuickBooksAccessToken();

    console.log("🔑 Getting Zoho access token...");
    const zohoToken = await getZohoAccessToken();
    
    console.log("📥 Fetching all customers from QuickBooks...");
    const qbCustomers = await getQuickBooksCustomers(qbToken);
    console.log(`✅ Found ${qbCustomers.length} customers to migrate.`);
    
    console.log("📥 Fetching all attachments from QuickBooks...");
    const qbAttachments = await getQuickBooksAttachments(qbToken);
    let skippedAttachmentCount = 0;
    
    const categorizedAttachments = [];
    const uncategorizedAttachments = [];

    // Separate attachments into two groups
    for (const attachment of qbAttachments) {
        if (attachment.AttachableRef?.value && attachment.AttachableRef?.type) {
            categorizedAttachments.push(attachment);
        } else {
            uncategorizedAttachments.push(attachment);
        }
    }
    
    console.log(`✅ Found ${qbAttachments.length} total attachments.`);
    console.log(`➡️ ${uncategorizedAttachments.length} attachments are uncategorized and will be migrated to a special contact.`);
    
    // Map categorized attachments by entity type and ID for easy lookup
    const attachmentsByEntityId = categorizedAttachments.reduce((acc, attachment) => {
      const entityId = attachment.AttachableRef.value;
      const entityType = attachment.AttachableRef.type;
      
      const key = `${entityType}-${entityId}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(attachment);
      return acc;
    }, {});


    // Step 1: Migrate all customers first, along with their attachments
    const customerMap = {};
    for (const qbCustomer of qbCustomers) {
        try {
            console.log(`\n➡️ Migrating Customer ${qbCustomer.Id}: ${qbCustomer.DisplayName}`);
            const zohoCustomerId = await getOrCreateZohoCustomer(zohoToken, qbCustomer);
            if (zohoCustomerId) {
                customerMap[qbCustomer.Id] = zohoCustomerId;
                
                // Migrate customer-specific attachments
                const customerAttachments = attachmentsByEntityId[`Customer-${qbCustomer.Id}`] || [];
                if (customerAttachments.length > 0) {
                    console.log(`➡️ Found ${customerAttachments.length} attachments for customer ${qbCustomer.Id}.`);
                    for (const attachment of customerAttachments) {
                        await uploadZohoContactAttachment(zohoToken, zohoCustomerId, attachment);
                    }
                } else {
                    console.log(`➡️ No attachments found for customer ${qbCustomer.Id}.`);
                }
            }
        } catch (customerError) {
            console.error(`❌ Customer migration failed for "${qbCustomer.DisplayName}":`, customerError.message);
        }
    }
    console.log("✅ All customers and their attachments have been migrated or updated.");

    // Step 2: Now migrate invoices
    console.log("\n📥 Fetching invoices from QuickBooks...");
    const qbInvoices = await getQuickBooksInvoices(qbToken);
    console.log(`✅ Found ${qbInvoices.length} invoices to migrate.`);

    for (const qbInvoice of qbInvoices) {
      console.log(`\n➡️ Migrating Invoice ${qbInvoice.Id}`);

      try {
        const customerId = qbInvoice.CustomerRef?.value;
        if (!customerId) {
          console.warn(`⚠️ Invoice ${qbInvoice.Id} has no customer reference. Skipping.`);
          continue;
        }
        
        const zohoCustomerId = customerMap[customerId];
        if (!zohoCustomerId) {
          console.error(`❌ Cannot migrate invoice ${qbInvoice.Id} because the customer was not found in the initial migration. Skipping.`);
          continue;
        }

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
        
        // Step 3: Migrate invoice attachments
        const invoiceAttachments = attachmentsByEntityId[`Invoice-${qbInvoice.Id}`] || [];
        if (invoiceAttachments.length > 0) {
          console.log(`➡️ Found ${invoiceAttachments.length} attachments for invoice ${qbInvoice.Id}.`);
          for (const attachment of invoiceAttachments) {
            await uploadZohoAttachment(zohoToken, zohoInvoiceId, attachment);
          }
        } else {
          console.log(`➡️ No attachments found for invoice ${qbInvoice.Id}.`);
        }

      } catch (invoiceError) {
        console.error(`❌ Migration failed for Invoice ${qbInvoice.Id}:`, invoiceError.message);
      }
    }
    console.log("✅ All invoices and their attachments have been migrated or updated.");
    
    // Step 3: Migrate uncategorized attachments
    console.log("\n➡️ Migrating uncategorized attachments...");
    if (uncategorizedAttachments.length > 0) {
        const zohoUncategorizedContactId = await getOrCreateZohoUncategorizedContact(zohoToken);
        if (zohoUncategorizedContactId) {
            for (const attachment of uncategorizedAttachments) {
                await uploadZohoContactAttachment(zohoToken, zohoUncategorizedContactId, attachment);
            }
        }
    } else {
        console.log("➡️ No uncategorized attachments to migrate.");
    }
    
    console.log("🎉 Migration process completed.");
  } catch (globalError) {
    console.error("❌ Global migration failure:", globalError.message);
  }
}

migrateData();
