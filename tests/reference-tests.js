const assert=require('node:assert/strict');
const {referenceCases}=require('./helpers/reference-cases.js');
const expected=require('./fixtures/refactor-reference.json');
const Scenario=require('../src/scenario-state.js');
const Controller=require('../src/scenario-controller.js');

function compare(actual,reference,location='reference'){
  if(typeof reference==='number'){
    assert.ok(Number.isFinite(actual),location+' must be finite');
    const tolerance=1e-12+Math.abs(reference)*1e-11;
    assert.ok(Math.abs(actual-reference)<=tolerance,
      `${location}: ${actual} != ${reference} (tolerance ${tolerance})`);
  } else if(reference && typeof reference==='object'){
    assert.equal(Array.isArray(actual),Array.isArray(reference),location);
    assert.deepEqual(Object.keys(actual),Object.keys(reference),location+' keys');
    for(const key of Object.keys(reference)) compare(actual[key],reference[key],location+'.'+key);
  } else {
    assert.equal(actual,reference,location);
  }
}

const actual=referenceCases();
for(const key of ['curated','moons','routes']) compare(actual[key],expected[key],key);
assert.deepEqual(actual.scenarios,expected.scenarios,'Scenario inputs and encoded bytes must not drift.');
for(const [name,fixture] of Object.entries(expected.scenarios)){
  if(fixture.shareable){
    assert.deepEqual(Scenario.decode(fixture.encoded),fixture.state,name+' frozen link');
  } else {
    assert.equal(Scenario.decode(fixture.encoded),null,name+' exceeds the link budget');
    assert.throws(()=>Controller.create({capture:()=>fixture.state})
      .link('file:///solar-system.html'),/4096 LIMIT/);
  }
}
console.log('Frozen numerical, route, and v1/v2/v3 scenario references passed.');
