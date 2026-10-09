const fs = require('fs');

function secureFile(file, roleToBlock, redirectTarget) {
    let content = fs.readFileSync(file, 'utf8');
    
    // add import Redirect from expo-router if missing
    if (!content.includes("import { Redirect } from 'expo-router'")) {
        content = "import { Redirect } from 'expo-router'\n" + content;
    }
    // add useAuth import if missing
    if (!content.includes("useAuth")) {
        content = "import { useAuth } from '../../../hooks/useAuth'\n" + content;
    }
    
    let regex = /export default function [a-zA-Z]+\(\) \{/;
    content = content.replace(regex, `$&
  const { currentRole } = useAuth()
  if (currentRole === '${roleToBlock}') {
    return <Redirect href="${redirectTarget}" />
  }
`);
    fs.writeFileSync(file, content);
}

secureFile('app_mobile/app/(app)/(tabs)/post.tsx', 'tasker', '/(app)/(tabs)/board');
secureFile('app_mobile/app/(app)/(tabs)/jobs.tsx', 'tasker', '/(app)/(tabs)/board');
secureFile('app_mobile/app/(app)/(tabs)/history.tsx', 'tasker', '/(app)/(tabs)/board');

secureFile('app_mobile/app/(app)/(tabs)/board.tsx', 'seeker', '/(app)/(tabs)/post');
secureFile('app_mobile/app/(app)/(tabs)/active.tsx', 'seeker', '/(app)/(tabs)/post');
secureFile('app_mobile/app/(app)/(tabs)/earnings.tsx', 'seeker', '/(app)/(tabs)/post');

console.log('done');
