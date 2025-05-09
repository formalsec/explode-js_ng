export function killProcessGroups(pids: number[]): void {
    for (const pid of pids) {
        try {
            process.kill(-pid); // negative PID: kill the process group
            console.log(`✔️ Killed process group for PID ${pid}`);
        } catch (err: any) {
            console.warn(`⚠️ Failed to kill process group for PID ${pid}: ${err.message}`);
        }
    }
}

