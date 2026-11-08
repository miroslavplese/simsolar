const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {referenceCases}=require('../tests/helpers/reference-cases.js');
const root=path.resolve(__dirname,'..');
const sources=['src','data','solar-system.html'];
const dirty=execFileSync('git',['status','--porcelain','--',...sources],{
  cwd:root,encoding:'utf8'
});
if(dirty.trim()) throw new Error('Reference capture requires committed production sources.');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const files=execFileSync('git',['ls-files','--',...sources],{
  cwd:root,encoding:'utf8'
}).trim().split('\n');
const hashes=Object.fromEntries(files.map(file=>[
  file,createHash('sha256').update(execFileSync('git',['show',revision+':'+file],{
    cwd:root,maxBuffer:32*1024*1024
  })).digest('hex')
]));
const fixture=path.join(root,'tests','fixtures','refactor-reference.json');
fs.mkdirSync(path.dirname(fixture),{recursive:true});
fs.writeFileSync(fixture,JSON.stringify({
  revision,sourceHashes:hashes,...referenceCases()
},null,2)+'\n');
console.log('Captured numerical and scenario references from '+revision);
