import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Package } from "./package";
import { Result } from "./results";

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
  const cweDir = cwe.toLowerCase(); // e.g., "cwe-94"
  const specificPath = resolve(baseDir, cweDir, `${promptType}.prompt.txt`);
  const fallbackPath = resolve(baseDir, `${promptType}.prompt.txt`);

  if (existsSync(specificPath)) {
    return readFileSync(specificPath, "utf-8");
  } else if (existsSync(fallbackPath)) {
    return readFileSync(fallbackPath, "utf-8");
  } else {
    throw new Error(`Prompt template not found for ${cwe}/${promptType}`);
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
    resultSummary: result ? JSON.stringify(result, null, 2) : ""
  });
}

