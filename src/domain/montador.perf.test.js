// @vitest-environment node
// Medição do protótipo do "Monta pra mim" com o CSV real. Não roda no CI:
//   MONTADOR_BENCH=1 npx vitest run src/domain/montador.perf.test.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadMaterias } from '../data/csvLoader';
import { isTurmaSelecionavel } from './gradeRules';
import { montarGrades } from './montador';

const PREFERENCIAS = {
  'sem preferência': {},
  'sem noite + sexta livre + menos dias + menos buracos': {
    evitar: ['noite'], diasLivres: [5], menosDias: true, menosBuracos: true
  }
};

const medir = (materias, preferencias, opcoes) => {
  const inicio = performance.now();
  const resultado = montarGrades(materias, preferencias, opcoes);
  return { ms: performance.now() - inicio, ...resultado.stats, opcoes: resultado.opcoes.length };
};

describe.skipIf(!process.env.MONTADOR_BENCH)('montador com dados reais', () => {
  test('todas as combinações curso/matriz/semestre e um pior caso', async () => {
    const raiz = join(process.cwd(), 'public');
    globalThis.fetch = async url => {
      const caminho = join(raiz, String(url).split('?')[0]);
      try {
        const texto = readFileSync(caminho, 'utf8');
        return { ok: true, status: 200, text: async () => texto };
      } catch {
        return { ok: false, status: 404, text: async () => '' };
      }
    };
    const materias = await loadMaterias();

    // Obrigatórias de cada semestre de cada curso/matriz, só com turma no período.
    const grupos = new Map();
    for (const materia of materias) {
      if (materia.tipo === 'eletiva') continue;
      const turmas = (materia.turmas || []).filter(isTurmaSelecionavel);
      if (turmas.length === 0) continue;
      const chave = `${materia.curso}|${materia.matriz}|${materia.semestre}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(materia);
    }

    const linhas = [];
    for (const [nome, preferencias] of Object.entries(PREFERENCIAS)) {
      const tempos = [];
      for (const [chave, grupo] of grupos) {
        tempos.push({ chave, grupo, materias: grupo.length, ...medir(grupo, preferencias, { maxNos: 200_000 }) });
      }
      tempos.sort((a, b) => b.ms - a.ms);
      const ms = tempos.map(item => item.ms).sort((a, b) => a - b);
      const p = q => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))].toFixed(2);
      const acima = limiteMs => tempos.filter(item => item.ms > limiteMs).length;
      linhas.push(`\n== ${nome}: ${tempos.length} semestres | mediana ${p(0.5)} ms | p95 ${p(0.95)} ms | p99 ${p(0.99)} ms | máx ${ms.at(-1).toFixed(1)} ms | >200 ms: ${acima(200)} | interrompidos (200 mil nós): ${tempos.filter(item => item.interrompido).length}`);
      tempos.slice(0, 5).forEach(item => linhas.push(
        `   ${item.chave}: ${item.materias} matérias, ${item.ms.toFixed(1)} ms, ${item.nos} nós, ${item.completas} completas, ${item.podadas} podas${item.interrompido ? ' (INTERROMPIDO)' : ''}`
      ));
      // Qualidade com orçamento: 300 ms contra uma busca 25× maior.
      for (const item of tempos.slice(0, 3)) {
        const curto = montarGrades(item.grupo, preferencias, { tempoMaxMs: 300 });
        const longo = montarGrades(item.grupo, preferencias, { maxNos: 5_000_000 });
        linhas.push(`   orçamento ${item.chave}: 300 ms -> melhor ${curto.opcoes[0]?.avaliacao.pontos} (${curto.stats.nos} nós) | 5 mi nós (${longo.stats.ms.toFixed(0)} ms${longo.stats.interrompido ? ', interrompido' : ', completo'}) -> melhor ${longo.opcoes[0]?.avaliacao.pontos}`);
      }
    }

    // Pior caso: as 8 matérias com mais turmas de um mesmo curso/matriz ("quero 6 dessas 8").
    let pior = null;
    for (const grupo of [...grupos.values()]) {
      const curso = grupo[0];
      const doCurso = materias.filter(materia => materia.curso === curso.curso && materia.matriz === curso.matriz
        && (materia.turmas || []).filter(isTurmaSelecionavel).length > 0);
      const top = doCurso
        .slice()
        .sort((a, b) => b.turmas.length - a.turmas.length)
        .slice(0, 8);
      const produto = top.reduce((total, materia) => total * materia.turmas.length, 1);
      if (!pior || produto > pior.produto) pior = { chave: `${curso.curso}|${curso.matriz}`, top, produto };
    }
    for (const [nome, preferencias] of Object.entries(PREFERENCIAS)) {
      for (const quantidade of [8, 6]) {
        const r = medir(pior.top, preferencias, { quantidade });
        linhas.push(`\n== pior caso ${pior.chave} (8 matérias, ${pior.top.map(m => m.turmas.length).join('×')} turmas = ${pior.produto} combinações), ${quantidade} de 8, ${nome}: ${r.ms.toFixed(1)} ms, ${r.nos} nós, ${r.completas} completas, ${r.podadas} podas${r.interrompido ? ' (INTERROMPIDO)' : ''}`);
      }
    }

    console.log(linhas.join('\n'));
  }, 600_000);
});
