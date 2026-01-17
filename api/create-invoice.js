import axios from 'axios';

// Elenpay API Configuration
const ELENPAY_API_URL = process.env.ELENPAY_API_URL || 'https://api-staging.paidlyinteractive.com';
const ELENPAY_API_TOKEN = process.env.ELENPAY_API_TOKEN;
const ELENPAY_STORE_ID = process.env.ELENPAY_STORE_ID;

// Helper function to sanitize metadata values
function sanitizeMetadata(value) {
    return value
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

// Helper function to make Elenpay API requests
async function elenpayRequest(endpoint, method = 'GET', data = null) {
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
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, currency, description, paymentMethod } = req.body;

        console.log(`Creating ${paymentMethod} invoice for ${amount} ${currency}`);

        // Create invoice via Elenpay API
        const invoiceData = {
            amount: amount.toString(),
            currency: currency,
            checkout: {
                paymentMethods: paymentMethod === 'onchain' 
                    ? ['BTC-Onchain', 'BTC-LightningNetwork']
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

        const invoice = await elenpayRequest(
            `/api/v1/stores/${ELENPAY_STORE_ID}/invoices`, 
            'POST', 
            invoiceData
        );

        console.log('Invoice created:', invoice.id);

        // Fetch payment methods
        let paymentMethods = null;
        let retries = 0;
        const maxRetries = paymentMethod === 'onchain' ? 5 : 1;
        
        while (retries < maxRetries) {
            if (retries > 0) {
                console.log(`Retry ${retries}/${maxRetries} - Waiting 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            try {
                paymentMethods = await elenpayRequest(
                    `/api/v1/stores/${ELENPAY_STORE_ID}/invoices/${invoice.id}/payment-methods`
                );
                
                console.log(`Attempt ${retries + 1} - Payment methods:`, JSON.stringify(paymentMethods, null, 2));
                
                if (paymentMethods && paymentMethods.length > 0) {
                    const hasLightning = paymentMethods.some(m => m.paymentMethod === 'BTC-LightningNetwork' && m.destination);
                    const hasOnchain = paymentMethods.some(m => m.paymentMethod === 'BTC-Onchain' && m.destination);
                    
                    if (paymentMethod === 'lightning' && hasLightning) {
                        console.log('✅ Lightning invoice found');
                        break;
                    } else if (paymentMethod === 'onchain' && hasOnchain) {
                        console.log('✅ On-chain address found');
                        break;
                    }
                }
                
                retries++;
            } catch (error) {
                console.error(`Error fetching payment methods (attempt ${retries + 1}):`, error);
                retries++;
            }
        }

        let responseData = {
            invoiceId: invoice.id,
            checkoutURL: invoice.checkoutLink,
            expiresAt: invoice.expirationTime,
            status: invoice.status
        };

        let onchainNotAvailable = false;
        
        if (paymentMethods && paymentMethods.length > 0) {
            const hasOnlyLightning = paymentMethods.every(m => m.paymentMethod === 'BTC-LightningNetwork');
            const hasOnchain = paymentMethods.some(m => m.paymentMethod === 'BTC-Onchain');
            
            if (paymentMethod === 'onchain' && hasOnlyLightning && !hasOnchain) {
                console.log('⚠️ On-chain requested but only Lightning available');
                onchainNotAvailable = true;
            }
            
            for (const method of paymentMethods) {
                if (method.paymentMethod === 'BTC-LightningNetwork' && method.destination) {
                    if (paymentMethod === 'lightning') {
                        responseData.lightningInvoice = method.destination;
                    } else if (paymentMethod === 'onchain' && onchainNotAvailable) {
                        responseData.lightningInvoice = method.destination;
                        responseData.fallbackToLightning = true;
                    }
                } else if (method.paymentMethod === 'BTC-Onchain' && method.destination) {
                    responseData.address = method.destination;
                    responseData.btcAmount = method.amount || method.cryptoAmount || '0.00000000';
                }
            }
        }

        if (onchainNotAvailable) {
            responseData.useCheckoutLink = true;
            responseData.onchainNotAvailable = true;
            responseData.message = 'On-chain payments not available. Use checkout page or try Lightning.';
        } else if (!responseData.lightningInvoice && !responseData.address) {
            responseData.useCheckoutLink = true;
            responseData.message = 'Payment details not available. Use checkout page.';
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error creating invoice:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create invoice',
            details: error.response?.data || error.message
        });
    }
}