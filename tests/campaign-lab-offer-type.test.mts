import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frozenTypeCases } from './fixtures/campaign-lab/offer-type.mts';
import { buildDraftRevisionIdentity, calculateDraftRevision, SINGLE_PRODUCT_OFFER_TEMPLATE } from '../src/lib/campaign-lab/template.ts';
import { isLocalPreviewApproved } from '../src/lib/campaign-lab/export.ts';
import { presentationText } from '../src/lib/campaign-lab/presentation.ts';
import { ADVERTORIAL_MANIFEST } from '../src/lib/campaign-lab/advertorial.ts';

test('offer presentation patch invalidates old approvals without changing campaign, theme or motion identity', () => {
  assert.equal(SINGLE_PRODUCT_OFFER_TEMPLATE.version, '1.0.1');
  assert.equal(ADVERTORIAL_MANIFEST.version, '1.0.0');
  for (const { preview } of frozenTypeCases()) {
    const { brief, draft, asset, theme } = preview;
    const oldDraft = { ...draft, templateVersion: '1.0.0' };
    const oldIdentity = buildDraftRevisionIdentity(brief, oldDraft, asset, theme);
    const newIdentity = buildDraftRevisionIdentity(brief, draft, asset, theme);
    assert.deepEqual({ ...newIdentity, template: oldIdentity.template }, oldIdentity);
    const oldRevision = calculateDraftRevision(brief, oldDraft, asset, theme);
    assert.notEqual(oldRevision, preview.revision);
    const state = { revision: preview.revision, approvalRevision: oldRevision, dirty: false,
      generating: false, imagesReady: true, supportedFormat: true };
    assert.equal(isLocalPreviewApproved(state), false);
    assert.equal(isLocalPreviewApproved({ ...state, approvalRevision: preview.revision }), true);
  }
});

test('frozen campaign inputs, approved long opening and meaningful whitespace remain intact', () => {
  const cases = frozenTypeCases();
  assert.equal(cases.length, 8);
  for (const id of ['rose','fjord','harbor','morrow']) {
    const pair = cases.filter(item=>item.id===id).map(item=>item.preview);
    assert.deepEqual({ ...pair[0].brief, directionId: undefined }, { ...pair[1].brief, directionId: undefined });
    assert.deepEqual(pair[0].asset, pair[1].asset);
    for (const key of ['headline','lede','facts'] as const) assert.deepEqual(pair[0].draft[key],pair[1].draft[key]);
  }
  assert.equal(cases.find(item=>item.id==='rose')!.preview.draft.headline, 'Rose Supply ceramic cup');
  assert.equal(cases.find(item=>item.id==='fjord')!.preview.draft.headline, 'Fjord Works field notebook');
  assert.match(cases.find(item=>item.id==='morrow')!.preview.draft.headline, /^Why Morrow revised/);
  assert.equal(presentationText(' Rose\u00a0Supply  ceramic\u00a0cup '), 'Rose\u00a0Supply ceramic\u00a0cup');
});
