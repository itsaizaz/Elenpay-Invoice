// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// --- Load ALL your credentials from .env ---
const PAIDLY_API_TOKEN = process.env.PAIDLY_API_TOKEN;
const PAIDLY_STORE_ID = process.env.PAIDLY_STORE_ID;
const PAIDLY_WEBHOOK_SECRET = process.env.PAIDLY_WEBHOOK_SECRET;
const PAIDLY_API_URL = process.env.PAIDLY_API_URL;

// In-memory "database" to store payment statuses
const paymentStore = new Map();

// --- Endpoint for Paidly Webhook ---
// This is essential for confirming payments with a custom UI
app.post('/paidly-webhook', express.raw({ type: 'application/json' }), (req, res) => {
    
    // Signature verification logic...
    const signature = req.headers['paidly-signature']; 
    if (!signature) return res.status(400).send('Signature missing.');
    try {
        const hmac = crypto.createHmac('sha266', PAIDLY_WEBHOOK_SECRET);
        hmac.update(req.body); 
        const expectedSignature = hmac.digest('hex');
        const trusted = Buffer.from(expectedSignature, 'hex');
        const untrusted = Buffer.from(signature, 'hex');
        if (!crypto.timingSafeEqual(trusted, untrusted)) {
            console.warn('Invalid webhook signature!');
            return res.status(401).send('Invalid signature.');
        }
        
        // Update the payment status in our store
        const event = JSON.parse(req.body.toString());
        console.log('Webhook received:', event.event);

        if (event.event === 'invoice_paid') {
            const invoice = event.data;
            const orderId = invoice.metadata.OrderId; 
            if (orderId) {
                console.log(`Webhook: Setting status for ${orderId} to "Paid"`);
                paymentStore.set(orderId, "Paid");
            }
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
        
        // Set the initial status for polling
        paymentStore.set(orderId, "New");

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
            lightningInvoice: lightningInvoice,
            onchainAddress: onchainAddress
        });

    } catch (error) {
        console.error('Error in /create-payment route:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: 'Failed to process payment invoice.' });
    }
});

// --- Endpoint for Polling Status ---
app.get('/check-status/:orderId', (req, res) => {
    const { orderId } = req.params;
    const status = paymentStore.get(orderId) || "Not Found";
    res.json({ status: status });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});