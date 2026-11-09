const {defineConfig}=require('@playwright/test');
const functional=require('./playwright.config.js');

module.exports=defineConfig({
  ...functional,
  testMatch:'**/performance.spec.js',
  testIgnore:[],
  retries:0,
  timeout:180000,
  outputDir:'./test-results/performance',
  use:{
    ...functional.use,
    locale:'en-US',
    timezoneId:'UTC',
    deviceScaleFactor:1
  }
});
