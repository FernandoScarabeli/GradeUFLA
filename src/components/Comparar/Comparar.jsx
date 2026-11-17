import { useId, useMemo, useState } from 'react';
import { DIAS_SEMANA } from '../../domain/gradeRules';
import {
  calcularHorariosEmComum,
  DIAS_COMUM,
  formatarTrecho,
  HORA_FIM_COMUM,
  HORA_INICIO_COMUM,
  resumirLivres,
  trechosOcupadosDoDia
} from '../../domain/horariosEmComum';
import { DIAS_LONGOS } from '../Mobile/mobileGrade';
import './Comparar.css';

const MAX_PESSOAS = 4; // você + 3 amigos
const CORES = ['#00F0B5', '#F9DC5C', '#8EA8FF', '#FF8FA3'];
const HORAS = Array.from({ length: HORA_FIM_COMUM - HORA_INICIO_COMUM }, (_, indice) => HORA_INICIO_COMUM + indice);

const inicial = nome => (String(nome || '?').trim()[0] || '?').toLocaleUpperCase('pt-BR');

/**
 * Compara a sua grade com até 3 grades de amigos (links #g=). Apelidos ficam só na memória
 * da página. Desktop: malha da semana; celular: lista por dia.
 */
export default function Comparar({ pessoasIniciais, carregarLink, onVoltar, compacto = false }) {
  const [pessoas, setPessoas] = useState(() => pessoasIniciais.slice(0, MAX_PESSOAS));
  const [link, setLink] = useState('');
  const [apelido, setApelido] = useState('');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const linkId = useId();
  const apelidoId = useId();

  const resultado = useMemo(() => calcularHorariosEmComum(pessoas), [pessoas]);
  const resumo = resumirLivres(resultado.livres);
  const porId = new Map(pessoas.map((pessoa, indice) => [pessoa.id, { ...pessoa, cor: CORES[indice % CORES.length] }]));
  const nomesDe = ids => ids.map(id => porId.get(id)?.nome).filter(Boolean);
  const proximoAmigo = () => {
    let numero = 1;
    while (pessoas.some(pessoa => pessoa.nome === `Amigo ${numero}`)) numero += 1;
    return `Amigo ${numero}`;
  };
  const cheio = pessoas.length >= MAX_PESSOAS;

  const adicionar = async event => {
    event.preventDefault();
    if (cheio || carregando) return;
    setErro(null);
    setCarregando(true);
    try {
      const amigo = await carregarLink(link);
      setPessoas(atuais => [...atuais, {
        id: `amigo-${Date.now()}-${atuais.length}`,
        nome: apelido.trim() || proximoAmigo(),
        grade: amigo.grade,
        descricao: amigo.descricao,
        avisos: amigo.avisos
      }]);
      setLink('');
      setApelido('');
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
      <header className="cmp__topo">
        <button className="btn-voltar" type="button" onClick={onVoltar}>
          <i className="fi fi-br-arrow-left" aria-hidden="true" />
          <span className="btn-voltar__text">Voltar</span>
        </button>
        <div>
          <h2 id="cmp-titulo" className="cmp__titulo">Horários livres em comum</h2>
          <p className="cmp__sub">Cole o link da grade de até 3 amigos pra achar um horário em que todo mundo está livre.</p>
        </div>
      </header>

      <ul className="cmp__pessoas" aria-label="Grades comparadas">
        {pessoas.map((pessoa, indice) => (
          <li key={pessoa.id} className="cmp__pessoa">
            <span className="cmp__avatar" style={{ '--c': CORES[indice % CORES.length] }} aria-hidden="true">
              {inicial(pessoa.nome)}
            </span>
            <div className="cmp__pessoa-info">
              {pessoa.fixo ? (
                <strong>{pessoa.nome}</strong>
              ) : (
                <input
                  className="cmp__apelido"
                  value={pessoa.nome}
                  maxLength={20}
                  aria-label={`Apelido de ${pessoa.nome || 'amigo'}`}
                  onChange={event => renomear(pessoa.id, event.target.value)}
                />
              )}
              <span>{pessoa.descricao}</span>
              {(pessoa.avisos || []).map(aviso => <span key={aviso} className="cmp__aviso">{aviso}</span>)}
            </div>
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

      {!cheio && (
        <form className="cmp__form" onSubmit={adicionar}>
          <div className="cmp__campo cmp__campo--link">
            <label htmlFor={linkId}>Link da grade</label>
            <input
              id={linkId}
              value={link}
              onChange={event => setLink(event.target.value)}
              placeholder="https://gradeufla.com.br/#g=…"
              autoComplete="off"
              inputMode="url"
              required
            />
          </div>
          <div className="cmp__campo">
            <label htmlFor={apelidoId}>Apelido (opcional)</label>
            <input
              id={apelidoId}
              value={apelido}
              maxLength={20}
              onChange={event => setApelido(event.target.value)}
              placeholder={proximoAmigo()}
            />
          </div>
          <button className="btn-primary cmp__adicionar" type="submit" disabled={carregando}>
            {carregando ? 'Abrindo…' : 'Adicionar'}
          </button>
          {erro && <p className="cmp__erro" role="alert">{erro}</p>}
        </form>
      )}

      {pessoas.length < 2 ? (
        <p className="cmp__dica">Adicione o link de pelo menos um amigo pra comparar.</p>
      ) : (
        <>
          <div className="cmp__resumo" role="status">
            <h3>Livres juntos</h3>
            {resumo.length === 0 ? (
              <p>Nenhum horário livre em comum de segunda a sábado.</p>
            ) : (
              <ul>
                {resumo.map(item => (
                  <li key={item.dia}><strong>{item.nome}</strong> {item.texto}</li>
                ))}
              </ul>
            )}
          </div>

          {compacto ? (
            <div className="cmp__dias">
              {DIAS_COMUM.map(dia => {
                const livres = resultado.livres.filter(livre => livre.dia === dia);
                const ocupados = trechosOcupadosDoDia(resultado.celulas, dia);
                return (
                  <section key={dia} className="cmp__dia" aria-label={DIAS_LONGOS[dia]}>
                    <h4>{DIAS_LONGOS[dia]}</h4>
                    {livres.length > 0 && (
                      <p className="cmp__livre">Livres juntos: {livres.map(formatarTrecho).join(', ')}</p>
                    )}
                    {ocupados.map(trecho => (
                      <p key={trecho.inicio} className="cmp__ocupado">
                        <span>{formatarTrecho(trecho)}</span>
                        <span>{nomesDe(trecho.ocupados).join(', ')}</span>
                      </p>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="cmp__malha-wrap">
              <table className="cmp__malha">
                <thead>
                  <tr>
                    <th scope="col">Hora</th>
                    {DIAS_COMUM.map(dia => <th key={dia} scope="col">{DIAS_SEMANA[dia]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {HORAS.map(hora => (
                    <tr key={hora}>
                      <th scope="row">{hora}h</th>
                      {DIAS_COMUM.map(dia => {
                        const ocupados = resultado.celulas[`${dia}:${hora}`] || [];
                        const livre = ocupados.length === 0;
                        return (
                          <td
                            key={dia}
                            className={livre ? 'cmp__celula cmp__celula--livre' : 'cmp__celula'}
                            aria-label={livre
                              ? `${DIAS_LONGOS[dia]} ${hora}h: livre pra todos`
                              : `${DIAS_LONGOS[dia]} ${hora}h: ocupado (${nomesDe(ocupados).join(', ')})`}
                          >
                            {!livre && ocupados.map(id => (
                              <span key={id} className="cmp__marca" style={{ '--c': porId.get(id)?.cor }} aria-hidden="true">
                                {inicial(porId.get(id)?.nome)}
                              </span>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
