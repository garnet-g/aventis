import type { OrderStatus } from '@/lib/orders';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Paid',
  at_printer: 'At printer',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

export const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
