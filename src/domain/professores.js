// Professores das turmas (CSV novo do scraper). No CSV antigo não há professor:
// tudo aqui devolve vazio e a interface esconde o filtro.

import { formatarNomeProprio } from './gradeRules';

export const semAcento = valor => String(valor ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

/** "ANA SOUZA / JOÃO DA SILVA" -> ["Ana Souza", "João da Silva"]. */
export const nomesDoProfessor = professor => String(professor ?? '')
  .split(/\s*[;,/]\s*/)
  .map(formatarNomeProprio)
  .filter(Boolean);

/** Professores (formatados, sem repetição, em ordem alfabética) das turmas dessas matérias. */
export function professoresDasMaterias(materias) {
  const nomes = new Map();
  (materias || []).forEach(materia => (materia?.turmas || []).forEach(turma => {
    nomesDoProfessor(turma?.professor).forEach(nome => {
      const chave = semAcento(nome);
      if (!nomes.has(chave)) nomes.set(chave, nome);
    });
  }));
  return [...nomes.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Nome do professor da turma que casa com o termo (parte do nome, sem acento), ou null. */
export function professorQueCasa(turma, termo) {
  const busca = semAcento(termo);
  if (!busca) return null;
  return nomesDoProfessor(turma?.professor).find(nome => semAcento(nome).includes(busca)) || null;
}

export const turmaDoProfessor = (turma, termo) => professorQueCasa(turma, termo) !== null;

/** Primeiro professor da matéria que casa com o termo, ou null. */
export function professorDaMateriaQueCasa(materia, termo) {
  for (const turma of materia?.turmas || []) {
    const nome = professorQueCasa(turma, termo);
    if (nome) return nome;
  }
  return null;
}
