import { generatePrompt } from '../src/prompts';
import { Package } from '../src/package';

describe('generatePrompt', () => {
  
    const pkg = new Package(
        'function vulnerableFunction(userInput) {',
        'eval(userInput);',
        './data/cwe94-simple.js',
        'CWE-94'
    );

  it('replaces placeholders in the prompt template', () => {
    const result = generatePrompt('simple', pkg);
    expect(result).toContain(pkg.getSink());
    expect(result).toContain(pkg.getPackageCode());
    expect(result).toContain(pkg.getSource());
    expect(result).toContain(pkg.getCWE());
  });

});

