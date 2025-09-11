// index.js - simple QBO -> Zoho attachments migration (file-based persistence)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const mime = require('mime-types');
const Bottleneck = require('bottleneck');
const argv = require('minimist')(process.argv.slice(2));

/* ---------------- Config ---------------- */
const realmId = process.env.QBO_REALM_ID;
const orgId = process.env.ZOHO_ORG_ID;
const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_REFRESH_TOKEN = process.env.QBO_REFRESH_TOKEN;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_API_BASE = process.env.ZOHO_API_BASE || 'https://www.zohoapis.com/books/v3';

const BATCH_MAX = Number(process.env.BATCH_MAX_ATTACHABLES_PER_RUN || process.env.BATCH_MAX || 200);
const QBO_QUERY_BATCH = Number(process.env.QBO_QUERY_BATCH || 100);
const MIN_TIME_MS = Number(process.env.MIN_TIME_MS || 700);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);
const ZOHO_MAX_FILE_SIZE_BYTES = Number(process.env.ZOHO_MAX_FILE_SIZE_BYTES || 10_485_760);

const MAPPINGS_FILE = path.resolve('./mappings.json');
const PROGRESS_FILE = path.resolve('./progress.json');
const FAILED_FILE = path.resolve('./failed.json');

/* ------------- Simple retry wrapper -------------- */
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function retry(fn, opts = {}) {
  const { retries = 5, minTimeout = 500, factor = 2 } = opts;
  let attempt = 0;
  let lastErr;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // don't retry on client 4xx except 429
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      const wait = Math.round(minTimeout * Math.pow(factor, attempt));
      console.warn(`Retry attempt ${attempt + 1}/${retries} after ${wait}ms due to ${err?.response?.status || err.message}`);
      await sleep(wait);
      attempt++;
    }
  }
  throw lastErr;
}

/* ----------------- File persistence helpers ----------------- */
function loadJSON(file, defaultValue) {
  if (!fs.existsSync(file)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Failed to parse', file, e);
    return defaultValue;
  }
}
function saveJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

/* ----------------- Token refresh helpers ----------------- */
async function refreshQboToken() {
  const url = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: QBO_REFRESH_TOKEN }).toString();
  const resp = await axios.post(url, params, {
    auth: { username: QBO_CLIENT_ID, password: QBO_CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data; // contains access_token
}

async function refreshZohoToken() {
  const url = 'https://accounts.zoho.com/oauth/v2/token';
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token'
  }).toString();
  const resp = await axios.post(`${url}?${params}`);
  return resp.data; // contains access_token
}

/* ---------------- QBO helpers ---------------- */
async function getAttachablesBatch(accessToken, realmId, startPosition = 1, maxResults = 100) {
  const query = `SELECT * FROM Attachable STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query`;
  const resp = await retry(() => axios.post(url, query, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain', Accept: 'application/json' }
  }));
  return (resp.data && resp.data.QueryResponse && resp.data.QueryResponse.Attachable) || [];
}
async function getAttachableFull(accessToken, realmId, attachableId) {
  const q = `SELECT * FROM Attachable WHERE Id='${attachableId}'`;
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query`;
  const resp = await retry(() => axios.post(url, q, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' } }));
  const arr = (resp.data && resp.data.QueryResponse && resp.data.QueryResponse.Attachable) || [];
  return arr[0] || null;
}
async function downloadAttachableStream(accessToken, realmId, attachableId, tempDownloadUri) {
  if (tempDownloadUri) {
    const resp = await retry(() => axios.get(tempDownloadUri, { responseType: 'stream' }));
    return { stream: resp.data, contentType: resp.headers['content-type'], size: Number(resp.headers['content-length'] || 0) };
  }
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/download/${attachableId}`;
  const resp = await retry(() => axios.get(url, { responseType: 'stream', headers: { Authorization: `Bearer ${accessToken}` } }));
  return { stream: resp.data, contentType: resp.headers['content-type'], size: Number(resp.headers['content-length'] || 0) };
}

/* ---------------- Zoho helpers ---------------- */
async function uploadAttachmentToZohoModule(accessToken, orgId, moduleApiName, recordId, filename, stream, contentType) {
  const form = new FormData();
  form.append('attachment', stream, { filename, contentType });
  const url = `${ZOHO_API_BASE}/${moduleApiName}/${recordId}/attachment?organization_id=${orgId}`;
  const headers = { Authorization: `Zoho-oauthtoken ${accessToken}`, ...form.getHeaders() };
  const resp = await retry(() => axios.post(url, form, { headers, maxContentLength: Infinity, maxBodyLength: Infinity }));
  return resp.data;
}
async function addCommentToZoho(accessToken, orgId, moduleApiName, recordId, text) {
  const url = `${ZOHO_API_BASE}/${moduleApiName}/${recordId}/comments?organization_id=${orgId}`;
  const resp = await retry(() => axios.post(url, { description: text }, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }));
  return resp.data;
}

/* ----------------- Orchestration ----------------- */
const limiter = new Bottleneck({ minTime: MIN_TIME_MS, maxConcurrent: MAX_CONCURRENT });

async function processAttachable(a, qboTokens, zohoTokens, mappings) {
  const attachableId = a.Id || a.id;
  console.log('Processing attachable', attachableId, a.FileName || a.FileName);

  const full = await getAttachableFull(qboTokens.access_token, realmId, attachableId);
  if (!full) throw new Error('Attachable not found: ' + attachableId);

  const refs = full.AttachableRef || full.AttachableRef || [];
  if (!Array.isArray(refs) || refs.length === 0) {
    console.warn('No AttachableRef — skipping', attachableId);
    appendFailure({ attachableId, reason: 'No AttachableRef' });
    return;
  }

  for (const refObj of refs) {
    const entityRef = refObj.EntityRef || refObj;
    const qboType = entityRef.Type || entityRef.type;
    const qboId = entityRef.value || entityRef.Value || entityRef.id;
    if (!qboType || !qboId) continue;

    const mapping = mappings.find(m => m.qboType === qboType && String(m.qboId) === String(qboId));
    if (!mapping) {
      console.warn(`No mapping for QBO ${qboType} ${qboId} — skipping`);
      appendFailure({ attachableId, reason: `No mapping for ${qboType} ${qboId}` });
      continue;
    }

    const moduleApi = mapping.zohoModule;
    const zohoId = mapping.zohoId;

    // download
    const filename = full.FileName || `attach-${attachableId}`;
    const tempUri = full.TempDownloadUri || null;
    const { stream, contentType, size } = await downloadAttachableStream(qboTokens.access_token, realmId, attachableId, tempUri);
    const finalContentType = contentType || mime.lookup(filename) || 'application/octet-stream';

    // if too large, add comment instead of attaching
    if (size > ZOHO_MAX_FILE_SIZE_BYTES) {
      console.warn(`Attachable ${attachableId} too large (${size}). Adding comment with note to manual retrieve.`);
      await addCommentToZoho(zohoTokens.access_token, orgId, moduleApi, zohoId, `Attachment ${filename} is too large to upload (${size} bytes). Please retrieve from QBO or alternative storage.`);
      saveProgress({ attachableId, lastAction: 'oversized' });
      continue;
    }

    // upload to Zoho (pipe stream)
    const passthru = stream; // axios stream is fine to pass into form-data
    const resp = await uploadAttachmentToZohoModule(zohoTokens.access_token, orgId, moduleApi, zohoId, filename, passthru, finalContentType);

    console.log('Uploaded attachable', attachableId, '->', moduleApi, zohoId);
    saveProgress({ attachableId, lastAction: 'uploaded' });
  }
}

function appendFailure(item) {
  const failures = loadJSON(FAILED_FILE, []);
  failures.push({ timestamp: new Date().toISOString(), ...item });
  saveJSON(FAILED_FILE, failures);
}

/* ----------------- Progress helpers ----------------- */
function getProgress() {
  return loadJSON(PROGRESS_FILE, { startPosition: 1 });
}
function saveProgress(obj) {
  // merge small progress object and persist
  const cur = getProgress();
  const out = { ...cur, ...obj };
  saveJSON(PROGRESS_FILE, out);
}

/* ----------------- Main runner ----------------- */
async function main({ once = false }) {
  if (!realmId || !orgId) {
    console.error('QBO_REALM_ID and ZOHO_ORG_ID must be set in .env');
    process.exit(1);
  }
  if (!fs.existsSync(MAPPINGS_FILE)) {
    console.error('mappings.json not found - create and populate it first.');
    process.exit(1);
  }

  const mappings = loadJSON(MAPPINGS_FILE, []);
  if (!Array.isArray(mappings) || mappings.length === 0) {
    console.error('mappings.json is empty. Populate with QBO -> Zoho mappings.');
    process.exit(1);
  }

  let qboTokens = await refreshQboToken();
  let zohoTokens = await refreshZohoToken();

  let progress = getProgress();
  let startPosition = progress.startPosition || 1;
  let processed = 0;

  console.log('Starting batch from position', startPosition, 'batch max', BATCH_MAX);

  while (processed < BATCH_MAX) {
    const attachables = await getAttachablesBatch(qboTokens.access_token, realmId, startPosition, QBO_QUERY_BATCH);
    if (!attachables || attachables.length === 0) {
      console.log('No more attachables. Exiting.');
      break;
    }

    for (const a of attachables) {
      if (processed >= BATCH_MAX) break;
      try {
        await limiter.schedule(() => processAttachable(a, qboTokens, zohoTokens, mappings));
        processed++;
        startPosition++;
        saveProgress({ startPosition });
      } catch (err) {
        console.error('Error processing attachable', a.Id, err?.message || err);
        appendFailure({ attachableId: a.Id || a.id, error: err?.message || String(err) });
        // continue with next attachable
        startPosition++;
        saveProgress({ startPosition });
      }
    }

    if (once) break;
  }

  console.log(`Run finished. Processed ${processed} attachables.`);
}

/* ----------------- CLI ----------------- */
const onceFlag = !!argv.once || false;
main({ once: onceFlag }).catch(err => {
  console.error('Fatal', err);
  process.exit(1);
});
