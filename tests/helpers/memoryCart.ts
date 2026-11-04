import type { CartItem, CartStore } from '@/lib/cart';

export class MemoryCartStore implements CartStore {
  items = new Map<string, CartItem[]>();

  private mine(userId: string) {
    if (!this.items.has(userId)) this.items.set(userId, []);
    return this.items.get(userId)!;
  }

  async list(userId: string) {
    return this.mine(userId).map((i) => ({ ...i }));
  }

  async add(userId: string, designId: string, quantity: number) {
    const list = this.mine(userId);
    if (!list.some((i) => i.designId === designId)) list.push({ designId, quantity });
  }

  async setQuantity(userId: string, designId: string, quantity: number) {
    const item = this.mine(userId).find((i) => i.designId === designId);
    if (!item) return false;
    item.quantity = quantity;
    return true;
  }

  async remove(userId: string, designId: string) {
    this.items.set(userId, this.mine(userId).filter((i) => i.designId !== designId));
  }

  async clear(userId: string) {
    this.items.set(userId, []);
  }
}
