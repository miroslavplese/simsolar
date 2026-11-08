const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const raw=path.join(root,'coverage','raw');
const npm=process.env.npm_execpath;
if(!npm) throw new Error('Run this command through npm run test:coverage.');
fs.rmSync(raw,{recursive:true,force:true});
fs.mkdirSync(raw,{recursive:true});

function run(args,env=process.env){
  const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});
  if(result.error) throw result.error;
  return result.status??1;
}

let status=run([npm,'test'],{...process.env,NODE_V8_COVERAGE:raw});
if(status===0){
  status=run([npm,'run','test:browser'],{
    ...process.env,SIMSOLAR_BROWSER_COVERAGE:raw
  });
}
const report=run([require.resolve('c8/bin/c8.js'),'report',
  '--all','--include=src/**/*.js','--include=data/curated-systems.js',
  '--exclude=tests/**','--temp-directory='+raw,
  '--reports-dir='+path.join(root,'coverage'),
  '--reporter=text','--reporter=html','--reporter=json-summary']);
process.exitCode=status||report;
