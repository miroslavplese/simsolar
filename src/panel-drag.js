(function(root,factory){
  const api=factory(root);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PanelDrag=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(root){
  const DEFAULT_INTERACTIVE_SELECTOR=[
    'a','button','input','select','textarea','label',
    '[contenteditable="true"]','[role="button"]',
    '.btn','.item','.grp-label','.close'
  ].join(',');

  function clampPanelPosition(left,top,width,height,viewportWidth,viewportHeight,minVisible){
    const visible=minVisible===undefined ? 48 : minVisible;
    return {
      left:Math.max(Math.min(0,visible-width),Math.min(viewportWidth-visible,left)),
      top:Math.max(Math.min(0,visible-height),Math.min(viewportHeight-visible,top))
    };
  }

  function installMovablePanels(panels,options){
    const settings=options||{};
    const hostWindow=settings.window||root;
    const interactiveSelector=settings.interactiveSelector||DEFAULT_INTERACTIVE_SELECTOR;
    const minVisible=settings.minVisible===undefined ? 48 : settings.minVisible;
    const cleanups=[];

    function positionPanel(panel,left,top){
      const rect=panel.getBoundingClientRect();
      const clamped=clampPanelPosition(
        left,top,rect.width,rect.height,
        hostWindow.innerWidth,hostWindow.innerHeight,minVisible
      );
      panel.style.left=clamped.left+'px';
      panel.style.top=clamped.top+'px';
      panel.style.right='auto';
      panel.style.bottom='auto';
      panel.style.transform='none';
      panel.dataset.panelMoved='true';
    }

    for(const panel of panels){
      if(!panel) continue;
      let drag=null;
      panel.classList.add('movable-panel');

      function onPointerDown(event){
        if(event.pointerType==='mouse' && event.button!==0) return;
        const interactive=event.target.closest?.(interactiveSelector);
        if(interactive && panel.contains(interactive)) return;
        const rect=panel.getBoundingClientRect();
        positionPanel(panel,rect.left,rect.top);
        drag={
          pointerId:event.pointerId,
          startX:event.clientX,
          startY:event.clientY,
          left:parseFloat(panel.style.left),
          top:parseFloat(panel.style.top)
        };
        panel.setPointerCapture?.(event.pointerId);
        panel.classList.add('panel-dragging');
        event.preventDefault();
      }

      function onPointerMove(event){
        if(!drag || drag.pointerId!==event.pointerId) return;
        positionPanel(
          panel,
          drag.left+event.clientX-drag.startX,
          drag.top+event.clientY-drag.startY
        );
        event.preventDefault();
      }

      function finishDrag(event){
        if(!drag || drag.pointerId!==event.pointerId) return;
        if(panel.hasPointerCapture?.(event.pointerId)){
          panel.releasePointerCapture(event.pointerId);
        }
        drag=null;
        panel.classList.remove('panel-dragging');
      }

      panel.addEventListener('pointerdown',onPointerDown);
      panel.addEventListener('pointermove',onPointerMove);
      panel.addEventListener('pointerup',finishDrag);
      panel.addEventListener('pointercancel',finishDrag);
      cleanups.push(()=>{
        panel.removeEventListener('pointerdown',onPointerDown);
        panel.removeEventListener('pointermove',onPointerMove);
        panel.removeEventListener('pointerup',finishDrag);
        panel.removeEventListener('pointercancel',finishDrag);
      });
    }

    function onResize(){
      for(const panel of panels){
        if(!panel || panel.dataset.panelMoved!=='true') continue;
        const rect=panel.getBoundingClientRect();
        if(rect.width===0 && rect.height===0) continue;
        positionPanel(panel,rect.left,rect.top);
      }
    }
    hostWindow.addEventListener('resize',onResize);

    return ()=>{
      hostWindow.removeEventListener('resize',onResize);
      for(const cleanup of cleanups) cleanup();
    };
  }

  return {DEFAULT_INTERACTIVE_SELECTOR,clampPanelPosition,installMovablePanels};
});
