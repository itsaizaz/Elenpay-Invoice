require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Elenpay API Configuration
const ELENPAY_API_URL = process.env.ELENPAY_API_URL || 'https://api.staging.elenpay.tech';
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

// Validate environment variables
if (!ELENPAY_API_TOKEN || !ELENPAY_STORE_ID) {
    console.error('⚠️  Missing required environment variables!');
    console.error('Please set ELENPAY_API_TOKEN and ELENPAY_STORE_ID in your .env file');
}

// Helper function to make Elenpay API requests
async function elenpayRequest(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${ELENPAY_API_URL}${endpoint}`,
            headers: {
                'Authorization': `Token ${ELENPAY_API_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error('Elenpay API Error:', error.response?.data || error.message);
        throw error;
    }
}

// Create invoice endpoint
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { amount, currency, description, paymentMethod } = req.body;

        console.log(`Creating ${paymentMethod} invoice for ${amount} ${currency}`);

        // Prepare payment methods array
        const paymentMethods = [];
        
        if (paymentMethod === 'lightning') {
            paymentMethods.push('BTC-LightningNetwork');
        } else if (paymentMethod === 'onchain') {
            paymentMethods.push('BTC-Onchain');
        } else {
            // If not specified, include both
            paymentMethods.push('BTC-LightningNetwork', 'BTC-Onchain');
        }

        // Create invoice via Elenpay API - Note the correct URL format
        const invoiceData = {
            amount: amount.toString(),
            currency: currency,
            description: description || 'Payment',
            checkout: {
                paymentMethods: paymentMethods,
                redirectURL: `${req.protocol}://${req.get('host')}/success`,
                expirationMinutes: 15
            },
            metadata: {
                orderId: `order_${Date.now()}`,
                customer: 'web_customer'
            }
        };

        // Correct endpoint format: /api/v1/stores/{storeId}/invoices
        const invoice = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices`, 
            'POST', 
            invoiceData
        );

        console.log('Invoice created:', invoice.id);

        // Extract payment details based on method
        let responseData = {
            invoiceId: invoice.id,
            checkoutURL: invoice.checkoutURL,
            expiresAt: invoice.expiresAt,
            status: invoice.status
        };

        // Add method-specific data
        if (paymentMethod === 'lightning' && invoice.lightningInvoice) {
            responseData.lightningInvoice = invoice.lightningInvoice;
        } else if (paymentMethod === 'onchain' && invoice.address) {
            responseData.address = invoice.address;
            responseData.btcAmount = invoice.btcAmount;
        } else {
            // Return both if available
            if (invoice.lightningInvoice) {
                responseData.lightningInvoice = invoice.lightningInvoice;
            }
            if (invoice.address) {
                responseData.address = invoice.address;
                responseData.btcAmount = invoice.btcAmount;
            }
        }

        res.json(responseData);

    } catch (error) {
        console.error('Error creating invoice:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create invoice',
            details: error.response?.data?.message || error.message
        });
    }
});

// Check payment status endpoint
app.get('/api/check-status/:invoiceId', async (req, res) => {
    try {
        const { invoiceId } = req.params;

        // Correct endpoint format: /api/v1/stores/{storeId}/invoices/{invoiceId}
        const invoice = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoiceId}`
        );

        res.json({
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
});

// Webhook endpoint for payment notifications
app.post('/api/webhook', async (req, res) => {
    try {
        const event = req.body;

        console.log('Webhook received:', {
            type: event.type,
            invoiceId: event.invoiceId,
            status: event.status
        });

        // Verify webhook signature (if Elenpay provides one)
        // const signature = req.headers['x-elenpay-signature'];
        // if (!verifySignature(signature, req.body)) {
        //     return res.status(401).json({ error: 'Invalid signature' });
        // }

        // Handle different event types
        switch (event.type) {
            case 'invoice.paid':
                console.log(`✅ Invoice ${event.invoiceId} has been paid!`);
                // Add your business logic here (update database, send confirmation email, etc.)
                break;

            case 'invoice.expired':
                console.log(`⏰ Invoice ${event.invoiceId} has expired`);
                // Handle expiration
                break;

            case 'invoice.processing':
                console.log(`⏳ Invoice ${event.invoiceId} is processing`);
                // Handle processing state
                break;

            default:
                console.log(`Unknown event type: ${event.type}`);
        }

        // Always respond with 200 to acknowledge receipt
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Success page
app.get('/success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Successful</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }
                .success-card {
                    background: white;
                    border-radius: 20px;
                    padding: 50px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 500px;
                }
                .checkmark {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    display: block;
                    stroke-width: 3;
                    stroke: #10b981;
                    stroke-miterlimit: 10;
                    margin: 0 auto 30px;
                    box-shadow: inset 0px 0px 0px #10b981;
                    animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
                }
                .checkmark__circle {
                    stroke-dasharray: 166;
                    stroke-dashoffset: 166;
                    stroke-width: 3;
                    stroke-miterlimit: 10;
                    stroke: #10b981;
                    fill: none;
                    animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
                }
                .checkmark__check {
                    transform-origin: 50% 50%;
                    stroke-dasharray: 48;
                    stroke-dashoffset: 48;
                    animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
                }
                @keyframes stroke {
                    100% { stroke-dashoffset: 0; }
                }
                @keyframes scale {
                    0%, 100% { transform: none; }
                    50% { transform: scale3d(1.1, 1.1, 1); }
                }
                @keyframes fill {
                    100% { box-shadow: inset 0px 0px 0px 30px #10b981; }
                }
                h1 {
                    color: #1a1a1a;
                    margin-bottom: 10px;
                }
                p {
                    color: #666;
                    font-size: 18px;
                }
                .button {
                    display: inline-block;
                    margin-top: 30px;
                    padding: 15px 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 50px;
                    font-weight: 600;
                    transition: transform 0.2s;
                }
                .button:hover {
                    transform: scale(1.05);
                }
            </style>
        </head>
        <body>
            <div class="success-card">
                <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                    <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
                <h1>Payment Successful! 🎉</h1>
                <p>Your Bitcoin payment has been confirmed.</p>
                <p style="font-size: 14px; color: #999; margin-top: 20px;">
                    Thank you for using Bitcoin!
                </p>
                <a href="/" class="button">Return Home</a>
            </div>
        </body>
        </html>
    `);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        elenpayConfigured: !!(ELENPAY_API_TOKEN && ELENPAY_STORE_ID)
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`⚡ Elenpay API: ${ELENPAY_API_URL}`);
    
    if (!ELENPAY_API_TOKEN || !ELENPAY_STORE_ID) {
        console.log(`\n⚠️  Warning: Elenpay credentials not configured!`);
        console.log(`   Set ELENPAY_API_TOKEN and ELENPAY_STORE_ID in .env file\n`);
    } else {
        console.log(`✅ Elenpay configured for store: ${ELENPAY_STORE_ID}\n`);
    }
});

module.exports = app;