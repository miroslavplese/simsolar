(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarPanels=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {PanelDrag}=window;

  function setPanelVisible(id,visible){
    document.getElementById(id).classList.toggle('panel-hidden',!visible);
    const buttonIds={
      aboutPanel:['title'],
      legend:['legendBtn'],
      missionPanel:['missionBtn'],
      plannerPanel:['plannerBtn'],
      occultationPanel:['occultationBtn'],
      impactPanel:['impactBtn'],
      dock:['dockBtn']
    }[id]||[];
    for(const buttonId of buttonIds){
      const button=document.getElementById(buttonId);
      button.classList.toggle('active',visible);
      button.setAttribute('aria-expanded',String(visible));
    }
  }
  function togglePanel(id){
    const panel=document.getElementById(id);
    setPanelVisible(id,panel.classList.contains('panel-hidden'));
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    PanelDrag.installMovablePanels([
      document.getElementById('missionPanel'),
      document.getElementById('plannerPanel'),
      document.getElementById('occultationPanel'),
      document.getElementById('perfPanel'),
      document.getElementById('bodyPanel'),
      document.getElementById('impactPanel'),
      document.getElementById('observatoryPanel'),
      document.getElementById('card'),
      document.getElementById('legend'),
      document.getElementById('dock')
    ]);
    document.getElementById('dockBtn').addEventListener(
      'click',()=>togglePanel('dock')
    );
    document.getElementById('dockClose').addEventListener(
      'click',()=>setPanelVisible('dock',false)
    );
    document.getElementById('title').addEventListener(
      'click',()=>togglePanel('aboutPanel')
    );
    document.getElementById('aboutClose').addEventListener(
      'click',()=>setPanelVisible('aboutPanel',false)
    );
    document.getElementById('legendBtn').addEventListener(
      'click',()=>togglePanel('legend')
    );
    document.getElementById('missionBtn').addEventListener(
      'click',()=>togglePanel('missionPanel')
    );
    document.getElementById('missionClose').addEventListener('click',()=>setPanelVisible('missionPanel',false));
    document.getElementById('plannerBtn').addEventListener(
      'click',()=>togglePanel('plannerPanel')
    );
    document.getElementById('plannerClose').addEventListener(
      'click',()=>setPanelVisible('plannerPanel',false)
    );
  }

  return {
    initialize,
    setPanelVisible,
    togglePanel
  };
});
