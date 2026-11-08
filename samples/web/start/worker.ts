// The Web Worker side of the worker sample on Get started › Web (WASM)
// (src/content/docs/start/web.mdx). start/page.ts starts it, and samples/web/browser.test.mjs runs
// both in headless Chromium, so the region below is executed, not only type-checked.

// docs:start start/web-worker
import { jwsSignCompact, PolyjoseError, type Jwk } from '@polyjose/wasm';

self.onmessage = async (event: MessageEvent<{ payload: string; key: Jwk }>) => {
  const { payload, key } = event.data;
  try {
    const token = await jwsSignCompact(new TextEncoder().encode(payload), key, {
      protectedHeader: { alg: 'ES256' },
    });
    self.postMessage({ token });
  } catch (err) {
    self.postMessage({ error: err instanceof PolyjoseError ? err.code : String(err) });
  }
};
// docs:end start/web-worker
