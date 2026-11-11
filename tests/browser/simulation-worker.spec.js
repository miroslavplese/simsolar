const {test,expect,scenario,open,base,loadCurated,share}=require('./harness.js');
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

function exposeResetComponents(){
  window.__resetComponents={};
  for(const name of ['SimSolarSimulation','SimSolarClock','SimSolarOrbits']){
    let api;
    Object.defineProperty(window,name,{
      configurable:true,
      get:()=>api,
      set(value){
        api={...value,create(deps){
          const component=value.create(deps);
          window.__resetComponents[name]=component;
          return component;
        }};
      }
    });
  }
}

for(const protocol of ['http','file']){
  test(`system replacement resets current time and accumulated state over ${protocol}`,async({page})=>{
    await page.addInitScript(exposeResetComponents);
    const now=new Date('2018-01-02T03:04:05.678Z');
    const days=date=>(date.getTime()-Date.UTC(2000,0,1,12))/86400000;
    await page.clock.setFixedTime(now);
    await open(page,scenario({direction:-1}),protocol==='http'
      ? base+'solar-system.html'
      : pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href);
    await loadCurated(page,'tatooine');
    expect(await page.evaluate(()=>{
      const {SimSolarClock:clock,SimSolarSimulation:simulation}=window.__resetComponents;
      return {time:clock.simDaysSinceJ2000,epoch:simulation.editableSystem.epoch,
        requested:clock.requestedDays,playing:clock.playing,direction:clock.direction};
    })).toEqual({time:days(now),epoch:days(now),requested:days(now),playing:false,direction:1});

    await page.evaluate(async()=>{
      const {SimSolarClock:clock,SimSolarSimulation:simulation,SimSolarOrbits:orbits}=
        window.__resetComponents;
      window.__previousSystem=simulation.editableSystem;
      window.__initialStates=simulation.serializedEditableSystem().bodies.map(body=>body.state);
      const time=clock.simDaysSinceJ2000+30;
      await simulation.prepareFrame(time);
      clock.simDaysSinceJ2000=time;
      const body=simulation.activeSystemBodies().at(-1);
      const trail=orbits.ensureHybridTrail(body,time,simulation.positionForBody(body,time));
      orbits.projectedHybridTrail(body,trail);
    });
    const later=new Date('2018-01-03T04:05:06.789Z');
    await page.clock.setFixedTime(later);
    await loadCurated(page,'tatooine');
    expect(await page.evaluate(()=>{
      const {SimSolarClock:clock,SimSolarSimulation:simulation}=window.__resetComponents;
      return {fresh:simulation.editableSystem!==window.__previousSystem,
        epoch:simulation.editableSystem.epoch,time:clock.simDaysSinceJ2000,
        statesMatch:JSON.stringify(simulation.serializedEditableSystem().bodies.map(body=>body.state))===
          JSON.stringify(window.__initialStates)};
    })).toEqual({fresh:true,epoch:days(later),time:days(later),statesMatch:true});
    const saved=await share(page);
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>
      window.__resetComponents.SimSolarClock.simDaysSinceJ2000)).toBe(saved.t);
    expect(await page.evaluate(()=>
      window.__resetComponents.SimSolarSimulation.editableSystem.epoch)).toBe(saved.system.epoch);

    await page.locator('#missionBtn').click();
    await page.locator('#dateInput').fill('2099-01-01');
    await page.locator('#dateInput').dispatchEvent('change');
    await expect(page.locator('#dateInput')).toBeDisabled();
    await page.getByRole('button',{name:'RESTORE SOLAR',exact:true}).click();
    await expect(page.locator('#dateInput')).toBeEnabled();
    await expect(page.locator('#dateInput')).toHaveValue('2018-01-03');
    await expect(page.locator('#modelOut')).toHaveText('JPL EPHEMERIS');
    await expect(page.locator('#playBtn')).toHaveText('▶');
    await expect.poll(()=>page.workers().length).toBe(0);
    expect((await share(page)).t).toBeCloseTo(days(later),6);

    await page.evaluate(()=>{
      window.__previousSolar=window.__resetComponents.SimSolarSimulation.hybridBranchAt(0).simulator;
    });
    await page.clock.setFixedTime(now);
    await loadCurated(page,'solar-system');
    expect(await page.evaluate(()=>{
      const {SimSolarClock:clock,SimSolarSimulation:simulation}=window.__resetComponents;
      return {time:clock.simDaysSinceJ2000,requested:clock.requestedDays,
        fresh:simulation.hybridBranchAt(0).simulator!==window.__previousSolar,
        system:simulation.editableSystem};
    })).toEqual({time:days(now),requested:days(now),fresh:true,system:null});
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
  await page.clock.setFixedTime(new Date('2026-08-14T05:06:07.890Z'));
  await page.addInitScript(forbidMainIntegration);
  await open(page,scenario({t:9720}));
  await loadCurated(page,'binary-duet');
  await page.locator('#legend').getByRole('button',{name:'Star B',exact:true}).click();
  await loadCurated(page,'solar-system');
  await expect(page.locator('#dateInput')).toHaveValue('2026-08-14');
  await expect(page.locator('#modelOut')).toHaveText('NEWTONIAN N-BODY');
  expect(await page.evaluate(()=>window.__mainIntegrationCalls)).toBe(0);
});

test('a long worker advance leaves animation and controls responsive and does not advance the displayed date early',async({page})=>{
  test.setTimeout(120000);
  await page.clock.setFixedTime(new Date('2026-08-14T05:06:07.890Z'));
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
  const previousWorker=page.workers().find(worker=>worker.url().includes('simulation-worker.js'));
  const closed=previousWorker.waitForEvent('close');
  await loadCurated(page,'solar-system');
  await closed;
  await expect(page.locator('#dateInput')).toBeEnabled();
  await expect(page.locator('#dateInput')).toHaveValue('2026-08-14');
  await expect.poll(()=>page.workers().filter(worker=>
    worker!==previousWorker && worker.url().includes('simulation-worker.js')).length).toBe(1);
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
