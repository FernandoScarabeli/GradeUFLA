import { useId, useMemo, useState } from 'react';
import {
  calcularHorariosEmComum,
  DIAS_COMUM,
  HORA_FIM_COMUM,
  HORA_INICIO_COMUM,
  trechosOcupadosDoDia
} from '../../domain/horariosEmComum';
import { DIAS_SEMANA } from '../../domain/gradeRules';
import { DIAS_LONGOS } from '../Mobile/mobileGrade';
import './Comparar.css';

const MAX_PESSOAS = 4; // você + 3 amigos
const CORES = ['#00F0B5', '#F9DC5C', '#8EA8FF', '#FF8FA3'];
const TOTAL_HORAS = HORA_FIM_COMUM - HORA_INICIO_COMUM;
const MARCAS = [7, 11, 15, 19, 23];

const inicial = nome => (String(nome || '?').trim()[0] || '?').toLocaleUpperCase('pt-BR');
const faixa = ({ inicio, fim }) => `${inicio}–${fim}h`;
const diaTodo = livres => livres.length === 1
  && livres[0].inicio === HORA_INICIO_COMUM
  && livres[0].fim === HORA_FIM_COMUM;
const posicao = ({ inicio, fim }) => ({
  left: `${((inicio - HORA_INICIO_COMUM) / TOTAL_HORAS) * 100}%`,
  width: `${((fim - inicio) / TOTAL_HORAS) * 100}%`
});

/**
 * Quando todo mundo está livre? Uma linha do tempo por dia: verde = todos livres,
 * cinza = alguém tem aula (com as iniciais de quem). Os horários livres vêm escritos embaixo.
 * Apelidos ficam só na memória da página.
 */
export default function Comparar({ pessoasIniciais, carregarLink, onVoltar }) {
  const [pessoas, setPessoas] = useState(() => pessoasIniciais.slice(0, MAX_PESSOAS));
  const [link, setLink] = useState('');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const linkId = useId();

  const resultado = useMemo(() => calcularHorariosEmComum(pessoas), [pessoas]);
  const porId = new Map(pessoas.map((pessoa, indice) => [pessoa.id, { ...pessoa, cor: CORES[indice % CORES.length] }]));
  const nomesDe = ids => ids.map(id => porId.get(id)?.nome || 'Amigo').join(', ');
  const cheio = pessoas.length >= MAX_PESSOAS;
  const comparando = pessoas.length >= 2;

  const proximoAmigo = atuais => {
    let numero = 1;
    while (atuais.some(pessoa => pessoa.nome === `Amigo ${numero}`)) numero += 1;
    return `Amigo ${numero}`;
  };

  const adicionar = async event => {
    event.preventDefault();
    if (cheio || carregando || !link.trim()) return;
    setErro(null);
    setCarregando(true);
    try {
      const amigo = await carregarLink(link);
      setPessoas(atuais => [...atuais, {
        id: `amigo-${Date.now()}-${atuais.length}`,
        nome: proximoAmigo(atuais),
        grade: amigo.grade,
        descricao: amigo.descricao,
        avisos: amigo.avisos
      }]);
      setLink('');
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível abrir esse link.');
    } finally {
      setCarregando(false);
    }
  };

  const renomear = (id, nome) => setPessoas(atuais => atuais.map(pessoa => (pessoa.id === id ? { ...pessoa, nome } : pessoa)));
  const remover = id => setPessoas(atuais => atuais.filter(pessoa => pessoa.id !== id));

  return (
    <section className="cmp" aria-labelledby="cmp-titulo">
      <button className="btn-voltar cmp__voltar" type="button" onClick={onVoltar}>
        <i className="fi fi-br-arrow-left" aria-hidden="true" />
        <span className="btn-voltar__text">Voltar</span>
      </button>

      <h2 id="cmp-titulo" className="cmp__titulo">Horários livres em comum</h2>

      <ul className="cmp__pessoas" aria-label="Quem está na comparação">
        {pessoas.map((pessoa, indice) => (
          <li key={pessoa.id} className="cmp__pessoa" title={pessoa.descricao}>
            <span className="cmp__avatar" style={{ '--c': CORES[indice % CORES.length] }} aria-hidden="true">
              {inicial(pessoa.nome)}
            </span>
            {pessoa.fixo ? (
              <span className="cmp__nome">{pessoa.nome}</span>
            ) : (
              <input
                className="cmp__nome cmp__nome--editavel"
                value={pessoa.nome}
                maxLength={16}
                size={Math.max(4, pessoa.nome.length)}
                aria-label={`Apelido de ${pessoa.nome || 'amigo'}`}
                onChange={event => renomear(pessoa.id, event.target.value)}
              />
            )}
            {!pessoa.fixo && (
              <button
                type="button"
                className="cmp__remover"
                aria-label={`Tirar ${pessoa.nome || 'amigo'} da comparação`}
                onClick={() => remover(pessoa.id)}
              >
                <i className="fi fi-br-cross-small" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {pessoas.flatMap(pessoa => pessoa.avisos || []).map(aviso => (
        <p key={aviso} className="cmp__aviso">{aviso}</p>
      ))}

      {!cheio && (
        <form className="cmp__form" onSubmit={adicionar}>
          <label className="cmp__rotulo" htmlFor={linkId}>
            {comparando ? 'Adicionar mais um amigo' : 'Cole o link da grade de um amigo'}
          </label>
          <div className="cmp__campo">
            <input
              id={linkId}
              value={link}
              onChange={event => { setLink(event.target.value); setErro(null); }}
              placeholder="gradeufla.com.br/#g=…"
              autoComplete="off"
              inputMode="url"
              aria-invalid={Boolean(erro)}
              aria-describedby={erro ? `${linkId}-erro` : undefined}
            />
            <button className="cmp__adicionar" type="submit" disabled={carregando || !link.trim()}>
              {carregando ? 'Abrindo…' : 'Adicionar'}
            </button>
          </div>
          {erro && <p id={`${linkId}-erro`} className="cmp__erro" role="alert">{erro}</p>}
        </form>
      )}

      {!comparando ? (
        <p className="cmp__dica">
          Peça pro seu amigo abrir a grade dele e tocar em <strong>Compartilhar → Copiar link da grade</strong>.
        </p>
      ) : (
        <div className="cmp__semana">
          <div className="cmp__legenda" aria-hidden="true">
            <span><i className="cmp__amostra cmp__amostra--livre" /> Todos livres</span>
            <span><i className="cmp__amostra" /> Alguém tem aula</span>
          </div>

          <div className="cmp__eixo" aria-hidden="true">
            {MARCAS.map(hora => (
              <span key={hora} style={{ left: `${((hora - HORA_INICIO_COMUM) / TOTAL_HORAS) * 100}%` }}>{hora}h</span>
            ))}
          </div>

          <ul className="cmp__dias">
            {DIAS_COMUM.map(dia => {
              const livres = resultado.livres.filter(livre => livre.dia === dia);
              const ocupados = trechosOcupadosDoDia(resultado.celulas, dia);
              return (
                <li key={dia} className="cmp__dia" aria-label={DIAS_LONGOS[dia]}>
                  <span className="cmp__dia-nome" aria-hidden="true">{DIAS_SEMANA[dia]}</span>
                  <div className="cmp__barra" aria-hidden="true">
                    {livres.map(trecho => (
                      <span key={`l${trecho.inicio}`} className="cmp__trecho cmp__trecho--livre" style={posicao(trecho)} />
                    ))}
                    {ocupados.map(trecho => (
                      <span
                        key={`o${trecho.inicio}`}
                        className="cmp__trecho"
                        style={posicao(trecho)}
                        title={`${faixa(trecho)}: ${nomesDe(trecho.ocupados)}`}
                      >
                        {trecho.ocupados.map(id => (
                          <i key={id} className="cmp__ponto" style={{ '--c': porId.get(id)?.cor }} />
                        ))}
                      </span>
                    ))}
                  </div>
                  <p className="cmp__livres">
                    {livres.length === 0 && <span className="cmp__nenhum">Nenhum horário livre em comum</span>}
                    {livres.length > 0 && <span className="sr-only">Livres juntos: </span>}
                    {diaTodo(livres) ? 'Livre o dia todo' : livres.map(faixa).join(' · ')}
                  </p>
                  {ocupados.length > 0 && (
                    <p className="sr-only">
                      Ocupados: {ocupados.map(trecho => `${faixa(trecho)} ${nomesDe(trecho.ocupados)}`).join('; ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
