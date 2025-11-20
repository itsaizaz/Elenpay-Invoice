// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000; // Vercel often provides its own PORT

// --- Load ALL your credentials from .env ---
const PAIDLY_API_TOKEN = process.env.PAIDLY_API_TOKEN;
const PAIDLY_STORE_ID = process.env.PAIDLY_STORE_ID;
const PAIDLY_WEBHOOK_SECRET = process.env.PAIDLY_WEBHOOK_SECRET;
const PAIDLY_API_URL = process.env.PAIDLY_API_URL;

// --- Endpoint for Paidly Webhook ---
app.post('/paidly-webhook', express.raw({ type: 'application/json' }), (req, res) => {
    
    const signature = req.headers['paidly-signature']; 
    if (!signature) return res.status(400).send('Signature missing.');
    try {
        // Fixed typo: sha266 -> sha256
        const hmac = crypto.createHmac('sha256', PAIDLY_WEBHOOK_SECRET);
        hmac.update(req.body); 
        const expectedSignature = hmac.digest('hex');
        const trusted = Buffer.from(expectedSignature, 'hex');
        const untrusted = Buffer.from(signature, 'hex');
        
        if (!crypto.timingSafeEqual(trusted, untrusted)) {
            console.warn('Invalid webhook signature!');
            return res.status(401).send('Invalid signature.');
        }
        
        const event = JSON.parse(req.body.toString());
        console.log('Webhook received:', event.event);

        // We don't need to store status in memory anymore because
        // Vercel deletes memory. We will check API directly in /check-status.
        if (event.event === 'invoice_paid') {
            console.log(`✅ Invoice ${event.data.id} Paid!`);
        }

        res.status(200).send('Webhook received and verified');
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal server error.');
    }
});

// --- Standard Middleware ---
app.use(express.json()); 
app.use(express.static('public'));

// --- Endpoint for the Custom UI ---
app.post('/create-payment', async (req, res) => {
    
    if (!PAIDLY_API_TOKEN || !PAIDLY_STORE_ID || !PAIDLY_API_URL) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }
    
    const headers = {
        'Authorization': `Token ${PAIDLY_API_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
    };

    try {
        const { amount, currency } = req.body; 
        const orderId = `ORDER-${Date.now()}`;

        // --- STEP 1: CREATE THE INVOICE ---
        const createEndpoint = `${PAIDLY_API_URL}/api/v1/stores/${PAIDLY_STORE_ID}/invoices`;
        const payload = {
            metadata: { OrderId: orderId },
            checkout: {
                paymentMethods: ["BTC-LightningNetwork", "BTC"]
            },
            amount: amount.toFixed(2), 
            currency: currency
        };
        
        const createResponse = await axios.post(createEndpoint, payload, { headers });
        const newInvoiceId = createResponse.data.id;

        // --- STEP 2: FETCH THE PAYMENT METHODS ---
        const fetchEndpoint = `${PAIDLY_API_URL}/api/v1/stores/${PAIDLY_STORE_ID}/invoices/${newInvoiceId}/payment-methods`;
        const fetchResponse = await axios.get(fetchEndpoint, { headers });
        const paymentMethods = fetchResponse.data;

        // --- STEP 3: PARSE AND SEND DATA TO FRONTEND ---
        const lightningPayment = paymentMethods.find(p => p.paymentMethod === 'BTC-LightningNetwork');
        const lightningInvoice = lightningPayment ? lightningPayment.destination : null;
        const onchainPayment = paymentMethods.find(p => p.paymentMethod === 'BTC');
        const onchainAddress = onchainPayment ? onchainPayment.address : null;

        res.json({
            orderId: orderId,
            invoiceId: newInvoiceId, // ★ Sending this so we can check status directly
            lightningInvoice: lightningInvoice,
            onchainAddress: onchainAddress
        });

    } catch (error) {
        console.error('Error in /create-payment route:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: 'Failed to process payment invoice.' });
    }
});

// --- ★ VERCEL FIX: Stateless Polling Endpoint ★ ---
// Instead of checking a local variable (which Vercel deletes),
// we check the Paidly API directly.
app.get('/check-status/:invoiceId', async (req, res) => {
    const { invoiceId } = req.params;
    
    if (!PAIDLY_API_TOKEN || !PAIDLY_STORE_ID) {
        return res.status(500).json({ status: 'Error' });
    }

    try {
        const headers = {
            'Authorization': `Token ${PAIDLY_API_TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        // Ask Paidly directly: "Is this invoice paid?"
        const endpoint = `${PAIDLY_API_URL}/api/v1/stores/${PAIDLY_STORE_ID}/invoices/${invoiceId}`;
        const response = await axios.get(endpoint, { headers });
        
        // Paidly returns "Settled" or "Paid" usually
        // Check your specific API response for the status field
        const status = response.data.status; 
        
        // Map Paidly status to our simple "Paid" string
        if (status === 'Settled' || status === 'Complete' || status === 'Confirmed') {
            res.json({ status: 'Paid' });
        } else {
            res.json({ status: status });
        }
        
    } catch (error) {
        console.error("Check status error:", error.message);
        res.json({ status: 'Error' });
    }
});

// --- ★ VERCEL CONFIGURATION ★ ---
// 1. Export the app for Vercel
module.exports = app;

// 2. Only listen if NOT running on Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running locally at http://localhost:${PORT}`);
    });
}