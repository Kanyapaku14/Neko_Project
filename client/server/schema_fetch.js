const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('../.env', 'utf8');
const urlMatch = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = new URL(urlMatch[1].trim() + '/rest/v1/');

const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'GET',
    headers: {
        'apikey': keyMatch[1].trim(),
        'Authorization': 'Bearer ' + keyMatch[1].trim()
    }
};

https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            const cols = Object.keys(parsed.definitions.assessments.properties);
            console.log("SUCCESS_COLS:", cols.join(", "));
        } catch (e) {
            console.log("ERROR parsing JSON");
        }
    });
}).on('error', console.error);
