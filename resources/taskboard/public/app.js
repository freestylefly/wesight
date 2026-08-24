/* WeSight Taskboard UI */
const API = '';
const STATUS_META = {
  todo: { label: '待办', color: 'var(--todo)' },
  in_progress: { label: '进行中', color: 'var(--in_progress)' },
  in_review: { label: '待验收', color: 'var(--in_review)' },
  done: { label: '已完成', color: 'var(--done)' },
};
const STATUS_KEYS = Object.keys(STATUS_META);
const PRIORITY_LABEL = { urgent: '紧急', high: '高', medium: '中', low: '低' };

const state = { projects: [], projectId: '', issues: [], refIssue: null };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return d.toLocaleDateString('zh-CN');
};

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.issue = data.issue;
    throw err;
  }
  return data;
}

/* ---------- 项目 ---------- */

async function loadProjects() {
  const { projects } = await api('/api/projects');
  state.projects = projects;
  const sel = $('#projectSelect');
  sel.innerHTML = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}（${p.issue_count}）</option>`).join('');
  const saved = localStorage.getItem('projectId');
  if (!state.projectId) {
    state.projectId = saved && projects.some((p) => p.id === saved) ? saved : (projects[0]?.id || '');
  }
  if (state.projectId) sel.value = state.projectId;
  renderBoard();
}

async function switchProject(id) {
  state.projectId = id;
  localStorage.setItem('projectId', id);
  await loadBoard();
}

/* ---------- 看板 ---------- */

async function loadBoard() {
  if (!state.projectId) return renderBoard();
  const { issues } = await api(`/api/projects/${state.projectId}/issues`);
  state.issues = issues;
  refreshLabelFilter();
  renderBoard();
}

function visibleIssues() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const label = $('#labelFilter').value;
  const priority = $('#priorityFilter').value;
  return state.issues.filter((i) => {
    if (q && !(`${i.ref} ${i.title} ${i.description}`.toLowerCase().includes(q))) return false;
    if (label && !i.labels.includes(label)) return false;
    if (priority && i.priority !== priority) return false;
    return true;
  });
}

function refreshLabelFilter() {
  const labels = [...new Set(state.issues.flatMap((i) => i.labels))].sort();
  const cur = $('#labelFilter').value;
  $('#labelFilter').innerHTML = '<option value="">全部标签</option>' + labels.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  $('#labelFilter').value = labels.includes(cur) ? cur : '';
}

function renderBoard() {
  const board = $('#board');
  if (!state.projects.length) {
    board.innerHTML = `<div class="empty-hint" style="grid-column:1/-1">还没有项目，点右上角「＋ 项目」创建一个</div>`;
    return;
  }
  const issues = visibleIssues();
  const hiddenCount = state.issues.length - issues.length;
  board.innerHTML = (hiddenCount > 0
    ? `<div class="empty-hint" style="grid-column:1/-1;padding:6px 0;text-align:right">🔍 筛选生效中，已隐藏 ${hiddenCount} 个议题</div>`
    : '') + STATUS_KEYS.map((status) => {
    const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
    const items = issues.filter((i) => i.status === status).sort((a, b) => rank[a.priority] - rank[b.priority] || b.updated_at.localeCompare(a.updated_at));
    return `
    <div class="column" data-status="${status}">
      <div class="col-head">
        <span class="col-dot" style="background:${STATUS_META[status].color}"></span>
        ${STATUS_META[status].label}
        <span class="col-count">${items.length}</span>
      </div>
      <div class="col-body" data-status="${status}">
        ${items.length ? items.map(cardHtml).join('') : '<div class="empty-hint">拖拽卡片到这里</div>'}
      </div>
    </div>`;
  }).join('');
  bindCards();
}

function cardHtml(i) {
  return `
  <div class="card" draggable="true" data-ref="${esc(i.ref)}" data-version="${i.version}">
    <span class="card-ref">#${i.number} · v${i.version}</span>
    <div class="card-title">${esc(i.title)}</div>
    <div class="card-meta">
      <span class="chip p-${i.priority}">${PRIORITY_LABEL[i.priority]}</span>
      ${i.labels.map((l) => `<span class="chip">${esc(l)}</span>`).join('')}
      ${i.branch ? `<span class="chip branch">⑂ ${esc(i.branch)}</span>` : ''}
      ${i.agent ? `<span class="chip agent">🤖 ${esc(i.agent)}</span>` : ''}
      ${i.session ? `<span class="chip session">💬 ${esc(i.session)}</span>` : ''}
    </div>
    <div class="card-foot"><span>${fmtTime(i.updated_at)}</span>${i.description ? '<span>📄</span>' : ''}</div>
  </div>`;
}

function bindCards() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => openDrawer(card.dataset.ref));
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.ref);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  document.querySelectorAll('.col-body').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.parentElement.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.parentElement.classList.remove('dragover'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.parentElement.classList.remove('dragover');
      const ref = e.dataTransfer.getData('text/plain');
      const status = col.dataset.status;
      const el = document.querySelector(`.card[data-ref="${CSS.escape(ref)}"]`);
      if (!el) return;
      const version = Number(el.dataset.version);
      const issue = state.issues.find((i) => i.ref === ref);
      if (issue.status === status) return;
      try {
        await api(`/api/projects/${state.projectId}/issues/${issue.number}/move`, {
          method: 'POST',
          body: { status, expectedVersion: version, actor: 'user' },
        });
        await loadBoard();
      } catch (err) {
        if (err.status === 409) {
          alert('议题刚被其他人修改过（版本冲突），已为你刷新看板');
          await loadBoard();
        } else {
          alert(`移动失败：${err.message}`);
        }
      }
    });
  });
}

/* ---------- 详情抽屉 ---------- */

async function openDrawer(ref) {
  const issue = state.issues.find((i) => i.ref === ref);
  if (!issue) return;
  const { issue: detail, comments, activities } = await api(
    `/api/projects/${state.projectId}/issues/${issue.number}`
  );
  state.refIssue = detail;
  const d = $('#drawer');
  d.innerHTML = `
    <div class="drawer-head">
      <span class="card-ref">${esc(detail.ref)} · v${detail.version}</span>
      <button class="close-x" id="drawerClose">✕</button>
    </div>
    <h2>${esc(detail.title)}</h2>
    <p class="desc">${esc(detail.description) || '<i>无描述</i>'}</p>
    <section>
      <h3>状态流转</h3>
      <div class="status-btns">
        ${STATUS_KEYS.map((s) => `
          <button class="btn small ${detail.status === s ? 'active' : ''}" data-move="${s}">
            ${STATUS_META[s].label}
          </button>`).join('')}
      </div>
    </section>
    <section>
      <h3>属性 <span class="edit-hint">（点按钮修改）</span></h3>
      <div class="field-grid">
        <div class="field"><b>优先级</b>${PRIORITY_LABEL[detail.priority]}
          <button class="btn small ghost" data-edit="priority">改</button></div>
        <div class="field"><b>标签</b>${detail.labels.join('、') || '—'}
          <button class="btn small ghost" data-edit="labels">改</button></div>
        <div class="field"><b>分支</b>${esc(detail.branch) || '—'}
          <button class="btn small ghost" data-edit="branch">改</button></div>
        <div class="field"><b>执行者</b>${esc(detail.agent) || '-'}<button class="btn small ghost" data-edit="agent">改</button></div>
        <div class="field"><b>会话</b>${esc(detail.session) || '-'}</div>
        <div class="field"><b>创建</b>${fmtTime(detail.created_at)}</div>
        <div class="field"><b>更新</b>${fmtTime(detail.updated_at)}</div>
      </div>
      <div style="margin-top:8px">
        <button class="btn small ghost" data-edit="title">改标题/描述</button>
        <button class="btn small danger" data-del="1">删除</button>
      </div>
    </section>
    <section>
      <h3>评论（${comments.length}）<button class="btn small ghost" id="drawerMsgBtn" style="float:right">📮 给 agent 留言</button></h3>
      ${comments.map((c) => `
        <div class="comment">
          <div class="meta">${esc(c.author)} · ${fmtTime(c.created_at)}${c.handled ? '' : ' · <span class="pending-tag">待 agent 处理</span>'}</div>
          ${esc(c.body)}
        </div>`).join('')}
      <div class="comment-form">
        <input id="commentInput" placeholder="写评论…" />
        <button class="btn primary small" id="commentSend">发送</button>
      </div>
    </section>
    <section>
      <h3>活动记录</h3>
      <div class="timeline">
        ${activities.map((a) => `
          <div class="timeline-item">
            <div>${esc(a.action)} — ${esc(a.detail)} <span style="color:var(--muted)">by ${esc(a.actor)}</span></div>
            <div class="t">${fmtTime(a.created_at)}</div>
          </div>`).join('')}
      </div>
    </section>`;
  $('#drawerMask').classList.remove('hidden');

  $('#drawerClose').onclick = () => $('#drawerMask').classList.add('hidden');
  const msgBtn = d.querySelector('#drawerMsgBtn');
  if (msgBtn) msgBtn.onclick = () => {
    $('#drawerMask').classList.add('hidden');
    openMessages().then(() => { $('#msgIssueSelect').value = String(detail.number); });
  };
  d.querySelectorAll('[data-move]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/projects/${state.projectId}/issues/${detail.number}/move`, {
          method: 'POST',
          body: { status: btn.dataset.move, expectedVersion: state.refIssue.version, actor: 'user' },
        });
        await loadBoard();
        await openDrawer(ref);
      } catch (err) { handleConflictOrAlert(err); }
    };
  });
  d.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = async () => {
      const field = btn.dataset.edit;
      let body = {};
      if (field === 'title') {
        const title = prompt('新标题', detail.title); if (title === null) return;
        const description = prompt('新描述', detail.description); if (description === null) return;
        body = { title, description };
      } else if (field === 'priority') {
        const priority = prompt('优先级：low / medium / high / urgent', detail.priority);
        if (!priority) return; body = { priority };
      } else if (field === 'labels') {
        const labels = prompt('标签（逗号分隔）', detail.labels.join(',')); if (labels === null) return;
        body = { labels };
      } else if (field === 'branch') {
        const branch = prompt('分支名', detail.branch); if (branch === null) return;
        body = { branch };
      } else if (field === 'agent') {
        const agent = prompt('执行者（如 Claude Code / Codex / 某人）', detail.agent); if (agent === null) return;
        body = { agent };
      }
      body.expectedVersion = state.refIssue.version;
      body.actor = 'user';
      try {
        await api(`/api/projects/${state.projectId}/issues/${detail.number}`, { method: 'PATCH', body });
        await loadBoard();
        await openDrawer(ref);
      } catch (err) { handleConflictOrAlert(err); }
    };
  });
  const del = d.querySelector('[data-del]');
  if (del) del.onclick = () => alert('为保留活动记录，请通过状态流转管理议题（当前版本暂不提供删除）');
  $('#commentSend').onclick = async () => {
    const body = $('#commentInput').value.trim();
    if (!body) return;
    try {
      await api(`/api/projects/${state.projectId}/issues/${detail.number}/comments`, {
        method: 'POST',
        body: { body, author: 'user' },
      });
      await loadBoard();
      await openDrawer(ref);
    } catch (err) { alert(`发送失败：${err.message}`); }
  };
  $('#commentInput').onkeydown = (e) => { if (e.key === 'Enter') $('#commentSend').click(); };
}

function handleConflictOrAlert(err) {
  if (err.status === 409) {
    alert('版本冲突：议题已被其他会话修改，正在刷新');
    loadBoard().then(() => openDrawer(state.refIssue.ref));
  } else alert(`操作失败：${err.message}`);
}

/* ---------- 弹窗 ---------- */

function showModal(which) {
  $('#modalMask').classList.remove('hidden');
  $(which).classList.remove('hidden');
  const other = which === '#issueModal' ? '#projectModal' : '#issueModal';
  $(other).classList.add('hidden');
}
function hideModals() {
  $('#modalMask').classList.add('hidden');
  $('#issueModal').classList.add('hidden');
  $('#projectModal').classList.add('hidden');
}

$('#newIssueBtn').onclick = async () => {
  if (!state.projectId) return alert('请先创建项目');
  $('#issueForm').reset();
  showModal('#issueModal');
  try {
    const { branches } = await api(`/api/projects/${state.projectId}/branches`);
    $('#branchList').innerHTML = branches.map((b) => `<option value="${esc(b)}">`).join('');
  } catch {}
};
$('#newProjectBtn').onclick = () => { $('#projectForm').reset(); showModal('#projectModal'); };
$('#scanBtn').onclick = async () => {
  $('#scanBtn').disabled = true;
  $('#scanBtn').textContent = '🔍 扫描中…';
  try {
    const { created, existing } = await api('/api/projects/scan', { method: 'POST', body: {} });
    alert(`扫描完成：新建 ${created.length} 个项目，已存在 ${existing.length} 个${created.length ? `\n新建：${created.join('、')}` : ''}`);
    await loadProjects();
    await loadBoard();
  } catch (err) { alert(`扫描失败：${err.message}`); }
  $('#scanBtn').disabled = false;
  $('#scanBtn').textContent = '🔍 扫描项目';
};
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = hideModals));
$('#modalMask').addEventListener('click', (e) => { if (e.target.id === 'modalMask') hideModals(); });
$('#drawerMask').addEventListener('click', (e) => { if (e.target.id === 'drawerMask') $('#drawerMask').classList.add('hidden'); });

$('#issueForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api(`/api/projects/${state.projectId}/issues`, {
      method: 'POST',
      body: Object.fromEntries(fd.entries()),
    });
    hideModals();
    await loadBoard();
  } catch (err) { alert(`创建失败：${err.message}`); }
};

$('#projectForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const { project } = await api('/api/projects', { method: 'POST', body: Object.fromEntries(fd.entries()) });
    hideModals();
    state.projectId = project.id;
    await loadProjects();
    await loadBoard();
  } catch (err) { alert(`创建失败：${err.message}`); }
};

$('#projectSelect').onchange = (e) => switchProject(e.target.value);
$('#searchInput').oninput = renderBoard;
$('#labelFilter').onchange = renderBoard;
$('#priorityFilter').onchange = renderBoard;

/* ---------- 主题 ---------- */

function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  $('#themeBtn').textContent = theme === 'light' ? '🌙' : '☀️';
  $('#themeBtn').title = theme === 'light' ? '切换到暗色主题' : '切换到亮色主题';
}

(function initTheme() {
  const urlTheme = new URLSearchParams(location.search).get('theme');
  const saved = localStorage.getItem('theme');
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(urlTheme || saved || (systemLight ? 'light' : 'dark'));
  $('#themeBtn').onclick = () => {
    const next = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    applyTheme(next);
  };
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (data && data.type === 'theme' && (data.theme === 'dark' || data.theme === 'light')) {
      applyTheme(data.theme);
    }
  });
})();

/* ---------- 留言收件箱 ---------- */

async function loadMsgCount() {
  if (!state.projectId) return;
  try {
    const { messages, comments } = await api(`/api/projects/${state.projectId}/inbox`);
    const n = messages.length + comments.length;
    const badge = $('#msgBadge');
    if (n) {
      badge.textContent = n;
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
  } catch {}
}

async function openMessages() {
  $('#msgIssueSelect').innerHTML = '<option value="">不关联</option>' +
    state.issues.map((i) => `<option value="${i.number}">${esc(i.ref)} ${esc(i.title.slice(0, 20))}</option>`).join('');
  await renderMsgList();
  $('#msgMask').classList.remove('hidden');
}

async function renderMsgList() {
  const { messages } = await api(`/api/projects/${state.projectId}/messages`);
  $('#msgList').innerHTML = messages.length
    ? messages.map((m) => `
      <div class="msg-item">
        <div class="meta">#${m.id} · ${m.ref ? `[${esc(m.ref)}] ` : ''}${fmtTime(m.created_at)} · ${m.status === 'pending' ? '<span class="pending-tag">待回复</span>' : '已回复'}</div>
        <div>${esc(m.body)}</div>
        ${m.reply ? `<div class="reply-box">🤖 ${esc(m.reply)}</div>` : ''}
      </div>`).join('')
    : '<div class="empty-hint">还没有留言</div>';
}

$('#msgBtn').onclick = openMessages;
$('#msgClose').onclick = () => $('#msgMask').classList.add('hidden');
$('#msgMask').addEventListener('click', (e) => { if (e.target.id === 'msgMask') $('#msgMask').classList.add('hidden'); });
$('#msgSend').onclick = async () => {
  const body = $('#msgInput').value.trim();
  if (!body) return;
  const issueNumber = $('#msgIssueSelect').value || undefined;
  try {
    await api(`/api/projects/${state.projectId}/messages`, { method: 'POST', body: { body, issueNumber } });
    $('#msgInput').value = '';
    await renderMsgList();
    await loadMsgCount();
  } catch (err) { alert(`发送失败：${err.message}`); }
};

/* ---------- 总览仪表盘 ---------- */

function setView(view) {
  state.view = view;
  $('#viewBoardBtn').classList.toggle('active', view === 'board');
  $('#viewDashBtn').classList.toggle('active', view === 'dashboard');
  $('#board').classList.toggle('hidden', view !== 'board');
  $('#dashboard').classList.toggle('hidden', view !== 'dashboard');
  if (view === 'dashboard') loadDashboard();
}
$('#viewBoardBtn').onclick = () => setView('board');
$('#viewDashBtn').onclick = () => setView('dashboard');

function buildSummary(s) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
  const date = `${new Date().getMonth() + 1}月${new Date().getDate()}日`;
  const parts = [];
  parts.push(`项目共 ${s.total} 个议题，完成率 ${s.doneRate}%（${s.done} 已完成 / ${s.active} 未结束）`);
  if (s.todayDone) parts.push(`今日新完成 ${s.todayDone} 个`);
  if (s.byStatus.in_review) parts.push(`${s.byStatus.in_review} 个议题待你验收`);
  if (s.byStatus.in_progress) parts.push(`${s.byStatus.in_progress} 个进行中`);
  if (s.stale.length) parts.push(`⚠️ ${s.stale.length} 个进行中议题已滞留超 3 天`);
  if (s.inbox.total) parts.push(`📮 收件箱有 ${s.inbox.total} 条留言/评论待处理`);
  let next = '';
  if (s.byStatus.in_review) next = '建议先验收「待验收」的议题。';
  else if (s.stale.length) next = '建议跟进滞留的进行中议题。';
  else if (s.byStatus.todo) next = '可以从待办里挑选下一步工作。';
  else next = '全部清空，可以规划新的迭代了。';
  return `${greet}，今天是${date}。${parts.join('，')}。${next}`;
}

async function loadDashboard() {
  if (!state.projectId) return;
  const s = await api(`/api/projects/${state.projectId}/stats`);
  const d = $('#dashboard');
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  const metrics = [
    { key: 'todo', label: '待办', n: s.byStatus.todo },
    { key: 'in_progress', label: '进行中', n: s.byStatus.in_progress },
    { key: 'in_review', label: '待验收', n: s.byStatus.in_review },
    { key: 'done', label: '已完成', n: s.byStatus.done },
    { key: 'inbox', label: '收件箱待处理', n: s.inbox.total, ofTotal: false },
    { key: 'done', label: '今日完成', n: s.todayDone, ofTotal: false },
  ];
  const attention = [
    ...s.inReview.map((i) => ({ type: 'review', i })),
    ...s.stale.map((i) => ({ type: 'stale', i })),
  ];
  d.innerHTML = `
    <div class="dash-hero">
      <div>
        <div class="rate">${s.doneRate}%</div>
        <div class="sub">项目完成度</div>
      </div>
      <div class="dash-summary">${esc(buildSummary(s))}</div>
    </div>
    ${metrics.map((m) => `
      <div class="dash-metric tone-${m.key}">
        <span class="label">${m.label}</span>
        <div class="value">${m.n}<small>${m.ofTotal === false ? '' : pct(m.n) + '%'}</small></div>
        <span class="meter"><i style="width:${m.ofTotal === false ? Math.min(100, m.n * 20) : pct(m.n)}%"></i></span>
      </div>`).join('')}
    <div class="dash-panel">
      <h3>优先级分布</h3>
      ${['urgent', 'high', 'medium', 'low'].map((p) => `
        <div class="prio-row p-${p}">
          <span class="name">${PRIORITY_LABEL[p]}</span>
          <span class="track"><i style="width:${pct(s.byPriority[p] || 0)}%"></i></span>
          <strong>${s.byPriority[p] || 0}</strong>
        </div>`).join('')}
    </div>
    <div class="dash-panel">
      <h3>需要关注（待验收 / 滞留）</h3>
      ${attention.length ? attention.map(({ type, i }) => `
        <div class="attn-item ${type === 'stale' ? 'stale' : ''}" data-open-ref="${esc(i.ref)}">
          <span class="mark"></span>
          <span class="grow">${esc(i.title)}</span>
          <small>${type === 'stale' ? `滞留 ${i.stale_days} 天` : '待验收'}</small>
        </div>`).join('') : '<div class="dash-empty">当前没有需要关注的议题</div>'}
      ${s.inbox.total ? `<div class="attn-item" id="attnInbox"><span class="mark" style="background:#e5484d"></span><span class="grow">收件箱有 ${s.inbox.total} 条留言/评论待处理</span><small>去处理</small></div>` : ''}
    </div>
    <div class="dash-panel">
      <h3>执行者贡献（已完成议题）</h3>
      ${s.agentContributions.length ? `
        <div class="agent-stack">${s.agentContributions.map((a) => `<i style="width:${s.done ? (a.count / s.done) * 100 : 0}%"></i>`).join('')}</div>
        ${s.agentContributions.map((a) => `
          <div class="agent-row">
            <span>🤖</span><span class="grow">${esc(a.agent)}</span>
            <span>${a.count} 个</span>
            <span class="share">${s.done ? Math.round((a.count / s.done) * 100) : 0}%</span>
          </div>`).join('')}` : '<div class="dash-empty">暂无执行者数据</div>'}
    </div>
    <div class="dash-panel wide dash-feed">
      <h3>最近活动</h3>
      ${s.activities.length ? s.activities.map((a) => `
        <div class="timeline-item">
          <div>${a.ref ? `<span class="ref">${esc(a.ref)}</span> ` : ''}${esc(a.action)} — ${esc(a.detail)} <span style="color:var(--muted)">by ${esc(a.actor)}</span></div>
          <div class="t">${fmtTime(a.created_at)}</div>
        </div>`).join('') : '<div class="dash-empty">暂无活动</div>'}
    </div>`;
  d.querySelectorAll('[data-open-ref]').forEach((el) => {
    el.onclick = async () => { setView('board'); await loadBoard(); openDrawer(el.dataset.openRef); };
  });
  const attnInbox = d.querySelector('#attnInbox');
  if (attnInbox) attnInbox.onclick = openMessages;
}

/* ---------- 启动 + 轮询 ---------- */

(async function init() {
  await loadProjects();
  await loadBoard();
  if (new URLSearchParams(location.search).get('view') === 'dashboard') setView('dashboard');
  setInterval(() => {
    if (document.visibilityState !== 'visible' || state.refIssue) return;
    loadBoard().catch(() => {});
    loadMsgCount();
    if (state.view === 'dashboard') loadDashboard().catch(() => {});
  }, 2500);
})();
