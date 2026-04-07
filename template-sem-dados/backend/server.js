const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const checklistStore = require('./checklist-store');

const app = express();
const PORT = 1455;

const ROOT_DIR = path.join(__dirname, '..');
const INBOX_DIR = path.join(__dirname, 'inbox');
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(ROOT_DIR, 'frontend')));
app.use('/simulados', express.static(path.join(ROOT_DIR, 'simulados')));

async function ensureDirs() {
  await fs.mkdir(INBOX_DIR, { recursive: true });
}

async function readMeta() {
  try {
    return JSON.parse(await fs.readFile(path.join(INBOX_DIR, 'meta.json'), 'utf-8'));
  } catch {
    return [];
  }
}

async function writeMeta(meta) {
  await fs.writeFile(path.join(INBOX_DIR, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

app.get('/api/data', async (req, res) => {
  try {
    res.json(JSON.parse(await fs.readFile(DATA_FILE, 'utf-8')));
  } catch {
    res.json(null);
  }
});

app.get('/api/inbox', async (req, res) => {
  res.json(await readMeta());
});

app.post('/api/inbox/simulado', async (req, res) => {
  const { text, type, name } = req.body;
  if (!text || !type) return res.status(400).json({ error: 'text e type obrigatorios' });

  const id = Date.now();
  const filename = `simulado-${type}-${id}.txt`;
  await fs.writeFile(path.join(INBOX_DIR, filename), text, 'utf-8');

  const meta = await readMeta();
  meta.push({
    id,
    type,
    name: name || `Simulado ${new Date().toLocaleDateString('pt-BR')}`,
    filename,
    status: 'aguardando_respostas',
    createdAt: new Date().toISOString()
  });
  await writeMeta(meta);

  res.json({ ok: true, id, filename });
});

app.post('/api/inbox/respostas', async (req, res) => {
  const { text, simuladoId } = req.body;
  if (!text || !simuladoId) return res.status(400).json({ error: 'text e simuladoId obrigatorios' });

  const filename = `respostas-${simuladoId}.txt`;
  await fs.writeFile(path.join(INBOX_DIR, filename), text, 'utf-8');

  const meta = await readMeta();
  const entry = meta.find((m) => m.id === Number(simuladoId));
  if (entry) {
    entry.respostasFilename = filename;
    entry.status = 'pronto_para_analise';
  }
  await writeMeta(meta);

  res.json({ ok: true, filename });
});

app.get('/api/checklist', async (req, res) => {
  try {
    const snapshot = checklistStore.getChecklistSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error('[checklist:get] erro', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/checklist/:itemId', async (req, res) => {
  try {
    const itemId = String(req.params.itemId || '').trim();
    if (!itemId) return res.status(400).json({ error: 'itemId obrigatorio' });
    const item = checklistStore.updateItemProgress(itemId, req.body || {});
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[checklist:patch] erro', err);
    res.status(400).json({ error: err.message });
  }
});

ensureDirs().then(() => {
  checklistStore.initStore();
  app.listen(PORT, () => {
    console.log(`\n  Backend rodando em http://localhost:${PORT}`);
    console.log(`  Abre http://localhost:${PORT} no navegador\n`);
  });
});
