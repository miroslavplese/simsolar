(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.BodySelect=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function category(body){
    if(body.kind==='spacecraft') return 'Spacecraft';
    if(body.kind==='comet') return 'Comets';
    if(body.kind==='custom') return 'Custom bodies';
    return 'Stars, planets & moons';
  }

  function groups(bodies,catalog=bodies){
    const byId=new Map(catalog.filter(body=>body.id).map(body=>[body.id,body]));
    const byName=new Map(catalog.map(body=>[body.name,body]));
    const available=new Map(bodies.map(body=>[body.name,body]));
    const children=new Map();
    const parents=new Map();
    for(const body of catalog){
      const parent=byId.get(body.parentId)||byName.get(body.parentName);
      if(parent && parent!==body){
        parents.set(body,parent);
        if(!children.has(parent)) children.set(parent,[]);
        children.get(parent).push(body);
      }
    }
    const result=[];
    const visited=new Set();
    function visit(body,label,depth){
      if(visited.has(body)) return;
      visited.add(body);
      const entry=available.get(body.name);
      if(entry){
        if(result.at(-1)?.label!==label) result.push({label,entries:[]});
        result.at(-1).entries.push({body:entry,depth});
      }
      for(const child of children.get(body)||[]) visit(child,label,depth+1);
    }
    function family(body){
      visit(body,children.has(body)?body.name+' system':category(body),0);
    }
    const roots=catalog.filter(body=>!parents.has(body));
    for(const label of ['Stars, planets & moons','Custom bodies','Spacecraft','Comets']){
      for(const body of roots){
        if(category(body)===label) family(body);
      }
    }
    // Keep malformed cyclic catalogs from hiding selectable bodies or recursing forever.
    for(const body of catalog){
      if(!visited.has(body)) family(body);
    }
    return result;
  }

  function populate(select,bodies,options={}){
    const document=select.ownerDocument;
    const previous=select.value;
    select.innerHTML='';
    if(options.placeholder){
      const option=document.createElement('option');
      option.value='';
      option.textContent=options.placeholder;
      select.appendChild(option);
    }
    for(const group of groups(bodies,options.catalog||bodies)){
      const element=document.createElement('optgroup');
      element.label=group.label;
      for(const {body,depth} of group.entries){
        const option=document.createElement('option');
        option.value=body.name;
        const name=options.uppercase?body.name.toUpperCase():body.name;
        option.textContent=(depth?'\u00a0\u00a0'.repeat(depth)+'\u21b3 ':'')+name;
        element.appendChild(option);
      }
      select.appendChild(element);
    }
    if([...select.options].some(option=>option.value===previous)){
      select.value=previous;
    }
  }

  return {groups,populate};
});
