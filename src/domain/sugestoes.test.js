import { oQueDestrava, oQueEncaixa, resumoDestrava } from './sugestoes';

const req = (forte = [], minimo = [], coreq = []) => ({ forte, minimo, coreq });
const materia = (codigo, extra = {}) => ({
  codigo,
  nome: `Matéria ${codigo}`,
  creditos: 4,
  semestre: 1,
  turmas: [],
  preRequisitosDetalhada: req(),
  ...extra
});

describe('oQueDestrava', () => {
  const catalogo = [
    materia('CALC1'),
    materia('GA'),
    materia('CALC2', { semestre: 2, preRequisitosDetalhada: req(['CALC1']) }),
    materia('FIS2', { semestre: 2, preRequisitosDetalhada: req(['CALC1'], ['GA']) }),
    materia('LAB', { semestre: 2, preRequisitosDetalhada: req([], [], ['CALC1']) }),
    materia('CALC3', { semestre: 3, preRequisitosDetalhada: req(['CALC2']) }),
    materia('EDO', { semestre: 4, preRequisitosDetalhada: req(['CALC3']) })
  ];

  test('lista quem pede a matéria e diz se libera de vez ou o que ainda falta', () => {
    const { diretas, totalNaCadeia } = oQueDestrava('CALC1', catalogo);
    expect(diretas.map(item => [item.materia.codigo, item.liberaDeVez, item.faltaAinda])).toEqual([
      ['CALC2', true, []],
      ['FIS2', false, ['GA']]
    ]);
    // co-requisito não conta; a cadeia segue CALC2 → CALC3 → EDO
    expect(totalNaCadeia).toBe(4);
  });

  test('o que já foi feito ou confirmado não aparece e não trava mais', () => {
    const { diretas } = oQueDestrava('CALC1', catalogo, {
      materiasAprovadas: ['CALC2'],
      prerequisitosConfirmados: ['GA']
    });
    expect(diretas.map(item => [item.materia.codigo, item.liberaDeVez])).toEqual([['FIS2', true]]);
  });

  test('sem detalhada, usa a lista simples de pré-requisitos', () => {
    const antigo = [materia('A', { preRequisitosDetalhada: undefined }), { codigo: 'B', nome: 'B', preRequisitos: ['A'] }];
    expect(oQueDestrava('A', antigo).diretas).toHaveLength(1);
  });

  test('resumo cita até duas e conta o resto', () => {
    expect(resumoDestrava(oQueDestrava('EDO', catalogo))).toBe('');
    expect(resumoDestrava(oQueDestrava('CALC1', catalogo))).toBe('Matéria CALC2 e Matéria FIS2');
    expect(resumoDestrava(oQueDestrava('CALC1', catalogo), 1)).toBe('Matéria CALC2 e mais 1');
  });
});

describe('oQueEncaixa', () => {
  const turma = (id, horarios) => ({ id, horarios, anp: false });
  const seg8 = { dia: 1, inicio: 8, fim: 10 };
  const ter8 = { dia: 2, inicio: 8, fim: 10 };

  test('só traz turmas com aula naquela hora e que não chocam com a grade', () => {
    const listas = {
      semestre: [
        materia('A', { turmas: [turma('1', [seg8]), turma('2', [ter8])] }),
        materia('B', { turmas: [turma('1', [seg8, { dia: 3, inicio: 14, fim: 16 }])] })
      ],
      eletivas: [materia('C', { turmas: [turma('1', [{ dia: 1, inicio: 9, fim: 11 }])] })]
    };
    const grade = { X: { codigo: 'X', nome: 'X', creditos: 4, horarios: [{ dia: 3, inicio: 14, fim: 16 }] } };
    const resultado = oQueEncaixa(1, 9, listas, { materiasNoCalendario: grade });

    expect(resultado.grupos.map(grupo => grupo.chave)).toEqual(['semestre', 'eletivas']);
    expect(resultado.grupos[0].itens.map(item => [item.materia.codigo, item.turmas.map(t => t.id)]))
      .toEqual([['A', ['1']]]);
    expect(resultado.total).toBe(2);
    expect(oQueEncaixa(1, 10, listas, { materiasNoCalendario: {} }).grupos[0]?.chave).toBe('eletivas');
  });

  test('conta à parte as que encaixam mas estão barradas por pré-requisito ou créditos', () => {
    const listas = {
      semestre: [materia('A', { turmas: [turma('1', [seg8])], preRequisitosDetalhada: req(['Z']) })],
      pendentes: [materia('B', { creditos: 30, turmas: [turma('1', [seg8])] })]
    };
    const grade = { X: { codigo: 'X', creditos: 4, horarios: [] } };
    const resultado = oQueEncaixa(1, 8, listas, { materiasNoCalendario: grade, materiasAprovadas: [] });
    expect(resultado.total).toBe(0);
    expect(resultado.barradas).toBe(2);
  });
});
