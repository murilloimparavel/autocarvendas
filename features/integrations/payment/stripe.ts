import Stripe from "stripe";

type CreatePaymentInput = {
  amount: number;
  currency: string;
  description?: string;
  metadata: { openfront_transaction_id: string };
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
  customerEmail?: string;
};

type PaymentOperationInput = {
  paymentId: string;
  amount?: number;
  idempotencyKey?: string;
  currency?: string;
  metadata?: Record<string, string>;
};

type PaymentWebhookInput = {
  event: any;
  headers: Record<string, string> & { __rawBody?: string };
};

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Stripe secret key not configured");
  }
  return new Stripe(stripeKey);
};

export async function createPaymentFunction({ amount, currency, description, metadata, successUrl, cancelUrl, idempotencyKey, customerEmail }: CreatePaymentInput) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amount,
          product_data: { name: description || "Payment" },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    // Prefill the email we already have so the buyer is not asked for it again.
    ...(customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ? { customer_email: customerEmail } : {}),
  }, idempotencyKey ? { idempotencyKey } : undefined);

  if (!session.id || !session.url) {
    throw new Error("Stripe returned an incomplete checkout session");
  }

  return {
    providerSessionId: session.id,
    checkoutUrl: session.url,
    providerTransactionId: typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id,
  };
}

export async function capturePaymentFunction({ paymentId, amount, idempotencyKey }: PaymentOperationInput) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(
    paymentId,
    { ...(amount ? { amount_to_capture: amount } : {}) },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey, metadata }: PaymentOperationInput) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create({
    payment_intent: paymentId,
    ...(amount ? { amount } : {}),
    reason: "requested_by_customer",
    ...(metadata ? { metadata } : {}),
  }, idempotencyKey ? { idempotencyKey } : undefined);

  return {
    providerRefundId: refund.id,
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: PaymentOperationInput) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received || paymentIntent.amount,
    currency: paymentIntent.currency,
    data: paymentIntent,
  };
}

export async function generatePaymentLinkFunction({ paymentId }: PaymentOperationInput) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}

export async function handleWebhookFunction({ event, headers }: PaymentWebhookInput) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const stripe = getStripeClient();

  try {
    if (!headers.__rawBody) throw new Error('Raw webhook body is required');
    const stripeEvent = stripe.webhooks.constructEvent(
      headers.__rawBody,
      headers['stripe-signature'],
      webhookSecret
    );

    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object,
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
