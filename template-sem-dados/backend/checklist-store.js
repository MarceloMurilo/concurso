const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.join(__dirname, '..');
const CHECKLIST_MD = path.join(ROOT_DIR, 'plano-estudos-checklist.md');
const DB_FILE = path.join(__dirname, 'study-progress.sqlite');

const DISCIPLINE_BY_SECTION = {
  1: 'Portugues',
  2: 'Informatica',
  3: 'Legislacao',
  4: 'Conhecimentos Especificos'
};

const DISCIPLINE_KEY = {
  Portugues: 'portugues',
  Informatica: 'informatica',
  Legislacao: 'legislacao',
  'Conhecimentos Especificos': 'especificos'
};

const PRIORITY_ORDER = { A: 1, B: 2, C: 3 };
const DISCIPLINE_ORDER = { Legislacao: 1, Informatica: 2, 'Conhecimentos Especificos': 3, Portugues: 4 };

let db = null;

function openDb() {
  if (!db) db = new DatabaseSync(DB_FILE);
  return db;
}

function initStore() {
  const conn = openDb();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS checklist_progress (
      item_id TEXT PRIMARY KEY,
      status TEXT CHECK(status IN ('nao_visto', 'revisao', 'consolidado')),
      seen_extra INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function cleanText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(input) {
  return cleanText(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function statusFromMark(mark) {
  if (mark === 'x' || mark === 'X') return 'consolidado';
  if (mark === '/') return 'revisao';
  return 'nao_visto';
}

function extractSeenBase(text) {
  const m = text.match(/visto em prova:\s*(\d+)x/i);
  return m ? Number(m[1]) : 0;
}

function stripTrailingNotes(text) {
  return text.replace(/\s+\((visto em prova:.*|Consolidado.*|Simulado.*|23\/03:.*)\)\s*$/i, '').trim();
}

function parseChecklistMarkdown() {
  const raw = fs.readFileSync(CHECKLIST_MD, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const items = [];

  let sectionNumber = null;
  let discipline = null;
  let subsection = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    const secMatch = line.match(/^##\s+([1-9])\)/);
    if (secMatch) {
      sectionNumber = Number(secMatch[1]);
      discipline = DISCIPLINE_BY_SECTION[sectionNumber] || null;
      subsection = '';
      continue;
    }

    if (/^##\s+/.test(line) && !secMatch) {
      sectionNumber = null;
      discipline = null;
      subsection = '';
      continue;
    }

    if (!discipline) continue;

    const subMatch = line.match(/^###\s+(.*)$/);
    if (subMatch) {
      subsection = subMatch[1].trim();
      continue;
    }

    const itemMatch = line.match(/^(\d+)\.\s+\[(.| )\]\s+(.*)$/);
    if (!itemMatch) continue;

    const orderInSubsection = Number(itemMatch[1]);
    const mark = itemMatch[2];
    const fullText = itemMatch[3].trim();
    const topic = stripTrailingNotes(fullText);
    const baseStatus = statusFromMark(mark);
    const seenBase = extractSeenBase(fullText);

    const id = [
      sectionNumber,
      slugify(subsection || 'geral'),
      orderInSubsection,
      slugify(topic).slice(0, 80)
    ].join('-');

    items.push({
      id,
      discipline,
      disciplineKey: DISCIPLINE_KEY[discipline] || 'outros',
      sectionNumber,
      subsection,
      orderInSubsection,
      topic,
      baseStatus,
      seenBase,
      sourceLine: i + 1
    });
  }

  return items;
}

function computePriority(item) {
  if (item.currentStatus === 'revisao') return 'A';
  if (item.currentStatus === 'nao_visto') {
    if (item.discipline !== 'Portugues') return 'A';
    return item.seenTotal > 0 ? 'A' : 'B';
  }
  return 'C';
}

function getProgressMap(conn) {
  const rows = conn.prepare(`
    SELECT item_id, status, seen_extra
    FROM checklist_progress
  `).all();

  const map = new Map();
  for (const row of rows) map.set(row.item_id, row);
  return map;
}

function getChecklistSnapshot() {
  const conn = openDb();
  const baseItems = parseChecklistMarkdown();
  const progressMap = getProgressMap(conn);

  const items = baseItems.map((base) => {
    const pg = progressMap.get(base.id);
    const seenExtra = Number(pg?.seen_extra || 0);
    const currentStatus = pg?.status || base.baseStatus;
    const seenTotal = base.seenBase + Math.max(0, seenExtra);
    const merged = {
      ...base,
      currentStatus,
      seenExtra: Math.max(0, seenExtra),
      seenTotal
    };
    merged.priority = computePriority(merged);
    return merged;
  });

  items.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const d = (DISCIPLINE_ORDER[a.discipline] || 99) - (DISCIPLINE_ORDER[b.discipline] || 99);
    if (d !== 0) return d;
    if (a.sectionNumber !== b.sectionNumber) return a.sectionNumber - b.sectionNumber;
    if (a.subsection !== b.subsection) return a.subsection.localeCompare(b.subsection);
    return a.orderInSubsection - b.orderInSubsection;
  });

  const summary = {
    total: items.length,
    byStatus: {
      nao_visto: items.filter((x) => x.currentStatus === 'nao_visto').length,
      revisao: items.filter((x) => x.currentStatus === 'revisao').length,
      consolidado: items.filter((x) => x.currentStatus === 'consolidado').length
    },
    byPriority: {
      A: items.filter((x) => x.priority === 'A').length,
      B: items.filter((x) => x.priority === 'B').length,
      C: items.filter((x) => x.priority === 'C').length
    },
    byDiscipline: Object.fromEntries(
      Object.keys(DISCIPLINE_ORDER).map((disc) => [
        disc,
        {
          total: items.filter((x) => x.discipline === disc).length,
          nao_visto: items.filter((x) => x.discipline === disc && x.currentStatus === 'nao_visto').length,
          revisao: items.filter((x) => x.discipline === disc && x.currentStatus === 'revisao').length,
          consolidado: items.filter((x) => x.discipline === disc && x.currentStatus === 'consolidado').length
        }
      ])
    )
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(CHECKLIST_MD),
    summary,
    items
  };
}

function updateItemProgress(itemId, payload = {}) {
  const conn = openDb();
  const parsed = getChecklistSnapshot();
  const exists = parsed.items.find((x) => x.id === itemId);
  if (!exists) throw new Error('item_id nao encontrado no checklist atual');

  const seenDeltaRaw = Number(payload.seenDelta || 0);
  const seenDelta = Number.isFinite(seenDeltaRaw) ? Math.trunc(seenDeltaRaw) : 0;
  const status = payload.status;
  const validStatus = status == null || ['nao_visto', 'revisao', 'consolidado'].includes(status);
  if (!validStatus) throw new Error('status invalido');

  const current = conn.prepare(`
    SELECT item_id, status, seen_extra
    FROM checklist_progress
    WHERE item_id = ?
  `).get(itemId);

  const nextSeen = Math.max(0, Number(current?.seen_extra || 0) + seenDelta);
  const nextStatus = status ?? current?.status ?? null;

  conn.prepare(`
    INSERT INTO checklist_progress (item_id, status, seen_extra, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(item_id) DO UPDATE SET
      status = excluded.status,
      seen_extra = excluded.seen_extra,
      updated_at = CURRENT_TIMESTAMP
  `).run(itemId, nextStatus, nextSeen);

  return getChecklistSnapshot().items.find((x) => x.id === itemId);
}

module.exports = {
  initStore,
  getChecklistSnapshot,
  updateItemProgress
};

