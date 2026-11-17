import { montarGrades, pontuarGrade } from './montador';

const materia = (codigo, turmas, creditos = 4) => ({
  codigo,
  nome: codigo,
  creditos,
  turmas: turmas.map(([id, ...horarios]) => ({ id, horarios: horarios.map(([dia, inicio, fim]) => ({ dia, inicio, fim })) }))
});

// Dias já convertidos pelo csvLoader: 1 = segunda … 6 = sábado.
const web = materia('WEB', [['A', [1, 8, 10]], ['B', [1, 19, 21]]]);
const bd = materia('BD', [['A', [1, 9, 11]], ['B', [3, 14, 16]]]);
const so = materia('SO', [['A', [5, 8, 10]], ['B', [2, 10, 12]]]);

const turmasDe = grade => Object.fromEntries(Object.entries(grade).map(([codigo, entrada]) => [codigo, entrada.turmaId]));

test('só gera grades sem conflito, com todas as matérias', () => {
  const { opcoes, stats } = montarGrades([web, bd, so]);
  // WEB-A conflita com BD-A: sobram 3 de 4 combinações de WEB×BD, vezes 2 de SO.
  expect(opcoes).toHaveLength(6);
  expect(stats.completas).toBe(6);
  opcoes.forEach(({ grade }) => {
    expect(Object.keys(grade).sort()).toEqual(['BD', 'SO', 'WEB']);
    expect(turmasDe(grade)).not.toEqual(expect.objectContaining({ WEB: 'A', BD: 'A' }));
  });
});

test('evitar noite e deixar a sexta livre ordena as opções', () => {
  const { opcoes } = montarGrades([web, bd, so], { evitar: ['noite'], diasLivres: [5] });
  expect(turmasDe(opcoes[0].grade)).toEqual({ WEB: 'A', BD: 'B', SO: 'B' });
  expect(opcoes[0].avaliacao).toMatchObject({ horasEvitadas: 0, horasEmDiasLivres: 0 });
  expect(opcoes.at(-1).avaliacao.pontos).toBeGreaterThan(opcoes[0].avaliacao.pontos);
});

test('menos dias com aula', () => {
  const { opcoes } = montarGrades([web, bd], { menosDias: true });
  expect(opcoes[0].avaliacao.dias).toBe(1);
  expect(turmasDe(opcoes[0].grade)).toEqual({ WEB: 'B', BD: 'A' });
});

test('menos buracos mede as horas vagas entre aulas do mesmo dia', () => {
  const grade = {
    WEB: { ...web, turmaId: 'A', horarios: [{ dia: 1, inicio: 8, fim: 10 }] },
    BD: { ...bd, turmaId: 'X', horarios: [{ dia: 1, inicio: 14, fim: 16 }] }
  };
  expect(pontuarGrade(grade, { menosBuracos: true })).toMatchObject({ buracos: 4, pontos: 4 });
  expect(pontuarGrade(grade, {}).pontos).toBe(0);
});

test('"quero 2 dessas 3" pode deixar uma de fora', () => {
  // Segunda livre: WEB só tem turmas na segunda, então fica de fora.
  const { opcoes } = montarGrades([web, bd, so], { diasLivres: [1] }, { quantidade: 2 });
  expect(Object.keys(opcoes[0].grade).sort()).toEqual(['BD', 'SO']);
  expect(opcoes[0].avaliacao.horasEmDiasLivres).toBe(0);
});

test('respeita o limite de créditos e o top N', () => {
  const grandes = [materia('X', [['A', [1, 8, 9]]], 20), materia('Y', [['A', [2, 8, 9]]], 20)];
  expect(montarGrades(grandes).opcoes).toHaveLength(0);
  expect(montarGrades([web, bd, so], {}, { limite: 2 }).opcoes).toHaveLength(2);
});

test('ANP ganha uma hora no sábado sem repetir', () => {
  const anp = id => ({ codigo: id, nome: id, creditos: 2, turmas: [{ id: 'ANP', anp: true, horarios: [] }] });
  const { opcoes } = montarGrades([anp('P1'), anp('P2')]);
  expect(opcoes).toHaveLength(1);
  expect([opcoes[0].grade.P1.anpHour, opcoes[0].grade.P2.anpHour]).toEqual([9, 10]);
});

test('o melhor resultado bate com a força bruta', () => {
  const preferencias = { evitar: ['manha'], menosDias: true, menosBuracos: true };
  const { opcoes } = montarGrades([web, bd, so], preferencias, { limite: 50 });
  const todas = [];
  for (const w of web.turmas) for (const b of bd.turmas) for (const o of so.turmas) {
    const grade = {
      WEB: { ...web, turmaId: w.id, horarios: w.horarios },
      BD: { ...bd, turmaId: b.id, horarios: b.horarios },
      SO: { ...so, turmaId: o.id, horarios: o.horarios }
    };
    const horas = Object.values(grade).flatMap(m => m.horarios);
    const conflito = horas.some((h, i) => horas.some((g, j) => i < j && h.dia === g.dia && h.inicio < g.fim && g.inicio < h.fim));
    if (!conflito) todas.push(pontuarGrade(grade, preferencias).pontos);
  }
  expect(opcoes.map(opcao => opcao.avaliacao.pontos)).toEqual(todas.sort((a, b) => a - b));
});

test('para no maxNos e avisa', () => {
  const { stats } = montarGrades([web, bd, so], {}, { maxNos: 3 });
  expect(stats.interrompido).toBe(true);
});
