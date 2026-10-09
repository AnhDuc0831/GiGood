const fs = require('fs');
let file = 'app_mobile/hooks/useJobs.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/JobEscrowResponse/g, 'JobModel');

fs.writeFileSync(file, content);
console.log('done');
