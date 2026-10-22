const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const images=require('../src/object-images.js');
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
for(const appearance of ['star','black-hole','planet','comet']){
  const record=images.forBody({name:'Earth',kind:'custom',appearance,color:'#c0ffee'},credits);
  assert.ok(record.src.startsWith('data:image/svg+xml'));
  assert.match(record.alt,/not a photograph/);
}
assert.match(images.forBody({kind:'lagrange',name:'L1'},credits).alt,/schematic/);
const malicious=images.illustration({name:'Example',color:'"><script>alert(1)</script>'});
assert.ok(!decodeURIComponent(malicious.src).includes('<script>'));
console.log('Object image coverage and attribution tests passed.');
