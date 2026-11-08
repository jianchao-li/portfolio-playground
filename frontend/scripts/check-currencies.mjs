#!/usr/bin/env node
// Checks that the currency list bundled with the frontend
// (src/lib/currencies.json) matches SUPPORTED_CURRENCIES in the backend
// (backend/app/services/currency.py): same codes, names, flags and order.
//
// Usage: npm run check:currencies   (needs python3 on PATH; stdlib only)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendFile = resolve(here, '../src/lib/currencies.json');
const backendFile = resolve(here, '../../backend/app/services/currency.py');

// Read the dict literal with Python's ast module, so the backend's
// dependencies (pandas, yfinance) don't need to be installed.
const extract = `
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
for node in tree.body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "SUPPORTED_CURRENCIES" for t in node.targets):
        d = ast.literal_eval(node.value)
        print(json.dumps([{"code": c, "name": i["name"], "flag": i["flag"]} for c, i in d.items()]))
        break
else:
    sys.exit("SUPPORTED_CURRENCIES not found")
`;

const backend = JSON.parse(execFileSync('python3', ['-c', extract, backendFile], { encoding: 'utf-8' }));
const frontend = JSON.parse(readFileSync(frontendFile, 'utf-8'));

const key = (c) => `${c.code} | ${c.name} | ${c.flag}`;
const backendKeys = backend.map(key);
const frontendKeys = frontend.map(key);
const missing = backendKeys.filter((k) => !frontendKeys.includes(k));
const extra = frontendKeys.filter((k) => !backendKeys.includes(k));
const sameOrder = backendKeys.join('\n') === frontendKeys.join('\n');

if (missing.length || extra.length || !sameOrder) {
  console.error('src/lib/currencies.json is out of sync with backend SUPPORTED_CURRENCIES.');
  missing.forEach((k) => console.error(`  missing: ${k}`));
  extra.forEach((k) => console.error(`  extra:   ${k}`));
  if (!missing.length && !extra.length) console.error('  same entries, different order');
  process.exit(1);
}
console.log(`Currency list in sync (${frontend.length} currencies).`);
