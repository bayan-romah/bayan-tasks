/* =============================================================
   محرك اتفاقية مستوى الخدمة — احتساب أيام العمل والالتزام
   -------------------------------------------------------------
   لا يعتمد هذا الملف على أي ملف آخر عدا config.js.
   كل حسابات المدد والنِّسب والألوان تمرّ من هنا حصراً، حتى لا
   تختلف النتيجة بين شاشة وأخرى.
   ============================================================= */

const SLA = (() => {

  /* ---------- أدوات نصية (منقولة من نظام الاتفاقية الحالي) ---------- */

  const AR = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

  const esc = s => String(s == null ? "" : s)
    .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* تطبيع النص العربي: حذف التشكيل والتطويل وتوحيد الألف والياء والتاء
     المربوطة — حتى يجد البحث «رابط تبرع» في «رابط تبرّع» */
  const norm = s => String(s == null ? "" : s).toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

  const dayWord = n => {
    n = Number(n);
    if (n === 1) return "يوم عمل واحد";
    if (n === 2) return "يوما عمل";
    if (n <= 10) return AR(n) + " أيام عمل";
    return AR(n) + " يوم عمل";
  };

  const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  const toDate = d => (d instanceof Date) ? d : (d ? new Date(d) : null);

  const fmtDate = d => {
    d = toDate(d); if (!d || isNaN(d)) return "—";
    return `${AR_DAYS[d.getDay()]} ${AR(d.getDate())} ${AR_MONTHS[d.getMonth()]} ${AR(d.getFullYear())}`;
  };

  const fmtShort = d => {
    d = toDate(d); if (!d || isNaN(d)) return "—";
    return `${AR(String(d.getDate()).padStart(2, "0"))}/${AR(String(d.getMonth() + 1).padStart(2, "0"))}/${AR(d.getFullYear())}`;
  };

  const fmtDateTime = d => {
    d = toDate(d); if (!d || isNaN(d)) return "—";
    const h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
    const per = h < 12 ? "صباحاً" : "مساءً";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${fmtShort(d)} — ${AR(h12)}:${AR(m)} ${per}`;
  };

  /* «قبل ٣ أيام» / «خلال يومين» */
  const relDays = n => {
    const a = Math.abs(n);
    const word = a === 0 ? "اليوم" : a === 1 ? "يوم واحد" : a === 2 ? "يومان"
      : a <= 10 ? AR(a) + " أيام" : AR(a) + " يوماً";
    if (a === 0) return "اليوم";
    return n < 0 ? "متأخرة " + word : "متبقٍ " + word;
  };

  /* ---------- أيام العمل ---------- */

  let HOLIDAYS = new Set();   // بصيغة "YYYY-MM-DD"

  const key = d => {
    d = toDate(d);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const setHolidays = list => {
    HOLIDAYS = new Set((list || []).map(h => (typeof h === "string" ? h : h.date)));
  };

  const isWorkingDay = d => {
    d = toDate(d);
    return CONFIG.WORK_DAYS.indexOf(d.getDay()) !== -1 && !HOLIDAYS.has(key(d));
  };

  const startOfDay = (d, hour) => {
    d = new Date(toDate(d).getTime());
    d.setHours(hour == null ? 0 : hour, 0, 0, 0);
    return d;
  };

  /* أول لحظة عمل صالحة لبدء احتساب المدة:
     — إن كان اليوم عطلة  → بداية أول يوم عمل تالٍ
     — إن كان بعد ساعة القطع (٢ ظهراً) → بداية يوم العمل التالي
     — إن كان قبل بداية الدوام → بداية دوام اليوم نفسه */
  const effectiveStart = from => {
    let d = new Date(toDate(from).getTime());
    if (!isWorkingDay(d) || d.getHours() >= CONFIG.CUTOFF_HOUR) {
      do { d.setDate(d.getDate() + 1); } while (!isWorkingDay(d));
      return startOfDay(d, CONFIG.WORK_START_HOUR);
    }
    if (d.getHours() < CONFIG.WORK_START_HOUR) return startOfDay(d, CONFIG.WORK_START_HOUR);
    return d;
  };

  /* تاريخ الاستحقاق = نهاية دوام يوم العمل رقم n بعد لحظة البدء الفعلية */
  const addWorkingDays = (from, n) => {
    let d = effectiveStart(from);
    let left = Math.max(1, Math.ceil(Number(n) || CONFIG.DEFAULT_SLA_DAYS));
    // يوم البدء نفسه يُحتسب أول أيام المدة
    left -= 1;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (isWorkingDay(d)) left -= 1;
    }
    return startOfDay(d, CONFIG.WORK_END_HOUR);
  };

  /* عدد أيام العمل بين تاريخين (موجب إن كان الثاني بعد الأول) */
  const workingDaysBetween = (a, b) => {
    a = startOfDay(a); b = startOfDay(b);
    if (a.getTime() === b.getTime()) return 0;
    const sign = b > a ? 1 : -1;
    let from = sign > 0 ? new Date(a) : new Date(b);
    const to = sign > 0 ? b : a;
    let count = 0;
    while (from < to) {
      from.setDate(from.getDate() + 1);
      if (isWorkingDay(from)) count++;
    }
    return count * sign;
  };

  /* مدة الخدمة بعد تطبيق الاستعجال */
  const effectiveDays = (slaDays, priority) => {
    const base = Math.max(1, Number(slaDays) || CONFIG.DEFAULT_SLA_DAYS);
    return priority === "urgent" ? Math.max(1, Math.ceil(base * CONFIG.URGENT_FACTOR)) : base;
  };

  /* ---------- حالة المهمة زمنياً ---------- */

  const OPEN_STATES = ["submitted", "screening", "returned", "accepted", "assigned", "in_progress", "pending_approval"];
  const DONE_STATES = ["completed", "closed"];
  const DEAD_STATES = ["rejected", "cancelled"];

  const isOpen = t => OPEN_STATES.indexOf(t.status) !== -1;
  const isDone = t => DONE_STATES.indexOf(t.status) !== -1;
  const isDead = t => DEAD_STATES.indexOf(t.status) !== -1;

  /* المهمة لم تبدأ مدتها بعد (مسار الطلب) */
  const notStarted = t => !t.accepted_at || !t.due_at;

  /* هل تأخرت؟ المنجزة تُقارَن بلحظة الإنجاز، والمفتوحة تُقارَن بالآن */
  const isLate = (t, now) => {
    if (notStarted(t) || isDead(t)) return false;
    const due = toDate(t.due_at);
    if (isDone(t)) return toDate(t.completed_at || t.closed_at) > due;
    return (now ? toDate(now) : new Date()) > due;
  };

  /* أيام العمل المتبقية (سالبة = متأخرة) */
  const daysLeft = (t, now) => {
    if (notStarted(t)) return null;
    const ref = isDone(t) ? toDate(t.completed_at || t.closed_at) : (now ? toDate(now) : new Date());
    return workingDaysBetween(ref, toDate(t.due_at));
  };

  /* درجة التصعيد المستحقة حالياً (أو null) */
  const escalationLevel = (t, now) => {
    if (!isLate(t, now) || isDone(t)) return null;
    const over = -workingDaysBetween(now ? toDate(now) : new Date(), toDate(t.due_at));
    let level = null;
    CONFIG.ESCALATION.forEach(e => { if (over >= e.days) level = e; });
    return level ? Object.assign({ over }, level) : null;
  };

  /* ---------- النِّسب والمؤشر الملوَّن ---------- */

  /* نسبة الالتزام = المنجز في الموعد ÷ (المنجز + المتأخر) */
  const commitmentRate = (tasks, now) => {
    const judged = tasks.filter(t => !isDead(t) && !notStarted(t) && (isDone(t) || isLate(t, now)));
    if (!judged.length) return null;
    const onTime = judged.filter(t => !isLate(t, now)).length;
    return Math.round((onTime / judged.length) * 1000) / 10;
  };

  /* معدل الإنجاز = المنجز ÷ إجمالي المهام الفاعلة */
  const completionRate = tasks => {
    const live = tasks.filter(t => !isDead(t));
    if (!live.length) return null;
    return Math.round((live.filter(isDone).length / live.length) * 1000) / 10;
  };

  /* متوسط أيام العمل الفعلية للإنجاز */
  const avgTurnaround = tasks => {
    const done = tasks.filter(t => isDone(t) && t.accepted_at);
    if (!done.length) return null;
    const sum = done.reduce((a, t) =>
      a + workingDaysBetween(t.accepted_at, t.completed_at || t.closed_at), 0);
    return Math.round((sum / done.length) * 10) / 10;
  };

  /* المؤشر الملوَّن — المصدر الوحيد لألوان الالتزام في النظام كله */
  const slaColor = pct => {
    if (pct == null || isNaN(pct)) return { key: "none", color: "var(--muted)", label: "لا توجد بيانات كافية" };
    if (pct >= CONFIG.THRESHOLD_OK) return { key: "ok", color: "var(--ok)", label: "ملتزم" };
    if (pct >= CONFIG.THRESHOLD_WARN) return { key: "warn", color: "var(--warn)", label: "تحت المتابعة" };
    return { key: "danger", color: "var(--danger)", label: "متعثر" };
  };

  const pctText = p => p == null ? "—" : AR(String(p).replace(".", "٫")) + "٪";

  /* ---------- إحصاءات مجموعة مهام ---------- */
  const summarize = (tasks, now) => {
    const live = tasks.filter(t => !isDead(t));
    return {
      total: tasks.length,
      live: live.length,
      open: live.filter(isOpen).length,
      done: live.filter(isDone).length,
      late: live.filter(t => isLate(t, now)).length,
      lateOpen: live.filter(t => isOpen(t) && isLate(t, now)).length,
      awaiting: live.filter(t => notStarted(t) && isOpen(t)).length,
      cancelled: tasks.filter(isDead).length,
      commitment: commitmentRate(tasks, now),
      completion: completionRate(tasks),
      avgDays: avgTurnaround(tasks),
    };
  };

  return {
    AR, esc, norm, dayWord, fmtDate, fmtShort, fmtDateTime, relDays, dateKey: key,
    setHolidays, isWorkingDay, effectiveStart, addWorkingDays, workingDaysBetween, effectiveDays,
    OPEN_STATES, DONE_STATES, DEAD_STATES, isOpen, isDone, isDead, notStarted,
    isLate, daysLeft, escalationLevel,
    commitmentRate, completionRate, avgTurnaround, slaColor, pctText, summarize,
  };
})();
