// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';

// A grade é salva no localStorage; cada teste começa com o navegador limpo.
afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // Ambiente sem storage.
  }
});
