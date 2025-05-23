import { GoogleGenAI } from "@google/genai";
import * as esprima from 'esprima';

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

import {
	buildSyntaxErrorResult,
	buildNoCodeResult,
	Result,
	buildRuntimeErrorResult,
} from "./results";

import { generatePrompt } from "./prompts"

import { Package } from "./package"

import {
	runInjectionExploit,
	runPathTraversalExploit,
	runPrototypePollutionExploit,
} from "./exploitRunner"

//Utils
import { replaceAllRequires } from "./util/replaceRequirePaths"
import { killProcessGroups } from "./util/killProcessGroups"
import { loadPackagesFromVulnerabilities } from "./util/loadPackages"

//const MAX = 0;
//LLMs 
interface LLM {
	ask(prompt: string): Promise<string>;
	getName(): string;
}

class Gemini20Flash implements LLM {
	private client: GoogleGenAI;
	private name: string;
	constructor(apiKey: string) {
		this.client = new GoogleGenAI({ apiKey: apiKey });
		this.name = "Gemini20Flash"
	}

	async ask(prompt: string): Promise<string> {
		try {
			const response = await this.client.models.generateContent({
				model: "gemini-2.0-flash",
				contents: prompt
			});
			return response.text ?? "";
		} catch (err: any) {
			console.error("Gemini error:", err.message);
			return "ERROR: API Error";
		}
	}
	getName(): string {
		return this.name;
	}
}

//Refinement Options
interface RefinementOptions {
	packages: Package[];
	llms: LLM[];
	modes: string[];
	maxIterations: number;
	timeoutMs?: number;
}

// LLM response parsing
function extractJSCodeBlocks(text: string): string[] {
	const codeBlocks: string[] = [];

	const codeBlockRegex = /```(?:js|javascript)?\n([\s\S]*?)```/g;
	let match;
	while ((match = codeBlockRegex.exec(text)) !== null) {
		codeBlocks.push(match[1]);
	}

	return codeBlocks;
}

//Extracted code validation and running
function validateJS(code: string): { valid: boolean; error?: string } {
	try {
		esprima.parseScript(code);
		return { valid: true };
	} catch (err: any) {
		return { valid: false, error: err.message };
	}
}


async function runJS(pkg: Package, code: string): Promise<Result> {
	switch (pkg.getCWE()) {
		case 'CWE-94': // Code Injection
		case 'CWE-78': // Command Injection
			return runInjectionExploit(code);

		case 'CWE-1321': // Prototype Pollution
			return runPrototypePollutionExploit(code);

		case 'CWE-22': //Path Traversal
			return await runPathTraversalExploit(code, pkg);

		default:
			return buildNoCodeResult(); // or maybe other speficic Result
	}
}




//Complete answer parsing
async function parseLLMAnswer(txt: string, pkg: Package): Promise<Result> {
	const codeBlocks: string[] = extractJSCodeBlocks(txt);

	if (codeBlocks.length === 0) {
		return buildNoCodeResult();
	}

	var code = codeBlocks[0]; //Use first code block for now

	const syntaxCheck = validateJS(code);
	if (!syntaxCheck.valid) {
		return buildSyntaxErrorResult(code, syntaxCheck.error ?? "Unknown syntax error");
	}

	code = replaceAllRequires(code, pkg.getVulnerableCodePath());

	//console.log("\n====================[ CODE TO RUN ]====================\n");
	//console.log(code);
	var runResult;
	try {
		runResult = await runJS(pkg, code);
	} catch (err) {
		return buildRuntimeErrorResult("", "runJS failed to execute due to Runtime Error");
	}

	return runResult
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateExploit(llm: LLM, pkg: Package, mode: string, result?: Result): Promise<Result> {
	var prompt;

	prompt = generatePrompt(mode, pkg, result);
	//console.log("\n====================[ PROMPT ]====================\n");
	//console.log(prompt);

	//console.log("Waiting for LLM answer...")
	var answer = await llm.ask(prompt);
	await sleep(4000);

	//console.log("\n====================[ LLM ANSWER ]====================\n");
	//console.log(answer);

	var exploit = await parseLLMAnswer(answer, pkg);

	return exploit;
}

async function LLMRefinementLoop(
	llm: LLM,
	pkg: Package,
	mode: string,
	maxIterations: number,
	timeout?: number
): Promise<Result> {
	let result: Result | undefined;
	let cur = 0;

	const timeoutFallback = (ms: number): Promise<"timeout"> =>
		new Promise(resolve => setTimeout(() => resolve("timeout"), ms)
		);

	do {
		//If timeout is provided
		if (timeout) {
			const resultOrTimeout = await Promise.race([
				await generateExploit(llm, pkg, mode, result),
				timeoutFallback(timeout)
			]);

			if (resultOrTimeout === "timeout") {
				continue;
			}
			//If it does not time out assign the return value to result
			result = resultOrTimeout;
		} else {//no timeout provided
			result = await generateExploit(llm, pkg, mode, result);
		}

		if (result.type === "ExploitResult") {
			return result;
		}

		cur += 1;

	} while (cur < maxIterations)

	if (result === undefined) {
		result = buildNoCodeResult();
	}
	return result // for now return result of last try maybe create a new Result type to return here
}


export async function runLLMRefinementBatch({
	packages,
	llms,
	modes,
	maxIterations,
	timeoutMs,
}: RefinementOptions): Promise<void> {
	//For each Package
	for (const pkg of packages) {
		//For each LLM
		//const setUpProcesses: number[]= pkg.runSetup();//Run necessary setup
		for (const llm of llms) {
			//For each Mode
			for (const mode of modes) {
				//Run RefinmentLoop and save results to json
				const codePath = pkg.getVulnerableCodePath();
				const ghsaDir = codePath.split("/").find(part => part.startsWith("GHSA")) || "GHSA-UNKNOWN";

				console.log(`📦 GHSA ID     : ${ghsaDir}`);
				console.log(`🤖 LLM Name    : ${llm.getName()}`);
				console.log(`🛠️  Mode       : ${mode}`);
				try {


					const result = await LLMRefinementLoop(llm, pkg, mode, maxIterations, timeoutMs);

					const filename = `${llm.getName()}-${mode}-iteration${maxIterations}.json`;

					const resultsDir = join(dirname(pkg.getVulnerableCodePath()), 'results');

					// Create the directory if it doesn't exist
					await mkdir(resultsDir, { recursive: true });  // <== this must run before writeFile

					const filePath = join(resultsDir, filename);

					await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
					console.log(`Saved result to ${filePath}`);


				} catch (err) {
					console.error(`Error for ${pkg.getVulnerableCodePath} [${llm.getName}, ${mode}]:`, err);
				}
			}
		}
		//killProcessGroups(setUpProcesses); // kill background processes
	}
}



async function main() {
	const gemini: LLM = new Gemini20Flash(process.env.GEMINI_KEY || "");
	//const ciPkg = new Package('module.exports = function(){',"exec(command, { stdio: 'ignore' })",'/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/src/vulnerabilities/cwe-78/index.js','CWE-78');

	const packages: Package[] = loadPackagesFromVulnerabilities("./vulnerabilities");
	const maxIterationsList: number[] = [1]/*[1, 5, 10, 20]*/;
	const modes: string[] = ["simple", "source-sink"];
	const llms: LLM[] = [gemini];


	//Run Experiences
	for (const max of maxIterationsList) {

		const options: RefinementOptions = {
			packages,
			llms,
			modes,
			maxIterations: max,
		};

		runLLMRefinementBatch(options);
	}

}

if (require.main === module) {
	main();
}

if (process.env.NODE_ENV === 'test') {
	(module.exports as any).extractJSCodeBlocks = extractJSCodeBlocks;
	(module.exports as any).validateJS = validateJS;
	(module.exports as any).parseLLMAnswer = parseLLMAnswer;
}
