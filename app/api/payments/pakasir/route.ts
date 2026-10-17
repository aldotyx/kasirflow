import { NextRequest, NextResponse } from 'next/server';
import { createPakasirTransaction, checkPakasirStatus } from '@/lib/pakasir';

// POST: Create dynamic QRIS transaction (Idempotent: safe to call repeatedly with same orderId)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, method = 'qris' } = body;

    if (!orderId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'orderId dan amount (nominal > 0) wajib disertakan' },
        { status: 400 }
      );
    }

    const transaction = await createPakasirTransaction(orderId, amount, method);

    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error: any) {
    console.error('Failed to create Pakasir transaction:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal membuat transaksi Pakasir' },
      { status: 500 }
    );
  }
}

// GET: Check transaction status by txnId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txnId = searchParams.get('txnId');

    if (!txnId) {
      return NextResponse.json({ error: 'Parameter txnId wajib disertakan' }, { status: 400 });
    }

    const statusData = await checkPakasirStatus(txnId);

    return NextResponse.json({
      success: true,
      status: statusData,
    });
  } catch (error: any) {
    console.error('Failed to check Pakasir transaction status:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal memeriksa status transaksi' },
      { status: 500 }
    );
  }
}
