#!/usr/bin/env node
/**
 * Builds docs/download.html — a self-contained page that carries the full
 * session documents inline and offers working "Download .md" buttons.
 *
 *   node tools/build-download-page.mjs
 *
 * The Markdown is read from disk and embedded verbatim, so the page can never
 * drift from the source documents. No dependencies, no network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DOCS = [
  {
    id: 'record',
    label: 'Complete Conversation Record',
    filename: 'bytebikri-conversation-record.md',
    path: 'docs/conversation-record.md',
    blurb:
      'Turn by turn: every question as you asked it, every answer in full, every figure and source. ' +
      '14 turns + corrections appendix, open decisions, and the five points that matter most.',
  },
  {
    id: 'digest',
    label: 'Discussion Digest',
    filename: 'bytebikri-full-discussion.md',
    path: 'docs/full-discussion.md',
    blurb:
      'The same material organised by theme rather than chronologically — faster to look something up in.',
  },
];

const CONFIG = {
  built: new Date().toISOString().slice(0, 10),
  repo: 'https://github.com/W0DAH5/bytebikri',
  branch: 'arena/01a0c219-bytebikri',
  pr: 'https://github.com/W0DAH5/bytebikri/pull/1',
  docs: [],
};

for (const d of DOCS) {
  const markdown = await readFile(join(ROOT, d.path), 'utf8');
  CONFIG.docs.push({
    ...d,
    markdown,
    lines: markdown.split('\n').length,
    words: markdown.split(/\s+/).filter(Boolean).length,
    bytes: Buffer.byteLength(markdown, 'utf8'),
  });
}

// `</` must be escaped so an embedded sequence can never close the <script> tag.
const json = JSON.stringify(CONFIG, null, 1).replace(/<\//g, '<\\/');

const template = await readFile(join(ROOT, 'tools/download-page.template.html'), 'utf8');
if (!template.includes('/*__CONFIG__*/')) throw new Error('template placeholder missing');

const html = template.replace('/*__CONFIG__*/', json);
const outPath = join(ROOT, 'docs/download.html');
await writeFile(outPath, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
for (const d of CONFIG.docs) {
  console.log(`  embedded  ${d.path.padEnd(30)} ${String(d.lines).padStart(5)} lines  ${(d.bytes / 1024).toFixed(1)} KB`);
}
console.log(`\n  wrote     docs/download.html            ${kb} KB  (self-contained, no network)`);
