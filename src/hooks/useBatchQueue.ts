import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export type BatchStatus = 'queued' | 'processing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: BatchStatus;
  srcUrl: string;
  resultBlob?: Blob;
  resultUrl?: string;
  resultSize?: number;
  resultName?: string;
  error?: string;
}

// Each tool supplies one async transform. It may return a Blob plus an optional
// output filename (e.g. when the extension changes on conversion).
export type ProcessResult = Blob | { blob: Blob; name: string };
export type ProcessOne<S> = (file: File, settings: S, signal: AbortSignal) => Promise<ProcessResult>;

let idc = 0;
const uid = () => `b_${++idc}`;

function poolMap<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  return Promise.all(runners).then(() => undefined);
}

export function useBatchQueue<S>(processOne: ProcessOne<S>) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<BatchItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((id: string, p: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    const newItems: BatchItem[] = incoming.map((file) => ({
      id: uid(),
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
      srcUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) {
        URL.revokeObjectURL(it.srcUrl);
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    itemsRef.current.forEach((it) => {
      URL.revokeObjectURL(it.srcUrl);
      if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
    });
    setItems([]);
  }, []);

  const run = useCallback(
    async (settings: S) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(true);

      const todo = itemsRef.current.filter((it) => it.status === 'queued' || it.status === 'error');
      todo.forEach((it) => patch(it.id, { status: 'processing', error: undefined }));

      const limit = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
      await poolMap(todo, limit, async (it) => {
        if (ctrl.signal.aborted) {
          patch(it.id, { status: 'queued' });
          return;
        }
        try {
          const res = await processOne(it.file, settings, ctrl.signal);
          const blob = res instanceof Blob ? res : res.blob;
          const name = res instanceof Blob ? it.name : res.name;
          const url = URL.createObjectURL(blob);
          patch(it.id, { status: 'done', resultBlob: blob, resultUrl: url, resultSize: blob.size, resultName: name });
        } catch (e) {
          patch(it.id, { status: 'error', error: e instanceof Error ? e.message : 'Failed' });
        }
      });

      setRunning(false);
      abortRef.current = null;
    },
    [processOne, patch],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const downloadZip = useCallback(async (zipName = 'images.zip') => {
    const done = itemsRef.current.filter((it) => it.status === 'done' && it.resultBlob);
    if (!done.length) return;
    if (done.length === 1) {
      saveAs(done[0].resultBlob!, done[0].resultName || done[0].name);
      return;
    }
    const zip = new JSZip();
    const used = new Set<string>();
    for (const it of done) {
      let name = it.resultName || it.name;
      // De-duplicate output names.
      if (used.has(name)) {
        const dot = name.lastIndexOf('.');
        const base = dot >= 0 ? name.slice(0, dot) : name;
        const ext = dot >= 0 ? name.slice(dot) : '';
        let k = 1;
        while (used.has(`${base}-${k}${ext}`)) k++;
        name = `${base}-${k}${ext}`;
      }
      used.add(name);
      zip.file(name, it.resultBlob!);
    }
    // Images are already compressed; STORE avoids wasting CPU on DEFLATE.
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    saveAs(blob, zipName);
  }, []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        URL.revokeObjectURL(it.srcUrl);
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
      });
    };
  }, []);

  const totals = {
    total: items.length,
    done: items.filter((i) => i.status === 'done').length,
    error: items.filter((i) => i.status === 'error').length,
    queued: items.filter((i) => i.status === 'queued').length,
  };

  return { items, running, addFiles, removeItem, clear, run, cancel, downloadZip, totals };
}
