/**
 * Tiny static file server for `dist/`, serving gzip-compressed responses
 * (like any reasonable production host would).
 */
import { readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.json': 'application/json',
};

export function serveDist(distDir: string, port: number): Promise<Server> {
  const cache = new Map<string, Buffer>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(join(distDir, decodeURIComponent(url.pathname)));
    if (!path.startsWith(distDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (statSync(path).isDirectory()) {
        path = join(path, 'index.html');
      }
      let body = cache.get(path);
      if (!body) {
        body = gzipSync(readFileSync(path), { level: 9 });
        cache.set(path, body);
      }
      res.writeHead(200, {
        'Content-Type': mimeTypes[extname(path)] ?? 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
