import axios from 'axios';

const ELENPAY_API_URL = process.env.ELENPAY_API_URL;
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

function sanitizeMetadata(value) {
  return value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

async function elenpayRequest(endpoint, method = 'GET', data = null) {
  try {
    const res = await axios({
      method,
      url: `${ELENPAY_API_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${ELENPAY_API_TOKEN}`,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      data
    });
    return res.data;
  } catch (err) {
    console.error(err.response?.data || err.message);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { amount, currency, description, paymentMethod } = req.body;

    const invoiceData = {
      amount: amount.toString(),
      currency,
      checkout: {
        paymentMethods:
          paymentMethod === 'lightning'
            ? ['BTC-LightningNetwork']
            : paymentMethod === 'onchain'
            ? ['BTC-Onchain']
            : ['BTC-LightningNetwork', 'BTC-Onchain'],
        expirationMinutes: 15
      },
      metadata: {
        order_id: `order_${Date.now()}`,
        description: sanitizeMetadata(description || 'Payment')
      }
    };

    const invoice = await elenpayRequest(
      `/api/v1/stores/${ELENPAY_STORE_ID}/invoices`,
      'POST',
      invoiceData
    );

    const paymentMethods = await elenpayRequest(
      `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoice.id}/payment-methods`
    );

    res.status(200).json({ invoice, paymentMethods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
