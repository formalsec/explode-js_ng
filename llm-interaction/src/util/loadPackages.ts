import { readdirSync, readFileSync } from "fs";
import { join, extname } from "path";
import { Package } from "../package"; // Adjust the import path if needed

export function loadPackagesFromVulnerabilities(vulnerabilitiesDir: string): Package[] {
    const supportedExtensions = [".js", ".mjs", ".cjs"];
    const packages: Package[] = [];

    const cweDirs = readdirSync(vulnerabilitiesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

    for (const cweDir of cweDirs) {
        const cwePath = join(vulnerabilitiesDir, cweDir.name);
        const packageDirs = readdirSync(cwePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());

        for (const packageDir of packageDirs) {
            const pkgPath = join(cwePath, packageDir.name);
            const files = readdirSync(pkgPath);

            const jsonFile = files.find(f => f.endsWith(".json"));
            const sliceFile = files.find(f => supportedExtensions.includes(extname(f)) && f.startsWith("vulnerable_slice"));
            if (!jsonFile || !sliceFile) continue;

            const jsonPath = join(pkgPath, jsonFile);
            const jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"));

            const locations = jsonData.vulnerability?.vulnerability_location;
            if (!locations || locations.length === 0) continue;

            const sourceCode = locations[0].source?.code || "";
            const sinkCode = locations[0].sink?.code || "";
            const vulnerableCodePath = join(pkgPath, sliceFile);
            const cwe = jsonData.correct_cwe || jsonData.advisory?.cwe || "";

            // Optional: load setup array if present in the JSON
            const setup = Array.isArray(jsonData.setup) ? jsonData.setup.filter(s => typeof s === "string") : [];

            const pkg = new Package(sourceCode, sinkCode, vulnerableCodePath, cwe, setup);
            packages.push(pkg);
        }
    }

    return packages;
}

