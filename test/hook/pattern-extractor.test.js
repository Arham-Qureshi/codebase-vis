import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSearchCommand, hasEscapeHatch, extractPattern, shouldIntercept } from '../../src/hook/pattern-extractor.js';

describe('pattern-extractor', () => {
  it('detects grep variants', () => {
    assert.equal(isSearchCommand('grep validateToken src/'), true);
    assert.equal(isSearchCommand('rg "myFunc" .'), true);
    assert.equal(isSearchCommand('find . -name "*.js"'), true);
    assert.equal(isSearchCommand('echo hello'), false);
    assert.equal(isSearchCommand('grepfoo bar'), false);
    assert.equal(isSearchCommand('ag searchTerm'), true);
    assert.equal(isSearchCommand('ack pattern'), true);
    assert.equal(isSearchCommand('ripgrep pattern'), true);
  });

  it('handles empty/null input', () => {
    assert.equal(isSearchCommand(''), false);
    assert.equal(isSearchCommand(null), false);
    assert.equal(isSearchCommand(undefined), false);
  });

  it('detects escape hatch', () => {
    assert.equal(hasEscapeHatch('grep foo --graph-tried'), true);
    assert.equal(hasEscapeHatch('grep foo # graph-checked'), true);
    assert.equal(hasEscapeHatch('grep foo # --graph-tried'), true);
    assert.equal(hasEscapeHatch('grep foo'), false);
    assert.equal(hasEscapeHatch(''), false);
    assert.equal(hasEscapeHatch(null), false);
  });

  it('extracts pattern', () => {
    assert.equal(extractPattern('grep validateToken'), 'validateToken');
    assert.equal(extractPattern("rg 'my_func' src/"), 'my_func');
    assert.equal(extractPattern('grep -rn "hello" .'), 'hello');
    assert.equal(extractPattern('grep -r validateToken src/'), 'validateToken');
    assert.equal(extractPattern('find . -name "*.js"'), null);
  });

  it('rejects short patterns <3 chars', () => {
    assert.equal(extractPattern('grep ab'), null);
    assert.equal(extractPattern('grep'), null);
    assert.equal(extractPattern('grep a'), null);
  });

  it('shouldIntercept combines checks', () => {
    assert.deepEqual(shouldIntercept('grep validateToken'), { intercept: true, pattern: 'validateToken', reason: 'search' });
    assert.equal(shouldIntercept('grep validateToken --graph-tried').intercept, false);
    assert.equal(shouldIntercept('grep validateToken --graph-tried').reason, 'escape_hatch');
    assert.equal(shouldIntercept('echo hi').intercept, false);
    assert.equal(shouldIntercept('echo hi').reason, 'not_search');
    assert.equal(shouldIntercept('grep ab').intercept, false);
    assert.equal(shouldIntercept('grep ab').reason, 'no_pattern');
  });
});
