import { initExplorer } from './explorer.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data;
let currentStep = 0;
let renderStage = () => {};
let storyTriggers = [];
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
try { if (localStorage.getItem('ai4theology-motion')) reduced = localStorage.getItem('ai4theology-motion') === 'reduced'; } catch {}

const captions = [
  'The original comparison is presented as prose.',
  'Two possible sources. The same assistance and learner activity.',
  'Complete proposal production changes a second condition.',
  'The objection restores the intended comparison. Agreement is not proof.',
  'A hypothetical question shows how feedback could contribute an idea.',
  'The question stays open. Its categories are now under examination.'
];
const kickers = ['THE PUBLISHED PASSAGE','THE CONDITIONS OF THE COMPARISON','A CHANGED CONDITION','A RETURN TO THE QUESTION','FEEDBACK AND IDEA GENERATION','A MORE PRECISE OPEN QUESTION'];

function showEvidence(ids) {
  const records = ids.map(id => data.nodes.find(n => n.id === id)).filter(Boolean);
  $('#dialog-content').innerHTML = records.map(n => {
    const span = n.evidence.spans[0];
    const block = data.article.blocks.find(b => b.id === span?.block_id);
    return `<article class="dialog-record"><p class="evidence-eyebrow">${esc(n.id)} · ${esc(n.record_basis.replaceAll('_',' '))}</p><h3>${esc(n.label)}</h3><blockquote>${esc(n.anchor)}</blockquote><p>${esc(n.interpretation)}</p><details><summary>Read the surrounding paragraph</summary><p>${esc(block?.text || '')}</p></details><p class="small-note">Proposed interpretation · source ${esc(span?.block_id || '')}</p></article>`;
  }).join('');
  $('#evidence-dialog').showModal();
}

function updateStageText(index) {
  currentStep = index;
  $('#stage-kicker').textContent = kickers[index];
  $('#stage-counter').textContent = `${index + 1} / 6`;
  $('#stage-caption').textContent = captions[index];
  $$('.story-step').forEach((el,i)=>el.classList.toggle('is-active',i===index));
  $$('#stage-dots button').forEach((el,i)=> { el.classList.toggle('is-active',i===index); el.setAttribute('aria-pressed',String(i===index)); });
  $('#previous-stage').disabled = index === 0;
  $('#next-stage').disabled = index === 5;
}

function initStory() {
  storyTriggers.forEach(t=>t.kill()); storyTriggers=[];
  $$('.morph-token').forEach(n=>n.remove());
  const stage = $('#stage-screen');
  const paragraph = $('#transform-paragraph');
  $$('.phrase').forEach(p=>{p.style.visibility='visible';p.style.opacity='1';});
  $$('.prose-rest').forEach(p=>p.style.opacity='1');
  const box = stage.getBoundingClientRect();
  const scale = box.width / 600;
  const names = ['human','ai','feedback','work'];
  const tokens = {};
  names.forEach(name=>{
    const original = $('#phrase-'+name);
    const rect = original.getBoundingClientRect();
    const token = document.createElement('div');
    token.className = `morph-token token-${name}`;
    token.setAttribute('aria-hidden','true');
    token.textContent=original.textContent;
    token.dataset.startX=rect.left-box.left;
    token.dataset.startY=rect.top-box.top;
    token.dataset.startW=Math.ceil(rect.width)+1;
    token.dataset.fontSize=parseFloat(getComputedStyle(original).fontSize);
    token.dataset.lineHeight=getComputedStyle(original).lineHeight;
    stage.append(token); tokens[name]=token;
    original.style.opacity='0';
  });
  const destinations = {
    human:{x:45,y:75,w:195}, ai:{x:355,y:75,w:195},
    feedback:{x:180,y:200,w:240}, work:{x:130,y:325,w:340}
  };
  const lines = {
    'line-human':'M145 120 C145 180 270 145 300 200',
    'line-ai':'M455 120 C455 180 330 145 300 200',
    'line-work':'M300 255 L300 325',
    'line-return':'M90 280 C25 280 20 400 130 365',
    'line-example':'M120 215 C120 265 300 270 300 320'
  };
  Object.entries(lines).forEach(([id,d])=>$('#'+id).setAttribute('d',d));
  // Destinations are scaled to the actual panel, preserving a readable mobile state.
  const extras = {
    'outsource-node':{x:320,y:175,w:245},
    'intervention-node':{x:25,y:240,w:230},
    'unspecified-node':{x:335,y:335,w:230},
    'naturalism-node':{x:55,y:80,w:490},
    'overlap-node':{x:85,y:270,w:430},
    'open-question':{x:75,y:145,w:450},
    'condition-tag':{x:160,y:410,w:280}
  };
  if(scale<.7){extras['unspecified-node'].y=310;extras['intervention-node'].y=200;}
  Object.entries(extras).forEach(([id,p])=>Object.assign($('#'+id).style,{left:p.x*scale+'px',top:p.y*scale+'px',width:p.w*scale+'px'}));
  let animation;
  renderStage = (index, animate=true) => {
    updateStageText(index);
    if(animation) animation.kill();
    const duration = animate && !reduced ? .85 : 0;
    const layout = {...destinations};
    if(index===2){layout.feedback={x:35,y:200,w:240};layout.work={x:30,y:325,w:255};}
    if(index===3){layout.feedback={x:330,y:200,w:240};layout.work={x:230,y:340,w:340};}
    const paths = {...lines};
    if(index===2){paths['line-human']='M145 120 L155 200';paths['line-ai']='M455 120 L445 175';paths['line-work']='M155 255 L157 325';}
    if(index===3){paths['line-human']='M145 120 C145 175 420 160 450 200';paths['line-ai']='M455 120 L450 200';paths['line-work']='M450 255 C450 305 400 305 400 340';paths['line-return']='M140 325 C140 375 200 375 230 375';}
    Object.entries(paths).forEach(([id,d])=>$('#'+id).setAttribute('d',d));
    const hasGSAP = Boolean(window.gsap);
    animation = hasGSAP ? gsap.timeline({defaults:{duration,ease:'power3.inOut'}}) : null;
    function to(el,values,at=0){
      if(hasGSAP) animation.to(el,values,at);
      else {
        if(values.x!==undefined)el.style.left=values.x+'px';
        if(values.y!==undefined)el.style.top=values.y+'px';
        for(const [key,value] of Object.entries(values))if(!['x','y','duration','ease'].includes(key))el.style[key]=typeof value==='number' && ['width','padding','borderRadius','fontSize'].includes(key)?value+'px':String(value);
      }
    }
    names.forEach(name=>{
      const token=tokens[name],p=layout[name];
      const isProse=index===0;
      let visible=index<=3;
      to(token,{
        x:isProse?Number(token.dataset.startX):p.x*scale,
        y:isProse?Number(token.dataset.startY):p.y*scale,
        width:isProse?Number(token.dataset.startW):p.w*scale,
        padding:isProse?0:12*scale,
        borderRadius:isProse?0:9,
        fontSize:isProse?Number(token.dataset.fontSize):Math.max(14,19*scale),
        lineHeight:isProse?token.dataset.lineHeight:'1.5',
        backgroundColor:isProse?'transparent':({human:'#f9e0c9',ai:'#e1e3ff',feedback:'#d8f4eb',work:'#e7eef2'}[name]),
        opacity:visible?1:0,
      });
    });
    $$('.prose-rest').forEach(el=>to(el,{opacity:index===0?1:0},0));
    ['line-human','line-ai','line-work'].forEach(id=>to($('#'+id),{opacity:index>=1&&index<=3?1:0},duration*.25));
    to($('#line-return'),{opacity:index===3?1:0},duration*.25);
    to($('#line-example'),{opacity:index===4?1:0},duration*.25);
    Object.keys(extras).forEach(id=>{
      const active = (['outsource-node','unspecified-node'].includes(id)&&index===2)||(id==='intervention-node'&&index===3)||(['naturalism-node','overlap-node'].includes(id)&&index===4)||(id==='open-question'&&index===5)||(id==='condition-tag'&&index===1);
      to($('#'+id),{opacity:active?1:0,scale:active?1:.96},active?duration*.2:0);
      $('#'+id).setAttribute('aria-hidden',String(!active));
    });
    stage.dataset.state=String(index);
  };
  renderStage(currentStep,false);
  if(window.ScrollTrigger){
    gsap.registerPlugin(ScrollTrigger);
    const readingLine=matchMedia('(max-width:760px) and (min-height:621px)').matches?'78%':'56%';
    $$('.story-step').forEach((step,index)=>{
      storyTriggers.push(ScrollTrigger.create({trigger:step,start:'top '+readingLine,end:'bottom '+readingLine,onEnter:()=>renderStage(index),onEnterBack:()=>renderStage(index)}));
    });
  }else{
    const observer=new IntersectionObserver(entries=>{entries.filter(e=>e.isIntersecting).forEach(e=>renderStage(Number(e.target.dataset.step),false));},{rootMargin:'-25% 0px -35% 0px'});
    $$('.story-step').forEach(step=>observer.observe(step));
    storyTriggers.push({kill:()=>observer.disconnect()});
  }
}

function goStage(index){
  index=Math.max(0,Math.min(5,index));
  const step=$$('.story-step')[index];
  const phone=matchMedia('(max-width:760px) and (min-height:621px)').matches;
  const top=step.getBoundingClientRect().top+window.scrollY-innerHeight*(phone ? .62 : .3);
  // Jump directly between reading stages; animate only the diagram, avoiding
  // intermediate stages firing during programmatic page scrolling.
  window.scrollTo({top,behavior:'instant'});
  if(window.ScrollTrigger)ScrollTrigger.update();
  renderStage(index);
}

function renderComparison(id){
  const comparison=data.comparisons.find(c=>c.id===id);
  const labels={assistance_source:'Source of assistance',assistance_kind:'Kind of assistance',learner_activity:'Learner’s activity',assessed_capacity:'Assessed capacity'};
  const values={human:'A person',AI:'An AI system',advice_and_feedback:'Advice and feedback',critical_development:'Critical development',complete_proposal_production:'A complete proposal'};
  $('#comparison-grid').innerHTML=`<div class="comparison-row comparison-head"><span>CONDITION</span><span>HUMAN FEEDBACK</span><span>${id==='C01'?'AI FEEDBACK':'AI PROPOSAL'}</span><span>COMPARISON</span></div>`+comparison.fields.map(f=>`<div class="comparison-row ${f.status==='different'?'is-different':''}"><span class="field-name">${labels[f.field]}</span><span class="case-value">${values[f.baseline]||'Not specified'}</span><span class="case-value">${values[f.variant]||'Not specified'}</span><span class="diff-badge ${f.status}">${f.status==='same'?'Same':f.status==='different'?'Changed':'Unknown'}</span></div>`).join('');
  $('#comparison-result').textContent=id==='C01'?'The source changes. The stated assistance and learner activity remain comparable.':'The kind of assistance changes too. This is a different comparison.';
  $$('[data-comparison]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.comparison===id)));
  if(window.gsap&&!reduced)gsap.from('#comparison-grid .comparison-row:not(.comparison-head)',{opacity:0,y:8,stagger:.06,duration:.35});
}

function renderQuant(){
  const s=data.summary;
  const metrics=[[String(s.content_blocks),'content blocks','Extracted from the article'],[String(s.proposed_nodes),'analytical records','Selected, source-linked proposals'],[String(s.proposed_relations),'relationships','Connections available to inspect']];
  $('#metrics-strip').innerHTML=metrics.map(([number,label,note])=>`<div class="metric"><span class="metric-number">${number}</span><strong>${label}</strong><span>${note}</span></div>`).join('');
  const basis=data.counts.record_basis;
  const labels={published_argument:'Published argument',retrospective_account:'Reported dialogue',hypothetical_example:'Hypothetical example',later_literature:'Later reading'};
  $('#basis-chart').innerHTML=Object.entries(labels).map(([key,label])=>{
    const value=basis[key]||0;
    return `<div class="basis-row"><span class="basis-label">${label}</span><div class="basis-track"><div class="basis-fill basis-${key}" style="--bar-width:${value/s.proposed_nodes*100}%"></div></div><span class="basis-value">${value}</span></div>`;
  }).join('')+`<p class="chart-note">${s.proposed_nodes} selected records · original pilot: 21 records and 16 relationships</p>`;
  $('#revision-list').innerHTML='<p>The display adds the scientific-method inference and the reported return of an objection. The original analysis remains downloadable.</p><ul><li>“Challenges” is refined to “questions relevance.”</li><li>AI acknowledgment is shown as acknowledgment, without treating it as independent confirmation.</li></ul>';
}

function applyMotion(){
  document.body.classList.toggle('reduce-motion',reduced);
  $('#motion-toggle').setAttribute('aria-pressed',String(reduced));
  $('#motion-toggle').textContent=reduced?'Motion reduced':'Reduce motion';
}

async function main(){
  const response=await fetch(new URL('data/analysis.json',import.meta.url));
  if(!response.ok)throw new Error('Analysis data unavailable');
  data=await response.json();
  document.documentElement.classList.add('is-ready');
  applyMotion();
  $('#stage-dots').innerHTML=captions.map((_,i)=>`<button type="button" aria-label="Reading stage ${i+1}" aria-pressed="${i===0}" data-go-stage="${i}"><span></span></button>`).join('');
  $$('[data-go-stage]').forEach(b=>b.addEventListener('click',()=>goStage(Number(b.dataset.goStage))));
  $('#previous-stage').addEventListener('click',()=>goStage(currentStep-1));
  $('#next-stage').addEventListener('click',()=>goStage(currentStep+1));
  $$('.evidence-trigger').forEach(b=>b.addEventListener('click',()=>showEvidence(b.dataset.nodes.split(','))));
  $('.dialog-close').addEventListener('click',()=>$('#evidence-dialog').close());
  $('#evidence-dialog').addEventListener('click',e=>{if(e.target===$('#evidence-dialog'))$('#evidence-dialog').close();});
  $$('[data-comparison]').forEach(b=>b.addEventListener('click',()=>renderComparison(b.dataset.comparison)));
  $('#inference-toggle').addEventListener('click',()=>{
    const active=$('#inference-toggle').getAttribute('aria-pressed')!=='true';
    $('#inference-toggle').setAttribute('aria-pressed',String(active));
    $('#inference-toggle').textContent=active?'Return to the initial inference':'Examine the inference';
    $('#inference-diagram').classList.toggle('examined',active);
    $('.inference-question').hidden=!active;
    $('.inference-retain').hidden=!active;
    if(window.gsap&&!reduced&&active)gsap.from(['.inference-question','.inference-retain'],{opacity:0,y:10,stagger:.15,duration:.55});
  });
  $('#motion-toggle').addEventListener('click',()=>{reduced=!reduced;try{localStorage.setItem('ai4theology-motion',reduced?'reduced':'full');}catch{}applyMotion();initStory();});
  renderComparison('C01');renderQuant();initExplorer(data);
  await document.fonts.ready;
  initStory();
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(initStory,200);});
  if(window.gsap&&!reduced){
    gsap.from('.hero-copy > *',{y:22,opacity:0,duration:.9,stagger:.1,ease:'power2.out'});
    gsap.from('.hero-vertex',{opacity:0,scale:.9,transformOrigin:'center',duration:1,stagger:.15});
    gsap.from('.hero-paths',{opacity:0,duration:1.5,delay:.3});
  }
}
main().catch(error=>{console.error(error);$('#load-error').hidden=false;});
