import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { pool } from "./db.js";
import { getStudentFull } from "./students.js";

const FONT = "Times New Roman";
const SIZE = 28; // 14 pt, как в образце

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** 'YYYY-MM-DD' -> '24 ноября 2006 года' */
function longDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTHS[m - 1]} ${y} года`;
}

/** 'YYYY-MM-DD' -> '01.09.2013' */
function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: SIZE, ...opts });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 0 },
    children: Array.isArray(children) ? children : [children],
    ...opts,
  });
}

function blank() {
  return para(run(""));
}

/** Строка вида «Метка: значение;» (метка жирная) */
function field(label, value, end = ";") {
  const text = value == null || value === "" ? "—" : String(value);
  return para([run(`${label}: `, { bold: true }), run(`${text}${end}`)]);
}

function upperLast(name) {
  return String(name ?? "").toUpperCase();
}

function fio(s) {
  return [upperLast(s.last_name), s.first_name, s.patronymic]
    .filter(Boolean)
    .join(" ");
}

function relativeLine(r) {
  let text = `${r.relation}: ${r.full_name}`;
  if (r.birth_date) text += `, ${longDate(r.birth_date)} рождения`;
  if (r.details && r.phone) {
    text += `, ${r.details} (номер телефона для связи ${r.phone})`;
  } else if (r.details) {
    text += `, ${r.details}`;
  } else if (r.phone) {
    text += ` (номер телефона для связи ${r.phone})`;
  }
  return text + ";";
}

function commanderText(c) {
  const head = [c.position, c.rank, c.full_name].filter(Boolean).join(" ");
  const sentences = [];
  let first = head;
  if (c.birth_date) first += `, ${longDate(c.birth_date)} рождения`;
  if (c.in_position_since) first += `, в должности с ${c.in_position_since}`;
  sentences.push(first + ".");
  if (c.education) sentences.push(`Окончил ${c.education}.`);
  if (c.contract) sentences.push(`Контракт ${c.contract}.`);
  if (c.marital_status) sentences.push(`${c.marital_status}.`);
  return sentences.join(" ");
}

function pngSize(buf) {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function imageInfo(mime, data) {
  const type =
    mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : mime === "image/bmp" ? "bmp" : "jpg";
  const size = (type === "png" ? pngSize(data) : type === "jpg" ? jpegSize(data) : null) ?? {
    width: 3,
    height: 4,
  };
  return { type, size };
}

function photoCell(photo) {
  if (!photo) {
    return new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [para(run("(фото не загружено)"), { alignment: AlignmentType.CENTER })],
    });
  }
  const { type, size } = imageInfo(photo.mime_type, photo.data);
  const maxW = 230;
  const maxH = 400;
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type,
            data: photo.data,
            transformation: {
              width: Math.round(size.width * scale),
              height: Math.round(size.height * scale),
            },
          }),
        ],
      }),
    ],
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

export async function buildStudentDocx(studentId) {
  const s = await getStudentFull(studentId);
  if (!s) return null;

  const [relatives, commanders, career, mourning, photos] = await Promise.all([
    pool.query("SELECT * FROM student_relative WHERE student_id = $1 ORDER BY id", [studentId]),
    pool.query("SELECT * FROM student_commander WHERE student_id = $1 ORDER BY id", [studentId]),
    pool.query("SELECT * FROM student_career WHERE student_id = $1 ORDER BY date_from, id", [studentId]),
    pool.query(
      "SELECT * FROM student_mourning_event WHERE student_id = $1 ORDER BY death_date DESC, id",
      [studentId]
    ),
    pool.query("SELECT slot, mime_type, data FROM student_photo WHERE student_id = $1 ORDER BY slot", [studentId]),
  ]);
  const photoBySlot = Object.fromEntries(photos.rows.map((p) => [p.slot, p]));

  const birth = [longDate(s.birth_date), s.birth_place].filter(Boolean).join(", ");

  const children = [
    para(run("Социально-демографические данные", { bold: true }), {
      alignment: AlignmentType.CENTER,
    }),
    blank(),
    field("Ф.И.О.", fio(s)),
    field("Дата рождения и место рождения", birth),
    field("Паспортные данные", s.passport, ""),
    field("Национальность", s.nationality),
    field("Призван в ВС РФ", s.military_commissariat),
    field("Образование", s.education),
    field("Окончил (когда, что)", s.graduated),
    field("Специальность", s.specialty),
    field("Специализация", s.specialization),
    field("Иностранные языки", s.foreign_languages),
    field("Был ли за границей (когда, где)", s.been_abroad),
    field("Государственные награды", s.state_awards),
    field("Воинское звание", s.military_rank),
    field("Ученая степень, ученое звание", s.academic_degree),
    field("Должность", s.position),
    field("Является ли депутатом", s.is_deputy),
    field("Контракт заключен", s.contract_status),
    field("Номер телефона", s.phone),
    field("Семейное положение", s.marital_status),
    ...relatives.rows.map((r) => para(run(relativeLine(r)))),
    field("Адрес по месту регистрации", s.registration_address),
    field("Адрес места жительства", s.residence_address),
    field("Водительское удостоверение", s.driver_license),
    field("Автомобиль (водитель)", s.car, ""),
    blank(),
  ];

  if (commanders.rows.length > 0) {
    children.push(para(run("Данные на командиров:", { bold: true })));
    for (const c of commanders.rows) {
      children.push(para(run(commanderText(c))));
    }
    children.push(blank());
  }

  children.push(para(run("Работа в прошлом:", { bold: true })));
  if (career.rows.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: career.rows.map(
          (c) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  children: [
                    para(
                      run(
                        `${shortDate(c.date_from)} – ${c.date_to ? shortDate(c.date_to) : "настоящее время"}`
                      )
                    ),
                  ],
                }),
                new TableCell({
                  width: { size: 65, type: WidthType.PERCENTAGE },
                  children: [para(run(`- ${c.description}`))],
                }),
              ],
            })
        ),
      })
    );
  } else {
    children.push(para(run("—")));
  }

  if (mourning.rows.length > 0) {
    children.push(blank(), para(run("Печальные события:", { bold: true })));
    for (const m of mourning.rows) {
      const who = [m.relation, m.full_name].filter(Boolean).join(" — ");
      const line = `${who}: дата смерти ${longDate(m.death_date)}, причина смерти — ${m.cause_of_death}`;
      children.push(para(run(m.notes ? `${line}. ${m.notes}` : line)));
    }
  }

  children.push(blank(), para(run("Цветное фото:", { bold: true })), blank());
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        ...NO_BORDERS,
        insideHorizontal: NO_BORDERS.top,
        insideVertical: NO_BORDERS.top,
      },
      rows: [
        new TableRow({
          children: [photoCell(photoBySlot[1]), photoCell(photoBySlot[2])],
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "Портал потока",
    title: `Соцдем — ${fio(s)}`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1701, right: 850 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename: `${s.last_name} ${s.first_name?.[0] ?? ""}.${s.patronymic?.[0] ? ` ${s.patronymic[0]}.` : ""} Соц.Дем.docx` };
}

export async function exportStudentDocx(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  const result = await buildStudentDocx(id);
  if (!result) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  const encoded = encodeURIComponent(result.filename);
  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
  });
  res.send(result.buffer);
}
