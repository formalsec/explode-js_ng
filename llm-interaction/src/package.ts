import { readFileSync } from "fs";
import { resolve } from "path";
import { execSync, spawn } from "child_process";

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

    runSetup(): number[] {
        const pids: number[] = [];

        if (this.setup.length === 0) return pids;

        console.log("Running setup commands...");
        for (const cmd of this.setup) {
            const trimmed = cmd.trim();

            if (trimmed.endsWith("&")) {
                const actualCmd = trimmed.slice(0, -1).trim();
                const [exec, ...args] = actualCmd.split(" ");
                console.log(`Starting background process: ${actualCmd}`);

                const child = spawn(exec, args, {
                    detached: true,
                    stdio: "ignore",
             
                });
                child.unref();

                if (typeof child.pid === 'number') { //Record pid
                    pids.push(child.pid);
                }

            } else {
                try {
                    console.log(`Executing: ${trimmed}`);
                    execSync(trimmed, { stdio: "inherit", shell: "/bin/bash" });
                } catch (err: any) {
                    throw new Error(`Setup command failed: "${trimmed}"\n${err.message}`);
                }
            }
        }

        return pids;
    }
}


