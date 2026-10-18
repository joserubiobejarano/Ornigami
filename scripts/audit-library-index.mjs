import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!['--source', '--output'].includes(key) || !argv[i + 1]) throw new Error('Usage: node scripts/audit-library-index.mjs --source PATH --output PATH');
    out[key.slice(2)] = argv[++i];
  }
  if (!out.source || !out.output) throw new Error('Usage: node scripts/audit-library-index.mjs --source PATH --output PATH');
  return out;
}

function walk(root, current = root, symlinks = []) {
  const items = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const item of items) {
    const full = path.join(current, item.name);
    if (item.isSymbolicLink()) { symlinks.push({ path: path.relative(root, full).split(path.sep).join('/'), reason: 'symbolic link skipped; not followed' }); continue; }
    if (item.isDirectory()) files.push(...walk(root, full, symlinks));
    else if (item.isFile()) files.push(full);
  }
  return files;
}

function classify(rel) {
  const p = rel.toLowerCase();
  if (p.includes('_licenses/') || p.includes('_licenses\\')) return 'license';
  if (p.includes('_archive/') || p.includes('history/')) return 'historical';
  if (/(^|\/)(readme|00-start-here|project-scope|project-checklist-coverage|image-coverage|reorganization|review-and-changes)\.md$/i.test(rel.replaceAll('\\', '/'))) return 'navigation';
  if (/template/i.test(p)) return 'template';
  if (/template|sample|example|worksheet|\.csv$/i.test(p)) return 'worksheet';
  if (/skill|plugin/i.test(p)) return 'skill-reference';
  if (/\.zip$/i.test(p) || !/\.(md|csv|json|txt)$/i.test(p)) return 'archive';
  return 'current-guide';
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, recordContent = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      recordContent = true;
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) { quoted = true; recordContent = true; }
    else if (c === ',') { row.push(field); field = ''; recordContent = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (recordContent) rows.push(row);
      row = []; recordContent = false;
    } else { field += c; recordContent = true; }
  }
  if (quoted) throw new Error('Malformed CSV: unclosed quoted field');
  row.push(field);
  if (recordContent) rows.push(row);
  if (!rows.length) return { headers: [], rowCount: 0, rows: [] };
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const rowWidths = dataRows.map((values, i) => ({ row: i + 2, width: values.length }));
  return { headers, rowCount: dataRows.length, rows: dataRows.map(values => ({ values })), rowWidthDiscrepancies: rowWidths.filter(x => x.width !== headers.length) };
}

function markdownMetadata(text, sourcePath) {
  const headings = [], checks = [];
  let heading = '';
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) { heading = h[2].trim(); headings.push({ level: h[1].length, text: heading, line: i + 1 }); }
    const box = lines[i].match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\[([ xX])\]\s*(.*)$/);
    if (box) {
      const id = crypto.createHash('sha256').update(`${sourcePath}:${i + 1}`).digest('hex').slice(0, 16);
      checks.push({ id, source_path: sourcePath, line: i + 1, heading, text: box[2].trim(), source_checked: box[1].toLowerCase() === 'x', status: 'source-reference-only' });
    }
  }
  return { headings, checks };
}

const { source, output } = args(process.argv);
const sourceRoot = fs.realpathSync(path.resolve(source)), outputPath = path.resolve(output);
if (!fs.statSync(sourceRoot).isDirectory()) throw new Error(`Source is not a directory: ${sourceRoot}`);
function physicalPath(candidate) {
  let ancestor = path.resolve(candidate), suffix = [];
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}
function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
const physicalOutput = physicalPath(outputPath);
const physicalLicenseDir = physicalPath(path.join(path.dirname(outputPath), 'licenses'));
if (inside(sourceRoot, physicalOutput) || inside(sourceRoot, physicalLicenseDir)) throw new Error('Output and copied-license paths must be outside the source tree.');
const records = [], allChecks = [], csvFiles = [];
const skippedSymlinks = [];
for (const full of walk(sourceRoot, sourceRoot, skippedSymlinks)) {
  const rel = path.relative(sourceRoot, full).split(path.sep).join('/');
  const bytes = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const record = { path: rel, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), type: ext.slice(1) || 'no-extension', source_role: classify(rel) };
  if (ext === '.md') {
    const meta = markdownMetadata(bytes.toString('utf8'), rel);
    record.headings = meta.headings;
    record.check_count = meta.checks.length;
    allChecks.push(...meta.checks);
  } else if (ext === '.csv') {
    const parsed = parseCsv(bytes.toString('utf8'));
    record.csv = { headers: parsed.headers, row_count: parsed.rowCount, rows: parsed.rows, row_width_discrepancies: parsed.rowWidthDiscrepancies, classification: 'reference-worksheet-examples; not project results' };
    csvFiles.push(record);
  } else if (ext === '.json') {
    try { const data = JSON.parse(bytes.toString('utf8')); record.json_metadata = { valid_json: true, root_type: Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data, top_level_keys: data && !Array.isArray(data) && typeof data === 'object' ? Object.keys(data) : [] }; }
    catch { record.json_metadata = { valid_json: false, classification: 'metadata-only; parse failed' }; }
  } else if (!['.txt'].includes(ext)) record.expansion = 'hash-only; archive/binary not expanded';
  records.push(record);
}
const duplicateCounts = new Map();
for (const check of allChecks) duplicateCounts.set(check.text, (duplicateCounts.get(check.text) || 0) + 1);
const duplicateCheckTextCount = [...duplicateCounts.values()].filter(n => n > 1).reduce((sum, n) => sum + n, 0);
const moduleFolders = {
  '01': ['security-and-privacy'], '03': ['accessibility'], '04': ['features-and-product'],
  '05': ['code-quality-and-architecture'], '07': ['ai-safety-and-quality'],
  '08': ['cost-quotas-and-abuse'], '09': ['reliability-and-data-integrity'],
  '10': ['observability-and-operations'], '11': ['legal-licensing-and-content-ip'],
  '12': ['vps-coolify-dns-and-network'], '13': ['payments-and-entitlements'],
  '14': ['integrations-email-and-webhooks'], '15': ['testing-and-release-assurance'],
  '16': ['launch-readiness'], '17': ['hosting-migration-and-portability']
};
const moduleInventory = Object.fromEntries(Object.entries(moduleFolders).map(([module, folders]) => {
  const files = records.filter(r => folders.some(folder => r.path.toLowerCase().startsWith(`${folder}/`)));
  return [module, { group_paths: folders, file_count: files.length, files: files.map(r => r.path) }];
}));
const csvRowCount = csvFiles.reduce((n, r) => n + r.csv.row_count, 0);
const licenseFiles = records.filter(r => r.source_role === 'license').map(r => {
  const sourcePath = path.join(sourceRoot, ...r.path.split('/'));
  const destination = path.join(path.dirname(outputPath), 'licenses', path.basename(r.path));
  if (inside(sourceRoot, physicalPath(destination))) throw new Error(`License destination resolves inside the source tree: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(sourcePath, destination);
  const copied = fs.readFileSync(destination);
  return { source_path: r.path, copied_to: path.relative(path.dirname(outputPath), destination).split(path.sep).join('/'), source_sha256: r.sha256, copied_sha256: crypto.createHash('sha256').update(copied).digest('hex'), bytes: copied.length, byte_for_byte_copy: copied.equals(fs.readFileSync(sourcePath)) };
});
const index = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_root: sourceRoot,
  stable_id_note: 'Checklist IDs are stable for a source snapshot and derive from source path plus line number; inserting or removing earlier lines changes IDs for later checklist items.',
  skipped_symlinks: skippedSymlinks,
  license_provenance: licenseFiles,
  statement: 'This is an inventory and source-control extraction, NOT manual semantic coverage or an executed audit. Extracted checkboxes and CSV rows are source references only; they do not represent project results or project passes.',
  source_notes: [
    { kind: 'missing_external_module_reference', module: '02', note: '00-Start-Here references the design audit at ../Marketing/skills/design/Audit/00-START-HERE.md; that external reference is not present in this source collection.' },
    { kind: 'missing_module', module: '06', note: '00-Start-Here explicitly states that the performance and SEO module is absent from this collection.' }
  ],
  counts: { totalFiles: records.length, totalMarkdown: records.filter(r => r.type === 'md').length, checks: allChecks.length, csvFiles: csvFiles.length, csvRows: csvRowCount, duplicateCheckTextCount },
  module_inventory: moduleInventory,
  files: records,
  checks: allChecks
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify(index.counts));
