const fs = require('fs');
let file = 'app_mobile/app/(app)/topup.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\.\.\/\.\.\/\.\.\//g, '../../');
fs.writeFileSync(file, content);
console.log('done');
