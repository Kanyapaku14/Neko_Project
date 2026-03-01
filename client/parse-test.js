const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(filePath));
        } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walkDir('src');
let hasError = false;
for (const file of files) {
    try {
        const code = fs.readFileSync(file, 'utf8');
        parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'flow'] });
    } catch (e) {
        console.log(`ERROR_FOUND in ${file}:`, e.message);
        hasError = true;
    }
}
if (!hasError) {
    console.log('No syntax errors found in src folder.');
}
