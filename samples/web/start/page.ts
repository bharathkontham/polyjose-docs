// The page side of the worker sample on Get started › Web (WASM) (src/content/docs/start/web.mdx).
// samples/web/browser.test.mjs serves it, with a Content Security Policy that allows
// 'wasm-unsafe-eval', and runs it in headless Chromium. It records the outcome on <body> for the
// test to check: data-result on success, data-error otherwise.
//
// The key is RFC 7515 Appendix A.3.1's P-256 key, a public test key, from samples/fixtures.

import { jwsVerifyCompact, type JwkObject } from '@polyjose/wasm';

interface Fixtures {
  keys: Record<string, { jwk: JwkObject }>;
}

async function run(): Promise<{ alg: string; payload: string }> {
  const fixtures = (await (await fetch('/fixtures/keys.json')).json()) as Fixtures;
  const privateKey = fixtures.keys['p256']?.jwk;
  if (privateKey === undefined) throw new Error('keys.json has no p256 key');
  const { d: _private, ...publicKey } = privateKey;

  // docs:start start/web-worker-page
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const token = await new Promise<string>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ token?: string; error?: string }>) => {
      const { token, error } = event.data;
      if (token !== undefined) resolve(token);
      else reject(new Error(`signing failed: ${error}`));
    };
    worker.onerror = () => reject(new Error('the worker failed to start'));
    worker.postMessage({ payload: 'hello, polyjose', key: privateKey });
  });
  worker.terminate();
  // docs:end start/web-worker-page

  // Verified on the page itself, so both threads load the module.
  const verified = await jwsVerifyCompact(token, { ...publicKey, kty: privateKey.kty }, { allowedAlgs: ['ES256'] });
  return { alg: verified.alg, payload: new TextDecoder().decode(verified.payload) };
}

run().then(
  (result) => {
    document.body.dataset['result'] = JSON.stringify(result);
  },
  (err: unknown) => {
    document.body.dataset['error'] = String(err);
  },
);
