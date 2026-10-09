const fs = require('fs');

// 1. Fix job/[id].tsx
let f = 'app_mobile/app/(app)/job/[id].tsx';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(
  /const result = await acceptJob\(job\.id\)\r?\n\s+showToast\(`Đã nhận việc! \$\{formatVnd\(result\.escrow\.amount\)\} đã được ký quỹ an toàn\.`, 'success'\)/,
  "await acceptJob(job.id)\n      queryClient.invalidateQueries({ queryKey: ['wallet'] })\n      showToast('Đã nhận việc thành công!', 'success')"
);

c = c.replace(
  /const result = await cancelJob\(job\.id\)\r?\n\s+if \(result\?\.escrow\) \{\r?\n\s+showToast\(`Đã huỷ công việc\. \$\{formatVnd\(result\.escrow\.amount\)\} đã được hoàn trả\.`, 'success'\)\r?\n\s+\} else \{\r?\n\s+showToast\('Đã huỷ công việc\.', 'success'\)\r?\n\s+\}/,
  "await cancelJob(job.id)\n      showToast('Đã huỷ công việc.', 'success')"
);

c = c.replace(
  /const result = await releaseEscrow\(job\.id\)\r?\n\s+showToast\(`Đã giải ngân \$\{formatVnd\(result\.escrow\.amount\)\} cho \$\{job\.worker\?\.name \?\? 'Tasker'\}`, 'success'\)/,
  "await releaseEscrow(job.id)\n      showToast('Đã đánh dấu hoàn thành.', 'success')"
);

c = c.replace(
  /const result = await refundJob\(job\.id\)\r?\n\s+showToast\(`Đã hoàn trả \$\{formatVnd\(result\.escrow\.amount\)\} cho \$\{job\.owner\.name\}\`, 'success'\)/,
  "await refundJob(job.id)\n      showToast('Đã đánh dấu huỷ.', 'success')"
);
fs.writeFileSync(f, c);

// 2. Fix mock.ts errors
let m = 'app_mobile/lib/features/jobs/mock.ts';
let mc = fs.readFileSync(m, 'utf8');

// lib/features/jobs/mock.ts(42,3): error TS2741: Property 'isUrgent' is missing in type...
mc = mc.replace(/status: 'Open',\r?\n\s+isCompletedReported: false,\r?\n\s+lat: 10\.762622,\r?\n\s+lng: 106\.660172,/g, "status: 'Open',\n    isCompletedReported: false,\n    lat: 10.762622,\n    lng: 106.660172,\n    isUrgent: false,");

mc = mc.replace(/status: 'Assigned',\r?\n\s+isCompletedReported: true,\r?\n\s+lat: 10\.771234,\r?\n\s+lng: 106\.690123,/g, "status: 'Assigned',\n    isCompletedReported: true,\n    lat: 10.771234,\n    lng: 106.690123,\n    isUrgent: false,");

mc = mc.replace(/status: 'Done',\r?\n\s+isCompletedReported: true,\r?\n\s+lat: 10\.783456,\r?\n\s+lng: 106\.673456,/g, "status: 'Done',\n    isCompletedReported: true,\n    lat: 10.783456,\n    lng: 106.673456,\n    isUrgent: false,");


// mockTopUp import
if (!mc.includes('import { mockTopUp }')) {
  mc = mc.replace(
    /import type \{ MockViewer \} from '\.\.\/auth\/types'/,
    "import type { MockViewer } from '../auth/types'\nimport { mockTopUp } from '../wallet/mock'"
  );
}

// Property 'isUrgent' is missing in mockCreateJob (line 150)
mc = mc.replace(/status: 'Open',\r?\n\s+isCompletedReported: false,\r?\n\s+lat: body\.lat \?\? null,\r?\n\s+lng: body\.lng \?\? null,/, "status: 'Open',\n    isCompletedReported: false,\n    lat: body.lat ?? null,\n    lng: body.lng ?? null,\n    isUrgent: body.isUrgent ?? false,");


fs.writeFileSync(m, mc);
console.log('done');
