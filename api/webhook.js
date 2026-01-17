export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const event = req.body;

    console.log('Webhook received:', {
      type: event.type,
      invoiceId: event.invoiceId,
      status: event.status
    });

    switch (event.type) {
      case 'invoice.paid':
        console.log(`✅ Invoice ${event.invoiceId} paid`);
        break;
      case 'invoice.expired':
        console.log(`⏰ Invoice ${event.invoiceId} expired`);
        break;
      case 'invoice.processing':
        console.log(`⏳ Invoice ${event.invoiceId} processing`);
        break;
      default:
        console.log(`Unknown event: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}
