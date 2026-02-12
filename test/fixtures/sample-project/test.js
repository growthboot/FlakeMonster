// Simple test that always passes, used to verify the test harness works
import { loadDashboard } from './src/app.js';

const result = await loadDashboard();

if (!result.user || !result.posts) {
  console.error('FAIL: missing data');
  process.exit(1);
}

console.log('PASS: all data loaded');
