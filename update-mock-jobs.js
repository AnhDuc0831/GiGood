const fs = require('fs');
let file = 'app_mobile/lib/features/jobs/mock.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import type { JobEscrowResponse, JobModel, JobListParams, CreateJobBody, UpdateJobBody } from './types'",
  "import type { JobModel, JobListParams, CreateJobBody, UpdateJobBody } from './types'"
);

if (!content.includes("import { mockTopUp } from '../wallet/mock'")) {
    content = content.replace(
      "import type { MockViewer } from '../auth/types'",
      "import type { MockViewer } from '../auth/types'\nimport { mockTopUp } from '../wallet/mock'"
    );
}

// 1. mockCreateJob
content = content.replace(
  "export function mockCreateJob(body: CreateJobBody, viewer: MockViewer = null): JobModel {",
  "export function mockCreateJob(body: CreateJobBody, viewer: MockViewer = null): JobModel {\n  if (viewer) {\n    const cost = body.isUrgent ? 15 : 10;\n    const b = mockTopUp(viewer.id, 'seeker', -cost);\n    if (b.balance < 0) {\n        mockTopUp(viewer.id, 'seeker', cost);\n        throw new Error('Số dư không đủ. Vui lòng nạp thêm Token.');\n    }\n  }"
);

// 2. mockAcceptJob
content = content.replace(
  "export function mockAcceptJob(id: string, viewer: MockViewer): JobEscrowResponse {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id === me.id) throw new Error('Bạn không thể nhận việc của chính mình.')\n  if (job.status !== 'Open') {\n    throw new Error('Công việc đã có người nhận hoặc không còn mở.')\n  }\n\n  const escrow = mockHoldEscrow(job.id, job.owner.id, me.id, job.price)\n  updateMockJob(id, { status: 'Assigned' })\n  return { escrow, balance: mockBalanceOf(job.owner.id) }\n}",
  "export function mockAcceptJob(id: string, viewer: MockViewer): JobModel {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id === me.id) throw new Error('Bạn không thể nhận việc của chính mình.')\n  if (job.status !== 'Open') {\n    throw new Error('Công việc đã có người nhận hoặc không còn mở.')\n  }\n\n  const tokenFee = Math.ceil(job.price / 10000);\n  const b = mockTopUp(me.id, 'tasker', -tokenFee);\n  if (b.balance < 0) {\n      mockTopUp(me.id, 'tasker', tokenFee);\n      throw new Error(`Số dư không đủ để nhận việc. Cần ${tokenFee} Token.`);\n  }\n  return updateMockJob(id, { status: 'Assigned' })\n}"
);

// 3. mockReleaseEscrowJob
content = content.replace(
  "export function mockReleaseEscrowJob(id: string, viewer: MockViewer): JobEscrowResponse {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id !== me.id) throw new Error('Bạn không phải người trả tiền của công việc này.')\n  const escrow = mockGetEscrow(id)\n  if (!escrow || escrow.status !== 'Held') {\n    throw new Error('Khoản ký quỹ không còn đang được giữ.')\n  }\n\n  const released = mockReleaseEscrow(id, me.id)\n  updateMockJob(id, { status: 'Done' })\n  return { escrow: released, balance: mockBalanceOf(escrow.payeeId) }\n}",
  "export function mockReleaseEscrowJob(id: string, viewer: MockViewer): JobModel {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id !== me.id) throw new Error('Bạn không phải người trả tiền của công việc này.')\n  return updateMockJob(id, { status: 'Done' })\n}"
);

// 4. mockCancelJob
content = content.replace(
  "export function mockCancelJob(id: string, viewer: MockViewer): JobEscrowResponse | null {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id !== me.id) throw new Error('Bạn không có quyền huỷ công việc này.')\n  if (job.status === 'Done' || job.status === 'Cancelled') {\n    throw new Error(`Không thể huỷ công việc đang ở trạng thái ${job.status}.`)\n  }\n\n  updateMockJob(id, { status: 'Cancelled' })\n\n  const escrow = mockGetEscrow(id)\n  if (escrow && escrow.status === 'Held') {\n    const refunded = mockRefundEscrow(id, me.id)\n    return { escrow: refunded, balance: mockBalanceOf(me.id) }\n  }\n  return null\n}",
  "export function mockCancelJob(id: string, viewer: MockViewer): JobModel | null {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.owner.id !== me.id) throw new Error('Bạn không có quyền huỷ công việc này.')\n  if (job.status === 'Done' || job.status === 'Cancelled') {\n    throw new Error(`Không thể huỷ công việc đang ở trạng thái ${job.status}.`)\n  }\n\n  return updateMockJob(id, { status: 'Cancelled' })\n}"
);

// 5. mockRefundJob
content = content.replace(
  "export function mockRefundJob(id: string, viewer: MockViewer): JobEscrowResponse {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  const escrow = mockGetEscrow(id)\n  if (!escrow || escrow.status !== 'Held' || escrow.payeeId !== me.id) {\n    throw new Error('Khoản ký quỹ không hợp lệ hoặc bạn không phải người nhận việc.')\n  }\n\n  const refunded = mockRefundEscrow(id, job.owner.id)\n  updateMockJob(id, { status: 'Open', isCompletedReported: false })\n  return { escrow: refunded, balance: mockBalanceOf(job.owner.id) }\n}",
  "export function mockRefundJob(id: string, viewer: MockViewer): JobModel {\n  const me = requireViewer(viewer)\n  const job = findJob(id)\n  if (job.status !== 'Assigned') {\n    throw new Error('Công việc không hợp lệ.')\n  }\n\n  return updateMockJob(id, { status: 'Open', isCompletedReported: false })\n}"
);

fs.writeFileSync(file, content);
console.log('done');
