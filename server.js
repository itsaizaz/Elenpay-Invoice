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
const ELENPAY_API_URL = process.env.ELENPAY_API_URL || 'https://api-staging.paidlyinteractive.com';
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

// Validate environment variables
if (!ELENPAY_API_TOKEN || !ELENPAY_STORE_ID) {
    console.error('⚠️  Missing required environment variables!');
    console.error('Please set ELENPAY_API_TOKEN and ELENPAY_STORE_ID in your .env file');
}

// Helper function to sanitize metadata values
function sanitizeMetadata(value) {
    return value
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

// Helper function to make Elenpay API requests
async function elenpayRequest(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${ELENPAY_API_URL}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${ELENPAY_API_TOKEN}`,
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
        // NOTE: Testing different variations to find correct on-chain naming
        const paymentMethodsArray = [];
        
        if (paymentMethod === 'lightning') {
            paymentMethodsArray.push('BTC-LightningNetwork');
        } else if (paymentMethod === 'onchain') {
            // Try different variations - one of these should work
            // Based on your previous success, the correct format exists
            paymentMethodsArray.push('BTC-Onchain');  // Try this first
            // Other possible formats if first doesn't work:
            // 'BTCOnchain', 'BTC-OnChain', 'BTC_Onchain', 'Onchain'
        } else {
            // If not specified, include both
            paymentMethodsArray.push('BTC-LightningNetwork', 'BTC-Onchain');
        }

        console.log('Requesting payment methods:', paymentMethodsArray);

        // Create invoice via Elenpay API
        const invoiceData = {
            amount: amount.toString(),
            currency: currency,
            checkout: {
                // Request BOTH payment methods explicitly
                paymentMethods: paymentMethod === 'onchain' 
                    ? ['BTC-Onchain', 'BTC-LightningNetwork']  // Request both for on-chain
                    : paymentMethod === 'lightning'
                    ? ['BTC-LightningNetwork']
                    : ['BTC-LightningNetwork', 'BTC-Onchain'],
                expirationMinutes: 15
            },
            metadata: {
                order_id: `order_${Date.now()}`,
                description: sanitizeMetadata(description || 'Payment')
            }
        };

        console.log('Invoice data being sent:', JSON.stringify(invoiceData, null, 2));

        // Correct endpoint format: /api/v1/stores/{storeId}/invoices
        const invoice = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices`, 
            'POST', 
            invoiceData
        );

        console.log('Invoice created:', invoice.id);
        console.log('Full invoice response:', JSON.stringify(invoice, null, 2));

        // NOW FETCH THE ACTUAL PAYMENT METHODS
        // Elenpay doesn't return Lightning invoice/address in create response
        // We need to fetch payment methods separately
        console.log(`Fetching payment methods for invoice: ${invoice.id}`);
        
        let paymentMethods = null;
        let retries = 0;
        const maxRetries = paymentMethod === 'onchain' ? 5 : 1; // Retry more for on-chain
        
        // For on-chain, the address might take time to generate, so we'll poll
        while (retries < maxRetries) {
            if (retries > 0) {
                console.log(`Retry ${retries}/${maxRetries} - Waiting 2 seconds before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            try {
                paymentMethods = await elenpayRequest(
                    `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoice.id}/payment-methods`
                );
                
                console.log(`Attempt ${retries + 1} - Payment methods response:`, JSON.stringify(paymentMethods, null, 2));
                
                // Check if we got the payment method we need
                if (paymentMethods && paymentMethods.length > 0) {
                    const hasLightning = paymentMethods.some(m => m.paymentMethod === 'BTC-LightningNetwork' && m.destination);
                    const hasOnchain = paymentMethods.some(m => m.paymentMethod === 'BTC-Onchain' && m.destination);
                    
                    if (paymentMethod === 'lightning' && hasLightning) {
                        console.log('✅ Lightning invoice found, stopping retries');
                        break;
                    } else if (paymentMethod === 'onchain' && hasOnchain) {
                        console.log('✅ On-chain address found, stopping retries');
                        break;
                    }
                }
                
                retries++;
            } catch (error) {
                console.error(`Error fetching payment methods (attempt ${retries + 1}):`, error);
                retries++;
            }
        }

        console.log('Number of payment methods:', paymentMethods?.length || 0);

        // Extract payment details based on method
        let responseData = {
            invoiceId: invoice.id,
            checkoutURL: invoice.checkoutLink,
            expiresAt: invoice.expirationTime,
            status: invoice.status
        };

        // Find the requested payment method
        let onchainNotAvailable = false;
        
        if (paymentMethods && paymentMethods.length > 0) {
            console.log('Processing payment methods...');
            
            // Check if we requested on-chain but only got Lightning
            const hasOnlyLightning = paymentMethods.every(m => m.paymentMethod === 'BTC-LightningNetwork');
            const hasOnchain = paymentMethods.some(m => m.paymentMethod === 'BTC-Onchain');
            
            if (paymentMethod === 'onchain' && hasOnlyLightning && !hasOnchain) {
                console.log('⚠️ On-chain requested but only Lightning available (RegTest/Staging limitation)');
                onchainNotAvailable = true;
            }
            
            for (const method of paymentMethods) {
                console.log(`Method: ${method.paymentMethod}, Destination: ${method.destination || 'NOT SET'}`);
                
                if (paymentMethod === 'lightning' && method.paymentMethod === 'BTC-LightningNetwork' && method.destination) {
                    console.log('✅ Found Lightning method');
                    responseData.lightningInvoice = method.destination;
                } else if (paymentMethod === 'onchain' && method.paymentMethod === 'BTC-Onchain' && method.destination) {
                    console.log('✅ Found On-chain method');
                    responseData.address = method.destination;
                    responseData.btcAmount = method.amount || method.cryptoAmount || '0.00000000';
                    console.log(`Address: ${responseData.address}, Amount: ${responseData.btcAmount}`);
                }
            }
        } else {
            console.log('⚠️ No payment methods returned from API');
        }

        // Handle the case where on-chain was requested but isn't available
        if (onchainNotAvailable) {
            responseData.useCheckoutLink = true;
            responseData.onchainNotAvailable = true;
            responseData.message = '⚠️ On-Chain Payments Not Available in Staging\n\nElenpay\'s RegTest/Staging environment only supports Lightning Network payments. For real Bitcoin on-chain transactions, please use the production environment.\n\nThe checkout page will show Lightning Network payment as an alternative.';
        } else if (!responseData.lightningInvoice && !responseData.address) {
            // If still no address/invoice found after retries, provide checkout link
            console.log('⚠️ No payment details found after retries. Providing checkout link');
            console.log('Checkout link:', responseData.checkoutURL);
            
            responseData.useCheckoutLink = true;
            responseData.message = paymentMethod === 'onchain' 
                ? 'On-chain address generation is taking longer than expected. Please use the checkout page.'
                : 'Payment details not available. Please use the checkout page.';
        }

        console.log('Final response data:', JSON.stringify(responseData, null, 2));
        res.json(responseData);

    } catch (error) {
        console.error('Error creating invoice:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create invoice',
            details: error.response?.data || error.message
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
        elenpayConfigured: !!(ELENPAY_API_TOKEN && ELENPAY_STORE_ID),
        apiUrl: ELENPAY_API_URL
    });
});

// Debug endpoint to test payment methods retrieval
app.get('/api/debug/invoice/:invoiceId', async (req, res) => {
    try {
        const { invoiceId } = req.params;
        
        console.log(`\n=== DEBUG: Fetching invoice ${invoiceId} ===`);
        
        // Get invoice details
        const invoice = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoiceId}`
        );
        
        console.log('Invoice details:', JSON.stringify(invoice, null, 2));
        
        // Get payment methods
        const paymentMethods = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoiceId}/payment-methods`
        );
        
        console.log('Payment methods:', JSON.stringify(paymentMethods, null, 2));
        
        res.json({
            invoice,
            paymentMethods
        });
        
    } catch (error) {
        console.error('Debug endpoint error:', error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data
        });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
// app.listen(PORT, () => {
//     console.log(`🚀 Server running on port ${PORT}`);
//     console.log(`📍 http://localhost:${PORT}`);
//     console.log(`⚡ Elenpay API: ${ELENPAY_API_URL}`);
    
//     if (!ELENPAY_API_TOKEN || !ELENPAY_STORE_ID) {
//         console.log(`\n⚠️  Warning: Elenpay credentials not configured!`);
//         console.log(`   Set ELENPAY_API_TOKEN and ELENPAY_STORE_ID in .env file\n`);
//     } else {
//         console.log(`✅ Elenpay configured for store: ${ELENPAY_STORE_ID}\n`);
//     }
// });

module.exports = app;