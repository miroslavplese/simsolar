const assert=require('node:assert/strict');
const {
  cloudWeatherRequest,cloudWeatherAt,
  fractalNoise3,cloudAlpha,cloudSeed,
  localSkyDirection,localSkyTextureCoordinates
}=require('../src/observatory-clouds.js');

const now=Date.UTC(2026,7,26,12);
const historical=cloudWeatherRequest(
  Date.UTC(1969,6,20,20),51.4779,0,now
);
assert.equal(historical.supported,true);
assert.equal(historical.source,'Open-Meteo / ECMWF ERA5');
assert.match(historical.url,/archive-api\.open-meteo\.com/);
assert.match(historical.url,/models=era5/);
assert.match(historical.url,/cloud_cover_low/);

const current=cloudWeatherRequest(now,47.6062,-122.3321,now);
assert.equal(current.supported,true);
assert.equal(current.source,'Open-Meteo forecast');
assert.match(current.url,/api\.open-meteo\.com\/v1\/forecast/);

assert.equal(
  cloudWeatherRequest(Date.UTC(1939,11,31),0,0,now).supported,
  false
);
assert.equal(cloudWeatherRequest(-8e15,0,0,now).supported,false);
assert.equal(
  cloudWeatherRequest(Date.UTC(2026,8,12),0,0,now).supported,
  false
);

const weather=cloudWeatherAt({
  time:['2020-01-01T12:00','2020-01-01T13:00'],
  cloud_cover:[20,60],
  cloud_cover_low:[10,30],
  cloud_cover_mid:[20,40],
  cloud_cover_high:[30,50],
  wind_speed_10m:[8,12],
  wind_direction_10m:[180,200]
},Date.UTC(2020,0,1,12,30));
assert.deepEqual(weather,{
  total:40,low:20,mid:30,high:40,windSpeed:10,windDirection:190
});
assert.equal(cloudWeatherAt({
  time:['2020-01-01T12:00','2020-01-01T13:00'],
  cloud_cover:[0,0],
  wind_direction_10m:[350,10]
},Date.UTC(2020,0,1,12,30)).windDirection,0);
assert.equal(cloudWeatherAt({},now),null);

const seed=cloudSeed(51.4779,0,'2020-01-01','low');
assert.equal(seed,cloudSeed(51.4779,0,'2020-01-01','low'));
const noise=fractalNoise3(1.2,-3.4,5.6,seed);
assert.ok(noise>=0 && noise<=1);
assert.equal(cloudAlpha(noise,0),0);
assert.equal(cloudAlpha(noise,100),0.92);

for(const [x,y] of [[0,0],[127,31],[255,63]]){
  const direction=localSkyDirection(x,y,256,64);
  const coordinates=localSkyTextureCoordinates(
    direction.east,direction.north,direction.up,256,64
  );
  assert.deepEqual(coordinates,{x,y});
}
assert.equal(localSkyTextureCoordinates(1,0,0,256,64),null);

console.log('Observatory cloud tests passed.');
