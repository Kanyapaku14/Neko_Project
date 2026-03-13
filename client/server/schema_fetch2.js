const https = require('https');
const url = new URL('https://jsdyonvgwvbuetsijvbc.supabase.co/rest/v1/');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZHlvbnZnd3ZidWV0c2lqdmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4OTAsImV4cCI6MjA4NDY4MDg5MH0.nT_Itjzn8Lcku3ZNAXYJAeOcV1L8qcKaPCterzkk9bw';

const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'GET',
    headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
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
