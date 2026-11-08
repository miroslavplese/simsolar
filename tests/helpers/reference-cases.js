const Curated=require('../../data/curated-systems.js');
const Gravity=require('../../src/nbody-simulation.js');
const Moons=require('../../src/hierarchical-moon-simulation.js');
const Model=require('../../src/system-model.js');
const Math3D=require('../../src/trajectory-math.js');
const Planner=require('../../src/mission-planner.js');
const Scenario=require('../../src/scenario-state.js');
const epoch=5672;

function scenario(overrides={}){
  return {
    v:3,t:epoch,playing:false,speed:0.69897,direction:1,
    selected:null,follow:null,
    view:{zoom:2,panX:0,panY:0,yaw:0,tilt:0.4},
    layers:{spacecraft:true,comets:true,lagrange:false,rotating:false},
    observatory:null,missionPlan:null,system:null,...overrides
  };
}

function curatedState(id,selected){
  const system=Curated.buildEditableSystem(Curated.findById(id),epoch);
  const bodies=system.bodies.map(body=>({
    id:body.id,name:body.name,kind:body.kind,color:body.color,
    radius:body.radius,massKg:body.massKg,mu:body.mu,parentId:body.parentId,
    orbitPrimaryIds:body.orbitPrimaryIds,genericSurface:body.genericSurface,
    initialInclination:body.initialInclination,notes:body.notes,state:body.state
  }));
  const body=bodies.find(candidate=>candidate.name===selected);
  return scenario({
    selected,selectedId:body?.id||null,follow:selected,followId:body?.id||null,
    system:{mode:'editable',epoch,bodies},
    view:{zoom:id==='trappist-1'?200:12,panX:0,panY:0,yaw:0,tilt:0.4}
  });
}

function referenceCases(){
  const curated={};
  for(const definition of Curated.SYSTEMS.filter(system=>system.mode!=='solar')){
    const system=Curated.buildEditableSystem(definition,epoch);
    const initial=Gravity.createBarycentricState(epoch,
      system.bodies.map(body=>({...body,adaptiveFactor:48})),[]);
    const simulator=Gravity.createSimulator(initial,{
      stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
    });
    curated[definition.id]=[0,0.125,8.5,100,0.125].map(offset=>{
      const snapshot=simulator.stateAt(epoch+offset);
      return {
        offset,
        bodies:system.bodies.map(body=>{
          const state=Gravity.bodyState(snapshot,body.id);
          const reference=Model.orbitReference(body,system.bodies,
            candidate=>Gravity.bodyState(snapshot,candidate.id));
          return {
            id:body.id,state:Model.STATE_KEYS.map(key=>state[key]),
            elements:reference
              ? Math3D.orbitalElementsFromState(reference.relative,reference.mu) : null
          };
        })
      };
    });
  }
  const moon=Moons.createInitialState(0,[{
    parentName:'Earth',systemMu:Gravity.GM_BY_BODY.Earth,
    parentState:{x:1,y:0,z:0,vx:0,vy:0.0172,vz:0},
    moons:[{name:'Moon',mu:Gravity.MOON_GM_BY_BODY.Moon,
      state:{x:1.00257,y:0,z:0,vx:0,vy:0.0178,vz:0}}]
  }]);
  const external=()=>[
    {name:'Sun',mu:Gravity.GM_BY_BODY.Sun,x:0,y:0,z:0,vx:0,vy:0,vz:0},
    {name:'Earth',mu:Gravity.GM_BY_BODY.Earth,...moon.barycenters.Earth}
  ];
  const simulator=Moons.createSimulator(moon.state,external);
  const moons=[0,0.125,23.456,0.125].map(time=>simulator.stateAt(time));
  const plan={version:1,id:'reference-earth-mars',name:'Reference transfer',waypoints:[
    {body:'Earth',role:'departure',earliest:0,latest:10},
    {body:'Mars',role:'target',earliest:200,latest:300}
  ]};
  const routes=Planner.searchRoutes(plan,(name,time)=>{
    const radius=name==='Earth'?1:1.524;
    const n=Math.sqrt(Gravity.GM_BY_BODY.Sun/radius**3);
    return {x:radius*Math.cos(n*time),y:radius*Math.sin(n*time),z:0,
      vx:-radius*n*Math.sin(n*time),vy:radius*n*Math.cos(n*time),vz:0};
  });
  const states={
    'legacy-v1':scenario({v:1,selected:'Earth',follow:'Earth'}),
    'legacy-v2':scenario({v:2,selected:'Saturn'}),
    'solar-v3':scenario({selected:'Earth'}),
    'trappist-v3':curatedState('trappist-1','TRAPPIST-1e'),
    'binary-v3':curatedState('tatooine','Tatooine'),
    'observatory-v3':scenario({
      selected:'Moon',
      observatory:{
        body:'Earth',latitude:47.6062,longitude:-122.3321,
        azimuth:Math.PI,altitude:0.4,fov:1.1,speed:1,
        enhance:true,paths:false,clouds:false,timeZone:'UTC',telescope:null
      }
    }),
    'cockpit-v2':scenario({
      v:2,t:5827,missionPlan:{
        version:1,id:'reference-cockpit',name:'Reference cockpit',
        waypoints:[
          {body:'Earth',role:'departure',earliest:5827,latest:5827,altitudeKm:300},
          {body:'Mars',role:'target',earliest:6100,latest:6100,altitudeKm:1000,arrivalMode:'flyby'}
        ],
        selectedTimes:[5827,6100],selectedLongWayMask:0
      },
      spacecraftView:{yaw:0,pitch:0,fov:Math.PI/3}
    })
  };
  const scenarios=Object.fromEntries(Object.entries(states).map(([name,state])=>{
    const encoded=state.v<3 ? Buffer.from(JSON.stringify(state)).toString('base64url')
      : Scenario.encode(state);
    return [name,{state,encoded,shareable:encoded.length<=4096}];
  }));
  return JSON.parse(JSON.stringify({curated,moons,routes,scenarios}));
}

module.exports={referenceCases};
