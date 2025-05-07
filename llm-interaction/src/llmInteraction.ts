import {GoogleGenAI} from "@google/genai";
import * as esprima from 'esprima';

import { writeFile } from 'fs/promises';
import { join } from 'path';

import {
  buildSyntaxErrorResult,
  buildNoCodeResult,
  Result,
} from "./results";

import {generatePrompt} from "./prompts"

import {Package} from "./package"

import {
    runInjectionExploit,
    runPathTraversalExploit,
    runPrototypePollutionExploit,
} from "./exploitRunner"

import {
    replaceAllRequires,
} from "./util/replaceRequirePaths"
//const MAX = 0;
//LLMs 
interface LLM {
  ask(prompt: string): Promise<string>;
  getName(): string; 
}

class Gemini20Flash implements LLM {
    private client:  GoogleGenAI;
    private name: string;
    constructor(apiKey:string) {
        this.client = new GoogleGenAI({apiKey: apiKey});
        this.name = "Gemini20Flash"
    }

  async ask(prompt: string): Promise<string> {
    try {
        const response = await this.client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt
        });
        return response.text??"";
    }catch (err: any) {
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


function runJS(pkg: Package, code: string): Result {
    switch (pkg.getCWE()) {
        case 'CWE-94': // Code Injection
        case 'CWE-78': // Command Injection
            return runInjectionExploit(code);

        case 'CWE-1321': // Prototype Pollution
            return runPrototypePollutionExploit(code);
        
        case 'CWE-22': //Path Traversal
            return runPathTraversalExploit(code);

        default:
            return buildNoCodeResult(); // or maybe other speficic Result
    }
}




//Complete answer parsing
function parseLLMAnswer(txt: string, pkg: Package): Result{
    const codeBlocks: string[] = extractJSCodeBlocks(txt);
    
    if (codeBlocks.length === 0) {
        return buildNoCodeResult();
    } 

    var code = codeBlocks[0]; //Use first code block for now

    const syntaxCheck = validateJS(code);
    if (!syntaxCheck.valid) {
        return buildSyntaxErrorResult(code ,syntaxCheck.error ?? "Unknown syntax error");
    }

    code = replaceAllRequires(code, pkg.getVulnerableCodePath());

    //console.log("\n====================[ CODE TO RUN ]====================\n");
    //console.log(code);
    const runResult = runJS(pkg, code);
        
    return runResult
}


async function generateExploit(llm: LLM, pkg: Package, mode: string, result?: Result) : Promise<Result> {
    var prompt; 

    prompt = generatePrompt(mode ,pkg ,result);
    //console.log("\n====================[ PROMPT ]====================\n");
    //console.log(prompt);
    
    //console.log("Waiting for LLM answer...")
    var answer = await llm.ask(prompt); 
    
    //console.log("\n====================[ LLM ANSWER ]====================\n");
    //console.log(answer);
  
    var exploit =  parseLLMAnswer(answer, pkg);

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
        if(timeout) {  
            const resultOrTimeout = await Promise.race([
                generateExploit(llm, pkg, mode, result),
                timeoutFallback(timeout)
            ]);
        
            if (resultOrTimeout === "timeout") {
                continue;
            }
            //If it does not time out assign the return value to result
            result = resultOrTimeout;
        }else {//no timeout provided
            result = await generateExploit(llm, pkg, mode, result);
        }
         
        if (result.type === "ExploitResult") {
            return result;
        }
           
        cur +=1;
  
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
        for (const llm of llms) {
            //For each Mode
            for (const mode of modes) {
                //Run RefinmentLoop and save results to json
                try {
                    const result = await LLMRefinementLoop(llm, pkg, mode, maxIterations, timeoutMs);

                    const filename = `${llm.getName()}-${mode}-iteration${maxIterations}.json`;
                    const filePath = join(pkg.getVulnerableCodePath(), filename);
        
                    await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
                    console.log(`Saved result to ${filePath}`);
                } catch (err) {
                    console.error(`Error for ${pkg.getVulnerableCodePath} [${llm.getName}, ${mode}]:`, err);
                }
            }
        }
    }
}



async function main() {
    const llm: LLM = new Gemini20Flash(process.env.GEMINI_KEY || "");
    const ciPkg = new Package('module.exports = function(){',"exec(command, { stdio: 'ignore' })",'/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/src/vulnerabilities/cwe-78/index.js','CWE-78');
    //const result = await LLMRefinementLoop(llm,ciPkg,"simple");
    //console.log("\n====================[ RESULT ]====================\n");
    //console.log(result);

    //const pkgs: Package[] = [];
    //const modes = ["simple", "source-sink"];
    
    /*for (const mode of modes) {//For each Mode 
        for (const pkg of pkgs) {//For each Package
            LLMRefinementLoop(llm, pkg, mode);//Run Loop
            //Add result saving logic
        }
    }*/
    
    //Testing
    //const pkg = new Package("input", "output", "./vuln.js", "CWE-94");//Replace with actual package loading 
    /*const pkg = new Package('// source', '// sink', '', 'CWE-94');

    //const prompt = generatePrompt("simple", pkg);
    //console.log(prompt); 
    
    const result = parseLLMAnswer('```js\nfunction ()\n```', pkg);
    console.log(result);*/
    //const answer = await llm.ask(prompt);
    //console.log(answer);

}

if (require.main === module) {
  main();
}

if (process.env.NODE_ENV === 'test') {
    // Add anything else you want to test internally here too
    (module.exports as any).extractJSCodeBlocks = extractJSCodeBlocks;
    (module.exports as any).validateJS = validateJS;
    (module.exports as any).parseLLMAnswer = parseLLMAnswer;
}
