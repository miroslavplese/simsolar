(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.MissionTimeline=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const zoomByTarget={
    Earth:4.5,Venus:4.5,Jupiter:1.15,Saturn:0.65,
    Uranus:0.34,Neptune:0.24,Pluto:0.2,Arrokoth:0.16
  };

  function zoomForTarget(target){
    return zoomByTarget[target]||1;
  }

  function findRelativeEvent(events,currentDays,direction){
    const epsilon=0.01;
    return direction<0
      ? [...events].reverse().find(event=>event.days<currentDays-epsilon)||null
      : events.find(event=>event.days>currentDays+epsilon)||null;
  }

  return {zoomForTarget,findRelativeEvent};
});
