import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]??'.local/typography');
type Box={width:number;height:number;y:number};
type Row={phase:string;name:string;pane:string;viewport:{width:number};text:string;fontSize:string;
  lines:{text:string}[];article:Box;heading:Box;image:Box;offer:Box;action:Box;imageFit:string;imageLoaded:boolean;
  headingOverflow:boolean;documentOverflow:boolean};
const rows:Row[]=JSON.parse(readFileSync(resolve(root,'matrix-final.json'),'utf8'));
assert.equal(rows.length,168);
const summary=[];
for(const after of rows.filter(row=>row.phase==='after')) {
  const before=rows.find(row=>row.phase==='before'&&row.name===after.name&&row.pane===after.pane&&row.viewport.width===after.viewport.width)!;
  assert.ok(before);
  assert.equal(after.text,before.text,'approved heading unchanged');
  assert.equal(after.imageFit,before.imageFit);
  assert.equal(after.imageLoaded,true);
  assert.equal(after.headingOverflow,false);assert.equal(after.documentOverflow,false);
  assert.ok(parseFloat(after.fontSize)>=32,'legible floor, independent of copy length');
  if(Math.abs(after.article.width-before.article.width)<0.1) {
    assert.ok(Math.abs(after.image.width-before.image.width)<0.1,'packshot width unchanged at matching article width');
    assert.ok(Math.abs(after.image.height-before.image.height)<0.1,'packshot framing unchanged');
  } else {
    // One long-copy tablet case loses its 15px scrollbar after compaction.
    assert.equal(Math.abs(after.article.width-before.article.width),15);
    assert.ok(Math.abs(after.image.width/after.image.height-before.image.width/before.image.height)<0.001,'natural image ratio retained');
  }
  assert.equal(after.action.height,before.action.height,'action size unchanged');
  assert.equal(after.offer.height,before.offer.height,'offer size unchanged');
  if(['rose-clear','fjord-clear','harbor-clear'].includes(after.name)&&after.pane==='-pane909') {
    assert.equal(before.lines.length,4);assert.ok(after.lines.length>=2&&after.lines.length<=3);
  }
  summary.push({name:after.name,viewport:after.viewport.width,pane:after.pane,
    column:after.heading.width,before:{font:before.fontSize,lines:before.lines.length,height:before.heading.height,offerY:before.offer.y,actionY:before.action.y},
    after:{font:after.fontSize,lines:after.lines.length,height:after.heading.height,offerY:after.offer.y,actionY:after.action.y}});
}
const before=JSON.parse(readFileSync(resolve(root,'before/frozen.json'),'utf8'));
const after=JSON.parse(readFileSync(resolve(root,'after/frozen.json'),'utf8'));
assert.equal(before.length,after.length);
for(let i=0;i<before.length;i++) {
  assert.equal(before[i].draft.templateVersion,'1.0.0');assert.equal(after[i].draft.templateVersion,'1.0.1');
  assert.notEqual(before[i].revision,after[i].revision);
  assert.deepEqual({...after[i],revision:before[i].revision,draft:{...after[i].draft,templateVersion:'1.0.0'}},before[i],'only presentation version changes frozen inputs');
}
mkdirSync(resolve(root,'verified'),{recursive:true});
writeFileSync(resolve(root,'verified/summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({measurements:rows.length,comparedPairs:summary.length,mainCampaigns:8,stressCases:6,failedChecks:0}));
