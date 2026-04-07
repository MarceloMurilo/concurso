/* ═══════════════════════════════════════════════════
   Painel de Estudos UFMA — app.js
═══════════════════════════════════════════════════ */

const API = `${window.location.origin}/api`;
let data       = null;
let pendingSimuladoId = null;
let chartEvolucao     = null;
let chartDisciplinas  = null;
let activeFilter    = 'todos';
let activeTab       = 'edital';
let evolucaoMode    = 'geral';   // 'geral' | 'tendencia' | 'area'
let discSimCount    = 3;         // 3 | 5 | 0 (todos)
let checklistData   = null;

// ─── BOOT ─────────────────────────────────────────

async function init() {
  initTheme();
  setupTabs();
  setupModal();
  // setupConfig(); // IA desativada no template
  // setupChat(); // IA desativada no template
  setupCheckpoint();
  setupFilter();
  setupChecklist();
  setupMobile();
  updateCountdown();
  setInterval(updateCountdown, 60000);

  await checkBackend();
  // await loadAuthStatus(); // IA desativada no template
  // await loadConfig(); // IA desativada no template
  await loadData();
  await loadChecklist();

}

// ─── TEMA CLARO / ESCURO ──────────────────────────

function initTheme() {
  const saved = localStorage.getItem('ufma_theme') || 'dark';
  applyTheme(saved, false);

  // Registra os dois botões de toggle (sidebar + mobile)
  document.getElementById('themeToggleSidebar')?.addEventListener('click', toggleTheme);
  document.getElementById('themeToggleMobile')?.addEventListener('click', toggleTheme);
}

function applyTheme(theme, animate = true) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ufma_theme', theme);
  updateThemeIcons(theme);
  // Re-renderiza charts com novas cores se estiver na aba certa
  if (animate && activeTab === 'desempenho' && data) {
    requestAnimationFrame(() => renderCharts());
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function updateThemeIcons(theme) {
  const icon = theme === 'dark' ? '☀' : '◑';
  document.querySelectorAll('.theme-icon').forEach(el => { el.textContent = icon; });
}

// ─── MOBILE (sidebar drawer + bottom nav) ─────────

function setupMobile() {
  const hamburger = document.getElementById('hamburgerBtn');
  const overlay   = document.getElementById('sidebarOverlay');
  const sidebar   = document.getElementById('sidebar');
  const btnNovoMobile = document.getElementById('btnNovoMobile');

  hamburger?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });

  overlay?.addEventListener('click', closeSidebar);

  btnNovoMobile?.addEventListener('click', openModal);

  // Bottom nav
  document.querySelectorAll('.mob-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      closeSidebar();
    });
  });
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

// ─── BACKEND STATUS ───────────────────────────────

async function checkBackend() {
  const dot   = document.querySelector('.status-dot');
  const label = document.querySelector('.status-label');
  try {
    const res = await fetch(`${API}/data`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className     = 'status-dot online';
      label.textContent = 'backend online';
      return true;
    }
  } catch {}
  dot.className     = 'status-dot offline';
  label.textContent = 'backend offline';
  return false;
}

async function loadData() {
  try {
    const res = await fetch(`${API}/data`);
    if (res.ok) {
      const json = await res.json();
      if (json) {
        data = json;
        localStorage.setItem('ufma_data_cache', JSON.stringify(data));
        renderAll();
        return;
      }
    }
  } catch {}
  const cached = localStorage.getItem('ufma_data_cache');
  if (cached) {
    try { data = JSON.parse(cached); renderAll(); } catch {}
  }
}

async function loadChecklist() {
  try {
    const res = await fetch(`${API}/checklist`);
    if (!res.ok) throw new Error('Falha ao carregar checklist');
    checklistData = await res.json();
    renderChecklist();
    renderEdital();
    renderKPIs();
  } catch (err) {
    const list = document.getElementById('checklistList');
    if (list) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-title">Checklist indisponivel</div><div class="empty-state-sub">${err.message}</div></div>`;
    }
  }
}


// ─── RENDER ORCHESTRATION ─────────────────────────

function renderAll() {
  renderKPIs();
  renderEdital();
  renderSimTable(getFilteredSims());
  renderBrutos55();
  renderErros();
  renderCheckpoint();
  renderChecklist();
  if (activeTab === 'desempenho') renderCharts();
}

function setupCheckpoint() {
  document.getElementById('btnRefreshCheckpoint')?.addEventListener('click', renderCheckpoint);
  document.getElementById('btnCopyCheckpoint')?.addEventListener('click', async () => {
    const txt = document.getElementById('checkpointText');
    if (!txt?.value) return;
    try {
      await navigator.clipboard.writeText(txt.value);
      showConfigFeedback('✓ Checkpoint copiado para area de transferencia.', true);
    } catch {
      txt.select();
      document.execCommand('copy');
      showConfigFeedback('✓ Checkpoint copiado (modo alternativo).', true);
    }
  });
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function calcDaysLeft() {
  const examDateRaw = data?.examDate || '2026-04-26';
  const exam = new Date(`${examDateRaw}T08:00:00`);
  const now = new Date();
  return Math.max(0, Math.ceil((exam - now) / 86400000));
}

function buildTopicIntelligence(currentData) {
  const corpusParts = [];
  for (const ep of currentData.errorPatterns || []) corpusParts.push(ep.topic || '');
  for (const i of currentData.insights || []) corpusParts.push(i || '');
  for (const r of currentData.recommendations || []) corpusParts.push(r || '');
  for (const s of currentData.simulations || []) {
    for (const t of s.wrongTopics || []) corpusParts.push(t || '');
  }
  const corpus = normalizeText(corpusParts.join(' | '));

  const errorPatternsNorm = (currentData.errorPatterns || []).map((ep) => ({
    topic: normalizeText(ep.topic),
    count: num(ep.count, 0),
    severity: (ep.severity || '').toLowerCase()
  }));

  const result = {};
  for (const [disc, topics] of Object.entries(EDITAL_TOPIC_BANK)) {
    const rows = topics.map((topic) => {
      const keys = topic.keys.map(normalizeText);
      let mentionHits = 0;
      let errorHits = 0;
      let sevHigh = false;

      for (const key of keys) {
        if (corpus.includes(key)) mentionHits += 1;
        for (const ep of errorPatternsNorm) {
          if (ep.topic.includes(key)) {
            errorHits += ep.count || 1;
            if (ep.severity === 'high') sevHigh = true;
          }
        }
      }

      const status =
        errorHits > 0 ? (sevHigh ? 'critico' : 'atencao') :
        mentionHits > 0 ? 'visto' :
        'posterior';

      return { ...topic, status, errorHits, mentionHits };
    });
    result[disc] = rows;
  }

  return result;
}

function renderCheckpoint() {
  const el = document.getElementById('checkpointText');
  if (!el) return;
  if (!data) {
    el.value = 'Sem dados carregados para gerar checkpoint.';
    return;
  }

  const sims = Array.isArray(data.simulations) ? data.simulations : [];
  const totalSims = sims.length;
  const simulados55 = sims.filter((s) => s.type === 'simuladao');
  const simuladinhos = sims.filter((s) => s.type === 'simuladinho');
  const last = sims.length ? sims[sims.length - 1] : null;
  const prev = sims.length > 1 ? sims[sims.length - 2] : null;
  const lastPct = num(last?.pct, null);
  const prevPct = num(prev?.pct, null);
  const delta = lastPct != null && prevPct != null ? (lastPct - prevPct) : null;

  const cov = data.editalCoverage || {};
  const kpis = data.kpis || {};
  const daysLeft = calcDaysLeft();
  const topicIntel = buildTopicIntelligence(data);
  const critical = (data.errorPatterns || []).filter((e) => (e.severity || '').toLowerCase() === 'high');
  const medium = (data.errorPatterns || []).filter((e) => (e.severity || '').toLowerCase() === 'medium');

  const disc = ['portugues', 'informatica', 'legislacao', 'especificos']
    .map((d) => {
      const pct = num(cov?.[d]?.pct, null);
      return { d, pct };
    })
    .filter((x) => x.pct != null)
    .sort((a, b) => a.pct - b.pct);

  const riskLabel =
    daysLeft <= 7 ? 'Risco alto por janela curta' :
    daysLeft <= 14 ? 'Risco moderado com necessidade de foco cirurgico' :
    'Risco controlavel com execucao disciplinada';

  const criticalTopics = critical.slice(0, 10).map((e) => `- ${e.topic} (${e.count}x)`).join('\n') || '- Nenhum critico classificado.';
  const mediumTopics = medium.slice(0, 10).map((e) => `- ${e.topic} (${e.count}x)`).join('\n') || '- Nenhum medio classificado.';
  const insightList = (data.insights || []).map((x) => `- ${x}`).join('\n') || '- Sem insights adicionais.';
  const recList = (data.recommendations || []).map((x) => `- ${x}`).join('\n') || '- Sem recomendacoes adicionais.';

  const discView = disc.map(({ d, pct }) => `- ${d}: ${pct}%`).join('\n') || '- Sem cobertura por disciplina.';

  const discOrder = ['portugues', 'legislacao', 'especificos', 'informatica'];
  const topicBlocks = discOrder
    .map((d) => {
      const rows = topicIntel[d] || [];
      const crit = rows.filter((r) => r.status === 'critico').map((r) => `  - ${r.name}`).join('\n') || '  - Nenhum critico mapeado.';
      const atenc = rows.filter((r) => r.status === 'atencao').map((r) => `  - ${r.name}`).join('\n') || '  - Nenhum de atencao mapeado.';
      const visto = rows.filter((r) => r.status === 'visto').map((r) => `  - ${r.name}`).join('\n') || '  - Nenhum visto sem erro relevante.';
      const post = rows.filter((r) => r.status === 'posterior').map((r) => `  - ${r.name}`).join('\n') || '  - Nenhum posterior pendente.';
      return [
        `Disciplina: ${d}`,
        'Assuntos criticos (erro recorrente):',
        crit,
        'Assuntos em atencao (ja apareceram, ainda frageis):',
        atenc,
        'Assuntos ja vistos sem sinal forte de erro:',
        visto,
        'Assuntos posteriores / pouco evidenciados (prioridade de expansao):',
        post
      ].join('\n');
    })
    .join('\n\n');

  const plan = [
    daysLeft <= 7 ? '- Revisao diaria guiada por erro + simulados curtos com correcao ativa.' : '- 1 bloco diario de teoria + 1 bloco de questoes + 1 bloco de revisao de erros.',
    '- Priorizar topicos de severidade alta ate reduzir reincidencia.',
    '- Manter legislacao e portugues normativo em rotacao continua.',
    '- Fechar cada sessao com atualizacao de checklist e diario.',
    '- Abracar assuntos posteriores de especificos para ampliar cobertura do edital sem repetir excesso.'
  ].join('\n');

  const now = new Date().toLocaleString('pt-BR');
  const txt = [
    `CHECKPOINT DE ESTUDO - GERADO EM ${now}`,
    '',
    '1) RESUMO EXECUTIVO',
    `- Dias restantes para prova: ${daysLeft}`,
    `- Avaliacao de risco temporal: ${riskLabel}`,
    `- Total de provas registradas: ${totalSims} (simulados 55q: ${simulados55.length}; simuladinhos: ${simuladinhos.length})`,
    `- Media geral atual (kpi): ${kpis.avgPct != null ? `${kpis.avgPct}%` : 'n/d'}`,
    `- Ultima prova: ${last?.name || 'n/d'} (${lastPct != null ? `${lastPct}%` : 'n/d'})`,
    `- Delta ultima vs anterior: ${delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} p.p.` : 'n/d'}`,
    '',
    '2) COBERTURA DO EDITAL',
    `- Cobertura geral: ${cov.overall != null ? `${cov.overall}%` : 'n/d'}`,
    discView,
    '',
    '3) PADROES DE ERRO (PRIORIDADE)',
    'Criticos:',
    criticalTopics,
    '',
    'Medios:',
    mediumTopics,
    '',
    '4) INSIGHTS E RECOMENDACOES DO SISTEMA',
    insightList,
    '',
    recList,
    '',
    '5) ASSUNTOS ESPECIFICOS POR DISCIPLINA (baseado no edital/content.txt)',
    topicBlocks,
    '',
    '6) GARGALOS ATUAIS',
    '- Reincidencia em topicos conceituais e normativos de maior pegadinha.',
    '- Oscilacao de desempenho quando aumenta carga/complexidade da prova.',
    '- Necessidade de transformar erro recorrente em revisao direcionada com evidencia de melhoria.',
    '',
    '7) PLANO OBJETIVO DE ESTUDO (PROXIMOS DIAS)',
    plan,
    '',
    '8) INSTRUCAO PARA OUTRA LLM',
    'Use este checkpoint para:',
    '- propor plano de revisao de 3 a 7 dias sem repetir excesso de assuntos ja vistos;',
    '- atacar primeiro os topicos criticos;',
    '- puxar os assuntos posteriores pouco evidenciados para ampliar cobertura do edital;',
    '- sugerir bateria curta de questoes por topico com criterio de aprovacao;',
    '- manter estrategia de recuperacao de pontos por custo-beneficio.'
  ].join('\n');

  el.value = txt;
}

function updateCountdown() {
  const examDate = new Date('2026-04-26T08:00:00');
  const days     = Math.ceil((examDate - new Date()) / 86400000);

  const el  = document.getElementById('daysRemaining');
  const bar = document.getElementById('countdownBar');
  if (!el) return;

  el.textContent = days > 0 ? days : 0;
  el.className   = 'countdown-number ' + (days <= 7 ? 'urgent' : days >= 20 ? 'ok' : '');

  const elapsed = Math.max(0, 35 - days);
  if (bar) bar.style.width = Math.min(100, (elapsed / 35) * 100) + '%';
}

// ─── KPIs ─────────────────────────────────────────

function renderKPIs() {
  if (!data) return;
  const k   = data.kpis || {};
  const cov = getEffectiveEditalCoverage() || data.editalCoverage || {};

  setKpi('kpiMedia',  k.avgPct         != null ? k.avgPct + '%'    : '—');
  setKpi('kpiEdital', cov.overall      != null ? cov.overall + '%' : '—');
  setKpi('kpiTotal',  k.totalQuestions != null ? k.totalQuestions  : '—');
  setKpi('kpiSims',   `${k.simuladoes ?? 0}+${k.simuladinhos ?? 0}`);

  const trendEl = document.querySelector('#kpiTrend .kpi-val');
  if (trendEl) {
    const t = k.trend;
    trendEl.className  = 'kpi-val kpi-trend-icon ' + (t === 'up' ? 'trend-up' : t === 'down' ? 'trend-down' : 'trend-neutral');
    trendEl.textContent = t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
  }
}

function setKpi(id, value) {
  const el = document.querySelector(`#${id} .kpi-val`);
  if (el) el.textContent = value;
}

// ─── EDITAL ───────────────────────────────────────

const DISC_META = {
  portugues:   { label: 'Língua Portuguesa',              total: 20 },
  informatica: { label: 'Noções de Informática',          total: 10 },
  legislacao:  { label: 'Legislação e Normas',            total: 20 },
  especificos: { label: 'Conhecimentos Específicos (TI)', total: 60 }
};


// Banco de topicos extraido do edital (content.txt) para checkpoint detalhado.
const EDITAL_TOPIC_BANK = {
  portugues: [
    { name: 'Generos e tipos textuais', keys: ['tipologia', 'narrativa', 'descritiva', 'argumentativa', 'injuntiva'] },
    { name: 'Compreensao/interpretacao, inferencias e pressupostos', keys: ['interpreta', 'inferencia', 'pressuposto', 'subentendido'] },
    { name: 'Coesao, coerencia e textualidade', keys: ['coesao', 'coerencia', 'intertextual', 'informatividade'] },
    { name: 'Semantica (sinonimia, antonimia, polissemia, ambiguidade)', keys: ['polissemia', 'sinon', 'anton', 'ambig', 'figuras de linguagem'] },
    { name: 'Morfologia e formacao de palavras', keys: ['morfologia', 'formacao de palavras', 'classes de palavras', 'elementos morficos'] },
    { name: 'Sintaxe (termos, subordinacao, coordenacao, concordancia, regencia)', keys: ['sintaxe', 'coordenacao', 'subordinacao', 'concordancia', 'regencia'] },
    { name: 'Norma culta (pontuacao, acentuacao, crase, colocacao pronominal)', keys: ['pontuacao', 'acentuacao', 'crase', 'colocacao pronominal', 'proclise'] },
    { name: 'Redacao oficial (padrao oficio e documentos)', keys: ['redacao oficial', 'oficio', 'ata', 'portaria', 'relatorio', 'manual de redacao'] }
  ],
  informatica: [
    { name: 'Windows (interface, arquivos e pastas)', keys: ['windows', 'arquivos', 'pastas'] },
    { name: 'Office (Word, Excel, PowerPoint)', keys: ['word', 'excel', 'powerpoint', 'procv'] },
    { name: 'Internet/Intranet/Extranet e navegacao', keys: ['internet', 'intranet', 'extranet', 'navegador', 'web'] },
    { name: 'Seguranca basica (virus, malware, phishing, backup, nuvem)', keys: ['virus', 'malware', 'phishing', 'backup', 'nuvem', 'ransomware'] },
    { name: 'IA no setor publico (legal, etica, automacao e produtividade)', keys: ['ia', 'inteligencia artificial', 'etica', 'explicabilidade', 'automacao'] }
  ],
  legislacao: [
    { name: 'CF: principios fundamentais e direitos/garantias', keys: ['cf', 'art. 5', 'direitos fundamentais', 'limpe', 'organizacao do estado'] },
    { name: 'Lei 8.112 (RJU): provimento, direitos, deveres, proibicoes, penalidades', keys: ['8.112', 'regime juridico', 'provimento', 'dever', 'proibicao', 'penalidade'] },
    { name: 'Lei 11.091/2005 (TAE)', keys: ['11.091', 'tae', 'progressao por capacitacao', 'progressao por merito'] },
    { name: 'Decreto 1.171/1994 (Codigo de Etica)', keys: ['1.171', 'codigo de etica', 'censura'] },
    { name: 'Lei 9.784/1999 (processo administrativo)', keys: ['9.784', 'processo administrativo', 'prazo recursal'] },
    { name: 'Lei 8.429/1992 (improbidade)', keys: ['8.429', 'improbidade', 'dolo especifico'] },
    { name: 'LAI (12.527/2011)', keys: ['lai', '12.527', 'ultrassecreta', 'transparencia ativa', 'transparencia passiva'] },
    { name: 'LGPD (13.709/2018)', keys: ['lgpd', '13.709', 'dado sensivel', 'bases legais', 'direitos do titular'] }
  ],
  especificos: [
    { name: 'Planejamento estrategico (BSC, SWOT, OKR, indicadores)', keys: ['bsc', 'swot', 'okr', 'indicadores'] },
    { name: 'Gestao de projetos (PMBOK, escopo, integracao, riscos)', keys: ['pmbok', 'escopo', 'integracao', 'riscos'] },
    { name: 'BPM/BPMN e desenho de processos', keys: ['bpmn', 'bpm', 'processos de negocio'] },
    { name: 'Governanca e seguranca (ITIL, COBIT, ISO 27001/27005/31000)', keys: ['itil', 'cobit', 'iso 27001', 'iso 27005', 'iso 31000'] },
    { name: 'Compras e contratacoes de TI', keys: ['contratacoes', 'compras governamentais', 'sustentabilidade'] },
    { name: 'Sistemas operacionais (escalonamento, concorrencia, deadlock, memoria)', keys: ['escalonamento', 'preemptivo', 'deadlock', 'memoria virtual', 'swapping'] },
    { name: 'Redes (camadas, TCP/UDP, IPv4/IPv6, roteamento, servicos e portas)', keys: ['tcp', 'udp', 'ipv4', 'ipv6', 'dns', 'dhcp', 'ldap', 'snmp', 'porta'] },
    { name: 'Programacao e estruturas (Python, Java, POO, arvores, pilha/fila)', keys: ['python', 'java', 'poo', 'arvore', 'pilha', 'fila', 'algoritmo'] },
    { name: 'Web/Mobile (HTML, CSS, JS, XML, frameworks, persistencia)', keys: ['html', 'css', 'javascript', 'xml', 'mobile', 'persistencia'] },
    { name: 'Engenharia/DevOps/APIs (MVC, testes, CI/CD, REST, Git)', keys: ['mvc', 'teste unitario', 'ci', 'cd', 'rest', 'git'] },
    { name: 'Banco de dados (ER, normalizacao, SQL, NoSQL)', keys: ['normalizacao', 'sql', 'ddl', 'dml', 'nosql', 'acid', 'er'] },
    { name: 'Big Data/DW/ETL/KDD/Mineracao/ML/LLM', keys: ['big data', 'hadoop', 'spark', 'kafka', 'etl', 'dw', 'kdd', 'mineracao', 'ml', 'llm'] },
    { name: 'Estatistica e inferencia (probabilidade, testes, regressao, amostragem)', keys: ['estatistica', 'inferencia', 'erro tipo i', 'regressao', 'amostragem', 'probabilidade'] }
  ]
};
function renderEdital() {
  const cov = getEffectiveEditalCoverage() || data?.editalCoverage;
  if (!cov) return;

  const overall = cov.overall ?? 0;
  document.getElementById('overallPct').textContent = overall + '%';
  requestAnimationFrame(() => {
    document.getElementById('overallBar').style.width = overall + '%';
  });

  const grid = document.getElementById('disciplinesGrid');
  grid.innerHTML = '';

  for (const [key, meta] of Object.entries(DISC_META)) {
    const d     = cov[key] || {};
    const pct   = d.pct  ?? 0;
    const done  = d.done ?? Math.round(pct / 100 * meta.total);
    const total = d.total ?? meta.total;
    const level = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
    const badge = pct >= 70 ? 'Em dia' : pct >= 40 ? 'Parcial' : 'Crítico';

    grid.innerHTML += `
      <div class="disc-card">
        <div class="disc-card-header">
          <div class="disc-name">${meta.label}</div>
          <div class="disc-badge ${level}">${badge}</div>
        </div>
        <div class="disc-bar-wrap">
          <div class="disc-bar pct-${level}" data-pct="${pct}" style="width:0"></div>
        </div>
        <div class="disc-stats">
          <div class="disc-pct-val">${pct}%</div>
          <div class="disc-done">${done} / ${total} tópicos</div>
        </div>
      </div>`;
  }

  requestAnimationFrame(() => {
    document.querySelectorAll('.disc-bar[data-pct]').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });
}

function getEffectiveEditalCoverage() {
  if (!checklistData?.items?.length) return data?.editalCoverage || null;

  const discMap = {
    Portugues: 'portugues',
    Informatica: 'informatica',
    Legislacao: 'legislacao',
    'Conhecimentos Especificos': 'especificos'
  };

  const cov = { overall: 0 };
  let totalAll = 0;
  let doneAll = 0;

  for (const [key, meta] of Object.entries(DISC_META)) {
    const discName = Object.keys(discMap).find((d) => discMap[d] === key);
    const rows = checklistData.items.filter((x) => x.discipline === discName);
    const total = rows.length || meta.total || 0;
    const done = rows.filter((x) => x.currentStatus === 'consolidado').length;
    const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
    cov[key] = { done, total, pct };
    totalAll += total;
    doneAll += done;
  }

  cov.overall = totalAll > 0 ? Math.round((doneAll / totalAll) * 1000) / 10 : 0;
  return cov;
}

// ─── DESEMPENHO ───────────────────────────────────

function getFilteredSims() {
  if (!data?.simulations) return [];
  if (activeFilter === 'todos') return data.simulations;
  return data.simulations.filter(s => s.type === activeFilter);
}

function pctClass(v) {
  if (v == null) return '';
  return v >= 70 ? 'high' : v >= 55 ? 'medium' : 'low';
}

function sectionPct(sim, key) {
  const v = sim.sections?.[key];
  if (!v) return null;
  if (v.pct != null) return v.pct;
  if (v.total) return (v.correct / v.total) * 100;
  return null;
}

function fmtPct(v) { return v == null ? '—' : v.toFixed(0) + '%'; }

function renderSimTable(sims) {
  const tbody = document.getElementById('simTableBody');
  if (!tbody) return;
  if (!sims.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:24px">Nenhum simulado</td></tr>';
    return;
  }
  tbody.innerHTML = [...sims].reverse().map(s => {
    const p  = s.pct ?? 0;
    const tp = s.type === 'simuladao' ? 'simuladão' : 'simuladinho';
    const sp = k => sectionPct(s, k);
    return `<tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${s.date || '—'}</td>
      <td>${s.name || '—'}</td>
      <td><span class="badge-tipo ${s.type || ''}">${tp}</span></td>
      <td style="font-family:'JetBrains Mono',monospace">${s.correct ?? '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;color:var(--text-dim)">${s.total ?? '—'}</td>
      <td><span class="td-pct ${pctClass(p)}">${p.toFixed(1)}%</span></td>
      <td class="td-pct ${pctClass(sp('portugues'))}">${fmtPct(sp('portugues'))}</td>
      <td class="td-pct ${pctClass(sp('informatica'))}">${fmtPct(sp('informatica'))}</td>
      <td class="td-pct ${pctClass(sp('legislacao'))}">${fmtPct(sp('legislacao'))}</td>
      <td class="td-pct ${pctClass(sp('especificos'))}">${fmtPct(sp('especificos'))}</td>
    </tr>`;
  }).join('');
}

function toRoman(n) {
  const map = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let x = Number(n) || 0;
  let out = '';
  for (const [v, r] of map) {
    while (x >= v) {
      out += r;
      x -= v;
    }
  }
  return out;
}

function renderBrutos55() {
  const box = document.getElementById('brutos55List');
  if (!box) return;

  const sims = Array.isArray(data?.simulations) ? data.simulations : [];
  const sims55 = sims
    .map((s, idx) => ({ ...s, _idx: idx }))
    .filter((s) => Number(s.total) === 55)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a._idx - b._idx);

  if (!sims55.length) {
    box.innerHTML = '<p style="color:var(--text-dim)">Nenhum simulado de 55 questoes encontrado.</p>';
    return;
  }

  box.innerHTML = sims55.map((s, i) => {
    const roman = toRoman(i + 1);
    const filename = `SIMULADO-${roman}.md`;
    const href = `/simulados/brutos/${filename}`;
    return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border)">
        <div>
          <strong>SIMULADO ${roman}</strong>
          <div style="color:var(--text-dim);font-size:12px">${s.date || '-'} • ${s.correct ?? '-'} / ${s.total ?? '-'}</div>
        </div>
        <a href="${href}" target="_blank" rel="noopener" style="font-size:12px">abrir bruto</a>
      </div>
    `;
  }).join('');
}

// Lê CSS vars para charts (adapta ao tema atual)
function chartColors() {
  const s      = getComputedStyle(document.documentElement);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    textDim:   s.getPropertyValue('--text-dim').trim()  || (isDark ? '#7ba8ce' : '#484860'),
    text:      s.getPropertyValue('--text').trim()      || (isDark ? '#c8ddf5' : '#111118'),
    border:    s.getPropertyValue('--border').trim()    || (isDark ? '#1e3050' : '#bdbdc8'),
    bg2:       s.getPropertyValue('--bg-2').trim()      || (isDark ? '#0c1120' : '#ffffff'),
    gridAlpha: isDark ? '44' : 'cc',   // hex opacity for grid lines
    isDark
  };
}

function getRegressionProjection(realPoints) {
  const n = realPoints.length;
  if (!n) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const p of realPoints) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }

  const denominator = (n * sumX2) - (sumX * sumX);
  const m = denominator !== 0 ? ((n * sumXY) - (sumX * sumY)) / denominator : 0;
  const b = (sumY - (m * sumX)) / n;

  return { m, b };
}

function calcMean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calcStd(values, mean) {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, x) => acc + ((x - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calcExcessKurtosis(values, mean) {
  const n = values.length;
  if (n < 4) return null;
  let m2 = 0;
  let m4 = 0;
  for (const x of values) {
    const d = x - mean;
    m2 += d ** 2;
    m4 += d ** 4;
  }
  m2 /= n;
  m4 /= n;
  if (m2 === 0) return 0;
  return (m4 / (m2 * m2)) - 3;
}

function renderKurtosisCard(sims) {
  const kurtosisEl = document.getElementById('kurtosisValue');
  const stdEl = document.getElementById('stdValue');
  const consistencyEl = document.getElementById('consistencyValue');
  const outlierEl = document.getElementById('outlierValue');
  const kurtosisRefEl = document.getElementById('kurtosisRef');
  const stdRefEl = document.getElementById('stdRef');
  if (!kurtosisEl || !stdEl || !consistencyEl || !outlierEl) return;

  const values = (sims || []).map((s) => Number(s?.pct ?? 0)).filter((v) => Number.isFinite(v));
  if (!values.length) {
    kurtosisEl.textContent = '--';
    stdEl.textContent = '--';
    consistencyEl.textContent = '--';
    outlierEl.textContent = '--';
    if (kurtosisRefEl) kurtosisRefEl.textContent = 'Ref: -1 a +1 (faixa estavel)';
    if (stdRefEl) stdRefEl.textContent = 'Ref: ate 4 baixo | 4-8 medio | acima de 8 alto';
    return;
  }

  const mean = calcMean(values);
  const std = calcStd(values, mean);
  const kurt = calcExcessKurtosis(values, mean);

  let consistency = 'Moderada';
  if (std <= 4 && (kurt == null || Math.abs(kurt) <= 1)) consistency = 'Alta';
  else if (std > 8 || (kurt != null && Math.abs(kurt) > 2)) consistency = 'Baixa';

  const last = values[values.length - 1];
  const z = std > 0.0001 ? Math.abs((last - mean) / std) : 0;
  const outlier = z >= 1.8 ? 'Sim' : 'Nao';

  kurtosisEl.textContent = kurt == null ? 'Amostra pequena' : kurt.toFixed(2);
  stdEl.textContent = std.toFixed(2);
  consistencyEl.textContent = consistency;
  outlierEl.textContent = outlier;

  if (stdRefEl) {
    const stdBand = std <= 4 ? 'baixo' : std <= 8 ? 'medio' : 'alto';
    stdRefEl.textContent = `Ref: ate 4 baixo | 4-8 medio | >8 alto (atual: ${stdBand})`;
  }

  if (kurtosisRefEl) {
    if (kurt == null) {
      kurtosisRefEl.textContent = 'Ref: -1 a +1 (faixa estavel) | minimo 4 provas';
    } else {
      const kBand = Math.abs(kurt) <= 1 ? 'estavel' : Math.abs(kurt) <= 2 ? 'moderada' : 'extrema';
      kurtosisRefEl.textContent = `Ref: -1 a +1 estavel | >|2| extrema (atual: ${kBand})`;
    }
  }
}

function renderCharts() {
  if (!data?.simulations) return;
  const filtered = getFilteredSims();
  renderKurtosisCard(filtered);
  renderChartEvolucao(filtered, evolucaoMode);
  renderChartDisciplinas(data.simulations, discSimCount);
}

function renderChartEvolucao(sims, mode = 'geral') {
  const canvas = document.getElementById('chartEvolucao');
  if (!canvas) return;
  if (chartEvolucao) { chartEvolucao.destroy(); chartEvolucao = null; }

  const sorted = [...sims].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!sorted.length) return;

  const cc     = chartColors();
  const labels = sorted.map(s => (s.name || s.date || '').replace('Simulad', 'Sim.').substring(0, 14));

  const sharedScales = {
    x: {
      ticks: { color: cc.textDim, font: { family: "'JetBrains Mono'", size: 9 }, maxRotation: 35 },
      grid:  { color: cc.border + cc.gridAlpha },
      border: { display: false }
    },
    y: {
      min: 0, max: 100,
      ticks: { color: cc.textDim, font: { family: "'JetBrains Mono'", size: 9 }, stepSize: 25, padding: 6, callback: v => v + '%' },
      grid:  { color: cc.border + cc.gridAlpha },
      border: { display: false, dash: [4, 4] }
    }
  };

  let datasets;

  if (mode === 'area') {
    const keys   = ['portugues', 'informatica', 'legislacao', 'especificos'];
    const names  = ['Português', 'Informática', 'Legislação', 'Específicos'];
    const cols   = cc.isDark
      ? ['#3d8ef8', '#22d07a', '#e8b84b', '#f56830']
      : ['#1450cc', '#087a3a', '#7a5500', '#bf3c08'];

    datasets = keys.map((k, i) => ({
      label: names[i],
      data: sorted.map(s => +(sectionPct(s, k) ?? 0).toFixed(1)),
      borderColor: cols[i],
      backgroundColor: cols[i] + '18',
      borderWidth: 2,
      pointBackgroundColor: cols[i],
      pointBorderColor: cc.bg2,
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.3,
      fill: false
    }));
  } else if (mode === 'tendencia') {
    const filteredSimuladoes = (sims || [])
      .filter(s => s.type === 'simuladao')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const baseSimuladoes = filteredSimuladoes.length ? filteredSimuladoes : (data?.simulations || [])
      .filter(s => s.type === 'simuladao')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const fallbackReal = [
      { x: 1, y: 69.0 },
      { x: 2, y: 73.0 },
      { x: 3, y: 65.0 },
      { x: 4, y: 70.9 }
    ];

    const realPoints = baseSimuladoes.length
      ? baseSimuladoes.map((s, idx) => ({ x: idx + 1, y: +(s.pct ?? 0).toFixed(1) }))
      : fallbackReal;

    const regression = getRegressionProjection(realPoints);
    if (!regression) return;

    const { m, b } = regression;
    const trendDirection = m >= 0 ? 'Sobe' : 'Cai';
    const trendAbs = Math.abs(m);
    const eqSignal = b >= 0 ? '+' : '-';
    const projectedAt12 = (m * 12) + b;
    const lastPointIndex = realPoints.length - 1;

    datasets = [
      {
        label: 'Dados Reais',
        data: realPoints,
        borderColor: '#9ca3af',
        borderWidth: 2,
        borderDash: [7, 6],
        fill: false,
        showLine: true,
        tension: 0,
        pointRadius: ctx => ctx.dataIndex === lastPointIndex ? 6 : 5,
        pointHoverRadius: 7,
        pointBorderWidth: 2,
        pointBorderColor: cc.bg2,
        pointBackgroundColor: ctx => ctx.dataIndex === lastPointIndex
          ? (cc.isDark ? '#22d07a' : '#087a3a')
          : (cc.isDark ? '#3d8ef8' : '#1450cc')
      },
      {
        label: 'Regressão Linear',
        data: [
          { x: 0, y: (m * 0) + b },
          { x: 12, y: projectedAt12 }
        ],
        borderColor: '#6366f1',
        borderWidth: 2.6,
        fill: false,
        showLine: true,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0
      }
    ];

    labels.length = 0;
    for (let i = 1; i <= 12; i += 1) labels.push(`Sim. ${i}`);

    sharedScales.x = {
      type: 'linear',
      min: 1,
      max: 12,
      ticks: {
        color: cc.textDim,
        font: { family: "'JetBrains Mono'", size: 9 },
        stepSize: 1,
        callback: value => Number.isInteger(value) ? value : ''
      },
      grid: { color: cc.border + cc.gridAlpha },
      border: { display: false }
    };

    sharedScales.y = {
      min: 0,
      max: 100,
      ticks: {
        color: cc.textDim,
        font: { family: "'JetBrains Mono'", size: 9 },
        stepSize: 10,
        padding: 6,
        callback: v => v + '%'
      },
      grid: { color: cc.border + cc.gridAlpha },
      border: { display: false, dash: [4, 4] }
    };

    chartEvolucao = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: cc.text,
              font: { family: "'Inter'", size: 10, weight: '500' },
              boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 8
            }
          },
          subtitle: {
            display: true,
            color: cc.textDim,
            align: 'start',
            font: { family: "'JetBrains Mono'", size: 10, weight: '500' },
            text: [
              `Tendência: ${trendDirection} ${trendAbs.toFixed(2)}% por simulado | Proj. S12: ${projectedAt12.toFixed(1)}%`,
              `Regressão: y = ${m.toFixed(4)}x ${eqSignal} ${Math.abs(b).toFixed(2)}`
            ],
            padding: { bottom: 8 }
          },
          tooltip: {
            backgroundColor: cc.bg2,
            borderColor: cc.border,
            borderWidth: 1,
            titleColor: cc.text,
            bodyColor: cc.text,
            callbacks: {
              title: items => `Simulado ${Math.round(items?.[0]?.parsed?.x ?? 0)}`,
              label: c => ` ${c.dataset.label}: ${Number(c.parsed.y).toFixed(1)}%`
            }
          }
        },
        scales: sharedScales
      }
    });

    return;
  } else {
    const lineColor = cc.isDark ? '#3d8ef8' : '#1450cc';
    const dotGreen  = cc.isDark ? '#22d07a' : '#087a3a';
    const dotGold   = cc.isDark ? '#e8b84b' : '#7a5500';
    const dotOrange = cc.isDark ? '#f56830' : '#bf3c08';
    const values    = sorted.map(s => +(s.pct ?? 0).toFixed(1));

    datasets = [{
      label: 'Geral',
      data: values,
      borderColor: lineColor,
      backgroundColor: cc.isDark ? 'rgba(61,142,248,0.12)' : 'rgba(20,80,204,0.08)',
      borderWidth: 2.5,
      pointBackgroundColor: values.map(v => v >= 70 ? dotGreen : v >= 55 ? dotGold : dotOrange),
      pointBorderColor: cc.bg2,
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
      tension: 0.35,
      fill: true
    }];
  }

  chartEvolucao = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: mode === 'area',
          position: 'top',
          align: 'end',
          labels: {
            color: cc.text,
            font: { family: "'Inter'", size: 10, weight: '500' },
            boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 8
          }
        },
        tooltip: {
          backgroundColor: cc.bg2,
          borderColor: cc.border,
          borderWidth: 1,
          titleColor: cc.text,
          bodyColor: cc.text,
          callbacks: { label: c => ` ${c.dataset.label}: ${c.raw}%` }
        }
      },
      scales: sharedScales
    }
  });
}

function renderChartDisciplinas(allSims, count = 3) {
  const canvas = document.getElementById('chartDisciplinas');
  if (!canvas) return;
  if (chartDisciplinas) { chartDisciplinas.destroy(); chartDisciplinas = null; }

  const pool      = allSims.filter(s => s.type === 'simuladao');
  const simuladoes = count === 0 ? pool : pool.slice(-count);
  if (!simuladoes.length) return;

  const cc       = chartColors();
  const keys     = ['portugues', 'informatica', 'legislacao', 'especificos'];
  const discLbls = ['Português', 'Informática', 'Legislação', 'Específicos'];

  // paleta cíclica — suporta qualquer quantidade de simulados
  const palette = cc.isDark
    ? ['#3d8ef8cc', '#22d07acc', '#e8b84bcc', '#f56830cc', '#a855f7cc', '#06b6d4cc']
    : ['#1450ccdd', '#087a3add', '#7a5500dd', '#bf3c08dd', '#7c3aeddd', '#0e7490dd'];
  const borders = cc.isDark
    ? ['#3d8ef8', '#22d07a', '#e8b84b', '#f56830', '#a855f7', '#06b6d4']
    : ['#1450cc', '#087a3a', '#7a5500', '#bf3c08', '#7c3aed', '#0e7490'];

  chartDisciplinas = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: discLbls,
      datasets: simuladoes.map((s, i) => ({
        label: (s.name || s.date || `Sim ${i + 1}`).substring(0, 16),
        data: keys.map(k => +(sectionPct(s, k) ?? 0).toFixed(1)),
        backgroundColor: palette[i % palette.length],
        borderColor: borders[i % borders.length],
        borderWidth: 2,
        borderRadius: 5,
        borderSkipped: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: cc.text,
            font: { family: "'Inter'", size: 10, weight: '500' },
            boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 8
          }
        },
        tooltip: {
          backgroundColor: cc.bg2,
          borderColor: cc.border,
          borderWidth: 1,
          titleColor: cc.text,
          bodyColor: cc.text,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: cc.text, font: { family: "'Inter'", size: 11, weight: '600' } },
          border: { display: false }
        },
        y: {
          min: 0, max: 100,
          grid: { color: cc.border + cc.gridAlpha, drawTicks: false },
          border: { display: false, dash: [4, 4] },
          ticks: {
            color: cc.textDim,
            font: { family: "'JetBrains Mono'", size: 10 },
            stepSize: 25, padding: 8, callback: v => v + '%'
          }
        }
      }
    }
  });
}

// ─── ERROS ────────────────────────────────────────

function renderErros() {
  if (!data) return;

  const insightsEl = document.getElementById('insightsBlock');
  if (insightsEl) {
    insightsEl.style.display = data.insights?.length ? '' : 'none';
    if (data.insights?.length)
      insightsEl.innerHTML = data.insights.map(i => `<div class="insight-item">${i}</div>`).join('');
  }

  const recEl = document.getElementById('recommendationsBlock');
  if (recEl) {
    recEl.style.display = data.recommendations?.length ? '' : 'none';
    if (data.recommendations?.length)
      recEl.innerHTML = `<div class="rec-title">AÇÕES PRIORITÁRIAS</div>` +
        data.recommendations.map(r => `<div class="rec-item">${r}</div>`).join('');
  }

  const grid = document.getElementById('errorsGrid');
  if (!grid) return;

  if (!data.errorPatterns?.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-title">Nenhum padrão de erro</div>
      <div class="empty-state-sub">Adicione simulados para a IA identificar seus pontos fracos.</div>
    </div>`;
    return;
  }

  grid.innerHTML = data.errorPatterns.map(ep => `
    <div class="error-card ${ep.severity || 'low'}">
      <div class="error-topic">${ep.topic}</div>
      <div class="error-meta">
        <span class="error-count">${ep.count}× errado</span>
        <span class="error-disc">${ep.discipline || ''}</span>
      </div>
      <div class="error-sev ${ep.severity || 'low'}">${(ep.severity || 'low').toUpperCase()}</div>
    </div>`).join('');
}

// ─── FILTER ───────────────────────────────────────



// --- CHECKLIST ---

function setupChecklist() {
  document.getElementById('btnChecklistReload')?.addEventListener('click', () => loadChecklist());

  document.getElementById('checklistList')?.addEventListener('change', async (e) => {
    const cb = e.target.closest('.simple-check-input');
    if (!cb) return;
    const itemId = cb.dataset.itemId;
    if (!itemId) return;
    const status = cb.checked ? 'consolidado' : 'nao_visto';
    await patchChecklistItem(itemId, { status });
  });
}

function renderChecklist() {
  const summaryEl = document.getElementById('checklistSummary');
  const metaEl = document.getElementById('checklistMeta');
  const listEl = document.getElementById('checklistList');
  if (!summaryEl || !metaEl || !listEl) return;

  if (!checklistData?.items?.length) {
    summaryEl.innerHTML = '';
    metaEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">Sem itens no checklist</div><div class="empty-state-sub">Verifique o arquivo plano-estudos-checklist.md.</div></div>';
    return;
  }

  const items = checklistData.items || [];
  const sx = {
    total: items.length,
    byStatus: {
      consolidado: items.filter((x) => x.currentStatus === 'consolidado').length,
      nao_visto: items.filter((x) => x.currentStatus !== 'consolidado').length
    }
  };
  summaryEl.innerHTML =
    '<div class="check-kpi"><strong>' + (sx.total ?? 0) + '</strong><span>Total</span></div>' +
    '<div class="check-kpi"><strong>' + (sx.byStatus?.consolidado ?? 0) + '</strong><span>Marcados</span></div>' +
    '<div class="check-kpi"><strong>' + (sx.byStatus?.nao_visto ?? 0) + '</strong><span>Pendentes</span></div>';

  metaEl.textContent = 'Itens: ' + items.length;

  const discOrder = ['Legislacao', 'Informatica', 'Conhecimentos Especificos', 'Portugues'];
  const groups = discOrder
    .map((disc) => ({
      disc,
      rows: items.filter((x) => x.discipline === disc)
    }))
    .filter((g) => g.rows.length > 0);

  listEl.innerHTML = groups
    .map((g) => {
      const rows = g.rows
        .map((item) => {
          const checked = item.currentStatus === 'consolidado' ? 'checked' : '';
          return (
            '<label class="simple-check-item">' +
              '<input class="simple-check-input" type="checkbox" data-item-id="' + item.id + '" ' + checked + '>' +
              '<span class="simple-check-text">' + item.topic + '</span>' +
              '<small class="simple-check-meta">(' + item.subsection + ' | ' + item.seenTotal + 'x)</small>' +
            '</label>'
          );
        })
        .join('');
      return '<div class="simple-check-group"><h3>' + g.disc + '</h3>' + rows + '</div>';
    })
    .join('');
}

async function patchChecklistItem(itemId, payload) {
  try {
    const res = await fetch(API + '/checklist/' + encodeURIComponent(itemId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Falha ao atualizar checklist');

    const item = checklistData?.items?.find((x) => x.id === itemId);
    if (item && payload.status) item.currentStatus = payload.status;
    renderChecklist();
    renderEdital();
    renderKPIs();
  } catch (err) {
    showConfigFeedback('Erro checklist: ' + err.message, false);
  }
}

function setupFilter() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderSimTable(getFilteredSims());
      if (activeTab === 'desempenho') {
        renderKurtosisCard(getFilteredSims());
        renderChartEvolucao(getFilteredSims(), evolucaoMode);
      }
    });
  });

  // Toggles internos dos gráficos
  document.getElementById('evolucaoToggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.chart-tog');
    if (!btn) return;
    document.querySelectorAll('#evolucaoToggle .chart-tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    evolucaoMode = btn.dataset.mode;
    renderChartEvolucao(getFilteredSims(), evolucaoMode);
  });

  document.getElementById('discToggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.chart-tog');
    if (!btn) return;
    document.querySelectorAll('#discToggle .chart-tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    discSimCount = Number(btn.dataset.count);
    renderChartDisciplinas(data?.simulations || [], discSimCount);
  });
}

// ─── TABS ─────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      closeSidebar(); // fecha drawer no mobile
    });
  });
}

function switchTab(tab) {
  activeTab = tab;

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.mob-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');

  if (tab === 'desempenho' && data) requestAnimationFrame(() => renderCharts());
  if (tab === 'checklist') loadChecklist();
}

// ─── MODAL ────────────────────────────────────────

function setupModal() {
  const overlay    = document.getElementById('modalOverlay');
  const btnNovo    = document.getElementById('btnNovo');
  const btnClose   = document.getElementById('modalClose');
  const btnSubmit  = document.getElementById('btnSubmitSim');
  // const btnAnalyze = document.getElementById('btnAnalyze'); // IA desativada

  btnNovo?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  btnSubmit?.addEventListener('click', submitSimulado);
  // btnAnalyze?.addEventListener('click', runAnalysis); // IA desativada
}

function openModal() {
  document.getElementById('simText').value      = '';
  document.getElementById('simRespostas').value  = '';
  document.getElementById('simName').value       = '';
  const btnAnalyze = document.getElementById('btnAnalyze');
  if (btnAnalyze) btnAnalyze.disabled = true;
  setModalStatus('', '');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

async function submitSimulado() {
  const text      = document.getElementById('simText').value.trim();
  const respostas = document.getElementById('simRespostas').value.trim();
  const type      = document.querySelector('input[name="simType"]:checked').value;
  const name      = document.getElementById('simName').value.trim();

  if (!text)      return setModalStatus('Cole o texto do simulado primeiro.', 'error');
  if (!respostas) return setModalStatus('Cole suas respostas também.', 'error');

  setModalStatus('Salvando...', 'loading');

  try {
    const r1 = await fetch(`${API}/inbox/simulado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type, name })
    });
    const d1 = await r1.json();
    if (!d1.ok) throw new Error(d1.error);
    pendingSimuladoId = d1.id;

    const r2 = await fetch(`${API}/inbox/respostas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: respostas, simuladoId: pendingSimuladoId })
    });
    const d2 = await r2.json();
    if (!d2.ok) throw new Error(d2.error);

    setModalStatus('Simulado salvo com sucesso.', 'ok');
} catch (err) {
    setModalStatus('Erro: ' + err.message, 'error');
  }
}

async function runAnalysis() {
  setModalStatus('Analise por IA desativada neste template.', 'error');
}

function setModalStatus(msg, cls) {
  const el = document.getElementById('modalStatus');
  el.textContent = msg;
  el.className   = 'modal-status' + (cls ? ' ' + cls : '');
}


function showConfigFeedback(msg, ok) {
  const el = document.getElementById('configFeedback');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
}


// ─── INIT ─────────────────────────────────────────

init();


