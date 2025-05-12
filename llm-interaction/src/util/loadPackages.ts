import { readdirSync, readFileSync, realpathSync } from "fs";
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
           // console.log(packageDir.name);
            const jsonFile = files.find(f => f.endsWith(".json") && f.startsWith(packageDir.name));
            const sliceFile = files.find(f => supportedExtensions.includes(extname(f)) && f.startsWith("vulnerable_slice"));
            if (!jsonFile || !sliceFile) continue;

            const jsonPath = join(pkgPath, jsonFile);
            const jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"));

            const locations = jsonData.vulnerability?.vulnerability_location;
            if (!locations || locations.length === 0) continue;

            const sourceCode = locations[0].source?.code || "";
            const sinkCode = locations[0].sink?.code || "";

            const vulnerableCodePath = realpathSync(join(pkgPath, sliceFile)); // <-- resolved real path
            //console.log(`Load Packages Code Path: ${vulnerableCodePath}`);
            const cwe = jsonData.correct_cwe || jsonData.advisory?.cwe || "";

            const setup = Array.isArray(jsonData.setup)
                ? (jsonData.setup as unknown[]).filter((s): s is string => typeof s === "string")
                : [];

            const pkg = new Package(sourceCode, sinkCode, vulnerableCodePath, cwe, setup);
            packages.push(pkg);
        }
    }

    return packages;
}
