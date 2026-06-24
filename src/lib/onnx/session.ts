// Lazy onnxruntime-web loader. The runtime (and the model weights) are only
// fetched the first time an AI feature is used, so they never bloat the main
// bundle or the initial load.

/* eslint-disable @typescript-eslint/no-explicit-any */
let ortPromise: Promise<any> | null = null;

export async function getOrt(): Promise<any> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then((mod) => {
      const ort: any = mod;
      // In production the wasm/glue assets are self-hosted from /public/ort. In the
      // Vite dev server, same-origin dynamic imports of those .mjs files get rewritten
      // and fail, so load the version-matched copies from a CDN there instead.
      ort.env.wasm.wasmPaths = import.meta.env.DEV
        ? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'
        : '/ort/';
      // Single-thread avoids needing cross-origin isolation (COOP/COEP) headers.
      ort.env.wasm.numThreads = 1;
      return ort;
    });
  }
  return ortPromise;
}

export async function createSession(modelUrl: string): Promise<any> {
  const ort = await getOrt();
  // WASM is the reliable baseline everywhere. WebGPU can be added later once the
  // jsep asset pipeline is validated; for now correctness beats peak speed.
  return ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

export type ProgressFn = (fraction: number, label: string) => void;
