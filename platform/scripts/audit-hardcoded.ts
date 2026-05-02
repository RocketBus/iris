import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const EXTS = ['.tsx'];
const SKIP_DIRS = new Set(['node_modules', '.next']);

const PRIORITY = [
  'src/app/[tenant]/dashboard',
  'src/app/[tenant]/repos',
  'src/app/[tenant]/settings',
  'src/components',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

// Heuristic regexes
// 1) JSX text between tags: >Hello world<
const JSX_TEXT = />\s*([A-Z][\w\s'’"().,!?:%/&\-]{3,}?)\s*</g;
// 2) Attribute string literals likely user-facing
const ATTR_STR =
  /\b(placeholder|title|aria-label|alt|label)\s*=\s*"([^"]{3,})"/g;

const SKIP_TEXT = [
  /^[A-Z_]{3,}$/, // ALL_CAPS constants
  /^\d/, // starts with number
  /^https?:/, // urls
  /^[A-Z][a-z]+[A-Z]/, // CamelCase symbol-like
];

const NEEDLE_LANG = /[a-zA-Z]/;

interface Finding {
  file: string;
  line: number;
  kind: 'text' | 'attr';
  match: string;
}

function scanFile(file: string): Finding[] {
  const txt = readFileSync(file, 'utf8');
  const findings: Finding[] = [];
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip imports / type-only / commented lines
    if (/^\s*(import|export\s+(type|interface)|\/\/|\*)/.test(line)) continue;

    let m: RegExpExecArray | null;
    JSX_TEXT.lastIndex = 0;
    while ((m = JSX_TEXT.exec(line))) {
      const txt = m[1].trim();
      if (!NEEDLE_LANG.test(txt)) continue;
      if (SKIP_TEXT.some((r) => r.test(txt))) continue;
      // Skip JSX-only token noise like \u2014
      if (txt.length < 4) continue;
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        kind: 'text',
        match: txt,
      });
    }
    ATTR_STR.lastIndex = 0;
    while ((m = ATTR_STR.exec(line))) {
      const value = m[2];
      if (!NEEDLE_LANG.test(value)) continue;
      // ignore CSS-only / icon names
      if (/^[a-z-]+$/.test(value) && !value.includes(' ')) continue;
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        kind: 'attr',
        match: `${m[1]}="${value}"`,
      });
    }
  }
  return findings;
}

const allFindings: Finding[] = [];
for (const sub of PRIORITY) {
  const dir = join(ROOT, sub);
  for (const file of walk(dir)) {
    allFindings.push(...scanFile(file));
  }
}

// Group by file
const byFile = new Map<string, Finding[]>();
for (const f of allFindings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file)!.push(f);
}

const sortedFiles = [...byFile.keys()].sort();
console.log(`=== hardcoded strings audit (${allFindings.length} candidates in ${sortedFiles.length} files) ===\n`);

for (const file of sortedFiles) {
  const items = byFile.get(file)!;
  console.log(`${file}  (${items.length})`);
  for (const it of items) {
    console.log(`  L${it.line} [${it.kind}] ${it.match}`);
  }
  console.log('');
}
