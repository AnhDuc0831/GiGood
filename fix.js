const fs = require('fs');
let file = 'app_mobile/lib/features/jobs/mock.ts';
let content = fs.readFileSync(file, 'utf8');

// I will just substring replace from "export function mockRefundJob(id: string, viewer: MockViewer):  {" to the end of file!
let start = content.indexOf('export function mockRefundJob(id: string, viewer: MockViewer):  {');
if (start !== -1) {
    let before = content.substring(0, start);
    let after = `export function mockRefundJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.status !== 'Assigned') {
    throw new Error('Công việc không hợp lệ.')
  }

  return updateMockJob(id, { status: 'Open', isCompletedReported: false })
}
`;
    fs.writeFileSync(file, before + after);
}
console.log('done');
