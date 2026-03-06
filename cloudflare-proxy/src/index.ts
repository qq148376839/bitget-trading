/**
 * Cloudflare Worker — Bitget API 反向代理
 * 使用 TCP Socket API 直连，绕过 Bot Management
 */

import { connect } from 'cloudflare:sockets';

interface Env {
  TARGET_ORIGIN: string;
}

const TARGET_HOST = 'api.bitget.com';
const TARGET_PORT = 443;

const PASSTHROUGH_HEADERS = [
  'access-key',
  'access-sign',
  'access-timestamp',
  'access-passphrase',
  'content-type',
  'locale',
  'paptrading',
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__health') {
      return new Response('ok', { status: 200 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      let bodyStr = '';
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        bodyStr = await request.text();
      }

      const path = url.pathname + url.search;

      // 构建 HTTP/1.1 请求
      const lines: string[] = [
        `${request.method} ${path} HTTP/1.1`,
        `Host: ${TARGET_HOST}`,
        'User-Agent: axios/1.7.9',
        'Accept: application/json',
        'Accept-Encoding: identity',  // 不要 gzip
        'Connection: close',
      ];

      if (bodyStr) {
        lines.push(`Content-Length: ${new TextEncoder().encode(bodyStr).byteLength}`);
      }

      for (const key of PASSTHROUGH_HEADERS) {
        const value = request.headers.get(key);
        if (value) lines.push(`${key}: ${value}`);
      }

      lines.push('', bodyStr);
      const rawReq = new TextEncoder().encode(lines.join('\r\n'));

      // TLS 连接
      const socket = connect(
        { hostname: TARGET_HOST, port: TARGET_PORT },
        { secureTransport: 'on' },
      );

      // 写入请求，不关闭 writer（让 Connection: close 触发服务端关闭）
      const writer = socket.writable.getWriter();
      await writer.write(rawReq);
      writer.releaseLock();

      // 读取响应（带超时）
      const chunks: Uint8Array[] = [];
      const reader = socket.readable.getReader();

      // 用 AbortController 式超时
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; }, 9000);

      try {
        while (!timedOut) {
          const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('read_timeout')), 9500)
            ),
          ]);
          if (done) break;
          if (value) chunks.push(value);
        }
      } catch (e) {
        if (String(e).includes('read_timeout') && chunks.length > 0) {
          // 已经读到了一些数据，可能只是 Connection: close 还没触发
        } else if (chunks.length === 0) {
          throw e;
        }
      } finally {
        clearTimeout(timer);
        try { reader.releaseLock(); } catch { /* */ }
        try { socket.close(); } catch { /* */ }
      }

      if (chunks.length === 0) {
        throw new Error('No data received');
      }

      // 合并二进制
      const total = chunks.reduce((a, c) => a + c.byteLength, 0);
      const raw = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { raw.set(c, off); off += c.byteLength; }

      // 查找 \r\n\r\n
      const sep = findCRLF2(raw);
      if (sep === -1) {
        const preview = new TextDecoder('utf-8', { fatal: false }).decode(raw.slice(0, 300));
        throw new Error(`No header/body separator. Got ${raw.length}B: ${preview}`);
      }

      // 解析状态行和头
      const headerStr = new TextDecoder().decode(raw.slice(0, sep));
      const headerLines = headerStr.split('\r\n');
      const statusCode = parseInt(headerLines[0].split(' ')[1], 10) || 502;

      const respHeaders = new Headers();
      let chunked = false;
      let contentLen = -1;
      for (let i = 1; i < headerLines.length; i++) {
        const ci = headerLines[i].indexOf(':');
        if (ci <= 0) continue;
        const k = headerLines[i].slice(0, ci).trim().toLowerCase();
        const v = headerLines[i].slice(ci + 1).trim();
        if (k === 'transfer-encoding' && v.includes('chunked')) { chunked = true; continue; }
        if (k === 'content-length') { contentLen = parseInt(v, 10); continue; }
        if (k === 'connection' || k === 'set-cookie') continue;
        respHeaders.set(k, v);
      }

      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');

      const bodyData = raw.slice(sep + 4);
      const body = chunked ? dechunk(bodyData) : bodyData;

      return new Response(body, { status: statusCode, headers: respHeaders });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'proxy_error', message: String(err) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
};

function findCRLF2(d: Uint8Array): number {
  for (let i = 0; i < d.length - 3; i++) {
    if (d[i] === 13 && d[i+1] === 10 && d[i+2] === 13 && d[i+3] === 10) return i;
  }
  return -1;
}

function dechunk(d: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let p = 0;
  while (p < d.length) {
    let le = -1;
    for (let i = p; i < d.length - 1; i++) {
      if (d[i] === 13 && d[i+1] === 10) { le = i; break; }
    }
    if (le === -1) break;
    const sz = parseInt(new TextDecoder().decode(d.slice(p, le)).trim(), 16);
    if (isNaN(sz) || sz === 0) break;
    const cs = le + 2;
    if (cs + sz > d.length) break;
    parts.push(d.slice(cs, cs + sz));
    p = cs + sz + 2;
  }
  const tl = parts.reduce((a, x) => a + x.byteLength, 0);
  const r = new Uint8Array(tl);
  let o = 0;
  for (const x of parts) { r.set(x, o); o += x.byteLength; }
  return r;
}
