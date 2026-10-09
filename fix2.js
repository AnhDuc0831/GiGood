const fs = require('fs');
let file = 'app_mobile/lib/features/jobs/mock.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("export function mockCancelJob(id: string, viewer: MockViewer):  | null {", "export function mockCancelJob(id: string, viewer: MockViewer): JobModel | null {");

fs.writeFileSync(file, content);
console.log('done');
