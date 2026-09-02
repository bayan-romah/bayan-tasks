/* =============================================================
   دورة حياة المهمة — مسار الطلب ومسار التنفيذ
   -------------------------------------------------------------
   هذا الملف هو المرجع الوحيد لـ:
     • الحالات وأسمائها وألوانها
     • خطوات المسارين كما تُعرض للمستخدم
     • من يملك أي إجراء (الصلاحيات على مستوى الإجراء)
   أي تغيير في سير العمل يبدأ من هنا.
   ============================================================= */

const WF = (() => {

  /* ---------- الحالات ---------- */
  const STATUS = {
    submitted:        { label: "مُقدَّم — بانتظار الفرز", short: "بانتظار الفرز", tag: "info",  track: "request", step: 2 },
    screening:        { label: "قيد الفرز والتدقيق",      short: "قيد الفرز",     tag: "info",  track: "request", step: 3 },
    returned:         { label: "مُعاد لاستكمال البيانات",  short: "مُعاد للاستكمال", tag: "warn", track: "request", step: 3 },
    accepted:         { label: "مقبول — بدأ احتساب المدة", short: "مقبول",        tag: "ok",    track: "exec", step: 1 },
    assigned:         { label: "مُسند لمنفّذ",             short: "مُسند",         tag: "ok",    track: "exec", step: 2 },
    in_progress:      { label: "قيد التنفيذ",              short: "قيد التنفيذ",   tag: "gold",  track: "exec", step: 3 },
    pending_approval: { label: "بانتظار اعتماد المدير",    short: "بانتظار الاعتماد", tag: "gold", track: "exec", step: 4 },
    completed:        { label: "منجزة",                    short: "منجزة",        tag: "ok",    track: "exec", step: 5 },
    closed:           { label: "مغلقة",                    short: "مغلقة",        tag: "ok",    track: "exec", step: 6 },
    rejected:         { label: "مرفوضة",                   short: "مرفوضة",       tag: "danger", track: "end" },
    cancelled:        { label: "ملغاة من مقدّم الطلب",      short: "ملغاة",        tag: "grey",  track: "end" },
  };

  /* ---------- خطوات المسارين كما تُعرض ---------- */
  const TRACK_REQUEST = {
    title: "مسار الطلب",
    hint: "المدة لا تُحتسب في هذا المسار — تبدأ من لحظة القبول",
    steps: [
      { n: 1, label: "تعبئة الطلب وإرفاق المتطلبات" },
      { n: 2, label: "إرسال الطلب وتوليد رقم المتابعة" },
      { n: 3, label: "فرز وتدقيق الاكتمال من مدير الإدارة" },
      { n: 4, label: "قبول الطلب" },
    ],
  };

  const TRACK_EXEC = {
    title: "مسار التنفيذ",
    hint: "المدة تُحتسب من هنا بأيام العمل (الأحد – الخميس)",
    steps: [
      { n: 1, label: "قبول الطلب وتثبيت تاريخ الاستحقاق" },
      { n: 2, label: "الإسناد لمنفّذ مختص" },
      { n: 3, label: "التنفيذ" },
      { n: 4, label: "رفع المخرجات للاعتماد" },
      { n: 5, label: "اعتماد المدير — إنجاز" },
      { n: 6, label: "إشعار مقدّم الطلب وإغلاق" },
    ],
  };

  /* ---------- الإجراءات ----------
     who:
       dept_manager : مدير الإدارة المنفِّذة (أو المالك)
       assignee     : المنفّذ المكلَّف (أو مدير إدارته أو المالك)
       requester    : مقدّم الطلب (أو المالك)
     needs: الحقول الإلزامية قبل تنفيذ الإجراء
  */
  const ACTIONS = [
    { id: "screen", label: "بدء الفرز والتدقيق", icon: "🔍", from: ["submitted"], to: "screening",
      who: "dept_manager", style: "ghost",
      hint: "تأكيد استلام الطلب وبدء التحقق من اكتمال متطلباته." },

    { id: "return", label: "إعادة لاستكمال البيانات", icon: "↩️", from: ["submitted", "screening"], to: "returned",
      who: "dept_manager", style: "ghost", needs: ["reason"], reasonLabel: "ما الناقص في الطلب؟",
      hint: "المدة لا تبدأ، ويُشعَر مقدّم الطلب بالناقص." },

    { id: "resubmit", label: "إعادة الإرسال بعد الاستكمال", icon: "📤", from: ["returned"], to: "submitted",
      who: "requester", style: "", needs: ["note"], reasonLabel: "ما الذي استكملته؟",
      hint: "يعود الطلب لمدير الإدارة للفرز من جديد." },

    { id: "accept", label: "قبول الطلب وبدء المدة", icon: "✅", from: ["submitted", "screening"], to: "accepted",
      who: "dept_manager", style: "",
      hint: "يُثبَّت تاريخ الاستحقاق ويبدأ احتساب أيام العمل." },

    { id: "reject", label: "رفض الطلب", icon: "⛔", from: ["submitted", "screening"], to: "rejected",
      who: "dept_manager", style: "danger", needs: ["reason"], reasonLabel: "سبب الرفض",
      hint: "يُغلق الطلب ولا يدخل في احتساب الالتزام." },

    { id: "assign", label: "إسناد لمنفّذ", icon: "👤", from: ["accepted", "assigned", "in_progress"], to: "assigned",
      who: "dept_manager", style: "", needs: ["assignee"],
      hint: "يظهر الطلب في «مهامي» عند المنفّذ المكلَّف." },

    { id: "start", label: "بدء التنفيذ", icon: "▶️", from: ["assigned"], to: "in_progress",
      who: "assignee", style: "",
      hint: "تأكيد استلام المهمة والبدء فيها." },

    { id: "submit_work", label: "رفع المخرجات للاعتماد", icon: "📎", from: ["in_progress"], to: "pending_approval",
      who: "assignee", style: "", needs: ["note"], reasonLabel: "وصف ما تم إنجازه",
      hint: "أرفق المخرجات أولاً ثم ارفعها لمدير الإدارة." },

    { id: "changes", label: "إعادة للتعديل", icon: "🔄", from: ["pending_approval"], to: "in_progress",
      who: "dept_manager", style: "ghost", needs: ["reason"], reasonLabel: "المطلوب تعديله",
      hint: "المدة تستمر في الاحتساب." },

    { id: "approve", label: "اعتماد الإنجاز", icon: "🏁", from: ["pending_approval"], to: "completed",
      who: "dept_manager", style: "",
      hint: "تُقارَن لحظة الإنجاز بتاريخ الاستحقاق لتحديد الالتزام." },

    { id: "close", label: "استلام وإغلاق الطلب", icon: "🔒", from: ["completed"], to: "closed",
      who: "requester", style: "gold", needs: ["satisfaction"],
      hint: "يؤكد مقدّم الطلب الاستلام ويقيّم الخدمة." },

    { id: "cancel", label: "سحب الطلب", icon: "🗑️", from: ["submitted", "screening", "returned"], to: "cancelled",
      who: "requester", style: "ghost", needs: ["reason"], reasonLabel: "سبب السحب",
      hint: "متاح قبل قبول الطلب فقط." },
  ];

  /* ---------- من يملك هذا الإجراء على هذه المهمة؟ ---------- */
  function can(action, task, me) {
    if (!me || !me.active) return false;
    if (action.from.indexOf(task.status) === -1) return false;
    if (me.role === "owner") return true;

    switch (action.who) {
      case "dept_manager":
        return me.role === "manager" && me.department_id === task.department_id;
      case "assignee":
        return task.assignee_id === me.id ||
          (me.role === "manager" && me.department_id === task.department_id);
      case "requester":
        return task.requester_id === me.id ||
          (me.role === "manager" && me.department_id === task.requester_dept);
      default:
        return false;
    }
  }

  const actionsFor = (task, me) => ACTIONS.filter(a => can(a, task, me));
  const actionById = id => ACTIONS.filter(a => a.id === id)[0];

  /* ---------- حالة كل خطوة في المسارين ---------- */
  function trackState(task) {
    const s = task.status;
    const st = STATUS[s] || {};
    const started = !!task.accepted_at;

    /* مسار الطلب */
    let reqStep = st.track === "request" ? st.step : (started || s === "closed" || s === "completed" ? 5 : 1);
    if (s === "cancelled" || s === "rejected") reqStep = st.step || 3;

    const request = TRACK_REQUEST.steps.map(step => {
      let cls = "";
      if (step.n < reqStep) cls = "done";
      else if (step.n === reqStep) cls = (s === "returned" ? "bad" : "now");
      if (started && step.n <= 4) cls = "done";
      if ((s === "rejected" || s === "cancelled") && step.n === reqStep) cls = "bad";
      return Object.assign({ cls }, step);
    });

    /* مسار التنفيذ */
    const execStep = st.track === "exec" ? st.step : 0;
    const exec = TRACK_EXEC.steps.map(step => {
      let cls = "";
      if (execStep === 0) cls = "";
      else if (step.n < execStep) cls = "done";
      else if (step.n === execStep) cls = (s === "closed" ? "done" : "now");
      return Object.assign({ cls }, step);
    });

    return { request, exec, started };
  }

  return { STATUS, TRACK_REQUEST, TRACK_EXEC, ACTIONS, can, actionsFor, actionById, trackState };
})();
