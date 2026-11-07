const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const images=require('../src/object-images.js');
const {SYSTEMS}=require('../data/curated-systems.js');
const {CURATED_DEFINITIONS}=require('../src/body-textures.js');
const credits=require('../assets/objects/credits.json');
const spacecraft=require('../src/spacecraft-catalog.js').create();
assert.equal(Object.keys(credits).length,39);
for(const [name,record] of Object.entries(credits)){
  assert.ok(fs.statSync(path.join(__dirname,'..',record.src)).size>100);
  assert.ok(record.artist,name+' has attribution');
  assert.ok(record.license,name+' has licensing');
  assert.ok(record.source.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.equal(images.forBody({name,kind:'planet'},credits).src,record.src);
}
for(const body of spacecraft) assert.ok(credits[body.name],body.name+' has an image');
const curatedBodies=SYSTEMS.flatMap(system=>system.bodies||[]);
assert.equal(curatedBodies.length,29);
assert.deepEqual(curatedBodies.map(body=>body.id).sort(),Object.keys(CURATED_DEFINITIONS).sort());
const portraitHashes=new Set();
for(const body of curatedBodies){
  const record=images.forBody(body,credits);
  assert.equal(record.src,'assets/objects/curated/'+body.id+'.webp');
  assert.equal(record.caption,'Artistic illustration');
  assert.equal(record.alt,body.name+' - artistic illustration');
  assert.equal(record.source,null,'generated art must not link to an unrelated photograph');
  const image=fs.readFileSync(path.join(__dirname,'..',record.src));
  assert.ok(image.length>1000,body.id+' has a detailed portrait');
  assert.equal(image.toString('ascii',0,4),'RIFF');
  assert.equal(image.toString('ascii',8,12),'WEBP');
  portraitHashes.add(createHash('sha256').update(image).digest('hex'));
  const restored=JSON.parse(JSON.stringify({...body,name:'Earth'}));
  assert.equal(images.forBody(restored,credits).src,record.src,'stable IDs take precedence over names');
}
assert.equal(portraitHashes.size,curatedBodies.length,'every body has its own portrait');
assert.deepEqual(
  fs.readdirSync(path.join(__dirname,'..','assets','objects','curated')).sort(),
  curatedBodies.map(body=>body.id+'.webp').sort()
);
for(const id of ['unknown','../earth','toString','__proto__']){
  assert.match(images.forBody({id,name:'Unmapped',kind:'planet'},credits).src,/^data:image\/svg/);
}
assert.equal(images.forBody({id:'solar-earth',name:'Earth',kind:'planet'},credits),credits.Earth);
for(const appearance of ['star','black-hole','planet','comet']){
  const record=images.forBody({name:'Earth',kind:'custom',appearance,color:'#c0ffee'},credits);
  assert.ok(record.src.startsWith('data:image/svg+xml'));
  assert.match(record.alt,/not a photograph/);
}
assert.match(images.forBody({kind:'lagrange',name:'L1'},credits).alt,/schematic/);
const malicious=images.illustration({name:'Example',color:'"><script>alert(1)</script>'});
assert.ok(!decodeURIComponent(malicious.src).includes('<script>'));
console.log('Object image coverage and attribution tests passed.');
