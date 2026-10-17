'use client';

import { create } from 'zustand';
import type { Product } from '@/types/database';

export interface CartItem { product: Product; quantity: number; }

const getUnitPrice = (product: Product) => {
  const discount = Math.min(100, Math.max(0, Number(product.discount_percent || 0)));
  return Number(product.sell_price) * (1 - discount / 100);
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
  addItem: (product) => set((state) => {
    const existing = state.items.find((item) => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) return state;
      return { items: state.items.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) };
    }
    return product.stock > 0 ? { items: [...state.items, { product, quantity: 1 }] } : state;
  }),
  removeItem: (productId) => set((state) => ({ items: state.items.filter((item) => item.product.id !== productId) })),
  updateQuantity: (productId, quantity) => set((state) => ({ items: state.items.map((item) => item.product.id === productId ? { ...item, quantity: Math.max(1, Math.min(quantity, item.product.stock)) } : item) })),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setPaidAmount: (amount) => set({ paidAmount: amount }),
  setItems: (items) => set({ items }),
  setActiveDraft: (id, name = null) => set({ activeDraftId: id, activeDraftName: name }),
  clearCart: () => set({ items: [], paymentMethod: 'CASH', paidAmount: 0, activeDraftId: null, activeDraftName: null }),
  getSubtotal: () => get().items.reduce((sum, item) => sum + getUnitPrice(item.product) * item.quantity, 0),
  getTotalHpp: () => get().items.reduce((sum, item) => sum + Number(item.product.buy_price) * item.quantity, 0),
}));
