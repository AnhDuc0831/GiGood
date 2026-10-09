const fs = require('fs');
let file = 'app_mobile/app/(app)/(tabs)/post.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("title: title.trim() + (urgent ? ' (Cần liền)' : ''),", 'title: title.trim(),');
content = content.replace('images: uploaded,', 'images: uploaded, isUrgent: urgent,');
content = content.replace('text-[10px] text-gray-400 font-bold">Token</Text>', 'text-[10px] text-gray-400 font-bold">VNĐ</Text>');
content = content.replace('urgent ? \'Cần liền (phụ phí)\' : \'Bình thường\'', 'urgent ? \'Cần liền (15 Token)\' : \'Bình thường (10 Token)\'');
fs.writeFileSync(file, content);
console.log('done');
