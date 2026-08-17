const assert=require('node:assert/strict');
const {
  summarize,
  createFrameProfiler
}=require('../src/frame-profiler.js');

assert.equal(summarize([]),null);

const summary=summarize([10,20,30,40,50,60,70,80,90,100]);
assert.equal(summary.count,10);
assert.equal(summary.averageMs,55);
assert.equal(summary.p95Ms,100);
assert.equal(summary.fps,1000/55);

const profiler=createFrameProfiler(['Inner','Outer'],3);
profiler.record('Inner',10);
profiler.record('Inner',20);
profiler.record('Inner',30);
profiler.record('Inner',40);
assert.deepEqual(profiler.summary('Inner'),{
  count:3,
  averageMs:30,
  p95Ms:40,
  fps:1000/30
});
assert.equal(profiler.summary('Outer'),null);
assert.throws(()=>profiler.record('Unknown',16),/Unknown profiler preset/);

console.log('Frame profiler tests passed.');
