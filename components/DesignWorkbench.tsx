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

const pill = (on: boolean) =>
  `rounded-full border px-4 py-2 text-sm font-medium ${on ? 'border-black bg-black text-white' : 'border-neutral-300 bg-white'}`;

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
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex gap-2" role="group" aria-label="Item">
        {(Object.keys(catalog) as ProductId[]).map((p) => (
          <button key={p} aria-pressed={p === state.product} className={pill(p === state.product)} onClick={() => update({ product: p })}>
            {catalog[p].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Color and size">
        {COLORS.map((c) => (
          <button key={c} aria-pressed={c === state.color} className={pill(c === state.color)} onClick={() => update({ color: c })}>
            {c === 'white' ? 'White' : 'Black'}
          </button>
        ))}
        <span className="mx-1 text-neutral-400">|</span>
        {SIZES.map((s) => (
          <button key={s} aria-pressed={s === state.size} className={pill(s === state.size)} onClick={() => update({ size: s })}>
            {s}
          </button>
        ))}
      </div>

      <Editor ref={editor} product={state.product} color={state.color} onChange={(layers) => update({ layers })} />

      <div className="flex flex-col gap-3">
        <label className="rounded border border-dashed border-neutral-400 p-3 text-center text-sm">
          Upload image (PNG or JPG)
          <input data-testid="upload-input" disabled={!ready} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onFile} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
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
            className="min-w-0 flex-1 rounded border p-3"
          />
          <button disabled={!ready} className="rounded bg-black px-4 font-semibold text-white disabled:opacity-50" onClick={addText}>
            Add name
          </button>
        </div>
        <button className="self-start text-sm underline" onClick={() => editor.current?.removeSelected()}>
          Remove selected
        </button>
      </div>

      {children}
      {showLayersJson && (
        <pre data-testid="layers-json" className="hidden">
          {JSON.stringify(state.layers)}
        </pre>
      )}
    </div>
  );
}
