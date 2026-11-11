const {test,expect,open,loadCurated,scenario,base}=require('./harness.js');
const {scenarios}=require('../fixtures/refactor-reference.json');

test.beforeEach(async({page})=>{
  test.skip(process.platform!=='win32',
    'Reviewed raster baselines use Windows Chromium/SwiftShader; functional tests are cross-platform.');
  await page.clock.setFixedTime(new Date('2026-01-02T03:04:05Z'));
});

async function frozen(page,name){
  const fixture=scenarios[name];
  expect(fixture.shareable).toBe(true);
  await page.goto(base+'solar-system.html?scenario='+fixture.encoded);
  await expect(page.locator('#dateInput')).not.toHaveValue('');
  await expect(page.locator('#playBtn')).toHaveText('\u25b6');
}

async function picture(page,name){
  await page.mouse.move(1438,998);
  if(await page.locator('#card').isVisible()){
    await expect.poll(()=>page.locator('#cardImage').evaluate(image=>
      image.complete && image.naturalWidth>0
    )).toBe(true);
  }
  await expect(page).toHaveScreenshot(name+'.png',{
    style:'#scenarioStatus { visibility: hidden !important; }'
  });
}

test('visual: Solar scene and body card',async({page})=>{
  await frozen(page,'solar-v3');
  await expect(page.locator('#cardName')).toHaveText('Earth');
  await picture(page,'solar-system');
});

test('visual: physical Saturn texture, rings, and follow camera',async({page})=>{
  await open(page,scenario({
    selected:'Saturn',follow:'Saturn',
    view:{zoom:6000,panX:0,panY:0,yaw:0.3,tilt:0.9}
  }));
  await expect(page.locator('#cardName')).toHaveText('Saturn');
  await picture(page,'saturn-close');
});

test('visual: compact curated scene and provenance',async({page})=>{
  await page.clock.setFixedTime(new Date('2015-07-13T12:00:00Z'));
  await open(page);
  await loadCurated(page,'trappist-1');
  await page.locator('#legend').getByRole('button',{name:'TRAPPIST-1e',exact:true}).click();
  await expect(page.locator('#cardMassProvenance')).toHaveText('Approximate');
  await picture(page,'trappist-system');
});

test('visual: paused surface observatory',async({page})=>{
  await frozen(page,'observatory-v3');
  await expect(page.locator('#stage')).toHaveClass(/observatory-active/);
  await picture(page,'observatory');
});

test('visual: restored mission cockpit',async({page})=>{
  await frozen(page,'cockpit-v2');
  await expect(page.locator('#stage')).toHaveClass(/spacecraft-view-active/);
  await expect(page.locator('#spacecraftHudSpeed')).not.toHaveText('\u2014');
  await picture(page,'cockpit');
});

test('visual: mobile curated card and controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await frozen(page,'binary-v3');
  await expect(page.locator('#cardName')).toHaveText('Tatooine');
  await picture(page,'mobile-curated');
});
