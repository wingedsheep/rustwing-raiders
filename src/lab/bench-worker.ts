/** A wave-lab worker: flies the fights it's sent, one at a time, and posts back how each went. */

import { fly, type FlyJob } from './fly';

self.onmessage = (m: MessageEvent<FlyJob>) => {
  try {
    self.postMessage({ ok: true, result: fly(m.data) });
  } catch (err) {
    self.postMessage({ ok: false, key: m.data.key, error: String((err as Error)?.stack ?? err) });
  }
};
