import { readFileSync } from "fs";
import { resolve } from "path";


export class Package {
    private source: string;
    private sink: string;
    private vulnerableCodePath: string;
    private cwe: string;
    private setup: string[];

    constructor(source: string, sink: string, vulnerableCodePath: string, cwe: string, setup?: string[]) {
        this.source = source;
        this.sink = sink;
        this.vulnerableCodePath = vulnerableCodePath;
        this.cwe = cwe;
        this.setup = setup || [];
    }

    getSource(): string {
        return this.source;
    }

    getSink(): string {
        return this.sink;
    }

    getCWE(): string {
        return this.cwe;
    }

    getVulnerableCodePath(): string {
       // console.log(`Code Path: ${this.vulnerableCodePath}`);
        return this.vulnerableCodePath;
    } 

    getPackageCode(): string {
        try {
            const fullPath = resolve(this.vulnerableCodePath);
            return readFileSync(fullPath, "utf-8");
        } catch (err: any) {
            throw new Error(`Failed to read package code: ${err.message}`);
        }
    }

    getSetup(): string[] {
        return this.setup;
    }

}


