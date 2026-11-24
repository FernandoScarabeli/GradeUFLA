import { getNomeMateriaOuCodigo } from '../../data';
import { formatarAula, formatarNomeProprio } from '../../domain/gradeRules';
import './Sugestoes.css';

/** Lista de "o que encaixa neste horário", agrupada como as abas de adicionar. */
export default function EncaixeLista({ resultado, onEscolher }) {
  if (resultado.total === 0) {
    return (
      <p className="encaixe__vazio">
        Nenhuma matéria tem turma livre neste horário.
        {resultado.barradas > 0 && ` ${resultado.barradas === 1 ? 'Uma encaixaria' : `${resultado.barradas} encaixariam`}, mas pede pré-requisito que você ainda não tem ou passaria do limite de créditos.`}
      </p>
    );
  }

  return (
    <>
      {resultado.grupos.map(grupo => (
        <div key={grupo.chave} className="encaixe__grupo">
          <h4 className="encaixe__grupo-titulo">{grupo.rotulo}</h4>
          <ul className="encaixe__lista">
            {grupo.itens.map(({ materia, turmas, faltandoCoreq }) => (
              <li key={materia.codigo} className="encaixe__item">
                <div className="encaixe__cabeca">
                  <span className="encaixe__nome">{materia.nome}</span>
                  <span className="encaixe__meta">{materia.creditos} cr</span>
                </div>
                <p className="encaixe__info">
                  <code>{materia.codigo}</code>
                  {materia.semestreOriginal && <span>{materia.semestreOriginal}º sem</span>}
                  {faltandoCoreq.length > 0 && <span>curse junto com {faltandoCoreq.map(getNomeMateriaOuCodigo).join(', ')}</span>}
                </p>
                <div className="encaixe__turmas">
                  {turmas.map(turma => (
                    <button
                      key={turma.id}
                      type="button"
                      className="encaixe__turma"
                      onClick={() => onEscolher(materia, turma)}
                      aria-label={`Adicionar ${materia.nome}, turma ${turma.id}`}
                    >
                      <b>Turma {turma.id}</b>
                      <span>{(turma.horarios || []).map(horario => formatarAula(horario)).join(' · ')}</span>
                      {turma.professor && <span>{formatarNomeProprio(turma.professor)}</span>}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
