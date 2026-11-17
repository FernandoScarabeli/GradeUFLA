import { comHorarioAnp, materiaComTurma, SATURDAY_INDEX } from '../domain/gradeRules';
import {
  chaveSetup,
  envelopeVazio,
  gravarEnvelope,
  lerChave,
  lerEnvelope,
  mensagensRemovidas,
  migrarEnvelope,
  registrarSetup,
  reidratarGrade,
  reidratarSetup,
  serializarGrade,
  STORAGE_KEY
} from './gradeSalva';

const web = {
  codigo: 'NOR201',
  nome: 'Programação Web',
  creditos: 4,
  turmas: [
    { id: 'A', professor: 'ANA', horarios: [{ dia: 1, inicio: 8, fim: 10, sala: 'PV1' }] },
    { id: 'B', horarios: [{ dia: 3, inicio: 10, fim: 12 }] }
  ]
};
const banco = {
  codigo: 'CON202',
  nome: 'Banco de Dados',
  creditos: 4,
  turmas: [{ id: 'A', horarios: [{ dia: 1, inicio: 9, fim: 11 }] }]
};
const anp1 = { codigo: 'ANP1', nome: 'Projeto ANP 1', creditos: 2, turmas: [{ id: 'ANP', horarios: [], anp: true }] };
const anp2 = { codigo: 'ANP2', nome: 'Projeto ANP 2', creditos: 2, turmas: [{ id: 'ANP', horarios: [], anp: true }] };
const catalogo = new Map([web, banco, anp1, anp2].map(materia => [materia.codigo, materia]));

const memoriaStorage = () => {
  const dados = new Map();
  return {
    getItem: chave => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: chave => dados.delete(chave)
  };
};

describe('chaves de combinação', () => {
  test('ida e volta', () => {
    expect(chaveSetup('G014', '2023/01', 5)).toBe('G014|2023/01|5');
    expect(lerChave('G014|2023/01|5')).toEqual({ curso: 'G014', matriz: '2023/01', semestre: 5 });
  });

  test.each(['', 'G014|2023/01', 'G014||5', 'G014|2023/01|x', 'G014|2023/01|0', null])('rejeita %p', chave => {
    expect(lerChave(chave)).toBeNull();
  });
});

describe('serializarGrade', () => {
  test('guarda só turma e hora ANP, nunca o objeto inteiro', () => {
    const grade = {
      NOR201: materiaComTurma(web, web.turmas[0]),
      ANP1: comHorarioAnp(materiaComTurma(anp1, anp1.turmas[0]), 11)
    };
    expect(serializarGrade(grade)).toEqual({
      NOR201: { turmaId: 'A' },
      ANP1: { turmaId: 'ANP', anpHour: 11 }
    });
  });

  test('ignora entradas sem turma', () => {
    expect(serializarGrade({ X: { nome: 'sem turma' }, Y: null })).toEqual({});
    expect(serializarGrade(undefined)).toEqual({});
  });
});

describe('reidratarGrade', () => {
  test('remonta a partir do catálogo atual, com professor e sala novos', () => {
    const { grade, removidas } = reidratarGrade({ NOR201: { turmaId: 'A' } }, catalogo);
    expect(removidas).toEqual([]);
    expect(grade.NOR201).toMatchObject({
      codigo: 'NOR201',
      nome: 'Programação Web',
      turmaId: 'A',
      professor: 'ANA',
      horarios: [{ dia: 1, inicio: 8, fim: 10, sala: 'PV1' }]
    });
  });

  test('turma ou matéria que não existe mais fica de fora', () => {
    const { grade, removidas } = reidratarGrade({
      NOR201: { turmaId: 'Z' },
      SUMIU1: { turmaId: 'A' },
      CON202: { turmaId: 'A' }
    }, catalogo);
    expect(Object.keys(grade)).toEqual(['CON202']);
    expect(removidas).toEqual([
      { codigo: 'NOR201', nome: 'Programação Web', motivo: 'turma' },
      { codigo: 'SUMIU1', nome: null, motivo: 'turma' }
    ]);
  });

  test('turma que agora conflita sai, a primeira salva fica', () => {
    const { grade, removidas } = reidratarGrade({
      NOR201: { turmaId: 'A' },
      CON202: { turmaId: 'A' }
    }, catalogo);
    expect(Object.keys(grade)).toEqual(['NOR201']);
    expect(removidas).toEqual([{ codigo: 'CON202', nome: 'Banco de Dados', motivo: 'conflito' }]);
  });

  test('ANP mantém a hora salva e acrescenta o sábado', () => {
    const { grade } = reidratarGrade({
      ANP1: { turmaId: 'ANP', anpHour: 15 },
      ANP2: { turmaId: 'ANP', anpHour: 9 }
    }, catalogo);
    expect(grade.ANP1).toMatchObject({ anp: true, anpHour: 15 });
    expect(grade.ANP1.horarios).toEqual([{ dia: SATURDAY_INDEX, inicio: 15, fim: 16 }]);
    expect(grade.ANP2.anpHour).toBe(9);
  });

  test('ANP com hora repetida, inválida ou ausente pega a próxima livre', () => {
    const { grade, removidas } = reidratarGrade({
      ANP1: { turmaId: 'ANP', anpHour: 9 },
      ANP2: { turmaId: 'ANP', anpHour: 9 }
    }, catalogo);
    expect(removidas).toEqual([]);
    expect(grade.ANP2.anpHour).toBe(10);

    expect(reidratarGrade({ ANP1: { turmaId: 'ANP', anpHour: 'x' } }, catalogo).grade.ANP1.anpHour).toBe(9);
    expect(reidratarGrade({ ANP1: { turmaId: 'ANP' } }, catalogo).grade.ANP1.anpHour).toBe(9);
  });

  test('passar do limite de créditos tira o excedente', () => {
    const grandes = Array.from({ length: 5 }, (_, indice) => ({
      codigo: `BIG${indice}`,
      nome: `Grande ${indice}`,
      creditos: 8,
      turmas: [{ id: 'A', horarios: [{ dia: indice + 1, inicio: 8, fim: 10 }] }]
    }));
    const { grade, removidas } = reidratarGrade(
      Object.fromEntries(grandes.map(materia => [materia.codigo, { turmaId: 'A' }])),
      new Map(grandes.map(materia => [materia.codigo, materia]))
    );
    expect(Object.keys(grade)).toHaveLength(4);
    expect(removidas).toEqual([{ codigo: 'BIG4', nome: 'Grande 4', motivo: 'creditos' }]);
  });

  test('dado salvo malformado não quebra', () => {
    expect(reidratarGrade('lixo', catalogo)).toEqual({ grade: {}, removidas: [] });
    expect(reidratarGrade({ NOR201: 'A' }, catalogo).removidas).toHaveLength(1);
    expect(reidratarGrade({ NOR201: { turmaId: 'A' } }, null).grade).toEqual({});
  });
});

describe('reidratarSetup', () => {
  test('ida e volta com os três planos', () => {
    const planos = {
      A: { NOR201: materiaComTurma(web, web.turmas[0]) },
      B: { NOR201: materiaComTurma(web, web.turmas[1]), CON202: materiaComTurma(banco, banco.turmas[0]) },
      C: {}
    };
    const envelope = registrarSetup(envelopeVazio(), {
      curso: 'G014', matriz: '2023/01', semestre: 2, etapa: 'montagem',
      aprovadas: ['BAS101'], minimoConfirmados: ['GMM116'], planoAtivo: 'B', planos
    }, new Date('2026-11-20T12:00:00Z'));

    expect(envelope.ultimo).toBe('G014|2023/01|2');
    expect(envelope.etapa).toBe('montagem');
    expect(envelope.setups['G014|2023/01|2'].atualizadoEm).toBe('2026-11-20T12:00:00.000Z');

    const estado = reidratarSetup(envelope.setups['G014|2023/01|2'], catalogo);
    expect(estado.aprovadas).toEqual(['BAS101']);
    expect(estado.minimoConfirmados).toEqual(['GMM116']);
    expect(estado.planoAtivo).toBe('B');
    expect(Object.keys(estado.planos.B)).toEqual(['NOR201', 'CON202']);
    expect(estado.planos.B.NOR201.turmaId).toBe('B');
    expect(estado.planos.C).toEqual({});
    expect(estado.removidas).toEqual({ A: [], B: [], C: [] });
  });

  test('setup vazio ou inválido vira estado limpo', () => {
    expect(reidratarSetup(null, catalogo)).toEqual({
      aprovadas: [],
      minimoConfirmados: [],
      planoAtivo: 'A',
      planos: { A: {}, B: {}, C: {} },
      removidas: { A: [], B: [], C: [] }
    });
    expect(reidratarSetup({ planoAtivo: 'Z', aprovadas: 'x' }, catalogo).planoAtivo).toBe('A');
  });
});

describe('mensagensRemovidas', () => {
  test('uma mensagem por motivo, sem "undefined"', () => {
    const mensagens = mensagensRemovidas('B', [
      { codigo: 'NOR201', nome: 'Programação Web', motivo: 'turma' },
      { codigo: 'SUMIU1', nome: null, motivo: 'turma' },
      { codigo: 'CON202', nome: 'Banco de Dados', motivo: 'conflito' }
    ], codigo => (codigo === 'SUMIU1' ? 'Matéria Antiga' : null));
    expect(mensagens).toEqual([
      '2 matérias saíram do Plano B porque a turma não existe mais: Programação Web, Matéria Antiga.',
      'Banco de Dados saiu do Plano B porque agora conflita com outra matéria.'
    ]);
    expect(mensagensRemovidas('A', [{ codigo: 'X1', nome: null, motivo: 'turma' }], () => null))
      .toEqual(['X1 saiu do Plano A porque a turma não existe mais.']);
    expect(mensagensRemovidas('A', [])).toEqual([]);
  });
});

describe('envelope e migração', () => {
  const v1 = {
    v: 1,
    ultimo: 'G014|2023/01|2',
    etapa: 'montagem',
    setups: {
      'G014|2023/01|2': { aprovadas: ['A1'], minimoConfirmados: [], planoAtivo: 'A', planos: { A: { NOR201: { turmaId: 'A' } } } }
    }
  };

  test('v1 é normalizado (planos ausentes viram vazios)', () => {
    const envelope = migrarEnvelope(v1);
    expect(envelope.ultimo).toBe('G014|2023/01|2');
    expect(envelope.setups['G014|2023/01|2'].planos).toEqual({ A: { NOR201: { turmaId: 'A' } }, B: {}, C: {} });
  });

  test('versão desconhecida, futura ou malformada é descartada', () => {
    expect(migrarEnvelope({ ...v1, v: 99 })).toBeNull();
    expect(migrarEnvelope({ ...v1, v: 0 })).toBeNull();
    expect(migrarEnvelope({ ...v1, v: '1' })).toBeNull();
    expect(migrarEnvelope([])).toBeNull();
    expect(migrarEnvelope(null)).toBeNull();
  });

  test('aplica os passos de migração até a versão atual', () => {
    const v0 = { v: 0, combinacao: 'G014|2023/01|2', aprovadas: ['A1'] };
    const migracoes = {
      0: antigo => ({
        v: 1,
        ultimo: antigo.combinacao,
        etapa: 'historico',
        setups: { [antigo.combinacao]: { aprovadas: antigo.aprovadas } }
      })
    };
    const envelope = migrarEnvelope(v0, { migracoes });
    expect(envelope.v).toBe(1);
    expect(envelope.etapa).toBe('historico');
    expect(envelope.setups['G014|2023/01|2'].aprovadas).toEqual(['A1']);
  });

  test('descarta combinações com chave inválida e "ultimo" que não existe', () => {
    const envelope = migrarEnvelope({ ...v1, ultimo: 'nada', setups: { ...v1.setups, 'quebrada': {} } });
    expect(Object.keys(envelope.setups)).toEqual(['G014|2023/01|2']);
    expect(envelope.ultimo).toBeNull();
  });
});

describe('storage', () => {
  test('grava e lê', () => {
    const storage = memoriaStorage();
    const envelope = migrarEnvelope({ v: 1, ultimo: null, etapa: null, setups: {} });
    expect(gravarEnvelope(storage, envelope)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).v).toBe(1);
    expect(lerEnvelope(storage)).toEqual(envelope);
  });

  test('sem storage, storage que lança ou JSON quebrado: envelope vazio, sem erro', () => {
    const quebrado = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); }
    };
    expect(lerEnvelope(null)).toEqual(envelopeVazio());
    expect(lerEnvelope(quebrado)).toEqual(envelopeVazio());
    expect(gravarEnvelope(quebrado, envelopeVazio())).toBe(false);
    expect(gravarEnvelope(null, envelopeVazio())).toBe(false);

    const storage = memoriaStorage();
    storage.setItem(STORAGE_KEY, '{nao é json');
    expect(lerEnvelope(storage)).toEqual(envelopeVazio());
  });
});
