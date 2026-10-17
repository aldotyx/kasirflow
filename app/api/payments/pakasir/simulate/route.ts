import { NextRequest, NextResponse } from 'next/server';
import { simulatePakasirPayment } from '@/lib/pakasir';

// POST: Simulate payment in Sandbox mode for testing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount } = body;

    if (!orderId || !amount) {
      return NextResponse.json({ error: 'orderId dan amount wajib disertakan' }, { status: 400 });
    }

    const result = await simulatePakasirPayment(orderId, amount);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Failed to simulate payment:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal simulasi pembayaran' },
      { status: 500 }
    );
  }
}
