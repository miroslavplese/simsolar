const {test:baseTest,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const Scenario=require('../../src/scenario-state.js');
const root=path.resolve(__dirname,'../..');
const base='http://127.0.0.1:4173/';

const test=baseTest.extend({
  browserGuards:[async({page},use,testInfo)=>{
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.addInitScript(()=>{
      localStorage.setItem('tutorial:simsolar_tutorial_complete','1');
      window.__testErrors=[];
      window.addEventListener('error',event=>window.__testErrors.push(event.message));
      window.addEventListener('unhandledrejection',event=>
        window.__testErrors.push(String(event.reason)));
    });
    const coverageDirectory=process.env.SIMSOLAR_BROWSER_COVERAGE;
    if(coverageDirectory){
      await page.coverage.startJSCoverage({resetOnNavigation:false});
    }
    await use();
    expect(page.isClosed(),'The application page must remain open for error checks.').toBe(false);
    errors.push(...await page.evaluate(()=>window.__testErrors||[]));
    if(coverageDirectory){
      const entries=await page.coverage.stopJSCoverage();
      const result=[];
      for(const entry of entries){
        const url=new URL(entry.url);
        const file=url.protocol==='file:' ? fileURLToPath(url)
          : url.origin===new URL(base).origin
            ? path.resolve(root,'.'+decodeURIComponent(url.pathname)) : null;
        if(!file || !file.startsWith(root+path.sep)) continue;
        const relative=path.relative(root,file).split(path.sep).join('/');
        if(!relative.startsWith('src/') && relative!=='data/curated-systems.js') continue;
        // Route-instrumented scripts are not the source being measured.
        if(entry.source!==fs.readFileSync(file,'utf8')) continue;
        result.push({scriptId:entry.scriptId,url:file,functions:entry.functions});
      }
      fs.mkdirSync(coverageDirectory,{recursive:true});
      fs.writeFileSync(path.join(coverageDirectory,
        `browser-${testInfo.testId}-${testInfo.retry}.json`),JSON.stringify({result}));
    }
    expect(errors,testInfo.title+' browser errors').toEqual([]);
  },{auto:true}]
});

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
  await expect(page.locator('#scenarioStatus')).not.toContainText('SCENARIO RESTORE FAILED');
}

async function loadCurated(page,id){
  await page.locator('#curatedBtn').click();
  await page.locator(`.curated-card[data-id="${id}"]`).click();
  await expect(page.locator('#curatedBtn')).toHaveAttribute('aria-expanded','false');
}

async function share(page){
  await page.locator('#shareScenarioBtn').click();
  const state=Scenario.scenarioFromUrl(page.url());
  expect(state,'A share must produce a valid scenario, not retain an old URL.').not.toBeNull();
  await expect(page.locator('#scenarioStatus')).not.toContainText(/FAILED|TOO LARGE/);
  return state;
}

module.exports={test,expect,scenario,open,loadCurated,share,base};
