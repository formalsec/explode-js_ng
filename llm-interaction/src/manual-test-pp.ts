import { NodeVM } from 'vm2';

const vm = new NodeVM({
  sandbox: {},
  require: {
    external: false
  }
});

vm.run(`Object.prototype.polluted = true;`, 'exploit.js');

console.log('Polluted:', ({} as any).polluted);

