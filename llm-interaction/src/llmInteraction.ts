import {GoogleGenAI} from "@google/genai";
import esprima from "esprima";

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
const MAX = 10;
//LLMs 
interface LLM {
  ask(prompt: string): Promise<string>;
}

class Gemini20Flash implements LLM {
    private client:  GoogleGenAI;
    constructor(apiKey:string) {
        this.client = new GoogleGenAI({apiKey: apiKey});
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
        return buildSyntaxErrorResult(syntaxCheck.error ?? "Unknown syntax error");
    }

    code = replaceAllRequires(code, pkg.getVulnerableCodePath());

    const runResult = runJS(pkg, code);
        
    return runResult
}


async function generateExploit(llm: LLM, pkg: Package, mode: string, result?: Result) : Promise<Result> {
    var prompt; 

    prompt = generatePrompt(mode ,pkg ,result); 
     
    var answer = await llm.ask(prompt); 
  
    var exploit =  parseLLMAnswer(answer, pkg);

    return exploit;
}

async function LLMRefinementLoop(llm: LLM, pkg: Package, mode: string): Promise<Result> {
    let result: Result | undefined; 
    let cur = 0;
    
    do {
        result = await generateExploit(llm, pkg, mode, result); 
        if (result.type === "ExploitResult") {
            return result; 
        }
  
    } while (cur < MAX)
  
    return result // for now return result of last try maybe create a new Result type to return here
}




async function main() {
    /*const llm: LLM = new Gemini20Flash(process.env.GEMINI_KEY || "");

    const pkgs: Package[] = [];
    const modes = ["simple", "source-sink"];
    
    for (const mode of modes) {//For each Mode 
        for (const pkg of pkgs) {//For each Package
            LLMRefinementLoop(llm, pkg, mode);//Run Loop
            //Add result saving logic
        }
    }*/
    
    //Testing
    const pkg = new Package("input", "output", "./vuln.js", "CWE-94");//Replace with actual package loading 

    const prompt = generatePrompt("simple", pkg);
    console.log(prompt); 

    //const answer = await llm.ask(prompt);
    //console.log(answer);

}

main();
