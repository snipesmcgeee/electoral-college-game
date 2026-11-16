// Run with:  node tests/scoring.test.mjs
import { readFileSync } from 'node:fs';
import { autoScore, closerPoints } from '../js/scoring.js';
import { normalizeQuestion, withQuestionMark, recheckDue } from '../js/qformat.js';
const Q = Object.fromEntries(JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url))).map(q => [q.id, q]));
let pass = 0, fail = 0;
const eq = (name, got, want) => { got === want ? pass++ : (fail++, console.log('FAIL', name, 'got', got, 'want', want)); };
const find = t => Object.values(Q).find(q => q.text.includes(t));

eq('Kansas statehood exact', autoScore(Q['kansas-026'], '1861').points, 12);
eq('Kansas statehood 1860', autoScore(Q['kansas-026'], '1860').points, 10);
eq('Kansas statehood 1871', autoScore(Q['kansas-026'], '1871').points, 2);
eq('Kansas statehood 1872', autoScore(Q['kansas-026'], '1872').points, 0);
const teeth = find('teeth do adult');
eq('teeth 30', autoScore(teeth, '30').points, 8);
eq('teeth 37', autoScore(teeth, '37').points, 2);
const wings = find('most wings eaten');
eq('wings 420 in exact range', autoScore(wings, '420').points, 12);
eq('wings 380', autoScore(wings, '380').points, 10);
const cap = find('capital of Kansas');
eq('capital exact', autoScore(cap, 'topeka').points, 10);
eq('capital typo flagged', autoScore(cap, 'Topkea').confidence, 'check');
eq('capital wrong', autoScore(cap, 'Wichita').points, 0);
const touch = find('4 States touch');
eq('list 3 of 4', autoScore(touch, 'NE, CO, OK').points, 6);
const tf = find('richest ever');
eq('T/F true', autoScore(tf, 'T').points, 2);
const biden = find('votes did Joe Biden');
eq('Biden votes in millions', autoScore(biden, '80').points, 3);
const closer = { type: 'number', numberMode: 'closer', value: 15, answerLo: 10000, answerHi: 10000 };
eq('closer', JSON.stringify(closerPoints(closer, { blue: '9000', red: '15000' })), JSON.stringify({ blue: 15, red: 0 }));
// uneven and lopsided tables
const lop = { type: 'number', value: 12, answerLo: 100, answerHi: 100, scale: [{ points: 10, below: 5, above: 20 }, { points: 6, below: 30, above: null }] };
eq('lopsided under 5', autoScore(lop, '95').points, 10);
eq('lopsided over 20', autoScore(lop, '120').points, 10);
eq('lopsided under 30', autoScore(lop, '75').points, 6);
eq('lopsided over 21 (no lower row above)', autoScore(lop, '121').points, 0);
// old saved edits still score
const old = { type: 'range', value: 12, stepPoints: 2, step: 10, answerLo: 50, answerHi: 50 };
eq('old format converts', normalizeQuestion(old).type, 'number');
eq('old format 65 → 8', autoScore(old, '65').points, 8);
eq('question mark added', withQuestionMark('What is it.'), 'What is it?');
eq('question mark kept', withQuestionMark('Why?'), 'Why?');
eq('every bank question ends with ?', Object.values(Q).every(q => q.text.trim().endsWith('?')), true);
eq('every bank question tagged', Object.values(Q).every(q => q.categories?.length >= 1 && q.categories.length <= 2), true);
eq('no old types left', Object.values(Q).some(q => q.type === 'range' || q.type === 'closer'), false);
eq('recheck due', recheckDue({ recheckBy: '2026-01-01' }, '2026-11-15'), 'due');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
