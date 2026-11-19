// ملخصات كتب ومحتوى صوتي — النسخة العامة (خادم Node بلا أي مكتبات خارجية)
// التشغيل: node server.js  — المنفذ من PORT أو 3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8'));

// ---------- قاعدة بيانات JSON بسيطة مع حفظ ذرّي ----------
function emptyDb() {
  return {
    accounts: [],        // {id, username, displayName, avatar, passHash, salt, isSubscriber, createdAt}
    sessions: {},        // token -> accountId
    ledger: [],          // {accountId, key, points, reason, at}
    progress: [],        // {accountId, summaryId, completed, rating, favorite, positionSec}
    votes: [],           // {accountId, bookId}
    enrollments: [],     // {accountId, challengeId, joinedAt}
    taskProgress: [],    // {accountId, challengeId, day, taskIdx, answer}
    requests: seedRequests(),
    challenges: seedChallenges()
  };
}
function seedRequests() {
  const books = ['العمل العميق', 'الأب الغني والأب الفقير', 'قوة العادات', 'ابدأ بـ لماذا', 'التفكير السريع والبطيء', 'من الذي حرّك قطعة الجبن الخاصة بي؟', 'نظريّة الفستق', 'الخيميائي', 'هاري بوتر وحجر الفيلسوف', 'أربعون'];
  return books.map((title, i) => ({ id: i + 1, title, votes: 0 }));
}
function seedChallenges() {
  const task = (type, title, points, extra) => Object.assign({ type, title, points: points || 10 }, extra || {});
  return [
    { id: 1, title: 'تحدي العادات الذرية', desc: 'سبعة أيام مع ملخص «العادات الذرية»: استمع وطبّق عادة صغيرة كل يوم.', subscribersOnly: false,
      startOffsetDays: -2, daysCount: 7,
      days: Array.from({ length: 7 }, (_, d) => ({ day: d + 1, tasks: [
        task('listen', 'استمع إلى ملخص «العادات الذرية» كاملًا', 10, { summaryId: 8 }),
        task('write', 'اكتب عادة صغيرة واحدة ستبدأها اليوم في سطرين', 10)
      ] })) },
    { id: 2, title: 'تحدي المعنى', desc: 'خمسة أيام مع «الإنسان يبحث عن المعنى» لفيكتور فرانكل.', subscribersOnly: false,
      startOffsetDays: -4, daysCount: 5,
      days: Array.from({ length: 5 }, (_, d) => ({ day: d + 1, tasks: [
        task('listen', 'استمع إلى ملخص «الإنسان يبحث عن المعنى»', 10, { summaryId: 5 }),
        task('mcq', 'ما الرسالة الأساسية عند فرانكل؟', 10, { options: ['المعنى يُكتشف حتى في المعاناة', 'السعادة هدف يُطارد مباشرة', 'المال أصل كل معنى'], correct: 0 })
      ] })) },
    { id: 3, title: 'تحدي المال الواعي', desc: 'ثلاثة أيام مع «سيكولوجية المال» — للمشتركين.', subscribersOnly: true,
      startOffsetDays: 0, daysCount: 3,
      days: Array.from({ length: 3 }, (_, d) => ({ day: d + 1, tasks: [
        task('listen', 'استمع إلى ملخص «سيكولوجية المال»', 10, { summaryId: 2 }),
        task('write', 'اكتب قرارًا ماليًا واحدًا ستعيد التفكير فيه', 10)
      ] })) },
    { id: 4, title: 'تحدي السكينة والذكر', desc: 'ثلاثة أيام من السكينة مع «قوة الآن».', subscribersOnly: false,
      startOffsetDays: 2, daysCount: 3,
      days: Array.from({ length: 3 }, (_, d) => ({ day: d + 1, tasks: [
        task('listen', 'استمع إلى ملخص «قوة الآن»', 10, { summaryId: 1 }),
        task('write', 'اكتب لحظة حضور واحدة عشتها اليوم', 10)
      ] })) }
  ];
}
let db;
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { db = emptyDb(); saveDb(); }
}
function saveDb() {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_PATH);
}
loadDb();

// ---------- أدوات مساعدة ----------
const cairoDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // YYYY-MM-DD
const now = () => Date.now();
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function newAccount(username, password, displayName) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: crypto.randomUUID(), username, displayName: displayName || username,
    avatar: '📚', passHash: hashPassword(password, salt), salt,
    isSubscriber: false, createdAt: now()
  };
}
const LEVELS = [
  { name: 'برونزي', min: 0 }, { name: 'فضي', min: 100 }, { name: 'ذهبي', min: 250 },
  { name: 'بلاتيني', min: 500 }, { name: 'أسطوري', min: 1000 }
];
function balanceOf(accountId) {
  return db.ledger.filter(l => l.accountId === accountId).reduce((s, l) => s + l.points, 0);
}
function levelOf(points) {
  let cur = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) { cur = LEVELS[i]; next = LEVELS[i + 1] || null; }
  return { name: cur.name, min: cur.min, next: next ? { name: next.name, min: next.min } : null };
}
// منح النقاط من الخادم فقط، بمفتاح فريد يمنع التكرار
function award(accountId, key, points, reason) {
  if (db.ledger.some(l => l.accountId === accountId && l.key === key)) return false;
  db.ledger.push({ accountId, key, points, reason, at: now() });
  return true;
}
function publicAccount(a) {
  const points = balanceOf(a.id);
  return { id: a.id, username: a.username, displayName: a.displayName, avatar: a.avatar, isSubscriber: a.isSubscriber, points, level: levelOf(points) };
}

// ---------- خادم HTTP ----------
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': typeof obj === 'object' && !Buffer.isBuffer(obj) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
function sessionAccount(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/session=([a-f0-9]{64})/);
  if (!m) return null;
  const id = db.sessions[m[1]];
  return db.accounts.find(a => a.id === id) || null;
}
function startSession(res, accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = accountId; saveDb();
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.mp3': 'audio/mpeg', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
function serveStatic(req, res, urlPath) {
  const file = path.join(ROOT, 'public', urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) { send(res, 404, 'غير موجود'); return; }
  const ext = path.extname(file);
  const size = fs.statSync(file).size;
  const range = req.headers.range;
  if (range && ext === '.mp3') {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = parseInt(s, 10) || 0, end = e ? parseInt(e, 10) : size - 1;
    res.writeHead(206, { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // ===== الحسابات =====
    if (p === '/api/register' && req.method === 'POST') {
      const { username, password, displayName } = await readBody(req);
      const uname = String(username || '').trim();
      if (uname.length < 3 || String(password || '').length < 6) return send(res, 400, { error: 'اسم المستخدم ٣ أحرف على الأقل وكلمة المرور ٦ أحرف على الأقل' });
      if (db.accounts.some(a => a.username.toLowerCase() === uname.toLowerCase())) return send(res, 400, { error: 'اسم المستخدم مستخدم من قبل' });
      const acc = newAccount(uname, String(password), String(displayName || '').trim());
      db.accounts.push(acc);
      award(acc.id, 'welcome', 20, 'مكافأة ترحيب');
      saveDb(); startSession(res, acc.id);
      return send(res, 200, { account: publicAccount(acc) });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const acc = db.accounts.find(a => a.username.toLowerCase() === String(username || '').trim().toLowerCase());
      if (!acc || acc.passHash !== hashPassword(String(password || ''), acc.salt)) return send(res, 401, { error: 'بيانات الدخول غير صحيحة' });
      startSession(res, acc.id);
      return send(res, 200, { account: publicAccount(acc) });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const m = (req.headers.cookie || '').match(/session=([a-f0-9]{64})/);
      if (m) { delete db.sessions[m[1]]; saveDb(); }
      res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
      return send(res, 200, { ok: true });
    }
    if (p === '/api/me') {
      const acc = sessionAccount(req);
      return send(res, 200, { account: acc ? publicAccount(acc) : null });
    }
    if (p === '/api/profile' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const { displayName, avatar } = await readBody(req);
      if (displayName) acc.displayName = String(displayName).slice(0, 40);
      if (avatar) acc.avatar = String(avatar).slice(0, 4);
      saveDb(); return send(res, 200, { account: publicAccount(acc) });
    }
    if (p === '/api/change-password' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const { current, next } = await readBody(req);
      if (acc.passHash !== hashPassword(String(current || ''), acc.salt)) return send(res, 400, { error: 'كلمة المرور الحالية غير صحيحة' });
      if (String(next || '').length < 6) return send(res, 400, { error: 'كلمة المرور الجديدة ٦ أحرف على الأقل' });
      acc.salt = crypto.randomBytes(16).toString('hex');
      acc.passHash = hashPassword(String(next), acc.salt);
      saveDb(); return send(res, 200, { ok: true });
    }
    if (p === '/api/subscribe' && req.method === 'POST') { // محاكاة فقط — لا بوابة دفع حقيقية
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      acc.isSubscriber = true; saveDb();
      return send(res, 200, { account: publicAccount(acc), note: 'تفعيل تجريبي — لا توجد بوابة دفع حقيقية بعد' });
    }
    // ===== النقاط =====
    if (p === '/api/claim-daily' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const added = award(acc.id, 'daily:' + cairoDay(), 10, 'حضور يومي');
      saveDb();
      return send(res, 200, { added, account: publicAccount(acc) });
    }
    if (p === '/api/my-points') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const history = db.ledger.filter(l => l.accountId === acc.id).slice(-50).reverse();
      return send(res, 200, { account: publicAccount(acc), history });
    }
    if (p === '/api/leaderboard') {
      const rows = db.accounts.map(a => { const pa = publicAccount(a); return { displayName: pa.displayName, avatar: pa.avatar, points: pa.points, level: pa.level.name }; })
        .sort((x, y) => y.points - x.points).slice(0, 50);
      return send(res, 200, { rows });
    }
    // ===== المكتبة =====
    if (p === '/api/summaries') {
      const acc = sessionAccount(req);
      const list = CONTENT.summaries.map(s => {
        const pr = acc ? db.progress.find(x => x.accountId === acc.id && x.summaryId === s.id) : null;
        const ratings = db.progress.filter(x => x.summaryId === s.id && x.rating);
        return { id: s.id, title: s.title, author: s.author, category: s.category, durationSec: s.durationSec, audio: '/audio/' + s.audio,
          avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b.rating, 0) / ratings.length * 10) / 10 : null,
          my: pr ? { completed: !!pr.completed, rating: pr.rating || 0, favorite: !!pr.favorite, positionSec: pr.positionSec || 0 } : null };
      });
      return send(res, 200, { summaries: list });
    }
    const sumMatch = p.match(/^\/api\/summaries\/(\d+)$/);
    if (sumMatch) {
      const s = CONTENT.summaries.find(x => x.id === Number(sumMatch[1]));
      if (!s) return send(res, 404, { error: 'غير موجود' });
      return send(res, 200, { summary: Object.assign({}, s, { audio: '/audio/' + s.audio }) });
    }
    if (p === '/api/progress' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا لحفظ تقدّمك ونقاطك' });
      const { summaryId, completed, rating, favorite, positionSec } = await readBody(req);
      let pr = db.progress.find(x => x.accountId === acc.id && x.summaryId === summaryId);
      if (!pr) { pr = { accountId: acc.id, summaryId, completed: false, rating: 0, favorite: false, positionSec: 0 }; db.progress.push(pr); }
      let awardedNow = 0;
      if (completed && !pr.completed) { pr.completed = true; if (award(acc.id, 'summary:' + summaryId, 50, 'إكمال ملخص')) awardedNow += 50; }
      if (rating) { const first = !pr.rating; pr.rating = rating; if (first && award(acc.id, 'rating:' + summaryId, 5, 'أول تقييم')) awardedNow += 5; }
      if (favorite !== undefined) { const first = !pr.favorite && favorite; pr.favorite = !!favorite; if (first && award(acc.id, 'favorite:' + summaryId, 3, 'أول إضافة للمفضلة')) awardedNow += 3; }
      if (positionSec !== undefined) pr.positionSec = Math.max(0, Math.floor(positionSec));
      saveDb();
      return send(res, 200, { ok: true, awardedNow, account: publicAccount(acc) });
    }
    // ===== التصويت =====
    if (p === '/api/requests') {
      const acc = sessionAccount(req);
      const rows = db.requests.map(r => ({ id: r.id, title: r.title, votes: r.votes + db.votes.filter(v => v.bookId === r.id).length, mine: acc ? db.votes.some(v => v.accountId === acc.id && v.bookId === r.id) : false }))
        .sort((a, b) => b.votes - a.votes);
      return send(res, 200, { requests: rows });
    }
    if (p === '/api/vote' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const { bookId } = await readBody(req);
      if (!db.votes.some(v => v.accountId === acc.id && v.bookId === bookId)) {
        db.votes.push({ accountId: acc.id, bookId });
        award(acc.id, 'vote:' + bookId, 3, 'تصويت لكتاب');
        saveDb();
      }
      return send(res, 200, { account: publicAccount(acc) });
    }
    // ===== البودكاست =====
    if (p === '/api/episodes') {
      const acc = sessionAccount(req);
      const locked = !(acc && acc.isSubscriber);
      const list = CONTENT.episodes.map(e => ({ id: e.id, title: e.title, durationSec: e.durationSec, locked, audio: locked ? null : '/audio/' + e.audio, text: locked ? null : e.text }));
      return send(res, 200, { episodes: list, isSubscriber: !locked });
    }

    // ===== التحديات =====
    const challengeState = (ch, acc) => {
      // startOffsetDays: كم يومًا مرّ منذ بداية التحدي (سالب = يبدأ بعد أيام)
      const currentDay = Math.max(1, Math.min(ch.daysCount, -ch.startOffsetDays + 1));
      const enrolled = acc ? db.enrollments.some(e => e.accountId === acc.id && e.challengeId === ch.id) : false;
      const done = acc ? db.taskProgress.filter(t => t.accountId === acc.id && t.challengeId === ch.id).length : 0;
      const total = ch.days.reduce((s, d) => s + d.tasks.length, 0);
      return { enrolled, doneTasks: done, totalTasks: total, currentDay };
    };
    if (p === '/api/challenges') {
      const acc = sessionAccount(req);
      const list = db.challenges.map(ch => Object.assign({ id: ch.id, title: ch.title, desc: ch.desc, subscribersOnly: ch.subscribersOnly, daysCount: ch.daysCount }, challengeState(ch, acc)));
      return send(res, 200, { challenges: list });
    }
    const chMatch = p.match(/^\/api\/challenges\/(\d+)$/);
    if (chMatch) {
      const acc = sessionAccount(req);
      const ch = db.challenges.find(x => x.id === Number(chMatch[1]));
      if (!ch) return send(res, 404, { error: 'غير موجود' });
      const st = challengeState(ch, acc);
      const days = ch.days.map(d => ({
        day: d.day, locked: d.day > st.currentDay,
        tasks: d.tasks.map((t, i) => Object.assign({}, t, { done: acc ? db.taskProgress.some(x => x.accountId === acc.id && x.challengeId === ch.id && x.day === d.day && x.taskIdx === i) : false }))
      }));
      return send(res, 200, { challenge: Object.assign({}, ch, st, { days }) });
    }
    if (p === '/api/challenges/join' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const { challengeId } = await readBody(req);
      const ch = db.challenges.find(x => x.id === challengeId);
      if (!ch) return send(res, 404, { error: 'غير موجود' });
      if (ch.subscribersOnly && !acc.isSubscriber) return send(res, 403, { error: 'هذا التحدي للمشتركين' });
      if (!db.enrollments.some(e => e.accountId === acc.id && e.challengeId === challengeId)) {
        db.enrollments.push({ accountId: acc.id, challengeId, joinedAt: now() }); saveDb();
      }
      return send(res, 200, { ok: true });
    }
    if (p === '/api/challenges/task' && req.method === 'POST') {
      const acc = sessionAccount(req); if (!acc) return send(res, 401, { error: 'سجّل الدخول أولًا' });
      const { challengeId, day, taskIdx, answer } = await readBody(req);
      const ch = db.challenges.find(x => x.id === challengeId);
      if (!ch) return send(res, 404, { error: 'غير موجود' });
      if (!db.enrollments.some(e => e.accountId === acc.id && e.challengeId === challengeId)) return send(res, 403, { error: 'انضم إلى التحدي أولًا' });
      const st = challengeState(ch, acc);
      if (day > st.currentDay) return send(res, 403, { error: 'هذا اليوم لم يفتح بعد' });
      const taskDef = ch.days[day - 1] && ch.days[day - 1].tasks[taskIdx];
      if (!taskDef) return send(res, 404, { error: 'مهمة غير موجودة' });
      if (taskDef.type === 'mcq' && Number(answer) !== taskDef.correct) return send(res, 200, { ok: false, error: 'إجابة غير صحيحة — حاول مرة أخرى' });
      if (taskDef.type === 'write' && String(answer || '').trim().length < 3) return send(res, 200, { ok: false, error: 'اكتب إجابة قصيرة أولًا' });
      if (taskDef.type === 'listen') {
        const pr = db.progress.find(x => x.accountId === acc.id && x.summaryId === taskDef.summaryId);
        if (!pr || !pr.completed) return send(res, 200, { ok: false, error: 'أكمل الاستماع إلى الملخص من المكتبة أولًا' });
      }
      let awardedNow = 0;
      if (!db.taskProgress.some(x => x.accountId === acc.id && x.challengeId === challengeId && x.day === day && x.taskIdx === taskIdx)) {
        db.taskProgress.push({ accountId: acc.id, challengeId, day, taskIdx, answer: taskDef.type === 'write' ? String(answer).slice(0, 500) : answer });
        if (award(acc.id, `challenge:${challengeId}:${day}:${taskIdx}`, taskDef.points, 'مهمة تحدي: ' + ch.title)) awardedNow = taskDef.points;
        saveDb();
      }
      return send(res, 200, { ok: true, awardedNow, account: publicAccount(acc) });
    }
    // ===== ملفات ثابتة =====
    if (req.method === 'GET' && !p.startsWith('/api/')) return serveStatic(req, res, p);
    return send(res, 404, { error: 'غير موجود' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'خطأ في الخادم' });
  }
});

server.listen(PORT, () => console.log('ملخصات كتب — النسخة العامة تعمل على المنفذ ' + PORT));
