// Link de grade compartilhada: tudo vai no fragmento da URL (#g=...), sem servidor.
// O fragmento não chega ao Netlify nem aos logs, e o redirect do SPA não mexe nele.
// Formato: { v, c: curso, m: matriz, s: semestre, p: período, t: [[codigo, turmaId, anpHour?], ...] }
// Histórico (aprovadas) não entra: é pessoal e deixaria o link enorme.

import { serializarGrade } from './gradeSalva';

export const VERSAO_LINK = 1;
const PREFIXO_COMPACTO = 'z'; // JSON comprimido com deflate-raw
const PREFIXO_TEXTO = 'j'; // JSON puro (navegador sem CompressionStream)
const MAX_TOKEN = 4000;
const MAX_MATERIAS = 40;
const MAX_TEXTO = 60;

export class LinkInvalidoError extends Error {
  constructor(mensagem = 'Link de grade inválido.') {
    super(mensagem);
    this.name = 'LinkInvalidoError';
  }
}

// ---------- base64url ----------

const paraBase64Url = bytes => {
  let binario = '';
  bytes.forEach(byte => { binario += String.fromCharCode(byte); });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const deBase64Url = texto => {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) throw new LinkInvalidoError();
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binario, caractere => caractere.charCodeAt(0));
};

// ---------- compressão (opcional) ----------

const temCompressao = () => typeof CompressionStream === 'function'
  && typeof DecompressionStream === 'function'
  && typeof Blob === 'function'
  && typeof Response === 'function';

const passarPor = async (bytes, transformador) => {
  const stream = new Blob([bytes]).stream().pipeThrough(transformador);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// ---------- validação ----------

const textoValido = valor => typeof valor === 'string' && valor.length > 0 && valor.length <= MAX_TEXTO;

function validarPayload(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new LinkInvalidoError();
  if (dados.v !== VERSAO_LINK) {
    throw new LinkInvalidoError('Esse link foi criado por outra versão do site.');
  }
  if (!textoValido(dados.c) || !textoValido(dados.m) || !textoValido(dados.p)) throw new LinkInvalidoError();
  if (!Number.isInteger(dados.s) || dados.s < 1 || dados.s > 20) throw new LinkInvalidoError();
  if (!Array.isArray(dados.t) || dados.t.length > MAX_MATERIAS) throw new LinkInvalidoError();

  const turmas = dados.t.map(item => {
    if (!Array.isArray(item) || item.length < 2 || item.length > 3) throw new LinkInvalidoError();
    const [codigo, turmaId, anpHour] = item;
    if (!textoValido(codigo)) throw new LinkInvalidoError();
    if (!textoValido(String(turmaId ?? ''))) throw new LinkInvalidoError();
    if (anpHour !== undefined && !Number.isInteger(anpHour)) throw new LinkInvalidoError();
    return anpHour === undefined ? [codigo, turmaId] : [codigo, turmaId, anpHour];
  });

  return { curso: dados.c, matriz: dados.m, semestre: dados.s, periodo: dados.p, turmas };
}

// ---------- API ----------

/** Grade da tela (ou já serializada) -> lista compacta [[codigo, turmaId, anpHour?]]. */
export function turmasDaGrade(grade) {
  return Object.entries(serializarGrade(grade)).map(([codigo, { turmaId, anpHour }]) => (
    anpHour == null ? [codigo, turmaId] : [codigo, turmaId, anpHour]
  ));
}

/** Lista compacta -> formato salvo { codigo: { turmaId, anpHour? } }, pronto pra reidratarGrade. */
export function paraGradeSalva(turmas) {
  return Object.fromEntries((turmas || []).map(([codigo, turmaId, anpHour]) => [
    codigo,
    anpHour == null ? { turmaId } : { turmaId, anpHour }
  ]));
}

export async function codificarGrade({ curso, matriz, semestre, periodo, grade }) {
  const payload = { v: VERSAO_LINK, c: curso, m: matriz, s: Number(semestre), p: periodo, t: turmasDaGrade(grade) };
  validarPayload(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const texto = PREFIXO_TEXTO + paraBase64Url(bytes);
  if (!temCompressao()) return texto;
  try {
    const compacto = PREFIXO_COMPACTO + paraBase64Url(await passarPor(bytes, new CompressionStream('deflate-raw')));
    return compacto.length < texto.length ? compacto : texto;
  } catch {
    return texto;
  }
}

/** Token -> { curso, matriz, semestre, periodo, turmas }. Lança LinkInvalidoError se não der. */
export async function decodificarGrade(token) {
  if (typeof token !== 'string' || token.length < 2 || token.length > MAX_TOKEN) throw new LinkInvalidoError();
  const prefixo = token[0];
  let bytes;
  try {
    bytes = deBase64Url(token.slice(1));
    if (prefixo === PREFIXO_COMPACTO) {
      if (!temCompressao()) throw new LinkInvalidoError('Seu navegador não consegue abrir esse link.');
      bytes = await passarPor(bytes, new DecompressionStream('deflate-raw'));
    } else if (prefixo !== PREFIXO_TEXTO) {
      throw new LinkInvalidoError();
    }
  } catch (erro) {
    throw erro instanceof LinkInvalidoError ? erro : new LinkInvalidoError();
  }

  let dados;
  try {
    dados = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new LinkInvalidoError();
  }
  return validarPayload(dados);
}

/** "#g=abc" -> "abc" (ou null). */
export function extrairToken(hash) {
  const match = /^#?g=([A-Za-z0-9_-]+)$/.exec(String(hash ?? '').trim());
  return match ? match[1] : null;
}

/** Aceita o link inteiro colado ou só o token. */
export function extrairTokenDeTexto(texto) {
  const limpo = String(texto ?? '').trim();
  const indice = limpo.indexOf('#g=');
  if (indice !== -1) return extrairToken(limpo.slice(indice));
  return /^[jz][A-Za-z0-9_-]+$/.test(limpo) ? limpo : null;
}

export function urlDaGrade(token, base) {
  const origem = base ?? `${window.location.origin}${window.location.pathname}`;
  return `${origem}#g=${token}`;
}
