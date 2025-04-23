import {GoogleGenAI} from "@google/genai";
import esprima from "esprima";
import vm from "node:vm";

//LLMs 
interface LLM {
  ask(prompt: string): Promise<string>;
}

class Gemini implements LLM {
    private client:  GoogleGenAI;
    constructor(apiKey:string) {
        this.client = new GoogleGenAI({apiKey: apiKey});
    }

  async ask(prompt: string): Promise<string> {
    // This is mock logic. In reality, you’d hit the OpenAI API.
    try {
        const response = await this.client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt
        });
        return response.text??"";
    }catch (err: any) {
      console.error("Gemini error:", err.message);
      return "// ERROR: Failed to generate exploit.";
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

function runJS(code: string): any {
  try {
    const script = new vm.Script(code);
    const context = vm.createContext({
      console: console,
      result: null,
    });
    const result = script.runInContext(context);
    return result;
  } catch (err: any) {
    return `Runtime error: ${err.message}`;
  }
}


async function main() {
  const llm: LLM = new Gemini(process.env.GEMINI_KEY || "");

  const prompt = `This is a prompt to test the api send a response with some text and a javascript code block`;

  const answer = await llm.ask(prompt);


  console.log("LLM Response:\n", answer);
  const codeBlocks = extractJSCodeBlocks(answer);

    if (codeBlocks.length === 0) {
    console.error("No JavaScript code found.");
    } else {
        for (const code of codeBlocks) {
            console.log("----- Code Block -----");
            console.log(code);

            const validation = validateJS(code);
            if (!validation.valid) {
                console.error("❌ Syntax error:", validation.error);
                continue;
            }

            console.log("✅ Code is valid. Executing...");
            const result = runJS(code);
            console.log("🧪 Result:", result);
        }
    }
}

main();
