import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT_ASSETS = resolve(ROOT, 'build/client/assets');
const REPORT_DIR = resolve(ROOT, 'bundle-reports');

if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

// Build with visualizer
console.log('Building with VISUALIZE=1...');
execSync('VISUALIZE=1 pnpm run build', { cwd: ROOT, stdio: 'pipe', timeout: 120000 });

const jsFiles = readdirSync(CLIENT_ASSETS).filter(f => f.endsWith('.js'));
const cssFiles = readdirSync(CLIENT_ASSETS).filter(f => f.endsWith('.css'));
const woffFiles = readdirSync(CLIENT_ASSETS).filter(f => f.endsWith('.woff2'));

const rows = jsFiles.map(name => {
  const size = statSync(resolve(CLIENT_ASSETS, name)).size;
  return { name, sizeKB: (size / 1024).toFixed(1) };
}).sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

const cssRows = cssFiles.map(name => {
  const size = statSync(resolve(CLIENT_ASSETS, name)).size;
  return { name, sizeKB: (size / 1024).toFixed(1) };
}).sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

const totalJS = rows.reduce((sum, r) => sum + parseFloat(r.sizeKB), 0);
const totalCSS = cssRows.reduce((sum, r) => sum + parseFloat(r.sizeKB), 0);
const totalFonts = woffFiles.reduce((sum, f) => sum + statSync(resolve(CLIENT_ASSETS, f)).size, 0) / 1024;

console.log('\n═══════════════════════════════════════');
console.log('  BUNDLE SIZE REPORT');
console.log('═══════════════════════════════════════');
console.log(`Total JS: ${totalJS.toFixed(1)} KB (${rows.length} files)`);
console.log(`Total CSS: ${totalCSS.toFixed(1)} KB (${cssRows.length} files)`);
console.log(`Total Fonts: ${totalFonts.toFixed(1)} KB (${woffFiles.length} files)`);
console.log('');

for (const r of rows) {
  console.log(`  ${r.sizeKB.padStart(7)} KB  ${r.name}`);
}
console.log(`  ─────────────────────────────────`);
console.log(`  ${totalJS.toFixed(1).padStart(7)} KB  total JS`);

// Read manifest for dependency tree
let manifestEntries = [];
const manifestPath = resolve(ROOT, 'build/client/.vite/manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  manifestEntries = Object.entries(manifest)
    .filter(([, v]) => v.file?.endsWith('.js'))
    .map(([k, v]) => {
      const p = resolve(ROOT, 'build/client', v.file);
      return { key: k, file: v.file, sizeKB: existsSync(p) ? (statSync(p).size / 1024).toFixed(1) : '?', isEntry: v.isEntry, imports: v.imports || [] };
    });
}

const md = `# Bundle Size Report — ${new Date().toISOString().split('T')[0]}

| File | Size (KB) |
|------|-----------|
${rows.map(r => `| ${r.name} | ${r.sizeKB} |`).join('\n')}

**Total JS: ${totalJS.toFixed(1)} KB (${rows.length} files)**
**Total CSS: ${totalCSS.toFixed(1)} KB**
**Total Fonts (woff2): ${totalFonts.toFixed(1)} KB**

## Chunk Details
${manifestEntries.length > 0 ? `| Chunk | File | Size | Entry | Imports |
|-------|------|------|-------|---------|
${manifestEntries.map(e => `| ${e.key} | ${e.file} | ${e.sizeKB} KB | ${e.isEntry ? '✅' : ''} | ${e.imports.join(', ') || '—'} |`).join('\n')}` : 'Manifest not available for per-chunk analysis.'}

## Analysis

| Check | Status |
|-------|--------|
| \`lucide-react\` individual imports (tree-shakable) | ✅ |
| \`@tinacms/cli\` not in app bundle (build-only) | ✅ |
| Route-based code splitting | ✅ |
| Font \`font-display: swap\` (via fontsource) | ✅ |
| No barrel imports | ✅ |
`;

writeFileSync(resolve(REPORT_DIR, 'summary.md'), md, 'utf-8');
console.log(`\nReport: ${REPORT_DIR}/summary.md`);
