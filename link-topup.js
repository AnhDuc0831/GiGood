const fs = require('fs');

let p = 'app_mobile/app/(app)/profile.tsx';
let pc = fs.readFileSync(p, 'utf8');
pc = pc.replace(
  /<TouchableOpacity className="bg-orange-500 px-4 py-2 rounded-xl">\s*<Text className="text-white text-xs font-bold">Mua Token<\/Text>\s*<\/TouchableOpacity>/,
  "<TouchableOpacity onPress={() => router.push('/(app)/topup')} className=\"bg-orange-500 px-4 py-2 rounded-xl\">\n            <Text className=\"text-white text-xs font-bold\">Mua Token</Text>\n          </TouchableOpacity>"
);
fs.writeFileSync(p, pc);

let l = 'app_mobile/app/(app)/_layout.tsx';
let lc = fs.readFileSync(l, 'utf8');
lc = lc.replace(
  /<TouchableOpacity className="bg-orange-500 px-3 py-1\.5 rounded-lg">\s*<Text className="text-\[10px\] font-bold text-white">Mua Token<\/Text>\s*<\/TouchableOpacity>/,
  "<TouchableOpacity onPress={() => router.push('/(app)/topup')} className=\"bg-orange-500 px-3 py-1.5 rounded-lg\">\n                <Text className=\"text-[10px] font-bold text-white\">Mua Token</Text>\n              </TouchableOpacity>"
);
fs.writeFileSync(l, lc);

console.log('done');
