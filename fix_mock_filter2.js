const fs = require('fs');
let p = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/if \(params\.mine\) \{[\s\S]*?\: \[\]\r?\n  \}/, `if (params.mine) {
    const viewerId = viewer?.id
    jobs = viewerId
      ? jobs.filter((job) => {
          if (job.owner.id === viewerId) return true
          return mockJobWorkers.get(job.id) === viewerId
        })
      : []
  }`);

fs.writeFileSync(p, c);
console.log('done');
