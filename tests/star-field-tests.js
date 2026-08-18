const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  OBLIQUITY,bvToRgb,createStars,cameraCoordinates,projectStar
}=require('../src/star-field.js');

const records=[
  [1,0,0,-1.46,0],
  [2,90,0,6.5,1.5],
  [3,0,90,2,null]
];
const stars=createStars(records);
assert.equal(stars.length,records.length);
for(const star of stars){
  assert.ok(Math.abs(Math.hypot(star.x,star.y,star.z)-1)<1e-12);
  assert.ok(star.radius>0);
  assert.ok(star.alpha>0 && star.alpha<=1);
}
assert.ok(Math.abs(stars[0].x-1)<1e-12);
assert.ok(Math.abs(stars[1].y-Math.cos(OBLIQUITY))<1e-12);
assert.ok(Math.abs(stars[1].z+Math.sin(OBLIQUITY))<1e-12);
assert.ok(stars[0].radius>stars[1].radius);
assert.ok(stars[0].alpha>stars[1].alpha);
assert.ok(bvToRgb(-0.3)[2]>bvToRgb(-0.3)[0]);
assert.ok(bvToRgb(1.8)[0]>bvToRgb(1.8)[2]);
assert.throws(()=>createStars(10),/records must be an array/);

const context={window:{}};
vm.runInNewContext(
  fs.readFileSync(
    path.resolve(__dirname,'..','data','hipparcos-stars.js'),'utf8'
  ),
  context
);
const catalog=context.window.HIPPARCOS_STAR_CATALOG;
assert.equal(catalog.source,'I/239/hip_main');
assert.equal(catalog.magnitudeLimit,6.5);
assert.ok(catalog.stars.length>8800 && catalog.stars.length<9000);
const sirius=catalog.stars.find(record=>record[0]===32349);
assert.ok(Math.abs(sirius[1]-101.2885411)<1e-7);
assert.ok(Math.abs(sirius[2]+16.7131431)<1e-7);
assert.ok(sirius[3]<-1.4);

const yaw=0.7;
const tilt=1.1;
const forward={
  x:Math.sin(yaw)*Math.sin(tilt),
  y:Math.cos(yaw)*Math.sin(tilt),
  z:Math.cos(tilt),
  radius:1,
  alpha:1
};
const camera=cameraCoordinates(forward,yaw,tilt);
assert.ok(Math.abs(camera.x)<1e-12);
assert.ok(Math.abs(camera.y)<1e-12);
assert.ok(Math.abs(camera.depth-1)<1e-12);
assert.deepEqual(
  projectStar(forward,yaw,tilt,800,600),
  {x:400,y:300,radius:1,alpha:1,depth:camera.depth}
);

const rotated=projectStar(
  {x:0,y:1,z:0,radius:1,alpha:1},
  -0.2,Math.PI/2,800,600
);
assert.ok(rotated && Math.abs(rotated.x-400)>1);
assert.equal(
  projectStar({x:0,y:0,z:-1,radius:1,alpha:1},0,0,800,600),
  null
);

console.log('Star field tests passed.');
