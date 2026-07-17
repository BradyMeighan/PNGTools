// Lazy ONNX Runtime loader. AI code and model weights stay out of the initial
// bundle and are fetched only when a user starts an AI operation.

/* eslint-disable @typescript-eslint/no-explicit-any */
let wasmOrtPromise: Promise<any> | null = null;
let webGpuOrtPromise: Promise<any> | null = null;

const MODEL_CACHE = 'quick-asset-ai-models-v1';

export type AiBackend = 'webgpu' | 'wasm';
export type ModelLoadPhase = 'checking' | 'downloading' | 'initializing' | 'ready' | 'fallback';

export interface ModelSpec {
  id: string;
  label: string;
  url: string;
  bytes: number;
}

export interface ModelLoadProgress {
  phase: ModelLoadPhase;
  fraction: number;
  label: string;
  loadedBytes?: number;
  totalBytes?: number;
  cached?: boolean;
  backend?: AiBackend;
}

export type ModelProgressFn = (progress: ModelLoadProgress) => void;
export type ProgressFn = (fraction: number, label: string) => void;

export interface AiSession {
  session: any;
  ort: any;
  backend: AiBackend;
}

function abortError() {
  return new DOMException('AI processing canceled.', 'AbortError');
}

function supportsWebGpu() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function getPreferredAiBackend(): AiBackend {
  return supportsWebGpu() ? 'webgpu' : 'wasm';
}

function publicRuntimeUrl(file: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}ort/${file}`;
}

function configureOrt(ort: any, files: { mjs: string; wasm: string }) {
  // Be explicit about both files. A string prefix makes ORT infer a runtime
  // variant; the WebGPU bundle and the plain WASM bundle need different .mjs
  // sidecars. Cloudflare serves these public files verbatim.
  ort.env.wasm.wasmPaths = import.meta.env.DEV
    ? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'
    : {
        mjs: publicRuntimeUrl(files.mjs),
        wasm: publicRuntimeUrl(files.wasm),
      };
  // One thread works without COOP/COEP and avoids breaking integrations that
  // rely on normal cross-origin windows.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  return ort;
}

function clearRejectedRuntimePromise(kind: 'wasm' | 'webgpu', promise: Promise<any>) {
  promise.catch(() => {
    if (kind === 'wasm' && wasmOrtPromise === promise) wasmOrtPromise = null;
    if (kind === 'webgpu' && webGpuOrtPromise === promise) webGpuOrtPromise = null;
  });
}

// The regular ORT package is the reliable CPU baseline. Do not load the
// WebGPU/JSEP bundle for browsers that cannot use a GPU: a failed JSEP init
// poisons that module's WASM fallback for the rest of the page session.
export async function getOrt(): Promise<any> {
  if (!wasmOrtPromise) {
    wasmOrtPromise = import('onnxruntime-web').then((mod) =>
      configureOrt(mod as any, {
        mjs: 'ort-wasm-simd-threaded.mjs',
        wasm: 'ort-wasm-simd-threaded.wasm',
      }),
    );
    clearRejectedRuntimePromise('wasm', wasmOrtPromise);
  }
  return wasmOrtPromise;
}

async function getWebGpuOrt(): Promise<any> {
  if (!webGpuOrtPromise) {
    webGpuOrtPromise = import('onnxruntime-web/webgpu').then((mod) =>
      configureOrt(mod as any, {
        mjs: 'ort-wasm-simd-threaded.jsep.mjs',
        wasm: 'ort-wasm-simd-threaded.jsep.wasm',
      }),
    );
    clearRejectedRuntimePromise('webgpu', webGpuOrtPromise);
  }
  return webGpuOrtPromise;
}

async function readResponse(
  response: Response,
  spec: ModelSpec,
  cached: boolean,
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
) {
  const total = Number(response.headers.get('content-length')) || spec.bytes;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.({
      phase: 'downloading',
      fraction: 1,
      label: cached ? `${spec.label} loaded from this device` : `${spec.label} downloaded`,
      loadedBytes: bytes.byteLength,
      totalBytes: total,
      cached,
    });
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({
        phase: 'downloading',
        fraction: Math.min(1, loaded / Math.max(1, total)),
        label: cached ? `Loading ${spec.label} from this device` : `Downloading ${spec.label}`,
        loadedBytes: loaded,
        totalBytes: total,
        cached,
      });
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function loadModelBytes(
  spec: ModelSpec,
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw abortError();
  onProgress?.({ phase: 'checking', fraction: 0, label: `Checking for ${spec.label}` });

  let response: Response | undefined;
  let cached = false;

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(MODEL_CACHE);
      const match = await cache.match(spec.url);
      if (match) {
        response = match;
        cached = true;
      } else {
        const fetched = await fetch(spec.url, { signal });
        if (!fetched.ok) throw new Error(`Model download failed (${fetched.status}).`);
        response = fetched;
        // Cache a clone while the original stream is consumed for byte-level
        // progress. Cache failures should not make the AI feature unusable.
        try {
          await cache.put(spec.url, fetched.clone());
        } catch {
          // Private browsing and low-storage devices may reject Cache Storage.
        }
      }
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof Error && error.message.startsWith('Model download failed')) throw error;
    }
  }

  if (!response) {
    response = await fetch(spec.url, { signal });
    if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
  }

  return readResponse(response, spec, cached, onProgress, signal);
}

export async function createAiSession(
  spec: ModelSpec,
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
): Promise<AiSession> {
  const bytesPromise = loadModelBytes(spec, onProgress, signal);
  if (signal?.aborted) throw abortError();

  const tryGpu = supportsWebGpu();
  if (tryGpu) {
    onProgress?.({
      phase: 'initializing',
      fraction: 0.92,
      label: 'Initializing GPU engine',
      backend: 'webgpu',
    });
    try {
      const [ort, bytes] = await Promise.all([getWebGpuOrt(), bytesPromise]);
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [{ name: 'webgpu', storageBufferCacheMode: 'simple' }, 'wasm'],
        graphOptimizationLevel: 'all',
      });
      onProgress?.({ phase: 'ready', fraction: 1, label: 'GPU model ready', backend: 'webgpu' });
      return { session, ort, backend: 'webgpu' };
    } catch {
      onProgress?.({
        phase: 'fallback',
        fraction: 0.94,
        label: 'GPU could not run this model — switching to CPU',
        backend: 'wasm',
      });
    }
  }

  if (signal?.aborted) throw abortError();
  onProgress?.({
    phase: 'initializing',
    fraction: 0.96,
    label: tryGpu ? 'Initializing CPU fallback' : 'Initializing CPU engine',
    backend: 'wasm',
  });
  const [ort, bytes] = await Promise.all([getOrt(), bytesPromise]);
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  onProgress?.({ phase: 'ready', fraction: 1, label: 'CPU model ready', backend: 'wasm' });
  return { session, ort, backend: 'wasm' };
}

// Kept for the existing background-removal path. It now uses the same lazy
// runtime, while staying on WASM because that model has not been GPU-qualified.
export async function createSession(modelUrl: string): Promise<any> {
  const ort = await getOrt();
  return ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}
