import * as llmModule from '../src/llmInteraction';
import { UnsuccessfulRunResult } from '../src/results';
import { Package } from '../src/package';


describe('extractJSCodeBlocks', () => {
	const extractJSCodeBlocks = (llmModule as any)['extractJSCodeBlocks'];

	it('extracts code blocks wrapped in triple backticks', () => {
		const input = "```js\nconsole.log('hi');\n```";
		const result = extractJSCodeBlocks(input);
		expect(result).toEqual(["console.log('hi');\n"]);
	});

	it('returns empty array when no code block exists', () => {
		const result = extractJSCodeBlocks("no code here");
		expect(result).toEqual([]);
	});
});

describe('validateJS', () => {
	const validateJS = (llmModule as any)['validateJS'];

	it('validates correct JavaScript', () => {
		const result = validateJS('console.log("ok");');
		expect(result).toEqual({ valid: true });
	});

	it('returns syntax error for bad JavaScript', () => {
		const result = validateJS('function ()');
		expect(result.valid).toBe(false);
		expect(result.error).toBeDefined();
	});

	it('returns valid for multi-line function', () => {
		const code = `
            function greet(name) {
                return "Hello, " + name;
            }
            `;
		expect(validateJS(code)).toEqual({ valid: true });
	});

	it('returns invalid for syntax error', () => {
		const result = validateJS('function ()');
		expect(result.valid).toBe(false);
		expect(result.error).toBeDefined();
	});


	it('returns invalid for non-JS garbage', () => {
		const result = validateJS('%%&@#!@#@!');
		expect(result.valid).toBe(false);
		expect(result.error).toMatch(/Unexpected token|Unexpected character/);
	});
});

describe('parseLLMAnswer', () => {
	const parseLLMAnswer = (llmModule as any)['parseLLMAnswer'];
	const validCode = '```js\nconsole.log("valid");\n```';
	const invalidCode = '```js\nfunction ()\n```';

	const pkg = new Package('// source', '// sink', '', 'CWE-94');

	it('returns ExploitResult when code writes a file', async () => {
		const payload = `require('fs').writeFileSync('test.txt', 'pwned');`;
		const input = `\`\`\`js\n${payload}\n\`\`\``;

		const result = await parseLLMAnswer(input, pkg);
		expect(result.type).toBe('ExploitResult');
		expect(result.output).toContain('New files created');
	});

	it('returns RuntimeErrorResult for thrown runtime error', async () => {
		const payload = `throw new Error('boom');`;
		const input = `\`\`\`js\n${payload}\n\`\`\``;

		const result = await parseLLMAnswer(input, pkg);
		expect(result.type).toBe('RuntimeErrorResult');
	});

	it('returns UnsuccessfulRun for valid non exploit JS code', async () => {
		const result = await parseLLMAnswer(validCode, pkg);
		expect(result.type).toMatch('UnsuccessfulRun');
	});

	it('returns SyntaxErrorResult for broken code', async () => {
		const result = await parseLLMAnswer(invalidCode, pkg);
		expect(result.type).toBe('SyntaxErrorResult');
		expect(result.errorMessage).toBeDefined();
	});

	it('returns NoCodeResult if no code block exists', async () => {
		const result = await parseLLMAnswer('This has no code', pkg);
		expect(result.type).toBe('NoCodeResult');
	});
});
