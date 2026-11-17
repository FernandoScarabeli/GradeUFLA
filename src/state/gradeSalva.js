// Grade salva no navegador: envelope versionado no localStorage com os planos A/B/C de
// cada combinação curso|matriz|semestre. Só guarda referências (código, turma e hora ANP);
// o resto vem do CSV na hora de carregar, então sala e professor novos aparecem sozinhos.

import {
  ANP_END_HOUR,
  ANP_START_HOUR,
  comHorarioAnp,
  CREDIT_MAX,
  excedeLimiteCreditos,
  findNextAnpHour,
  isAnpTurma,
  isTurmaSelecionavel,
  materiaComTurma,
  verificarConflitoMateria
} from '../domain/gradeRules';

export const STORAGE_KEY = 'gradeufla:v1';
export const VERSAO = 1;
export const PLANOS = ['A', 'B', 'C'];
export const ETAPAS_SALVAS = ['historico', 'montagem'];

// Passos de migração por versão de origem, ex.: { 1: envelopeV1 => envelopeV2 }.
const MIGRACOES = {};

const isObjeto = valor => valor != null && typeof valor === 'object' && !Array.isArray(valor);
const listaDeCodigos = valor => (Array.isArray(valor)
  ? [...new Set(valor.filter(item => typeof item === 'string' && item))]
  : []);

export const chaveSetup = (curso, matriz, semestre) => `${curso}|${matriz}|${semestre}`;

/** "G014|2023/01|5" -> { curso: 'G014', matriz: '2023/01', semestre: 5 } (ou null se inválida). */
export function lerChave(chave) {
  const partes = String(chave ?? '').split('|');
  if (partes.length !== 3) return null;
  const [curso, matriz, textoSemestre] = partes;
  const semestre = Number(textoSemestre);
  if (!curso || !matriz || !Number.isInteger(semestre) || semestre < 1) return null;
  return { curso, matriz, semestre };
}

export const planosVazios = () => Object.fromEntries(PLANOS.map(id => [id, {}]));
export const envelopeVazio = () => ({ v: VERSAO, ultimo: null, etapa: null, setups: {} });

// ---------- serialização ----------

/** Grade da tela -> { [codigo]: { turmaId, anpHour? } }. */
export function serializarGrade(grade) {
  const saida = {};
  for (const [codigo, entrada] of Object.entries(grade || {})) {
    if (!entrada || entrada.turmaId == null) continue;
    saida[codigo] = isAnpTurma(entrada) && entrada.anpHour != null
      ? { turmaId: entrada.turmaId, anpHour: Number(entrada.anpHour) }
      : { turmaId: entrada.turmaId };
  }
  return saida;
}

export function serializarSetup({ aprovadas, minimoConfirmados, planoAtivo, planos }, agora = new Date()) {
  return {
    aprovadas: listaDeCodigos(aprovadas),
    minimoConfirmados: listaDeCodigos(minimoConfirmados),
    planoAtivo: PLANOS.includes(planoAtivo) ? planoAtivo : 'A',
    planos: Object.fromEntries(PLANOS.map(id => [id, serializarGrade(planos?.[id])])),
    atualizadoEm: agora.toISOString()
  };
}

/** Grava (no envelope em memória) o estado atual como a combinação ativa. */
export function registrarSetup(envelope, { curso, matriz, semestre, etapa, ...setup }, agora = new Date()) {
  const chave = chaveSetup(curso, matriz, semestre);
  return {
    ...envelope,
    ultimo: chave,
    etapa: ETAPAS_SALVAS.includes(etapa) ? etapa : envelope.etapa,
    setups: { ...envelope.setups, [chave]: serializarSetup(setup, agora) }
  };
}

// ---------- reidratação ----------

const horaAnpLivre = (grade, hora) => Number.isInteger(hora)
  && hora >= ANP_START_HOUR
  && hora <= ANP_END_HOUR
  && !Object.values(grade).some(entrada => isAnpTurma(entrada) && Number(entrada.anpHour) === hora);

/**
 * Remonta a grade a partir das referências salvas e do catálogo atual (Map codigo -> matéria).
 * O que não existe mais, ou que agora conflita, fica de fora e é listado em `removidas`.
 */
export function reidratarGrade(gradeSalva, catalogo) {
  const grade = {};
  const removidas = [];
  if (!isObjeto(gradeSalva)) return { grade, removidas };

  for (const [codigo, referencia] of Object.entries(gradeSalva)) {
    const materia = catalogo?.get(codigo);
    const remover = motivo => removidas.push({ codigo, nome: materia?.nome || null, motivo });

    const turma = isObjeto(referencia) && Array.isArray(materia?.turmas)
      ? materia.turmas.find(item => item && String(item.id) === String(referencia.turmaId))
      : null;
    if (!turma) { remover('turma'); continue; }

    let entrada = materiaComTurma(materia, turma);
    if (!isTurmaSelecionavel(entrada)) { remover('turma'); continue; }
    if (excedeLimiteCreditos(grade, entrada)) { remover('creditos'); continue; }
    if (verificarConflitoMateria(entrada, grade).temConflito) { remover('conflito'); continue; }

    if (isAnpTurma(entrada)) {
      const salva = Number(referencia.anpHour);
      const hora = horaAnpLivre(grade, salva) ? salva : findNextAnpHour(grade, { ignorarCodigo: codigo });
      if (hora == null) { remover('conflito'); continue; }
      entrada = comHorarioAnp(entrada, hora);
    }

    grade[codigo] = entrada;
  }

  return { grade, removidas };
}

/** Setup salvo -> estado do App, com as matérias descartadas de cada plano. */
export function reidratarSetup(setupSalvo, catalogo) {
  const planos = {};
  const removidas = {};
  PLANOS.forEach(id => {
    const resultado = reidratarGrade(setupSalvo?.planos?.[id], catalogo);
    planos[id] = resultado.grade;
    removidas[id] = resultado.removidas;
  });
  return {
    aprovadas: listaDeCodigos(setupSalvo?.aprovadas),
    minimoConfirmados: listaDeCodigos(setupSalvo?.minimoConfirmados),
    planoAtivo: PLANOS.includes(setupSalvo?.planoAtivo) ? setupSalvo.planoAtivo : 'A',
    planos,
    removidas
  };
}

const MOTIVOS = {
  turma: 'a turma não existe mais',
  conflito: 'agora conflita com outra matéria',
  creditos: `passaria de ${CREDIT_MAX} créditos`
};

/** Avisos legíveis sobre o que saiu de um plano, um por motivo. */
export function mensagensRemovidas(plano, removidas, nomeDe = codigo => codigo) {
  return Object.entries(MOTIVOS).flatMap(([motivo, texto]) => {
    const nomes = (removidas || [])
      .filter(item => item.motivo === motivo)
      .map(item => item.nome || nomeDe(item.codigo) || item.codigo);
    if (nomes.length === 0) return [];
    if (nomes.length === 1) return [`${nomes[0]} saiu do Plano ${plano} porque ${texto}.`];
    return [`${nomes.length} matérias saíram do Plano ${plano} porque ${texto}: ${nomes.join(', ')}.`];
  });
}

// ---------- envelope e armazenamento ----------

function normalizarSetup(setup) {
  if (!isObjeto(setup)) return null;
  const planos = isObjeto(setup.planos) ? setup.planos : {};
  return {
    aprovadas: listaDeCodigos(setup.aprovadas),
    minimoConfirmados: listaDeCodigos(setup.minimoConfirmados),
    planoAtivo: PLANOS.includes(setup.planoAtivo) ? setup.planoAtivo : 'A',
    planos: Object.fromEntries(PLANOS.map(id => [id, isObjeto(planos[id]) ? planos[id] : {}])),
    atualizadoEm: typeof setup.atualizadoEm === 'string' ? setup.atualizadoEm : null
  };
}

function normalizarEnvelope(bruto) {
  const setups = {};
  if (isObjeto(bruto.setups)) {
    for (const [chave, setup] of Object.entries(bruto.setups)) {
      const normalizado = lerChave(chave) && normalizarSetup(setup);
      if (normalizado) setups[chave] = normalizado;
    }
  }
  return {
    v: VERSAO,
    ultimo: setups[bruto.ultimo] ? bruto.ultimo : null,
    etapa: ETAPAS_SALVAS.includes(bruto.etapa) ? bruto.etapa : null,
    setups
  };
}

/** Leva um envelope antigo até a versão atual. Versão desconhecida ou malformado: null. */
export function migrarEnvelope(bruto, { versao = VERSAO, migracoes = MIGRACOES } = {}) {
  let atual = bruto;
  if (!isObjeto(atual) || !Number.isInteger(atual.v)) return null;
  while (atual.v < versao) {
    const passo = migracoes[atual.v];
    if (!passo) return null;
    atual = passo(atual);
    if (!isObjeto(atual) || !Number.isInteger(atual.v)) return null;
  }
  return atual.v === versao ? normalizarEnvelope(atual) : null;
}

/** localStorage, ou null quando o navegador não deixa usar (aba anônima, iframe, bloqueio). */
export function obterStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function lerEnvelope(storage) {
  try {
    const texto = storage?.getItem(STORAGE_KEY);
    if (!texto) return envelopeVazio();
    return migrarEnvelope(JSON.parse(texto)) || envelopeVazio();
  } catch {
    return envelopeVazio();
  }
}

export function gravarEnvelope(storage, envelope) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function apagarEnvelope(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Sem storage não há nada salvo pra apagar.
  }
}
