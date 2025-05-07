import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Package } from "./package";
import { 
    Result, 
    SyntaxErrorResult, 
    RuntimeErrorResult, 
    UnsuccessfulRunResult,  
} from "./results";

/**
 * Replace <placeholders> in template with actual values from vars.
 */
function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/<(\w+)>/g, (_, key: string) =>
    key in vars ? vars[key] : `<${key}>`
  );
}

/**
 * Loads a prompt template based on CWE and prompt type.
 * Falls back to a default if a CWE-specific one isn't found.
 */
function loadPromptTemplate(
  cwe: string,
  promptType: string,
  baseDir: string = resolve(__dirname, "prompts")
): string {
   // console.log(`BaseDir: ${baseDir}`);
  const cweDir = cwe.toLowerCase(); // e.g., "cwe-94"
  const specificPath = resolve(baseDir, cweDir, `${promptType}.prompt.txt`);
  const fallbackPath = resolve(baseDir, `${promptType}.prompt.txt`);
    //console.log(`SpecificPath: ${specificPath}`);
  if (existsSync(specificPath)) {
    return readFileSync(specificPath, "utf-8");
  } else if (existsSync(fallbackPath)) {
    return readFileSync(fallbackPath, "utf-8");
  } else {
    throw new Error(`Prompt template not found in ${specificPath}`);
  }
}

function getResultSummary(result: Result): string {
    switch (result.type) {
    case "SyntaxErrorResult": {
      const r = result as SyntaxErrorResult;
      return `SyntaxError:\nConsidering also the exploit code:\n${r.code}\nthat resulted in a SyntaxError:\n${r.errorMessage}`;
    }
    case "RuntimeErrorResult": {
      const r = result as RuntimeErrorResult;
      return `RuntimeError:\nConsidering also the exploit code:\n${r.code}\nthat resulted in a RuntimeError:\n${r.errorMessage}`;
    }
    case "UnsuccessfulRunResult": {
      const r = result as UnsuccessfulRunResult;
      return `Unsuccessful Run:\nConsidering also the exploit code:\n${r.code}\nthat did not succeed in triggering the vulnerability.`;
    }
    case "NoCodeResult": {
        return ``;
    }
    default:
      return "No summary available for this result type.";
  }
}

/**
 * Generates a prompt using a CWE + promptType + Package + optional Result.
 */
export function generatePrompt(
  promptType: string,
  pkg: Package,
  result?: Result
): string {
  const template = loadPromptTemplate(pkg.getCWE(), promptType);

  return renderPrompt(template, {
    code: pkg.getPackageCode(),
    source: pkg.getSource(),
    sink: pkg.getSink(),
    cwe: pkg.getCWE(),
    resultSummary: result ? getResultSummary(result) : ""
  });
}

