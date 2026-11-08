const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const BodyInfo=require('../src/features/body-info.js');
const ObjectImages=require('../src/object-images.js');
const Curated=require('../data/curated-systems.js');
const {GM_BY_BODY}=require('../src/nbody-simulation.js');
const html=fs.readFileSync(path.join(__dirname,'..','solar-system.html'),'utf8');

class Element{
  constructor(tagName='div'){
    this.tagName=tagName;
    this.children=[];
    this.style={};
    this.dataset={};
    this.attributes={};
    this.listeners=new Map();
    this.textContent='';
    this.hidden=false;
    this.srcWrites=0;
    const classes=new Set();
    this.classList={
      toggle:(name,visible)=>visible ? classes.add(name) : classes.delete(name),
      remove:name=>classes.delete(name),
      contains:name=>classes.has(name)
    };
  }
  get firstElementChild(){ return this.children[0]||null; }
  set src(value){ this.source=value; this.srcWrites++; }
  get src(){ return this.source; }
  setAttribute(name,value){ this.attributes[name]=value; }
  removeAttribute(name){ delete this.attributes[name]; delete this[name]; }
  appendChild(child){ this.children.push(child); return child; }
  replaceChildren(...children){ this.children=children; }
  addEventListener(name,listener){
    if(!this.listeners.has(name)) this.listeners.set(name,new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name,listener){ this.listeners.get(name)?.delete(listener); }
  click(){ for(const listener of this.listeners.get('click')||[]) listener(); }
}

const elements=Object.fromEntries(
  Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>[match[1],new Element()])
);
elements.rowDist.appendChild(new Element('span'));
const document={
  getElementById:id=>elements[id]||null,
  createElement:tag=>new Element(tag)
};
let closes=0;
const options={
  document,massByName:{Earth:5.9722e24,Sun:1.98847e30},
  bodyPresets:{planet:{label:'Planet'},'black-hole':{label:'Black hole'}},
  hybridEpochDate:'2026-01-01',onClose:()=>{closes++;},
  catalog:{
    Earth:{src:'earth.webp',alt:'Earth reference',source:'https://example.test/earth',
      artist:'NASA',license:'Public domain'},
    Sun:{src:'sun.webp',alt:'Sun reference'}
  }
};
const card=BodyInfo.create(options);
const earth=Object.freeze({
  name:'Earth',kind:'planet',e:0.017,i:0,period:365.25,a:1
});
const position=Object.freeze({
  x:1,y:0,z:0,vx:0,vy:0.0172,vz:0,r:1,speedKmS:29.78,ephemeris:true
});
const frame=Object.freeze({
  position,radiusKm:6371,editable:false,osculating:false,orbitReference:null
});
const text=id=>elements[id].textContent;
const visible=id=>elements[id].style.display!=='none' && !elements[id].hidden;
function image(){
  const content=elements.cardImageContainer.firstElementChild;
  return content?.tagName==='a' ? content.firstElementChild : content;
}

assert.equal(elements.cardImageContainer.children.length,0,'creation must not fetch images');
assert.equal(elements.cardClose.listeners.get('click').size,1);
card.setVisible(true);
assert.ok(elements.card.classList.contains('show'));
card.update(earth,frame);
assert.equal(text('cardName'),'Earth');
assert.equal(text('cardKind'),'Planet');
assert.equal(text('cardMass'),'5.972e24 kg');
assert.equal(text('cardRadius'),(6371).toLocaleString()+' km');
assert.equal(text('cardDist'),'1.000 AU');
assert.equal(text('cardSpeed'),'29.78 km/s');
assert.equal(text('cardPeriod'),'365.3 days');
assert.equal(text('cardEcc'),'0.017');
assert.equal(text('cardIncl'),'0.00\u00b0');
assert.equal(text('cardNote'),'Position and speed use NASA/JPL Horizons state vectors.');
assert.equal(elements.cardWiki.href,'https://en.wikipedia.org/wiki/Earth');
assert.ok(!visible('cardMission'));
const earthImage=image(),obsoleteError=earthImage.onerror;
card.update(earth,{...frame,position:{...position,r:2}});
assert.equal(image(),earthImage);
assert.equal(earthImage.srcWrites,1,'per-frame updates must not reload the portrait');
assert.equal(text('cardDist'),'2.000 AU');

const sun={kind:'sun',name:'Sun'};
card.update(sun,{...frame,radiusKm:696340});
assert.equal(text('cardKind'),'Star');
assert.equal(text('cardMass'),'1.988e30 kg');
assert.equal(text('cardNote'),'The star at the center of the Solar System.');
for(const id of ['rowDist','rowSpeed','rowEcc','rowIncl','rowPeriod']) assert.ok(!visible(id),id);
assert.equal(earthImage.onerror,null,'replaced images release their handler');
const sunImage=image();
obsoleteError();
assert.equal(image(),sunImage,'a queued old image failure must not replace the current body');
sunImage.onerror();
assert.equal(image(),sunImage);
assert.match(sunImage.src,/^data:image\/svg/);
assert.equal(sunImage.onerror,null);
assert.equal(text('cardImageCaption'),'Reference image unavailable; schematic shown.');

card.update({...earth,name:'Mercury'},frame);
assert.equal(elements.cardWiki.href,'https://en.wikipedia.org/wiki/Mercury_(planet)');
card.update({...earth,wikipedia:'A & B/C'},frame);
assert.equal(elements.cardWiki.href,'https://en.wikipedia.org/wiki/A_%26_B/C');
for(const [period,expected] of [
  [0,'Not specified'],[NaN,'Not specified'],[-1,'Not specified'],
  [399,'399.0 days'],[400,'1.10 years'],[730.5,'2.00 years']
]){
  card.update({...earth,period},frame);
  assert.equal(text('cardPeriod'),expected);
}
card.update({...earth,displayPeriod:6.387},frame);
assert.equal(text('cardPeriod'),'6.4 days');
card.update(earth,{...frame,position:{...position,speedKmS:null}});
assert.equal(text('cardSpeed'),'29.78 km/s');
card.update({...earth,notes:'Earth note.'},{...frame,position:{...position,nbody:true}});
assert.equal(text('cardNote'),
  'Position and speed use Newtonian N-body integration from 2026-01-01. Earth note.');
card.update(earth,{...frame,position:{...position,ephemeris:false}});
assert.ok(!visible('cardNote'));

const custom={name:'Experiment',kind:'custom',appearance:'black-hole',notes:'Custom note.'};
card.update(custom,{...frame,editable:true,radiusKm:12.345});
assert.equal(elements.rowDist.firstElementChild.textContent,'Distance from barycenter');
assert.equal(text('cardRadius'),(12.345).toLocaleString(undefined,{maximumFractionDigits:2})+' km');
assert.equal(text('cardMass'),'0 kg (test particle)');
assert.equal(text('cardIncl'),'0.00\u00b0');
assert.ok(!visible('rowEcc') && !visible('rowPeriod'));
assert.equal(text('cardNote'),'Custom note.');
assert.equal(elements.cardWiki.href,'https://en.wikipedia.org/wiki/Black_hole');
card.update(custom,{...frame,position:{...position,vy:0}});
assert.equal(text('cardIncl'),'Radial trajectory');
card.update({...custom,initialInclination:45},{...frame,position:null});
assert.equal(text('cardIncl'),'45\u00b0 initial');
card.update(custom,{...frame,position:null});
assert.equal(text('cardIncl'),'\u2014');
card.update({...custom,appearance:'unknown'},frame);
assert.ok(!visible('cardWiki'));

const craft={
  kind:'spacecraft',name:'Probe',launch:'2025-01-01',notes:'Mission note.',
  e:0.5,i:2,n:0.5,massKg:1234.5,massEstimated:true,massAtLaunch:true,
  sourceUrl:'https://example.test/mission'
};
card.update(craft,{...frame,radiusKm:null,position:null});
assert.equal(text('cardDist'),'Not launched');
assert.equal(text('cardNote'),'Launch date: 2025-01-01.');
assert.equal(text('cardMass'),'\u2248 '+(1234.5).toLocaleString()+' kg (at launch)');
assert.equal(elements.cardMission.href,craft.sourceUrl);
assert.ok(visible('cardMission') && !visible('rowRadius') && !visible('rowPeriod'));
for(const [flags,source] of [
  [{sampled:true},' Position and prior path use NASA/JPL Horizons vectors.'],
  [{nbody:true},' Position uses Newtonian N-body integration from 2026-01-01.'],
  [{},' Position is beyond the bundled Horizons range and is propagated from the final JPL state under solar gravity.']
]){
  card.update(craft,{...frame,position:{...position,...flags}});
  assert.equal(text('cardNote'),'Launched 2025-01-01.'+source+' Mission note.');
  assert.equal(text('cardPeriod'),'720.0 days');
}
card.update({...craft,massEstimated:false,massAtLaunch:false,massDry:true,e:1.2},frame);
assert.equal(text('cardMass'),(1234.5).toLocaleString()+' kg (dry)');
assert.equal(text('cardEcc'),'1.200 (hyperbolic)');
assert.ok(!visible('rowPeriod'));
card.update({kind:'spacecraft',name:'Unknown'},{...frame,position:null});
assert.equal(text('cardMass'),'Not specified (test particle)');
assert.equal(text('cardEcc'),'Not specified');
assert.equal(text('cardIncl'),'Not specified');
card.update({kind:'spacecraft',name:'Unknown'},frame);
assert.equal(text('cardEcc'),'Not specified');
assert.equal(text('cardIncl'),'Not specified');

const comet={kind:'comet',name:'67P/Churyumov-Gerasimenko',q:1.2345,
  perihelion:'2021-11-02',notes:'Comet note.',e:0.64,i:7,period:2350};
card.update(comet,{...frame,position:null});
assert.equal(text('cardDist'),'Outside data range');
assert.equal(text('cardNote'),'Bundled comet ephemerides cover 1950 through 2080.');
assert.equal(elements.cardWiki.href,'https://en.wikipedia.org/wiki/67P/Churyumov-Gerasimenko');
for(const nbody of [false,true]){
  card.update(comet,{...frame,position:{...position,nbody}});
  assert.equal(text('cardNote'),'Perihelion 2021-11-02 at 1.234 AU. '+
    (nbody ? 'Position uses Newtonian N-body integration from 2026-01-01. ' :
      'Position uses NASA/JPL Horizons state vectors. ')+'Comet note.');
}
card.update({...earth,name:'Moon',kind:'moon',category:'Moon',notes:'Lunar note.'},frame);
assert.equal(text('cardKind'),'Moon');
assert.equal(text('cardNote'),
  'Lunar note. Future motion uses hierarchical perturbation integration from 2026-01-01.');

const lagrange={kind:'lagrange',name:'Earth L1',system:{primary:sun,secondary:earth}};
card.update(lagrange,{...frame,radiusKm:null,position:null});
assert.equal(text('cardDist'),'Outside branch range');
assert.equal(text('cardMass'),'0 kg (equilibrium point)');
assert.equal(text('cardPeriod'),'Co-rotating');
assert.equal(text('cardNote'),'The selected system does not exist at this simulation date.');
card.update(lagrange,{...frame,position:{...position,distanceFromSecondary:0.01}});
assert.match(text('cardNote'),/equilibrium estimate for Sun and Earth\. Distance from Earth:/);
assert.ok(!visible('rowEcc') && !visible('rowIncl') && visible('rowPeriod'));

const trappist=Curated.buildEditableSystem(Curated.findById('trappist-1')).bodies;
const planet=trappist.find(body=>body.name==='TRAPPIST-1e');
const orbitReference={
  mu:GM_BY_BODY.Sun,
  relative:{x:1,y:0,z:0,vx:0,vy:Math.sqrt(GM_BY_BODY.Sun),vz:0}
};
const curatedFrame={...frame,editable:true,osculating:true,orbitReference};
const originalPlanet=JSON.stringify(planet);
card.update(planet,curatedFrame);
assert.equal(text('cardMassProvenance'),'Approximate');
assert.equal(text('cardRadiusProvenance'),'Approximate');
assert.equal(text('cardInclProvenance'),'Arbitrary');
assert.equal(text('cardDistProvenance'),'Simulated');
assert.equal(elements.cardInclProvenance.dataset.origin,'arbitrary');
assert.match(elements.cardInclProvenance.title,/not measured/);
assert.equal(text('cardEcc'),'0.000');
assert.equal(text('cardIncl'),'0.00\u00b0');
assert.equal(text('cardPeriod'),'365.3 days');
assert.match(text('cardNote'),/instantaneous two-body estimates\. The observing surface is schematic\.$/);
assert.equal(image().src,'assets/objects/curated/trappist-e.webp?v=2');
assert.equal(text('cardImageCaption'),'Artistic illustration');
assert.equal(JSON.stringify(planet),originalPlanet,'presentation must not mutate bodies');
card.update({...planet,massKg:planet.massKg*2,radius:planet.radius*2},curatedFrame);
assert.equal(text('cardMassProvenance'),'Edited');
assert.equal(text('cardRadiusProvenance'),'Edited');
card.update(planet,{...curatedFrame,orbitReference:{
  ...orbitReference,relative:{...orbitReference.relative,vy:Math.sqrt(GM_BY_BODY.Sun)*2}
}});
assert.equal(text('cardPeriod'),'Unbound');
card.update(trappist[0],{...curatedFrame,orbitReference:null});
for(const id of ['rowEcc','rowIncl','rowPeriod']) assert.ok(!visible(id),id);
assert.ok(!text('cardNote').includes('observing surface'));
const kepler=Curated.buildEditableSystem(Curated.findById('kepler-442')).bodies;
card.update(kepler.find(body=>body.id==='kepler-442-b'),curatedFrame);
assert.equal(text('cardMassProvenance'),'Estimated');
assert.equal(text('cardEccProvenance'),'Arbitrary');
card.update(earth,frame);
for(const id of ['Mass','Radius','Dist','Period','Speed','Ecc','Incl']){
  const element=elements['card'+id+'Provenance'];
  assert.ok(element.hidden);
  assert.equal(element.textContent,'');
  assert.equal(element.title,undefined);
  assert.equal(element.dataset.origin,undefined);
}
assert.ok(elements.cardProvenanceNote.hidden);
assert.equal(text('cardProvenanceNote'),'');
assert.equal(elements.rowDist.firstElementChild.textContent,'Distance from Sun');
for(const id of ['rowEcc','rowIncl','rowPeriod']) assert.ok(visible(id),id);

elements.cardClose.click();
assert.equal(closes,1);
card.setVisible(false);
card.update(earth,frame);
assert.ok(!elements.card.classList.contains('show'),'rendering must not undo tutorial visibility');
const lastImage=image(),pendingError=lastImage.onerror;
card.dispose();
card.dispose();
pendingError();
assert.equal(lastImage.onerror,null);
assert.equal(elements.cardImageContainer.children.length,0);
assert.ok(elements.cardImageCaption.hidden);
assert.equal(elements.cardClose.listeners.get('click').size,0);
elements.cardClose.click();
assert.equal(closes,1);
assert.throws(()=>card.update(earth,frame),/disposed/);
assert.throws(()=>card.setVisible(true),/disposed/);
const replacement=BodyInfo.create(options);
replacement.update(earth,frame);
assert.notEqual(image(),earthImage);
assert.equal(elements.cardClose.listeners.get('click').size,1);
elements.cardClose.click();
assert.equal(closes,2);
replacement.dispose();
const images=ObjectImages.create({
  document,catalog:options.catalog,
  container:elements.cardImageContainer,caption:elements.cardImageCaption
});
images.show(earth);
const beforeClear=image(),clearedError=beforeClear.onerror;
images.clear();
images.clear();
assert.equal(beforeClear.onerror,null);
images.show(earth);
assert.notEqual(image(),beforeClear,'clearing must invalidate the same-body cache');
const afterClear=image();
clearedError();
assert.equal(image(),afterClear);
images.clear();
assert.throws(()=>BodyInfo.create({
  ...options,document:{getElementById:()=>null}
}),/requires #card/);
console.log('Body-info rendering, provenance, image lifecycle, and disposal tests passed.');
