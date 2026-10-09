const fs = require('fs');
let fileJob = 'app_mobile/app/(app)/job/[id].tsx';
let contentJob = fs.readFileSync(fileJob, 'utf8');

contentJob = contentJob.replace(
  "const result = await acceptJob(job.id)\n      showToast(`Đã nhận việc! ${formatVnd(result.escrow.amount)} đã được ký quỹ an toàn.`, 'success')",
  "await acceptJob(job.id)\n      showToast('Đã nhận việc thành công!', 'success')"
);

contentJob = contentJob.replace(
  "`Bạn muốn nhận \"${job.title}\" với mức giá ${formatVnd(job.price)}? Số tiền sẽ được giữ ký quỹ đến khi hoàn thành.`",
  "`Bạn muốn nhận \"${job.title}\"? Phí nhận việc là ${Math.ceil(job.price / 10000)} Token sẽ bị trừ khỏi ví của bạn.`"
);

contentJob = contentJob.replace(
  "showToast('Đã báo hoàn thành! Đang chờ khách xác nhận và giải ngân.', 'success')",
  "showToast('Đã báo hoàn thành! Đang chờ khách xác nhận.', 'success')"
);

contentJob = contentJob.replace(
  "showToast('Đã giải ngân cho người nhận việc.', 'success')",
  "showToast('Đã xác nhận hoàn thành công việc.', 'success')"
);

contentJob = contentJob.replace(
  "getApiErrorMessage(error, 'Không thể giải ngân.')",
  "getApiErrorMessage(error, 'Không thể xác nhận hoàn thành.')"
);

contentJob = contentJob.replace(
  "'Xác nhận & Giải ngân',\n      `Giải ngân ${formatVnd(job.price)} cho người nhận việc của \"${job.title}\"?`",
  "'Xác nhận hoàn thành',\n      `Xác nhận công việc \"${job.title}\" đã hoàn thành?`"
);

contentJob = contentJob.replace(
  "{ text: 'Giải ngân', onPress: () => void confirmRelease() },",
  "{ text: 'Xác nhận', onPress: () => void confirmRelease() },"
);

contentJob = contentJob.replace(
  "const result = await cancelJob(job.id)\n      showToast(\n        result ? 'Đã huỷ việc và hoàn tiền ký quỹ về ví bạn.' : 'Đã huỷ việc.',\n        'success',\n      )",
  "await cancelJob(job.id)\n      showToast('Đã huỷ việc.', 'success')"
);

contentJob = contentJob.replace(
  "const result = await refundJob(job.id)\n      showToast(\n        `Bạn đã từ chối việc. ${formatVnd(result.escrow.amount)} đã được hoàn về ví chủ việc.`,\n        'success',\n      )",
  "await refundJob(job.id)\n      showToast('Bạn đã huỷ nhận việc.', 'success')"
);

fs.writeFileSync(fileJob, contentJob);
console.log('done');
