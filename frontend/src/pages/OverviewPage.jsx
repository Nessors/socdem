import { useEffect, useState } from "react";
import { api } from "../api";

export default function OverviewPage() {
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .stream()
      .then(setStream)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Загрузка…</p>;
  if (!stream) return <p>Данные о потоке не найдены.</p>;

  return (
    <section className="card">
      <h2>О потоке</h2>
      <dl className="facts">
        <div>
          <dt>Год поступления</dt>
          <dd>{stream.admission_year}</dd>
        </div>
        <div>
          <dt>Направление</dt>
          <dd>{stream.specialty}</dd>
        </div>
        <div>
          <dt>Куратор</dt>
          <dd>{stream.curator_name}</dd>
        </div>
        <div>
          <dt>Факультет</dt>
          <dd>{stream.faculty_name}</dd>
        </div>
      </dl>
      <p className="lead">{stream.faculty_description}</p>
    </section>
  );
}
