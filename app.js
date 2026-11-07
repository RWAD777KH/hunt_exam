/* מבחן ציד – אפליקציית הכנה למבחן רישיון ציד (PWA) */
(function () {
  'use strict';

  const EXAM = { count: 50, minutes: 120, pass: 80, pointsPer: 2 };
  const ID_SPLIT = { imgName: 7, imgStatus: 3, text: 2 }; // 12 שאלות זיהוי במבחן
  const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה'];
  const STORE_KEY = 'huntlic.v1';

  const T = window.TOPICS, SP = window.SPECIES, QS = window.QUESTIONS, ST = window.STATUS;
  const $view = document.getElementById('view');
  const $title = document.getElementById('title');
  const $back = document.getElementById('backBtn');
  const $right = document.getElementById('topRight');
  const $modal = document.getElementById('modal');

  /* ---------------- storage ---------------- */
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.answers) return s; } catch (e) {}
    return { answers: {}, log: [], exams: [], current: null };
  }
  let S = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

  function record(q, ok) {
    const a = S.answers[q.key] || { n: 0, c: 0, last: [] };
    a.n++; if (ok) a.c++;
    a.last.push(ok ? 1 : 0); if (a.last.length > 5) a.last.shift();
    a.ts = Date.now();
    S.answers[q.key] = a;
    S.log.push({ t: q.t, ok: ok ? 1 : 0 });
    if (S.log.length > 3000) S.log.splice(0, S.log.length - 3000);
  }

  /* ---------------- helpers ---------------- */
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (arr, n) => shuffle(arr).slice(0, n);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const baseName = (sp) => sp.name;
  const spLabel = (sp) => sp.name + (sp.sex ? ' (' + sp.sex + ')' : '');
  const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  /* ---------------- question building ---------------- */
  function fromBank(raw) {
    let options, correct;
    if (raw.fix) { options = raw.o.slice(); correct = raw.a; }
    else {
      const idx = shuffle(raw.o.map((_, i) => i));
      options = idx.map((i) => raw.o[i]); correct = idx.indexOf(0);
    }
    return { key: raw.id, t: raw.t, q: raw.q, options, correct, e: raw.e, s: raw.s };
  }

  function imgNameQ(sp) {
    const name = baseName(sp);
    let pool = SP.filter((x) => x.g === sp.g && baseName(x) !== name);
    let names = [...new Set(shuffle(pool).map(baseName))].slice(0, 3);
    if (names.length < 3) names = names.concat([...new Set(shuffle(SP.filter((x) => baseName(x) !== name && !names.includes(baseName(x)))).map(baseName))].slice(0, 3 - names.length));
    const opts = shuffle([name, ...names]);
    const st = ST[sp.status];
    return {
      key: 'img:' + sp.id + ':n', t: 'id', img: 'img/' + sp.id + '.jpg', q: 'מהו בעל החיים שבתמונה?',
      options: opts, correct: opts.indexOf(name), s: sp.s,
      e: 'זהו ' + spLabel(sp) + ' – ' + st.name + '.' + (sp.note ? ' ' + sp.note + '.' : '')
    };
  }
  function imgStatusQ(sp) {
    const opts = shuffle([ST.game.long, ST.pest.long, ST.protected.long, window.STATUS_DISTRACTOR]);
    const right = ST[sp.status].long;
    return {
      key: 'img:' + sp.id + ':s', t: 'id', img: 'img/' + sp.id + '.jpg', q: 'מה מעמדו החוקי של בעל החיים שבתמונה (לפי המקראה)?',
      options: opts, correct: opts.indexOf(right), s: sp.s,
      e: 'זהו ' + spLabel(sp) + ' – ' + ST[sp.status].name + '.' + (sp.note ? ' ' + sp.note + '.' : '')
    };
  }
  function rebuild(key) { // לשחזור שאלה ממפתח (חזרה על טעויות)
    if (key.startsWith('img:')) {
      const [, id, kind] = key.split(':'); const sp = SP.find((x) => x.id === id); if (!sp) return null;
      return kind === 'n' ? imgNameQ(sp) : imgStatusQ(sp);
    }
    const raw = QS.find((x) => x.id === key); return raw ? fromBank(raw) : null;
  }

  function buildExam() {
    const out = [];
    Object.keys(T).forEach((t) => {
      if (t === 'id') {
        const sps = sample(SP, ID_SPLIT.imgName + ID_SPLIT.imgStatus);
        sps.slice(0, ID_SPLIT.imgName).forEach((sp) => out.push(imgNameQ(sp)));
        sps.slice(ID_SPLIT.imgName).forEach((sp) => out.push(imgStatusQ(sp)));
        sample(QS.filter((q) => q.t === 'id'), ID_SPLIT.text).forEach((r) => out.push(fromBank(r)));
      } else {
        sample(QS.filter((q) => q.t === t), T[t].examCount).forEach((r) => out.push(fromBank(r)));
      }
    });
    return shuffle(out);
  }

  function buildPractice(topic, n, imgOnly) {
    let items = [];
    const weight = (key) => { const a = S.answers[key]; if (!a) return 3; const acc = a.c / a.n; return 0.5 + (1 - acc) * 3 + (a.last[a.last.length - 1] === 0 ? 2 : 0); };
    const pick = (cands) => cands.map((c) => ({ c, w: weight(c.key) * Math.random() })).sort((a, b) => b.w - a.w).map((x) => x.c);
    const topics = topic === 'all' ? Object.keys(T) : [topic];
    let cands = [];
    topics.forEach((t) => {
      if (!imgOnly) QS.filter((q) => q.t === t).forEach((r) => cands.push({ key: r.id, make: () => fromBank(r) }));
      if (t === 'id') SP.forEach((sp) => { cands.push({ key: 'img:' + sp.id + ':n', make: () => imgNameQ(sp) }); cands.push({ key: 'img:' + sp.id + ':s', make: () => imgStatusQ(sp) }); });
    });
    items = pick(cands).slice(0, n).map((c) => c.make());
    return items;
  }

  /* ---------------- readiness model ---------------- */
  function topicStats() {
    const res = {};
    Object.keys(T).forEach((t) => {
      const entries = S.log.filter((l) => l.t === t).slice(-40);
      let w = 0, c = 0;
      entries.forEach((l, i) => { const wt = 0.6 + 0.4 * (i + 1) / entries.length; w += wt; c += wt * l.ok; });
      const p = (c + 1) / (w + 2); // החלקה בייסיאנית – בלי נתונים ≈ 50%
      const bankKeys = QS.filter((q) => q.t === t).map((q) => q.id);
      if (t === 'id') SP.forEach((sp) => { bankKeys.push('img:' + sp.id + ':n'); });
      const seen = bankKeys.filter((k) => S.answers[k]).length;
      const coverage = bankKeys.length ? seen / bankKeys.length : 0;
      const pEff = p * (0.75 + 0.25 * coverage); // מי שראה מעט מהחומר – ציפייה שמרנית יותר
      res[t] = { n: entries.length, p, pEff, coverage, seen, total: bankKeys.length };
    });
    return res;
  }
  function binom(n, p) { let k = 0; for (let i = 0; i < n; i++) if (Math.random() < p) k++; return k; }
  function readiness() {
    const ts = topicStats();
    const runs = 3000; let pass = 0, sumScore = 0;
    for (let r = 0; r < runs; r++) {
      let correct = 0, critFail = false;
      for (const t in T) {
        const n = T[t].examCount; const k = binom(n, ts[t].pEff);
        correct += k; if (T[t].critical && k < n) critFail = true;
      }
      const score = correct * EXAM.pointsPer; sumScore += score;
      if (score >= EXAM.pass && !critFail) pass++;
    }
    const totalAns = S.log.length;
    const recent = S.exams.slice(-5);
    return {
      ts, prob: pass / runs, expScore: sumScore / runs, totalAns,
      recentPass: recent.length ? recent.filter((e) => e.pass).length / recent.length : null, recentN: recent.length
    };
  }
  function readinessLabel(p, totalAns) {
    if (totalAns < 40) return { txt: 'צריך עוד תרגול כדי להעריך', color: 'var(--muted)' };
    if (p >= 0.9) return { txt: 'מוכן למבחן!', color: 'var(--ok)' };
    if (p >= 0.7) return { txt: 'כמעט מוכן', color: '#6aa84f' };
    if (p >= 0.4) return { txt: 'בדרך הנכונה', color: 'var(--warn)' };
    return { txt: 'עדיין לא מוכן', color: 'var(--bad)' };
  }
  function gaugeSVG(p, color) {
    const r = 90, cx = 110, cy = 110, len = Math.PI * r;
    const v = Math.max(0, Math.min(1, p));
    // הקשת מצוירת משמאל לימין; הסמן המקווקו מציין את סף "מוכן" (90%)
    const th = Math.PI * (1 - 0.9), mx = (rr) => (cx + rr * Math.cos(th)).toFixed(1), my = (rr) => (cy - rr * Math.sin(th)).toFixed(1);
    return '<svg class="gauge" viewBox="0 0 220 130" role="img" aria-label="מד מוכנות ' + Math.round(v * 100) + '%">' +
      '<path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="var(--surface-2)" stroke-width="18" stroke-linecap="round"/>' +
      (v > 0.005 ? '<path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="' + color + '" stroke-width="18" stroke-linecap="round" stroke-dasharray="' + (len * v).toFixed(1) + ' ' + len.toFixed(1) + '"/>' : '') +
      '<line x1="' + mx(r + 14) + '" y1="' + my(r + 14) + '" x2="' + mx(r - 14) + '" y2="' + my(r - 14) + '" stroke="var(--text)" stroke-width="2"/>' +
      '</svg>';
  }

  /* ---------------- chrome ---------------- */
  let timerInt = null;
  function setChrome(title, back, right) {
    $title.textContent = title;
    $back.hidden = !back;
    $back.onclick = back || null;
    $right.innerHTML = right || '';
    if (timerInt && !(right && right.includes('timer'))) { clearInterval(timerInt); timerInt = null; }
    window.scrollTo(0, 0);
  }
  function modal(html, onReady) {
    $modal.innerHTML = '<div class="sheet">' + html + '</div>';
    $modal.hidden = false;
    $modal.onclick = (e) => { if (e.target === $modal) closeModal(); };
    if (onReady) onReady($modal);
  }
  function closeModal() { $modal.hidden = true; $modal.innerHTML = ''; }

  /* ---------------- HOME ---------------- */
  function home() {
    setChrome('מבחן ציד – הכנה לרישיון');
    const R = readiness();
    const L = readinessLabel(R.prob, R.totalAns);
    const pct = Math.round(R.prob * 100);
    const crit = ['id', 'safety'].map((t) => Math.round(R.ts[t].p * 100));
    const resume = S.current && !S.current.done
      ? '<div class="card"><div class="row"><div class="spacer"><b>יש מבחן פתוח</b><div class="small muted">' + (S.current.mode === 'exam' ? 'מבחן סימולציה' : 'תרגול') + ' – שאלה ' + (S.current.i + 1) + ' מתוך ' + S.current.qs.length + '</div></div><button class="btn" id="resume">המשך</button></div></div>' : '';
    $view.innerHTML = resume +
      '<div class="card gauge-wrap">' +
        '<h2 style="align-self:flex-start">מד מוכנות למבחן</h2>' +
        gaugeSVG(R.prob, L.color) +
        '<div class="gauge-value">' + pct + '%</div>' +
        '<div class="gauge-label" style="color:' + L.color + '">' + L.txt + '</div>' +
        '<div class="small muted center">ההסתברות המשוערת לעבור את המבחן היום, לפי כל תנאי המעבר</div>' +
        '<div class="kpis">' +
          '<div class="kpi"><b>' + Math.round(R.expScore) + '</b><span>ציון צפוי</span></div>' +
          '<div class="kpi"><b>' + crit[0] + '%</b><span>דיוק בזיהוי</span></div>' +
          '<div class="kpi"><b>' + crit[1] + '%</b><span>דיוק בבטיחות</span></div>' +
        '</div>' +
        '<button class="btn ghost block" style="margin-top:12px" id="details">פירוט לפי נושאים ←</button>' +
      '</div>' +
      '<div class="menu">' +
        '<button class="primary" data-go="exam"><span class="ic">📝</span><div><b>מבחן סימולציה</b><br><span>50 שאלות · 120 דקות · ציון עובר 80</span></div></button>' +
        '<button data-go="practice"><span class="ic">🎓</span><b>תרגול לפי נושא</b><span>משוב והסבר מיד אחרי כל תשובה</span></button>' +
        '<button data-go="idquiz"><span class="ic">🦆</span><b>זיהוי בעלי חיים</b><span>חידון תמונות מהמקראה</span></button>' +
        '<button data-go="mistakes"><span class="ic">🔁</span><b>חזרה על טעויות</b><span>' + mistakeKeys().length + ' שאלות לחזרה</span></button>' +
        '<button data-go="gallery"><span class="ic">🖼️</span><b>גלריית בעלי חיים</b><span>ציד · מזיקים · מוגנות</span></button>' +
        '<button data-go="history"><span class="ic">📊</span><b>היסטוריית מבחנים</b><span>' + S.exams.length + ' מבחנים</span></button>' +
        '<button data-go="about"><span class="ic">ℹ️</span><b>כללי המבחן ואודות</b><span>סעיף 2.2.2 במקראה</span></button>' +
      '</div>';
    $view.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
    const d = document.getElementById('details'); if (d) d.onclick = () => go('readiness');
    const rs = document.getElementById('resume'); if (rs) rs.onclick = () => runQuiz();
  }

  function go(where) {
    ({ exam: startExamConfirm, practice: practiceMenu, idquiz: () => startQuiz('practice', buildPractice('id', 20, true), 'זיהוי בעלי חיים'),
       mistakes: startMistakes, gallery: gallery, history: history, about: about, readiness: readinessView, home: home })[where]();
  }

  /* ---------------- readiness detail ---------------- */
  function readinessView() {
    setChrome('מד מוכנות – פירוט', home);
    const R = readiness();
    const rows = Object.keys(T).map((t) => {
      const s = R.ts[t]; const p = Math.round(s.p * 100);
      const col = s.n < 5 ? 'var(--muted)' : p >= 90 ? 'var(--ok)' : p >= 75 ? 'var(--warn)' : 'var(--bad)';
      return '<div class="bar-row"><div><div class="lbl"><span>' + T[t].icon + ' ' + T[t].name + (T[t].critical ? ' <span class="tag">ללא טעויות</span>' : '') + '</span><span class="muted">' + s.seen + '/' + s.total + ' נראו</span></div>' +
        '<div class="bar"><i style="width:' + p + '%;background:' + col + '"></i></div></div><div class="pct" style="color:' + col + '">' + (s.n ? p + '%' : '—') + '</div></div>';
    }).join('');
    const weakest = Object.keys(T).slice().sort((a, b) => (R.ts[a].pEff * (T[a].critical ? 0.9 : 1)) - (R.ts[b].pEff * (T[b].critical ? 0.9 : 1)))[0];
    $view.innerHTML =
      '<div class="card"><h2>דיוק לפי נושא</h2><div class="small muted">הדיוק מחושב מ-40 התשובות האחרונות בכל נושא, ולתשובות האחרונות יש משקל גבוה יותר.</div>' + rows + '</div>' +
      '<div class="card"><h2>איך מחושב המד?</h2><div class="small">' +
        'האפליקציה מריצה אלפי מבחנים מדומים לפי המבנה של מבחן אמיתי: 50 שאלות, מהן 12 שאלות זיהוי ו-6 שאלות בטיחות בנשק. בכל מבחן מדומה התשובות נקבעות לפי רמת הדיוק שלך בכל נושא. ' +
        'מבחן נחשב עובר רק אם הציון הוא 80 ומעלה <b>ואין אף טעות</b> בשאלות הזיהוי ובשאלות הבטיחות, כמו בסעיף 2.2.2 במקראה. ' +
        'בגלל הכלל הזה, 95% דיוק בזיהוי עדיין נותנים רק כ-54% סיכוי לעבור את כל 12 שאלות הזיהוי בלי טעות. לכן כדאי להגיע לדיוק של כמעט 100% בנושאים הקריטיים.</div>' +
        (R.recentN ? '<div class="notice" style="margin-top:10px">ב-' + R.recentN + ' מבחני הסימולציה האחרונים עברת ' + Math.round(R.recentPass * 100) + '% מהם.</div>' : '') +
      '</div>' +
      '<button class="btn block" id="weak">תרגל עכשיו את הנושא החלש ביותר: ' + T[weakest].name + '</button>';
    document.getElementById('weak').onclick = () => startQuiz('practice', buildPractice(weakest, 15), T[weakest].name);
  }

  /* ---------------- practice menu ---------------- */
  function practiceMenu() {
    setChrome('תרגול לפי נושא', home);
    const ts = topicStats();
    $view.innerHTML = '<div class="card small muted">בתרגול תקבל משוב מיד אחרי כל תשובה, עם הסבר והפניה לסעיף במקראה. האפליקציה מציגה יותר את השאלות שטעית בהן ואת השאלות שעוד לא ראית.</div>' +
      '<button class="topic-btn" data-t="all"><span class="ic">🎲</span><span class="grow"><b>כל הנושאים</b><br><span class="small muted">20 שאלות מעורבות</span></span><span>←</span></button>' +
      Object.keys(T).map((t) => '<button class="topic-btn" data-t="' + t + '"><span class="ic">' + T[t].icon + '</span><span class="grow"><b>' + T[t].name + '</b>' + (T[t].critical ? ' <span class="tag">קריטי</span>' : '') + '<br><span class="small muted">' + (ts[t].n ? 'דיוק ' + Math.round(ts[t].p * 100) + '% · ' : '') + ts[t].seen + '/' + ts[t].total + ' שאלות נראו</span></span><span>←</span></button>').join('');
    $view.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
      const t = b.dataset.t; startQuiz('practice', buildPractice(t, t === 'all' ? 20 : 15), t === 'all' ? 'תרגול מעורב' : T[t].name);
    });
  }

  function mistakeKeys() {
    return Object.keys(S.answers).filter((k) => { const a = S.answers[k]; return a.last.length && a.last[a.last.length - 1] === 0; });
  }
  function startMistakes() {
    const keys = mistakeKeys();
    if (!keys.length) { setChrome('חזרה על טעויות', home); $view.innerHTML = '<div class="card center"><div style="font-size:44px">🎉</div><h2>אין טעויות לחזרה</h2><div class="muted">כל שאלה שתטעה בה תופיע כאן, עד שתענה עליה נכון.</div></div><button class="btn block" id="h">חזרה למסך הראשי</button>'; document.getElementById('h').onclick = home; return; }
    startQuiz('practice', shuffle(keys).slice(0, 25).map(rebuild).filter(Boolean), 'חזרה על טעויות');
  }

  /* ---------------- quiz engine (exam + practice) ---------------- */
  function startExamConfirm() {
    if (S.current && !S.current.done && S.current.mode === 'exam') return runQuiz();
    modal('<h2>📝 מבחן סימולציה</h2><ul class="checklist">' +
      '<li>📋 50 שאלות אמריקאיות, 4 תשובות לכל שאלה</li><li>⏱️ עד 120 דקות</li><li>✅ ציון עובר: 80 (כל שאלה שווה 2 נקודות)</li>' +
      '<li>🦆 טעות אחת בשאלת זיהוי בעלי חיים פירושה כישלון</li><li>🦺 טעות אחת בשאלת בטיחות בנשק פירושה כישלון</li><li>🔕 אין משוב עד ההגשה. אפשר לדלג, לסמן שאלות ולחזור אליהן</li></ul>' +
      '<div class="nav-row"><button class="btn ghost" id="c">ביטול</button><button class="btn" id="s">התחל מבחן</button></div>', (m) => {
        m.querySelector('#c').onclick = closeModal;
        m.querySelector('#s').onclick = () => { closeModal(); startQuiz('exam', buildExam(), 'מבחן סימולציה'); };
      });
  }
  function startQuiz(mode, qs, label) {
    if (!qs.length) return;
    S.current = { mode, label, qs, ans: qs.map(() => null), flags: qs.map(() => false), i: 0, start: Date.now(), done: false, checked: qs.map(() => false) };
    save(); runQuiz();
  }

  function runQuiz() {
    const C = S.current; if (!C) return home();
    const isExam = C.mode === 'exam';
    const q = C.qs[C.i];
    const timer = isExam ? '<span class="timer" id="timer">' + fmtTime(C.start + EXAM.minutes * 60000 - Date.now()) + '</span>' : '<span class="small">' + (C.i + 1) + '/' + C.qs.length + '</span>';
    setChrome(C.label, () => { save(); home(); }, timer);
    if (isExam) startTimer();

    const sel = C.ans[C.i];
    const checked = !isExam && C.checked[C.i];
    const answered = C.ans.filter((a) => a !== null).length;
    const crit = T[q.t].critical;
    $view.innerHTML =
      '<div class="progress"><i style="width:' + ((isExam ? answered : C.i + (checked ? 1 : 0)) / C.qs.length * 100) + '%"></i></div>' +
      '<div class="card">' +
        '<div class="q-meta"><span>שאלה ' + (C.i + 1) + ' מתוך ' + C.qs.length + ' · ' + T[q.t].icon + ' ' + T[q.t].name + (crit && !isExam ? ' <span class="tag">קריטי</span>' : '') + '</span>' +
          (isExam ? '<button class="flag-btn' + (C.flags[C.i] ? ' on' : '') + '" id="flag">🚩 ' + (C.flags[C.i] ? 'מסומנת' : 'סמן') + '</button>' : '') + '</div>' +
        (q.img ? '<img class="q-img" src="' + q.img + '" alt="תמונת בעל חיים מהמקראה">' : '') +
        '<div class="q-text">' + esc(q.q) + '</div>' +
        '<div class="opts">' + q.options.map((o, i) => {
          let cls = 'opt';
          if (checked) { if (i === q.correct) cls += ' right'; else if (i === sel) cls += ' wrong'; }
          else if (i === sel) cls += ' sel';
          return '<button class="' + cls + '" data-i="' + i + '"' + (checked ? ' disabled' : '') + '><span class="letter">' + LETTERS[i] + '</span><span>' + esc(o) + '</span></button>';
        }).join('') + '</div>' +
        (checked ? '<div class="explain ' + (sel === q.correct ? 'ok' : 'bad') + '"><b>' + (sel === q.correct ? '✔ נכון!' : '✘ לא נכון. התשובה הנכונה: ' + LETTERS[q.correct] + '.') + '</b>' + (q.e ? '<div>' + esc(q.e) + '</div>' : '') + (q.s ? '<div class="small muted">מקור: סעיף ' + esc(q.s) + ' במקראה</div>' : '') + '</div>' : '') +
      '</div>' +
      (isExam
        ? '<div class="nav-row"><button class="btn ghost" id="prev"' + (C.i === 0 ? ' disabled' : '') + '>→ הקודמת</button><button class="btn ghost" id="next"' + (C.i === C.qs.length - 1 ? ' disabled' : '') + '>הבאה ←</button></div>' +
          '<div class="nav-row"><button class="btn ghost" id="overview">מפת שאלות (' + answered + '/' + C.qs.length + ')</button><button class="btn" id="submit">הגש מבחן</button></div>'
        : '<div class="nav-row">' + (checked ? '<button class="btn ghost" id="quit">סיום</button><button class="btn" id="next">' + (C.i === C.qs.length - 1 ? 'לסיכום' : 'הבאה ←') + '</button>' : '<button class="btn ghost" id="quit">סיום</button><button class="btn" id="check"' + (sel === null ? ' disabled' : '') + '>בדוק תשובה</button>') + '</div>');

    $view.querySelectorAll('.opt').forEach((b) => b.onclick = () => {
      C.ans[C.i] = +b.dataset.i; save();
      if (isExam) { runQuiz(); }
      else { $view.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === b)); document.getElementById('check').disabled = false; }
    });
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('flag', () => { C.flags[C.i] = !C.flags[C.i]; save(); runQuiz(); });
    on('prev', () => { C.i--; save(); runQuiz(); });
    on('next', () => { if (!isExam && C.i === C.qs.length - 1) return finishPractice(); C.i++; save(); runQuiz(); });
    on('overview', overview);
    on('submit', confirmSubmit);
    on('check', () => { C.checked[C.i] = true; record(q, C.ans[C.i] === q.correct); save(); runQuiz(); });
    on('quit', finishPractice);
  }

  function startTimer() {
    if (timerInt) clearInterval(timerInt);
    const tick = () => {
      const C = S.current; const el = document.getElementById('timer');
      if (!C || C.mode !== 'exam' || C.done) { clearInterval(timerInt); timerInt = null; return; }
      const left = C.start + EXAM.minutes * 60000 - Date.now();
      if (el) { el.textContent = fmtTime(left); el.classList.toggle('low', left < 10 * 60000); }
      if (left <= 0) { clearInterval(timerInt); timerInt = null; closeModal(); alert('הזמן נגמר – המבחן מוגש אוטומטית.'); submitExam(); }
    };
    tick(); timerInt = setInterval(tick, 1000);
  }

  function overview() {
    const C = S.current;
    modal('<h2>מפת שאלות</h2><div class="small muted" style="margin-bottom:10px">ירוק – נענתה · נקודה כתומה – מסומנת</div><div class="grid-nav">' +
      C.qs.map((_, i) => '<button data-i="' + i + '" class="' + (C.ans[i] !== null ? 'ans ' : '') + (C.flags[i] ? 'flag ' : '') + (i === C.i ? 'cur' : '') + '">' + (i + 1) + '</button>').join('') +
      '</div><button class="btn ghost block" style="margin-top:14px" id="cl">סגור</button>', (m) => {
        m.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { C.i = +b.dataset.i; save(); closeModal(); runQuiz(); });
        m.querySelector('#cl').onclick = closeModal;
      });
  }
  function confirmSubmit() {
    const C = S.current; const un = C.ans.filter((a) => a === null).length; const fl = C.flags.filter(Boolean).length;
    modal('<h2>להגיש את המבחן?</h2>' + (un ? '<div class="notice">נשארו ' + un + ' שאלות שלא ענית עליהן. שאלה בלי תשובה נספרת כטעות.</div>' : '<div class="muted">ענית על כל השאלות.</div>') +
      (fl ? '<div class="small muted" style="margin-top:6px">' + fl + ' שאלות מסומנות לבדיקה.</div>' : '') +
      '<div class="nav-row"><button class="btn ghost" id="c">חזרה למבחן</button><button class="btn" id="s">הגש</button></div>', (m) => {
        m.querySelector('#c').onclick = closeModal;
        m.querySelector('#s').onclick = () => { closeModal(); submitExam(); };
      });
  }

  function gradeExam(C) {
    let correct = 0, idErr = 0, safErr = 0; const topics = {};
    C.qs.forEach((q, i) => {
      const ok = C.ans[i] === q.correct;
      topics[q.t] = topics[q.t] || { n: 0, c: 0 }; topics[q.t].n++; if (ok) { topics[q.t].c++; correct++; }
      if (!ok && q.t === 'id') idErr++; if (!ok && q.t === 'safety') safErr++;
    });
    const score = correct * EXAM.pointsPer;
    return { score, correct, idErr, safErr, topics, pass: score >= EXAM.pass && idErr === 0 && safErr === 0 };
  }
  function submitExam() {
    const C = S.current; if (!C || C.done) return;
    C.done = true;
    C.qs.forEach((q, i) => record(q, C.ans[i] === q.correct));
    const g = gradeExam(C);
    S.exams.push({ ts: Date.now(), score: g.score, pass: g.pass, idErr: g.idErr, safErr: g.safErr, dur: Date.now() - C.start, topics: g.topics });
    S.lastExam = { qs: C.qs, ans: C.ans, g, dur: Date.now() - C.start };
    S.current = null; save();
    examResult(S.lastExam);
  }

  function examResult(X) {
    setChrome('תוצאות המבחן', home);
    const g = X.g;
    const reasons = [
      [g.score >= EXAM.pass, 'ציון ' + g.score + ' (נדרש 80 לפחות)'],
      [g.idErr === 0, g.idErr ? (g.idErr === 1 ? 'טעות אחת' : g.idErr + ' טעויות') + ' בשאלות זיהוי בעלי חיים (לא מותרות טעויות)' : 'אין טעויות בזיהוי בעלי חיים'],
      [g.safErr === 0, g.safErr ? (g.safErr === 1 ? 'טעות אחת' : g.safErr + ' טעויות') + ' בשאלות בטיחות בנשק (לא מותרות טעויות)' : 'אין טעויות בבטיחות בנשק']
    ];
    $view.innerHTML =
      '<div class="verdict ' + (g.pass ? 'pass' : 'fail') + '"><div class="big">' + (g.pass ? '✔ עברת!' : '✘ לא עברת') + '</div><div class="score">' + g.score + '</div><div>' + g.correct + ' מתוך ' + X.qs.length + ' תשובות נכונות · ' + fmtTime(X.dur) + ' דקות</div></div>' +
      '<div class="card"><h2>תנאי המעבר</h2><ul class="checklist">' + reasons.map((r) => '<li><span>' + (r[0] ? '✅' : '❌') + '</span><span>' + r[1] + '</span></li>').join('') + '</ul></div>' +
      '<div class="card"><h2>לפי נושא</h2>' + Object.keys(T).map((t) => { const s = g.topics[t] || { n: 0, c: 0 }; const p = s.n ? Math.round(s.c / s.n * 100) : 0; const col = p === 100 ? 'var(--ok)' : (T[t].critical ? 'var(--bad)' : p >= 80 ? 'var(--warn)' : 'var(--bad)');
        return '<div class="bar-row"><div><div class="lbl"><span>' + T[t].icon + ' ' + T[t].name + '</span><span class="muted">' + s.c + '/' + s.n + '</span></div><div class="bar"><i style="width:' + p + '%;background:' + col + '"></i></div></div><div class="pct" style="color:' + col + '">' + p + '%</div></div>'; }).join('') + '</div>' +
      '<div class="card"><h2>סקירת תשובות</h2><div class="chips"><button class="chip on" data-f="wrong">שגויות בלבד</button><button class="chip" data-f="all">כל השאלות</button></div><div class="grid-nav" id="rv"></div></div>' +
      '<div class="nav-row"><button class="btn ghost" id="h">למסך הראשי</button><button class="btn" id="again">מבחן חדש</button></div>';
    const draw = (f) => {
      document.getElementById('rv').innerHTML = X.qs.map((q, i) => ({ q, i, ok: X.ans[i] === q.correct })).filter((x) => f === 'all' || !x.ok)
        .map((x) => '<button data-i="' + x.i + '" class="' + (x.ok ? 'r' : 'w') + '">' + (x.i + 1) + '</button>').join('') || '<div class="muted">אין שאלות שגויות 🎉</div>';
      document.querySelectorAll('#rv [data-i]').forEach((b) => b.onclick = () => reviewQ(X, +b.dataset.i));
    };
    $view.querySelectorAll('[data-f]').forEach((c) => c.onclick = () => { $view.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === c)); draw(c.dataset.f); });
    draw('wrong');
    document.getElementById('h').onclick = home;
    document.getElementById('again').onclick = startExamConfirm;
  }
  function reviewQ(X, i) {
    const q = X.qs[i], sel = X.ans[i];
    modal('<div class="q-meta"><span>שאלה ' + (i + 1) + ' · ' + T[q.t].name + '</span></div>' + (q.img ? '<img class="q-img" src="' + q.img + '" alt="">' : '') + '<div class="q-text">' + esc(q.q) + '</div><div class="opts">' +
      q.options.map((o, k) => '<div class="opt' + (k === q.correct ? ' right' : k === sel ? ' wrong' : '') + '"><span class="letter">' + LETTERS[k] + '</span><span>' + esc(o) + '</span></div>').join('') + '</div>' +
      (sel === null ? '<div class="notice" style="margin-top:10px">לא ענית על השאלה</div>' : '') +
      '<div class="explain">' + (q.e ? esc(q.e) : '') + (q.s ? '<div class="small muted">מקור: סעיף ' + esc(q.s) + '</div>' : '') + '</div>' +
      '<div class="nav-row"><button class="btn ghost" id="p"' + (i === 0 ? ' disabled' : '') + '>→ הקודמת</button><button class="btn ghost" id="n"' + (i === X.qs.length - 1 ? ' disabled' : '') + '>הבאה ←</button></div><button class="btn block" style="margin-top:10px" id="cl">סגור</button>', (m) => {
        m.querySelector('#cl').onclick = closeModal;
        m.querySelector('#p').onclick = () => reviewQ(X, i - 1);
        m.querySelector('#n').onclick = () => reviewQ(X, i + 1);
      });
  }

  function finishPractice() {
    const C = S.current; if (!C) return home();
    let n = 0, c = 0; C.qs.forEach((q, i) => { if (C.checked[i]) { n++; if (C.ans[i] === q.correct) c++; } });
    S.current = null; save();
    setChrome('סיכום תרגול', home);
    const p = n ? Math.round(c / n * 100) : 0;
    $view.innerHTML = '<div class="verdict ' + (p >= 80 ? 'pass' : 'fail') + '"><div class="score">' + p + '%</div><div>' + c + ' נכונות מתוך ' + n + '</div></div>' +
      '<div class="card small muted center">התשובות נשמרו ועדכנו את מד המוכנות.</div>' +
      '<div class="nav-row"><button class="btn ghost" id="h">למסך הראשי</button><button class="btn" id="m">חזרה על טעויות</button></div>';
    document.getElementById('h').onclick = home;
    document.getElementById('m').onclick = startMistakes;
  }

  /* ---------------- gallery ---------------- */
  function gallery() {
    setChrome('גלריית בעלי חיים', home);
    let filter = 'all', hide = false;
    const draw = () => {
      const items = SP.filter((s) => filter === 'all' || s.status === filter);
      document.getElementById('gl').innerHTML = items.map((s) => '<button class="g-item' + (hide ? ' hide-name' : '') + '" data-id="' + s.id + '"><img loading="lazy" src="img/' + s.id + '.jpg" alt="' + esc(spLabel(s)) + '"><div><b>' + esc(spLabel(s)) + '</b><span class="tag ' + ST[s.status].cls + '">' + ST[s.status].name + '</span></div></button>').join('');
      document.querySelectorAll('#gl [data-id]').forEach((b) => b.onclick = () => {
        const s = SP.find((x) => x.id === b.dataset.id);
        modal('<img src="img/' + s.id + '.jpg" alt=""><h2 style="margin:12px 0 4px">' + esc(spLabel(s)) + '</h2><span class="tag ' + ST[s.status].cls + '">' + ST[s.status].name + '</span><p>' + esc(ST[s.status].long) + '</p>' + (s.note ? '<div class="notice">' + esc(s.note) + '</div>' : '') + '<div class="small muted" style="margin-top:8px">סעיף ' + s.s + ' במקראה</div><button class="btn block" style="margin-top:12px" id="cl">סגור</button>', (m) => m.querySelector('#cl').onclick = closeModal);
      });
    };
    $view.innerHTML = '<div class="chips">' + [['all', 'הכול (' + SP.length + ')'], ['game', 'חיות ציד'], ['pest', 'מזיקים'], ['protected', 'מוגנות']].map((c, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>').join('') +
      '<button class="chip" id="hide">🙈 הסתר שמות</button></div><div class="gallery" id="gl"></div>' +
      '<div class="notice" style="margin-top:14px">המקראה מדגישה: הצייד צריך להכיר את כל חיות הבר המוגנות, גם אלה שאינן מופיעות בה. חלק מהמינים המוגנים דומים במראם לחיות ציד, למשל ברווז אפור, צולל ביצות וברווז משוייש.</div>';
    $view.querySelectorAll('[data-f]').forEach((c) => c.onclick = () => { filter = c.dataset.f; $view.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === c)); draw(); });
    document.getElementById('hide').onclick = (e) => { hide = !hide; e.currentTarget.classList.toggle('on', hide); draw(); };
    draw();
  }

  /* ---------------- history ---------------- */
  function history() {
    setChrome('היסטוריית מבחנים', home);
    if (!S.exams.length) { $view.innerHTML = '<div class="card center muted">עוד לא ביצעת מבחני סימולציה.</div><button class="btn block" id="s">התחל מבחן ראשון</button>'; document.getElementById('s').onclick = startExamConfirm; return; }
    const last = S.exams.slice(-12);
    const w = 300, h = 120, pad = 18;
    const pts = last.map((e, i) => [w - pad - (i * (w - 2 * pad) / Math.max(1, last.length - 1)), h - pad - (e.score / 100) * (h - 2 * pad)]);
    const passY = h - pad - 0.8 * (h - 2 * pad);
    const chart = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto" role="img" aria-label="מגמת ציונים">' +
      '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + passY + '" y2="' + passY + '" stroke="var(--warn)" stroke-dasharray="4 4"/>' +
      '<text x="' + (pad) + '" y="' + (passY - 4) + '" font-size="10" fill="var(--warn)">80</text>' +
      (pts.length > 1 ? '<polyline fill="none" stroke="var(--brand-2)" stroke-width="2.5" points="' + pts.map((p) => p.join(',')).join(' ') + '"/>' : '') +
      pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="' + (last[i].pass ? 'var(--ok)' : 'var(--bad)') + '"/>').join('') + '</svg>';
    $view.innerHTML = '<div class="card"><h2>מגמת ציונים</h2><div class="small muted">המבחן האחרון מימין. נקודה ירוקה היא מבחן שעברת.</div>' + chart + '</div>' +
      '<div class="card">' + S.exams.slice().reverse().map((e) => '<div class="list-item"><span class="pill ' + (e.pass ? 'pass' : 'fail') + '">' + (e.pass ? 'עבר' : 'נכשל') + '</span><b style="font-variant-numeric:tabular-nums">' + e.score + '</b><span class="small muted spacer">' + (e.idErr ? 'זיהוי: ' + e.idErr + ' ✘ ' : '') + (e.safErr ? 'בטיחות: ' + e.safErr + ' ✘' : '') + '</span><span class="small muted">' + fmtDate(e.ts) + '</span></div>').join('') + '</div>' +
      (S.lastExam ? '<button class="btn ghost block" id="lr">סקירת המבחן האחרון</button>' : '');
    const lr = document.getElementById('lr'); if (lr) lr.onclick = () => examResult(S.lastExam);
  }

  /* ---------------- about ---------------- */
  function about() {
    setChrome('כללי המבחן ואודות', home);
    $view.innerHTML =
      '<div class="card"><h2>מבנה המבחן (סעיף 2.2.2)</h2><ul class="checklist">' +
        '<li>📋 מבחן רב-ברירה ("מבחן אמריקאי"), 4 תשובות לכל שאלה</li><li>🔢 50 שאלות</li><li>⏱️ עד 120 דקות</li><li>✅ ציון עובר: 80</li>' +
        '<li>🦆 אסור לטעות באף שאלה של זיהוי בעלי חיים (מזיקים, מותרים ואסורים בציד)</li><li>🦺 אסור לטעות באף שאלה של בטיחות בנשק</li>' +
        '<li>📵 טלפונים ושעונים חכמים מפקידים בתחילת המבחן. אסור להעתיק. מותר להכניס רק בקבוק מים</li></ul></div>' +
      '<div class="card"><h2>חלוקת השאלות בסימולציה</h2><div class="small muted">המקראה לא מפרסמת כמה שאלות יש בכל נושא. החלוקה כאן היא הערכה שמכסה את כל הנושאים בסעיף 2.2.2(ג):</div><ul class="checklist">' +
        Object.keys(T).map((t) => '<li><span>' + T[t].icon + '</span><span class="spacer">' + T[t].name + '</span><b>' + T[t].examCount + '</b></li>').join('') + '</ul></div>' +
      '<div class="card"><h2>מקור</h2><div class="small">השאלות והתמונות מבוססות על "מקראה ללימוד עצמי לנבחן בבחינות לקבלת רישיון ציד והיתר צידה", רשות הטבע והגנים, מהדורה 3 (ינואר 2023). האפליקציה היא כלי עזר ללימוד בלבד ואינה מחליפה את המקראה.</div>' +
        '<div class="notice" style="margin-top:10px">⚠️ חלק מההוראות במקראה הן הוראות שעה (למשל לגבי השלו, התור המצוי, העורב האפור והעורב ההודי). לפני המבחן ולפני כל יציאה לציד, בדקו באתר רשות הטבע והגנים אם הן עדיין בתוקף.</div></div>' +
      '<div class="card"><h2>נתונים</h2><div class="small muted">ההתקדמות נשמרת רק במכשיר הזה. ' + Object.keys(S.answers).length + ' שאלות שונות נענו, ' + S.log.length + ' תשובות בסך הכול.</div><button class="btn danger block" style="margin-top:10px" id="reset">איפוס כל ההתקדמות</button></div>' +
      '<div class="center small muted">' + QS.length + ' שאלות טקסט · ' + SP.length + ' תמונות בעלי חיים · ' + (QS.length + SP.length * 2) + ' שאלות בסך הכול</div>';
    document.getElementById('reset').onclick = () => {
      modal('<h2>לאפס את כל ההתקדמות?</h2><div class="muted">תימחק כל היסטוריית התשובות והמבחנים. אי אפשר לבטל את הפעולה.</div><div class="nav-row"><button class="btn ghost" id="c">ביטול</button><button class="btn danger" id="y">אפס</button></div>', (m) => {
        m.querySelector('#c').onclick = closeModal;
        m.querySelector('#y').onclick = () => { S = { answers: {}, log: [], exams: [], current: null }; save(); closeModal(); home(); };
      });
    };
  }

  home();
})();
