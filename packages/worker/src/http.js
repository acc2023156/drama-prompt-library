/* 把 (Request) => Response 的处理函数接到 Node 的 http 服务上 */
import http from 'node:http';
import { Readable, Transform } from 'node:stream';

class TooLarge extends Error {}

/* 限制请求体大小：超过就中断，避免被灌爆内存 */
function limited(stream, max) {
  let n = 0;
  const t = new Transform({ transform(chunk, _enc, cb) { n += chunk.length; n > max ? cb(new TooLarge()) : cb(null, chunk); } });
  return Readable.toWeb(stream.pipe(t));
}

export function createListener(handle, { maxBodyBytes = 5 * 1024 * 1024 } = {}) {
  return async (nreq, nres) => {
    const ac = new AbortController();
    nres.on('close', () => { if (!nres.writableEnded) ac.abort(); });   // 浏览器断开就不再等上游
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(nreq.headers)) for (const x of [].concat(v)) headers.append(k, x);
      const hasBody = nreq.method !== 'GET' && nreq.method !== 'HEAD';
      if (hasBody && +nreq.headers['content-length'] > maxBodyBytes) throw new TooLarge();
      const req = new Request(`http://${nreq.headers.host || 'localhost'}${nreq.url}`, {
        method: nreq.method, headers, signal: ac.signal,
        ...(hasBody ? { body: limited(nreq, maxBodyBytes), duplex: 'half' } : {}),
      });
      const res = await handle(req);
      const out = {}; res.headers.forEach((v, k) => { out[k] = v; });
      nres.writeHead(res.status, out);
      if (res.body) Readable.fromWeb(res.body).on('error', () => nres.destroy()).pipe(nres); else nres.end();
    } catch (e) {
      if (nres.headersSent) return nres.destroy();
      const status = e instanceof TooLarge ? 413 : 500;
      if (status === 500) console.error('[error]', nreq.method, nreq.url, e);
      nres.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      nres.end(JSON.stringify({ error: status === 413 ? 'too large' : 'internal error' }));
    }
  };
}

export const createServer = (handle, opts) => http.createServer(createListener(handle, opts));
