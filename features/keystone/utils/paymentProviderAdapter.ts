import { paymentProviderAdapters } from "../../integrations/payment";

// Hardened dispatcher (same contract as Openfront Restaurant): adapter keys resolve only
// through the finite registry, external adapters get a bounded, redirect-free POST, and
// the provider record is projected so adapters never receive unrelated fields.
const ADAPTER_OPERATIONS = new Set([
  "createPaymentFunction",
  "capturePaymentFunction",
  "refundPaymentFunction",
  "getPaymentStatusFunction",
  "generatePaymentLinkFunction",
  "handleWebhookFunction",
  "cancelPaymentFunction",
]);
const FORWARDED_HEADERS = (key: string) => {
  const k = key.toLowerCase();
  return k === "stripe-signature" || k === "__rawbody" || k.startsWith("paypal-");
};

export function paymentAdapterPayload(provider: Record<string, any>, args: Record<string, unknown>) {
  const projectedProvider = { id: provider.id, code: provider.code, credentials: provider.credentials || {}, metadata: provider.metadata || {} };
  const input: Record<string, unknown> = { ...args };
  if (input.headers && typeof input.headers === "object") {
    input.headers = Object.fromEntries(Object.entries(input.headers as Record<string, unknown>).filter(([key]) => FORWARDED_HEADERS(key)));
  }
  return { ...input, provider: projectedProvider };
}

export async function executeAdapterFunction({ provider, functionName, args }: { provider: Record<string, any>; functionName: string; args: Record<string, unknown> }) {
  if (!ADAPTER_OPERATIONS.has(functionName)) throw new Error("Unknown payment adapter operation");
  const functionPath = provider?.[functionName];
  if (typeof functionPath !== "string" || !functionPath) throw new Error("Payment adapter is not configured");
  const payload = paymentAdapterPayload(provider, args);

  if (/^https:\/\//i.test(functionPath)) {
    try {
      const response = await fetch(functionPath, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return await response.json();
    } catch {
      throw new Error("External payment adapter request failed; reconcile the original attempt before retrying");
    }
  }
  if (/^[a-z]+:/i.test(functionPath)) throw new Error("External payment adapters must use HTTPS");

  const loader = (paymentProviderAdapters as Record<string, () => Promise<any>>)[functionPath];
  if (!loader) throw new Error("Unknown registered payment adapter");
  const adapter = await loader();
  const fn = adapter[functionName];
  if (typeof fn !== "function") throw new Error(`Function ${functionName} not found in adapter ${functionPath}`);
  try {
    return await fn(payload);
  } catch (error) {
    throw new Error(
      `Error executing ${functionName} for provider ${functionPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Helper functions for common payment operations
type PaymentOperationArgs = {
  provider: Record<string, any>;
  paymentId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
};

export async function createPayment({ provider, cart, amount, currency }: {
  provider: Record<string, any>;
  cart: Record<string, any>;
  amount: number;
  currency: string;
}) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, amount, currency },
  });
}

export async function capturePayment({ provider, paymentId, amount, currency, idempotencyKey }: PaymentOperationArgs) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount, currency, idempotencyKey },
  });
}

export async function refundPayment({ provider, paymentId, amount, currency, idempotencyKey }: PaymentOperationArgs) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, idempotencyKey },
  });
}

export async function getPaymentStatus({ provider, paymentId }: { provider: Record<string, any>; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId },
  });
}

export async function generatePaymentLink({ provider, paymentId }: { provider: Record<string, any>; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "generatePaymentLinkFunction",
    args: { paymentId },
  });
}

export async function handleWebhook({ provider, event, headers }: { provider: Record<string, any>; event: unknown; headers: Record<string, string> }) {
  return executeAdapterFunction({
    provider,
    functionName: "handleWebhookFunction",
    args: { event, headers },
  });
}
