const path = require('path');
const { test, expect } = require('@playwright/test');
const { stubGoogleCalendar } = require('./googleStub');

const fixturesDir = path.join(__dirname, 'fixtures');

async function useAcademicFixtures(page) {
  await page.route('**/data/courses.csv*', route => route.fulfill({
    path: path.join(fixturesDir, 'courses.csv'),
    contentType: 'text/csv; charset=utf-8'
  }));
  await page.route('**/data/subjects.csv*', route => route.fulfill({
    path: path.join(fixturesDir, 'subjects.csv'),
    contentType: 'text/csv; charset=utf-8'
  }));
}

async function chooseOption(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName }).click();
}

async function completeFlow(page, { useFixtures = true, semester = '2º Módulo' } = {}) {
  if (useFixtures) await useAcademicFixtures(page);
  await page.goto('/');

  const startButton = page.getByRole('button', { name: 'Vamos lá' });
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await startButton.click();

  const course = page.getByRole('combobox', { name: 'Curso' });
  await course.fill('Sistemas de Informação');
  await page.getByRole('option', { name: /G014 - Sistemas de Informação/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await chooseOption(page, 'Matriz curricular', 'Matriz 2023/01');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await chooseOption(page, 'Semestre', semester);
  await page.getByRole('button', { name: 'Finalizar' }).click();

  await expect(page.getByRole('heading', { name: 'Matérias' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar para Montagem' }).click();
  await expect(page.getByRole('heading', { name: /Minha Grade/ })).toBeVisible();
}

async function openSubject(page, name) {
  await page.getByRole('button', { name: `Ver informações de ${name}` }).first().click();
  return page.getByRole('dialog', { name });
}

async function addSubject(page, name, turma) {
  const dialog = await openSubject(page, name);
  await dialog.getByRole('button', { name: new RegExp(`Turma ${turma}`) }).click();
  await dialog.getByRole('button', { name: 'Fechar detalhes da disciplina' }).click();
}

test.describe('fluxos críticos com dados controlados', () => {
  let chamadasGoogle;

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, 'O celular usa o fluxo próprio, coberto em mobile.spec.js.');
    // Antes de navegar: o script real do Google não pode chegar depois do falso.
    chamadasGoogle = await stubGoogleCalendar(page);
    await completeFlow(page);
  });

  test('adiciona turma normal e ANP, detecta conflito normal e híbrido e exporta PNG', async ({ page }) => {
    await addSubject(page, 'Programação Web', 'A');
    await expect(page.locator('.calendar__credits')).toContainText('4');

    for (const subject of ['Banco de Dados', 'Sistemas Híbridos']) {
      const dialog = await openSubject(page, subject);
      const turma = dialog.getByRole('button', { name: /Turma/ });
      await expect(turma).toHaveAttribute('aria-disabled', 'true');
      await expect(turma).toContainText(/Conflito com Programação Web/);
      await dialog.getByRole('button', { name: 'Fechar detalhes da disciplina' }).click();
    }

    await addSubject(page, 'Projeto Integrador ANP', 'ANP');
    await expect(page.locator('.calendar__credits')).toContainText('8');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await page.getByRole('button', { name: 'Baixar PNG da grade' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('grade-2semestre.png');
  });

  test('salva no navegador: recarrega, mantém um plano por aba e recupera ao trocar de semestre', async ({ page }) => {
    const creditos = page.locator('.calendar__credits');
    const aba = plano => page.getByRole('tab', { name: new RegExp(`^Plano ${plano},`) });

    await addSubject(page, 'Programação Web', 'A');
    await expect(creditos).toHaveText('Créditos: 4');

    await page.reload();
    await expect(page.getByRole('heading', { name: /Minha Grade - 2º Semestre/ })).toBeVisible({ timeout: 30_000 });
    await expect(creditos).toHaveText('Créditos: 4');
    await expect(aba('A')).toHaveAttribute('aria-selected', 'true');
    await expect(aba('A')).toHaveAccessibleName('Plano A, 4 créditos');

    await aba('B').click();
    await expect(creditos).toHaveText('Créditos: 0');
    await addSubject(page, 'Programação Web', 'B');
    await addSubject(page, 'Banco de Dados', 'A');
    await expect(creditos).toHaveText('Créditos: 8');

    await aba('A').click();
    await expect(creditos).toHaveText('Créditos: 4');
    await expect(page.locator('.calendar__legend')).toContainText('Programação Web - Turma A');

    // Outro semestre começa vazio; voltar pro 2º recupera os dois planos.
    await page.locator('.btn-voltar--calendar').click();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await chooseOption(page, 'Semestre', '1º Módulo');
    await page.getByRole('button', { name: 'Finalizar' }).click();
    await page.getByRole('button', { name: 'Continuar para Montagem' }).click();
    await expect(page.getByRole('heading', { name: /Minha Grade - 1º Semestre/ })).toBeVisible();
    await expect(creditos).toHaveText('Créditos: 0');

    await page.locator('.btn-voltar--calendar').click();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await chooseOption(page, 'Semestre', '2º Módulo');
    await page.getByRole('button', { name: 'Finalizar' }).click();
    await page.getByRole('button', { name: 'Continuar para Montagem' }).click();
    await expect(aba('A')).toHaveAccessibleName('Plano A, 4 créditos');
    await expect(aba('B')).toHaveAccessibleName('Plano B, 8 créditos');
  });

  test('duplica e limpa um plano', async ({ page }) => {
    const creditos = page.locator('.calendar__credits');
    await addSubject(page, 'Programação Web', 'A');

    await page.getByRole('button', { name: 'Opções do Plano A' }).click();
    await page.getByRole('button', { name: 'Duplicar em Plano B' }).click();
    await expect(page.getByRole('tab', { name: /^Plano B,/ })).toHaveAttribute('aria-selected', 'true');
    await expect(creditos).toHaveText('Créditos: 4');

    await page.getByRole('button', { name: 'Opções do Plano B' }).click();
    await page.getByRole('button', { name: 'Limpar Plano B' }).click();
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await expect(creditos).toHaveText('Créditos: 0');
    await expect(page.getByRole('tab', { name: /^Plano A,/ })).toHaveAccessibleName('Plano A, 4 créditos');
  });

  test('copia o link da grade, abre só pra ver e importa como Plano B', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await addSubject(page, 'Programação Web', 'A');
    await addSubject(page, 'Projeto Integrador ANP', 'ANP');

    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await page.getByRole('button', { name: 'Copiar link da grade' }).click();
    await expect(page.getByText('Link copiado.')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#g=[jz][A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(300);

    const outra = await context.newPage();
    await useAcademicFixtures(outra);
    await outra.goto(link);
    await expect(outra.getByText('Grade compartilhada de 2026/2')).toBeVisible({ timeout: 30_000 });
    await expect(outra.getByRole('heading', { name: /2º semestre · Sistemas de Informação/ })).toBeVisible();
    await expect(outra.getByRole('listitem', { name: /Programação Web, segunda das 8h às 10h, turma A/ })).toBeVisible();
    // A URL é limpa: recarregar não reimporta.
    expect(new URL(outra.url()).hash).toBe('');

    await outra.getByRole('button', { name: 'Usar como meu plano…' }).click();
    await outra.getByRole('button', { name: 'Usar como meu Plano B (vazio)' }).click();
    await expect(outra.getByRole('tab', { name: /^Plano B,/ })).toHaveAttribute('aria-selected', 'true');
    await expect(outra.getByRole('tab', { name: /^Plano B,/ })).toHaveAccessibleName('Plano B, 8 créditos');
    await expect(outra.getByRole('tab', { name: /^Plano A,/ })).toHaveAccessibleName('Plano A, 8 créditos');
  });

  test('bloqueia seleção acima do limite de 32 créditos', async ({ page }) => {
    await addSubject(page, 'Projeto de 20 Créditos', 'A');
    await addSubject(page, 'Projeto de 12 Créditos', 'A');
    await expect(page.locator('.calendar__credits')).toContainText('32');

    const dialog = await openSubject(page, 'Projeto Excedente');
    await dialog.getByRole('button', { name: /Turma A/ }).click();

    await expect(page.getByText(/excederia o limite de 32 créditos/i)).toBeVisible();
    await expect(page.locator('.calendar__credits')).toContainText('32');
  });

  test('mantém o card visível acompanhando o ponteiro durante o drag', async ({ page }) => {
    const card = page.locator('.materia-card', { hasText: 'Programação Web' });
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();

    const start = {
      x: cardBox.x + cardBox.width / 2,
      y: cardBox.y + cardBox.height / 2
    };
    const target = { x: start.x + 180, y: start.y + 120 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 3 });

    const ghost = page.locator('.drag-ghost');
    await expect(ghost).toBeVisible();
    await expect(ghost).toContainText('Programação Web');

    const ghostBox = await ghost.boundingBox();
    expect(ghostBox).not.toBeNull();
    expect(Math.abs(ghostBox.x - (target.x - 80))).toBeLessThan(4);
    expect(Math.abs(ghostBox.y - (target.y - 25))).toBeLessThan(4);

    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
  });

  test('exporta a grade pro Google Agenda no período escolhido', async ({ page }) => {
    const chamadas = chamadasGoogle;
    const detalhes = await openSubject(page, 'Programação Web');
    const turmaA = detalhes.getByRole('button', { name: /Turma A/ });
    await expect(turmaA).toContainText('Alexandre Alves de Carvalho');
    await expect(turmaA).toContainText('Seg 08:00–09:40 · PV1-101');
    await detalhes.getByRole('button', { name: 'Fechar detalhes da disciplina' }).click();
    await addSubject(page, 'Programação Web', 'A');
    await expect(page.locator('.calendar__legend')).toContainText('Turma A · Alexandre Alves de Carvalho');

    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await page.getByRole('button', { name: 'Exportar pro Google Agenda' }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar pro Google Agenda' });
    await dialog.getByLabel('De').fill('2026-08-10');
    await dialog.getByLabel('Até').fill('2026-08-01');
    await dialog.getByRole('button', { name: 'Entrar com Google e exportar' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(/depois da inicial/);

    await dialog.getByLabel('Até').fill('2026-12-11');
    await dialog.getByRole('button', { name: 'Entrar com Google e exportar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/Sua grade está no Google Agenda/)).toBeVisible();

    expect(chamadas.map(({ method, url }) => `${method} ${new URL(url).pathname}`)).toEqual([
      'POST /calendar/v3/calendars',
      'POST /calendar/v3/calendars/grade%40group.calendar.google.com/events'
    ]);
    expect(chamadas[1].body).toMatchObject({
      summary: 'Programação Web',
      location: 'PV1-101',
      description: 'NOR201 · Turma A\nProfessor(a): Alexandre Alves de Carvalho',
      start: { dateTime: '2026-08-10T08:00:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-08-10T09:40:00', timeZone: 'America/Sao_Paulo' },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T030000Z'],
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }
    });
  });
});

test('permite concluir o fluxo principal somente com teclado', async ({ page, isMobile }) => {
  test.skip(isMobile, 'O celular usa o fluxo próprio, coberto em mobile.spec.js.');
  await useAcademicFixtures(page);
  await page.goto('/');

  const startButton = page.getByRole('button', { name: 'Vamos lá' });
  await expect(startButton).toBeEnabled();
  await startButton.focus();
  await page.keyboard.press('Enter');

  const course = page.getByRole('combobox', { name: 'Curso' });
  await course.focus();
  await page.keyboard.type('Sistemas');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Continuar' }).focus();
  await page.keyboard.press('Enter');

  const matrix = page.getByRole('combobox', { name: 'Matriz curricular' });
  await matrix.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Continuar' }).focus();
  await page.keyboard.press('Enter');

  const semester = page.getByRole('combobox', { name: 'Semestre' });
  await semester.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Finalizar' }).focus();
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Continuar para Montagem' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Minha Grade - 2º Semestre' })).toBeVisible();
});

test('carrega o fluxo real de Sistemas de Informação 2023', async ({ page, isMobile }) => {
  test.skip(isMobile, 'O celular usa o fluxo próprio, coberto em mobile.spec.js.');
  test.slow();
  await completeFlow(page, { useFixtures: false, semester: '1º Módulo' });
  await expect(page.getByText('Matérias Disponíveis')).toBeVisible();
});

test('desativa partículas e rotação de texto com reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useAcademicFixtures(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Vamos lá' })).toBeEnabled();
  await expect(page.locator('.particles-container canvas')).toHaveCount(0);
  await expect(page.locator('.text-rotate')).toContainText('prática');

  await page.waitForTimeout(2_200);
  await expect(page.locator('.text-rotate')).toContainText('prática');
});
