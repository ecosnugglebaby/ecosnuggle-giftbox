export default async function handler(req, res) {
  // Allow CORS from your Shopify store
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
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  // Step 1: Get access token using client credentials
  let accessToken;
  try {
    const tokenResponse = await fetch(
      'https://' + SHOPIFY_STORE + '/admin/oauth/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'client_credentials'
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Token error:', tokenData);
      return res.status(500).json({ error: 'Failed to authenticate with Shopify', details: tokenData });
    }

    accessToken = tokenData.access_token;

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Auth error', message: err.message });
  }

  // Step 2: Build line items
  const lineItems = items.map(function(item) {
    return {
      variant_id: item.variantId,
      quantity: item.quantity || 1,
      properties: [
        { name: '_gift_box_item', value: 'true' }
      ]
    };
  });

  // Step 3: Build note
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

  // Step 4: Create draft order
  try {
    const response = await fetch(
      'https://' + SHOPIFY_STORE + '/admin/api/2024-01/draft_orders.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify(draftOrderPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Shopify API error:', data);
      return res.status(500).json({ error: 'Failed to create draft order', details: data });
    }

    const checkoutUrl = data.draft_order.invoice_url;
    return res.status(200).json({ checkoutUrl: checkoutUrl });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
