import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir;
let dirCount = 0;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvis-stack-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function testDir() {
  const dir = path.join(tmpDir, `t${dirCount++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeConfig(dir, fileName, content) {
  await fs.writeFile(path.join(dir, fileName), content, 'utf-8');
}

test('detects nextjs from package.json with next dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { next: '^13.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'nextjs');
});

test('detects angular from package.json with @angular/core', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { '@angular/core': '^15.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'angular');
});

test('detects react from package.json with react', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'react');
});

test('detects express from package.json with express dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { express: '^4.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'express');
});

test('detects python from pyproject.toml', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'pyproject.toml', '[project]\nname = "test"');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'python');
});

test('detects flask from requirements.txt with flask dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'requirements.txt', 'flask\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'flask');
});

test('detects python from setup.py', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'setup.py', 'from setuptools import setup\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'python');
});

test('detects cpp from CMakeLists.txt', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'CMakeLists.txt', 'cmake_minimum_required(VERSION 3.0)\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'cpp');
});

test('detects cpp from Makefile', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'Makefile', 'all:\n\techo hello\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'cpp');
});

test('detects rust from Cargo.toml', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'Cargo.toml', '[package]\nname = "test"\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'rust');
});

test('detects go from go.mod', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'go.mod', 'module example.com/test\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'go');
});

test('detects php from composer.json', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'composer.json', '{}');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'php');
});

test('detects ruby from Gemfile', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'Gemfile', "source 'https://rubygems.org'\n");
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'ruby');
});

test('detects java from build.gradle', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'build.gradle', "apply plugin: 'java'\n");
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'java');
});

test('detects java from pom.xml', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'pom.xml', '<project><modelVersion>4.0.0</modelVersion></project>');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'java');
});

test('falls back to node when no config files exist', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'node');
});

test('falls through on malformed package.json', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', 'not valid json');
  await writeConfig(dir, 'Cargo.toml', '[package]\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'rust');
});

test('priority: nextjs beats angular beats react beats node', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({
    dependencies: { next: '^13.0.0', '@angular/core': '^15.0.0', react: '^18.0.0' },
  }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'nextjs');
});

test('detects vue from package.json with vue dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { vue: '^3.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'vue');
});

test('detects svelte from package.json with svelte dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { svelte: '^3.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'svelte');
});

test('detects fastify from package.json with fastify dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { fastify: '^4.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'fastify');
});

test('detects hono from package.json with hono dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { hono: '^3.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'hono');
});

test('detects django from requirements.txt with django dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'requirements.txt', 'django>=4.0\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'django');
});

test('detects fastapi from requirements.txt with fastapi dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'requirements.txt', 'fastapi==0.95.0\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'fastapi');
});

test('detects node from package.json with unknown dependencies', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'package.json', JSON.stringify({ dependencies: { random: '^1.0.0' } }));
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'node');
});

test('detects python from requirements.txt with non-framework dependency', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'requirements.txt', 'numpy==1.24.0\n');
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'python');
});

test('detects java from build.gradle.kts', async () => {
  const { detectTechStack } = await import('../../src/parser/stack-detector.js');
  const dir = await testDir();
  await writeConfig(dir, 'build.gradle.kts', "plugins { java }\n");
  const result = await detectTechStack(dir);
  assert.equal(result.type, 'java');
});
