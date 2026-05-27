// /api/fullbay.js — Fullbay API proxy
// Accepts TWO formats:
//   1. App format (AnvilFullbay internal): { path: "getInvoices.php", params: { key, token (ignored), ... } }
//   2. Direct format: { action: "getStatus"|"getInvoices"|..., key, startDate, endDate }
//
// Token is ALWAYS regenerated server-side using FULLBAY_SERVER_IP env var.
// Client-computed token (if provided) is discarded.

import { createHash } from 'crypto';

const BASE = 'https://app.fullbay.com/services';

const FALLBACK_IP = process.env.FULLBAY_SERVER_IP || '32.196.231.106';

// Always fetch real outbound IP — Vercel IPs rotate between invocations.
// 3s hard timeout so we never hang the whole function on ipify.
async function getServerIp() {
  // Race ipify against a 2.5s fallback — avoids hanging the function
  try {
    const result = await Promise.race([
      fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ipify timeout')), 2500)),
    ]);
    if (result && typeof result === 'string') return result;
  } catch(e) { /* fall through to env var */ }
  return FALLBACK_IP;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeToken(key, serverIp) {
  return createHash('sha1').update(key + today() + serverIp).digest('hex');
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// Split a date range into ≤7-day chunks (Fullbay's max before timeouts)
function chunkDates(startDate, endDate) {
  const chunks = [];
  let cur = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (cur <= end) {
    const chunkEnd = new Date(Math.min(cur.getTime() + 6 * 86400000, end.getTime()));
    chunks.push([cur.toISOString().slice(0, 10), chunkEnd.toISOString().slice(0, 10)]);
    cur = new Date(chunkEnd.getTime() + 86400000);
  }
  return chunks;
}

async function callFullbay(phpFile, key, serverIp, extraParams = {}) {
  const token = makeToken(key, serverIp);
  const params = new URLSearchParams({ key, token, ...extraParams });
  const url = `${BASE}/${phpFile}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Fullbay HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Non-JSON response: ' + text.slice(0, 200)); }
}

async function fetchRange(phpFile, key, serverIp, startDate, endDate, extra = {}) {
  const chunks = chunkDates(startDate, endDate);
  const all = [];
  for (const [s, e] of chunks) {
    const data = await callFullbay(phpFile, key, serverIp, { startDate: s, endDate: e, ...extra });
    if (data.status === 'FAIL') throw new Error(data.message || 'Fullbay API error');
    if (data.resultSet) all.push(...data.resultSet);
  }
  return { status: 'SUCCESS', resultCount: all.length, resultSet: all };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  let phpFile, key, startDate, endDate, action, extra = {};

  if (body.path) {
    // ── App (AnvilFullbay) format: { path, params: { key, token (ignored), ... } } ──
    phpFile = body.path;
    const p = body.params || {};
    key = p.key;
    startDate = p.startDate;
    endDate = p.endDate;
    const { key: _k, token: _t, startDate: _s, endDate: _e, ...rest } = p;
    extra = rest;
    action = 'proxy';
  } else {
    // ── Direct format: { action, key, startDate, endDate } ──
    action = body.action;
    key = body.key;
    startDate = body.startDate;
    endDate = body.endDate;
    const { action: _a, key: _k, startDate: _s, endDate: _e, ...rest } = body;
    extra = rest;
  }

  if (!key) return res.status(400).json({ error: 'key required' });

  // Fetch real server IP once per invocation (Vercel IPs rotate)
  const serverIp = await getServerIp();

  // Default: last 30 days (manageable, ~5 chunks)
  const defaultEnd   = today();
  const defaultStart = daysAgo(30);
  const start = startDate || defaultStart;
  const end   = endDate   || defaultEnd;

  try {
    if (action === 'proxy') {
      // Forward app's request, regenerating token server-side
      const data = await fetchRange(phpFile, key, serverIp, start, end, extra);
      return res.json(data);
    }

    switch (action) {
      case 'getStatus': {
        // Use a known-small date range to avoid timeout
        const testDate = daysAgo(400); // ~1 year ago, small result set
        const d = await callFullbay('getInvoices.php', key, serverIp, { startDate: testDate, endDate: testDate });
        if (d.status === 'FAIL') return res.json({ ok: false, error: d.message });
        return res.json({ ok: true, serverIp: serverIp, message: 'Connected' });
      }

      case 'getInvoices':
        return res.json(await fetchRange('getInvoices.php', key, serverIp, start, end, extra));
      case 'getPayments':
        return res.json(await fetchRange('getCustomerPayments.php', key, serverIp, start, end, extra));
      case 'getAdjustments':
        return res.json(await fetchRange('getAdjustments.php', key, serverIp, start, end, extra));
      case 'getCounterSales':
        return res.json(await fetchRange('getCounterSales.php', key, serverIp, start, end, extra));
      case 'getCustomerCredits':
        return res.json(await fetchRange('getCustomerCredits.php', key, serverIp, start, end, extra));
      case 'getVendorBills':
        return res.json(await fetchRange('getVendorBills.php', key, serverIp, start, end, extra));
      case 'getVendorCredits':
        return res.json(await fetchRange('getVendorCredits.php', key, serverIp, start, end, extra));

      case 'fullSync': {
        // Pull 30 days of invoices + payments in parallel
        const syncStart = daysAgo(30);
        const [invoices, payments] = await Promise.all([
          fetchRange('getInvoices.php', key, serverIp, syncStart, defaultEnd),
          fetchRange('getCustomerPayments.php', key, serverIp, syncStart, defaultEnd),
        ]);
        return res.json({
          ok: true,
          invoices: invoices.resultSet,
          payments: payments.resultSet,
          serverIp: serverIp,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
