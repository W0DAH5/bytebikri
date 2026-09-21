#!/usr/bin/env node
/**
 * Serves docs/ so the download page can be opened in a real browser.
 *   node tools/serve-docs.mjs [port]      default 8080
 *
 * Binds 0.0.0.0 so it is reachable through the sandbox's preview proxy.
 * Read-only, no dependencies, path-traversal guarded.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);

    // health probe used by the sandbox
    if (rel === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }

    if (rel === '/' || rel === '') {
      res.writeHead(302, { location: '/download.html' }).end();
      return;
    }

    // confine to docs/
    const abs = join(DOCS, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!abs.startsWith(DOCS)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let target = abs;
    try {
      if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(target);
    const headers = {
      'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    };

    // Markdown is served as a download rather than rendered inline.
    if (extname(target).toLowerCase() === '.md') {
      headers['content-disposition'] =
        `attachment; filename="${target.split('/').pop()}"`;
    }

    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error: ' + err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`docs server  →  http://0.0.0.0:${PORT}/`);
  console.log(`download page →  http://0.0.0.0:${PORT}/download.html`);
  console.log(`serving       →  ${DOCS}`);
});
