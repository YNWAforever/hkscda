import process from "node:process";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function getSupabaseServerConfig() {
  return {
    url: process.env.SUPABASE_URL ?? required("VITE_SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    receiptBucket: process.env.SUPABASE_RECEIPT_BUCKET ?? "receipts",
  };
}

export function getStripeConfig() {
  return {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  };
}

export function getPayPalConfig() {
  return {
    clientId: required("PAYPAL_CLIENT_ID"),
    clientSecret: required("PAYPAL_CLIENT_SECRET"),
    apiBase: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
    webhookId: process.env.PAYPAL_WEBHOOK_ID,
  };
}

export function getEmailConfig() {
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.DONATION_EMAIL_FROM ?? "HKSCDA <noreply@hkscda.com>",
    replyTo: process.env.DONATION_REPLY_TO ?? "info@hkscda.com",
    notificationEmail: process.env.NOTIFICATION_EMAIL ?? "info@hkscda.com",
  };
}

export function getReceiptConfig() {
  return {
    charityName: process.env.RECEIPT_CHARITY_NAME ?? "香港拯救貓狗協會有限公司",
    fileNo: process.env.RECEIPT_FILE_NO ?? "91/14493",
    signatoryName: process.env.RECEIPT_SIGNATORY_NAME ?? "HKSCDA",
  };
}
