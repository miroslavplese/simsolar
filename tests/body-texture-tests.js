const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {
  MIN_RADIUS_PX,MAX_SAMPLE_RADIUS,FRAMEBUFFER_SIZE,
  CURATED_DEFINITIONS,
  textureDefinition,rotationTurns,shouldUseTexture,poleVector,
  cloudOffsetTurns,viewBasis,orientationMatrix,createRenderer
}=require('../src/body-textures.js');
const RingSystem=require('../src/ring-system.js');
const Curated=require('../data/curated-systems.js');

assert.equal(FRAMEBUFFER_SIZE,MAX_SAMPLE_RADIUS*2+2);
assert.equal(textureDefinition('Earth').file,'earth.webp');
assert.equal(textureDefinition('Earth').cloudFile,'earth-clouds.webp');
assert.equal(textureDefinition('Saturn').polarScale,0.902);
assert.equal(textureDefinition('Unknown'),null);

assert.equal(shouldUseTexture('Earth',MIN_RADIUS_PX),true);
assert.equal(shouldUseTexture('Earth',MIN_RADIUS_PX-0.01),false);
assert.equal(shouldUseTexture('Unknown',100),false);
assert.equal(shouldUseTexture('Earth',Number.NaN),false);

assert.ok(Math.abs(rotationTurns('Earth',0.9972708333333333))<1e-12);
assert.ok(Math.abs(rotationTurns('Venus',1)-0.004115)<1e-6);
assert.equal(rotationTurns('Unknown',1),0);
assert.equal(rotationTurns('Earth',Number.NaN),0);
assert.notEqual(cloudOffsetTurns('Earth',10),0);
assert.equal(cloudOffsetTurns('Mars',10),0);
assert.ok(Math.abs(poleVector('Earth').y-Math.sin(23.44*Math.PI/180))<1e-12);
assert.equal(poleVector('Unknown'),null);
const mercuryOrientation=orientationMatrix('Mercury',0,{
  right:{x:0,y:1,z:0},
  up:{x:0,y:0,z:1},
  towardObserver:{x:1,y:0,z:0}
});
assert.equal(mercuryOrientation.length,9);
for(const value of mercuryOrientation) assert.ok(Number.isFinite(value));
assert.equal(orientationMatrix('Unknown',0,{}),null);
const identityBasis={
  right:{x:1,y:0,z:0},
  up:{x:0,y:1,z:0},
  towardObserver:{x:0,y:0,z:1}
};
const curatedBodies=Curated.SYSTEMS.flatMap(system=>system.bodies||[]);
assert.equal(curatedBodies.length,29);
assert.deepEqual(Object.keys(CURATED_DEFINITIONS).sort(),
  curatedBodies.map(body=>body.id).sort());
const textureDirectory=path.join(__dirname,'../assets/textures/curated');
assert.deepEqual(fs.readdirSync(textureDirectory).sort(),
  curatedBodies.map(body=>body.id+'.webp').sort());
const hashes=new Set();
for(const body of curatedBodies){
  const definition=textureDefinition(body);
  assert.equal(definition.file,`curated/${body.id}.webp`);
  assert.equal(definition.emissive,body.kind==='star');
  assert.equal(shouldUseTexture(body,MIN_RADIUS_PX),true);
  assert.equal(shouldUseTexture(body,MIN_RADIUS_PX-0.01),false);
  assert.equal(cloudOffsetTurns(body,10),0);
  assert.deepEqual(textureDefinition(JSON.parse(JSON.stringify(body))),definition);
  assert.deepEqual(textureDefinition({...body,name:'Renamed body'}),definition);
  assert.ok(Math.abs(rotationTurns(body,definition.rotationHours/24))<1e-12);
  for(const time of [0,-5,5672]){
    const matrix=orientationMatrix(body,time,identityBasis);
    assert.equal(matrix.length,9);
    assert.ok(matrix.every(Number.isFinite));
    for(let row=0;row<3;row++){
      const length=Math.hypot(matrix[row],matrix[row+3],matrix[row+6]);
      assert.ok(Math.abs(length-1)<1e-12);
    }
  }
  const bytes=fs.readFileSync(path.join(textureDirectory,body.id+'.webp'));
  assert.equal(bytes.toString('ascii',0,4),'RIFF',body.id);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',body.id);
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,body.id);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
}
assert.equal(hashes.size,curatedBodies.length);
assert.equal(textureDefinition({id:'unregistered',name:'Tatoo I'}),null);
assert.equal(textureDefinition({id:'unregistered',name:'Planet 1'}),null);
assert.equal(textureDefinition({id:'unregistered',name:'Earth'}).file,'earth.webp');
assert.equal(textureDefinition('Sun').file,'sun.webp');
assert.equal(textureDefinition('constructor'),null);
assert.equal(textureDefinition(null),null);
for(const [name,ring] of Object.entries(RingSystem.PLANETARY_RINGS)){
  const pole=poleVector(name);
  assert.deepEqual(pole,RingSystem.normalVector(ring));
  for(const time of [0,0.1,5672]){
    const matrix=orientationMatrix(name,time,identityBasis);
    for(const angle of [0,0.7,2,4.5]){
      const point=RingSystem.relativePoint(ring,RingSystem.AU_KM,angle);
      const latitude=matrix[2]*point.x+matrix[5]*point.y+matrix[8]*point.z;
      assert.ok(Math.abs(latitude)<1e-12,name+' ring lies on texture equator');
    }
    for(let row=0;row<3;row++){
      for(let other=0;other<3;other++){
        const product=matrix[row]*matrix[other]+
          matrix[row+3]*matrix[other+3]+matrix[row+6]*matrix[other+6];
        assert.ok(Math.abs(product-(row===other?1:0))<1e-12);
      }
    }
  }
}
const offAxisBasis=viewBasis(
  {x:-0.6,y:-0.8,z:0},
  {x:1,y:0,z:0},
  {x:0,y:0,z:1}
);
assert.ok(offAxisBasis);
const basisDot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
assert.ok(Math.abs(basisDot(
  offAxisBasis.right,offAxisBasis.towardObserver
))<1e-12);
assert.ok(Math.abs(basisDot(
  offAxisBasis.up,offAxisBasis.towardObserver
))<1e-12);
assert.ok(Math.abs(basisDot(offAxisBasis.right,offAxisBasis.up))<1e-12);
assert.ok(Math.abs(Math.hypot(
  offAxisBasis.right.x,offAxisBasis.right.y,offAxisBasis.right.z
)-1)<1e-12);
assert.equal(createRenderer(),null);

console.log('Body texture tests passed.');
