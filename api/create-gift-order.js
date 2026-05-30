export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { items, giftMessage } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items provided' });

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  // Calculate total price in dollars
  const totalCents = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const totalDollars = (totalCents / 100).toFixed(2);

  // Build item list for the note
  let itemsSummary = '';
  items.forEach((item, index) => {
    const itemPrice = ((item.price / 100) * (item.quantity || 1)).toFixed(2);
    itemsSummary += `Item ${index + 1}: ${item.title} × ${item.quantity || 1} ($${itemPrice})\n`;
  });

  // Build note
  let note = `🎁 Gift Box Order\n\n${itemsSummary}\nBox Total: $${totalDollars}`;
  if (giftMessage) {
    note += `\n\n💌 Gift Message:\n${giftMessage}`;
  }

  // ONE line item — the gift box itself — with custom price = total of all products
  // Each product is listed as a property, not a separate line item
  const lineItems = [
    {
      title: '🎁 Build My Gift Box',
      price: totalDollars,   // ← sets the real total price
      quantity: 1,
      properties: items.map((item, index) => ({
        name: `Item ${index + 1}`,
        value: `${item.title} × ${item.quantity || 1}`
      })).concat(
        giftMessage ? [{ name: '💌 Gift Message', value: giftMessage }] : []
      )
    }
  ];

  const draftOrderPayload = {
    draft_order: {
      line_items: lineItems,
      note: note,
      tags: 'gift-box'
    }
  };

  try {
    const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`;

    const response = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify(draftOrderPayload)
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: 'Shopify returned invalid response',
        status: response.status,
        raw: rawText.substring(0, 300)
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: 'Shopify API error',
        status: response.status,
        details: data
      });
    }

    return res.status(200).json({ checkoutUrl: data.draft_order.invoice_url });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
