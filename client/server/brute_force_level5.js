const https = require('https');
const url = new URL('https://jsdyonvgwvbuetsijvbc.supabase.co/rest/v1/assessments');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZHlvbnZnd3ZidWV0c2lqdmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4OTAsImV4cCI6MjA4NDY4MDg5MH0.nT_Itjzn8Lcku3ZNAXYJAeOcV1L8qcKaPCterzkk9bw';

const levelsToTry = [
    'lowest', 'highest', 'excellent', 'attention', 'fair', 'poor', 'good', 'bad'
];

async function tryInsert(level) {
    return new Promise((resolve) => {
        const data = JSON.stringify({
            summary_id: '123e4567-e89b-12d3-a456-426614174000',
            cat_id: '997574c9-57ae-46c6-8c82-99af1db21bf5',
            assessment_date: new Date().toISOString(),
            overall_risk_score: 15,
            overall_risk_level: level
        });

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', d => responseBody += d);
            res.on('end', () => {
                try {
                    const j = JSON.parse(responseBody);
                    console.log(`${level}: -> ${j.message}`);
                } catch (e) { }
                resolve();
            });
        });
        req.write(data);
        req.end();
    });
}

async function run() {
    for (let l of levelsToTry) {
        await tryInsert(l);
    }
}
run();
