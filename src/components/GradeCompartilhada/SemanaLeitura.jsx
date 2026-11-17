import { DIAS_SEMANA } from '../../domain/gradeRules';
import { getCorMateria } from '../Calendar/calendarUtils';
import { blocosDoDia, DIAS_GRADE, DIAS_LONGOS, HORA_FIM, HORA_INICIO } from '../Mobile/mobileGrade';
import './GradeCompartilhada.css';

/** Aulas seguidas da mesma matéria no mesmo dia (ex.: 8–10 e 10–11) viram um bloco só. */
function blocosUnidos(grade, dia) {
  const unidos = [];
  for (const bloco of blocosDoDia(grade, dia)) {
    const anterior = unidos.find(item => item.codigo === bloco.codigo && item.fim === bloco.inicio);
    if (anterior) anterior.fim = bloco.fim;
    else unidos.push({ ...bloco });
  }
  return unidos;
}

/** Semana seg–sáb só pra ver (grade compartilhada). Funciona de 360 px ao desktop. */
export default function SemanaLeitura({ grade }) {
  const horas = Array.from({ length: HORA_FIM - HORA_INICIO }, (_, indice) => HORA_INICIO + indice);
  return (
    <div className="sl" style={{ '--sl-horas': HORA_FIM - HORA_INICIO }}>
      <span className="sl__canto" aria-hidden="true" />
      {DIAS_GRADE.map(dia => (
        <span key={dia} className="sl__dia">{DIAS_SEMANA[dia]}</span>
      ))}
      <div className="sl__horas" aria-hidden="true">
        {horas.map(hora => <span key={hora}>{hora}h</span>)}
      </div>
      {DIAS_GRADE.map(dia => (
        <div key={dia} className="sl__col" role="list" aria-label={`Aulas de ${DIAS_LONGOS[dia]}`}>
          {blocosUnidos(grade, dia).map(bloco => (
            <div
              key={bloco.key}
              role="listitem"
              className="sl__bloco"
              data-horas={Math.min(bloco.fim - bloco.inicio, 3)}
              aria-label={`${bloco.materia.nome}, ${DIAS_LONGOS[dia]} das ${bloco.inicio}h às ${bloco.fim}h, turma ${bloco.materia.turmaId}`}
              style={{
                '--c': getCorMateria(bloco.codigo, grade),
                top: `calc(var(--sl-h) * ${bloco.inicio - HORA_INICIO} + 1px)`,
                height: `calc(var(--sl-h) * ${bloco.fim - bloco.inicio} - 2px)`
              }}
            >
              <span className="sl__nome">{bloco.materia.nome}</span>
              <span className="sl__cod">{bloco.codigo}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
