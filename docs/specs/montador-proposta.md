# F5 — "Monta pra mim": proposta, protótipo e números

> Escrita em 17/11/2026. Só desenho e protótipo, **sem interface**. Antes de construir a tela, preciso das respostas da §5.

## 1. O que o aluno faz

1. Na montagem, toca em **"Monta pra mim"**.
2. Escolhe as matérias (já vêm marcadas as obrigatórias do semestre que estão liberadas e cabem nos créditos) e diz quantas quer ("quero 5 dessas 8").
3. Liga as preferências: evitar manhã, tarde ou noite; dias livres; menos dias com aula; menos buracos entre aulas.
4. Recebe cards **"Opção 1, 2, 3…"** com a miniatura da semana (reaproveitando a `PreviaSemana` do celular) e o motivo da ordem ("3 dias com aula, 1h de buraco, nada à noite"). Em cada card há **"Usar no Plano A/B/C"** (integra com a F1, perguntando antes de substituir um plano com matérias).

## 2. Protótipo (`src/domain/montador.js`)

- `montarGrades(materias, preferencias, { quantidade, limite = 20, tempoMaxMs, maxNos })` → `{ opcoes: [{ grade, avaliacao }], stats }`.
- **Backtracking com branch and bound.**
  - Percorre matéria a matéria, das que têm menos turmas pras que têm mais, e dentro de cada matéria testa primeiro as turmas mais baratas.
  - O conflito é checado num conjunto de horas ocupadas, pré-calculado por turma. A regra é a mesma do `verificarConflitoMateria`/`buildCalendarOccupancy` (horas cheias, ANP no sábado à parte).
  - ANP pega a próxima hora livre com `findNextAnpHour` e entra na grade com `comHorarioAnp`, igual ao App.
  - As entradas da grade são montadas por `materiaComTurma`, então já saem prontas pra ir pra um plano.
- **Pontuação** (menor é melhor; os pesos ficam em `PESOS_PADRAO`):

  | Critério | Peso |
  |---|---|
  | hora num período evitado | 3 |
  | hora num dia que deveria ficar livre | 10 |
  | dia com aula (se "menos dias") | 4 |
  | hora vaga entre aulas (se "menos buracos") | 1 |

- **Poda.** O limite inferior de cada nó é o custo das horas já escolhidas, mais os dias já usados, mais o custo mínimo das matérias que ainda faltam. Buracos e a hora ANP só entram na pontuação exata da grade completa, porque podem melhorar ao acrescentar aulas.
- **Orçamento.** `tempoMaxMs`/`maxNos` interrompem a busca e devolvem o melhor achado até ali (`stats.interrompido`).
- **Testes** (`montador.test.js`): sem conflito, preferências, "k de n", créditos, ANP e igualdade com a força bruta num caso pequeno.

## 3. Números com o CSV real (`public/data/subjects.csv`)

Medidos em Node 22 nesta máquina. Pra rodar de novo: `MONTADOR_BENCH=1 npx vitest run src/domain/montador.perf.test.js`.

A entrada é o conjunto de obrigatórias (com turma no período) de cada semestre de cada curso e matriz: **1.120 semestres**.

| Cenário | Mediana | p95 | p99 | Máx. |
|---|---|---|---|---|
| Sem preferência | 0,03 ms | 0,15 ms | 0,9 ms | 17 ms |
| Sem noite + sexta livre + menos dias + menos buracos | 0,02 ms | 115 ms | 350 ms | 392 ms* |

\* Parado em 200 mil nós. Nos piores casos (2º semestre de cursos grandes, ex.: G003 2023/01 com 8 matérias e até 28 turmas cada), há centenas de milhares de grades válidas quase empatadas.

**Qualidade com orçamento de 300 ms**, comparada com uma busca de 5 milhões de nós (~9 s):

| Semestre | Melhor em 300 ms | Melhor em 5 mi nós |
|---|---|---|
| G003 2023/01, 2º | 52 | 51 |
| G033 2017/01, 2º | 27 | 26 |

A diferença é de 1 ponto, ou seja, 1 hora de buraco.

**Pior caso sintético:** as 8 matérias com mais turmas de um curso (28×25×22×22×17×17×16×14 ≈ 2,2 × 10¹⁰ combinações). Sem preferências, leva 0,2 ms, porque o conflito corta quase tudo. Com todas as preferências, para no orçamento.

**Conclusão:**
- Rodar num **Web Worker com orçamento de ~300 ms** e mostrar o resultado na hora.
- Quando `interrompido` for verdadeiro, avisar com discrição ("mostrando as melhores que achei") e oferecer **"Procurar mais"** (mais 1–2 s).
- Sem preferências, a função é instantânea e daria pra rodar até na thread principal.
- O worker não precisa de dependência nova: o Vite já faz `new Worker(new URL(...), { type: 'module' })`.

## 4. Riscos e limites

- **Opções quase iguais.** O top 20 pode trazer variações mínimas (só a turma de uma matéria muda). Proposta: deduplicar por "mesmos horários" e mostrar no máximo 5 cards.
- **Pré-requisitos e co-requisitos.** O montador só recebe matérias já liberadas (`getPendenciasPrerequisito`). Se uma escolhida tiver co-requisito, ele precisa estar na lista ou aprovado. A UI precisa avisar antes de rodar.
- **Turma ou professor preferido.** Depende da F4 (CSV com professor). Daria pra somar um bônus negativo na pontuação.
- **Os pesos são chute.** Valem ser ajustados com uso real.

## 5. Perguntas pra você antes de construir a tela

1. **Quais preferências entram na v1?** Sugestão: evitar período, dias livres e menos buracos. "Menos dias" pode entrar junto, porque é barato.
2. **Onde fica o botão?** Sugestão: desktop, acima das abas de plano, ao lado do "Compartilhar". Celular, um botão secundário no dock, junto de "Adicionar matéria", ou um item dentro da gaveta "Adicionar matéria".
3. **Obrigatórias vs. opcionais:**
   - (a) todas as escolhidas entram;
   - (b) "quero k dessas n";
   - (c) marcar algumas como obrigatórias e o resto como opcional.

   O protótipo já faz a (b). A (c) é uma extensão pequena.
4. **Onde o resultado vai:** no plano ativo ou sempre num plano vazio? E "Usar no Plano X" substitui ou só acrescenta ao que já está lá?
