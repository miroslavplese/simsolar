const {test,expect}=require('@playwright/test');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const Scenario=require('../../src/scenario-state.js');
const base='http://127.0.0.1:4173/';
function scenario(overrides={}){
  return {
    v:3,t:5672,playing:false,speed:0.69897,direction:1,
    selected:null,follow:null,
    view:{zoom:0.28,panX:0,panY:0,yaw:0,tilt:0.4},
    layers:{spacecraft:true,comets:true,lagrange:false,rotating:false},
    observatory:null,missionPlan:null,system:null,...overrides
  };
}
async function open(page,state=scenario(),url=base+'solar-system.html'){
  await page.goto(Scenario.urlWithScenario(url,state));
  await expect(page.locator('#dateInput')).not.toHaveValue('');
}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('tutorial:simsolar_tutorial_complete','1');
  });
});
test.afterEach(async({page},info)=>{
  const errors=await page.evaluate(()=>window.__testErrors||[]).catch(()=>[]);
  expect(errors,info.title+' browser errors').toEqual([]);
});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.__testErrors=[];
    window.addEventListener('error',event=>window.__testErrors.push(event.message));
    window.addEventListener('unhandledrejection',event=>
      window.__testErrors.push(String(event.reason)));
  });
});
test('static entry, direct-file launch, and v1/v2/v3 scenario links',async({page})=>{
  for(const version of [1,2,3]){
    await open(page,scenario({v:version,selected:'Earth',follow:'Earth'}),base);
    await expect(page.locator('#cardName')).toHaveText('Earth');
    await expect(page.locator('#cardDist')).not.toHaveText('—');
    await expect(page.locator('#playBtn')).toHaveText('▶');
  }
  const file=pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href;
  await open(page,scenario({selected:'Saturn'}),file);
  await expect(page.locator('#cardName')).toHaveText('Saturn');
  await expect(page.locator('#cardNote')).toContainText('NASA/JPL');
});
test('mission timeline, selection, layers, and view presets',async({page})=>{
  await open(page);
  await page.locator('#missionBtn').click();
  await page.locator('#missionSelect').selectOption('New Horizons');
  await page.locator('#eventList button').filter({hasText:'2015-07-14'}).click();
  await expect(page.locator('#cardName')).toHaveText('New Horizons');
  await expect(page.locator('#dateInput')).toHaveValue('2015-07-14');
  for(const preset of ['Deep','Inner','Outer']){
    await page.locator('#viewPreset').selectOption(preset);
    await expect(page.locator('#viewPreset')).toHaveValue(preset);
  }
  await page.locator('#shareScenarioBtn').click();
  const state=Scenario.scenarioFromUrl(page.url());
  expect(state.selected).toBe('New Horizons');
  expect(state.playing).toBe(false);
  await page.reload();
  await expect(page.locator('#cardName')).toHaveText('New Horizons');
});
test('observatory, telescope, and scenario round trip',async({page})=>{
  await open(page,scenario({selected:'Saturn'}));
  await page.locator('#observatoryBtn').click();
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  await page.locator('#observatoryTelescopeBtn').click();
  await page.locator('#observatoryTelescopeTarget').selectOption('Saturn');
  await page.locator('#observatoryTelescopeReticle').uncheck();
  await page.locator('#shareScenarioBtn').click();
  const state=Scenario.scenarioFromUrl(page.url());
  expect(state.observatory.telescope.target).toBe('Saturn');
  expect(state.observatory.telescope.reticle).toBe(false);
  await page.reload();
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  await expect(page.locator('#observatoryTelescopeReticle')).not.toBeChecked();
  await page.locator('#observatoryClose').click();
  await expect(page.locator('#stage')).not.toHaveClass(/observatory-active/);
});
test('mission planning, save/load, and cockpit',async({page})=>{
  await open(page);
  const worker=page.waitForEvent('worker');
  await page.locator('#plannerBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
  expect((await worker).url()).toContain('mission-worker.js');
  await page.locator('#plannerSaveBtn').click();
  await expect(page.locator('#plannerLibrary option')).not.toHaveCount(1);
  await page.locator('#plannerCockpitBtn').click();
  await expect(page.locator('#stage')).toHaveClass(/spacecraft-view-active/);
  await expect(page.locator('#spacecraftHudSpeed')).not.toHaveText('—');
  await page.locator('#shareScenarioBtn').click();
  expect(Scenario.scenarioFromUrl(page.url()).spacecraftView).not.toBeNull();
  await page.reload();
  await expect(page.locator('#stage')).toHaveClass(/spacecraft-view-active/);
  await page.locator('#spacecraftViewExit').click();
  await expect(page.locator('#stage')).not.toHaveClass(/spacecraft-view-active/);
});
test('direct-file mission search uses the cooperative fallback',async({page})=>{
  await open(page,scenario(),pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href);
  await page.locator('#plannerBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
  expect(page.workers()).toHaveLength(0);
});
test('worker route results exactly match the synchronous reference',async({page})=>{
  await open(page);
  const equal=await page.evaluate(async()=>{
    const plan={version:1,id:'worker-test',name:'Worker test',waypoints:[
      {body:'Earth',role:'departure',earliest:0,latest:10},
      {body:'Mars',role:'target',earliest:200,latest:300}
    ]};
    const stateAt=(name,t)=>{
      const radius=name==='Earth'?1:1.524;
      const n=Math.sqrt(TrajectoryMath.GM_SUN_AU_DAY/radius**3);
      return {x:radius*Math.cos(n*t),y:radius*Math.sin(n*t),z:0,
        vx:-radius*n*Math.sin(n*t),vy:radius*n*Math.cos(n*t),vz:0};
    };
    const options={bodyInfo:()=>({muKm3S2:398600,radiusKm:6371})};
    const sync=MissionPlanner.searchRoutes(plan,stateAt,options);
    const worker=await MissionSearch.search(plan,stateAt,options);
    return JSON.stringify(sync)===JSON.stringify(worker);
  });
  expect(equal).toBe(true);
});
test('cancelled future mission preparation cannot replace a newer plan',async({page})=>{
  await open(page);
  await page.locator('#plannerBtn').click();
  await page.locator('#plannerDepartureStart').fill('2090-01-01');
  await page.locator('#plannerDepartureEnd').fill('2090-06-01');
  await page.locator('#plannerArrivalStart').fill('2091-01-01');
  await page.locator('#plannerArrivalEnd').fill('2092-01-01');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerStatus')).toContainText('Preparing');
  await page.locator('#plannerNewBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeDisabled();
  await expect(page.locator('#plannerName')).toHaveValue('New interplanetary mission');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await expect(page.locator('#plannerSearchBtn')).toBeEnabled();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
});
test('legacy comet IDs survive catalog expansion',async({page})=>{
  const body={
    id:'solar-body-halley-30',name:'Halley',kind:'comet',
    massKg:2.2e14,mu:0,dynamicClass:'particle',
    state:{x:1,y:0,z:0,vx:0,vy:0.02,vz:0}
  };
  await open(page,scenario({
    t:100,selected:'Halley',selectedId:body.id,
    system:{mode:'editable',epoch:100,bodies:[body]}
  }));
  await expect(page.locator('#cardName')).toHaveText('Halley');
  await expect(page.locator('#cardNote')).toContainText('Perihelion');
  await page.locator('#shareScenarioBtn').click();
  expect(Scenario.scenarioFromUrl(page.url()).selectedId).toBe(body.id);
});
test('all recent missions have images, details, events, and shareable selection',async({page})=>{
  await open(page,scenario({t:9500}));
  await page.locator('#missionBtn').click();
  for(const name of ['James Webb Space Telescope','Lucy','Psyche','Europa Clipper']){
    await page.locator('#missionSelect').selectOption(name);
    await expect(page.locator('#cardName')).toHaveText(name);
    await expect(page.locator('#cardWiki')).toHaveAttribute('href',/wikipedia/);
    await expect(page.locator('#cardMission')).toHaveAttribute('href',/science.nasa.gov/);
    await expect(page.locator('#cardImage')).toBeVisible();
    await expect.poll(()=>page.locator('#cardImage').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('#eventList button')).not.toHaveCount(1);
    await page.locator('#eventList button').first().click();
    await expect(page.locator('#cardDist')).not.toHaveText('Not launched');
    await page.locator('#shareScenarioBtn').click();
    expect(Scenario.scenarioFromUrl(page.url()).selected).toBe(name);
  }
  await page.reload();
  await expect(page.locator('#cardName')).toHaveText('Europa Clipper');
  await expect(page.locator('#missionSelect')).toHaveValue('Europa Clipper');
  await expect(page.locator('#eventList button').first()).toContainText('2024-10-14');
});
test('images are lazy, offline-capable, and failures show an explicit schematic',async({page,context})=>{
  const requested=[];
  page.on('request',request=>{
    if(request.url().includes('/assets/objects/')) requested.push(request.url());
  });
  await open(page);
  expect(requested).toEqual([]);
  await page.locator('#legend .body-name').filter({hasText:/^Earth$/}).click();
  await expect.poll(()=>requested.length).toBe(1);
  await expect.poll(()=>page.locator('#cardImage').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#cardImageCaption')).toBeHidden();
  await expect(page.locator('#cardImageCredits')).toHaveCount(0);
  const source='https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg';
  await expect(page.locator('#cardImageLink')).toHaveAttribute('href',source);
  await expect(page.locator('#cardImageLink')).toHaveAttribute('title',/Public domain/);
  await context.route(source,route=>route.fulfill({body:'Original image source'}));
  const opened=page.waitForEvent('popup');
  await page.locator('#cardImage').click();
  const original=await opened;
  await expect(original).toHaveURL(source);
  await original.close();
  await context.setOffline(true);
  const file=pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href;
  await open(page,scenario({selected:'Titan'}),file);
  await expect.poll(()=>page.locator('#cardImage').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await context.setOffline(false);
  await page.route('**/assets/objects/mars.*',route=>route.abort());
  await open(page,scenario({selected:'Mars'}));
  await expect(page.locator('#cardImageCaption')).toContainText('unavailable');
  await expect(page.locator('#cardImage')).toHaveAttribute('src',/^data:image\/svg/);
  await expect(page.locator('#cardImageLink')).toHaveCount(0);
});
test('editable system selection, deletion, restore, and schematic images',async({page})=>{
  const body={
    id:'custom-test',name:'Test Planet',kind:'custom',appearance:'planet',
    color:'#70b7ff',radius:6371,massKg:5.972e24,mu:1e-9,
    notes:'Browser regression fixture.',state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}
  };
  await open(page,scenario({
    t:100,selected:body.name,selectedId:body.id,
    system:{mode:'editable',epoch:100,bodies:[body]}
  }));
  await expect(page.locator('#modelOut')).toContainText('EDITABLE');
  await expect(page.locator('#cardImage')).toHaveAttribute('src',/^data:image\/svg/);
  await expect(page.locator('#cardImageLink')).toHaveCount(0);
  await page.locator('#shareScenarioBtn').click();
  await page.reload();
  await expect(page.locator('#cardName')).toHaveText(body.name);
  await page.getByRole('button',{name:'Delete Test Planet',exact:true}).click();
  await expect(page.locator('#legend')).toContainText('Blank system');
  await page.getByRole('button',{name:'RESTORE SOLAR',exact:true}).click();
  await expect(page.locator('#legend')).toContainText('Earth');
  await expect(page.locator('#modelOut')).toHaveText('JPL EPHEMERIS');
});
test('future date preparation yields and keeps controls responsive',async({page})=>{
  await open(page);
  await page.locator('#missionBtn').click();
  await page.evaluate(()=>{
    window.__heartbeats=0;
    window.__heartbeatTimer=setInterval(()=>window.__heartbeats++,10);
  });
  await page.locator('#dateInput').fill('2026-09-01');
  await page.locator('#dateInput').dispatchEvent('change');
  await expect(page.locator('#dateInput')).toBeEnabled({timeout:45000});
  await expect(page.locator('#modelOut')).toHaveText('NEWTONIAN N-BODY');
  expect(await page.evaluate(()=>window.__heartbeats)).toBeGreaterThan(1);
  await page.evaluate(()=>clearInterval(window.__heartbeatTimer));
});
test('mobile viewport and tutorial remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  await page.locator('#tutorialBtn').click();
  await expect(page.locator('.tutorial-tooltip')).toBeVisible();
  await page.locator('.tutorial-skip').click();
  await expect(page.locator('.tutorial-tooltip')).toBeHidden();
  await page.locator('#missionBtn').click();
  await expect(page.locator('#missionPanel')).toBeVisible();
});
module.exports={scenario};
