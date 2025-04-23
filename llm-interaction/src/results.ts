// src/results.ts

export enum ResultType {
  Exploit = "ExploitResult",
  SyntaxError = "SyntaxErrorResult",
  RuntimeError = "RuntimeErrorResult",
  UnsuccessfulRun = "UnsuccessfulRunResult",
  NoCode = "NoCodeResult"
}

export abstract class Result {
  constructor(
    public type: ResultType,
  ) {}
}


export class ExploitResult extends Result {
  constructor(
    public code: string,
    public output: string
  ) {
    super(ResultType.Exploit);
  }
}

export class SyntaxErrorResult extends Result {
  constructor(
    public errorMessage: string
  ) {
    super(ResultType.SyntaxError);
  }
}

export class RuntimeErrorResult extends Result {
  constructor(
    public code: string,
    public errorMessage: string
  ) {
    super(ResultType.RuntimeError);
  }
}

export class UnsuccessfulRunResult extends Result {
  constructor(
    public code: string
  ) {
    super(ResultType.UnsuccessfulRun);
  }
}

export class NoCodeResult extends Result {
  constructor(
  ) {
    super(ResultType.NoCode);
  }
}



export function buildExploitResult(code: string, output: string): ExploitResult {
  return new ExploitResult(code, output);
}

export function buildSyntaxErrorResult(errorMessage: string): SyntaxErrorResult {
  return new SyntaxErrorResult(errorMessage);
}

export function buildRuntimeErrorResult(code: string, errorMessage: string): RuntimeErrorResult {
  return new RuntimeErrorResult(code, errorMessage);
}

export function buildUnsuccessfulRun(code: string): UnsuccessfulRunResult {
  return new UnsuccessfulRunResult(code);
}

export function buildNoCodeResult(): NoCodeResult {
  return new NoCodeResult();
}


