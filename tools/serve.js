const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={
  '.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml',
  '.jpg':'image/jpeg','.json':'application/json'
};
http.createServer((request,response)=>{
  let file;
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep) && file!==root) throw new Error('Invalid path');
  } catch{
    response.writeHead(400).end('Invalid path');
    return;
  }
  if(file===root) file=path.join(root,'index.html');
  fs.readFile(file,(error,data)=>{
    if(error){
      response.writeHead(error.code==='ENOENT' ? 404 : 500).end('File unavailable');
      return;
    }
    response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    response.end(data);
  });
}).listen(4173,'127.0.0.1');
