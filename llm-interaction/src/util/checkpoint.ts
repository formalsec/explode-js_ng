// checkpoint.ts
import { promises as fsp } from "fs";

export interface Checkpoint {
	pkgPath: string;   // absolute vulnerableCodePath of the _last_ package we touched
	llmName: string;   // name of the _last_ LLM we tried
	mode: string;   // name of the _last_ mode we tried
}

const FILE = ".checkpoint.json";

export async function loadCheckpoint(): Promise<Checkpoint | null> {
	try {
		const txt = await fsp.readFile(FILE, "utf-8");
		return JSON.parse(txt) as Checkpoint;
	} catch {
		return null;          // file does not exist or is unreadable
	}
}

export async function saveCheckpoint(cp: Checkpoint): Promise<void> {
	await fsp.writeFile(FILE, JSON.stringify(cp), "utf-8");
}

export async function clearCheckpoint(): Promise<void> {
	try { await fsp.unlink(FILE); } catch { /* ignore */ }
}

