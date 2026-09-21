#!/usr/bin/env node
/**
 * Verifies docs/download.html before it is committed:
 *   1. the embedded Markdown is byte-identical to the source files
 *   2. the page contains exactly one inline script (nothing can close it early)
 *   3. that script parses
 *   4. the Markdown renderer produces the right structure on the real document
 *
 *   node tools/verify-download-page.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(ROOT, 'docs/download.html'), 'utf8');

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

/* 1 — the Markdown is embedded verbatim */
const cfgStart = html.indexOf('const CONFIG = ') + 'const CONFIG = '.length;
const cfgEnd = html.indexOf(';\n\n/* ---------- helpers');
const CONFIG = JSON.parse(html.slice(cfgStart, cfgEnd));
for (const d of CONFIG.docs) {
  const src = await readFile(join(ROOT, d.path), 'utf8');
  check(src === d.markdown, `round-trip verbatim  ${d.path}`,
        `${d.lines} lines / ${(d.bytes / 1024).toFixed(1)} KB`);
}

/* 2 — exactly one script block, and it can't be terminated from inside the data */
const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check(blocks.length === 1, 'exactly one inline <script> block', `found ${blocks.length}`);
check(!/<\\\/script/i.test('') && (html.match(/<\/script>/g) || []).length === 1,
      'no embedded </script> sequence can terminate it early');

/* 3 — the page's JavaScript parses */
const jsPath = join(tmpdir(), 'bytebikri-download-page.js');
await writeFile(jsPath, blocks[0]);
try {
  execFileSync(process.execPath, ['--check', jsPath], { stdio: 'pipe' });
  check(true, 'generated JavaScript parses');
} catch (e) {
  check(false, 'generated JavaScript parses', String(e.stderr || e).slice(0, 300));
}

/* 4 — renderer structure on the real document */
const helpers = blocks[0].slice(blocks[0].indexOf('/* ---------- helpers'));
const fnSrc = helpers.slice(0, helpers.indexOf('/* ---------- state')).replace(/^const \$ = .*$/m, '');
const { renderMarkdown, esc } = new Function(fnSrc + '\nreturn {renderMarkdown, esc};')();

const md = CONFIG.docs[0].markdown;
const out = renderMarkdown(md);

const expectH1 = (md.match(/^# /gm) || []).length;
const expectH2 = (md.match(/^## /gm) || []).length;
const expectTables = (md.match(/^\|[^\n]*\|\s*\n\|[\s:|-]+\|/gm) || []).length;
const gotH1 = (out.match(/<h1 /g) || []).length;
const gotH2 = (out.match(/<h2 /g) || []).length;
const gotTables = (out.match(/<table>/g) || []).length;

check(gotH1 === expectH1, 'H1 count matches source', `${gotH1}/${expectH1}`);
check(gotH2 === expectH2, 'H2 count matches source', `${gotH2}/${expectH2}`);
check(gotTables === expectTables, 'table count matches source', `${gotTables}/${expectTables}`);
check(!/\u0000\d+\u0000/.test(out), 'no unresolved placeholders in output');
check(!/<p>\s*[|#]/.test(out), 'no raw Markdown leaked into paragraphs');

/* 4b — the nesting cases that actually broke it */
const nested = renderMarkdown('- see [`README.md`](./README.md) and **`code`** here');
check(!/\u0000/.test(nested), 'nested code-in-link / code-in-bold resolves', nested.replace(/\n/g, ' '));
check(/<a [^>]*><code>README\.md<\/code><\/a>/.test(nested), 'code-in-link renders as an anchor');
check(/<strong><code>code<\/code><\/strong>/.test(nested), 'code-in-bold renders as strong>code');

/* 4c — escaping */
check(esc('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;', 'HTML in the document is escaped');

console.log(failures === 0
  ? '\nALL CHECKS PASS\n'
  : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
