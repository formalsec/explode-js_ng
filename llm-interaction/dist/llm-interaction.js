"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const genai_1 = require("@google/genai");
const esprima_1 = __importDefault(require("esprima"));
const node_vm_1 = __importDefault(require("node:vm"));
const results_1 = require("./results");
const prompts_1 = require("./prompts");
const package_1 = require("./package");
const MAX = 10;
class Gemini20Flash {
    constructor(apiKey) {
        this.client = new genai_1.GoogleGenAI({ apiKey: apiKey });
    }
    async ask(prompt) {
        try {
            const response = await this.client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: prompt
            });
            return response.text ?? "";
        }
        catch (err) {
            console.error("Gemini error:", err.message);
            return "ERROR: API Error";
        }
    }
}
// LLM response parsing
function extractJSCodeBlocks(text) {
    const codeBlocks = [];
    const codeBlockRegex = /```(?:js|javascript)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        codeBlocks.push(match[1]);
    }
    return codeBlocks;
}
//Extracted code validation and running
function validateJS(code) {
    try {
        esprima_1.default.parseScript(code);
        return { valid: true };
    }
    catch (err) {
        return { valid: false, error: err.message };
    }
}
function runJS(code) {
    try {
        const output = [];
        const sandbox = {
            console: {
                log: (msg) => output.push(String(msg))
            }
        };
        const context = node_vm_1.default.createContext(sandbox);
        const script = new node_vm_1.default.Script(code);
        script.runInContext(context);
        return { output };
    }
    catch (err) {
        return { output: [], error: err.message };
    }
}
function parseLLMAnswer(txt, pkg) {
    const codeBlocks = extractJSCodeBlocks(txt);
    if (codeBlocks.length === 0) {
        return (0, results_1.buildNoCodeResult)();
    }
    const code = codeBlocks[0]; //Use first code block for now
    const syntaxCheck = validateJS(code);
    if (!syntaxCheck.valid) {
        return (0, results_1.buildSyntaxErrorResult)(syntaxCheck.error ?? "Unknown syntax error");
    }
    const runResult = runJS(code);
    if (runResult.error) {
        return (0, results_1.buildRuntimeErrorResult)(code, runResult.error);
    }
    const outputStr = runResult.output.join("\n");
    // For now return the code need to implement vulnerability triggering check
    if (outputStr) {
        return (0, results_1.buildExploitResult)(code, outputStr);
    }
    else {
        return (0, results_1.buildUnsuccessfulRun)(code);
    }
}
async function generateExploit(llm, pkg, mode, result) {
    var prompt;
    if (mode == "source_sink") {
        prompt = (0, prompts_1.generatePrompt)("source-sink", pkg, result);
    }
    else {
        prompt = (0, prompts_1.generatePrompt)("simple", pkg, result);
    }
    var answer = await llm.ask(prompt);
    var exploit = parseLLMAnswer(answer, pkg);
    return exploit;
}
async function LLMRefinementLoop(llm, pkg, mode) {
    let result;
    let cur = 0;
    do {
        result = await generateExploit(llm, pkg, mode, result);
        if (result.type === "ExploitResult") {
            return result;
        }
    } while (cur < MAX);
    return result; // for now return result of last try maybe create a new Result type to return here
}
async function main() {
    const llm = new Gemini20Flash(process.env.GEMINI_KEY || "");
    const pkg = new package_1.Package("input", "output", "./vuln.js", "CWE-94");
    const prompt = (0, prompts_1.generatePrompt)("simple", pkg);
    console.log(prompt);
    const answer = await llm.ask(prompt);
    console.log(answer);
}
main();
