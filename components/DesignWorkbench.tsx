'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { catalog, COLORS, SIZES, type Color, type ProductId, type Size } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { Editor, type EditorHandle } from '@/components/Editor';

export type WorkbenchState = { product: ProductId; color: Color; size: Size; layers: DesignLayer[] };

type Props = {
  /** Uploads the file to the server and returns the stored path, or an error message to show the customer. */
  uploadFile?: (file: File) => Promise<{ path: string } | { error: string }>;
  onChange?: (state: WorkbenchState) => void;
  /** True from the moment a file is chosen until its image is on the canvas, so callers can hold back saving. */
  onUploadingChange?: (uploading: boolean) => void;
  showLayersJson?: boolean;
  children?: ReactNode;
};

const COLOR_SWATCH: Record<Color, string> = { white: '#f4ecdd', black: '#16120f' };

export function DesignWorkbench({ uploadFile, onChange, onUploadingChange, showLayersJson, children }: Props) {
  const editor = useRef<EditorHandle>(null);
  const [state, setState] = useState<WorkbenchState>({ product: 'tee', color: 'white', size: 'M', layers: [] });
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  // The page is server-rendered first. Until React has attached its handlers, a chosen file or a typed name would be
  // silently lost, so those controls stay disabled until the page is interactive.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const update = (patch: Partial<WorkbenchState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      onChange?.(next);
      return next;
    });
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    onUploadingChange?.(true);
    try {
      const result = uploadFile ? await uploadFile(file) : { path: URL.createObjectURL(file) };
      if ('error' in result) return setError(result.error);
      await editor.current?.addImage(URL.createObjectURL(file), result.path);
    } finally {
      onUploadingChange?.(false);
    }
  }

  async function addText() {
    const t = text.trim();
    if (!t) return;
    await editor.current?.addText(t);
    setText('');
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-32">
      <Editor ref={editor} product={state.product} color={state.color} onChange={(layers) => update({ layers })} />

      <section className="flex flex-col gap-3" aria-label="Item, color and size">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 overflow-hidden rounded-[10px] border-2 border-ink" role="group" aria-label="Item">
            {(Object.keys(catalog) as ProductId[]).map((p) => (
              <button
                key={p}
                aria-pressed={p === state.product}
                className={`flex-1 py-2.5 text-sm font-bold ${p === state.product ? 'bg-ink text-paper' : ''}`}
                onClick={() => update({ product: p })}
              >
                {catalog[p].label}
              </button>
            ))}
          </div>
          <div className="flex gap-3" role="group" aria-label="Color">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={c === 'white' ? 'White' : 'Black'}
                aria-pressed={c === state.color}
                onClick={() => update({ color: c })}
                className={`h-9 w-9 rounded-full border-2 border-ink ${c === state.color ? 'ring-2 ring-vermilion ring-offset-2 ring-offset-paper' : ''}`}
                style={{ background: COLOR_SWATCH[c] }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between" role="group" aria-label="Size">
          {SIZES.map((s) => (
            <button
              key={s}
              aria-pressed={s === state.size}
              onClick={() => update({ size: s })}
              className={`grid h-11 w-[22%] place-items-center rounded-[9px] border-2 border-ink font-bold ${s === state.size ? 'bg-vermilion text-white' : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Add to your design">
        <label className="rounded-xl border-2 border-dashed border-ink bg-white/40 p-3 text-center text-sm font-bold">
          &#8679; Upload art (PNG or JPG)
          <input data-testid="upload-input" disabled={!ready} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onFile} />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-vermilion">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <input
            data-testid="text-input"
            disabled={!ready}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your name or text"
            className="field min-w-0 flex-1"
          />
          <button disabled={!ready} className="btn btn-ink btn-sm" onClick={addText}>
            Add name
          </button>
        </div>
        <button className="self-start text-sm underline" onClick={() => editor.current?.removeSelected()}>
          Remove selected
        </button>
      </section>

      {children}
      {showLayersJson && (
        <pre data-testid="layers-json" className="hidden">
          {JSON.stringify(state.layers)}
        </pre>
      )}
    </div>
  );
}
