const fs = require('fs');

let f = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  /export function mockCancelJob[\s\S]*?return refunded \? \{ escrow: refunded, balance: mockBalanceOf\(refunded\.payerId\) \} : null\r?\n\}/,
  `export function mockCancelJob(id: string, viewer: MockViewer): JobModel | null {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id !== me.id) throw new Error('Bạn không phải chủ công việc.')
  if (job.status === 'Cancelled') return null
  if (job.status === 'Done') throw new Error('Công việc đã hoàn thành, không thể hủy.')
  if (job.status === 'Assigned' && job.isCompletedReported) {
    throw new Error('Người nhận việc đã báo hoàn thành, hãy giải ngân thay vì hủy.')
  }

  return updateMockJob(id, { status: 'Cancelled' })
}`
);

fs.writeFileSync(f, c);
console.log('done');
