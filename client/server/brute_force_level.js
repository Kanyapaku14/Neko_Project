const https = require('https');
const url = new URL('https://jsdyonvgwvbuetsijvbc.supabase.co/rest/v1/assessments');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZHlvbnZnd3ZidWV0c2lqdmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4OTAsImV4cCI6MjA4NDY4MDg5MH0.nT_Itjzn8Lcku3ZNAXYJAeOcV1L8qcKaPCterzkk9bw';

const levelsToTry = [
    'Normal', 'Low', 'Moderate', 'High', 'Extreme',
    'normal', 'low', 'moderate', 'high', 'extreme',
    'Normal Risk', 'Low Risk', 'Moderate Risk', 'High Risk', 'Extreme Risk',
    'normal risk', 'low risk', 'moderate risk', 'high risk', 'extreme risk',
    'Good', 'Fair', 'Attention'
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
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ SUCCESS WITH: ${level}`);
                    resolve(true);
                } else {
                    try {
                        const j = JSON.parse(responseBody);
                        if (j.message && j.message.includes('assessments_overall_risk_level_check')) {
                            // Expected failure for check constraint
                            resolve(false);
                        } else {
                            console.log(`❌ Failed with ${level} BUT DIFFERENT ERROR:`, j.message);
                            resolve(false);
                        }
                    } catch (e) {
                        console.log(`Failed format for ${level}`, responseBody);
                        resolve(false);
                    }
                }
            });
        });

        req.write(data);
        req.end();
    });
}

async function run() {
    for (let l of levelsToTry) {
        const success = await tryInsert(l);
        if (success) break;
    }
}
run();
