const fs = require('fs');

// post.tsx
let f = 'app_mobile/app/(app)/(tabs)/post.tsx';
let c = fs.readFileSync(f, 'utf8');
if (!c.includes('useQueryClient')) {
    c = c.replace(/import \{ useRouter \} from 'expo-router'/, "import { useRouter } from 'expo-router'\nimport { useQueryClient } from '@tanstack/react-query'");
    c = c.replace(/const router = useRouter\(\)/, "const router = useRouter()\n  const queryClient = useQueryClient()");
}
c = c.replace(/showToast\('Đăng việc thành công! Đang tìm Tasker phù hợp\.\.\.', 'success'\)/, "queryClient.invalidateQueries({ queryKey: ['wallet'] });\n      showToast('Đăng việc thành công! Đang tìm Tasker phù hợp...', 'success')");
fs.writeFileSync(f, c);

// job/[id].tsx
let f2 = 'app_mobile/app/(app)/job/[id].tsx';
let c2 = fs.readFileSync(f2, 'utf8');
if (!c2.includes('useQueryClient')) {
    c2 = c2.replace(/import \{ useRouter \} from 'expo-router'/, "import { useRouter } from 'expo-router'\nimport { useQueryClient } from '@tanstack/react-query'");
    c2 = c2.replace(/const router = useRouter\(\)/, "const router = useRouter()\n  const queryClient = useQueryClient()");
}
c2 = c2.replace(/await acceptJob\(job\.id\)\n      showToast\('Đã nhận việc thành công!', 'success'\)/, "await acceptJob(job.id)\n      queryClient.invalidateQueries({ queryKey: ['wallet'] })\n      showToast('Đã nhận việc thành công!', 'success')");
fs.writeFileSync(f2, c2);

console.log('done');
