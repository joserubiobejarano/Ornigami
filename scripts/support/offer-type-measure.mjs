/** Read-only DOM measurement; callable through the browser's documented evaluate. */
export function measureOfferType() {
  const article=document.querySelector('[data-preview-canvas] article')??document.querySelector('article');
  const heading=article.querySelector('h1'); const style=getComputedStyle(heading);
  const box=element=>{const b=element.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
  const lines=[];
  for(const node of heading.childNodes){
    if(node.nodeType!==3)continue;
    for(let i=0;i<node.textContent.length;i++){
      const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
      const rect=range.getBoundingClientRect();if(!rect.width)continue;
      let line=lines.find(line=>Math.abs(line.y-rect.y)<2);
      if(!line){line={y:rect.y,text:''};lines.push(line);}line.text+=node.textContent[i];
    }
  }
  const image=article.querySelector('img');
  return {viewport:{width:innerWidth,height:innerHeight},article:box(article),column:box(heading.parentElement),
    heading:box(heading),text:heading.textContent,fontSize:style.fontSize,lineHeight:style.lineHeight,
    fontFamily:style.fontFamily,wordBreak:style.wordBreak,overflowWrap:style.overflowWrap,lines,
    offer:box(article.querySelector('[data-role="offer"]')??article.querySelector('div[class*="_offer__"]')),
    action:box(article.querySelector('[data-role="action"]')??article.querySelector('a')),
    image:box(image),imageLoaded:image.complete&&image.naturalWidth>0,
    imageFit:getComputedStyle(image).objectFit,
    headingOverflow:heading.scrollWidth>heading.clientWidth||heading.getBoundingClientRect().width>heading.parentElement.getBoundingClientRect().width+0.1,
    documentOverflow:document.documentElement.scrollWidth>innerWidth};
}
