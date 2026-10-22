const {defineConfig}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests/browser',
  timeout:60000,
  expect:{timeout:15000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI ? 1 : 0,
  reporter:'list',
  use:{
    viewport:{width:1440,height:1000},
    trace:'retain-on-failure',
    screenshot:'only-on-failure'
  },
  webServer:{
    command:'node tools/serve.js',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false
  }
});
