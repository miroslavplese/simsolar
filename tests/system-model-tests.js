const assert=require('node:assert/strict');
const {
  deletionClosure,dominantLightBody,catalogEntries,validateEditableSystem
}=require('../src/system-model.js');

const bodies=[
  {id:'star',name:'A',kind:'custom',appearance:'star',massKg:10},
  {id:'planet',name:'B',kind:'custom',massKg:2,parentId:'star'},
  {id:'moon',name:'C',kind:'moon',massKg:1,parentName:'B'},
  {id:'other',name:'D',kind:'custom',appearance:'star',massKg:20}
];
assert.deepEqual(
  [...deletionClosure(bodies,'star')].sort(),
  ['moon','planet','star']
);
assert.equal(dominantLightBody(bodies).id,'other');
assert.equal(dominantLightBody([{id:'x',name:'X'}]),null);
assert.equal(catalogEntries(bodies).find(item=>item.id==='star').target,false);
assert.equal(catalogEntries(bodies).find(item=>item.id==='planet').target,true);

const state={x:0,y:0,z:0,vx:0,vy:0,vz:0};
const system={
  mode:'editable',epoch:100,bodies:[
    {
      id:'a',name:'A',kind:'custom',appearance:'star',color:'#fff',
      radius:1,massKg:1,mu:1,state
    },
    {
      id:'b',name:'B',kind:'custom',parentId:'a',
      radius:1,massKg:1,mu:1,state:{...state,x:1}
    }
  ]
};
assert.equal(validateEditableSystem(system),true);
assert.equal(validateEditableSystem({
  ...system,bodies:[...system.bodies,{...system.bodies[1]}]
}),false);
assert.equal(validateEditableSystem({
  ...system,bodies:[{...system.bodies[1],parentId:'missing'}]
}),false);
assert.equal(validateEditableSystem({...system,bodies:[]}),true);

console.log('System model tests passed.');
