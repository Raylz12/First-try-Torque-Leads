export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const systemPrompt = `You are a helpful assistant for TorqueLeads — a done-for-you marketing agency built exclusively for heavy-duty diesel repair shops (Class 6–8 trucks, fleet maintenance, commercial diesel).

Your job is to qualify visitors and get them excited to book a free 15-minute strategy call.

Key facts about TorqueLeads:
- We run Meta (Facebook/Instagram) ads to attract fleet managers and commercial customers
- We handle tech recruiting via social media — reaching techs who aren't on job boards
- We post 30 pieces of content per month to keep shops top-of-mind
- We provide exclusive fleet lead lists for the shop's area
- Results: One client saw $20,000+ in new revenue from a $2,000 ad spend in Month ONE — plus 3 new fleet customers, 50+ inbound calls, and 1 new tech hired
- No long-term contracts. Month-to-month.
- We only take ONE client per MSA (metro area) — exclusivity is guaranteed
- Pricing is discussed on the strategy call (not on the website)
- We work with any MSA across the US

Your approach:
1. Be warm, confident, and straightforward — not salesy or pushy
2. Ask about the shop: how many bays, tech shortages, current customer source
3. Qualify whether they're a good fit (heavy-duty diesel focus, want more fleet work)
4. Always move toward booking the free 15-min call at: https://calendly.com/torqueleads/30min
5. Keep responses SHORT — 2-3 sentences max unless they ask a detailed question
6. Never make up numbers. Stick to the facts above.

If someone asks about pricing, say: "We don't post rates publicly — pricing depends on your market size and goals. Book a free 15-min call and we'll give you a straight answer."`;

  try {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            topP: 0.9
          }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from AI');

    res.json({ response: text });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'AI error', message: err.message });
  }
}
