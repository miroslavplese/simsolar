const {test,expect,scenario,open,base,loadCurated}=require('./harness.js');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const Gravity=require('../../src/nbody-simulation.js');

function forbidMainIntegration(){
  let gravity;
  window.__mainIntegrationCalls=0;
  Object.defineProperty(window,'NBodySimulation',{
    configurable:true,
    get:()=>gravity,
    set(value){
      gravity={...value,createSimulator(...args){
        const simulator=value.createSimulator(...args);
        for(const method of ['stateAt','massiveStateAt','prepareTo']){
          simulator[method]=()=>{
            window.__mainIntegrationCalls++;
            throw new Error('Unexpected main-thread integration: '+method);
          };
        }
        return simulator;
      }};
    }
  });
  let hierarchy;
  Object.defineProperty(window,'HierarchicalMoonSimulation',{
    configurable:true,
    get:()=>hierarchy,
    set(value){
      hierarchy={...value,createSimulator(...args){
        const simulator=value.createSimulator(...args);
        for(const method of ['stateAt','prepareTo']){
          simulator[method]=()=>{
            window.__mainIntegrationCalls++;
            throw new Error('Unexpected main-thread moon integration: '+method);
          };
        }
        return simulator;
      }};
    }
  });
}

test('future playback and date navigation use worker snapshots, not main-thread integrators',async({page})=>{
  await page.addInitScript(forbidMainIntegration);
  const worker=page.waitForEvent('worker');
  await open(page,scenario({
    t:9720,selected:'Earth',follow:'Earth',
    view:{zoom:500,panX:0,panY:0,yaw:0,tilt:0.4}
  }));
  expect((await worker).url()).toContain('simulation-worker.js');
  await expect(page.locator('#cardDist')).not.toHaveText('—');
  const before=await page.locator('#dateInput').inputValue();
  await page.locator('#playBtn').click();
  await expect.poll(()=>page.locator('#dateInput').inputValue()).not.toBe(before);
  await page.locator('#playBtn').click();
  await page.locator('#missionBtn').click();
  await page.locator('#dateInput').fill('2027-03-01');
  await page.locator('#dateInput').dispatchEvent('change');
  await expect(page.locator('#dateInput')).toBeEnabled();
  await expect(page.locator('#dateInput')).toHaveValue('2027-03-01');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});

test('restoring the Solar preset at a future date does not replay physics on the UI thread',async({page})=>{
  await page.addInitScript(forbidMainIntegration);
  await open(page,scenario({t:9720}));
  await loadCurated(page,'binary-duet');
  await page.locator('#legend').getByRole('button',{name:'Star B',exact:true}).click();
  await loadCurated(page,'solar-system');
  await expect(page.locator('#modelOut')).toHaveText('NEWTONIAN N-BODY');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});

test('a long worker advance leaves animation and controls responsive and does not advance the displayed date early',async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(forbidMainIntegration);
  await open(page,scenario({t:9720}));
  const date=await page.locator('#dateInput').inputValue();
  await page.locator('#missionBtn').click();
  await page.locator('#dateInput').fill('2099-01-01');
  await page.locator('#dateInput').dispatchEvent('change');
  await expect(page.locator('#dateInput')).toBeDisabled();
  await page.locator('#legendBtn').click();
  const samples=await page.evaluate(()=>new Promise(resolve=>{
    const times=[];
    function frame(time){
      times.push(time);
      if(times.length===20) resolve(times.slice(1).map((t,i)=>t-times[i]));
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  expect(Math.max(...samples)).toBeLessThan(250);
  await expect(page.locator('#dateOut')).toContainText(date.slice(8));
  await loadCurated(page,'solar-system');
  await expect(page.locator('#dateInput')).toBeEnabled();
  await expect(page.locator('#scenarioStatus')).not.toContainText('2099');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});

test('direct-file future playback uses cooperative snapshots without a Worker',async({page})=>{
  await open(page,scenario({t:9720,selected:'Earth'}),
    pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href);
  await expect(page.locator('#cardDist')).not.toHaveText('—');
  const before=await page.locator('#dateInput').inputValue();
  await page.locator('#playBtn').click();
  await expect.poll(()=>page.locator('#dateInput').inputValue()).not.toBe(before);
  await page.locator('#playBtn').click();
  expect(page.workers()).toHaveLength(0);
});

test('worker failure is visible and pauses playback instead of falling back to blocking integration',async({page})=>{
  await page.addInitScript(forbidMainIntegration);
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      constructor(url,options){
        if(String(url).includes('simulation-worker.js')){
          const failureUrl=URL.createObjectURL(new Blob(
            ['throw new Error("Deliberate simulation failure")'],{type:'text/javascript'}
          ));
          super(failureUrl,options);
          URL.revokeObjectURL(failureUrl);
        } else super(url,options);
      }
    };
  });
  await page.goto(base+'solar-system.html?scenario='+require('../../src/scenario-state.js').encode(
    scenario({t:9720})
  ));
  await expect(page.locator('#scenarioStatus')).toContainText('Deliberate simulation failure');
  await expect(page.locator('#scenarioStatus')).toBeVisible();
  await expect(page.locator('#playBtn')).toHaveText('▶');
  await loadCurated(page,'binary-duet');
  await expect(page.locator('#modelOut')).toHaveText('EDITABLE BARYCENTRIC N-BODY');
  await page.locator('#legend').getByRole('button',{name:'Star A',exact:true}).click();
  await expect(page.locator('#cardName')).toContainText('Star A');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});

test('collision refinement and merge use completed worker states',async({page})=>{
  await page.addInitScript(forbidMainIntegration);
  const bodies=[0,1].map(index=>({
    id:'impact-'+index,name:'Impact '+index,kind:'custom',appearance:'planet',
    radius:1000,massKg:(index+1)*1e20,mu:Gravity.massKgToMu((index+1)*1e20),
    state:{x:(index?1:-1)*0.000005,y:0,z:0,vx:0,vy:0,vz:0}
  }));
  await open(page,scenario({t:100,system:{mode:'editable',epoch:100,bodies}}));
  await page.locator('#playBtn').click();
  await expect(page.locator('#impactMergeBtn')).toBeEnabled();
  await page.locator('#impactMergeBtn').click();
  await expect(page.locator('#legend')).toContainText('remnant');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});
