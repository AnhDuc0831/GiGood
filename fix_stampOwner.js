const fs = require('fs');

// 1. mock.ts
let m = 'app_mobile/lib/features/jobs/mock.ts';
let mc = fs.readFileSync(m, 'utf8');

mc = mc.replace(
  /export type MockViewer = \{\n  id: string\n  name: string\n  avatarUrl\?: string \| null\n\} \| null/,
  "export type MockViewer = {\n  id: string\n  name: string\n  avatarUrl?: string | null\n  role?: 'seeker' | 'tasker'\n} | null"
);

mc = mc.replace(
  /export type MockViewer = \{\r\n  id: string\r\n  name: string\r\n  avatarUrl\?: string \| null\r\n\} \| null/,
  "export type MockViewer = {\r\n  id: string\r\n  name: string\r\n  avatarUrl?: string | null\r\n  role?: 'seeker' | 'tasker'\r\n} | null"
);

mc = mc.replace(
  /if \(!viewer \|\| job\.owner\.id !== MOCK_OWNER_ID\) return job/,
  "if (!viewer || viewer.role !== 'seeker' || job.owner.id !== MOCK_OWNER_ID) return job"
);

fs.writeFileSync(m, mc);

// 2. useJobs.ts
let u = 'app_mobile/hooks/useJobs.ts';
let uc = fs.readFileSync(u, 'utf8');

uc = uc.replace(
  /return \{ id: profile\.id, name: profile\.name, avatarUrl: profile\.avatar \|\| null \}/,
  "return { id: profile.id, name: profile.name, avatarUrl: profile.avatar || null, role: profile.role }"
);

fs.writeFileSync(u, uc);

console.log('done');
