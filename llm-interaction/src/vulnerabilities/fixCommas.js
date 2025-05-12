const fs = require('fs');
const path = require('path');

function fixTrailingCommasInJson(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove trailing commas before closing braces/brackets
    const cleaned = content.replace(/,\s*([}\]])/g, '$1');

    try {
        JSON.parse(cleaned); // Verify it still parses
        fs.writeFileSync(filePath, cleaned, 'utf8');
        console.log(`✅ Fixed: ${filePath}`);
    } catch (err) {
        console.error(`❌ Invalid JSON after cleaning: ${filePath}`);
    }
}

function walkAndFix(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkAndFix(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            fixTrailingCommasInJson(fullPath);
        }
    }
}

// Start from current directory or pass as argument
const rootDir = process.argv[2] || '.';
walkAndFix(path.resolve(rootDir));

