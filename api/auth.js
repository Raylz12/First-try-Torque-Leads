// /api/auth.js — Validate shop credentials + return shop config
const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const EC_TOKEN       = process.env.EC_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!EDGE_CONFIG_ID || !EC_TOKEN) return res.status(500).json({ error: 'Config unavailable' });

  const { username, passwordHash } = req.body;
  if (!username || !passwordHash) return res.status(400).json({ error: 'username and passwordHash required' });

  const r = await fetch(`https://edge-config.vercel.com/${EDGE_CONFIG_ID}/item/shops?token=${EC_TOKEN}`);
  if (!r.ok) return res.status(500).json({ error: 'Config read failed' });
  const shops = await r.json();

  const shop = shops[username.toLowerCase()];
  if (!shop || !shop.active) return res.status(401).json({ error: 'Invalid credentials' });
  if (shop.passwordHash !== passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

  return res.status(200).json({
    ok: true,
    shop: {
      username: shop.username,
      shopName: shop.shopName,
      role: shop.role,
      fullbayConnected: !!shop.fullbayKey,
      fullbayKey: shop.fullbayKey || '',
      payrollProvider: shop.payrollProvider || '',
      payrollConnected: !!shop.payrollKey,
      onboarded: !!(shop.fullbayKey || shop.onboarded),
      createdAt: shop.createdAt
    }
  });
}
