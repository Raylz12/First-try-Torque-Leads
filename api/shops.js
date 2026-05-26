// /api/shops.js — Shop management CRUD via Vercel Edge Config
const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const EC_TOKEN       = process.env.EC_TOKEN;
const ADMIN_SECRET   = process.env.TL_ADMIN_SECRET || 'tl-admin-2026-uptime';
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN_WRITE;

async function readShops() {
  const r = await fetch(`https://edge-config.vercel.com/${EDGE_CONFIG_ID}/item/shops?token=${EC_TOKEN}`);
  if (!r.ok) return {};
  return await r.json();
}

async function writeShops(shops) {
  const r = await fetch(`https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ operation: 'upsert', key: 'shops', value: shops }] })
  });
  return r.ok;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  if (!auth.includes(ADMIN_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  if (!EDGE_CONFIG_ID || !EC_TOKEN) return res.status(500).json({ error: 'Config unavailable' });

  const shops = await readShops();

  if (req.method === 'GET') {
    const safe = Object.fromEntries(
      Object.entries(shops).map(([k, v]) => [k, { ...v, passwordHash: undefined, fullbayKey: v.fullbayKey ? '••••' : '', payrollKey: v.payrollKey ? '••••' : '' }])
    );
    return res.status(200).json({ shops: safe });
  }

  if (req.method === 'POST') {
    const { username, passwordHash, shopName, role = 'client', fullbayKey = '', payrollProvider = '', payrollKey = '' } = req.body;
    if (!username || !passwordHash || !shopName) return res.status(400).json({ error: 'username, passwordHash, shopName required' });
    if (shops[username]) return res.status(409).json({ error: 'Username already exists' });
    shops[username] = { username, passwordHash, shopName, role, fullbayKey, payrollProvider, payrollKey, createdAt: new Date().toISOString().slice(0, 10), active: true };
    await writeShops(shops);
    return res.status(201).json({ ok: true, username });
  }

  if (req.method === 'PUT') {
    const username = req.query.username || req.body.username;
    if (!username || !shops[username]) return res.status(404).json({ error: 'Shop not found' });
    const updates = { ...req.body }; delete updates.username;
    shops[username] = { ...shops[username], ...updates };
    await writeShops(shops);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const username = req.query.username;
    if (!username || !shops[username]) return res.status(404).json({ error: 'Shop not found' });
    delete shops[username];
    await writeShops(shops);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
