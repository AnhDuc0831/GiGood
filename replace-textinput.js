const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules')) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('app_mobile/app').concat(walk('app_mobile/lib')).concat(['app_mobile/components/ui/Input.tsx', 'app_mobile/components/ui/FormField.tsx']);

let changed = 0;
for (const file of files) {
    if (file.includes('VTextInput.tsx')) continue;
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('<TextInput')) {
        content = content.replace(/<TextInput/g, '<VTextInput');
        content = content.replace(/<\/TextInput>/g, '<\/VTextInput>');
        
        // Add import
        let relativePath = path.relative(path.dirname(file), 'app_mobile/components/ui/VTextInput').replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }
        const importStatement = `import { VTextInput } from '${relativePath}';`;
        
        content = importStatement + '\n' + content;
        fs.writeFileSync(file, content);
        changed++;
        console.log('Updated ' + file);
    }
}
console.log('Total files updated: ' + changed);
