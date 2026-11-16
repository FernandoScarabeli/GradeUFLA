import { normalizarDia, normalizarHora, SATURDAY_INDEX } from '../domain/gradeRules';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const TIME_ZONE = 'America/Sao_Paulo';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/calendar/v3';
const STORAGE_KEY = 'gradeufla:googleCalendarId';
const PERIODO_KEY = 'gradeufla:googleCalendarPeriodo';
const SEMANAS_PADRAO = 17;
const MAX_DIAS = 366;
const CONCORRENCIA = 4;

// ---------- datas (sempre como data "de calendário", sem fuso) ----------

const ISO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = valor => String(valor).padStart(2, '0');

export function parseData(valor) {
  const match = ISO_DATA.exec(String(valor || '').trim());
  if (!match) return null;
  const data = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(data.getTime()) ? null : data;
}

export const formatarData = data => `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}`;
const somarDias = (data, dias) => new Date(data.getTime() + dias * 86400000);

/** "Hoje" em Lavras, independente do fuso do navegador. */
export function hojeEmLavras(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(agora);
  return parseData(partes);
}

// ---------- período escolhido pelo aluno ----------

/** Último período usado (se ainda não acabou) ou hoje + ~1 semestre. */
export function sugerirPeriodo(hoje = hojeEmLavras()) {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(PERIODO_KEY) || 'null');
    const fim = parseData(salvo?.fim);
    if (parseData(salvo?.inicio) && fim && fim >= hoje) return { inicio: salvo.inicio, fim: salvo.fim };
  } catch { /* sem storage ou valor estranho: usa o padrão */ }
  return { inicio: formatarData(hoje), fim: formatarData(somarDias(hoje, SEMANAS_PADRAO * 7)) };
}

export function lembrarPeriodo(periodo) {
  try { window.localStorage.setItem(PERIODO_KEY, JSON.stringify(periodo)); } catch { /* opcional */ }
}

/** Mensagem de erro do período, ou null se estiver ok. */
export function validarPeriodo({ inicio, fim }) {
  const dataInicio = parseData(inicio);
  const dataFim = parseData(fim);
  if (!dataInicio || !dataFim) return 'Escolha as duas datas.';
  if (dataFim < dataInicio) return 'A data final precisa ser depois da inicial.';
  if ((dataFim - dataInicio) / 86400000 > MAX_DIAS) return 'Escolha um período de até 1 ano.';
  return null;
}

function primeiraOcorrencia(inicio, dia) {
  return somarDias(inicio, (dia - inicio.getUTCDay() + 7) % 7);
}

// ---------- montagem dos eventos ----------

/** O sábado das ANP é um horário que o site inventa para encaixar a matéria; não é aula. */
const isSlotAnp = (materia, horario, dia) => Boolean(materia?.anp)
  && dia === SATURDAY_INDEX
  && normalizarHora(horario?.inicio) === Number(materia.anpHour);

/** Transforma a grade em eventos semanais do Google Agenda, de `inicio` até `fim` (inclusive). */
export function montarEventos(materiasNoCalendario, periodo) {
  const erro = validarPeriodo(periodo);
  if (erro) throw new Error(erro);
  const inicio = parseData(periodo.inicio);
  const fim = parseData(periodo.fim);

  // UNTIL é em UTC: meia-noite do dia seguinte em Lavras (UTC-3) cobre a última aula da noite.
  const until = `${formatarData(somarDias(fim, 1)).replaceAll('-', '')}T030000Z`;
  const eventos = [];
  const vistos = new Set();

  for (const [codigo, materia] of Object.entries(materiasNoCalendario || {})) {
    const horarios = Array.isArray(materia?.horarios) ? materia.horarios : [];
    for (const horario of horarios) {
      const dia = normalizarDia(horario?.dia);
      const horaInicio = normalizarHora(horario?.inicio);
      const horaFim = normalizarHora(horario?.fim);
      if (dia == null || horaInicio == null || horaFim == null || horaFim <= horaInicio) continue;
      if (isSlotAnp(materia, horario, dia)) continue;

      const chave = `${codigo}|${dia}|${horaInicio}|${horaFim}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const data = primeiraOcorrencia(inicio, dia);
      if (data > fim) continue;
      const dataTexto = formatarData(data);

      eventos.push({
        summary: materia.nome || codigo,
        description: [codigo, materia.turmaId && `Turma ${materia.turmaId}`].filter(Boolean).join(' · '),
        start: { dateTime: `${dataTexto}T${pad(horaInicio)}:00:00`, timeZone: TIME_ZONE },
        end: { dateTime: `${dataTexto}T${pad(horaFim)}:00:00`, timeZone: TIME_ZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${until}`]
      });
    }
  }

  return eventos.sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime));
}

// ---------- login (Google Identity Services) ----------

let gisPromise = null;

/** Carrega o script de login do Google uma vez. Chame cedo para o popup abrir direto no clique. */
export function carregarGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sem navegador.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.oauth2
      ? resolve(window.google)
      : reject(new Error('Login do Google indisponível.')));
    script.onerror = () => reject(new Error('Não foi possível carregar o login do Google.'));
    document.head.appendChild(script);
  }).catch(erro => {
    gisPromise = null;
    throw erro;
  });
  return gisPromise;
}

export class GoogleCalendarError extends Error {
  constructor(message, { cancelado = false, status = null } = {}) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.cancelado = cancelado;
    this.status = status;
  }
}

export function pedirToken(google, clientId) {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: resposta => {
        if (resposta?.error || !resposta?.access_token) {
          reject(new GoogleCalendarError('O Google não liberou o acesso à agenda.', { cancelado: resposta?.error === 'access_denied' }));
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resposta, GOOGLE_CALENDAR_SCOPE)) {
          reject(new GoogleCalendarError('Para exportar, marque a permissão da agenda na tela do Google.', { cancelado: true }));
          return;
        }
        resolve(resposta.access_token);
      },
      error_callback: erro => {
        const cancelado = erro?.type === 'popup_closed';
        reject(new GoogleCalendarError(
          cancelado ? 'Login cancelado.' : 'O navegador bloqueou a janela de login do Google.',
          { cancelado }
        ));
      }
    });
    client.requestAccessToken();
  });
}

// ---------- API do Calendar ----------

async function chamarApi(token, caminho, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const resposta = await fetchImpl(`${API}${caminho}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resposta.ok) {
    throw new GoogleCalendarError(`Google Agenda respondeu ${resposta.status}.`, { status: resposta.status });
  }
  return resposta.status === 204 ? null : resposta.json();
}

const lerIdSalvo = () => {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
};
const salvarId = id => {
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* sem storage: só não reaproveita */ }
};

/**
 * Recria o calendário "Grade UFLA <período>" e coloca as aulas nele.
 * Apagar e recriar evita duplicar eventos quando o aluno exporta de novo.
 */
export async function exportarParaGoogle(token, eventos, { titulo, fetchImpl = fetch } = {}) {
  const opcoes = { fetchImpl };
  const anterior = lerIdSalvo();
  if (anterior) {
    try {
      await chamarApi(token, `/calendars/${encodeURIComponent(anterior)}`, { ...opcoes, method: 'DELETE' });
    } catch (erro) {
      // 404/403: já foi apagado ou é de outra conta Google. Segue criando um novo.
      if (![403, 404, 410].includes(erro.status)) throw erro;
    }
  }

  const calendario = await chamarApi(token, '/calendars', {
    ...opcoes,
    method: 'POST',
    body: { summary: titulo, description: 'Criado pelo gradeufla.com.br', timeZone: TIME_ZONE }
  });
  salvarId(calendario.id);

  const caminho = `/calendars/${encodeURIComponent(calendario.id)}/events`;
  const fila = [...eventos];
  const trabalhador = async () => {
    while (fila.length) {
      const evento = fila.shift();
      await chamarApi(token, caminho, { ...opcoes, method: 'POST', body: evento });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhador));

  return { calendarId: calendario.id, total: eventos.length };
}
