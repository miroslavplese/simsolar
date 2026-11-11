const {test,expect,scenario,open,loadCurated}=require('./harness.js');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const baseRef=process.env.SIMSOLAR_PERF_BASE;
if(!baseRef) throw new Error('Set SIMSOLAR_PERF_BASE to a reviewed Git revision before running performance comparisons.');
function git(...args){
  return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
}
const baseSha=git('rev-parse','--verify',baseRef+'^{commit}').trim();
const headSha=git('rev-parse','HEAD').trim();
// Include working-tree changes so local comparisons do not require a commit.
const changed=git('diff','--name-only',baseSha,'--','src','data','solar-system.html')
  .trim().split('\n').filter(Boolean);
const baselineSources=new Map();
for(const file of changed){
  if(!file.endsWith('.js') && file!=='solar-system.html') continue;
  const exists=git('ls-tree',baseSha,'--',file).trim();
  baselineSources.set(file,exists?git('show',baseSha+':'+file):null);
}

function instrument(){
  window.__performanceDraw=[];
  let api;
  Object.defineProperty(window,'SimSolarSceneRenderer',{
    configurable:true,
    get:()=>api,
    set(value){
      api={...value,create(deps){
        const renderer=value.create(deps);
        const draw=renderer.draw;
        renderer.draw=function(...args){
          const start=performance.now();
          try{return draw.apply(this,args);}
          finally{window.__performanceDraw.push(performance.now()-start);}
        };
        return renderer;
      }};
    }
  });
}

async function sample(page){
  return page.evaluate(()=>new Promise(resolve=>{
    window.__performanceDraw=[];
    const initialDate=document.getElementById('dateOut').textContent;
    const frames=[];
    let previous;
    let stopped=false;
    function tick(time){
      if(stopped) return;
      if(previous!==undefined) frames.push(time-previous);
      previous=time;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(()=>{
      stopped=true;
      const percentile=(values,fraction)=>{
        values.sort((a,b)=>a-b);
        return values[Math.min(values.length-1,Math.floor(values.length*fraction))];
      };
      const draw=window.__performanceDraw;
      resolve({
        draws:draw.length,frames:frames.length,
        drawP50:percentile(draw,0.5),drawP95:percentile(draw,0.95),
        frameP50:percentile(frames,0.5),frameP95:percentile(frames,0.95),
        initialDate,
        displayedDate:document.getElementById('dateOut').textContent
      });
    },3000);
  }));
}

for(const workload of [
  {name:'solar-overview',view:{zoom:0.28,panX:0,panY:0,yaw:0,tilt:0.4}},
  {name:'solar-close-follow',follow:'Earth',view:{zoom:500,panX:0,panY:0,yaw:0,tilt:0.4}},
  {name:'compact-curated',curated:'trappist-1'}
]){
  test('performance: '+workload.name,async({page,browser},info)=>{
    const samples={baseline:[],candidate:[]};
    await page.clock.setFixedTime(new Date(Date.UTC(2000,0,1,12)+9808*86400000));
    await page.addInitScript(instrument);
    for(let round=0;round<3;round++){
      // Alternate order to reduce systematic warm-up/thermal bias.
      for(const version of round%2?['candidate','baseline']:['baseline','candidate']){
        await page.unrouteAll({behavior:'wait'});
        // Routing both versions disables HTTP cache equally.
        await page.route('**/*',route=>{
          const file=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
          if(version!=='baseline' || !baselineSources.has(file)) return route.continue();
          const source=baselineSources.get(file);
          return source===null
            ? route.fulfill({status:404,body:'File absent in baseline revision'})
            : route.fulfill({
              contentType:file.endsWith('.html')?'text/html':'text/javascript',body:source
            });
        });
        await open(page,scenario({
          t:9808,playing:false,follow:workload.follow||null,
          view:workload.view||scenario().view
        }));
        if(workload.curated) await loadCurated(page,workload.curated);
        await expect(page.locator('#playBtn')).toHaveText('▶');
        await page.locator('#playBtn').click();
        const initial=await page.locator('#dateOut').textContent();
        await expect.poll(()=>page.locator('#dateOut').textContent()).not.toBe(initial);
        await page.waitForTimeout(2000);
        samples[version].push(await sample(page));
      }
    }
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const aggregate=version=>Object.fromEntries(
      ['drawP50','drawP95','frameP50','frameP95'].map(key=>[
        key,median(samples[version].map(result=>result[key]))
      ])
    );
    const baseline=aggregate('baseline'),candidate=aggregate('candidate');
    const evidence={
      workload:workload.name,baseSha,headSha,
      scenario:{time:9808,speed:scenario().speed,follow:workload.follow||null,
        view:workload.view||scenario().view,curated:workload.curated||null,
        layers:{spacecraft:true,comets:true}},
      dirty:git('status','--porcelain').trim()!=='',
      platform:process.platform,node:process.version,browser:browser.version(),
      viewport:info.project.use.viewport,rounds:3,warmupMs:2000,sampleMs:3000,
      samples,baseline,candidate,
      limits:{drawRatio:1.5,drawAllowanceMs:2,frameRatio:1.5,frameAllowanceMs:5,
        absoluteDrawP95Ms:40,absoluteFrameP95Ms:100}
    };
    const output=info.outputPath('performance.json');
    fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
    await info.attach('performance',{path:output,contentType:'application/json'});
    for(const results of Object.values(samples)){
      for(const result of results){
        expect(result.draws,'Require sustained rendering, not an idle page').toBeGreaterThan(30);
        expect(result.frames).toBeGreaterThan(30);
        expect(result.displayedDate,'Playback must advance during measurement').not.toBe(result.initialDate);
      }
    }
    for(const key of ['drawP50','drawP95']){
      expect(candidate[key],key+' regression versus '+baseSha)
        .toBeLessThanOrEqual(baseline[key]*1.5+2);
    }
    for(const key of ['frameP50','frameP95']){
      expect(candidate[key],key+' regression versus '+baseSha)
        .toBeLessThanOrEqual(baseline[key]*1.5+5);
    }
    expect(candidate.drawP95,'Absolute drawing budget').toBeLessThanOrEqual(40);
    expect(candidate.frameP95,'Absolute frame-stall budget').toBeLessThanOrEqual(100);
  });
}
