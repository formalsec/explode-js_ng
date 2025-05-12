// extractResultsDirs.js
const fs = require("fs");
const path = require("path");
const fsp = fs.promises;

const baseDir = __dirname; // Adjust if needed
const destDir = path.join(baseDir, "extracted-results");

async function copyResultsDirs() {
    const cweDirs = fs.readdirSync(baseDir).filter(d => d.startsWith("cwe-"));

    for (const cweDir of cweDirs) {
        const cwePath = path.join(baseDir, cweDir);
        const subDirs = fs.readdirSync(cwePath, { withFileTypes: true }).filter(d => d.isDirectory());

        for (const sub of subDirs) {
            const resultsSrc = path.join(cwePath, sub.name, "results");
            const resultsDst = path.join(destDir, cweDir, sub.name, "results");

            if (fs.existsSync(resultsSrc) && fs.statSync(resultsSrc).isDirectory()) {
                const entries = fs.readdirSync(resultsSrc);
                if (entries.length === 0) continue; // Skip empty results dirs

                // Ensure destination dir exists
                await fsp.mkdir(resultsDst, { recursive: true });

                // Copy contents of results/
                for (const entry of entries) {
                    const srcFile = path.join(resultsSrc, entry);
                    const dstFile = path.join(resultsDst, entry);
                    await fsp.copyFile(srcFile, dstFile);
                }

                console.log(`✅ Copied: ${path.relative(baseDir, resultsDst)}`);
            }
        }
    }
}

copyResultsDirs().catch(err => {
    console.error("❌ Error during extraction:", err);
});

