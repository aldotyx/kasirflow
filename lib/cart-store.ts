'use client';
import { create } from 'zustand';
import type { Product } from '@/types/database';

export interface CartItem {
  product: Product;
  quantity: number;
}

const getUnitPrice = (product?: Partial<Product> | null) => {
  if (!product) return 0;
  const sellPrice = Number(product.sell_price || 0);
  const discount = Math.min(100, Math.max(0, Number(product.discount_percent || 0)));
  return sellPrice * (1 - discount / 100);
};

interface CartState {
  items: CartItem[];
  paymentMethod: 'CASH' | 'QRIS' | 'TRANSFER' | 'DEBIT' | 'CREDIT';
  paidAmount: number;
  activeDraftId: string | null;
  activeDraftName: string | null;
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setPaymentMethod: (method: CartState['paymentMethod']) => void;
  setPaidAmount: (amount: number) => void;
  setItems: (items: CartItem[]) => void;
  setActiveDraft: (id: string | null, name?: string | null) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalHpp: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  paymentMethod: 'CASH',
  paidAmount: 0,
  activeDraftId: null,
  activeDraftName: null,
  addItem: (product) =>
    set((state) => {
      if (!product || !product.id) return state;
      const existing = state.items.find((item) => item.product?.id === product.id);
      const stock = typeof product.stock === 'number' ? product.stock : 999;
      if (existing) {
        if (existing.quantity >= stock) return state;
        return {
          items: state.items.map((item) =>
            item.product?.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          ),
        };
      }
      return { items: [...state.items, { product, quantity: 1 }] };
    }),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((item) => item.product?.id !== productId) })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.product?.id === productId) {
          const maxStock = typeof item.product.stock === 'number' ? item.product.stock : 999;
          return { ...item, quantity: Math.max(1, Math.min(quantity, maxStock)) };
        }
        return item;
      }),
    })),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setPaidAmount: (amount) => set({ paidAmount: amount }),
  setItems: (items) => set({ items: Array.isArray(items) ? items : [] }),
  setActiveDraft: (id, name = null) => set({ activeDraftId: id, activeDraftName: name }),
  clearCart: () =>
    set({ items: [], paymentMethod: 'CASH', paidAmount: 0, activeDraftId: null, activeDraftName: null }),
  getSubtotal: () =>
    get().items.reduce((sum, item) => {
      if (!item || !item.product) return sum;
      return sum + getUnitPrice(item.product) * (Number(item.quantity) || 1);
    }, 0),
  getTotalHpp: () =>
    get().items.reduce((sum, item) => {
      if (!item || !item.product) return sum;
      return sum + Number(item.product.buy_price || 0) * (Number(item.quantity) || 1);
    }, 0),
}));
