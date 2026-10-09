const fs = require('fs');

let f = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(f, 'utf8');

if (!c.includes('const mockJobWorkers = new Map<string, string>()')) {
  c = c.replace(
    'let mockJobs: JobModel[] = INITIAL_JOBS.map(fromSeed)',
    'let mockJobs: JobModel[] = INITIAL_JOBS.map(fromSeed)\nconst mockJobWorkers = new Map<string, string>()'
  );
}

c = c.replace(
  /if \(params\.mine\) \{[\s\S]*?\: \[\]\n  \}/,
  `if (params.mine) {
    const viewerId = viewer?.id
    jobs = viewerId
      ? jobs.filter((job) => {
          if (job.owner.id === viewerId) return true
          return mockJobWorkers.get(job.id) === viewerId
        })
      : []
  }`
);

c = c.replace(
  /export function mockAcceptJob[\s\S]*?return updateMockJob\(id, \{ status: 'Assigned' \}\)\n\}/,
  `export function mockAcceptJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id === me.id) throw new Error('Bạn không thể nhận việc của chính mình.')
  if (job.status !== 'Open') {
    throw new Error('Công việc đã có người nhận hoặc không còn mở.')
  }

  const tokenFee = Math.ceil(job.price / 10000);
  const b = mockTopUp(me.id, 'tasker', -tokenFee);
  if (b.balance < 0) {
      mockTopUp(me.id, 'tasker', tokenFee);
      throw new Error(\`Số dư không đủ để nhận việc. Cần \${tokenFee} Token.\`);
  }
  
  mockJobWorkers.set(id, me.id)
  return updateMockJob(id, { status: 'Assigned' })
}`
);

c = c.replace(
  /export function mockRefundJob[\s\S]*?return updateMockJob\(id, \{ status: 'Open', isCompletedReported: false \}\)\n\}/,
  `export function mockRefundJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.status !== 'Assigned') {
    throw new Error('Công việc không hợp lệ.')
  }
  mockJobWorkers.delete(id)
  return updateMockJob(id, { status: 'Open', isCompletedReported: false })
}`
);

fs.writeFileSync(f, c);
console.log('done');
