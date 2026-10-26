const assert=require('node:assert/strict');
const {groups}=require('../src/body-select.js');

const bodies=[
  {id:'sun',name:'Sun',kind:'star'},
  {id:'earth',name:'Earth',kind:'planet'},
  {id:'mars',name:'Mars',kind:'planet'},
  {id:'jupiter',name:'Jupiter',kind:'planet'},
  {id:'pluto',name:'Pluto',kind:'planet'},
  {id:'charon',name:'Charon',kind:'planet',parentName:'Pluto'},
  {id:'moon',name:'Moon',kind:'moon',parentId:'earth'},
  {id:'io',name:'Io',kind:'moon',parentName:'Jupiter'},
  {id:'europa',name:'Europa',kind:'moon',parentId:'jupiter'},
  {id:'craft',name:'Voyager 1',kind:'spacecraft'},
  {id:'comet',name:'Halley',kind:'comet'}
];
const grouped=groups(bodies);
assert.deepEqual(grouped.map(group=>group.label),[
  'Stars, planets & moons','Earth system','Stars, planets & moons','Jupiter system',
  'Pluto system','Spacecraft','Comets'
]);
assert.deepEqual(grouped.find(group=>group.label==='Jupiter system').entries
  .map(entry=>[entry.body.name,entry.depth]),[
  ['Jupiter',0],['Io',1],['Europa',1]
]);
assert.equal(grouped.find(group=>group.label==='Pluto system').entries[1].body.name,'Charon');
assert.equal(grouped.flatMap(group=>group.entries).length,bodies.length);
assert.deepEqual(grouped.flatMap(group=>group.entries.map(entry=>entry.body.name)),[
  'Sun','Earth','Moon','Mars','Jupiter','Io','Europa','Pluto','Charon','Voyager 1','Halley'
]);
const filtered=groups(bodies.filter(body=>body.kind==='moon'),bodies);
assert.deepEqual(filtered.map(group=>group.label),['Earth system','Jupiter system']);
assert.equal(filtered[0].entries[0].body.name,'Moon');
assert.equal(filtered[0].entries[0].depth,1);
assert.deepEqual(groups([],bodies),[]);
const expanded=groups([
  ...bodies,{id:'webb',name:'James Webb Space Telescope',kind:'spacecraft'}
]);
assert.equal(expanded.filter(group=>group.label==='Spacecraft').length,1);
assert.deepEqual(expanded.find(group=>group.label==='Spacecraft').entries
  .map(entry=>entry.body.name),['Voyager 1','James Webb Space Telescope']);

const custom=[
  {id:'child',name:'Companion',kind:'custom',parentId:'planet'},
  {id:'planet',name:'World',kind:'custom',parentId:'star'},
  {id:'star',name:'Custom star',kind:'custom'},
  {id:'orphan',name:'Orphan',kind:'custom',parentId:'missing'}
];
assert.deepEqual(groups(custom)[0].entries.map(entry=>[entry.body.name,entry.depth]),[
  ['Custom star',0],['World',1],['Companion',2]
]);
assert.equal(groups(custom)[1].entries[0].body.name,'Orphan');
assert.deepEqual(groups(custom.slice(0,2),custom)[0].entries
  .map(entry=>entry.body.name),['World','Companion']);
const cyclic=[
  {id:'a',name:'A',parentId:'b'},
  {id:'b',name:'B',parentId:'a'}
];
assert.equal(groups(cyclic).flatMap(group=>group.entries).length,2);
console.log('Hierarchical body-select tests passed.');
