// src/replaceRequirePaths.ts
import * as esprima from 'esprima';
import estraverse from "estraverse";
import escodegen from "escodegen";
import { nodeBuiltins } from "./builtins";

/**
 * Replaces all non-core `require(...)` calls with the given `replacementPath`.
 * This includes relative paths, absolute paths, or unknown package names.
 */
export function replaceAllRequires(code: string, replacementPath: string): string {
  const ast = esprima.parseScript(code);

  estraverse.replace(ast, {
    enter(node) {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments.length === 1 &&
        node.arguments[0].type === "Literal"
      ) {
        const moduleName = node.arguments[0].value as string;

        const isBuiltin = nodeBuiltins.has(moduleName);
        if (!isBuiltin) {
          node.arguments[0].value = replacementPath;
        }
      }
    }
  });

  return escodegen.generate(ast);
}

