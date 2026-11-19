import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BASE_CATALOG, CAMPAIGN_FIXTURES, createFormValues } from '../../../src/lib/campaign-lab/fixtures.ts';
import { buildBrowserOfferCatalog } from '../../../src/lib/campaign-lab/browser-offer.ts';
import { resolveVisualDirection } from '../../../src/lib/campaign-lab/visual-directions.ts';
import { buildCampaignPreview } from '../../../src/lib/campaign-lab/template.ts';
import type { CampaignCatalog } from '../../../src/lib/campaign-lab/types.ts';

export function frozenTypeCases() {
  return ['rose', 'fjord', 'harbor', 'morrow'].flatMap(id => ['clear', 'editorial'].map(directionId => {
    let fixture; let catalog: CampaignCatalog;
    if (id === 'rose' || id === 'fjord') {
      const brief = JSON.parse(readFileSync(new URL(`../../../docs/examples/brand-review/${id}/brief.json`, import.meta.url), 'utf8'));
      const bytes = readFileSync(new URL(`../../../docs/examples/brand-review/${id}/packshot.png`, import.meta.url));
      const built = buildBrowserOfferCatalog({ ...brief, directionId, reviewedOn: '2026-11-19',
        confirmations: { offer: brief.offer, destination: brief.destinationUrl, rights: brief.rights },
        packshot: { src: `data:image/png;base64,${bytes.toString('base64')}`, width: 600, height: 700,
          alt: brief.alt, rights: brief.rights, contentHash: createHash('sha256').update(bytes).digest('hex') } });
      fixture = built.fixture; catalog = built.catalog;
    } else {
      fixture = structuredClone(CAMPAIGN_FIXTURES[id === 'harbor' ? 'sparse' : 'long-copy']);
      const direction = resolveVisualDirection(directionId);
      const brand = BASE_CATALOG.brands[fixture.brief.brandId];
      catalog = { ...BASE_CATALOG, brands: { ...BASE_CATALOG.brands,
        [brand.id]: { ...brand, tokens: direction.tokens, visualDirection: { id: direction.id, version: direction.version } } } };
    }
    const values = { ...createFormValues(fixture, catalog), format: 'offer' as const };
    const built = buildCampaignPreview(fixture, values, catalog);
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    return { id, directionId, preview: built.preview };
  }));
}
