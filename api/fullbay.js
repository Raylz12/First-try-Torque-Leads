// Vercel serverless function — Fullbay API proxy
// Handles token generation (SHA1 of key + date + serverIP)
// and proxies all requests to app.fullbay.com/services/

import crypto from 'crypto';
import https from 'https';

// Available endpoints
const ENDPOINTS = {
  getInvoices:        'getInvoices.php',
  getPayments:        'getCustomerPayments.php',
  getAdjustments:     'getAdjustments.php',
  getCounterSales:    'getCounterSales.php',
  getCustomerCredits: 'getCustomerCredits.php',
  getCustomerUnit:    'getCustomerUnit.php',
  getVendorBills:     'getVendorBills.php',
  getVendorCredits:   'getVendorCredits.php',
};

const FULLBAY_BASE = 'https://app.fullbay.com/services/';

// Get this server's public IP (Fullbay requires it for token)
async function getPublicIP() {
  return new Promise((resolve, reject) => {
    https.get('https://checkip.amazonaws.com', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

// Build token: sha1(key + YYYY-MM-DD + ip)
function buildToken(key, ip) {
  const today = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha1').update(key + today + ip).digest('hex');
}

// Fetch one 7-day window from Fullbay
async function fetchWindow(endpoint, key, token, startDate, endDate, extra = {}) {
  const params = new URLSearchParams({ key, token, startDate, endDate, ...extra });
  const url = `${FULLBAY_BASE}${endpoint}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fullbay HTTP ${res.status}`);
  return res.json();
}

// Fetch a date range that may span >7 days by chunking into 7-day windows
async function fetchRange(endpoint, key, token, startDate, endDate, extra = {}) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const results = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const fmt = d => d.toISOString().slice(0, 10);
    const chunk = await fetchWindow(endpoint, key, token, fmt(cursor), fmt(chunkEnd), extra);
    if (chunk.status === 'OK' && Array.isArray(chunk.records)) {
      results.push(...chunk.records);
    } else if (chunk.status === 'FAIL') {
      throw new Error(chunk.message || 'Fullbay API error');
    }

    cursor.setDate(cursor.getDate() + 7);
  }

  return results;
}

export default async function handler(req, res) {
  // CORS for the dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, key, startDate, endDate, ...extra } = req.method === 'POST'
      ? req.body
      : req.query;

    if (!action || !key) {
      return res.status(400).json({ error: 'action and key are required' });
    }

    const endpoint = ENDPOINTS[action];
    if (!endpoint) {
      return res.status(400).json({ error: `Unknown action: ${action}. Valid: ${Object.keys(ENDPOINTS).join(', ')}` });
    }

    // Generate auth token using this server's public IP
    const ip    = await getPublicIP();
    const token = buildToken(key, ip);

    // Handle special case: getCustomerUnit doesn't use date range
    if (action === 'getCustomerUnit') {
      const data = await fetchWindow(endpoint, key, token, null, null, extra);
      return res.status(200).json({ ok: true, data });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    // Fetch potentially multi-chunk range
    const records = await fetchRange(endpoint, key, token, startDate, endDate, extra);
    return res.status(200).json({ ok: true, count: records.length, records, generatedAt: new Date().toISOString() });

  } catch (err) {
    console.error('Fullbay proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
