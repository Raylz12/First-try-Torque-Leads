// /api/fullbay.js — Fullbay API proxy
// Accepts TWO formats:
//   1. App format (AnvilFullbay internal): { path: "getInvoices.php", params: { key, token (ignored), ... } }
//   2. Direct format: { action: "getStatus"|"getInvoices"|..., key, startDate, endDate }
//
// Token is ALWAYS regenerated server-side using this server's real outbound IP.
// The client-computed token (if provided) is discarded — the app can't know our real IP.

import { createHash } from 'crypto';

const BASE = 'https://app.fullbay.com/services';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeToken(key, serverIp) {
  return createHash('sha1').update(key + today() + serverIp).digest('hex');
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

async function callFullbay(phpFile, key, token, extraParams = {}) {
  const params = new URLSearchParams({ key, token, ...extraParams });
  const url = `${BASE}/${phpFile}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Fullbay HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Fullbay returned non-JSON: ' + text.slice(0, 200)); }
}

async function fetchRange(phpFile, key, token, startDate, endDate, extra = {}) {
  const chunks = chunkDates(startDate, endDate);
  const all = [];
  for (const [s, e] of chunks) {
    const data = await callFullbay(phpFile, key, token, { startDate: s, endDate: e, ...extra });
    if (data.status === 'FAIL') throw new Error(data.message || 'Fullbay API error');
    if (data.resultSet) all.push(...data.resultSet);
  }
  return { status: 'SUCCESS', resultCount: all.length, resultSet: all };
}

async function getServerIp() {
  const res = await fetch('https://api.ipify.org?format=json');
  const { ip } = await res.json();
  return ip;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};

  // ── Detect which format was sent ──
  // App format: { path: "getInvoices.php", params: { key, token, startDate, endDate } }
  // Direct format: { action: "getInvoices", key, startDate, endDate }
  let phpFile, key, startDate, endDate, action, extra = {};

  if (body.path) {
    // App (AnvilFullbay) format
    phpFile = body.path;
    const p = body.params || {};
    key = p.key;
    startDate = p.startDate;
    endDate = p.endDate;
    // pass through any extra params the app sends (excluding key/token/dates)
    const { key: _k, token: _t, startDate: _s, endDate: _e, ...rest } = p;
    extra = rest;
    action = 'proxy'; // internal label
  } else {
    // Direct format
    action = body.action;
    key = body.key;
    startDate = body.startDate;
    endDate = body.endDate;
    const { action: _a, key: _k, startDate: _s, endDate: _e, ...rest } = body;
    extra = rest;
  }

  if (!key) return res.status(400).json({ error: 'key required' });

  // Always generate token server-side (discard any client-provided token)
  let serverIp;
  try {
    serverIp = await getServerIp();
  } catch(e) {
    return res.status(500).json({ error: 'Could not determine server IP: ' + e.message });
  }
  const token = makeToken(key, serverIp);

  const defaultEnd = today();
  const defaultStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const start = startDate || defaultStart;
  const end = endDate || defaultEnd;

  try {
    // ── App format: forward to specified PHP endpoint ──
    if (action === 'proxy') {
      const data = await fetchRange(phpFile, key, token, start, end, extra);
      return res.json(data);
    }

    // ── Direct format actions ──
    switch (action) {
      case 'getStatus': {
        const testDate = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        const d = await callFullbay('getInvoices.php', key, token, { startDate: testDate, endDate: testDate });
        if (d.status === 'FAIL') return res.json({ ok: false, error: d.message });
        return res.json({ ok: true, serverIp, message: 'Connected' });
      }
      case 'getInvoices':
        return res.json(await fetchRange('getInvoices.php', key, token, start, end, extra));
      case 'getPayments':
        return res.json(await fetchRange('getCustomerPayments.php', key, token, start, end, extra));
      case 'getAdjustments':
        return res.json(await fetchRange('getAdjustments.php', key, token, start, end, extra));
      case 'getCounterSales':
        return res.json(await fetchRange('getCounterSales.php', key, token, start, end, extra));
      case 'getCustomerCredits':
        return res.json(await fetchRange('getCustomerCredits.php', key, token, start, end, extra));
      case 'getVendorBills':
        return res.json(await fetchRange('getVendorBills.php', key, token, start, end, extra));
      case 'getVendorCredits':
        return res.json(await fetchRange('getVendorCredits.php', key, token, start, end, extra));
      case 'fullSync': {
        const syncStart = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
        const [invoices, payments] = await Promise.all([
          fetchRange('getInvoices.php', key, token, syncStart, defaultEnd),
          fetchRange('getCustomerPayments.php', key, token, syncStart, defaultEnd),
        ]);
        return res.json({ ok: true, invoices: invoices.resultSet, payments: payments.resultSet, serverIp });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Use path format or action: getInvoices|getPayments|getStatus|fullSync` });
    }
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
