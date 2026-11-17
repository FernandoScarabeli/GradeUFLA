<p align="center">
  <img src="public/calendarioLogo.png" alt="Logo do GradeUFLA" width="96" />
</p>

<h1 align="center">GradeUFLA</h1>

<p align="center">
  Monte sua grade horária da UFLA sem conflitos, respeitando pré-requisitos e o limite de créditos.
  <br />
  <a href="https://gradeufla.com.br"><strong>gradeufla.com.br</strong></a>
</p>

---

## Como funciona

1. Escolha seu **curso**, a **matriz curricular** e o **semestre** em que você está.
2. Revise o **histórico**: as matérias dos semestres anteriores já vêm marcadas, então é só desmarcar as que você ainda não fez.
3. **Monte a grade** arrastando as matérias para o calendário (no celular, toque na matéria e escolha a turma).
4. **Baixe a grade** em PNG.

Durante a montagem o GradeUFLA:

- bloqueia matérias com **pré-requisito forte** pendente e pede confirmação para **pré-requisito mínimo**;
- avisa sobre **co-requisitos** que precisam ser cursados junto;
- impede **conflitos de horário** e a inclusão acima de **32 créditos**;
- distribui turmas **ANP** nos horários livres de sábado;
- filtra matérias por dia, horário, modalidade e créditos;
- inclui matérias **pendentes**, **eletivas** e **futuras**.

Também funciona só com o teclado, tem diálogos acessíveis e respeita a preferência do sistema por menos animações.

> Os dados são públicos, extraídos do SIG/UFLA, e podem ficar desatualizados entre uma atualização e outra.
> Confira sempre as turmas no sistema oficial antes da matrícula.

---

## Desenvolvimento

O GradeUFLA é um app **React 19 + Vite** sem backend: cursos, disciplinas, pré-requisitos e turmas vêm de arquivos CSV publicados junto com o site.

**Requisitos:** Node.js `22.12+` (o CI e o site usam o Node 24, definido em `.nvmrc`).

```bash
npm ci
npm start          # http://127.0.0.1:3000
```

| Comando | O que faz |
| --- | --- |
| `npm start` | Servidor de desenvolvimento |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm test` | Vitest em modo watch |
| `npm run test:ci` | Vitest em execução única |
| `npm run e2e:install` | Instala o Chromium do Playwright (uma vez) |
| `npm run e2e` | Testes end-to-end (desktop e mobile) |

O GitHub Actions roda lint, testes, build e E2E em todo push na `main` e em pull requests.

### Estrutura

```text
src/
├── App.jsx               fluxo das etapas e estado principal
├── domain/gradeRules.js  regras acadêmicas (pré-requisitos, conflitos, créditos, ANP)
├── data/                 carregamento, validação e indexação dos CSVs
├── components/           interface (Setup, Histórico, Calendário, modais...)
├── hooks/                hooks compartilhados
└── config/               período letivo e data de atualização dos dados
public/data/              CSVs publicados com o site
e2e/                      testes Playwright e CSVs de fixture
```

As regras acadêmicas ficam todas em `src/domain/gradeRules.js`, e os componentes só as consomem. Se uma regra mudar, é lá que ela deve ser alterada (e testada em `gradeRules.test.js`).

---

## Dados acadêmicos

Os dados ficam em `public/data/courses.csv` e `public/data/subjects.csv`. Eles são gerados por um scraper do SIG/UFLA mantido fora deste repositório.

### `courses.csv`

| Coluna | Descrição | Exemplo |
| --- | --- | --- |
| `curso_id` | Identificador do curso | `G014` |
| `nome` | Nome do curso | `Sistemas de Informação` |
| `matriz` | Ano e período da matriz | `2023/01` |

Cada curso aparece uma vez para cada matriz disponível.

### `subjects.csv`

| Coluna | Descrição |
| --- | --- |
| `curso` | Identificador do curso |
| `matriz` | Matriz curricular |
| `semestre` | Módulo recomendado |
| `codigo` | Código da disciplina |
| `nome` | Nome da disciplina |
| `creditos` | Quantidade de créditos |
| `tipo` | `obrigatoria` ou `eletiva` |
| `subgrupo` | Agrupamento opcional de eletivas |
| `preRequisitos` | Ex.: `Forte: GCC101; Minimo: GMM116; Corequisito: GQI171` |
| `turmas` | Array JSON de turmas (veja abaixo) |

```json
[
  {
    "id": "10A",
    "horarios": [{ "dia": 2, "inicio": 8, "fim": 10 }],
    "anp": false
  }
]
```

`dia` segue a convenção do SIG (`1` = domingo, `2` = segunda ... `7` = sábado), e `inicio`/`fim` são horas cheias. O carregador rejeita CSVs malformados, campos obrigatórios vazios e JSON inválido em `turmas`, e o erro aparece na tela inicial com opção de tentar de novo.

### Atualizando os dados

1. Substitua o CSV em `public/data/`.
2. Atualize os valores em `.env.example` e os padrões em `src/config/academicTerm.js` e `src/data/csvLoader.js`:
   - `VITE_CSV_VERSION`: a data da nova versão, para os navegadores não usarem o CSV antigo em cache;
   - `VITE_DATA_UPDATED_AT`: a data exibida no rodapé;
   - `VITE_ACADEMIC_TERM`: o período letivo, quando mudar.
3. Rode `npm run test:ci` e abra o app para conferir.

Variáveis `VITE_*` ficam públicas no bundle. Nunca coloque segredos nelas.

---

## Licença

[MIT](LICENSE) © Fernando Scarabeli
