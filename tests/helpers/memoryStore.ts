import { randomUUID } from 'node:crypto';
import type { Design, DesignStore } from '@/lib/designs';

export class MemoryDesignStore implements DesignStore {
  designs = new Map<string, Design>();
  files = new Map<string, Buffer>();

  async get(id: string) {
    return this.designs.get(id) ?? null;
  }

  async insert(userId: string, input: Pick<Design, 'product' | 'color' | 'size' | 'layers'>) {
    const d: Design = { id: randomUUID(), userId, status: 'draft', rejectReason: null, moderatedHash: null, ...input };
    this.designs.set(d.id, d);
    return d;
  }

  async update(id: string, patch: Partial<Omit<Design, 'id' | 'userId'>>) {
    const d = { ...this.designs.get(id)!, ...patch };
    this.designs.set(id, d);
    return d;
  }

  async downloadUpload(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`missing file ${path}`);
    return f;
  }
}
