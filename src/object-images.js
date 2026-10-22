(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.ObjectImages=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  function illustration(body){
    const type=body.kind==='custom' ? body.appearance : body.kind;
    const color=/^#[0-9a-f]{3,8}$/i.test(body.color||'') ? body.color : '#79b9df';
    const shape=type==='black-hole'
      ? '<ellipse cx="160" cy="90" rx="85" ry="24" fill="none" stroke="#e9b875" stroke-width="12"/><circle cx="160" cy="90" r="39" fill="#000" stroke="#ddab71" stroke-width="3"/>'
      : type==='lagrange'
        ? '<ellipse cx="160" cy="90" rx="105" ry="65" fill="none" stroke="#596a87"/><circle cx="160" cy="90" r="16" fill="#f2b544"/><circle cx="265" cy="90" r="9" fill="#79b9df"/><g fill="#a0e4c4"><circle cx="230" cy="90" r="5"/><circle cx="295" cy="90" r="5"/><circle cx="45" cy="90" r="5"/><circle cx="210" cy="34" r="5"/><circle cx="210" cy="146" r="5"/></g>'
        : type==='comet'
          ? '<path d="M145 90 L290 35 L245 115 Z" fill="#71c5df" opacity=".5"/><circle cx="145" cy="90" r="18" fill="#d9f8ff"/>'
          : '<circle cx="160" cy="90" r="55" fill="'+color+'"/>'+
            (type==='star'||type==='sun' ? ''
              : '<path d="M160 35 A55 55 0 0 1 160 145 Q205 90 160 35" fill="#0a1427" opacity=".7"/>');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#080e1b"/>'+shape+'</svg>';
    return {
      src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),
      alt:body.name+' - schematic illustration, not a photograph',
      caption:'Schematic illustration - not a photograph.',
      artist:'SimSolar',license:'Original schematic',source:null
    };
  }
  function forBody(body,catalog){
    if(body.kind==='custom' || body.kind==='lagrange') return illustration(body);
    const record=catalog[body.name];
    return record || illustration(body);
  }
  function create(options){
    let selected=null;
    function show(body){
      if(selected===body) return;
      selected=body;
      const record=forBody(body,options.catalog);
      const image=options.document.createElement('img');
      image.id='cardImage';
      image.alt=record.alt;
      image.loading='lazy';
      image.decoding='async';
      image.width=320;
      image.height=180;
      let content=image;
      if(record.source){
        const link=options.document.createElement('a');
        link.id='cardImageLink';
        link.href=record.source;
        link.target='_blank';
        link.rel='noopener noreferrer';
        link.title=[record.artist,record.credit,record.license,record.licenseUrl,record.changes]
          .filter(Boolean).join('\n');
        link.setAttribute('aria-label',
          'View original image of '+body.name+'. '+record.artist+'. '+record.license);
        link.appendChild(image);
        content=link;
      }
      options.container.replaceChildren(content);
      options.caption.textContent=record.caption||'';
      options.caption.hidden=!record.caption;
      image.onerror=()=>{
        image.onerror=null;
        image.src=illustration(body).src;
        image.alt=body.name+' - fallback schematic';
        options.container.replaceChildren(image);
        options.caption.textContent='Reference image unavailable; schematic shown.';
        options.caption.hidden=false;
      };
      image.src=record.src;
    }
    return {show};
  }
  return {illustration,forBody,create};
});
