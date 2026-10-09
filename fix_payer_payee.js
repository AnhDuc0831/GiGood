const fs = require('fs');
let p = 'app_mobile/app/(app)/job/[id].tsx';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
  "const isPayer = !!heldEscrow && heldEscrow.payerId === profile?.id\r\n  const isPayee = !!heldEscrow && heldEscrow.payeeId === profile?.id",
  "const isPayer = isOwner && job?.status === 'Assigned'\r\n  const isPayee = !isOwner && job?.status === 'Assigned'"
);
c = c.replace(
  "const isPayer = !!heldEscrow && heldEscrow.payerId === profile?.id\n  const isPayee = !!heldEscrow && heldEscrow.payeeId === profile?.id",
  "const isPayer = isOwner && job?.status === 'Assigned'\n  const isPayee = !isOwner && job?.status === 'Assigned'"
);

fs.writeFileSync(p, c);
console.log('done');
