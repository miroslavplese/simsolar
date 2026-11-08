const {test,expect,scenario,open,loadCurated,share,base}=require('./harness.js');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
const {scenarios}=require('../fixtures/refactor-reference.json');
const Gravity=require('../../src/nbody-simulation.js');

test('component wiring uses declared APIs during startup and system changes',async({page})=>{
  await page.route('**/src/app.js*',async route=>{
    const response=await route.fetch({maxRetries:2});
    const guard=`
      for(const name of Object.keys(window).filter(name=>name.startsWith('SimSolar'))){
        const factory=window[name];
        const create=factory.create;
        factory.create=deps=>new Proxy(create(deps),{
          get(target,key,receiver){
            if(typeof key==='string' && !(key in target)){
              throw new Error(name+' has no public member '+key);
            }
            return Reflect.get(target,key,receiver);
          },
          set(target,key,value,receiver){
            if(!(key in target)) throw new Error(name+' has no public member '+key);
            return Reflect.set(target,key,value,receiver);
          }
        });
      }
    `;
    await route.fulfill({response,body:guard+await response.text()});
  });
  await open(page,scenario({selected:'Earth',follow:'Earth'}));
  await expect(page.locator('#cardName')).toHaveText('Earth');
  await loadCurated(page,'tatooine');
  await page.locator('#legend').getByRole('button',{name:'Tatooine',exact:true}).click();
  await expect(page.locator('#cardName')).toHaveText('Tatooine');
  await page.locator('#tutorialBtn').click();
  await page.locator('.tutorial-skip').click();
  await expect(page.locator('#cardName')).toHaveText('Tatooine');
  await loadCurated(page,'solar-system');
  await expect(page.locator('#legend')).toContainText('Earth');
});

test('page suspension and repeated resume keep a single animation loop',async({page})=>{
  await page.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window);
    const cancel=window.cancelAnimationFrame.bind(window);
    window.__pendingFrames=new Set();
    window.__completedFrames=0;
    window.requestAnimationFrame=callback=>{
      const id=request(time=>{
        window.__pendingFrames.delete(id);
        window.__completedFrames++;
        callback(time);
      });
      window.__pendingFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame=id=>{
      window.__pendingFrames.delete(id);
      cancel(id);
    };
  });
  await open(page);
  await expect.poll(()=>page.evaluate(()=>window.__completedFrames)).toBeGreaterThan(2);
  const stopped=await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    return {pending:window.__pendingFrames.size,completed:window.__completedFrames};
  });
  expect(stopped.pending).toBe(0);
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.__completedFrames)).toBe(stopped.completed);
  await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await expect.poll(()=>page.evaluate(()=>window.__completedFrames))
    .toBeGreaterThan(stopped.completed);
  expect(await page.evaluate(()=>window.__pendingFrames.size)).toBe(1);
});

test('body-info close commands clear selection and follow across system changes',async({page})=>{
  await open(page,scenario({selected:'Earth',follow:'Earth'}));
  await expect(page.locator('#cardName')).toHaveText('Earth');
  await expect(page.locator('#card')).toBeVisible();
  await page.locator('#cardClose').click();
  await expect(page.locator('#card')).toBeHidden();
  let state=await share(page);
  expect(state.selected).toBeNull();
  expect(state.follow).toBeNull();
  await loadCurated(page,'tatooine');
  await page.locator('#legend').getByRole('button',{name:'Tatooine',exact:true}).click();
  await expect(page.locator('#cardName')).toHaveText('Tatooine');
  await expect(page.locator('#cardImageCaption')).toHaveText('Artistic illustration');
  await page.locator('#cardClose').click();
  await expect(page.locator('#card')).toBeHidden();
  state=await share(page);
  expect(state.selectedId).toBeNull();
  expect(state.followId).toBeNull();
  await loadCurated(page,'solar-system');
  await page.locator('#legend').getByRole('button',{name:'Earth',exact:true}).click();
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#cardName')).toHaveText('Earth');
  await expect(page.locator('#cardImageCaption')).toBeHidden();
  await expect(page.locator('.card-provenance:visible')).toHaveCount(0);
});

test('body editor inserts origin and inclined bodies through native pointer input',async({page})=>{
  await open(page,scenario({
    view:{zoom:1,panX:0,panY:0,yaw:0,tilt:0.4},
    system:{mode:'editable',epoch:5672,bodies:[]}
  }));
  await page.locator('#addBodyBtn').click();
  await page.locator('#bodyType').selectOption('star');
  await page.locator('#bodyPlaceBtn').click();
  await expect(page.locator('#bodyReadout')).toContainText('0.000, 0.000, 0.000 AU');
  await page.locator('#bodyName').fill('');
  await page.locator('#bodyInsertBtn').click();
  await expect(page.locator('#bodyInstructions')).toContainText('Enter a name');
  await page.locator('#bodyName').fill('Fixture Star');
  await page.locator('#bodyInsertBtn').click();
  await expect(page.locator('#cardName')).toHaveText('Fixture Star');
  const first=await share(page);
  expect(first.system.bodies).toHaveLength(1);
  expect(first.system.bodies[0].state).toEqual({x:0,y:0,z:0,vx:0,vy:0,vz:0});

  await page.locator('#cardClose').click();
  await page.locator('#addBodyBtn').click();
  await page.locator('#bodyType').selectOption('planet');
  await page.locator('#bodyName').fill('Fixture Planet');
  await page.locator('#bodyInclination').evaluate(input=>{
    input.value='30';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#bodyPlaceBtn').click();
  const scene=await page.locator('#scene').boundingBox();
  const x=scene.x+scene.width/2+150;
  const y=scene.y+scene.height/2;
  await page.mouse.click(x,y);
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y-60,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#bodyInsertBtn')).toBeEnabled();
  await expect(page.locator('#bodyReadout')).toContainText('Inclination: 30');
  await page.locator('#bodyInsertBtn').click();
  await expect(page.locator('#cardName')).toHaveText('Fixture Planet');
  const state=await share(page);
  expect(state.system.bodies).toHaveLength(2);
  const star=state.system.bodies.find(body=>body.name==='Fixture Star');
  const planet=state.system.bodies.find(body=>body.name==='Fixture Planet');
  expect(star.id).toBe(first.system.bodies[0].id);
  expect(planet.id).not.toBe(star.id);
  expect(planet.initialInclination).toBe(30);
  expect(Math.abs(planet.state.vz)).toBeGreaterThan(0);
  for(const key of ['x','y','z','vx','vy','vz']){
    const barycenter=(star.mu*star.state[key]+planet.mu*planet.state[key])/(star.mu+planet.mu);
    expect(Math.abs(barycenter)).toBeLessThan(1e-10);
  }
  await page.reload();
  await expect(page.locator('#cardName')).toHaveText('Fixture Planet');
  expect((await share(page)).selectedId).toBe(planet.id);
});

test('sky-event searches navigate to eclipses and conjunctions in the observatory',async({page})=>{
  await open(page,scenario({...scenarios['observatory-v3'].state,t:5672}));
  await page.locator('#occultationBtn').click();
  await page.locator('#occultationObserver').selectOption('Moon');
  await page.locator('#occultationType').selectOption('eclipse');
  await page.locator('#nextOccultationBtn').click();
  await expect(page.locator('#occultationStatus')).toContainText(/solar eclipse/i);
  await expect(page.locator('#occultationStatus')).toContainText('maximum coverage');
  await expect(page.locator('#nextOccultationBtn')).toBeEnabled();
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  const eclipse=await share(page);
  expect(eclipse.t).toBeGreaterThan(5672);
  expect(eclipse.playing).toBe(false);
  expect(eclipse.selected).toBe('Moon');
  expect(eclipse.observatory.body).toBe('Moon');

  await page.locator('#occultationType').selectOption('alignment');
  await page.locator('#previousOccultationBtn').click();
  await expect(page.locator('#occultationStatus')).toContainText('conjunction');
  await expect(page.locator('#occultationStatus')).toContainText('separation');
  await expect(page.locator('#previousOccultationBtn')).toBeEnabled();
  expect((await share(page)).t).toBeLessThan(eclipse.t);
});

test('frozen legacy links restore through HTTP and direct-file launch',async({page})=>{
  const file=pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href;
  for(const url of [base+'solar-system.html',file]){
    for(const name of ['legacy-v1','legacy-v2','solar-v3','binary-v3','observatory-v3']){
      const fixture=scenarios[name];
      await page.goto(url+'?scenario='+fixture.encoded);
      await expect(page.locator('#cardName')).toHaveText(fixture.state.selected);
      expect(await page.evaluate(()=>ScenarioState.scenarioFromUrl(location.href).v))
        .toBe(fixture.state.v);
      const restored=await share(page);
      expect(restored.v).toBe(3);
      expect(restored.t).toBe(fixture.state.t);
      expect(restored.playing).toBe(false);
      expect(restored.selected).toBe(fixture.state.selected);
      expect(restored.layers).toEqual(fixture.state.layers);
      if(fixture.state.system){
        expect(restored.system.bodies.map(body=>body.id))
          .toEqual(fixture.state.system.bodies.map(body=>body.id));
        expect(restored.selectedId).toBe(fixture.state.selectedId);
      }
      if(fixture.state.observatory){
        expect(restored.observatory).toMatchObject({
          body:'Earth',latitude:47.6062,longitude:-122.3321,clouds:false
        });
      }
    }
  }
});

test('switching systems terminates an active worker and permits a fresh search',async({page})=>{
  await page.clock.setFixedTime(new Date('2015-07-13T12:00:00Z'));
  await page.route('**/src/mission-worker.js',route=>route.fulfill({
    contentType:'text/javascript',body:'self.onmessage=function(){};'
  }));
  await open(page);
  await page.locator('#plannerBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect.poll(()=>page.workers().length).toBe(1);
  await loadCurated(page,'binary-duet');
  await expect.poll(()=>page.workers().length).toBe(0);
  await expect(page.locator('#plannerCockpitBtn')).toBeDisabled();
  await page.unroute('**/src/mission-worker.js');
  await loadCurated(page,'solar-system');
  await page.locator('#plannerBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
  await expect.poll(()=>page.workers().length).toBe(0);
  await expect(page.locator('#plannerStatus')).toContainText('candidate routes found');
});

test('a late weather response cannot re-enable clouds after changing observer',async({page})=>{
  await page.addInitScript(()=>{
    const fetch=window.fetch.bind(window);
    window.__weatherRequests=[];
    window.fetch=(url,options)=>{
      if(!String(url).includes('open-meteo.com')) return fetch(url,options);
      return new Promise(resolve=>{
        const request={aborted:false,complete:null};
        options.signal.addEventListener('abort',()=>{request.aborted=true;},{once:true});
        // Deliberately deliver after abort to exercise the stale-result guard as well.
        request.complete=()=>resolve(new Response(JSON.stringify({
          hourly:{
            time:['2015-07-14T12:00'],cloud_cover:[100],cloud_cover_low:[100],
            cloud_cover_mid:[100],cloud_cover_high:[100],
            wind_speed_10m:[10],wind_direction_10m:[180]
          }
        }),{status:200}));
        window.__weatherRequests.push(request);
      });
    };
  });
  const fixture=scenarios['observatory-v3'];
  await page.goto(base+'solar-system.html?scenario='+fixture.encoded);
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  await page.locator('#observatoryClouds').check();
  await expect.poll(()=>page.evaluate(()=>window.__weatherRequests.length)).toBe(1);
  await page.locator('#observatoryBody').selectOption('Mars');
  await expect.poll(()=>page.evaluate(()=>window.__weatherRequests[0].aborted)).toBe(true);
  await page.evaluate(()=>window.__weatherRequests[0].complete());
  await expect(page.locator('#observatoryClouds')).not.toBeChecked();
  await expect(page.locator('#observatoryClouds')).toBeDisabled();
  await expect(page.locator('#observatoryCloudStatus')).not.toContainText(/Loading|100%/);
  const state=await share(page);
  expect(state.observatory.body).toBe('Mars');
  expect(state.observatory.clouds).toBe(false);
  expect(await page.evaluate(()=>window.__weatherRequests.length)).toBe(1);
});

test('custom collision pauses playback and merges without losing mass or momentum',async({page})=>{
  const bodies=[1,2].map((multiple,index)=>({
    id:'impact-'+index,name:'Impact '+index,kind:'custom',appearance:'planet',
    color:'#70b7ff',radius:1000,massKg:multiple*1e20,
    mu:Gravity.massKgToMu(multiple*1e20),
    state:{x:(index?1:-1)*0.000005,y:0,z:0,vx:0,vy:0,vz:0}
  }));
  await open(page,scenario({t:100,system:{mode:'editable',epoch:100,bodies}}));
  await page.locator('#playBtn').click();
  await expect(page.locator('#impactMergeBtn')).toBeEnabled();
  await expect(page.locator('#playBtn')).toHaveText('\u25b6');
  await expect(page.locator('#impactStatus')).toContainText('impacted');
  await page.locator('#impactMergeBtn').click();
  const state=await share(page);
  expect(state.system.bodies).toHaveLength(1);
  const remnant=state.system.bodies[0];
  expect(remnant.massKg).toBe(3e20);
  expect(remnant.mu/(bodies[0].mu+bodies[1].mu)).toBeCloseTo(1,12);
  expect(remnant.radius).toBeCloseTo(Math.cbrt(2*1000**3),9);
  expect(state.system.epoch).toBe(100);
  expect(state.playing).toBe(false);
  for(const value of Object.values(remnant.state)) expect(Math.abs(value)).toBeLessThan(1e-12);
  await page.reload();
  await expect(page.locator('#legend')).toContainText('remnant');
  await expect(page.locator('#impactMergeBtn')).toBeDisabled();
});

test.describe('native pointer lifecycle',()=>{
  test.use({hasTouch:true});
  test('mouse pan, pinch zoom, and touch cancellation leave camera input usable',async({page})=>{
    await open(page);
    await page.mouse.move(1000,600);
    await page.mouse.down({button:'right'});
    await page.mouse.move(1060,630,{steps:4});
    await page.mouse.up({button:'right'});
    const panned=await share(page);
    expect(panned.view.panX).toBe(60);
    expect(panned.view.panY).toBe(30);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{
      type:'touchStart',touchPoints:[{x:900,y:600,id:0},{x:1100,y:600,id:1}]
    });
    await cdp.send('Input.dispatchTouchEvent',{
      type:'touchMove',touchPoints:[{x:850,y:600,id:0},{x:1150,y:600,id:1}]
    });
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    const pinched=await share(page);
    expect(pinched.view.zoom).toBeCloseTo(panned.view.zoom*1.5,6);
    await page.mouse.move(1000,600);
    await page.mouse.down();
    await page.mouse.move(1060,630,{steps:4});
    await page.mouse.up();
    const rotated=await share(page);
    expect(rotated.view.yaw).not.toBe(pinched.view.yaw);
    expect(rotated.view.zoom).toBe(pinched.view.zoom);
    expect(rotated.selected).toBeNull();
    await cdp.detach();
  });
});

test('repeated mode changes keep resources bounded and rendering responsive',async({page},info)=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{
    const frames=new Set(),intervals=new Set();
    const raf=window.requestAnimationFrame.bind(window);
    const cancel=window.cancelAnimationFrame.bind(window);
    const interval=window.setInterval.bind(window);
    const clear=window.clearInterval.bind(window);
    window.requestAnimationFrame=callback=>{
      const id=raf(time=>{frames.delete(id); callback(time);});
      frames.add(id);
      return id;
    };
    window.cancelAnimationFrame=id=>{frames.delete(id); cancel(id);};
    window.setInterval=(callback,delay,...args)=>{
      const id=interval(callback,delay,...args);
      intervals.add(id);
      return id;
    };
    window.clearInterval=id=>{intervals.delete(id); clear(id);};
    window.__pendingResources=()=>({frames:frames.size,intervals:intervals.size});
  });
  await open(page);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  async function cycle(){
    await loadCurated(page,'tatooine');
    // Pause in the same task so lifecycle measurements do not grow the integration history.
    await page.evaluate(()=>{
      document.getElementById('observatoryBtn').click();
      document.getElementById('playBtn').click();
    });
    await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
    await page.locator('#observatoryClose').click();
    await page.keyboard.press('p');
    await expect(page.locator('#perfPanel')).toBeVisible();
    await page.keyboard.press('p');
    await page.locator('#tutorialBtn').click();
    await page.locator('.tutorial-skip').click();
    await loadCurated(page,'solar-system');
    await expect(page.locator('#modelOut')).toHaveText('JPL EPHEMERIS');
  }
  async function measure(){
    await cdp.send('HeapProfiler.collectGarbage');
    // Let Blink release detached nodes before sampling retained resources.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    await cdp.send('HeapProfiler.collectGarbage');
    const dom=await cdp.send('Memory.getDOMCounters');
    const {metrics}=await cdp.send('Performance.getMetrics');
    const heap=metrics.find(metric=>metric.name==='JSHeapUsedSize').value;
    return {...dom,heap,...await page.evaluate(()=>window.__pendingResources())};
  }
  await cycle();
  await cycle();
  const before=await measure();
  for(let index=0;index<8;index++) await cycle();
  const after=await measure();
  const frames=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];
    let previous;
    function tick(time){
      if(previous!==undefined) samples.push(time-previous);
      previous=time;
      if(samples.length===60) resolve(samples.sort((a,b)=>a-b));
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  const p95Ms=frames[Math.ceil(frames.length*0.95)-1];
  const metricsPath=info.outputPath('lifecycle-metrics.json');
  fs.writeFileSync(metricsPath,JSON.stringify({
    before,after,p95Ms,platform:process.platform
  },null,2)+'\n');
  await info.attach('lifecycle-metrics',{
    path:metricsPath,
    contentType:'application/json'
  });
  expect(after.documents).toBe(before.documents);
  expect(after.nodes-before.nodes).toBeLessThanOrEqual(50);
  expect(after.jsEventListeners-before.jsEventListeners).toBeLessThanOrEqual(5);
  expect(after.heap-before.heap).toBeLessThan(8*1024*1024);
  expect(after.frames).toBe(1);
  expect(after.intervals).toBe(0);
  expect(page.workers()).toHaveLength(0);
  expect(p95Ms,'Coarse stall guard, not a 60 FPS performance claim.').toBeLessThan(250);
  await cdp.detach();
});
