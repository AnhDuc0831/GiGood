const fs = require('fs');

let f = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  /mockReleaseEscrow, mockBalanceOf \} from '\.\.\/wallet\/mock'/,
  "mockReleaseEscrow, mockBalanceOf, mockTopUp } from '../wallet/mock'"
);

// mockCreateJob 
c = c.replace(
  /export function mockCreateJob\(body: CreateJobBody, viewer: MockViewer = null\): JobModel \{[\s\S]*?return job\n\}/,
  `export function mockCreateJob(body: CreateJobBody, viewer: MockViewer = null): JobModel {
  if (viewer) {
    const cost = body.isUrgent ? 15 : 10;
    const b = mockTopUp(viewer.id, 'seeker', -cost);
    if (b.balance < 0) {
      mockTopUp(viewer.id, 'seeker', cost);
      throw new Error('Số dư không đủ. Vui lòng nạp thêm Token.');
    }
  }
  const now = new Date().toISOString()
  const owner = viewer
    ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl ?? null, ratingAvg: 0 }
    : { ...MOCK_OWNER }
  const job: JobModel = {
    id: \`mock-\${Date.now()}-\${nextMockId++}\`,
    owner,
    title: body.title,
    description: body.description,
    category: body.category,
    price: body.price,
    status: 'Open',
    isCompletedReported: false,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    distanceKm: null,
    locationText: body.locationText ?? null,
    isUrgent: body.isUrgent ?? false,
    images: body.images ?? [],
    createdAt: now,
    updatedAt: now,
  }
  mockJobs = [job, ...mockJobs]
  return job
}`
);

// mockCancelJob
c = c.replace(
  /export function mockCancelJob\(id: string, viewer: MockViewer\): JobModel \| null \{[\s\S]*?return refunded \? \{ escrow: refunded, balance: mockBalanceOf\(refunded\.payerId\) \} : null\n\}/,
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

// fix isUrgent in fromSeed
c = c.replace(
  /lat: job\.lat,\n    lng: job\.lng,\n    distanceKm: null,/,
  "lat: job.lat,\n    lng: job.lng,\n    distanceKm: null,\n    isUrgent: false,"
);

fs.writeFileSync(f, c);
console.log('done');
