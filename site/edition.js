import {createMap} from './edition-maps.js';
import {mountExplorer} from './edition-explorer.js';
import {mountAnalysis} from './edition-analysis.js';
const {analysis:data,chapters,collaboration}=JSON.parse(document.querySelector('#edition-data').textContent);
const blocks=new Map(data.article.blocks.map(b=>[b.id,b]));
const episodes=[...document.querySelectorAll('.episode')];
const nav=document.querySelector('.reader-nav');
const select=document.querySelector('#chapter-select');
const holder=document.querySelector('#map-holder');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const small=matchMedia('(max-width:810px)');
let manualReduced=false,current=-1,queued=false,motion;
const motionButton=document.querySelector('#motion');
function syncMotion(){
  const off=manualReduced||reduced.matches;
  document.body.classList.toggle('no-motion',off);
  motionButton.setAttribute('aria-pressed',String(off));
  motionButton.textContent=off?'Motion reduced':'Reduce motion';
  if(off&&motion) motion.revert();
}
motionButton.addEventListener('click',()=>{manualReduced=!manualReduced;syncMotion();});
reduced.addEventListener('change',syncMotion);syncMotion();
for(const [i,episode] of episodes.entries()) episode.querySelector('.mobile-map').append(createMap(chapters[i].map_kind,chapters[i].id));
function activate(i){
  if(current===i)return;
  current=i;
  const c=chapters[i];
  select.value=c.id;
  document.querySelector('#progress').textContent=(i+1)+' / '+chapters.length;
  holder.replaceChildren(createMap(c.map_kind,c.id));
  document.querySelector('#map-ref').textContent=c.source_ids.slice(0,2).join(' · ');
  document.querySelector('#map-basis').textContent=c.record_bases.map(b=>({published_argument:'Published argument',retrospective_account:'Reported exchange',hypothetical_example:'Hypothetical example',later_literature:'Later reading'}[b]||b)).join(' · ');
  if(motion)motion.revert();
  if(!document.body.classList.contains('no-motion')&&window.gsap){
    motion=gsap.context(()=>{
      gsap.from(episodes[i].querySelectorAll('[data-ink]'),{y:6,opacity:.5,duration:.45,stagger:.06,clearProps:'opacity,transform'});
      const fig=small.matches?episodes[i].querySelector('.mobile-map'):holder;
      gsap.from(fig.querySelectorAll('[data-trace]'),{opacity:.2,duration:.65,stagger:.08,clearProps:'opacity'});
    });
  }
}
function onScroll(){queued=false;const line=nav.getBoundingClientRect().bottom+Math.min(150,innerHeight*.24);let i=0;for(let n=1;n<episodes.length;n++)if(episodes[n].getBoundingClientRect().top<=line)i=n;activate(i);}
function schedule(){if(!queued){queued=true;requestAnimationFrame(onScroll);}}
window.addEventListener('scroll',schedule,{passive:true});
new ResizeObserver(()=>{document.documentElement.style.setProperty('--nav-height',nav.offsetHeight+'px');schedule();}).observe(nav);
window.addEventListener('resize',schedule,{passive:true});
select.addEventListener('change',()=>{const target=document.getElementById(select.value);select.blur();requestAnimationFrame(()=>window.scrollTo({top:target.getBoundingClientRect().top+window.scrollY-nav.offsetHeight-10,behavior:'instant'}));});
window.addEventListener('hashchange',()=>{revealHash();schedule();});
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
const dialog=document.querySelector('#evidence-dialog'),body=document.querySelector('#evidence-body');
function paragraphDetails(id){const b=blocks.get(id);if(!b)return el('p','Source paragraph unavailable.');const details=el('details');details.append(el('summary','Read the complete paragraph '+id),el('p',b.text));return details;}
function showEvidence(selection){
  body.replaceChildren();
  const records=[...(selection.nodes||[]).map(id=>data.nodes.find(n=>n.id===id)),...(selection.relations||[]).map(id=>data.relations.find(n=>n.id===id))].filter(Boolean);
  for(const r of records){const sec=el('section',undefined,'evidence-section');sec.append(el('h3',r.label||r.type.replaceAll('_',' ')),el('p',r.interpretation||r.rationale),el('p',r.id+' · '+r.review_status.replaceAll('_',' '),'note'));
    for(const span of r.evidence.spans){sec.append(el('blockquote',span.quote),paragraphDetails(span.block_id));}body.append(sec);
  }
  for(const id of selection.paragraphs||[]){const b=blocks.get(id);if(b){const sec=el('section',undefined,'evidence-section');sec.append(el('h3',id+' · '+b.section),el('p',b.text));const a=el('a','Read in the full text');a.href='#text-'+id;a.addEventListener('click',()=>dialog.close());sec.append(a);body.append(sec);}}
  if(!dialog.open)dialog.showModal();
}
document.querySelector('#close-evidence').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('click',e=>{const source=e.target.closest('[data-paragraph],[data-nodes]');if(source)showEvidence(source.dataset.paragraph?{paragraphs:[source.dataset.paragraph]}:{nodes:source.dataset.nodes.split(',')});});
mountExplorer(document.querySelector('#explorer'),data,showEvidence);
mountAnalysis(document.querySelector('#analysis-explorer'),collaboration,{
  openParagraph:id=>showEvidence({paragraphs:[id]}),
  openNodes:ids=>showEvidence({nodes:ids}),
  openRelations:ids=>showEvidence({relations:ids}),
});
const termSelect=document.querySelector('#term'),termBars=document.querySelector('#term-bars'),termPassages=document.querySelector('#term-passages');
let sectionFilter='';
function markedText(text,spans){const f=document.createDocumentFragment();let pos=0;for(const s of [...spans].sort((a,b)=>a.start-b.start)){f.append(document.createTextNode(text.slice(pos,s.start)),el('mark',text.slice(s.start,s.end)));pos=s.end;}f.append(document.createTextNode(text.slice(pos)));return f;}
function renderTerm(){
  const hits=data.literal_term_occurrences.filter(h=>h.concept===termSelect.value);
  const counts=new Map();for(const h of hits)counts.set(h.section,(counts.get(h.section)||0)+1);
  termBars.replaceChildren();const max=Math.max(...counts.values(),1);
  for(const [name,count] of counts){const b=el('button',undefined,'term-bar');b.type='button';b.setAttribute('aria-pressed',String(sectionFilter===name));const label=el('span');label.append(el('span',name),el('strong',String(count)));const bar=el('i');bar.style.setProperty('--width',100*count/max+'%');b.append(label,bar);b.addEventListener('click',()=>{sectionFilter=sectionFilter===name?'':name;renderTerm();});termBars.append(b);}
  termPassages.replaceChildren();const shown=hits.filter(h=>!sectionFilter||h.section===sectionFilter);const blockIds=[...new Set(shown.map(h=>h.block_id))];termPassages.append(el('p',shown.length+' matches in '+blockIds.length+' passages'+(sectionFilter?' · '+sectionFilter:''),'note'));
  for(const id of blockIds){const p=el('section',undefined,'term-passage');const b=el('button',id);b.type='button';b.dataset.paragraph=id;const content=el('p');content.append(markedText(blocks.get(id).text,shown.filter(h=>h.block_id===id)));p.append(b,content);termPassages.append(p);}
  termPassages.scrollTop=0;
}
termSelect.addEventListener('change',()=>{sectionFilter='';renderTerm();});renderTerm();
const search=document.querySelector('#article-search');
const allParagraphs=[...document.querySelectorAll('.full-paragraph')];
let previousOpen=[];
function searchArticle(){
  const q=search.value.trim().toLocaleLowerCase();
  let count=0;
  for(const p of allParagraphs){const text=p.querySelector('.paragraph-text');const original=blocks.get(p.id.replace('text-','')).text;const pos=original.toLocaleLowerCase().indexOf(q);p.hidden=Boolean(q&&pos<0);text.replaceChildren(document.createTextNode(original));if(q&&pos>=0){text.replaceChildren(document.createTextNode(original.slice(0,pos)),el('mark',original.slice(pos,pos+q.length)),document.createTextNode(original.slice(pos+q.length)));count++;}}
  for(const d of document.querySelectorAll('.article-section')){d.hidden=Boolean(q&&![...d.querySelectorAll('.full-paragraph')].some(p=>!p.hidden));d.open=q?!d.hidden:previousOpen.includes(d);}
  document.querySelector('#search-status').textContent=q?count+' matching passages':'';
}
search.addEventListener('focus',()=>{if(!search.value)previousOpen=[...document.querySelectorAll('.article-section[open]')];});
search.addEventListener('input',searchArticle);
function revealHash(){const id=location.hash.slice(1);if(!id.startsWith('text-'))return;const target=document.getElementById(id);if(!target)return;if(search.value){search.value='';searchArticle();}target.closest('details').open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}
revealHash();onScroll();
