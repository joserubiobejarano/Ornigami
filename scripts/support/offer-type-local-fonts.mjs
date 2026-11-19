// Reuse already-built font bytes for offline type qualification. Never fetches.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const previousBuild = resolve(process.argv[2] ?? '');
const output = resolve('.local/type-fonts');
mkdirSync(output, { recursive: true });
const all = readdirSync(join(previousBuild, 'static/css')).flatMap(file =>
  readFileSync(join(previousBuild, 'static/css', file), 'utf8').match(/@font-face\s*\{[^}]+\}/g) ?? []);
const definitions = [
  ['Bricolage Grotesque', 'Bricolage+Grotesque:wght@700;800'],
  ['Geist Mono', 'Geist+Mono:wght@400;600'],
  ['Inter', 'Inter:wght@400;500;600'],
  ['EB Garamond', 'EB+Garamond:wght@400;500'],
  ['Jost', 'Jost:wght@400;500;600;700'],
];
const responses = {};
for (const [family, query] of definitions) {
  const rules = [...new Set(all.filter(rule => rule.includes(`font-family:${family};`) && rule.includes('src:url(')))];
  if (!rules.length) throw new Error(`Installed build has no font bytes for ${family}`);
  responses[`https://fonts.googleapis.com/css2?family=${query}&display=swap`] = rules.map(rule => rule.replace('src:url(', 'src: url(').replace(/url\(\/_next\/static\/media\/([^\)]+)\)/g, (_match, name) => {
    copyFileSync(join(previousBuild, 'static/media', name), join(output, name));
    // Next's offline hook recognizes absolute slash-prefixed paths. On Windows
    // a drive-root path uses the current worktree's drive (all bytes are local).
    const local = join(output, name).replaceAll('\\', '/').replace(/^[A-Za-z]:/, '');
    return `url(${local})`;
  })).join('\n');
}
writeFileSync(join(output, 'responses.cjs'), `module.exports = ${JSON.stringify(responses, null, 2)};\n`);
console.log('Prepared offline responses from existing local font bytes. No font-family substitution.');
