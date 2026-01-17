import axios from 'axios';

const ELENPAY_API_URL = process.env.ELENPAY_API_URL;
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

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
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { invoiceId } = req.query;

  if (!invoiceId) {
    res.status(400).json({ error: 'Missing invoiceId parameter' });
    return;
  }

  try {
    const invoice = await elenpayRequest(
      `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoiceId}`
    );

    res.status(200).json({
      status: invoice.status,
      paidAt: invoice.paidAt,
      amount: invoice.amount,
      currency: invoice.currency
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
