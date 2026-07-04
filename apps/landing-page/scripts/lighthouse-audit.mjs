import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'lighthouse-reports');

const BASE_URL = process.env.AUDIT_URL || 'http://localhost:5173';
const PRESETS = {
  perf: 'performance,accessibility,best-practices,seo',
};

const PAGES = [
  { name: 'home', path: '/en' },
  { name: 'faq', path: '/en/faq' },
  { name: 'tokenomics', path: '/en/tokenomics' },
  { name: 'press-kit', path: '/en/press-kit' },
  { name: 'ideas', path: '/en/ideas' },
  { name: 'privacy', path: '/en/privacy' },
];

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const summary = [];

for (const page of PAGES) {
  const url = `${BASE_URL}${page.path}`;
  const outFile = resolve(REPORTS_DIR, `${page.name}.report.json`);
  const cmd = [
    'lighthouse',
    url,
    `--output=json`,
    `--output-path=${outFile}`,
    '--chrome-flags="--headless --no-sandbox --disable-gpu"',
    `--only-categories=${PRESETS.perf}`,
    '--quiet',
    '--no-enable-error-reporting',
  ].join(' ');

  console.log(`\n🔍 Auditing: ${page.name} (${url})`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
    const report = JSON.parse(String(execSync(`cat ${outFile}`, { cwd: ROOT })));
    const scores = {};
    for (const [key, cat] of Object.entries(report.categories)) {
      scores[key] = Math.round(cat.score * 100);
    }
    summary.push({ name: page.name, url, ...scores });
    console.log(`  ✅ perf=${scores.performance} a11y=${scores.accessibility} bp=${scores['best-practices']} seo=${scores.seo}`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    summary.push({ name: page.name, url, error: err.message });
  }
}

console.log('\n═══════════════════════════════════════');
console.log('  LIGHTHOUSE AUDIT SUMMARY');
console.log('═══════════════════════════════════════');
console.table(summary);

const md = `# Lighthouse Audit — ${new Date().toISOString().split('T')[0]}

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
${summary.map(p => `| ${p.name} | ${p.performance ?? '—'} | ${p.accessibility ?? '—'} | ${p['best-practices'] ?? '—'} | ${p.seo ?? '—'} |`).join('\n')}

${summary.filter(p => (p.performance ?? 100) < 90 || (p.accessibility ?? 100) < 95 || (p.seo ?? 100) < 95).length > 0 ? '### ❌ Below targets\n' + summary.filter(p => (p.performance ?? 100) < 90 || (p.accessibility ?? 100) < 95 || (p.seo ?? 100) < 95).map(p => `- ${p.name}: perf=${p.performance} a11y=${p.accessibility} seo=${p.seo}`).join('\n') : '### ✅ All pages meet targets'}
`;

writeFileSync(resolve(REPORTS_DIR, 'summary.md'), md, 'utf-8');
console.log(`\n📊 Summary: ${REPORTS_DIR}/summary.md`);
console.log(`   Open reports: lighthouse --view <report.json>`);
