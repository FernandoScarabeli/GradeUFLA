// @vitest-environment node
// Node tem CompressionStream/Blob.stream como os navegadores (o jsdom não).
import {
  codificarGrade,
  decodificarGrade,
  extrairToken,
  extrairTokenDeTexto,
  LinkInvalidoError,
  paraGradeSalva,
  turmasDaGrade,
  urlDaGrade
} from './linkGrade';

const paraToken = objeto => `j${btoa(JSON.stringify(objeto)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

const gradeDe = quantidade => Object.fromEntries(Array.from({ length: quantidade }, (_, indice) => [
  `GCC${String(100 + indice)}`,
  { turmaId: String.fromCharCode(65 + (indice % 6)), horarios: [] }
]));

const base = { curso: 'G014', matriz: '2023/01', semestre: 5, periodo: '2026/2' };

test('ida e volta, com ANP', async () => {
  const grade = {
    GCC101: { turmaId: 'A' },
    PRG200: { turmaId: '10A' },
    ANP1: { turmaId: 'ANP', anp: true, anpHour: 11 }
  };
  const token = await codificarGrade({ ...base, grade });
  const dados = await decodificarGrade(token);
  expect(dados).toEqual({
    ...base,
    turmas: [['GCC101', 'A'], ['PRG200', '10A'], ['ANP1', 'ANP', 11]]
  });
  expect(paraGradeSalva(dados.turmas)).toEqual({
    GCC101: { turmaId: 'A' },
    PRG200: { turmaId: '10A' },
    ANP1: { turmaId: 'ANP', anpHour: 11 }
  });
});

test('link de uma grade típica (10 matérias) fica abaixo de ~300 caracteres', async () => {
  const token = await codificarGrade({ ...base, grade: gradeDe(10) });
  const url = urlDaGrade(token, 'https://gradeufla.com.br/');
  expect(url.length).toBeLessThan(300);
  expect((await decodificarGrade(token)).turmas).toHaveLength(10);
});

test('sem CompressionStream usa JSON puro e continua decodificando', async () => {
  const original = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    const token = await codificarGrade({ ...base, grade: gradeDe(3) });
    expect(token.startsWith('j')).toBe(true);
    expect((await decodificarGrade(token)).turmas).toHaveLength(3);
  } finally {
    globalThis.CompressionStream = original;
  }
});

test.each([
  ['vazio', ''],
  ['prefixo desconhecido', 'xAAAA'],
  ['base64 com lixo', 'j@@@'],
  ['não é JSON', `j${btoa('oi').replace(/=+$/, '')}`],
  ['comprimido corrompido', 'zAAAAAAAAAA'],
  ['longo demais', `j${'A'.repeat(5000)}`]
])('link corrompido (%s) lança LinkInvalidoError', async (_, token) => {
  await expect(decodificarGrade(token)).rejects.toBeInstanceOf(LinkInvalidoError);
});

test('versão desconhecida avisa que é de outra versão', async () => {
  const token = paraToken({ v: 9, c: 'G014', m: '2023/01', s: 1, p: '2026/2', t: [] });
  await expect(decodificarGrade(token)).rejects.toThrow('outra versão');
});

test.each([
  ['sem curso', { v: 1, m: '2023/01', s: 1, p: '2026/2', t: [] }],
  ['semestre inválido', { v: 1, c: 'G014', m: '2023/01', s: 0, p: '2026/2', t: [] }],
  ['turma malformada', { v: 1, c: 'G014', m: '2023/01', s: 1, p: '2026/2', t: [['GCC101']] }],
  ['anpHour não inteiro', { v: 1, c: 'G014', m: '2023/01', s: 1, p: '2026/2', t: [['A', 'ANP', 'x']] }],
  ['matérias demais', { v: 1, c: 'G014', m: '2023/01', s: 1, p: '2026/2', t: Array(41).fill(['A', 'B']) }]
])('payload inválido (%s)', async (_, payload) => {
  await expect(decodificarGrade(paraToken(payload))).rejects.toBeInstanceOf(LinkInvalidoError);
});

test('turmasDaGrade ignora entradas sem turma', () => {
  expect(turmasDaGrade({ A: { turmaId: 'X' }, B: {} })).toEqual([['A', 'X']]);
});

test('extrai o token do fragmento ou do link colado', () => {
  expect(extrairToken('#g=jabc_-')).toBe('jabc_-');
  expect(extrairToken('#outra')).toBeNull();
  expect(extrairToken('')).toBeNull();
  expect(extrairTokenDeTexto(' https://gradeufla.com.br/#g=zQQ ')).toBe('zQQ');
  expect(extrairTokenDeTexto('jABC')).toBe('jABC');
  expect(extrairTokenDeTexto('https://gradeufla.com.br/')).toBeNull();
});
