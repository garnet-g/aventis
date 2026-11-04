'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage, Textbox, type FabricObject } from 'fabric';
import { catalog, printAreaFor, type Color, type ProductId, type Side } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { CANVAS_H, CANVAS_W, detectDirection, fromFraction, printAreaRect, toFraction } from '@/lib/editorGeometry';
import { FONTS, normalizeFont, resolveFont, type FontKey } from '@/lib/fonts';
import { clampToPrintArea } from '@/lib/printArea';
import type { Rect } from '@/lib/printArea';
import { printQuality, type PrintQuality } from '@/lib/quality';

/** Selection handles in the Printly palette, large enough for a finger. */
const HANDLES = {
  borderColor: '#e5412a',
  cornerColor: '#ffffff',
  cornerStrokeColor: '#16120f',
  transparentCorners: false,
  cornerSize: 12,
  touchCornerSize: 30,
  borderScaleFactor: 2,
} as const;

/** Text starts in the ink that shows up on the chosen garment. */
export const DEFAULT_TEXT_FILL: Record<Color, string> = { white: '#16120f', black: '#ffffff' };
export const MIN_TEXT_SIZE = 14;
export const MAX_TEXT_SIZE = 90;
const MAX_TEXT_LENGTH = 60;
const HISTORY_LIMIT = 60;
const BASE_FONT_SIZE = 26;

type Meta = { kind: 'image'; uploadPath: string } | { kind: 'text'; font: FontKey };

/** What is currently selected on the canvas, so the page can show the right tools. */
export type Selection =
  | { kind: 'image'; quality: PrintQuality }
  | { kind: 'text'; text: string; font: FontKey; fill: string; size: number; direction: 'ltr' | 'rtl' }
  | null;

export type TextPatch = { text?: string; font?: FontKey; fill?: string; size?: number };
export type HistoryState = { canUndo: boolean; canRedo: boolean };

export type EditorHandle = {
  /** Draws a saved design (both sides) onto the editor; `urls` maps each uploaded image's path to a loadable link. */
  loadDesign(design: { front: DesignLayer[]; back: DesignLayer[]; urls: Record<string, string> }): Promise<void>;
  addImage(url: string, uploadPath: string): Promise<void>;
  addText(text: string): Promise<void>;
  /** The selected picture's link and stored path, or null when no picture is selected. */
  selectedImage(): { url: string; uploadPath: string } | null;
  /** Swaps the selected picture for an edited version (cropped, background removed) at the same place and pixel scale. */
  replaceSelectedImage(url: string, uploadPath: string, crop?: Rect): Promise<void>;
  updateSelectedText(patch: TextPatch, opts?: { coalesce?: boolean }): Promise<void>;
  removeSelected(): void;
  duplicateSelected(): Promise<void>;
  bringToFront(): void;
  sendToBack(): void;
  flipSelected(axis: 'x' | 'y'): void;
  rotateSelected(degrees: number): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
};

type Props = {
  product: ProductId;
  color: Color;
  /** Which side of the garment is being designed. Each side keeps its own layers and undo history. */
  side?: Side;
  /** Called with the layers of the side that changed. */
  onChange?: (layers: DesignLayer[], side: Side) => void;
  onSelectionChange?: (selection: Selection) => void;
  onHistoryChange?: (history: HistoryState) => void;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

async function loadFont(key: FontKey, sample: string) {
  const f = FONTS[key];
  await document.fonts.load(`${f.weight} 28px "${f.family}"`, sample).catch(() => undefined);
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { product, color, side = 'front', onChange, onSelectionChange, onHistoryChange },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const sideRef = useRef<Side>(side);
  const areaRef = useRef(printAreaRect(product, side));
  const sidesRef = useRef<Record<Side, DesignLayer[]>>({ front: [], back: [] }); // the side that is NOT on the canvas
  const metaRef = useRef(new WeakMap<FabricObject, Meta>());
  const urlsRef = useRef(new Map<string, string>()); // uploadPath -> browser URL, so undo can redraw images
  const historiesRef = useRef<Record<Side, { stack: string[]; index: number }>>({
    front: { stack: ['[]'], index: 0 },
    back: { stack: ['[]'], index: 0 },
  });
  const hist = () => historiesRef.current[sideRef.current];
  const switchChain = useRef<Promise<void>>(Promise.resolve());
  const restoringRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelectionChange);
  const onHistoryRef = useRef(onHistoryChange);
  const colorRef = useRef(color);
  const productRef = useRef(product);
  onChangeRef.current = onChange;
  onSelectionRef.current = onSelectionChange;
  onHistoryRef.current = onHistoryChange;
  colorRef.current = color;
  productRef.current = product;

  const readLayers = (): DesignLayer[] => {
    const area = areaRef.current;
    return (fabricRef.current?.getObjects() ?? []).flatMap((obj): DesignLayer[] => {
      const meta = metaRef.current.get(obj);
      if (!meta) return [];
      const w = obj.getScaledWidth();
      const h = obj.getScaledHeight();
      const rect = toFraction({ x: (obj.left ?? 0) - w / 2, y: (obj.top ?? 0) - h / 2, width: w, height: h }, area);
      const rotation = obj.angle ?? 0;
      if (meta.kind === 'image') {
        return [{ kind: 'image', uploadPath: meta.uploadPath, rect, rotation, flipX: !!obj.flipX, flipY: !!obj.flipY }];
      }
      const t = obj as Textbox;
      return [
        {
          kind: 'text',
          text: t.text,
          font: meta.font,
          fill: String(t.fill),
          direction: detectDirection(t.text),
          fontSize: ((t.fontSize ?? BASE_FONT_SIZE) * (obj.scaleY ?? 1)) / area.width,
          rect,
          rotation,
        },
      ];
    });
  };

  /** Keeps an object entirely inside the fixed print area (shrinking it if it is too big). */
  const constrain = (obj: FabricObject) => {
    obj.setCoords();
    let b = obj.getBoundingRect();
    const c = clampToPrintArea({ x: b.left, y: b.top, width: b.width, height: b.height }, areaRef.current);
    if (c.width < b.width - 0.01) {
      const k = c.width / b.width;
      obj.scaleX = (obj.scaleX ?? 1) * k;
      obj.scaleY = (obj.scaleY ?? 1) * k;
      obj.setCoords();
      b = obj.getBoundingRect();
    }
    obj.left = (obj.left ?? 0) + (c.x - b.left);
    obj.top = (obj.top ?? 0) + (c.y - b.top);
    obj.setCoords();
  };

  const notifyHistory = () => {
    const { stack, index } = hist();
    onHistoryRef.current?.({ canUndo: index > 0, canRedo: index < stack.length - 1 });
  };

  /** Remembers the current layers as an undo step. `coalesce` replaces the last step (for sliders and typing). */
  const record = (coalesce = false) => {
    if (restoringRef.current) return;
    const h = hist();
    const snap = JSON.stringify(readLayers());
    if (snap === h.stack[h.index]) return;
    if (coalesce && h.index > 0) {
      h.stack[h.index] = snap;
    } else {
      h.stack.splice(h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
      h.index = h.stack.length - 1;
    }
    notifyHistory();
  };

  const emit = (coalesce = false) => {
    if (restoringRef.current) return;
    record(coalesce);
    onChangeRef.current?.(readLayers(), sideRef.current);
  };

  /** Tells the page what is selected and, for an image, how sharp it will print at its current size. */
  const reportSelection = () => {
    const obj = fabricRef.current?.getActiveObject();
    const meta = obj && metaRef.current.get(obj);
    if (!obj || !meta) return onSelectionRef.current?.(null);
    if (meta.kind === 'text') {
      const t = obj as Textbox;
      onSelectionRef.current?.({
        kind: 'text',
        text: t.text,
        font: meta.font,
        fill: String(t.fill),
        size: Math.round((t.fontSize ?? BASE_FONT_SIZE) * (obj.scaleY ?? 1)),
        direction: detectDirection(t.text),
      });
      return;
    }
    const printedWidthCm = (obj.getScaledWidth() / areaRef.current.width) * printAreaFor(productRef.current, sideRef.current).widthCm;
    onSelectionRef.current?.({ kind: 'image', quality: printQuality((obj as FabricImage).width, printedWidthCm) });
  };

  /** Draws one saved layer onto the canvas. Used by undo/redo and duplicate (and later, resuming a saved design). */
  const buildObject = async (layer: DesignLayer): Promise<FabricObject | null> => {
    const area = areaRef.current;
    const box = fromFraction(layer.rect, area);
    const center = { left: box.x + box.width / 2, top: box.y + box.height / 2 };
    if (layer.kind === 'image') {
      const url = urlsRef.current.get(layer.uploadPath);
      if (!url) return null;
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      img.set({
        originX: 'center',
        originY: 'center',
        ...center,
        scaleX: box.width / img.width,
        scaleY: box.height / img.height,
        angle: layer.rotation,
        flipX: !!layer.flipX,
        flipY: !!layer.flipY,
        ...HANDLES,
      });
      metaRef.current.set(img, { kind: 'image', uploadPath: layer.uploadPath });
      return img;
    }
    const key = resolveFont(layer.font, layer.direction).key;
    await loadFont(key, layer.text);
    const t = new Textbox(layer.text, {
      originX: 'center',
      originY: 'center',
      ...center,
      width: box.width,
      fontSize: layer.fontSize * area.width,
      fontFamily: FONTS[key].family,
      fontWeight: FONTS[key].weight,
      fill: layer.fill,
      textAlign: 'center',
      direction: layer.direction,
      angle: layer.rotation,
      ...HANDLES,
    } as ConstructorParameters<typeof Textbox>[1]);
    metaRef.current.set(t, { kind: 'text', font: key });
    return t;
  };

  /** Replaces everything on the canvas with the given layers (an undo/redo step). */
  const restore = async (layers: DesignLayer[]) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    restoringRef.current = true;
    try {
      canvas.discardActiveObject();
      for (const o of [...canvas.getObjects()]) canvas.remove(o);
      for (const layer of layers) {
        const obj = await buildObject(layer);
        if (obj) canvas.add(obj);
      }
      canvas.requestRenderAll();
    } finally {
      restoringRef.current = false;
    }
    onChangeRef.current?.(readLayers(), sideRef.current);
    reportSelection();
    notifyHistory();
  };

  useEffect(() => {
    const canvas = new Canvas(canvasEl.current!, {
      width: CANVAS_W,
      height: CANVAS_H,
      selection: false,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;
    historiesRef.current = { front: { stack: ['[]'], index: 0 }, back: { stack: ['[]'], index: 0 } };
    notifyHistory();

    const guard = (e: { target: FabricObject }) => constrain(e.target);
    canvas.on('object:moving', guard);
    canvas.on('object:scaling', guard);
    canvas.on('object:rotating', guard);
    canvas.on('object:modified', (e) => {
      constrain(e.target);
      emit();
      reportSelection();
    });
    canvas.on('object:scaling', reportSelection);
    canvas.on('object:added', () => emit());
    canvas.on('object:removed', () => {
      emit();
      reportSelection();
    });
    canvas.on('selection:created', reportSelection);
    canvas.on('selection:updated', reportSelection);
    canvas.on('selection:cleared', reportSelection);

    // Phone-first: shrink the canvas display to the available width (drawing coordinates stay 400x500).
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? CANVAS_W;
      const s = Math.min(1, w / CANVAS_W);
      canvas.setDimensions({ width: CANVAS_W * s, height: CANVAS_H * s }, { cssOnly: true });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Draws the garment photo for the current product, color and side behind the design. */
  const paintBackground = async (isCancelled: () => boolean = () => false) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const img = await FabricImage.fromURL(catalog[productRef.current].garmentImage(colorRef.current, sideRef.current));
    if (isCancelled() || fabricRef.current !== canvas) return;
    // Fabric objects default to a centre origin; the background must sit at the canvas's top-left corner.
    img.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
    img.scaleToWidth(CANVAS_W);
    canvas.backgroundImage = img;
    canvas.requestRenderAll();
  };

  /** Puts the other side of the garment on the canvas, keeping what was on this side for when we come back. */
  const switchSide = async (next: Side) => {
    const canvas = fabricRef.current;
    if (!canvas || next === sideRef.current) return;
    sidesRef.current[sideRef.current] = readLayers();
    sideRef.current = next;
    areaRef.current = printAreaRect(productRef.current, next);
    await restore(sidesRef.current[next]);
    await paintBackground();
  };

  // The side prop changed: switch one step at a time, even if the customer taps quickly.
  useEffect(() => {
    switchChain.current = switchChain.current.then(() => switchSide(side)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  // Product or color changed: swap the garment photo and carry layers over proportionally.
  const prevColorRef = useRef(color);
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let cancelled = false;
    const old = areaRef.current;
    const next = printAreaRect(product, sideRef.current);
    if (old.x !== next.x || old.y !== next.y || old.width !== next.width || old.height !== next.height) {
      const k = next.width / old.width;
      for (const obj of canvas.getObjects()) {
        obj.left = next.x + (((obj.left ?? 0) - old.x) / old.width) * next.width;
        obj.top = next.y + (((obj.top ?? 0) - old.y) / old.height) * next.height;
        obj.scaleX = (obj.scaleX ?? 1) * k;
        obj.scaleY = (obj.scaleY ?? 1) * k;
      }
      areaRef.current = next;
      canvas.getObjects().forEach(constrain);
      emit();
    }
    // Text still in the default ink would vanish on the other garment color, so it follows the garment.
    if (prevColorRef.current !== color) {
      const from = DEFAULT_TEXT_FILL[prevColorRef.current];
      let changed = false;
      for (const obj of canvas.getObjects()) {
        if (metaRef.current.get(obj)?.kind === 'text' && String(obj.fill) === from) {
          obj.set({ fill: DEFAULT_TEXT_FILL[color] });
          changed = true;
        }
      }
      prevColorRef.current = color;
      if (changed) {
        canvas.requestRenderAll();
        emit();
        reportSelection();
      }
    }
    void paintBackground(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, color]);

  const activeOf = (kind?: 'image' | 'text') => {
    const obj = fabricRef.current?.getActiveObject();
    const meta = obj && metaRef.current.get(obj);
    return obj && meta && (!kind || meta.kind === kind) ? { obj, meta } : null;
  };

  const step = async (dir: -1 | 1) => {
    const h = hist();
    const target = h.index + dir;
    if (restoringRef.current || target < 0 || target >= h.stack.length) return;
    h.index = target;
    await restore(JSON.parse(h.stack[target]) as DesignLayer[]);
  };

  useImperativeHandle(ref, () => ({
    async loadDesign({ front, back, urls }) {
      for (const [path, url] of Object.entries(urls)) urlsRef.current.set(path, url);
      sidesRef.current = { front, back };
      historiesRef.current = {
        front: { stack: [JSON.stringify(front)], index: 0 },
        back: { stack: [JSON.stringify(back)], index: 0 },
      };
      await restore(sideRef.current === 'front' ? front : back);
    },

    async addImage(url, uploadPath) {
      const canvas = fabricRef.current!;
      const area = areaRef.current;
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      urlsRef.current.set(uploadPath, url);
      const k = Math.min(1, (area.width * 0.6) / img.width, (area.height * 0.6) / img.height);
      img.set({
        originX: 'center',
        originY: 'center',
        left: area.x + area.width / 2,
        top: area.y + area.height / 2,
        scaleX: k,
        scaleY: k,
        ...HANDLES,
      });
      metaRef.current.set(img, { kind: 'image', uploadPath });
      restoringRef.current = true; // record once, after the image is placed
      canvas.add(img);
      constrain(img);
      restoringRef.current = false;
      emit();
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    },

    selectedImage() {
      const active = activeOf('image');
      if (!active || active.meta.kind !== 'image') return null;
      const url = urlsRef.current.get(active.meta.uploadPath);
      return url ? { url, uploadPath: active.meta.uploadPath } : null;
    },

    async replaceSelectedImage(url, uploadPath, crop) {
      const canvas = fabricRef.current;
      const active = activeOf('image');
      if (!canvas || !active) return;
      const old = active.obj as FabricImage;
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      urlsRef.current.set(uploadPath, url);
      // Same centre, rotation, mirroring and pixel scale: a crop then keeps the kept part exactly where it was.
      const scaleX = old.scaleX ?? 1;
      const scaleY = old.scaleY ?? 1;
      const angle = old.angle ?? 0;
      let { x: left, y: top } = old.getCenterPoint();
      if (crop) {
        // The kept part's centre sits off the old picture's centre; move there so it stays where it was on the shirt.
        const dx = (crop.x + crop.width / 2 - 0.5) * old.width * scaleX * (old.flipX ? -1 : 1);
        const dy = (crop.y + crop.height / 2 - 0.5) * old.height * scaleY * (old.flipY ? -1 : 1);
        const rad = (angle * Math.PI) / 180;
        left += dx * Math.cos(rad) - dy * Math.sin(rad);
        top += dx * Math.sin(rad) + dy * Math.cos(rad);
      }
      img.set({
        originX: 'center',
        originY: 'center',
        left,
        top,
        scaleX,
        scaleY,
        angle,
        flipX: !!old.flipX,
        flipY: !!old.flipY,
        ...HANDLES,
      });
      metaRef.current.set(img, { kind: 'image', uploadPath });
      const index = canvas.getObjects().indexOf(old);
      restoringRef.current = true; // record once, after the swap
      canvas.remove(old);
      canvas.insertAt(index, img);
      constrain(img);
      restoringRef.current = false;
      emit();
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    },

    async addText(text) {
      const canvas = fabricRef.current!;
      const area = areaRef.current;
      const direction = detectDirection(text);
      const key = resolveFont('sans', direction).key;
      await loadFont(key, text);
      const t = new Textbox(text.slice(0, MAX_TEXT_LENGTH), {
        originX: 'center',
        originY: 'center',
        left: area.x + area.width / 2,
        top: area.y + area.height / 2,
        width: area.width * 0.8,
        fontSize: BASE_FONT_SIZE,
        fontFamily: FONTS[key].family,
        fontWeight: FONTS[key].weight,
        fill: DEFAULT_TEXT_FILL[colorRef.current],
        textAlign: 'center',
        direction,
        ...HANDLES,
      } as ConstructorParameters<typeof Textbox>[1]);
      metaRef.current.set(t, { kind: 'text', font: key });
      restoringRef.current = true; // record once, after the text is placed
      canvas.add(t);
      constrain(t);
      restoringRef.current = false;
      emit();
      canvas.setActiveObject(t);
      canvas.requestRenderAll();
    },

    async updateSelectedText(patch, opts) {
      const canvas = fabricRef.current;
      const active = activeOf('text');
      if (!canvas || !active || active.meta.kind !== 'text') return;
      const t = active.obj as Textbox;
      let font = active.meta.font;

      if (patch.text !== undefined) t.set({ text: patch.text.slice(0, MAX_TEXT_LENGTH) });
      const direction = detectDirection(t.text);
      if (patch.font) font = normalizeFont(patch.font);
      font = resolveFont(font, direction).key; // typing Urdu switches to an Urdu font, and back
      if (font !== active.meta.font || patch.font) {
        await loadFont(font, t.text);
        t.set({ fontFamily: FONTS[font].family, fontWeight: FONTS[font].weight });
        metaRef.current.set(t, { kind: 'text', font });
      }
      if (patch.fill) t.set({ fill: patch.fill });
      if (patch.size !== undefined) {
        t.set({ fontSize: clamp(Math.round(patch.size), MIN_TEXT_SIZE, MAX_TEXT_SIZE), scaleX: 1, scaleY: 1 });
      }
      t.set({ direction });
      t.initDimensions();
      t.setCoords();
      constrain(t);
      canvas.requestRenderAll();
      emit(opts?.coalesce);
      reportSelection();
    },

    removeSelected() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    },

    async duplicateSelected() {
      const canvas = fabricRef.current;
      const active = activeOf();
      if (!canvas || !active) return;
      const layers = readLayers();
      const index = canvas.getObjects().filter((o) => metaRef.current.has(o)).indexOf(active.obj);
      const layer = layers[index];
      if (!layer) return;
      const nudge = 0.05; // offset so the copy is visible, then kept inside the print area
      const copy = await buildObject({ ...layer, rect: { ...layer.rect, x: layer.rect.x + nudge, y: layer.rect.y + nudge } });
      if (!copy) return;
      restoringRef.current = true;
      canvas.add(copy);
      constrain(copy);
      restoringRef.current = false;
      emit();
      canvas.setActiveObject(copy);
      canvas.requestRenderAll();
      reportSelection();
    },

    bringToFront() {
      const canvas = fabricRef.current;
      const active = activeOf();
      if (!canvas || !active) return;
      canvas.bringObjectToFront(active.obj);
      canvas.requestRenderAll();
      emit();
    },

    sendToBack() {
      const canvas = fabricRef.current;
      const active = activeOf();
      if (!canvas || !active) return;
      canvas.sendObjectToBack(active.obj);
      canvas.requestRenderAll();
      emit();
    },

    flipSelected(axis) {
      const canvas = fabricRef.current;
      // Only images can be mirrored: mirrored text would not match what gets printed.
      const active = activeOf('image');
      if (!canvas || !active) return;
      if (axis === 'x') active.obj.flipX = !active.obj.flipX;
      else active.obj.flipY = !active.obj.flipY;
      active.obj.setCoords();
      canvas.requestRenderAll();
      canvas.fire('object:modified', { target: active.obj });
    },

    rotateSelected(degrees) {
      const canvas = fabricRef.current;
      const active = activeOf();
      if (!canvas || !active) return;
      active.obj.rotate(((((active.obj.angle ?? 0) + degrees) % 360) + 360) % 360);
      active.obj.setCoords();
      canvas.requestRenderAll();
      canvas.fire('object:modified', { target: active.obj });
    },

    undo: () => step(-1),
    redo: () => step(1),
  }));

  const area = printAreaRect(product, side);
  const printArea = printAreaFor(product, side);
  return (
    <div
      ref={wrapRef}
      data-testid="editor-wrap"
      data-side={side}
      className="relative mx-auto w-full max-w-[400px] overflow-hidden rounded-2xl border-2 border-ink bg-paper-2"
    >
      <canvas ref={canvasEl} />
      {/* Crop marks show where printing can happen; art cannot leave this box. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: `${(area.x / CANVAS_W) * 100}%`,
          top: `${(area.y / CANVAS_H) * 100}%`,
          width: `${(area.width / CANVAS_W) * 100}%`,
          height: `${(area.height / CANVAS_H) * 100}%`,
        }}
      >
        <i className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-vermilion" />
        <i className="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-vermilion" />
        <i className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-vermilion" />
        <i className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-vermilion" />
        <span className="absolute -top-[19px] left-0 whitespace-nowrap rounded-sm bg-paper/90 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-vermilion">
          Print area &middot; {printArea.widthCm} &times; {printArea.heightCm} cm
        </span>
      </div>
    </div>
  );
});
