import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  testMatch:'plain.spec.js',
  timeout:45000,
  expect:{timeout:10000},
  workers:1,
  fullyParallel:false,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4322',channel:'msedge',headless:true,viewport:{width:1440,height:900},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run preview -- --port 4322',url:'http://127.0.0.1:4322',reuseExistingServer:false,timeout:30000},
});
