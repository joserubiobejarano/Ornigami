import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("Missing credentials. Please set the 'STRIPE_SECRET_KEY' environment variable.");
    }
    stripeClient = new Stripe(apiKey, {
      apiVersion: "2025-10-29.clover",
    });
  }
  return stripeClient;
}

// Lazy initialization proxy - only creates Stripe client when actually accessed at runtime
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe();
    const value = Reflect.get(client, prop);
    // Bind functions to the client, return other values as-is
    if (typeof value === "function") {
      return value.bind(client);
    }
    // For nested objects (like customers, checkout, etc.), return them directly
    // Their methods will work because they're already bound to the client
    return value;
  },
});

