const assert=require('node:assert/strict');
const {createPoints,draw}=require('../src/asteroid-belt.js');

const points=createPoints();
assert.equal(points.length,5000);
assert.deepEqual(createPoints(),points);
const quadrants=[0,0,0,0];
for(const point of points){
  const radius=Math.hypot(point.x,point.y);
  assert.ok(radius>=2.1 && radius<=3.3);
  assert.ok(Math.abs(point.z)<=0.16);
  assert.ok(point.size>=0.55 && point.size<=1.2);
  quadrants[(point.x<0?1:0)+(point.y<0?2:0)]++;
}
assert.ok(quadrants.every(count=>count>1100 && count<1400));

let rectangles=[];
let saves=0;
let restores=0;
const context={
  save(){saves++;},
  restore(){restores++;},
  fillRect(...args){rectangles.push(args);}
};
const project=(x,y)=>({x:400+x*50,y:300+y*50});
assert.equal(draw(context,points,project,800,600,50),5000);
assert.equal(rectangles.length,5000);
assert.equal(context.globalAlpha,(50/60)**2);
assert.equal(saves,restores);
rectangles=[];
assert.equal(draw(context,points,()=>({x:-100,y:-100}),800,600,50),0);
assert.equal(rectangles.length,0);
assert.equal(draw(context,points,project,800,600,2400),0);
assert.equal(rectangles.length,0);
draw(context,points,project,800,600,1800);
assert.equal(context.globalAlpha,0.5);
draw(context,points,project,800,600,6);
assert.equal(context.globalAlpha,(6/60)**2);
for(const scale of [6,12,15,30,60]){
  draw(context,points,project,800,600,scale);
  assert.ok(Math.abs(context.globalAlpha/scale**2-1/60**2)<1e-12);
}
draw(context,points,project,800,600,207);
assert.equal(context.globalAlpha,1);
assert.equal(saves,restores);
console.log('Asteroid belt tests passed.');
