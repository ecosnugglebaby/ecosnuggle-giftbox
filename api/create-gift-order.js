export default async function handler(req, res) {

  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items, giftMessage } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' });
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  // Build line items
  const lineItems = items.map(function(item) {
    return {
      variant_id: parseInt(item.variantId),
      quantity: item.quantity || 1,
      properties: [
        { name: '_gift_box_item', value: 'true' }
      ]
    };
  });

  // Build order note
  let note = '🎁 Gift Box Order\n';
  items.forEach(function(item, index) {
    note += 'Item ' + (index + 1) + ': ' + item.title + '\n';
  });
  if (giftMessage) {
    note += '\n💌 Gift Message:\n' + giftMessage;
  }

  const draftOrderPayload = {
    draft_order: {
      line_items: lineItems,
      note: note,
      tags: 'gift-box',
      use_customer_default_address: true
    }
  };

  try {
    const shopifyUrl = 'https://' + SHOPIFY_STORE + '/admin/api/2024-01/draft_orders.json';

    console.log('Store:', SHOPIFY_STORE);
    console.log('Token starts with:', SHOPIFY_TOKEN ? SHOPIFY_TOKEN.substring(0, 10) : 'MISSING');
    console.log('Payload:', JSON.stringify(draftOrderPayload));

    const response = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify(draftOrderPayload)
    });

    // Read as text first to avoid JSON parse errors
    const rawText = await response.text();
    console.log('Shopify status:', response.status);
    console.log('Shopify response:', rawText.substring(0, 500));

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

    const checkoutUrl = data.draft_order.invoice_url;
    return res.status(200).json({ checkoutUrl: checkoutUrl });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
