const fs = require('fs');

let f = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  "images: [],\n    createdAt,\n    updatedAt: createdAt,\n  }\n}",
  "images: [],\n    createdAt,\n    updatedAt: createdAt,\n    isUrgent: false,\n  }\n}"
);

c = c.replace(
  "images: [],\r\n    createdAt,\r\n    updatedAt: createdAt,\r\n  }\r\n}",
  "images: [],\r\n    createdAt,\r\n    updatedAt: createdAt,\r\n    isUrgent: false,\r\n  }\r\n}"
);


fs.writeFileSync(f, c);
console.log('done');
