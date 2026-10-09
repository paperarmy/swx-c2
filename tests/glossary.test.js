// 용어 도움말(PRD 6.4): 화면이 쓰는 설명 키가 glossary.json에 모두 있는지, 2문장 이내인지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { COLUMNS } from '../js/engine.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const glossary = JSON.parse(read('../config/glossary.json'));
const fallback = JSON.parse(read('../data/fallback-latest.json'));

test('화면 코드가 쓰는 tipAttrs 키가 모두 있다', () => {
  const dir = new URL('../js/render/', import.meta.url);
  const used = new Set();
  for (const f of readdirSync(dir)) {
    for (const m of read(`../js/render/${f}`).matchAll(/tipAttrs\(g, '([^']+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !glossary.terms[k]);
  assert.deepEqual(missing, []);
});

test('원천 ID·단계·매트릭스 열 설명이 있다', () => {
  const keys = [...fallback.sources.map((s) => s.id), 'level0', 'level1', 'level2', 'level3', ...COLUMNS];
  assert.deepEqual(keys.filter((k) => !glossary.terms[k]), []);
});

test('설명은 2문장 이내', () => {
  const long = Object.entries(glossary.terms).filter(([, t]) => (t.match(/[.。]\s|[.。]$|다\.|요\./g) ?? []).length > 3);
  assert.deepEqual(long.map(([k]) => k), []);
});
