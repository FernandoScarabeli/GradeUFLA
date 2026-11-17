# Spec — Planos salvos, compartilhar, horários em comum, filtro por professor e "Monta pra mim"

> Escrita em 17/11/2026 no fim da sessão que entregou a exportação pro Google Agenda (PR #16) e sala/professor (PR #17).
> Público: a próxima sessão do Claude Code. Leia inteira antes de começar e confirme o plano com o usuário.
>
> **Situação em 17/11/2026:** F1 na `main` (PR #18). F2 e F4 na `dev`. **F3 (horários livres em comum) e F5 ("Monta pra mim") foram descartadas** pelo usuário e removidas do código; não retome. A F4 só aparece quando o CSV tiver professor (§7).

## 0. Contexto rápido

- Site: React 19 + Vite, estático no Netlify (`gradeufla.com.br`), **sem backend**. Dados em `public/data/{courses,subjects}.csv`.
- Fluxo: `INICIO → SETUP (curso, matriz, semestre) → HISTORICO (aprovadas) → MONTAGEM (grade)`. Desktop usa `Calendar/*`; celular usa `Mobile/*` (`useIsMobileFlow`).
- Estado central em `src/App.jsx`: `cursoSelecionado`, `matrizSelecionada`, `semestreAtual`, `materiasAprovadas[]`, `minimoConfirmados[]`, `materiasNoCalendario{codigo: entrada}`.
  - A entrada da grade é montada só por `materiaComTurma(materia, turma)` em `src/domain/gradeRules.js`. Ela leva `turmaId`, `professor`, `horarios`, `anp`, e para ANP o App ainda acrescenta `anpHour` e o horário de sábado.
- **Comportamento atual que esta spec muda:** ao recarregar, o site volta pra tela inicial e perde tudo. Está comentado em `App.jsx` ("Ao recarregar a página o fluxo sempre recomeça na tela inicial"). Sair da montagem (voltar pro setup ou histórico) também limpa a grade. Nada é salvo no navegador hoje, a não ser o id do calendário e o último período do Google Agenda.
- Botões atuais da grade:
  - desktop: `CalendarBoard` → `.calendar__actions` com "Google Agenda" e download PNG;
  - celular: cabeçalho do `MobileGrade` com ícone do Agenda e download.
- Regras do domínio (conflito, ANP, créditos, pré-requisitos) ficam em `src/domain/gradeRules.js`. **Reuse sempre, nunca duplique.**
- Ambiente e fluxo: veja a memória `gradeufla-dev-environment`.
  - npm 9 quebrado (use `npx -y npm@11`); o dev server roda na **porta 3000**.
  - Fluxo: branch → commits em português (conventional commits) → PR → CI verde → **perguntar antes do merge**.

## 1. Escopo e ordem

| # | Feature | Depende de | Prioridade |
|---|---|---|---|
| F1 | Salvar no navegador + Planos A/B/C | — | 1ª |
| F2 | Botão "Compartilhar" (menu com PNG, Google Agenda e link) + abrir grade por link | F1 (formato serializado) | 2ª |
| F3 | Horários livres em comum (comparar grades de amigos por link) | F2 | 3ª |
| F4 | Filtro e busca por professor | CSV novo do scraper (ver §7) | quando o CSV entrar |
| F5 | "Monta pra mim" (gerador de combinações) | — | **só desenho + protótipo**, validar com o usuário |

Faça **um PR por feature** (F1, F2, F3…), cada um com testes. Não junte tudo num PR só.

## 2. F1 — Salvar no navegador + Planos A/B/C

### Comportamento
- Ao recarregar, o aluno **volta pra onde estava**, com curso, matriz, semestre, aprovadas, confirmações e grade. Isso substitui a regra atual de "recomeçar". Atualize o comentário no `App.jsx`.
- Na montagem aparecem as abas **Plano A | Plano B | Plano C**:
  - cada plano tem uma grade (`materiasNoCalendario`) independente; curso, matriz, semestre e histórico são compartilhados entre os planos;
  - trocar de aba troca a grade na hora;
  - os botões de exportar e compartilhar agem sobre o plano ativo.
- Ação **"Duplicar este plano em…"**, pra copiar A → B e criar uma variação. E **"Limpar plano"**, com confirmação.
- Se o aluno trocar de curso, matriz ou semestre no setup, os planos dessa combinação **são guardados** (não apagados). Voltar pra mesma combinação recupera tudo. A chave é `curso|matriz|semestre`.
- Botão **"Começar do zero"** na tela inicial, quando houver dados salvos: "Continuar de onde parei" × "Começar do zero".

### Persistência
- `localStorage`, chave `gradeufla:v1`, com um envelope versionado:
  ```js
  {
    v: 1,
    ultimo: 'G014|2023/01|5',            // combinação ativa
    setups: {
      'G014|2023/01|5': {
        aprovadas: ['GCC101', ...],
        minimoConfirmados: [...],
        planoAtivo: 'A',
        planos: { A: Grade, B: Grade, C: Grade },
        atualizadoEm: '2026-11-20T12:00:00Z'
      }
    }
  }
  // Grade = { [codigo]: { turmaId, anpHour? } }   ← só referências, NUNCA o objeto inteiro
  ```
- **Salve só referências** (`codigo` + `turmaId` + `anpHour`) e **reidrate a partir do CSV** ao carregar (via `getMateriasPorSemestre`, `getEletivas` e `materiaComTurma`). Assim, quando o CSV é atualizado (sala ou professor novos), a grade salva já pega os dados novos.
- **Reidratação defensiva.** O CSV pode mudar entre visitas. Se uma matéria ou turma salva não existir mais, ou agora conflitar, ela fica de fora, e um toast/snackbar avisa: "2 matérias saíram da sua grade porque a turma não existe mais: X, Y". Nunca quebre a tela e nunca mostre "undefined".
- Todo acesso a `localStorage` vai em `try/catch` (aba anônima, cota cheia). Sem storage, o site funciona como hoje.
- Salve com debounce (~300 ms) num efeito que observa o estado. Centralize num hook `usePersistedSetup` (ou similar) em `src/hooks/`, com a serialização e a reidratação em funções puras testáveis em `src/domain/` ou `src/state/`.
- Não guarde dados pessoais além disso. A política de privacidade em `public/privacidade/index.html` diz que "nada é enviado pra gente". Isso continua verdade, mas **atualize o texto** pra dizer que a grade fica salva no próprio navegador.

### UI
- Desktop: abas acima da grade, perto do título "Minha Grade – Nº Semestre", seguindo o estilo existente (`Calendar.css`).
- Celular: segmentado A/B/C no topo do `MobileGrade`. **Atenção ao espaço:** o cabeçalho já está apertado em 360 px (título quebra em 2 linhas). Proposta: colocar A/B/C numa linha própria abaixo do cabeçalho, ou dentro do toggle Dia/Semana. Valide com screenshot em 360 px.
- Cada aba mostra os créditos do plano (ex.: "A · 24 cr").

### Testes
- Unidade: serializar/reidratar (inclusive turma removida do CSV, ANP com `anpHour`, storage indisponível) e migração de versão.
- e2e (desktop e celular): monta a grade, recarrega e ela continua lá; cria o Plano B diferente, alterna e cada um mantém a sua; troca de semestre e volta, e os planos estão lá.
- **Os e2e existentes assumem estado limpo.** Garanta isolamento: o Playwright usa um contexto novo por teste, mas confira se algum teste recarrega a página no meio do fluxo.

## 3. F2 — Botão "Compartilhar" + abrir grade por link

### Botão
Troque os dois botões soltos (Agenda e PNG) por **um botão "Compartilhar"**, que abre um menu (desktop) ou uma gaveta (celular, com o `BottomSheet` existente) com:
1. **Baixar imagem (PNG)**: o `useCalendarExport` atual.
2. **Exportar pro Google Agenda**: o `useGoogleCalendarExport` atual, que abre o modal de período.
3. **Copiar link da grade**: copia a URL (F2) e mostra o toast "Link copiado".
4. **Compartilhar…**: só aparece se `navigator.share` existir (celular). Usa a Web Share API com título, texto e URL.

Mantenha os `aria-label` "Exportar pro Google Agenda" e "Baixar PNG da grade" nos itens do menu, porque os e2e atuais os usam. Ou atualize os e2e.

### Formato do link
- Tudo vai na URL, sem servidor. Use o **fragmento** (`#g=...`) e não a query: o fragmento não vai pro servidor nem pros logs do Netlify, e o redirect do SPA não interfere.
- Conteúdo: `{ v:1, c: curso, m: matriz, s: semestre, p: termo (ACADEMIC_TERM), t: [[codigo, turmaId, anpHour?], ...] }`.
  - **Não inclua o histórico (aprovadas)**: é pessoal e deixaria o link enorme. Quem abre só vê a grade.
  - Serialize em JSON → comprima (opcional, sem dependência nova; `CompressionStream('deflate-raw')` existe nos navegadores atuais) → base64url. Meta: um link de grade típica com **menos de ~300 caracteres**. Teste com 10 matérias.
- Abrir um link `#g=`:
  - mostra a grade **em modo visualização** (somente leitura), com o aviso "Grade compartilhada de 2026/2";
  - botões: **"Usar como meu Plano X"** (importa pra um plano vazio, ou pergunta qual sobrescrever) e **"Comparar com a minha"** (F3);
  - se `p` ≠ `ACADEMIC_TERM` atual, avise "Essa grade é de outro período; algumas turmas podem não existir mais", com a mesma reidratação defensiva da F1;
  - link inválido ou corrompido: toast de erro e segue pra tela inicial normal. Nunca deixe a tela em branco.
- Depois de ler o fragmento, limpe a URL com `history.replaceState`, pra não reimportar ao recarregar.

### Testes
- Unidade: codificar e decodificar ida e volta; link corrompido; versão desconhecida; turma inexistente.
- e2e: monta a grade → "Copiar link" (use `context.grantPermissions(['clipboard-read','clipboard-write'])`) → abre em outra página → vê a grade somente leitura → "Usar como Plano B" → aparece no Plano B.

## 4. F3 — Horários livres em comum

- Entrada: a grade do usuário mais 1 a 3 grades vindas de links (colar link ou abrir `#g=` → "Comparar com a minha").
- Saída: a grade semanal (7h–23h, Seg–Sáb, mesma malha de horas do site) com:
  - **livre pra todos**: destaque verde;
  - ocupado: mostra **quem** ocupa (iniciais ou "Você", "Amigo 1"…);
  - um resumo em texto: "Livres juntos: Ter 14h–16h, Qui 16h–18h…".
- Nomes: o usuário pode dar apelido a cada link colado ("Ana", "João"). Fica só na memória da página, não persiste.
- Use horas cheias (`inicio`/`fim`), igual à grade. ANP no sábado conta como ocupado.
- Componente novo em `src/components/Comparar/` (desktop e celular). No celular, uma lista por dia é mais legível que a malha.
- Testes: a função pura de interseção (unidade) e um e2e com 2 links.

## 5. F4 — Filtro e busca por professor (quando o CSV novo entrar)

- Os CSVs gerados por `gerar_csv_site.py` (repositório do scraper, ver §7) trazem `turma.professor` (em MAIÚSCULAS; exiba com `formatarNomeProprio`).
- Desktop: no `CalendarSidebar` (filtros existentes, `materiaSeEncaixaNoFiltro`), acrescente "Professor" com autocomplete dos professores da matriz.
- Celular: na gaveta "Adicionar matéria", a busca (`casaBusca`) passa a casar também o nome do professor e mostra "Prof. X" no resultado.
- Na escolha da turma, destaque as turmas do professor filtrado.
- Sem professor no CSV (CSV antigo), o filtro não aparece.

## 6. F5 — "Monta pra mim" (só desenho e protótipo)

O usuário gostou, mas disse que "tem que ver como faz". Entregue **uma proposta curta, um protótipo da função pura e os números de desempenho**, e **pergunte antes** de construir a interface.

- Entrada: lista de matérias escolhidas (já liberadas por pré-requisito e créditos ≤ `CREDIT_MAX`) e preferências:
  - evitar manhã, tarde ou noite;
  - dias livres (ex.: sexta);
  - minimizar buracos entre aulas;
  - minimizar dias com aula;
  - turma ou professor preferido (depois da F4).
- Algoritmo sugerido: backtracking matéria a matéria (as com menos turmas primeiro), podando conflitos com `horariosConflitam`. ANP usa `findNextAnpHour`, como o App faz. Pontua cada grade completa pelas preferências e mantém o top N (ex.: 20).
- Limites: 8 matérias × 6 turmas dá até 6⁸ ≈ 1,7 mi de combinações, mas a poda corta muito. Meça com dados reais (`public/data/subjects.csv`, um curso grande). Se passar de ~200 ms, rode num Web Worker.
- Saída: cards "Opção 1, 2, 3…" com miniatura da semana (reaproveite `PreviaSemana` do celular) e **"Usar no Plano X"** (integra com a F1).
- Perguntas pro usuário antes de construir:
  - Quais preferências entram na v1?
  - Onde fica o botão?
  - Matérias obrigatórias vs. opcionais ("quero 5 dessas 8")?

## 7. Pendência paralela: CSV novo com sala e professor

- O SIG estava fora do ar em 17/11. **O usuário disse que ele volta na semana seguinte.** Quando voltar:
  1. Rode `./run.sh` em `~/Área de trabalho/Pessoal/ScrapperGradeUFLA` com o venv `.venv` já criado (`source .venv/bin/activate`). Leva uma hora ou mais; rode em segundo plano.
  2. O passo 4 gera `saida_site/{courses,subjects}.csv` + `RESUMO.txt`. Confira se o período é **2026/2** (ou o vigente) e se a cobertura de sala e professor está alta.
  3. Copie os dois CSVs pra `GradeUFLA/public/data/`, atualize `VITE_ACADEMIC_TERM` e `VITE_CSV_VERSION`/`VITE_DATA_UPDATED_AT` (em `.env.example`, nos defaults de `src/config/academicTerm.js` e `src/data/csvLoader.js`, e no Netlify se houver variável lá), rode lint, testes e e2e, e abra um PR.
- O site e o Agenda (PR #17) já usam `professor`, `sala` e `horaInicio`/`horaFim` quando eles existem. **Não precisa mudar código** pra isso.
- Detalhes do pipeline: memória `scraper-csv-pipeline`.

## 8. Fora do escopo

- Login, contas ou qualquer backend.
- Mudar a grade pra minutos (continua em horas cheias; o horário exato é só texto e Agenda).
- Mexer no fluxo OAuth do Google (verificação do app é com o usuário: Search Console, vídeo e envio na Central de verificação).

## 9. Critérios de pronto (por feature)

- Lint, `npm run test:ci`, build e `npx playwright test` verdes local e no CI.
- Testado em desktop 1440 px e celular 360 px (screenshot conferida).
- Sem regressão nos fluxos atuais: e2e existentes passando sem afrouxar asserções.
- Nada de "null", "undefined" ou "NaN" na tela com o CSV antigo e com o novo.
- PR com descrição em português; **perguntar antes do merge**.
