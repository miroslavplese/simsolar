const assert=require('node:assert/strict');
const {
  createDefaultPlan,isoFromDays,daysFromIso,formatDuration
}=require('../src/mission-planner-ui.js');

const j2000=Date.UTC(2000,0,1,12);
assert.equal(isoFromDays(0,j2000),'2000-01-01');
assert.equal(daysFromIso('2000-01-02',j2000),1);
assert.ok(Number.isNaN(daysFromIso('',j2000)));
assert.equal(formatDuration(400),'400 days');
assert.equal(formatDuration(1095.75),'3.0 years');

const plan=createDefaultPlan(10000.2);
assert.equal(plan.version,1);
assert.equal(plan.waypoints[0].body,'Earth');
assert.equal(plan.waypoints[0].role,'departure');
assert.equal(plan.waypoints.at(-1).body,'Mars');
assert.equal(plan.waypoints.at(-1).role,'target');
assert.ok(plan.waypoints[0].earliest>10000.2);
assert.ok(plan.waypoints.at(-1).latest>plan.waypoints[0].latest);

const catalog=[
  {name:'TRAPPIST-1',target:false},
  {name:'TRAPPIST-1b',periodDays:1.51},
  {name:'TRAPPIST-1c',periodDays:2.42}
];
const compact=createDefaultPlan(10000.2,catalog);
assert.equal(compact.waypoints[0].body,'TRAPPIST-1b');
assert.equal(compact.waypoints[1].body,'TRAPPIST-1c');
assert.equal(compact.waypoints[0].earliest,10001);
assert.equal(compact.waypoints[0].latest,10003);
assert.equal(compact.waypoints[1].earliest,10002);
assert.equal(compact.waypoints[1].latest,10006);
const solar=createDefaultPlan(10000.2,[{name:'Mercury'},{name:'Earth'},{name:'Mars'}]);
assert.deepEqual(solar.waypoints,plan.waypoints);
assert.equal(createDefaultPlan(0,[]).waypoints[0].body,'');
assert.equal(createDefaultPlan(0,[{name:'Only planet'}]).waypoints[1].body,'');
assert.equal(createDefaultPlan(0,[{name:'Mars'}]).waypoints[1].body,'');

console.log('Mission planner UI tests passed.');
