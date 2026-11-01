'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { catalog, COLORS, SIZES, type Color, type ProductId, type Size } from '@/lib/catalog';
import type { DesignLayer } from '@/lib/designLayers';
import { Editor, type EditorHandle, type Selection } from '@/components/Editor';

export type WorkbenchState = { product: ProductId; color: Color; size: Size; layers: DesignLayer[] };

type Props = {
  /** Uploads the file to the server and returns the stored path, or an error message to show the customer. */
  uploadFile?: (file: File) => Promise<{ path: string } | { error: string }>;
  onChange?: (state: WorkbenchState) => void;
  /** True from the moment a file is chosen until its image is on the canvas, so callers can hold back saving. */
  onUploadingChange?: (uploading: boolean) => void;
  /** 0-100 while a file is being sent; null when idle. */
  uploadProgress?: number | null;
  showLayersJson?: boolean;
  children?: ReactNode;
};

const COLOR_SWATCH: Record<Color, string> = { white: '#f4ecdd', black: '#16120f' };
const QUALITY_BADGE = { great: 'badge-forest', ok: 'badge-gold', low: 'badge-red' } as const;
const QUALITY_LABEL = { great: 'Great', ok: 'OK', low: 'Low' } as const;

export function DesignWorkbench({ uploadFile, onChange, onUploadingChange, uploadProgress = null, showLayersJson, children }: Props) {
  const editor = useRef<EditorHandle>(null);
  const [state, setState] = useState<WorkbenchState>({ product: 'tee', color: 'white', size: 'M', layers: [] });
  // Always the latest state, so updates never have to call other components from inside a state updater.
  const stateRef = useRef(state);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  // The page is server-rendered first. Until React has attached its handlers, a chosen file or a typed name would be
  // silently lost, so those controls stay disabled until the page is interactive.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const update = (patch: Partial<WorkbenchState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    onChange?.(next);
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

  const tool = 'rounded-[9px] border-2 border-ink bg-white/50 px-3 py-2 text-sm font-bold disabled:opacity-40';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-32">
      <Editor ref={editor} product={state.product} color={state.color} onChange={(layers) => update({ layers })} onSelectionChange={setSelection} />

      {selection && (
        <section className="flex flex-col gap-2" aria-label="Selected item">
          {selection.kind === 'image' && (
            <p data-testid="print-quality" className={`badge self-start ${QUALITY_BADGE[selection.quality.level]}`}>
              Print quality: {QUALITY_LABEL[selection.quality.level]}
              {selection.quality.dpi > 0 && <> &middot; {Math.round(selection.quality.dpi)} DPI</>}
              {selection.quality.level === 'low' && <> &mdash; may look blurry. Make it smaller or use a bigger image.</>}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {selection.kind === 'image' && (
              <>
                <button className={tool} onClick={() => editor.current?.flipSelected('x')}>
                  Flip left-right
                </button>
                <button className={tool} onClick={() => editor.current?.flipSelected('y')}>
                  Flip top-bottom
                </button>
              </>
            )}
            <button className={tool} onClick={() => editor.current?.rotateSelected(90)}>
              Rotate 90&deg;
            </button>
          </div>
        </section>
      )}

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
          &#8679; Upload art (PNG, JPG or WebP)
          <input
            data-testid="upload-input"
            disabled={!ready}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onFile}
          />
        </label>
        {uploadProgress !== null && (
          <div>
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress}
              className="h-2.5 overflow-hidden rounded-full border-2 border-ink bg-white/60"
            >
              <div className="h-full bg-vermilion transition-[width]" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="mt-1 text-xs font-semibold text-mute">{uploadProgress < 100 ? `Uploading ${uploadProgress}%` : 'Finishing…'}</p>
          </div>
        )}
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
