/**
 * Simula o login do Google e a API do Calendar, sem rede.
 * Devolve a lista de chamadas feitas à API para as asserções.
 */
async function stubGoogleCalendar(page) {
  const instalar = () => {
    globalThis.google = {
      accounts: {
        oauth2: {
          initTokenClient: config => ({
            requestAccessToken: () => setTimeout(() => config.callback({ access_token: 'token-falso' }), 20)
          }),
          hasGrantedAllScopes: () => true
        }
      }
    };
  };
  // O script real não pode carregar por cima do falso.
  await page.route('https://accounts.google.com/gsi/client*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  // Vale para as próximas navegações e para a página que já está aberta.
  await page.addInitScript(instalar);
  await page.evaluate(instalar);

  const chamadas = [];
  await page.route('https://www.googleapis.com/**', route => {
    const request = route.request();
    chamadas.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    const id = request.url().endsWith('/calendars') ? 'grade@group.calendar.google.com' : 'evento';
    return route.fulfill({ json: { id } });
  });
  return chamadas;
}

module.exports = { stubGoogleCalendar };
