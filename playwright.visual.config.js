const {defineConfig}=require('@playwright/test');
const functional=require('./playwright.config.js');

module.exports=defineConfig({
  ...functional,
  testMatch:'**/visual.spec.js',
  testIgnore:[],
  outputDir:'./test-results/visual',
  updateSnapshots:'none',
  snapshotPathTemplate:'{testDir}/snapshots/{platform}/{arg}{ext}',
  use:{
    ...functional.use,
    locale:'en-US',
    timezoneId:'UTC',
    deviceScaleFactor:1,
    launchOptions:{args:['--use-angle=swiftshader']}
  },
  expect:{
    ...functional.expect,
    toHaveScreenshot:{animations:'disabled',caret:'hide',maxDiffPixels:100}
  }
});
