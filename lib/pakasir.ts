import QRCode from 'qrcode';

export const PAKASIR_CONFIG = {
  projectSlug: process.env.PAKASIR_PROJECT_SLUG || 'aldo-kasirflow',
  apiKey: process.env.PAKASIR_API_KEY || 'ONlCX2J53bHn0KE3oQrtEaTomZcQAHZF',
  baseUrl: 'https://app.pakasir.com',
};

export interface PakasirQrisResponse {
  txn_id: string;
  project: string;
  order_id: string;
  amount: number;
  fee: number;
  total_payment: number;
  payment_method: string;
  qr_string: string;
  qr_data_url?: string;
  expires_at: string;
  is_sandbox: boolean;
}

export interface PakasirStatusResponse {
  txn_id: string;
  order_id: string;
  amount: number;
  is_sandbox: boolean;
  status: 'pending' | 'completed' | 'expired' | 'failed' | string;
  completed_at: string | null;
}

/**
 * Creates or retrieves an existing transaction (Idempotent: "Find or Create").
 * Repeated calls with the same orderId will return the exact same transaction.
 */
export async function createPakasirTransaction(
  orderId: string,
  amount: number,
  method: 'qris' = 'qris'
): Promise<PakasirQrisResponse> {
  const url = `${PAKASIR_CONFIG.baseUrl}/api/v2/create-transaction/${PAKASIR_CONFIG.projectSlug}/${encodeURIComponent(orderId)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': PAKASIR_CONFIG.apiKey,
      'User-Agent': 'KasirFlow-POS/1.0 (Aldo-KasirFlow; NextJS)',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      method,
      amount: Math.round(amount),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pakasir API error (${res.status}): ${errorText || res.statusText}`);
  }

  const data: PakasirQrisResponse = await res.json();

  // Generate high-resolution QR code data URL
  if (data.qr_string) {
    try {
      data.qr_data_url = await QRCode.toDataURL(data.qr_string, {
        width: 380,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch (qrErr) {
      console.warn('Failed to generate local QR code data URL:', qrErr);
    }
  }

  return data;
}

/**
 * Checks the live status of a Pakasir transaction by its txn_id.
 */
export async function checkPakasirStatus(txnId: string): Promise<PakasirStatusResponse> {
  const url = `${PAKASIR_CONFIG.baseUrl}/api/v2/transaction-status/${PAKASIR_CONFIG.projectSlug}/${encodeURIComponent(txnId)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Api-Key': PAKASIR_CONFIG.apiKey,
      'User-Agent': 'KasirFlow-POS/1.0 (Aldo-KasirFlow; NextJS)',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pakasir status check error (${res.status}): ${errorText || res.statusText}`);
  }

  return (await res.json()) as PakasirStatusResponse;
}

/**
 * Simulates a successful payment in Sandbox mode for testing.
 */
export async function simulatePakasirPayment(orderId: string, amount: number): Promise<{ success: boolean }> {
  const url = `${PAKASIR_CONFIG.baseUrl}/api/paymentsimulation`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'KasirFlow-POS/1.0 (Aldo-KasirFlow; NextJS)',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      project: PAKASIR_CONFIG.projectSlug,
      order_id: orderId,
      amount: Math.round(amount),
      api_key: PAKASIR_CONFIG.apiKey,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pakasir payment simulation error (${res.status}): ${errorText || res.statusText}`);
  }

  return (await res.json()) as { success: boolean };
}
