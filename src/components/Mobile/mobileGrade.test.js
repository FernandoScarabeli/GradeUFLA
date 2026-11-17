import {
  avaliarTurma,
  blocosDoDia,
  casaBusca,
  professorDaBusca,
  diaInicial,
  listasParaAdicionar,
  primeiroDiaDaMateria,
  situacaoMateria
} from './mobileGrade';

const turma = (id, horarios, anp = false) => ({ id, horarios, anp });
const materia = (codigo, extra = {}) => ({
  codigo,
  nome: `Matéria ${codigo}`,
  creditos: 4,
  tipo: 'obrigatoria',
  turmas: [turma('A', [{ dia: 1, inicio: 8, fim: 10 }])],
  preRequisitosDetalhada: { forte: [], minimo: [], coreq: [] },
  ...extra
});
const contexto = (extra = {}) => ({
  materiasAprovadas: [],
  materiasNoCalendario: {},
  prerequisitosConfirmados: [],
  allMateriasList: [],
  ...extra
});

test('busca ignora acentos e maiúsculas, por nome ou código', () => {
  const m = { nome: 'Introdução à Computação', codigo: 'GCC241' };
  expect(casaBusca(m, 'introducao')).toBe(true);
  expect(casaBusca(m, 'gcc2')).toBe(true);
  expect(casaBusca(m, 'redes')).toBe(false);
  expect(casaBusca(m, '  ')).toBe(true);
});

test('busca também casa o professor e diz quando foi por ele', () => {
  const m = { nome: 'Programação Web', codigo: 'NOR201', turmas: [{ id: 'A', professor: 'ALEXANDRE ALVES DE CARVALHO' }] };
  expect(casaBusca(m, 'alexandre')).toBe(true);
  expect(professorDaBusca(m, 'alexandre')).toBe('Alexandre Alves de Carvalho');
  expect(professorDaBusca(m, 'web')).toBeNull();
  expect(casaBusca({ nome: 'X', codigo: 'Y', turmas: [{ id: 'A' }] }, 'alexandre')).toBe(false);
});

test('blocos do dia vêm ordenados e, no sábado de turma ANP, só a hora alocada', () => {
  const calendario = {
    B: { ...materia('B'), horarios: [{ dia: 1, inicio: 14, fim: 16 }] },
    A: { ...materia('A'), horarios: [{ dia: 1, inicio: 8, fim: 10 }] },
    P: {
      ...materia('P'),
      anp: true,
      anpHour: 9,
      horarios: [{ dia: 6, inicio: 13, fim: 15 }, { dia: 6, inicio: 9, fim: 10 }]
    }
  };
  expect(blocosDoDia(calendario, 1).map(b => b.codigo)).toEqual(['A', 'B']);
  const sabado = blocosDoDia(calendario, 6);
  expect(sabado).toHaveLength(1);
  expect(sabado[0]).toMatchObject({ codigo: 'P', inicio: 9, anp: true });
});

test('listas separam semestre, pendentes, eletivas e futuras sem o que já foi feito ou está na grade', () => {
  const listas = listasParaAdicionar({
    materiasPorSemestre: { 1: [materia('S1'), materia('S1b')], 2: [materia('S2'), materia('S2b')], 3: [materia('S3')] },
    eletivas: [materia('E1', { tipo: 'eletiva' })],
    semestreAtual: 2,
    materiasAprovadas: ['S1'],
    materiasNoCalendario: { S2b: materia('S2b') }
  });
  expect(listas.semestre.map(m => m.codigo)).toEqual(['S2']);
  expect(listas.pendentes.map(m => [m.codigo, m.semestreOriginal])).toEqual([['S1b', 1]]);
  expect(listas.eletivas.map(m => m.codigo)).toEqual(['E1']);
  expect(listas.futuras.map(m => m.codigo)).toEqual(['S3']);
});

test('turma em conflito, já na grade ou sem vaga ANP não fica disponível', () => {
  const ocupado = { X: { ...materia('X'), nome: 'Ocupada', horarios: [{ dia: 1, inicio: 9, fim: 11 }] } };
  const alvo = materia('Y', {
    turmas: [turma('A', [{ dia: 1, inicio: 8, fim: 10 }]), turma('B', [{ dia: 2, inicio: 8, fim: 10 }])]
  });
  const [a, b] = alvo.turmas.map(t => avaliarTurma(alvo, t, ocupado));
  expect(a.disponivel).toBe(false);
  expect(a.conflito.materiaConflito).toBe('Ocupada');
  expect(b.disponivel).toBe(true);

  const naGrade = { Y: { ...alvo, turmaId: 'B', horarios: alvo.turmas[1].horarios } };
  expect(avaliarTurma(alvo, alvo.turmas[1], naGrade)).toMatchObject({ atual: true, disponivel: false });

  // Todas as horas ANP do sábado (9 a 22) ocupadas: a híbrida não cabe.
  const anpLotado = {};
  for (let hora = 9; hora <= 22; hora++) anpLotado[`P${hora}`] = { ...materia(`P${hora}`), anp: true, anpHour: hora, horarios: [] };
  const hibrida = materia('H', { turmas: [turma('H', [{ dia: 3, inicio: 8, fim: 10 }], true)] });
  expect(avaliarTurma(hibrida, hibrida.turmas[0], anpLotado).disponivel).toBe(false);
});

test('situação: forte bloqueia obrigatória, mas eletiva pode confirmar; mínimo sempre confirma', () => {
  const forte = { forte: ['F'], minimo: [], coreq: [] };
  expect(situacaoMateria(materia('O', { preRequisitosDetalhada: forte }), contexto()))
    .toMatchObject({ tipo: 'forte', bloqueada: true, confirmavel: false });
  expect(situacaoMateria(materia('E', { tipo: 'eletiva', preRequisitosDetalhada: forte }), contexto()))
    .toMatchObject({ tipo: 'forte', bloqueada: false, confirmavel: true });
  expect(situacaoMateria(materia('M', { preRequisitosDetalhada: { forte: [], minimo: ['Q'], coreq: [] } }), contexto()))
    .toMatchObject({ tipo: 'minimo', confirmavel: true });
  expect(situacaoMateria(
    materia('M', { preRequisitosDetalhada: { forte: [], minimo: ['Q'], coreq: [] } }),
    contexto({ prerequisitosConfirmados: ['Q'] })
  ).tipo).toBe(null);
});

test('situação: sem turma, todas chocando e co-requisito pendente', () => {
  expect(situacaoMateria(materia('V', { turmas: [turma('A', [])] }), contexto()).tipo).toBe('sem-turma');
  const ocupado = { X: { ...materia('X'), horarios: [{ dia: 1, inicio: 8, fim: 10 }] } };
  expect(situacaoMateria(materia('C'), contexto({ materiasNoCalendario: ocupado })).tipo).toBe('choque');
  expect(situacaoMateria(materia('R', { preRequisitosDetalhada: { forte: [], minimo: [], coreq: ['Z'] } }), contexto()))
    .toMatchObject({ tipo: 'coreq', codigos: ['Z'], bloqueada: false });
});

test('primeiro dia da matéria e dia inicial da grade', () => {
  expect(primeiroDiaDaMateria({ horarios: [{ dia: 4, inicio: 8, fim: 10 }, { dia: 2, inicio: 8, fim: 10 }] })).toBe(2);
  expect(primeiroDiaDaMateria({ anp: true, horarios: [] })).toBe(6);
  expect(diaInicial(new Date(2026, 10, 18))).toBe(3); // quarta-feira
  expect(diaInicial(new Date(2026, 10, 15))).toBe(1); // domingo abre na segunda
});
