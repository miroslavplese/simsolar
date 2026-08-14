const assert=require('node:assert/strict');
const {
  DEFAULT_INTERACTIVE_SELECTOR,
  clampPanelPosition,
  installMovablePanels
}=require('../src/panel-drag.js');

assert.deepEqual(
  clampPanelPosition(100,75,200,150,800,600),
  {left:100,top:75}
);
assert.deepEqual(
  clampPanelPosition(-500,-400,200,150,800,600),
  {left:-152,top:-102}
);
assert.deepEqual(
  clampPanelPosition(900,700,200,150,800,600),
  {left:752,top:552}
);
assert.match(DEFAULT_INTERACTIVE_SELECTOR,/\bbutton\b/);
assert.match(DEFAULT_INTERACTIVE_SELECTOR,/\binput\b/);
assert.match(DEFAULT_INTERACTIVE_SELECTOR,/\.item/);

const listeners=new Map();
const windowListeners=new Map();
const classes=new Set();
const panel={
  style:{},
  dataset:{},
  classList:{
    add:value=>classes.add(value),
    remove:value=>classes.delete(value)
  },
  addEventListener:(type,listener)=>listeners.set(type,listener),
  removeEventListener:type=>listeners.delete(type),
  getBoundingClientRect(){
    return {
      left:this.style.left ? parseFloat(this.style.left) : 400,
      top:this.style.top ? parseFloat(this.style.top) : 300,
      width:200,
      height:100
    };
  },
  contains:target=>target===interactiveTarget,
  setPointerCapture(){},
  hasPointerCapture:()=>false
};
const fakeWindow={
  innerWidth:800,
  innerHeight:600,
  addEventListener:(type,listener)=>windowListeners.set(type,listener),
  removeEventListener:type=>windowListeners.delete(type)
};
const interactiveTarget={};
const plainTarget={closest:()=>null};
const controlTarget={closest:()=>interactiveTarget};
function pointerEvent(overrides){
  return Object.assign({
    pointerId:7,pointerType:'mouse',button:0,clientX:420,clientY:320,
    target:plainTarget,preventDefault(){}
  },overrides);
}

const uninstall=installMovablePanels([panel],{window:fakeWindow});
assert.ok(classes.has('movable-panel'));
listeners.get('pointerdown')(pointerEvent());
listeners.get('pointermove')(pointerEvent({clientX:500,clientY:375}));
assert.equal(panel.style.left,'480px');
assert.equal(panel.style.top,'355px');
listeners.get('pointerup')(pointerEvent({clientX:500,clientY:375}));
assert.ok(!classes.has('panel-dragging'));

listeners.get('pointerdown')(pointerEvent({target:controlTarget}));
assert.equal(panel.style.left,'480px');
assert.ok(!classes.has('panel-dragging'));
uninstall();
assert.equal(listeners.size,0);
assert.equal(windowListeners.size,0);

const originalAddEventListener=global.addEventListener;
const originalRemoveEventListener=global.removeEventListener;
const originalInnerWidth=global.innerWidth;
const originalInnerHeight=global.innerHeight;
global.addEventListener=()=>{};
global.removeEventListener=()=>{};
global.innerWidth=800;
global.innerHeight=600;
assert.doesNotThrow(()=>{
  const remove=installMovablePanels([]);
  remove();
});
global.addEventListener=originalAddEventListener;
global.removeEventListener=originalRemoveEventListener;
global.innerWidth=originalInnerWidth;
global.innerHeight=originalInnerHeight;

console.log('Panel drag tests passed.');
