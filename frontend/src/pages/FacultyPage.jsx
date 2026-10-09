import { useEffect, useState } from "react";
import gerb from "../assets/gerb.png";
import { api } from "../api";

export default function FacultyPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.faculty().then(setItems);
  }, []);

  return (
    <section className="card">
      {items.map((f) => (
        <article key={f.id} className="faculty-hero">
          <img
            className="faculty-gerb"
            src={gerb}
            alt="Герб военно-политической работы"
            width={148}
            height={177}
          />
          <div>
            <h3>{f.name}</h3>
            <p>{f.description}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
