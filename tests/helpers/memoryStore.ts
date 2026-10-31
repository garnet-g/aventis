import { randomUUID } from 'node:crypto';
import type { Design, DesignStore } from '@/lib/designs';

export class MemoryDesignStore implements DesignStore {
  designs = new Map<string, Design>();
  files = new Map<string, Buffer>();
  ordered = new Set<string>(); // design ids that have an order

  async hasOrder(id: string) {
    return this.ordered.has(id);
  }

  async get(id: string) {
    return this.designs.get(id) ?? null;
  }

  async insert(userId: string, input: Pick<Design, 'product' | 'color' | 'size' | 'layers'>) {
    const d: Design = { id: randomUUID(), userId, status: 'draft', rejectReason: null, moderatedHash: null, version: '0', ...input };
    this.designs.set(d.id, d);
    return d;
  }

  async update(id: string, patch: Partial<Omit<Design, 'id' | 'userId' | 'version'>>) {
    const cur = this.designs.get(id)!;
    const d = { ...cur, ...patch, version: String(Number(cur.version) + 1) };
    this.designs.set(id, d);
    return d;
  }

  async updateIfVersion(id: string, version: string, patch: Partial<Omit<Design, 'id' | 'userId' | 'version'>>) {
    if (this.designs.get(id)?.version !== version) return null;
    return this.update(id, patch);
  }

  async downloadUpload(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`missing file ${path}`);
    return f;
  }
}
