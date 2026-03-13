const fs = require('fs');
const env = fs.readFileSync('../.env', 'utf8');
const urlMatch = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

fetch(`${url}/rest/v1/assessments?limit=1`, {
    headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
    }
}).then(res => res.json()).then(data => {
    if (data && data.length > 0) {
        console.log("COLUMNS:", Object.keys(data[0]));
    } else {
        // try to get openapi spec
        fetch(`${url}/rest/v1/`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` }
        }).then(r => r.json()).then(spec => {
            const def = spec.definitions?.assessments?.properties;
            console.log("SCHEMA:", def ? Object.keys(def) : 'Not found in spec');
        });
    }
}).catch(console.error);
