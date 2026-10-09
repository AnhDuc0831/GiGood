const fs = require('fs');
let p = 'app_mobile/lib/features/jobs/mock.ts';
let c = fs.readFileSync(p, 'utf8');

const target = `  if (params.mine) {
    const viewerId = viewer?.id
    jobs = viewerId
      ? jobs.filter((job) => {
          if (job.owner.id === viewerId) return true
          const escrow = mockGetEscrow(job.id)
          return (
            escrow?.payeeId === viewerId &&
            (escrow.status === 'Held' || escrow.status === 'Released')
          )
        })
      : []
  }`;

const replacement = `  if (params.mine) {
    const viewerId = viewer?.id
    jobs = viewerId
      ? jobs.filter((job) => {
          if (job.owner.id === viewerId) return true
          return mockJobWorkers.get(job.id) === viewerId
        })
      : []
  }`;

if (c.includes(target)) {
  fs.writeFileSync(p, c.replace(target, replacement));
} else {
  // Let's replace line by line if endings are CRLF
  c = c.replace(/const escrow = mockGetEscrow\(job\.id\)/, 'return mockJobWorkers.get(job.id) === viewerId');
  c = c.replace(/return \([\s\S]*?\)/, ''); // removes the escrow check
  fs.writeFileSync(p, c);
}
