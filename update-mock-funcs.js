const fs = require('fs');
let file = 'app_mobile/lib/features/jobs/mock.ts';
let content = fs.readFileSync(file, 'utf8');

// replace JobEscrowResponse with JobModel
content = content.replace(/JobEscrowResponse,?/g, '');

// mockAcceptJob
content = content.replace(
    /export function mockAcceptJob[\s\S]*?return { escrow, balance: mockBalanceOf\(job\.owner\.id\) }\r?\n}/,
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
  return updateMockJob(id, { status: 'Assigned' })
}`
);

// mockReleaseEscrowJob
content = content.replace(
    /export function mockReleaseEscrowJob[\s\S]*?return { escrow: released, balance: mockBalanceOf\(escrow\.payeeId\) }\r?\n}/,
    `export function mockReleaseEscrowJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id !== me.id) throw new Error('Bạn không phải người trả tiền của công việc này.')
  return updateMockJob(id, { status: 'Done' })
}`
);

// mockCancelJob
content = content.replace(
    /export function mockCancelJob[\s\S]*?return null\r?\n}/,
    `export function mockCancelJob(id: string, viewer: MockViewer): JobModel | null {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id !== me.id) throw new Error('Bạn không có quyền huỷ công việc này.')
  if (job.status === 'Done' || job.status === 'Cancelled') {
    throw new Error(\`Không thể huỷ công việc đang ở trạng thái \${job.status}.\`)
  }

  return updateMockJob(id, { status: 'Cancelled' })
}`
);

// mockRefundJob
content = content.replace(
    /export function mockRefundJob[\s\S]*?return { escrow: refunded, balance: mockBalanceOf\(job\.owner\.id\) }\r?\n}/,
    `export function mockRefundJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.status !== 'Assigned') {
    throw new Error('Công việc không hợp lệ.')
  }

  return updateMockJob(id, { status: 'Open', isCompletedReported: false })
}`
);

fs.writeFileSync(file, content);
console.log('done');
