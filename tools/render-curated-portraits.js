const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('@playwright/test');
const {SYSTEMS}=require('../data/curated-systems.js');
const {CURATED_DEFINITIONS}=require('../src/body-textures.js');
const root=path.resolve(__dirname,'..');
const origin='http://curated-portraits.test';

async function main(){
  const bodies=SYSTEMS.flatMap(system=>system.bodies||[]);
  const files=new Map([
    ['/src/ring-system.js','text/javascript'],
    ['/src/body-textures.js','text/javascript'],
    ...Object.values(CURATED_DEFINITIONS).map(definition=>
      ['/assets/textures/'+definition.file,'image/webp'])
  ]);
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin) return route.abort();
      if(url.pathname==='/'){
        return route.fulfill({
          contentType:'text/html',
          body:'<!doctype html><title>Curated body portraits</title>'
        });
      }
      const contentType=files.get(url.pathname);
      if(!contentType) return route.abort();
      await route.fulfill({
        contentType,body:await fs.readFile(path.join(root,...url.pathname.split('/')))
      });
    });
    await page.goto(origin);
    await page.addScriptTag({url:origin+'/src/ring-system.js'});
    await page.addScriptTag({url:origin+'/src/body-textures.js'});
    const portraits=await page.evaluate(async bodies=>{
      const canvas=document.createElement('canvas');
      canvas.width=640;
      canvas.height=360;
      const context=canvas.getContext('2d');
      const basis={
        right:{x:1,y:0,z:0},up:{x:0,y:0,z:1},
        towardObserver:{x:0,y:-1,z:0}
      };
      let ready;
      const renderer=BodyTextures.createRenderer({onReady:()=>ready()});
      if(!renderer) throw new Error('WebGL is required to generate body portraits');
      const portraits=[];
      for(const body of bodies){
        if(!Object.hasOwn(BodyTextures.CURATED_DEFINITIONS,body.id)){
          throw new Error('Missing curated material for '+body.id);
        }
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(
            new Error('Timed out loading the material for '+body.id)
          ),15000);
          ready=()=>{clearTimeout(timeout);resolve();};
          renderer.draw(body,context,320,180,140,{});
        });
        context.fillStyle='#000';
        context.fillRect(0,0,640,360);
        if(body.kind==='star'){
          const glow=context.createRadialGradient(320,180,130,320,180,180);
          glow.addColorStop(0,body.color+'80');
          glow.addColorStop(1,body.color+'00');
          context.fillStyle=glow;
          context.fillRect(0,0,640,360);
        }
        if(!renderer.draw(body,context,320,180,140,{
          orientation:BodyTextures.orientationMatrix(body,0,basis),
          light:{x:-0.65,y:0.25,z:0.85}
        })) throw new Error('Failed to render '+body.id);
        const data=canvas.toDataURL('image/webp',0.9);
        if(!data.startsWith('data:image/webp;base64,')){
          throw new Error('WebP encoding is unavailable');
        }
        portraits.push({id:body.id,data:data.split(',')[1]});
      }
      return portraits;
    },bodies);
    const directory=path.join(root,'assets','objects','curated');
    await fs.mkdir(directory,{recursive:true});
    let bytes=0;
    for(const portrait of portraits){
      const image=Buffer.from(portrait.data,'base64');
      await fs.writeFile(path.join(directory,portrait.id+'.webp'),image);
      bytes+=image.length;
    }
    console.log(`Rendered ${portraits.length} curated body portraits (${bytes} bytes).`);
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
