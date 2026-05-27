// /api/fullbay.js — Fullbay API proxy
// Auth: sha1(key + YYYY-MM-DD + serverPublicIP) — IP-bound, must be server-side
// All endpoints: https://app.fullbay.com/services/*.php
// Max date range per request: 7 days — proxy chunks automatically

import { createHash } from 'crypto';

const BASE = 'https://app.fullbay.com/services';
const ENDPOINTS = {
  getInvoices:       'getInvoices.php',
  getPayments:       'getCustomerPayments.php',
  getAdjustments:    'getAdjustments.php',
  getCounterSales:   'getCounterSales.php',
  getCustomerCredits:'getCustomerCredits.php',
  getVendorBills:    'getVendorBills.php',
  getVendorCredits:  'getVendorCredits.php',
};

function makeToken(key, serverIp) {
  const today = new Date().toISOString().slice(0, 10);
  return createHash('sha1').update(key + today + serverIp).digest('hex');
}

// Split a date range into 7-day chunks (Fullbay's max)
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

async function callFullbay(endpoint, key, token, startDate, endDate, extraParams = {}) {
  const params = new URLSearchParams({ key, token, startDate, endDate, ...extraParams });
  const url = `${BASE}/${endpoint}?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Fullbay HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Fullbay returned non-JSON: ' + text.slice(0, 200)); }
}

// Fetch all records for a date range, chunking automatically
async function fetchAll(endpoint, key, token, startDate, endDate, extraParams = {}) {
  const chunks = chunkDates(startDate, endDate);
  const all = [];
  for (const [s, e] of chunks) {
    const data = await callFullbay(endpoint, key, token, s, e, extraParams);
    if (data.status === 'FAIL') throw new Error(data.message || 'Fullbay API error');
    if (data.resultSet) all.push(...data.resultSet);
  }
  return { status: 'SUCCESS', resultCount: all.length, records: all };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, key, startDate, endDate, ...extra } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });

  // Get public IP of THIS Vercel server for token generation
  let serverIp;
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json();
    serverIp = ipData.ip;
  } catch(e) {
    return res.status(500).json({ error: 'Could not determine server IP: ' + e.message });
  }

  const token = makeToken(key, serverIp);

  try {
    // Default: last 90 days if no dates given
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today - 90 * 86400000).toISOString().slice(0, 10);
    const start = startDate || defaultStart;
    const end = endDate || defaultEnd;

    switch (action) {
      case 'getInvoices':
        return res.json(await fetchAll('getInvoices.php', key, token, start, end));
      case 'getPayments':
        return res.json(await fetchAll('getCustomerPayments.php', key, token, start, end));
      case 'getAdjustments':
        return res.json(await fetchAll('getAdjustments.php', key, token, start, end));
      case 'getCounterSales':
        return res.json(await fetchAll('getCounterSales.php', key, token, start, end));
      case 'getCustomerCredits':
        return res.json(await fetchAll('getCustomerCredits.php', key, token, start, end));
      case 'getVendorBills':
        return res.json(await fetchAll('getVendorBills.php', key, token, start, end));
      case 'getVendorCredits':
        return res.json(await fetchAll('getVendorCredits.php', key, token, start, end));
      case 'getStatus': {
        // Quick test: fetch 1 day of invoices to confirm auth works
        const testDate = new Date(today - 365 * 86400000).toISOString().slice(0, 10);
        const d = await callFullbay('getInvoices.php', key, token, testDate, testDate);
        if (d.status === 'FAIL') return res.json({ error: d.message });
        return res.json({ ok: true, serverIp, message: 'Connected' });
      }
      case 'fullSync': {
        // Pull 120 days of invoices + payments
        const syncStart = new Date(today - 120 * 86400000).toISOString().slice(0, 10);
        const [invoices, payments] = await Promise.all([
          fetchAll('getInvoices.php', key, token, syncStart, defaultEnd),
          fetchAll('getCustomerPayments.php', key, token, syncStart, defaultEnd),
        ]);
        return res.json({ ok: true, invoices: invoices.records, payments: payments.records });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
