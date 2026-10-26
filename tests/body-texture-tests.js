const assert=require('node:assert/strict');
const {
  MIN_RADIUS_PX,MAX_SAMPLE_RADIUS,FRAMEBUFFER_SIZE,
  textureDefinition,rotationTurns,shouldUseTexture,poleVector,
  cloudOffsetTurns,viewBasis,orientationMatrix,createRenderer
}=require('../src/body-textures.js');
const RingSystem=require('../src/ring-system.js');

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
