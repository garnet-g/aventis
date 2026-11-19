import { describe, expect, test } from 'vitest';
import type { DesignLayer } from '@/lib/designLayers';
import { layersHash } from '@/lib/designs';
import { rehomeDesign } from '@/lib/guestClaim';

const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
const image = (path: string): DesignLayer => ({ kind: 'image', uploadPath: path, rect, rotation: 0 });
const text: DesignLayer = { kind: 'text', text: 'Crew', font: 'sans', fill: '#111111', direction: 'ltr', fontSize: 0.1, rect, rotation: 0 };

describe("moving a guest's design into their account", () => {
  test('pictures point at the account folder, and an approved design stays approved', () => {
    const layers = [image('guest-1/d1/a.png'), text];
    const backLayers = [image('guest-1/d1/b.jpg')];
    const moved = rehomeDesign({ layers, backLayers, moderatedHash: layersHash(layers, backLayers) }, 'guest-1', 'user-9');
    expect(moved.layers[0]).toMatchObject({ uploadPath: 'user-9/d1/a.png' });
    expect(moved.layers[1]).toEqual(text);
    expect(moved.backLayers[0]).toMatchObject({ uploadPath: 'user-9/d1/b.jpg' });
    expect(moved.moderatedHash).toBe(layersHash(moved.layers, moved.backLayers));
  });

  test('a design that was not checked (or changed since) is not made to look checked', () => {
    const layers = [image('guest-1/d1/a.png')];
    expect(rehomeDesign({ layers, backLayers: [], moderatedHash: null }, 'guest-1', 'user-9').moderatedHash).toBeNull();
    const stale = rehomeDesign({ layers, backLayers: [], moderatedHash: 'old' }, 'guest-1', 'user-9');
    expect(stale.moderatedHash).toBe('old');
    expect(stale.moderatedHash).not.toBe(layersHash(stale.layers, []));
  });
});
