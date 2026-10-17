import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import fs from 'fs';
import path from 'path';

const ORDERS_FILE_PATH = path.join('/tmp', 'kasirflow_table_orders.json');

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('Received Pakasir Webhook:', payload);

    const { order_id, status, amount, payment_method } = payload;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id missing' }, { status: 400 });
    }

    if (status === 'completed') {
      const now = new Date().toISOString();

      // 1. Update Supabase table_orders
      try {
        await supabase
          .from('table_orders')
          .update({
            payment_status: 'PAID',
            status: 'PREPARING',
            updated_at: now,
          })
          .eq('id', order_id);
      } catch (dbErr) {
        console.warn('Could not update table_orders in Supabase:', dbErr);
      }

      // 2. Update local fallback orders file
      try {
        if (fs.existsSync(ORDERS_FILE_PATH)) {
          const raw = fs.readFileSync(ORDERS_FILE_PATH, 'utf-8');
          const orders = JSON.parse(raw);
          const updated = orders.map((o: any) => {
            if (o.id === order_id) {
              return {
                ...o,
                paymentStatus: 'PAID',
                status: o.status === 'PENDING' ? 'PREPARING' : o.status,
                updatedAt: now,
              };
            }
            return o;
          });
          fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
        }
      } catch (fsErr) {
        console.warn('Could not update local orders file:', fsErr);
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error?.message || 'Webhook failed' }, { status: 500 });
  }
}
