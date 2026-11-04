// Curated systems regression tests - runs in Node.
(function(){
  'use strict';

  // Load dependencies via require
  const path = require('path');
  const fs = require('fs');

  // Load curated-systems module
  const csPath = path.join(__dirname, '..', 'data', 'curated-systems.js');
  const csCode = fs.readFileSync(csPath, 'utf8');
  // Execute in a fresh scope
  const moduleObj = { exports: {} };
  const fn = new Function('root', csCode + '\nreturn globalThis.CuratedSystems;');
  const globalThis = {};
  const CS = fn.call(globalThis, globalThis);

  let passed = 0;
  let failed = 0;
  function assert(cond, msg){
    if(!cond){ failed++; console.error('FAIL:', msg); }
    else { passed++; }
  }

  // Test 1: SYSTEMS has expected entries
  assert(Array.isArray(CS.SYSTEMS), 'SYSTEMS is an array');
  assert(CS.SYSTEMS.length >= 8, 'At least 8 curated systems');

  // Test 2: System definitions have required fields and each has >= 2 bodies
  for(const sys of CS.SYSTEMS){
    assert(typeof sys.id === 'string' && sys.id, `System ${sys.id} has id`);
    assert(typeof sys.name === 'string' && sys.name, `System ${sys.id} has name`);
    assert(typeof sys.description === 'string' && sys.description, `System ${sys.id} has description`);
    assert(typeof sys.preview === 'string' && sys.preview, `System ${sys.id} has preview`);
    assert(Array.isArray(sys.bodies) && sys.bodies.length >= 2, `System ${sys.id} has >= 2 bodies`);
    for(const b of sys.bodies){
      assert(typeof b.id === 'string', `${sys.id}/${b.id} has id`);
      assert(typeof b.name === 'string', `${sys.id}/${b.id} has name`);
      assert(typeof b.kind === 'string', `${sys.id}/${b.id} has kind`);
      assert(typeof b.color === 'string' && b.color, `${sys.id}/${b.id} has color`);
      assert(typeof b.radius === 'number' && b.radius >= 0, `${sys.id}/${b.id} has radius`);
      if(b.kind === 'planet' || b.kind === 'comet') assert(typeof b.a === 'number', `${sys.id}/${b.id} has a (semi-major axis)`);
    }
  }

  // Test 3: findById works
  const solar = CS.findById('solar-system');
  assert(solar && solar.name === 'Our Solar System', 'findById solar-system');

  const tatooine = CS.findById('tatooine');
  assert(tatooine && tatooine.name === 'Tatooine', 'findById tatooine');

  const missing = CS.findById('nonexistent');
  assert(missing === null, 'findById returns null for missing id');

  // Test 4: buildEditableSystem produces valid structure with mu and state
  const solarSys = CS.findById('solar-system');
  const editable = CS.buildEditableSystem(solarSys);
  assert(editable && editable.mode === 'editable', 'buildEditableSystem returns editable mode');
  assert(typeof editable.epoch === 'number', 'buildEditableSystem has epoch');
  assert(Array.isArray(editable.bodies), 'buildEditableSystem has bodies array');
  assert(editable.bodies.length >= 8, `Solar system build has ${editable.bodies.length} bodies`);

  // Check that all bodies have mu >= 0 and (state or are moon)
  for(const b of editable.bodies){
    assert(typeof b.mu === 'number' && b.mu >= 0, `${b.name} has non-negative mu`);
    if(b.kind === 'moon'){
      assert(b.parentId, `${b.name} has parentId`);
    } else {
      assert(typeof b.x === 'number' && Number.isFinite(b.x), `${b.name} has x`);
      assert(typeof b.y === 'number' && Number.isFinite(b.y), `${b.name} has y`);
      assert(typeof b.z === 'number' && Number.isFinite(b.z), `${b.name} has z`);
      assert(typeof b.vx === 'number', `${b.name} has vx`);
      assert(typeof b.vy === 'number', `${b.name} has vy`);
      assert(typeof b.vz === 'number', `${b.name} has vz`);
    }
  }

  // Test 5: Tatooine builds with 3 bodies
  const tatooSys = CS.findById('tatooine');
  const tatooEditable = CS.buildEditableSystem(tatooSys);
  assert(tatooEditable.bodies.length >= 3, `Tatooine build has >= 3 bodies`);
  const starNames = tatooEditable.bodies.filter(b => b.kind === 'star').map(b => b.name);
  assert(starNames.includes('Tatoo I') && starNames.includes('Tatoo II'), 'Tatooine has both stars');

  // Test 6: Bodies have position/velocity state
  for(const b of editable.bodies){
    assert(typeof b.x === 'number' || b.kind === 'moon', `${b.name} has x or is moon`);
    assert(typeof b.y === 'number' || b.kind === 'moon', `${b.name} has y or is moon`);
    assert(typeof b.z === 'number' || b.kind === 'moon', `${b.name} has z or is moon`);
  }

  // Test 7: Moon bodies reference parent
  const pluto = editable.bodies.find(b => b.id === 'pluto');
  const charon = editable.bodies.find(b => b.id === 'charon');
  if(charon) assert(charon.parentId === 'pluto', 'Charon references Pluto as parent');

  // Test 8: Compact four system
  const compact = CS.findById('compact-four');
  const compactEditable = CS.buildEditableSystem(compact);
  const planetCount = compactEditable.bodies.filter(b => b.kind === 'planet').length;
  assert(planetCount >= 4, `Compact four has >= 4 planets, got ${planetCount}`);

  // Test 9: TRAPPIST-1 has 7 planets + star
  const trappist = CS.findById('trappist-1');
  const trappistEditable = CS.buildEditableSystem(trappist);
  const trappistPlanets = trappistEditable.bodies.filter(b => b.kind === 'planet').length;
  assert(trappistPlanets === 7, `TRAPPIST-1 has exactly 7 planets, got ${trappistPlanets}`);

  // Test 10: Binary Duet has 2 stars, no planets
  const binary = CS.findById('binary-duet');
  const binaryEditable = CS.buildEditableSystem(binary);
  const binaryStars = binaryEditable.bodies.filter(b => b.kind === 'star').length;
  assert(binaryStars === 2, `Binary Duet has 2 stars, got ${binaryStars}`);

  // Summary
  console.log(`Curated systems tests: ${passed} passed, ${failed} failed`);
  if(failed > 0) process.exit(1);
})();
