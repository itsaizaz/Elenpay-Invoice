import axios from 'axios';

const ELENPAY_API_URL = process.env.ELENPAY_API_URL || 'https://api-staging.paidlyinteractive.com';
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

async function elenpayRequest(endpoint) {
    const config = {
        method: 'GET',
        url: `${ELENPAY_API_URL}${endpoint}`,
        headers: {
            'Authorization': `Bearer ${ELENPAY_API_TOKEN}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
        }
    };

    const response = await axios(config);
    return response.data;
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { invoiceId } = req.query;

        if (!invoiceId) {
            return res.status(400).json({ error: 'Invoice ID required' });
        }

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
        console.error('Error checking status:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to check status',
            details: error.response?.data?.message || error.message
        });
    }
}