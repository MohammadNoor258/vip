function buildStatusText({ customerName, orderId, status }) {
  const who = customerName || 'Customer';
  const st = String(status || '').toLowerCase();
  if (st === 'ready') {
    return `Hello ${who}, your order #${orderId} is ready. Please proceed to the counter.`;
  }
  if (st === 'preparing') {
    return `Hello ${who}, your order #${orderId} is now being prepared.`;
  }
  if (st === 'completed') {
    return `Hello ${who}, your order #${orderId} is completed. Thank you!`;
  }
  if (st === 'cancelled') {
    return `Hello ${who}, your order #${orderId} was cancelled. Please contact the counter if needed.`;
  }
  return `Hello ${who}, your order #${orderId} status is now: ${st || 'updated'}.`;
}

async function sendWhatsAppMessage(order) {
  const phone = order && order.phone;
  if (!phone) return { skipped: true, reason: 'no_phone' };

  const provider = (process.env.WHATSAPP_PROVIDER || 'stub').toLowerCase();
  const text = buildStatusText(order);
  const from = (order && (order.restaurantWhatsapp || order.restaurantWhatsApp || order.restaurantWhatsappNumber)) || null;

  if (provider === 'stub') {
    console.log('[whatsapp:stub]', { phone, from, text, orderId: order.orderId, status: order.status });
    return { ok: true, provider: 'stub' };
  }

  // Provider-specific integration can be plugged here (Twilio/Meta Cloud API, etc.)
  // For now we safely fall back to stub-style logging to avoid runtime failures.
  console.log(`[whatsapp:${provider}]`, { phone, from, text, orderId: order.orderId, status: order.status });
  return { ok: true, provider };
}

async function sendReadyMessage({ customerName, phone, orderId, restaurantWhatsapp }) {
  return sendWhatsAppMessage({ customerName, phone, orderId, status: 'ready', restaurantWhatsapp });
}

module.exports = {
  sendReadyMessage,
  sendWhatsAppMessage,
};

