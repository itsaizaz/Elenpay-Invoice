# ⚡ Elenpay Payment Gateway - Lightning & On-Chain Bitcoin

A modern, custom-designed payment gateway for Bitcoin payments using Elenpay API. Supports both Lightning Network (instant, low-fee) and on-chain Bitcoin transactions with a beautiful, animated user interface.

## ✨ Features

- **Dual Payment Methods**: Lightning Network and Bitcoin on-chain
- **Modern UI Design**: Beautiful, animated interface with gradient backgrounds
- **QR Code Generation**: Automatic QR codes for easy mobile payments
- **Real-time Status**: Live payment status checking
- **Responsive Design**: Works perfectly on desktop and mobile
- **Copy to Clipboard**: Easy copying of invoices and addresses
- **Webhook Support**: Backend notifications for payment events
- **Production Ready**: Error handling, security, and best practices

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Elenpay account with API access
- npm or yarn

### Installation

1. **Clone or download this repository**

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and add your Elenpay credentials:
```env
ELENPAY_API_URL=https://api.staging.elenpay.tech
ELENPAY_API_TOKEN=your_api_token_here
ELENPAY_STORE_ID=your_store_id_here
PORT=3000
```

**Getting Elenpay Credentials:**
- Contact Elenpay support at [email protected]
- Complete KYC verification
- Access your Store ID and API Token from the Elenpay backoffice

4. **Create public directory and move index.html**
```bash
mkdir public
mv index.html public/
```

5. **Start the server**

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

6. **Open your browser**
```
http://localhost:3000
```

## 📁 Project Structure

```
elenpay-payment-gateway/
├── server.js              # Express server with Elenpay API integration
├── public/
│   └── index.html        # Frontend payment interface
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (not in git)
├── .env.example          # Environment template
└── README.md            # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ELENPAY_API_URL` | Elenpay API endpoint | Yes |
| `ELENPAY_API_TOKEN` | Your API authentication token | Yes |
| `ELENPAY_STORE_ID` | Your Elenpay store identifier | Yes |
| `PORT` | Server port (default: 3000) | No |

### API Endpoints

The server exposes these endpoints:

- **POST /api/create-invoice** - Create a new payment invoice
- **GET /api/check-status/:invoiceId** - Check payment status
- **POST /api/webhook** - Receive payment notifications from Elenpay
- **GET /success** - Payment success page
- **GET /api/health** - Health check endpoint

## 💡 Usage

### Creating an Invoice

```javascript
const response = await fetch('/api/create-invoice', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        amount: 10,
        currency: 'USD',
        description: 'Product Name',
        paymentMethod: 'lightning' // or 'onchain'
    })
});

const data = await response.json();
console.log(data.invoiceId); // Use this to check status
```

### Checking Payment Status

```javascript
const response = await fetch(`/api/check-status/${invoiceId}`);
const data = await response.json();
console.log(data.status); // 'pending', 'paid', 'expired', etc.
```

## 🎨 Customization

### Changing Colors

Edit the CSS variables in `public/index.html`:

```css
:root {
    --btc-orange: #f7931a;        /* Bitcoin orange */
    --lightning-purple: #9146ff;   /* Lightning purple */
    --dark-bg: #0a0e1a;           /* Background */
    --card-bg: #141829;           /* Card background */
    /* ... more variables ... */
}
```

### Modifying Product Information

Update the HTML in `public/index.html`:

```html
<div class="product-name">
    <strong>Product:</strong> <span id="productName">Your Product Name</span>
</div>
<div class="product-price" id="productPrice">$99.00</div>
```

### Adding Your Logo

Add your logo to the header:

```html
<div class="header">
    <img src="/logo.png" alt="Logo" style="height: 60px; margin-bottom: 20px;">
    <h1>⚡ Bitcoin Payment</h1>
</div>
```

## 🔔 Webhooks

Configure webhooks in your Elenpay dashboard to point to:

```
https://yourdomain.com/api/webhook
```

The webhook handler in `server.js` processes these events:
- `invoice.paid` - Payment received
- `invoice.expired` - Invoice expired
- `invoice.processing` - Payment being confirmed

Add your business logic in the webhook handler:

```javascript
case 'invoice.paid':
    console.log(`Invoice ${event.invoiceId} paid!`);
    // Send confirmation email
    // Update database
    // Fulfill order
    break;
```

## 🚢 Deployment

### Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variables in Vercel dashboard

### Heroku

1. Create `Procfile`:
```
web: node server.js
```

2. Deploy:
```bash
heroku create your-app-name
git push heroku main
heroku config:set ELENPAY_API_TOKEN=your_token
heroku config:set ELENPAY_STORE_ID=your_store_id
```

### Docker

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t elenpay-gateway .
docker run -p 3000:3000 --env-file .env elenpay-gateway
```

## 🔒 Security Best Practices

1. **Never commit `.env` file** - Add it to `.gitignore`
2. **Use HTTPS in production** - Required for secure payments
3. **Validate webhook signatures** - Verify requests are from Elenpay
4. **Rate limiting** - Add rate limiting to API endpoints
5. **Input validation** - Validate all user inputs
6. **CORS configuration** - Restrict allowed origins in production

## 🐛 Troubleshooting

### "Missing required environment variables"
- Ensure `.env` file exists and contains all required variables
- Check variable names match exactly

### Invoice creation fails
- Verify your API token is valid
- Check you're using the correct API URL (staging vs production)
- Ensure your store ID is correct

### QR codes not displaying
- Check browser console for errors
- Ensure QRCode library is loaded
- Verify invoice/address data is present

### Payment status not updating
- Check webhook URL is configured correctly
- Verify webhook endpoint is publicly accessible
- Review server logs for webhook errors

## 📚 Resources

- [Elenpay Documentation](https://docs.elenpay.tech)
- [Elenpay Support](mailto:[email protected])
- [Lightning Network Basics](https://lightning.network/)
- [Bitcoin Payment URI Scheme](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this code for your projects!

## 🙏 Acknowledgments

- Built with [Elenpay API](https://elenpay.tech)
- QR codes powered by [QRCode.js](https://davidshimjs.github.io/qrcodejs/)
- Icons from Unicode emoji
- Design inspiration from modern fintech apps

## 💬 Support

For issues related to:
- **This code**: Open an issue on GitHub
- **Elenpay API**: Contact [email protected]
- **Bitcoin/Lightning**: Consult community resources

---

Made with ⚡ and ₿ | Happy accepting Bitcoin payments!