const assert=require('node:assert/strict');
const Tutorial=require('../src/guided-tutorial.js');

assert.equal(
  Tutorial.cookieContains('theme=dark; simsolar_tutorial_complete=1','simsolar_tutorial_complete'),
  true
);
assert.equal(
  Tutorial.cookieContains('simsolar_tutorial_complete=10','simsolar_tutorial_complete'),
  false
);

const values=new Map();
const storage={
  getItem:key=>values.get(key)||null,
  setItem:(key,value)=>values.set(key,value)
};
const document={cookie:''};
assert.equal(Tutorial.completionStored(document,storage),false);
Tutorial.storeCompletion(document,storage);
assert.match(document.cookie,/simsolar_tutorial_complete=1/);
assert.match(document.cookie,/Max-Age=31536000/);
assert.match(document.cookie,/SameSite=Lax/);
assert.equal(Tutorial.completionStored(document,storage),true);

const cookieDocument={cookie:'simsolar_tutorial_complete=1'};
assert.equal(Tutorial.completionStored(cookieDocument,null),true);

console.log('Guided tutorial tests passed.');
