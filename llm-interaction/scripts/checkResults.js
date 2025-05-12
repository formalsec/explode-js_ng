// checkEmptyResults.js
const fs = require("fs");
const path = require("path");

const baseDir = __dirname; // Adjust if needed
const cweDirs = fs.readdirSync(baseDir).filter(f => f.startsWith("cwe-"));

let foundEmpty = false;

for (const cweDir of cweDirs) {
    const cwePath = path.join(baseDir, cweDir);
    const subDirs = fs.readdirSync(cwePath, { withFileTypes: true }).filter(d => d.isDirectory());

    for (const sub of subDirs) {
        const resultsPath = path.join(cwePath, sub.name, "results");

        if (fs.existsSync(resultsPath) && fs.statSync(resultsPath).isDirectory()) {
            const files = fs.readdirSync(resultsPath);
            if (files.length === 0) {
                foundEmpty = true;
                console.log(`Empty results directory: ${path.relative(baseDir, resultsPath)}`);
            }
        }
    }
}

if (!foundEmpty) {
    console.log("✅ All results directories contain files.");
}

