import fs from 'fs';
import { webcrack } from '../../packages/GHSA-ccqh-278p-xq6w/package/dist/index.js';

const input = fs.readFileSync('what.js', 'utf8');

const result = await webcrack(input);
console.log(result.code);
console.log(result.bundle);
await result.save('output-dir');
