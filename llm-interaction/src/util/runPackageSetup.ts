import { Package } from "../package";
import { execSync, spawn } from "child_process";

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function runPackageSetup(pkg: Package, spyFsPath: string, logFilePath: string): number[] {
	const pids: number[] = [];
	const setup: string[] = pkg.getSetup();

	if (setup.length === 0) return pids;

	console.log("Running setup commands...");
	for (const cmd of setup) {
		const trimmed = cmd.trim();

		if (trimmed.endsWith("&")) {
			const serverPath = trimmed.slice(0, -1).trim();

			//console.log("Log path at the server runing", logFilePath);
			console.log(`Starting server process: ${serverPath}`);
			const child = spawn('node', ['--require', spyFsPath, serverPath], {
				detached: true,
				stdio: 'inherit', // or 'pipe' if you want to capture output
				env: {
					...process.env,
					SPY_FS_LOG_PATH: logFilePath,
				},
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

