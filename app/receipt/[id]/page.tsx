import ReceiptClient from './receipt-client';

export function generateStaticParams() {
  return [{ id: 'preview' }];
}

export default function ReceiptPrintPage({ params }: { params: { id: string } }) {
  return <ReceiptClient id={params?.id} />;
}
