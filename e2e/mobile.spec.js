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

async function completeMobileFlow(page, { useFixtures = true, semester = 2 } = {}) {
  if (useFixtures) await useAcademicFixtures(page);
  await page.goto('/');

  const startButton = page.getByRole('button', { name: 'Vamos lá' });
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await startButton.click();

  await page.getByRole('searchbox', { name: 'Buscar curso' }).fill('sistemas de informacao');
  await page.getByRole('radio', { name: /Sistemas de Informação/ }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();

  // A matriz mais recente já vem escolhida.
  await expect(page.getByRole('radio', { name: /Matriz 2023\/01/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Próximo' }).click();

  await page.getByRole('radio', { name: `${semester}º semestre` }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  if (semester > 1) {
    await expect(page.getByRole('heading', { name: 'O que você já cursou?' })).toBeVisible();
    await page.getByRole('button', { name: 'Montar minha grade' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Minha grade' })).toBeVisible();
}

const credits = page => page.getByRole('img', { name: /de 32 créditos/ });

async function openTurmas(page, subject) {
  await page.getByRole('button', { name: 'Adicionar matéria' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar matéria' });
  await sheet.getByRole('button', { name: new RegExp(subject) }).click();
  const turmas = page.getByRole('dialog', { name: subject });
  await expect(turmas).toBeVisible();
  return turmas;
}

async function addSubject(page, subject, turma) {
  const sheet = await openTurmas(page, subject);
  await sheet.getByRole('radio', { name: new RegExp(`Turma ${turma}`) }).click();
  await sheet.getByRole('button', { name: new RegExp(`Adicionar turma ${turma}`) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('fluxo mobile com dados controlados', () => {
  let chamadasGoogle;

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Fluxo exclusivo do celular.');
    // Antes de navegar: o script real do Google não pode chegar depois do falso.
    chamadasGoogle = await stubGoogleCalendar(page);
    await completeMobileFlow(page);
  });

  test('adiciona turma normal e ANP, mostra conflitos e exporta PNG', async ({ page }) => {
    await addSubject(page, 'Programação Web', 'A');
    await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');
    await expect(page.getByRole('status').filter({ hasText: 'Programação Web adicionada' })).toBeVisible();
    // A grade pula para o dia da aula recém-adicionada.
    await expect(page.getByRole('tab', { name: /segunda/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Aulas de segunda' }).getByRole('button', { name: /Programação Web/ })).toBeVisible();

    for (const subject of ['Banco de Dados', 'Sistemas Híbridos']) {
      const sheet = await openTurmas(page, subject);
      const turma = sheet.getByRole('radio', { name: /Turma/ });
      await expect(turma).toBeDisabled();
      await expect(turma).toContainText(/Choca com Programação Web/);
      await sheet.getByRole('button', { name: 'Fechar' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    await addSubject(page, 'Projeto Integrador ANP', 'ANP');
    await expect(credits(page)).toHaveAccessibleName('8 de 32 créditos');
    await expect(page.getByRole('tab', { name: /sábado/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByText('ANP', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Semana' }).click();
    await expect(page.getByRole('button', { name: /Projeto Integrador ANP, sábado/ })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await page.getByRole('button', { name: 'Baixar imagem da grade' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('grade-2semestre.png');
  });

  test('busca por professor e destaca a turma dele', async ({ page }) => {
    await page.getByRole('button', { name: 'Adicionar matéria' }).click();
    const sheet = page.getByRole('dialog', { name: 'Adicionar matéria' });
    await sheet.getByRole('searchbox', { name: 'Buscar matéria' }).fill('alexandre');
    const resultado = sheet.getByRole('button', { name: /Programação Web/ });
    await expect(resultado).toContainText('Prof. Alexandre Alves de Carvalho');
    await expect(sheet.getByRole('button', { name: /Banco de Dados/ })).toHaveCount(0);

    await resultado.click();
    const turmas = page.getByRole('dialog', { name: 'Programação Web' });
    await expect(turmas.getByRole('radio', { name: /Turma A/ })).toContainText('professor buscado');
    await expect(turmas.getByRole('radio', { name: /Turma B/ })).not.toContainText('professor buscado');
  });

  test('não deixa passar de 32 créditos', async ({ page }) => {
    await addSubject(page, 'Projeto de 20 Créditos', 'A');
    await addSubject(page, 'Projeto de 12 Créditos', 'A');
    await expect(credits(page)).toHaveAccessibleName('32 de 32 créditos');

    const sheet = await openTurmas(page, 'Projeto Excedente');
    await sheet.getByRole('radio', { name: /Turma A/ }).click();
    await expect(sheet.getByText(/Passaria de 32 créditos/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Adicionar turma A/ })).toBeDisabled();
  });

  test('remove pela gaveta de detalhes e desfaz', async ({ page }) => {
    await addSubject(page, 'Programação Web', 'A');
    await page.getByRole('tabpanel').getByRole('button', { name: /Programação Web/ }).click();

    const detail = page.getByRole('dialog', { name: 'Programação Web' });
    await expect(detail.getByText('Turma A')).toBeVisible();
    await detail.getByRole('button', { name: 'Remover' }).click();
    await expect(credits(page)).toHaveAccessibleName('0 de 32 créditos');

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');
  });

  test('troca a turma sem perder a cor nem a posição', async ({ page }) => {
    await addSubject(page, 'Programação Web', 'A');
    await page.getByRole('tabpanel').getByRole('button', { name: /Programação Web/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Trocar turma' }).click();

    const sheet = page.getByRole('dialog', { name: 'Programação Web' });
    await expect(sheet.getByRole('radio', { name: /Turma A/ })).toContainText('Na sua grade');
    await sheet.getByRole('radio', { name: /Turma B/ }).click();
    await sheet.getByRole('button', { name: 'Trocar para turma B' }).click();

    await expect(page.getByRole('tab', { name: /quarta/ })).toHaveAttribute('aria-selected', 'true');
    await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');
  });

  test('o botão voltar do aparelho fecha a gaveta sem sair da grade', async ({ page }) => {
    await addSubject(page, 'Programação Web', 'A');
    await page.getByRole('button', { name: 'Adicionar matéria' }).click();
    await expect(page.getByRole('dialog', { name: 'Adicionar matéria' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Minha grade' })).toBeVisible();
    await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');
  });

  test('exporta a grade pro Google Agenda pela gaveta', async ({ page }) => {
    const chamadas = chamadasGoogle;
    const turmas = await openTurmas(page, 'Programação Web');
    const turmaA = turmas.getByRole('radio', { name: /Turma A/ });
    await expect(turmaA).toContainText('Alexandre Alves de Carvalho');
    await expect(turmaA).toContainText('Seg 08:00–09:40 · PV1-101');
    await turmaA.click();
    await turmas.getByRole('button', { name: /Adicionar turma A/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Aulas de segunda' })).toContainText('Turma A · 08:00–09:40 · PV1-101');

    await page.getByRole('button', { name: 'Compartilhar' }).click();
    await page.getByRole('button', { name: 'Exportar pro Google Agenda' }).click();
    const sheet = page.getByRole('dialog', { name: 'Exportar pro Google Agenda' });
    await sheet.getByLabel('De').fill('2026-08-10');
    await sheet.getByLabel('Até').fill('2026-12-11');
    await sheet.getByRole('button', { name: 'Exportar', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Sua grade está no Google Agenda' })).toBeVisible();
    expect(chamadas).toHaveLength(2);
  });
});

test('mobile: salva no navegador, alterna planos e recupera ao trocar de semestre', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Fluxo exclusivo do celular.');
  await stubGoogleCalendar(page);
  await completeMobileFlow(page);
  const aba = plano => page.getByRole('tab', { name: new RegExp(`^Plano ${plano},`) });

  await addSubject(page, 'Programação Web', 'A');
  await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minha grade' })).toBeVisible({ timeout: 30_000 });
  await expect(credits(page)).toHaveAccessibleName('4 de 32 créditos');

  await aba('B').click();
  await expect(credits(page)).toHaveAccessibleName('0 de 32 créditos');
  await addSubject(page, 'Banco de Dados', 'A');
  await expect(aba('B')).toHaveAccessibleName('Plano B, 4 créditos');
  await aba('A').click();
  await expect(aba('A')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.m-block', { hasText: 'Programação Web' })).toHaveCount(1);

  // 1º semestre vai direto pra grade, vazia; voltar pro 2º recupera os planos.
  await page.getByRole('button', { name: 'Voltar ao histórico' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('radio', { name: '1º semestre' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/1º semestre ·/)).toBeVisible();
  await expect(credits(page)).toHaveAccessibleName('0 de 32 créditos');

  await page.getByRole('button', { name: 'Voltar ao histórico' }).click();
  await page.getByRole('radio', { name: '2º semestre' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Montar minha grade' }).click();
  await expect(aba('A')).toHaveAccessibleName('Plano A, 4 créditos');
  await expect(aba('B')).toHaveAccessibleName('Plano B, 4 créditos');
});

test('mobile: abre link compartilhado e mostra erro amigável pra link corrompido', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Fluxo exclusivo do celular.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stubGoogleCalendar(page);
  await completeMobileFlow(page);
  await addSubject(page, 'Programação Web', 'A');
  await page.getByRole('button', { name: 'Compartilhar' }).click();
  await page.getByRole('button', { name: 'Copiar link da grade' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const outra = await context.newPage();
  await useAcademicFixtures(outra);
  await outra.goto(link);
  await expect(outra.getByText('Grade compartilhada de 2026/2')).toBeVisible({ timeout: 30_000 });
  await expect(outra.getByText('NOR201')).toBeVisible();

  // Da grade compartilhada pra comparação: no celular vira lista por dia.
  await outra.getByRole('button', { name: 'Comparar com a minha' }).click();
  await expect(outra.getByRole('heading', { name: 'Horários livres em comum' })).toBeVisible();
  const segunda = outra.getByRole('region', { name: 'segunda' });
  await expect(segunda).toContainText('Livres juntos: 7h–8h, 10h–23h');
  await expect(segunda).toContainText('Você, Amigo 1');

  const quebrada = await context.newPage();
  await useAcademicFixtures(quebrada);
  await quebrada.goto('/#g=zLixoQueNaoAbre');
  await expect(quebrada.getByText(/Link de grade inválido/)).toBeVisible({ timeout: 30_000 });
  // Segue o fluxo normal: este navegador já tem grade salva, então volta pra ela.
  await expect(quebrada.getByRole('heading', { name: 'Minha grade' })).toBeVisible();
});

test('mobile: 1º semestre vai direto para a grade com dados reais', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Fluxo exclusivo do celular.');
  test.slow();
  await completeMobileFlow(page, { useFixtures: false, semester: 1 });

  await page.getByRole('button', { name: 'Adicionar matéria' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar matéria' });
  await expect(sheet.getByRole('tab', { name: /Do semestre/ })).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByRole('button', { name: /Introdução aos Algoritmos/ })).toBeVisible();
});
