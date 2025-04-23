import {GoogleGenAI} from "@google/genai";
import esprima from "esprima";
import vm from "node:vm";

import {
  buildExploitResult,
  buildSyntaxErrorResult,
  buildRuntimeErrorResult,
  buildUnsuccessfulRun,
  buildNoCodeResult,
  Result,
} from "./results";
import {generatePrompt} from "./prompts"
import {Package} from "./package"

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

function runJS(code: string): { output: string[]; error?: string } {
  try {
    const output: string[] = [];

    const sandbox = {
      console: {
        log: (msg: any) => output.push(String(msg))
      }
    };

    const context = vm.createContext(sandbox);
    const script = new vm.Script(code);
    script.runInContext(context);

    return { output };
  } catch (err: any) {
    return { output: [], error: err.message };
  }
}


//Complete answer parsing
function parseLLMAnswer(txt: string, pkg: Package): Result{
    const codeBlocks: string[] = extractJSCodeBlocks(txt);
    
    if (codeBlocks.length === 0) {
        return buildNoCodeResult();
    } 

    const code = codeBlocks[0]; //Use first code block for now

    const syntaxCheck = validateJS(code);
    if (!syntaxCheck.valid) {
        return buildSyntaxErrorResult(syntaxCheck.error ?? "Unknown syntax error");
    }

    const runResult = runJS(code);

    if (runResult.error) {
        return buildRuntimeErrorResult(code, runResult.error);
    }

    const outputStr = runResult.output.join("\n");

    // 
    // TODO Exploit success verification logic
    // 

    if (outputStr) {
        return buildExploitResult(code, outputStr);
    } else {
        return buildUnsuccessfulRun(code);
    }
    
}


async function generateExploit(llm: LLM, pkg: Package, mode: string, result?: Result) : Promise<Result> {
    var prompt; 

    if (mode == "source_sink") {
        prompt = generatePrompt("source-sink",pkg ,result); 
    } else {
        prompt = generatePrompt("simple", pkg, result);
    }
  
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
    const llm: LLM = new Gemini20Flash(process.env.GEMINI_KEY || "");

    const pkg = new Package("input", "output", "./vuln.js", "CWE-94");

    const prompt = generatePrompt("simple", pkg);
    console.log(prompt); 

    const answer = await llm.ask(prompt);
    console.log(answer);

}

main();
