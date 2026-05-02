import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { translations } from '../lib/translations';

const ROOT = join(__dirname, '..');
const SRC_DIRS = [join(ROOT, 'src'), join(ROOT, 'lib')];
const EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'database.types.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

function flatten(obj: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        for (const sub of flatten(v, path)) keys.add(sub);
      } else {
        keys.add(path);
      }
    }
  }
  return keys;
}

const enKeys = flatten((translations as Record<string, unknown>)['en-US']);
const ptKeys = flatten((translations as Record<string, unknown>)['pt-BR']);

// 1) collect all t('x.y') / t("x.y") direct references, plus any literal
//    that *matches a known key* — catches stored forms like
//    `translationKey: 'navigation.dashboard'` that the direct-call regex
//    would miss.
const T_CALL = /\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]\s*[),]/g;

const refs = new Map<string, Set<string>>(); // key -> files
const allKnownKeys = new Set<string>([...enKeys, ...ptKeys]);

function addRef(key: string, file: string) {
  if (!refs.has(key)) refs.set(key, new Set());
  refs.get(key)!.add(relative(ROOT, file));
}

for (const dir of SRC_DIRS) {
  for (const file of walk(dir)) {
    const txt = readFileSync(file, 'utf8');

    let m: RegExpExecArray | null;
    while ((m = T_CALL.exec(txt))) {
      const key = m[1];
      if (!key.includes('.')) continue;
      addRef(key, file);
    }

    // Scan for any literal that matches a known key — covers stored
    // `translationKey: 'x.y'`, dynamic template roots like `t(\`roles.${r}\`)`
    // (by checking prefixes), and key maps.
    for (const key of allKnownKeys) {
      if (txt.includes(`'${key}'`) || txt.includes(`"${key}"`) || txt.includes(`\`${key}\``)) {
        addRef(key, file);
      }
      // Dynamic prefix: if the file contains a template literal starting with
      // a key prefix (e.g. `roles.${...}`), treat every key under that prefix
      // as referenced.
      const lastDot = key.lastIndexOf('.');
      if (lastDot > 0) {
        const prefix = key.slice(0, lastDot + 1);
        if (txt.includes(`\`${prefix}$`)) addRef(key, file);
      }
    }
  }
}

const referenced = new Set(refs.keys());

const missingFromEn: string[] = [];
const missingFromPt: string[] = [];
for (const key of referenced) {
  if (!enKeys.has(key)) missingFromEn.push(key);
  if (!ptKeys.has(key)) missingFromPt.push(key);
}

const onlyInEn: string[] = [];
const onlyInPt: string[] = [];
for (const k of enKeys) if (!ptKeys.has(k)) onlyInEn.push(k);
for (const k of ptKeys) if (!enKeys.has(k)) onlyInPt.push(k);

const unusedEn: string[] = [];
for (const k of enKeys) if (!referenced.has(k)) unusedEn.push(k);

console.log('=== i18n audit ===');
console.log(`en-US keys: ${enKeys.size}`);
console.log(`pt-BR keys: ${ptKeys.size}`);
console.log(`t() references: ${referenced.size}`);
console.log('');
console.log(`Missing in en-US (${missingFromEn.length}):`);
for (const k of missingFromEn.sort()) {
  console.log(`  ${k}  -> ${[...refs.get(k)!].join(', ')}`);
}
console.log('');
console.log(`Missing in pt-BR (${missingFromPt.length}):`);
for (const k of missingFromPt.sort()) {
  console.log(`  ${k}  -> ${[...refs.get(k)!].join(', ')}`);
}
console.log('');
console.log(`Keys only in en-US (${onlyInEn.length}):`);
for (const k of onlyInEn.sort()) console.log(`  ${k}`);
console.log('');
console.log(`Keys only in pt-BR (${onlyInPt.length}):`);
for (const k of onlyInPt.sort()) console.log(`  ${k}`);
console.log('');
const limit = process.env.AUDIT_FULL ? Infinity : 30;
console.log(`Unused en-US keys (${unusedEn.length}, may be referenced dynamically):`);
for (const k of unusedEn.sort().slice(0, limit)) console.log(`  ${k}`);
if (unusedEn.length > limit) console.log(`  ... +${unusedEn.length - limit} more`);
