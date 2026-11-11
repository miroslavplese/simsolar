const {test,expect,scenario,open,loadCurated,base}=require('./harness.js');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const Scenario=require('../../src/scenario-state.js');
async function expectCuratedArtwork(page){
  const images=page.locator('.curated-card img');
  await expect(images).toHaveCount(9);
  await expect.poll(()=>images.evaluateAll(elements=>elements.every(image=>
    image.complete && image.naturalWidth===640 && image.naturalHeight===360 &&
    image.getAttribute('src')===
      `assets/curated-systems/${image.closest('.curated-card').dataset.id}.webp`
  ))).toBe(true);
}
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
  await page.locator('#curatedBtn').click();
  await expectCuratedArtwork(page);
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
  await page.clock.setFixedTime(new Date('2015-07-13T12:00:00Z'));
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
  await page.clock.setFixedTime(new Date('2015-07-13T12:00:00Z'));
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
  await expect(page.locator('.card-provenance:visible')).toHaveCount(0);
  await expect(page.locator('#cardProvenanceNote')).toBeHidden();
  await page.locator('#shareScenarioBtn').click();
  await page.reload();
  await expect(page.locator('#cardName')).toHaveText(body.name);
  await page.getByRole('button',{name:'Delete Test Planet',exact:true}).click();
  await expect(page.locator('#legend')).toContainText('Blank system');
  await page.getByRole('button',{name:'RESTORE SOLAR',exact:true}).click();
  await expect(page.locator('#legend')).toContainText('Earth');
  await expect(page.locator('#modelOut')).toHaveText('JPL EPHEMERIS');
});
test('all curated info panels show portraits and provenance through sharing and offline reload',async({page,context})=>{
  // All 29 portraits, reloads, and V8 coverage teardown exceed the default budget.
  test.setTimeout(120000);
  const requested=[];
  page.on('request',request=>{
    if(request.url().includes('/assets/objects/curated/')) requested.push(request.url());
  });
  await open(page);
  expect(requested).toEqual([]);
  const Curated=require('../../data/curated-systems.js');
  const systems=Curated.SYSTEMS.filter(system=>system.mode!=='solar');
  const portraits=new Set();
  const expectPortrait=async body=>{
    await expect(page.locator('#cardName')).toHaveText(body.name);
    await expect(page.locator('#cardImage')).toHaveAttribute('src',
      'assets/objects/curated/'+body.id+'.webp?v=2');
    await expect.poll(()=>page.locator('#cardImage').evaluate(image=>
      [image.naturalWidth,image.naturalHeight])).toEqual([640,360]);
    await expect(page.locator('#cardImage')).toHaveAttribute('alt',
      body.name+' - artistic illustration');
    await expect(page.locator('#cardImageCaption')).toBeVisible();
    await expect(page.locator('#cardImageCaption')).toHaveText('Artistic illustration');
    await expect(page.locator('#cardImageLink')).toHaveCount(0);
    await expect(page.locator('#cardImage')).toHaveCSS('background-color','rgb(0, 0, 0)');
    const provenance=Curated.valueProvenance({
      ...body,massKg:body.kind==='star'?body.solarMass*1.98847e30:body.earthMass*5.9722e24
    });
    const fields={Mass:'mass',Radius:'radius',Dist:'distance',Period:'period',
      Speed:'speed',Ecc:'eccentricity',Incl:'inclination'};
    for(const [id,field] of Object.entries(fields)){
      const origin=provenance[field];
      await expect(page.locator('#card'+id+'Provenance')).toHaveText(
        origin[0].toUpperCase()+origin.slice(1));
    }
    await expect(page.locator('#cardProvenanceNote')).toHaveText(provenance.note);
  };
  for(const system of systems){
    await loadCurated(page,system.id);
    for(const body of system.bodies){
      const button=page.locator('#legend').getByRole('button',{name:body.name,exact:true});
      if(body.parentId && !await button.isVisible()){
        const parent=system.bodies.find(candidate=>candidate.id===body.parentId);
        await page.locator('#legend').getByRole('button',{name:parent.name,exact:true}).click();
      }
      await button.click();
      await expectPortrait(body);
      const portrait=await page.locator('#cardImage').evaluate(image=>{
        const canvas=document.createElement('canvas');
        canvas.width=640; canvas.height=360;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,640,360).data;
        let blackBackground=true;
        for(let y=0;y<360;y++){
          for(let x=0;x<640;x++){
            // Exclude the stellar glow and WebP filtering around its edge.
            if((x-320)**2+(y-180)**2<=200**2) continue;
            const offset=(y*640+x)*4;
            if(pixels[offset]!==0 || pixels[offset+1]!==0 ||
              pixels[offset+2]!==0 || pixels[offset+3]!==255) blackBackground=false;
          }
        }
        canvas.width=64; canvas.height=36;
        canvas.getContext('2d').drawImage(image,0,0,64,36);
        return {preview:canvas.toDataURL(),blackBackground};
      });
      expect(portrait.blackBackground,body.name+' has a solid black background').toBe(true);
      portraits.add(portrait.preview);
    }
  }
  expect(portraits.size).toBe(29);
  expect(new Set(requested).size).toBe(29);
  await page.locator('#shareScenarioBtn').click();
  const shared=Scenario.scenarioFromUrl(page.url());
  const lastBody=systems.at(-1).bodies.at(-1);
  expect(shared.selectedId).toBe(lastBody.id);
  await page.reload();
  await expectPortrait(lastBody);
  const renamed={...lastBody,name:'Renamed world'};
  shared.system.bodies.find(body=>body.id===lastBody.id).name=renamed.name;
  shared.selected=renamed.name;
  if(shared.follow===lastBody.name) shared.follow=renamed.name;
  await context.setOffline(true);
  await open(page,shared,pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href);
  await expectPortrait(renamed);
  await context.setOffline(false);
  await loadCurated(page,'solar-system');
  const credits=require('../../assets/objects/credits.json');
  for(const name of ['Earth','Sun']){
    await page.locator('#legend').getByRole('button',{name,exact:true}).click();
    await expect(page.locator('#cardImage')).toHaveAttribute('src',credits[name].src);
    await expect.poll(()=>page.locator('#cardImage').evaluate(image=>image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator('#cardImageCaption')).toBeHidden();
    await expect(page.locator('#cardImageLink')).toHaveAttribute('href',credits[name].source);
    await expect(page.locator('.card-provenance:visible')).toHaveCount(0);
    await expect(page.locator('#cardProvenanceNote')).toBeHidden();
  }
  await page.route('**/assets/objects/curated/'+lastBody.id+'.webp*',route=>route.abort());
  await open(page,shared);
  await expect(page.locator('#cardImageCaption')).toContainText('unavailable');
  await expect(page.locator('#cardImage')).toHaveAttribute('src',/^data:image\/svg/);
  await expect(page.locator('#cardImageLink')).toHaveCount(0);
});
test('curated provenance distinguishes edited values and fits smaller viewports',async({page})=>{
  await open(page);
  await loadCurated(page,'kepler-442');
  await page.locator('#legend').getByRole('button',{name:'Kepler-442 b',exact:true}).click();
  await expect(page.locator('#cardMassProvenance')).toHaveText('Estimated');
  await expect(page.locator('#cardRadiusProvenance')).toHaveText('Approximate');
  await expect(page.locator('#cardEccProvenance')).toHaveText('Arbitrary');
  await expect(page.locator('#cardDistProvenance')).toHaveText('Simulated');
  await page.locator('#shareScenarioBtn').click();
  const shared=Scenario.scenarioFromUrl(page.url());
  const body=shared.system.bodies.find(body=>body.id==='kepler-442-b');
  body.massKg*=2;
  body.mu*=2;
  body.radius*=1.1;
  body.name='Edited world';
  shared.selected=body.name;
  if(shared.follow) shared.follow=body.name;
  await open(page,shared);
  await expect(page.locator('#cardName')).toHaveText(body.name);
  await expect(page.locator('#cardMassProvenance')).toHaveText('Edited');
  await expect(page.locator('#cardRadiusProvenance')).toHaveText('Edited');
  await expect(page.locator('#cardInclProvenance')).toHaveText('Arbitrary');
  await expect(page.locator('#cardProvenanceNote')).toContainText('Preset:');
  await loadCurated(page,'alpha-centauri');
  await page.locator('#legend').getByRole('button',{name:'Proxima Cen',exact:true}).click();
  await page.locator('#legend').getByRole('button',{name:'Proxima d',exact:true}).click();
  await expect(page.locator('#cardProvenanceNote')).toContainText(
    'compressed to 0.23 and 2.6 AU');
  await expect(page.locator('#cardRadiusProvenance')).toHaveText('Arbitrary');
  for(const viewport of [{width:1440,height:1000},{width:1280,height:720},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(async()=>{
      const box=await page.locator('#card').boundingBox();
      return box.y>=0 && box.y+box.height<=viewport.height &&
        box.x>=0 && box.x+box.width<=viewport.width;
    }).toBe(true);
    await page.locator('#cardProvenanceNote').scrollIntoViewIfNeeded();
    await expect(page.locator('#cardProvenanceNote')).toBeInViewport();
    expect(await page.locator('#card').evaluate(card=>card.scrollWidth<=card.clientWidth)).toBe(true);
  }
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
test('asteroid belt is visible only in the built-in Solar System',async({page})=>{
  async function measureBelt(){
    return page.evaluate(async()=>{
      const original=AsteroidBelt.draw;
      let count=0;
      AsteroidBelt.draw=(...args)=>{
        const result=original(...args);
        count+=result;
        return result;
      };
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      AsteroidBelt.draw=original;
      return count;
    });
  }
  await open(page,scenario({view:{zoom:2,panX:0,panY:0,yaw:0,tilt:0.4}}));
  expect(await measureBelt()).toBe(5000);
  const original=await page.locator('#orbits').evaluate(canvas=>canvas.toDataURL());
  await page.evaluate(async()=>{
    const draw=AsteroidBelt.draw;
    AsteroidBelt.draw=()=>0;
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    AsteroidBelt.draw=draw;
  });
  expect(await page.locator('#orbits').evaluate(canvas=>canvas.toDataURL())).not.toBe(original);
  await page.getByRole('button',{name:'Delete Earth',exact:true}).click();
  await expect(page.locator('#modelOut')).toContainText('EDITABLE');
  expect(await measureBelt()).toBe(0);
  await open(page,scenario({system:{mode:'editable',epoch:5672,bodies:[]}}));
  expect(await measureBelt()).toBe(0);
  await page.getByRole('button',{name:'RESTORE SOLAR',exact:true}).click();
  expect(await measureBelt()).toBeGreaterThan(0);
  const file=pathToFileURL(path.resolve(__dirname,'../../solar-system.html')).href;
  await open(page,scenario(),file);
  expect(await measureBelt()).toBeGreaterThan(0);
  await open(page,scenario({view:{zoom:60,panX:0,panY:0,yaw:1,tilt:0.8}}));
  expect(await measureBelt()).toBe(0);
});
test('planetary cloud equators and oblateness follow the ring axis',async({page})=>{
  await open(page);
  const texture=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=512;
    canvas.height=256;
    const context=canvas.getContext('2d');
    context.fillStyle='#0000ff';
    context.fillRect(0,0,512,256);
    context.fillStyle='#00ff00';
    context.fillRect(0,125,512,6);
    return canvas.toDataURL().split(',')[1];
  });
  await page.route('**/assets/textures/{saturn,jupiter}.webp',route=>
    route.fulfill({contentType:'image/png',body:Buffer.from(texture,'base64')}));
  const results=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=202;
    const context=canvas.getContext('2d');
    let ready;
    const renderer=BodyTextures.createRenderer({onReady:()=>ready()});
    if(!renderer) throw new Error('WebGL texture renderer unavailable');
    const results=[];
    for(const name of ['Saturn','Jupiter']){
      await new Promise(resolve=>{
        ready=resolve;
        renderer.draw(name,context,101,101,90,{});
      });
      const ring=RingSystem.PLANETARY_RINGS[name];
      const pole=RingSystem.normalVector(ring);
      const equatorX=RingSystem.relativePoint(ring,RingSystem.AU_KM,0);
      const equatorY=RingSystem.relativePoint(ring,RingSystem.AU_KM,Math.PI/2);
      for(const roll of [0,0.65,1.4]){
        const right={
          x:equatorY.x*Math.cos(roll)+pole.x*Math.sin(roll),
          y:equatorY.y*Math.cos(roll)+pole.y*Math.sin(roll),
          z:equatorY.z*Math.cos(roll)+pole.z*Math.sin(roll)
        };
        const basis=BodyTextures.viewBasis(equatorX,right,pole);
        context.clearRect(0,0,202,202);
        renderer.draw(name,context,101,101,90,{
          orientation:BodyTextures.orientationMatrix(name,5672,basis),
          light:{x:0,y:0,z:1}
        });
        const sample=(x,y)=>Array.from(context.getImageData(
          Math.round(101+x),Math.round(101-y),1,1
        ).data);
        results.push({
          name,roll,
          equator:sample(40*Math.cos(roll),-40*Math.sin(roll)),
          latitude:sample(40*Math.sin(roll),40*Math.cos(roll)),
          equatorialLimb:sample(87*Math.cos(roll),-87*Math.sin(roll)),
          polarLimb:sample(87*Math.sin(roll),87*Math.cos(roll))
        });
      }
      context.clearRect(0,0,202,202);
      renderer.draw(name,context,101,101,90,{
        orientation:BodyTextures.orientationMatrix(
          name,0,BodyTextures.viewBasis(pole,equatorX,equatorY)
        ),
        light:{x:0,y:0,z:1}
      });
      results.push({
        name,poleOn:true,
        horizontal:context.getImageData(188,101,1,1).data[3],
        vertical:context.getImageData(101,188,1,1).data[3]
      });
    }
    return results;
  });
  for(const result of results){
    if(result.poleOn){
      expect(result.horizontal).toBeGreaterThan(200);
      expect(result.vertical).toBeGreaterThan(200);
    } else {
      expect(result.equator[1],JSON.stringify(result)).toBeGreaterThan(result.equator[2]*3);
      expect(result.latitude[2],JSON.stringify(result)).toBeGreaterThan(result.latitude[1]*3);
      expect(result.equatorialLimb[3],JSON.stringify(result)).toBeGreaterThan(200);
      expect(result.polarLimb[3],JSON.stringify(result)).toBe(0);
    }
  }
});
test('all generated curated textures load, wrap, and render with the correct lighting',async({page})=>{
  await page.route('**/texture-test.html',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Texture renderer test</title>'
  }));
  await page.goto(base+'texture-test.html');
  await page.addScriptTag({url:base+'src/ring-system.js'});
  await page.addScriptTag({url:base+'src/body-textures.js'});
  const bodies=require('../../data/curated-systems.js').SYSTEMS
    .flatMap(system=>system.bodies||[]);
  const results=await page.evaluate(async bodies=>{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=162;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const map=document.createElement('canvas');
    map.width=1024;
    map.height=512;
    const mapContext=map.getContext('2d',{willReadFrequently:true});
    let ready;
    const renderer=BodyTextures.createRenderer({onReady:()=>ready()});
    if(!renderer) throw new Error('WebGL texture renderer unavailable');
    const results=[];
    for(const body of bodies){
      const renamed={...body,name:'Same display name'};
      const belowThreshold=renderer.draw(renamed,context,81,81,6,{});
      const lazy=!renderer.states.has(body.id);
      await new Promise(resolve=>{
        ready=resolve;
        renderer.draw(renamed,context,81,81,70,{});
      });
      const image=renderer.states.get(body.id).image;
      mapContext.clearRect(0,0,1024,512);
      mapContext.drawImage(image,0,0);
      const pixels=mapContext.getImageData(0,0,1024,512).data;
      let opaque=true;
      for(let offset=3;offset<pixels.length;offset+=4){
        if(pixels[offset]!==255) opaque=false;
      }
      let seamDifference=0;
      for(let y=0;y<512;y++){
        for(let channel=0;channel<3;channel++){
          seamDifference+=Math.abs(
            pixels[y*1024*4+channel]-pixels[(y*1024+1023)*4+channel]
          );
        }
      }
      const render=light=>{
        context.clearRect(0,0,162,162);
        const drawn=renderer.draw(renamed,context,81,81,70,{light});
        const pixel=Array.from(context.getImageData(81,81,1,1).data);
        return {drawn,pixel};
      };
      results.push({
        id:body.id,star:body.kind==='star',belowThreshold,lazy,opaque,
        width:image.naturalWidth,height:image.naturalHeight,
        seamDifference:seamDifference/(512*3),
        front:render({x:0,y:0,z:1}),
        back:render({x:0,y:0,z:-1})
      });
    }
    return results;
  },bodies);
  expect(results).toHaveLength(29);
  for(const result of results){
    expect(result.belowThreshold,result.id).toBe(false);
    expect(result.lazy,result.id).toBe(true);
    expect(result.opaque,result.id).toBe(true);
    expect([result.width,result.height],result.id).toEqual([1024,512]);
    expect(result.seamDifference,result.id).toBeLessThan(12);
    expect(result.front.drawn,result.id).toBe(true);
    expect(result.back.drawn,result.id).toBe(true);
    expect(result.front.pixel[3],result.id).toBe(255);
    if(result.star){
      expect(result.front.pixel,result.id).toEqual(result.back.pixel);
    } else {
      const brightness=pixel=>pixel.slice(0,3).reduce((sum,value)=>sum+value,0);
      expect(brightness(result.front.pixel),result.id)
        .toBeGreaterThan(brightness(result.back.pixel)*5);
    }
  }
});
test('all body dropdowns group families and preserve eligible selections',async({page})=>{
  await open(page);
  for(const id of [
    'observatoryBody','observatoryTelescopeTarget','occultationObserver',
    'plannerDeparture','plannerTarget'
  ]){
    const select=page.locator('#'+id);
    await expect(select.locator('optgroup[label="Jupiter system"] option[value="Io"]'))
      .toContainText('↳');
    await expect(select.locator('optgroup[label="Pluto system"] option[value="Charon"]'))
      .toContainText('↳');
    const values=await select.locator('option').evaluateAll(options=>options.map(option=>option.value));
    expect(new Set(values).size).toBe(values.length);
  }
  await expect(page.locator('#observatoryTelescopeTarget option[value="Earth"]')).toHaveCount(0);
  await expect(page.locator('#observatoryTelescopeTarget optgroup[label="Earth system"] option[value="Moon"]'))
    .toHaveCount(1);
  await expect(page.locator('#observatoryTelescopeTarget > option[value=""]'))
    .toHaveText('NO TRACKED TARGET');
  await expect(page.locator('#missionSelect optgroup[label="Spacecraft"] option')).toHaveCount(10);
  await expect(page.locator('#plannerTarget optgroup[label="Spacecraft"]')).toHaveCount(1);
  await expect(page.locator('#plannerTarget optgroup[label="Spacecraft"] option')).toHaveCount(10);
  await expect(page.locator('#plannerDeparture')).toHaveValue('Earth');
  await expect(page.locator('#plannerTarget')).toHaveValue('Mars');

  await page.locator('#plannerBtn').click();
  await page.locator('#plannerTarget').selectOption('Europa');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerAddAssistBtn').click();
  const assist=page.getByRole('combobox',{name:'Gravity-assist body'});
  await expect(assist.locator('optgroup[label="Jupiter system"] option[value="Jupiter"]')).toHaveCount(1);
  await expect(assist.locator('option[value="Sun"]')).toHaveCount(0);
  await assist.selectOption('Saturn');
  await page.getByRole('button',{name:'Delete Jupiter',exact:true}).click();
  await expect(assist).toHaveValue('Saturn');
  await expect(page.locator('#plannerDeparture')).toHaveValue('Earth');
  await expect(page.locator('#plannerTarget')).toHaveValue('');
  await expect(page.locator('#plannerStatus')).toContainText('target was removed');
  for(const id of ['plannerDeparture','plannerTarget','observatoryBody','occultationObserver']){
    await expect(page.locator('#'+id+' option[value="Jupiter"]')).toHaveCount(0);
    await expect(page.locator('#'+id+' option[value="Io"]')).toHaveCount(0);
  }
  await expect(assist.locator('option[value="Jupiter"]')).toHaveCount(0);
  await expect(page.locator('#observatoryBody')).toHaveValue('Earth');
  await page.locator('.plannerTabs [data-planner-tab="launch"]').click();
  await page.locator('#plannerTarget').selectOption('Mars');
  await page.getByRole('button',{name:'Delete Saturn',exact:true}).click();
  await expect(page.locator('#plannerAssistList select')).toHaveCount(0);
  await expect(page.locator('#plannerDeparture')).toHaveValue('Earth');
  await expect(page.locator('#plannerTarget')).toHaveValue('Mars');
  await page.getByRole('button',{name:'RESTORE SOLAR',exact:true}).click();
  await expect(page.locator('#plannerTarget optgroup[label="Jupiter system"] option[value="Europa"]'))
    .toHaveCount(1);
});
test('custom body dropdowns preserve parent context without making stars targets',async({page})=>{
  const bodies=[
    {id:'star',name:'Custom star',kind:'custom',appearance:'star',radius:10000,massKg:1e25,mu:1e-6,
      state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
    {id:'world',name:'Custom world',kind:'custom',appearance:'planet',parentId:'star',
      radius:1000,massKg:1e20,mu:1e-9,state:{x:1,y:0,z:0,vx:0,vy:0.01,vz:0}},
    {id:'moon',name:'Custom moon',kind:'custom',appearance:'planet',parentId:'world',
      radius:100,massKg:1e18,mu:1e-11,state:{x:1.01,y:0,z:0,vx:0,vy:0.011,vz:0}}
  ];
  await open(page,scenario({t:100,system:{mode:'editable',epoch:100,bodies}}));
  for(const id of ['plannerDeparture','plannerTarget','observatoryBody']){
    const group=page.locator('#'+id+' optgroup[label="Custom star system"]');
    await expect(group.locator('option')).toHaveCount(2);
    expect(await group.locator('option').evaluateAll(options=>options.map(option=>option.value)))
      .toEqual(['Custom world','Custom moon']);
    await expect(group.locator('option[value="Custom moon"]')).toHaveText('\u00a0\u00a0\u00a0\u00a0↳ Custom moon',{ignoreCase:true});
  }
  await expect(page.locator('#plannerTarget option[value="Custom star"]')).toHaveCount(0);
});
test('mobile viewport and tutorial remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  await page.locator('#tutorialBtn').click();
  await expect(page.locator('.tutorial-tooltip')).toBeVisible();
  await page.locator('.tutorial-next').click();
  await page.locator('.tutorial-next').click();
  await expect(page.locator('.tutorial-tooltip')).toContainText(
    'restoring Solar starts fresh at the current time');
  await expect(page.locator('.tutorial-tooltip')).toContainText(
    'Shared scenario links keep their saved date');
  await page.locator('.tutorial-skip').click();
  await expect(page.locator('.tutorial-tooltip')).toBeHidden();
  await page.locator('#missionBtn').click();
  await expect(page.locator('#missionPanel')).toBeVisible();
});

test('curated library loads all examples with valid cards and resets the real Solar preset',async({page})=>{
  await page.clock.setFixedTime(new Date('2018-01-02T03:04:05.678Z'));
  await open(page,scenario({selected:'Earth',follow:'Earth'}));
  await page.locator('#curatedBtn').click();
  await expectCuratedArtwork(page);
  const pictures=await page.locator('.curated-card img').evaluateAll(images=>
    images.map(image=>{
      const canvas=document.createElement('canvas');
      canvas.width=64; canvas.height=36;
      const context=canvas.getContext('2d');
      context.drawImage(image,0,0,64,36);
      return canvas.toDataURL();
    })
  );
  expect(new Set(pictures).size).toBe(9);
  await page.locator('#curatedClose').click();
  const date='2018-01-02';
  await expect(page.locator('#dateInput')).not.toHaveValue(date);
  const definitions=await page.evaluate(()=>CuratedSystems.SYSTEMS
    .filter(system=>system.mode!=='solar')
    .map(system=>({id:system.id,count:system.bodies.length,
      planet:system.bodies.find(body=>body.kind==='planet')})));
  for(const definition of definitions){
    await loadCurated(page,definition.id);
    await expect(page.locator('#legend .system-status')).toContainText(`${definition.count} BODIES`);
    await expect(page.locator('#dateInput')).toHaveValue(date);
    await expect(page.locator('#playBtn')).toHaveText('▶');
    await expect(page.locator('#card')).toBeHidden();
    await expect(page.locator('#dock')).toBeVisible();
    await expect(page.locator('#modelOut')).toContainText('EDITABLE');
    if(definition.planet){
      if(definition.planet.parentId){
        const parent=await page.evaluate(id=>CuratedSystems.SYSTEMS
          .flatMap(system=>system.bodies||[]).find(body=>body.id===id).name,
        definition.planet.parentId);
        await page.locator('#legend').getByRole('button',{name:parent,exact:true}).click();
      }
      await page.locator('#legend')
        .getByRole('button',{name:definition.planet.name,exact:true}).click();
      await expect(page.locator('#cardPeriod')).not.toContainText('NaN');
      await expect(page.locator('#cardPeriod')).toContainText(/days|years/);
      await expect(page.locator('#cardIncl')).not.toContainText('Not specified');
      await expect(page.locator('#cardEcc')).not.toContainText('Not specified');
      await expect(page.locator('#rowDist')).toContainText('barycenter');
      await expect(page.locator('#cardNote')).toContainText('Illustrative');
      await expect(page.locator('#observatoryBtn')).toBeEnabled();
    } else {
      await expect(page.locator('#observatoryBtn')).toBeDisabled();
    }
  }
  await loadCurated(page,'solar-system');
  await expect(page.locator('#modelOut')).toHaveText('JPL EPHEMERIS');
  await expect(page.locator('#legend .system-status')).toHaveCount(0);
  await expect(page.locator('#missionSelect option')).toHaveCount(10);
  await expect(page.locator('#observatoryBody option[value="Saturn"]')).toHaveCount(0);
  await page.locator('#legend').getByRole('button',{name:'Jupiter',exact:true}).click();
  await expect(page.locator('#cardMass')).toContainText('1.898e27');
  await expect(page.locator('#rowDist')).toContainText('Sun');
});

test('curated switch invalidates solved missions and refreshes all catalogs',async({page})=>{
  await page.clock.setFixedTime(new Date('2015-07-13T12:00:00Z'));
  await open(page);
  await page.locator('#plannerBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
  await loadCurated(page,'tatooine');
  await expect(page.locator('#spacecraftViewBtn')).toBeDisabled();
  await expect(page.locator('#plannerCockpitBtn')).toBeDisabled();
  await expect(page.locator('#plannerPreviewBtn')).toBeDisabled();
  await expect(page.locator('#plannerSaveBtn')).toBeDisabled();
  await expect(page.locator('#plannerMetricDuration')).toHaveText('—');
  await expect(page.locator('#plannerManeuverList .plannerManeuver')).toHaveCount(0);
  await expect(page.locator('#plannerPanel')).toBeHidden();
  await expect(page.locator('#missionSelect option')).toHaveCount(0);
  for(const id of ['plannerDeparture','plannerTarget','observatoryBody']){
    await expect(page.locator(`#${id} option[value="Earth"]`)).toHaveCount(0);
    await expect(page.locator(`#${id} option[value="Tatooine"]`)).toHaveCount(1);
  }
  await expect(page.locator('#occultationObserver option')).toHaveCount(0);
  await expect(page.locator('#occultationBtn')).toBeDisabled();
  await expect(page.locator('#nextOccultationBtn')).toBeDisabled();
  await expect(page.locator('#occultationStatus')).toContainText('built-in Solar planet or moon');
  await page.keyboard.press('v');
  await expect(page.locator('#stage')).not.toHaveClass(/spacecraft-view-active/);
  for(let iteration=0;iteration<2;iteration++){
    await page.keyboard.press('e');
    await expect(page.locator('#occultationPanel')).toBeVisible();
    await expect(page.locator('#occultationType')).toBeDisabled();
    await expect(page.locator('#nextOccultationBtn')).toBeDisabled();
    await page.locator('#occultationClose').click();
  }
});

test('curated switch cancels in-flight date navigation and rotating frames',async({page})=>{
  await open(page,scenario({selected:'Earth'}));
  await page.locator('#lagrangeBtn').click();
  await page.locator('#rotatingFrameBtn').click();
  await page.locator('#missionBtn').click();
  await page.locator('#dateInput').fill('2090-01-01');
  await page.locator('#dateInput').dispatchEvent('change');
  await expect(page.locator('#dateInput')).toBeDisabled();
  await loadCurated(page,'binary-duet');
  await expect(page.locator('#dateInput')).toBeEnabled();
  await expect(page.locator('#dateInput')).not.toHaveValue('2090-01-01');
  await expect(page.locator('#rotatingFrameBtn')).not.toHaveClass(/active/);
  await expect(page.locator('#lagrangeBtn')).not.toHaveClass(/active/);
  await expect(page.locator('#playBtn')).toHaveText('▶');
  await page.locator('#shareScenarioBtn').click();
  const state=Scenario.scenarioFromUrl(page.url());
  expect(state.t).toBe(state.system.epoch);
  expect(state.layers.rotating).toBe(false);
  expect(state.layers.lagrange).toBe(false);
});

test('compact curated planets remain bound through actual application integration',async({page})=>{
  await open(page);
  await loadCurated(page,'compact-four');
  await page.locator('#legend').getByRole('button',{name:'Planet 1',exact:true}).click();
  await page.locator('#missionBtn').click();
  const initialDate=await page.locator('#dateInput').inputValue();
  const future=new Date(Date.parse(initialDate+'T00:00:00Z')+100*86400000)
    .toISOString().slice(0,10);
  await page.locator('#dateInput').fill(future);
  await page.locator('#dateInput').dispatchEvent('change');
  await expect(page.locator('#dateInput')).toBeEnabled();
  await expect(page.locator('#eventDetail')).toContainText('Showing '+future);
  await expect(page.locator('#cardDist')).toHaveText('0.020 AU');
  await expect(page.locator('#cardPeriod')).not.toContainText('NaN');
});

test('curated observatory, binary references, and body metadata survive sharing',async({page})=>{
  await page.route('**/src/body-textures.js*',async route=>{
    const response=await route.fetch({maxRetries:2});
    await route.fulfill({response,body:await response.text()+`
      (function(){
        const create=BodyTextures.createRenderer;
        window.__textureDraws={};
        BodyTextures.createRenderer=function(options){
          const renderer=create(options);
          if(!renderer) return renderer;
          const draw=renderer.draw;
          renderer.draw=function(body,...args){
            const drawn=draw(body,...args);
            if(drawn){
              const view=document.getElementById('stage')
                .classList.contains('observatory-active')?'observatory':'system';
              window.__textureDraws[view+':'+body.id]=true;
            }
            return drawn;
          };
          return renderer;
        };
      })();
    `});
  });
  await open(page);
  await loadCurated(page,'tatooine');
  await page.locator('#legend').getByRole('button',{name:'Tatooine',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__textureDraws['system:tatooine-planet']))
    .toBe(true);
  const period=await page.locator('#cardPeriod').textContent();
  await page.locator('#shareScenarioBtn').click();
  let state=Scenario.scenarioFromUrl(page.url());
  expect(state.system).not.toBeNull();
  expect(Math.abs(state.view.panX)).toBeGreaterThan(100000);
  expect(state.system.bodies.find(body=>body.name==='Tatooine').genericSurface).toBe(true);
  expect(state.system.bodies.find(body=>body.name==='Tatoo I').orbitPrimaryIds)
    .toEqual(['tatoo2']);
  await page.reload();
  await expect(page.locator('#cardPeriod')).toHaveText(period);
  await expect.poll(()=>page.evaluate(()=>window.__textureDraws['system:tatooine-planet']))
    .toBe(true);
  await page.locator('#observatoryBtn').click();
  await expect(page.locator('#observatoryBody')).toHaveValue('Tatooine');
  await page.locator('#observatoryLongitude').fill('180');
  await page.locator('#observatoryTelescopeBtn').click();
  await page.locator('#observatoryTelescopeTarget').selectOption('Tatoo II');
  await expect.poll(()=>page.evaluate(()=>window.__textureDraws['observatory:tatoo2']))
    .toBe(true);
  await page.locator('#shareScenarioBtn').click();
  state=Scenario.scenarioFromUrl(page.url());
  expect(state.observatory.telescope.target).toBe('Tatoo II');
  await page.reload();
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  await expect(page.locator('#observatoryTelescopeTarget')).toHaveValue('Tatoo II');
  await expect.poll(()=>page.evaluate(()=>window.__textureDraws['observatory:tatoo2']))
    .toBe(true);
  await open(page,{
    ...state,selected:'Tatoo II',follow:'Tatoo II',observatory:null,
    view:{...state.view,zoom:500,panX:0,panY:0}
  });
  await expect.poll(()=>page.evaluate(()=>window.__textureDraws['system:tatoo2']))
    .toBe(true);
  await loadCurated(page,'binary-duet');
  await page.getByRole('button',{name:'Delete Star B',exact:true}).click();
  await page.locator('#shareScenarioBtn').click();
  state=Scenario.scenarioFromUrl(page.url());
  expect(state.system.bodies).toHaveLength(1);
  expect(state.system.bodies[0].orbitPrimaryIds).toEqual([]);
});

test('curated panel and profiler can be repeatedly reopened on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  await page.keyboard.press('p');
  await expect(page.locator('#perfPanel')).toBeVisible();
  await loadCurated(page,'trappist-1');
  await expect(page.locator('#perfPanel')).toBeHidden();
  await page.keyboard.press('p');
  await expect(page.locator('#perfPanel')).toBeVisible();
  await page.keyboard.press('p');
  await page.locator('#curatedBtn').click();
  await expect(page.locator('#curatedSystemsPanel')).toBeVisible();
  const bounds=await page.locator('#curatedSystemsPanel').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await page.locator('#curatedClose').click();
  await expect(page.locator('#curatedBtn')).toHaveAttribute('aria-expanded','false');
});

test('TRAPPIST-1 mission defaults, date validation, gravity assists, and cockpit work',async({page})=>{
  await open(page);
  await loadCurated(page,'trappist-1');
  await page.locator('#plannerBtn').click();
  await expect(page.locator('#plannerDeparture')).toHaveValue('TRAPPIST-1b');
  await expect(page.locator('#plannerTarget')).toHaveValue('TRAPPIST-1c');
  const firstDate=await page.locator('#plannerDepartureStart').inputValue();
  const lastDate=await page.locator('#plannerArrivalEnd').inputValue();
  expect((Date.parse(lastDate)-Date.parse(firstDate))/86400000).toBeLessThan(7);
  await page.locator('#plannerDepartureStart').fill('2000-01-01');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerStatus')).toContainText('cannot precede');
  await expect(page.locator('#plannerSearchBtn')).toBeEnabled();
  await page.locator('#plannerNewBtn').click();
  await page.locator('#plannerTarget').selectOption('TRAPPIST-1b');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerStatus')).toContainText('different bodies');
  await page.locator('#plannerNewBtn').click();
  await expect(page.locator('#plannerTarget')).toHaveValue('TRAPPIST-1c');
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerStatus')).toHaveText('8 candidate routes found.');
  await page.locator('#plannerCockpitBtn').click();
  await expect(page.locator('#stage')).toHaveClass(/spacecraft-view-active/);
  await expect(page.locator('#spacecraftHudSpeed')).not.toHaveText('—');
  await page.locator('#spacecraftViewExit').click();
  await page.locator('#plannerBtn').click();
  await page.locator('#plannerNewBtn').click();
  await page.locator('.plannerTabs [data-planner-tab="encounters"]').click();
  await page.locator('#plannerAddAssistBtn').click();
  await expect(page.locator('#plannerAssistList select')).toHaveValue('TRAPPIST-1d');
  await expect(page.locator('#plannerAssistList select option')).toHaveCount(7);
  await expect(page.locator('#plannerAssistList option[value="Jupiter"]')).toHaveCount(0);
  await page.locator('#plannerSearchBtn').click();
  await expect(page.locator('#plannerCockpitBtn')).toBeEnabled();
});
module.exports={scenario};
