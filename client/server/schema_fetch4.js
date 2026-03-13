const fs = require('fs');
const env = fs.readFileSync('../.env', 'utf8');
const urlMatch = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

fetch(`${url}/rest/v1/rpc/check_constraint`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(console.log).catch(console.error);

// Wait, RPC might not exist. Let me just try to fetch a row from assessments that already exists and look at its overall_risk_level.
fetch(`${url}/rest/v1/assessments?limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(data => {
    console.log("EXISTING ROWS:", data.map(d => d.overall_risk_level));
});
