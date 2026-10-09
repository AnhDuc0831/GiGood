const fs = require('fs');
let fileJob = 'app_mobile/app/(app)/job/[id].tsx';
let contentJob = fs.readFileSync(fileJob, 'utf8');

contentJob = contentJob.replace(
  "'Xác nhận & Giải ngân',",
  "'Xác nhận hoàn thành',"
);
contentJob = contentJob.replace(
  "`Giải ngân ${formatVnd(job.price)} cho người nhận việc của \"${job.title}\"?`,",
  "`Xác nhận công việc \"${job.title}\" đã hoàn thành?`,"
);
contentJob = contentJob.replace(
  "result ? 'Đã huỷ việc và hoàn tiền ký quỹ về ví bạn.' : 'Đã huỷ việc.',",
  "'Đã huỷ việc.',"
);
contentJob = contentJob.replace(
  '<Text className="text-lg font-extrabold text-gray-900 flex-1 mr-2">{job.title}</Text>',
  `{job.isUrgent && (
                    <View className="bg-red-500 rounded px-1.5 py-0.5 mr-2 self-start mt-1">
                      <Text className="text-[10px] font-bold text-white uppercase tracking-wider">Gấp</Text>
                    </View>
                  )}
                  <Text className="text-lg font-extrabold text-gray-900 flex-1 mr-2">{job.title}</Text>`
);

fs.writeFileSync(fileJob, contentJob);
console.log('done');
