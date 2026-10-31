'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage, Textbox, type FabricObject } from 'fabric';
import { catalog, type Color, type ProductId } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { CANVAS_H, CANVAS_W, detectDirection, printAreaRect, toFraction } from '@/lib/editorGeometry';
import { clampToPrintArea } from '@/lib/printArea';

// Same families the server uses to render the print file, so the preview matches what is printed.
export const TEXT_FONT = '"Noto Sans", "Noto Nastaliq Urdu", Arial, sans-serif';

type Meta = { kind: 'image'; uploadPath: string } | { kind: 'text' };

export type EditorHandle = {
  addImage(url: string, uploadPath: string): Promise<void>;
  addText(text: string): Promise<void>;
  removeSelected(): void;
};

type Props = { product: ProductId; color: Color; onChange?: (layers: DesignLayer[]) => void };

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ product, color, onChange }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const areaRef = useRef(printAreaRect(product));
  const metaRef = useRef(new WeakMap<FabricObject, Meta>());
  const onChangeRef = useRef(onChange);
  const colorRef = useRef(color);
  onChangeRef.current = onChange;
  colorRef.current = color;

  const readLayers = (): DesignLayer[] => {
    const area = areaRef.current;
    return (fabricRef.current?.getObjects() ?? []).flatMap((obj): DesignLayer[] => {
      const meta = metaRef.current.get(obj);
      if (!meta) return [];
      const w = obj.getScaledWidth();
      const h = obj.getScaledHeight();
      const rect = toFraction({ x: (obj.left ?? 0) - w / 2, y: (obj.top ?? 0) - h / 2, width: w, height: h }, area);
      const rotation = obj.angle ?? 0;
      if (meta.kind === 'image') return [{ kind: 'image', uploadPath: meta.uploadPath, rect, rotation }];
      const t = obj as Textbox;
      return [
        {
          kind: 'text',
          text: t.text,
          font: String(t.fontFamily),
          fill: String(t.fill),
          direction: detectDirection(t.text),
          fontSize: ((t.fontSize ?? 26) * (obj.scaleY ?? 1)) / area.width,
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

  const emit = () => onChangeRef.current?.(readLayers());

  useEffect(() => {
    const canvas = new Canvas(canvasEl.current!, {
      width: CANVAS_W,
      height: CANVAS_H,
      selection: false,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;
    const guard = (e: { target: FabricObject }) => constrain(e.target);
    canvas.on('object:moving', guard);
    canvas.on('object:scaling', guard);
    canvas.on('object:rotating', guard);
    canvas.on('object:modified', (e) => {
      constrain(e.target);
      emit();
    });
    canvas.on('object:added', emit);
    canvas.on('object:removed', emit);

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

  // Product or color changed: swap the garment photo and carry layers over proportionally.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let cancelled = false;
    const old = areaRef.current;
    const next = printAreaRect(product);
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
    FabricImage.fromURL(catalog[product].garmentImage(color)).then((img) => {
      if (cancelled || fabricRef.current !== canvas) return;
      img.scaleToWidth(CANVAS_W);
      canvas.backgroundImage = img;
      canvas.requestRenderAll();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, color]);

  useImperativeHandle(ref, () => ({
    async addImage(url, uploadPath) {
      const canvas = fabricRef.current!;
      const area = areaRef.current;
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      const k = Math.min(1, (area.width * 0.6) / img.width, (area.height * 0.6) / img.height);
      img.set({
        originX: 'center',
        originY: 'center',
        left: area.x + area.width / 2,
        top: area.y + area.height / 2,
        scaleX: k,
        scaleY: k,
      });
      metaRef.current.set(img, { kind: 'image', uploadPath });
      canvas.add(img);
      constrain(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    },
    async addText(text) {
      const canvas = fabricRef.current!;
      const area = areaRef.current;
      await Promise.all([document.fonts.load('28px "Noto Sans"', text), document.fonts.load('28px "Noto Nastaliq Urdu"', text)]).catch(() => undefined);
      const t = new Textbox(text, {
        originX: 'center',
        originY: 'center',
        left: area.x + area.width / 2,
        top: area.y + area.height / 2,
        width: area.width * 0.8,
        fontSize: 26,
        fontFamily: TEXT_FONT,
        fill: colorRef.current === 'black' ? '#ffffff' : '#111111',
        textAlign: 'center',
        direction: detectDirection(text),
      } as ConstructorParameters<typeof Textbox>[1]);
      metaRef.current.set(t, { kind: 'text' });
      canvas.add(t);
      constrain(t);
      canvas.setActiveObject(t);
      canvas.requestRenderAll();
    },
    removeSelected() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    },
  }));

  const area = printAreaRect(product);
  return (
    <div
      ref={wrapRef}
      data-testid="editor-wrap"
      className="relative mx-auto w-full max-w-[400px] overflow-hidden rounded-lg bg-neutral-200"
    >
      <canvas ref={canvasEl} />
      <div
        aria-hidden
        className="pointer-events-none absolute border-2 border-dashed border-orange-500"
        style={{
          left: `${(area.x / CANVAS_W) * 100}%`,
          top: `${(area.y / CANVAS_H) * 100}%`,
          width: `${(area.width / CANVAS_W) * 100}%`,
          height: `${(area.height / CANVAS_H) * 100}%`,
        }}
      >
        <span className="absolute -top-5 left-0 text-[11px] font-medium text-orange-600">Print area</span>
      </div>
    </div>
  );
});
