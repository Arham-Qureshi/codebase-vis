import { test } from 'node:test';
import assert from 'node:assert/strict';

test('getHtmlTemplate returns a non-empty string', async () => {
  const { getHtmlTemplate } = await import('../../src/templates/graph-template.js');
  const html = await getHtmlTemplate();
  assert.ok(typeof html === 'string');
  assert.ok(html.length > 0);
});

test('getHtmlTemplate returns HTML starting with doctype', async () => {
  const { getHtmlTemplate } = await import('../../src/templates/graph-template.js');
  const html = await getHtmlTemplate();
  assert.ok(html.trim().startsWith('<!DOCTYPE html>') || html.trim().startsWith('<html'));
});

test('getHtmlTemplate caches and returns same reference on second call', async () => {
  const { getHtmlTemplate } = await import('../../src/templates/graph-template.js');
  const first = await getHtmlTemplate();
  const second = await getHtmlTemplate();
  assert.equal(first, second);
});

test('getHtmlTemplate contains vis-network integration code', async () => {
  const { getHtmlTemplate } = await import('../../src/templates/graph-template.js');
  const html = await getHtmlTemplate();
  assert.ok(html.includes('vis-network') || html.includes('Network'));
});
