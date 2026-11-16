import {
  exportarParaGoogle, hojeEmLavras, lembrarPeriodo, montarEventos, parseData, sugerirPeriodo, validarPeriodo
} from './googleCalendar';

const semestre = { inicio: '2026-08-10', fim: '2026-12-11' };

describe('montarEventos', () => {
  it('cria um evento semanal por horário, começando no primeiro dia certo', () => {
    const eventos = montarEventos({
      GCC101: { nome: 'Grafos', turmaId: '10A', horarios: [{ dia: 2, inicio: 19, fim: 21 }, { dia: 4, inicio: 7, fim: 9 }] }
    }, semestre);

    expect(eventos).toHaveLength(2);
    // 10/08/2026 é segunda; terça (dia 2) é 11/08 e quinta (dia 4) é 13/08.
    expect(eventos[0]).toEqual({
      summary: 'Grafos',
      description: 'GCC101 · Turma 10A',
      start: { dateTime: '2026-08-11T19:00:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-08-11T21:00:00', timeZone: 'America/Sao_Paulo' },
      recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261212T030000Z']
    });
    expect(eventos[1].start.dateTime).toBe('2026-08-13T07:00:00');
  });

  it('a primeira aula é a do primeiro dia da semana certo dentro do período', () => {
    const [evento] = montarEventos(
      { GCC101: { nome: 'Grafos', horarios: [{ dia: 1, inicio: 8, fim: 10 }] } },
      { inicio: '2026-11-18', fim: '2026-12-11' }
    );
    expect(evento.start.dateTime).toBe('2026-11-23T08:00:00');
  });

  it('ignora o sábado inventado das ANP, mas mantém os horários reais', () => {
    const eventos = montarEventos({
      GCC200: {
        nome: 'Híbrida', anp: true, anpHour: 9,
        horarios: [{ dia: 3, inicio: 10, fim: 12 }, { dia: 6, inicio: 9, fim: 10 }]
      }
    }, semestre);
    expect(eventos.map(evento => evento.start.dateTime)).toEqual(['2026-08-12T10:00:00']);
  });

  it('descarta horários inválidos e repetidos', () => {
    const eventos = montarEventos({
      X: { nome: 'X', horarios: [{ dia: 2, inicio: 8, fim: 10 }, { dia: 2, inicio: 8, fim: 10 }, { dia: null, inicio: 8, fim: 9 }, { dia: 3, inicio: 10, fim: 9 }] }
    }, semestre);
    expect(eventos).toHaveLength(1);
  });

  it('pula a matéria cujo dia não cai no período e recusa período inválido', () => {
    // 14/12/2026 é segunda: terça não cabe.
    expect(montarEventos({ X: { nome: 'X', horarios: [{ dia: 2, inicio: 8, fim: 10 }] } },
      { inicio: '2026-12-14', fim: '2026-12-14' })).toEqual([]);
    expect(() => montarEventos({}, { inicio: '', fim: '2026-12-11' })).toThrow();
  });
});

describe('período', () => {
  beforeEach(() => window.localStorage.clear());

  it('valida datas vazias, invertidas e longas demais', () => {
    expect(validarPeriodo({ inicio: '', fim: '2026-12-11' })).toMatch(/duas datas/);
    expect(validarPeriodo({ inicio: '2026-12-11', fim: '2026-08-10' })).toMatch(/depois/);
    expect(validarPeriodo({ inicio: '2026-01-01', fim: '2027-06-01' })).toMatch(/1 ano/);
    expect(validarPeriodo(semestre)).toBeNull();
  });

  it('sugere hoje + 17 semanas, ou o último período se ainda não acabou', () => {
    const hoje = parseData('2026-11-16');
    expect(sugerirPeriodo(hoje)).toEqual({ inicio: '2026-11-16', fim: '2027-03-15' });
    lembrarPeriodo(semestre);
    expect(sugerirPeriodo(hoje)).toEqual(semestre);
    expect(sugerirPeriodo(parseData('2026-12-20'))).toEqual({ inicio: '2026-12-20', fim: '2027-04-18' });
  });
});

describe('hojeEmLavras', () => {
  it('usa a data de Lavras, não a UTC', () => {
    // 01:00 UTC do dia 17 ainda é dia 16 em Lavras.
    expect(hojeEmLavras(new Date('2026-11-17T01:00:00Z'))).toEqual(parseData('2026-11-16'));
  });
});

describe('exportarParaGoogle', () => {
  const resposta = (status, corpo = {}) => ({ ok: status < 400, status, json: async () => corpo });

  beforeEach(() => window.localStorage.clear());

  it('apaga o calendário anterior, cria um novo e envia os eventos', async () => {
    window.localStorage.setItem('gradeufla:googleCalendarId', 'antigo@group');
    const chamadas = [];
    const fetchImpl = vi.fn(async (url, opcoes) => {
      chamadas.push(`${opcoes.method} ${url.replace('https://www.googleapis.com/calendar/v3', '')}`);
      if (opcoes.method === 'DELETE') return resposta(204);
      if (url.endsWith('/calendars')) return resposta(200, { id: 'novo@group' });
      return resposta(200, { id: 'evento' });
    });

    const resultado = await exportarParaGoogle('tok', [{ summary: 'A' }, { summary: 'B' }], { titulo: 'Grade UFLA 2026/2', fetchImpl });

    expect(resultado).toEqual({ calendarId: 'novo@group', total: 2 });
    expect(chamadas).toEqual([
      'DELETE /calendars/antigo%40group',
      'POST /calendars',
      'POST /calendars/novo%40group/events',
      'POST /calendars/novo%40group/events'
    ]);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
    expect(window.localStorage.getItem('gradeufla:googleCalendarId')).toBe('novo@group');
  });

  it('segue em frente se o calendário anterior não existe mais', async () => {
    window.localStorage.setItem('gradeufla:googleCalendarId', 'sumiu');
    const fetchImpl = vi.fn(async (url, opcoes) => {
      if (opcoes.method === 'DELETE') return resposta(404);
      return resposta(200, { id: 'novo' });
    });
    await expect(exportarParaGoogle('tok', [], { titulo: 'T', fetchImpl })).resolves.toEqual({ calendarId: 'novo', total: 0 });
  });

  it('propaga erro da API com o status', async () => {
    const fetchImpl = vi.fn(async () => resposta(500));
    await expect(exportarParaGoogle('tok', [{}], { titulo: 'T', fetchImpl })).rejects.toMatchObject({ status: 500 });
  });
});
