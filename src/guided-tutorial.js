(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.GuidedTutorial=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const DEFAULT_COOKIE='simsolar_tutorial_complete';
  const STORAGE_PREFIX='tutorial:';

  function cookieContains(cookie,name){
    return String(cookie||'').split(';').some(part=>{
      const [key,value]=part.trim().split('=');
      return key===name && value==='1';
    });
  }

  function completionStored(document,storage,cookieName=DEFAULT_COOKIE){
    if(cookieContains(document?.cookie,cookieName)) return true;
    try{
      return storage?.getItem(STORAGE_PREFIX+cookieName)==='1';
    } catch(error){
      return false;
    }
  }

  function storeCompletion(document,storage,cookieName=DEFAULT_COOKIE){
    if(document){
      document.cookie=cookieName+
        '=1; Max-Age=31536000; Path=/; SameSite=Lax';
    }
    try{
      storage?.setItem(STORAGE_PREFIX+cookieName,'1');
    } catch(error){
      // Cookies remain the primary persistence mechanism.
    }
  }

  function createButton(document,label,className){
    const button=document.createElement('button');
    button.type='button';
    button.className=className;
    button.textContent=label;
    return button;
  }

  function create(options){
    const document=options.document;
    const window=options.window;
    const steps=options.steps||[];
    const cookieName=options.cookieName||DEFAULT_COOKIE;
    if(!document || !window || !steps.length){
      throw new TypeError('Tutorial requires a document, window, and steps.');
    }

    const overlay=document.createElement('div');
    overlay.className='tutorial-overlay';
    overlay.hidden=true;
    const tooltip=document.createElement('section');
    tooltip.className='tutorial-tooltip';
    tooltip.hidden=true;
    tooltip.setAttribute('role','dialog');
    tooltip.setAttribute('aria-modal','false');
    tooltip.setAttribute('aria-label','SimSolar guided tutorial');

    const progress=document.createElement('div');
    progress.className='tutorial-progress';
    const title=document.createElement('h2');
    const text=document.createElement('p');
    const actions=document.createElement('div');
    actions.className='tutorial-actions';
    const skip=createButton(document,'SKIP TUTORIAL','tutorial-skip');
    const back=createButton(document,'BACK','tutorial-back');
    const next=createButton(document,'NEXT','tutorial-next');
    actions.append(skip,back,next);
    tooltip.append(progress,title,text,actions);
    document.body.append(overlay,tooltip);

    let active=false;
    let index=0;
    let target=null;

    function localStorage(){
      try{
        return window.localStorage;
      } catch(error){
        return null;
      }
    }

    function clearTarget(){
      if(!target) return;
      target.classList.remove('tutorial-target');
      target.removeAttribute('aria-describedby');
      target=null;
    }

    function resolveTarget(step){
      if(!step.target) return null;
      return typeof step.target==='function'
        ? step.target()
        : document.querySelector(step.target);
    }

    function position(){
      if(!active) return;
      if(!target){
        tooltip.dataset.placement='center';
        tooltip.style.left='50%';
        tooltip.style.top='50%';
        tooltip.style.transform='translate(-50%,-50%)';
        return;
      }
      const rect=target.getBoundingClientRect();
      const margin=14;
      const width=tooltip.offsetWidth;
      const height=tooltip.offsetHeight;
      const below=window.innerHeight-rect.bottom>=height+margin;
      const top=below
        ? rect.bottom+margin
        : Math.max(margin,rect.top-height-margin);
      const left=Math.max(
        margin,
        Math.min(
          window.innerWidth-width-margin,
          rect.left+rect.width/2-width/2
        )
      );
      tooltip.dataset.placement=below?'below':'above';
      tooltip.style.left=left+'px';
      tooltip.style.top=top+'px';
      tooltip.style.transform='none';
    }

    function showStep(nextIndex){
      clearTarget();
      index=Math.max(0,Math.min(steps.length-1,nextIndex));
      const step=steps[index];
      step.before?.();
      target=resolveTarget(step);
      if(target){
        target.classList.add('tutorial-target');
        target.setAttribute('aria-describedby','tutorial-step-text');
      }
      progress.textContent='STEP '+(index+1)+' OF '+steps.length;
      title.textContent=step.title;
      text.id='tutorial-step-text';
      text.textContent=step.text;
      back.disabled=index===0;
      next.textContent=index===steps.length-1?'FINISH':'NEXT';
      window.requestAnimationFrame(position);
    }

    function finish(remember=true){
      if(!active) return;
      clearTarget();
      active=false;
      overlay.hidden=true;
      tooltip.hidden=true;
      if(remember){
        storeCompletion(document,localStorage(),cookieName);
      }
      options.onFinish?.();
    }

    function start(){
      if(active) finish(false);
      active=true;
      overlay.hidden=false;
      tooltip.hidden=false;
      options.onStart?.();
      showStep(0);
    }

    back.addEventListener('click',()=>showStep(index-1));
    next.addEventListener('click',()=>{
      if(index===steps.length-1) finish(true);
      else showStep(index+1);
    });
    skip.addEventListener('click',()=>finish(true));
    window.addEventListener('resize',position);

    return {
      start,
      finish,
      isActive:()=>active,
      shouldStart:()=>!completionStored(
        document,localStorage(),cookieName
      ),
      currentStep:()=>index
    };
  }

  return {
    DEFAULT_COOKIE,cookieContains,completionStored,storeCompletion,create
  };
});
