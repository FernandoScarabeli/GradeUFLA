import {
  calcularTotalAposSelecao,
  excedeLimiteCreditos,
  formatarAula,
  formatarNomeProprio,
  findNextAnpHour,
  getDependentesAprovados,
  getDependentesCorequisito,
  getPendenciasPrerequisito,
  getPendenciasCorequisitosCalendario,
  horaExata,
  horariosConflitam,
  isAnpOnly,
  isTurmaSelecionavel,
  materiaComTurma,
  normalizarDia,
  normalizarHora,
  verificarConflitoMateria,
  verificarPreRequisitosDetalhada
} from './gradeRules';

describe('regras da grade', () => {
  test('mantém correquisito do mesmo semestre como pendente', () => {
    const materia = {
      codigo: 'GCC001',
      semestre: 3,
      preRequisitosDetalhada: { forte: [], minimo: [], coreq: ['GCC002'] }
    };
    const todas = [materia, { codigo: 'GCC002', semestre: 3 }];

    const resultado = verificarPreRequisitosDetalhada(materia, [], {}, todas);

    expect(resultado.faltandoCoreq).toEqual(['GCC002']);
    expect(resultado.cumprido).toBe(false);
  });

  test('considera correquisito satisfeito quando ele está na grade', () => {
    const materia = {
      codigo: 'GCC001',
      preRequisitosDetalhada: { forte: [], minimo: [], coreq: ['GCC002'] }
    };

    const resultado = verificarPreRequisitosDetalhada(
      materia,
      [],
      { GCC002: { codigo: 'GCC002' } }
    );

    expect(resultado.faltandoCoreq).toEqual([]);
    expect(resultado.cumprido).toBe(true);
  });

  test('só permite turma sem horário quando ela é ANP', () => {
    expect(isTurmaSelecionavel({ anp: false, horarios: [] })).toBe(false);
    expect(isTurmaSelecionavel({ anp: true, horarios: [] })).toBe(true);
    expect(isTurmaSelecionavel({ anp: false, horarios: [{ dia: 2, inicio: 8, fim: 10 }] })).toBe(true);
  });

  test('trocar a turma da mesma matéria não soma seus créditos duas vezes', () => {
    const grade = {
      GCC001: { codigo: 'GCC001', creditos: 4 },
      GCC002: { codigo: 'GCC002', creditos: 6 }
    };

    expect(calcularTotalAposSelecao(grade, { codigo: 'GCC001', creditos: 4 })).toBe(10);
  });

  test('normaliza dias e horas usados nas regras de conflito', () => {
    expect(normalizarDia('Sábado')).toBe(6);
    expect(normalizarDia('segunda-feira')).toBe(1);
    expect(normalizarDia(7)).toBe(6);
    expect(normalizarDia('dia inválido')).toBeNull();
    expect(normalizarHora('08:30')).toBe(8);
    expect(normalizarHora(10.75)).toBe(10);
    expect(normalizarHora('inválida')).toBeNull();
  });

  test('detecta somente sobreposição real no mesmo dia', () => {
    const segundaDeOitoAsDez = { dia: 'Segunda', inicio: '08:00', fim: '10:00' };

    expect(horariosConflitam(
      segundaDeOitoAsDez,
      { dia: 1, inicio: 9, fim: 11 }
    )).toBe(true);
    expect(horariosConflitam(
      segundaDeOitoAsDez,
      { dia: 1, inicio: 10, fim: 12 }
    )).toBe(false);
    expect(horariosConflitam(
      segundaDeOitoAsDez,
      { dia: 2, inicio: 9, fim: 11 }
    )).toBe(false);
  });

  test('ANP sem encontro presencial usa o próximo espaço de sábado', () => {
    const grade = {
      GCC001: { codigo: 'GCC001', anp: true, anpHour: 9 },
      GCC002: { codigo: 'GCC002', anp: true, anpHour: 10 }
    };

    expect(isAnpOnly({ anp: true, horarios: [] })).toBe(true);
    expect(findNextAnpHour(grade)).toBe(11);
    expect(findNextAnpHour(grade, { ignorarCodigo: 'GCC001' })).toBe(9);
  });

  test('informa conflito quando todos os espaços reservados para ANP estão ocupados', () => {
    const grade = Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => [
        `ANP${index}`,
        { codigo: `ANP${index}`, anp: true, anpHour: 9 + index }
      ])
    );

    expect(verificarConflitoMateria({ codigo: 'NOVA', anp: true, horarios: [] }, grade))
      .toEqual({
        temConflito: true,
        mensagem: 'Sem vagas ANP disponíveis no sábado'
      });
  });

  test('ANP híbrida conflita em seus encontros presenciais', () => {
    const grade = {
      GCC001: {
        codigo: 'GCC001',
        nome: 'Disciplina existente',
        horarios: [{ dia: 2, inicio: 8, fim: 10 }]
      }
    };
    const anpHibrida = {
      codigo: 'GCC002',
      anp: true,
      horarios: [{ dia: 'Terça', inicio: 9, fim: 11 }]
    };

    expect(isAnpOnly(anpHibrida)).toBe(false);
    expect(verificarConflitoMateria(anpHibrida, grade)).toMatchObject({
      temConflito: true,
      materiaConflito: 'Disciplina existente'
    });
  });

  test('troca de turma ignora a ocupação anterior da própria disciplina', () => {
    const grade = {
      GCC001: {
        codigo: 'GCC001',
        nome: 'Algoritmos',
        horarios: [{ dia: 1, inicio: 8, fim: 10 }]
      }
    };
    const novaTurma = {
      codigo: 'GCC001',
      horarios: [{ dia: 1, inicio: 9, fim: 11 }]
    };

    expect(verificarConflitoMateria(novaTurma, grade, { ignorarCodigo: 'GCC001' }))
      .toEqual({ temConflito: false });
  });

  test('encontra correquisito pendente e o remove da lista quando adicionado', () => {
    const materia = {
      codigo: 'GCC001',
      preRequisitosDetalhada: { coreq: ['GCC002'] }
    };

    expect(getPendenciasCorequisitosCalendario({ GCC001: materia }))
      .toEqual([{ materiaCodigo: 'GCC001', coreqCodigo: 'GCC002' }]);
    expect(getPendenciasCorequisitosCalendario({
      GCC001: materia,
      GCC002: { codigo: 'GCC002' }
    })).toEqual([]);
  });

  test('desmarcar uma matéria remove em cascata apenas dependentes por forte/mínimo', () => {
    const materias = [
      { codigo: 'GQI101', preRequisitosDetalhada: { forte: [], minimo: [], coreq: [] } },
      { codigo: 'GQI170', preRequisitosDetalhada: { forte: ['GQI101'], minimo: [], coreq: ['GQI171'] } },
      { codigo: 'GQI171', preRequisitosDetalhada: { forte: ['GQI101'], minimo: [], coreq: ['GQI170'] } },
      { codigo: 'GQI200', preRequisitosDetalhada: { forte: [], minimo: ['GQI170'], coreq: [] } }
    ];
    const aprovadas = ['GQI101', 'GQI170', 'GQI171', 'GQI200'];

    // Co-requisito não propaga: GQI171 continua aprovada
    expect([...getDependentesAprovados('GQI170', aprovadas, materias)].sort())
      .toEqual(['GQI170', 'GQI200']);
    // Forte propaga em cadeia
    expect([...getDependentesAprovados('GQI101', aprovadas, materias)].sort())
      .toEqual(['GQI101', 'GQI170', 'GQI171', 'GQI200']);
  });

  test('pendências de pré-requisito descontam as confirmações manuais', () => {
    const materia = {
      codigo: 'GCC010',
      preRequisitosDetalhada: { forte: ['GCC001'], minimo: ['GCC002'], coreq: ['GCC003'] }
    };

    const semConfirmacao = getPendenciasPrerequisito(materia);
    expect(semConfirmacao).toMatchObject({
      faltandoForte: ['GCC001'],
      faltandoMinimo: ['GCC002'],
      faltandoCoreq: ['GCC003'],
      podeAdicionar: false,
      todosCumpridos: false
    });

    const confirmado = getPendenciasPrerequisito(materia, {
      materiasAprovadas: ['GCC001'],
      prerequisitosConfirmados: ['GCC002'],
      materiasNoCalendario: { GCC003: { codigo: 'GCC003' } }
    });
    expect(confirmado).toMatchObject({ podeAdicionar: true, todosCumpridos: true });
  });

  test('limite de créditos considera a troca de turma da mesma matéria', () => {
    const grade = {
      GCC001: { codigo: 'GCC001', creditos: 4 },
      GCC002: { codigo: 'GCC002', creditos: 28 }
    };
    expect(excedeLimiteCreditos(grade, { codigo: 'GCC001', creditos: 4 })).toBe(false);
    expect(excedeLimiteCreditos(grade, { codigo: 'GCC003', creditos: 2 })).toBe(true);
  });
});

describe('getDependentesCorequisito', () => {
  const comCoreq = (codigo, coreq = []) => ({ codigo, preRequisitosDetalhada: { forte: [], minimo: [], coreq } });

  test('inclui a própria matéria e quem a tem como co-requisito, em cascata', () => {
    const calendario = {
      A: comCoreq('A'),
      B: comCoreq('B', ['A']),
      C: comCoreq('C', ['B']),
      D: comCoreq('D')
    };
    expect([...getDependentesCorequisito('A', calendario)].sort()).toEqual(['A', 'B', 'C']);
    expect([...getDependentesCorequisito('D', calendario)]).toEqual(['D']);
  });
});

describe('sala, professor e horário exato', () => {
  it('materiaComTurma leva o professor da turma', () => {
    const materia = { codigo: 'X', nome: 'X', turmas: [] };
    const turma = { id: 'A', professor: 'FULANO', horarios: [{ dia: 2, inicio: 8, fim: 10 }], anp: false };
    expect(materiaComTurma(materia, turma)).toMatchObject({ turmaId: 'A', professor: 'FULANO', horarios: turma.horarios, anp: false });
    expect(materiaComTurma(materia, { id: 'B' })).toMatchObject({ professor: null, horarios: [] });
  });

  it('horaExata prefere horaInicio/horaFim e cai para as horas cheias', () => {
    expect(horaExata({ inicio: 19, fim: 21, horaInicio: '19:00', horaFim: '20:40' })).toEqual({ inicio: '19:00', fim: '20:40' });
    expect(horaExata({ inicio: 8, fim: 10 })).toEqual({ inicio: '08:00', fim: '10:00' });
    expect(horaExata({ inicio: 7, fim: 10, horaInicio: '7:00', horaFim: '09:30' })).toEqual({ inicio: '07:00', fim: '09:30' });
  });

  it('formatarAula mostra o dia, o horário e a sala quando pedida', () => {
    const aula = { dia: 2, inicio: 19, fim: 21, horaInicio: '19:00', horaFim: '20:40', sala: 'PV6-06' };
    expect(formatarAula(aula)).toBe('Ter 19:00–20:40');
    expect(formatarAula(aula, { comSala: true })).toBe('Ter 19:00–20:40 · PV6-06');
    expect(formatarAula({ dia: 1, inicio: 8, fim: 10 }, { comSala: true })).toBe('Seg 08:00–10:00');
  });

  it('formatarNomeProprio deixa o nome do SIG legível', () => {
    expect(formatarNomeProprio('ALEXANDRE ALVES DE CARVALHO')).toBe('Alexandre Alves de Carvalho');
    expect(formatarNomeProprio('  JOÃO  DOS SANTOS E SILVA ')).toBe('João dos Santos e Silva');
    expect(formatarNomeProprio(null)).toBe('');
  });
});
