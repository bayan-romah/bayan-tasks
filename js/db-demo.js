/* =============================================================
   طبقة البيانات — الوضع التجريبي (تخزين محلي في المتصفح)
   -------------------------------------------------------------
   تنفّذ نفس الواجهة الموجودة في db-supabase.js بالضبط، حتى يمكن
   التبديل بينهما بتعبئة مفتاحين في config.js دون تغيير أي شاشة.

   ⚠️ البيانات هنا محفوظة في متصفح هذا الجهاز فقط ولا تُشارك مع
      بقية الموظفين. للاستخدام الحقيقي اربط النظام بـ Supabase.
   ============================================================= */

const DemoDB = (() => {

  const KEY = "bayan_tasks_v1";
  let S = null;         // الحالة الكاملة
  let session = null;   // المستخدم الحالي

  /* ---------- أدوات ---------- */
  const uid = p => p + "-" + Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const iso = d => new Date(d).toISOString();

  /* مولّد عشوائي ثابت النتيجة، حتى تبقى البيانات التجريبية نفسها */
  let _seed = 20260902;
  const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const chance = p => rnd() < p;

  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  /* ---------- توليد بيانات تجريبية واقعية ---------- */
  function buildDemoState() {
    const departments = AQSAM.map(d => ({ id: d.id, name: d.name, icon: d.icon, sort_order: d.sort, desc: d.desc }));

    const services = [];
    AQSAM.forEach(d => d.services.forEach(s => services.push({
      id: s.id, department_id: d.id, name: s.name, sla_days: s.days,
      audience: s.audience.slice(), channel: s.channel,
      reqs: s.reqs.slice(), flow: s.flow.slice(), note: s.note || "", active: true,
    })));

    const profiles = USERS_SEED.map((u, i) => ({
      id: "u" + String(i + 1).padStart(3, "0"),
      email: u.email, password: DEMO_PASSWORD, full_name: u.name,
      role: u.role, department_id: u.dept, job_title: u.title, active: true,
    }));

    const holidays = HOLIDAYS_SEED.map(h => Object.assign({}, h));
    SLA.setHolidays(holidays);

    const state = {
      departments, services, profiles, holidays,
      tasks: [], events: [], files: [], seq: 0,
    };

    generateTasks(state);
    return state;
  }

  /* أداء مستهدف لكل إدارة — معايَر بحيث تظهر الحالات الثلاث في اللوحة:
     إدارات خضراء (≥٩٠٪) وصفراء (٧٥–٩٠٪) وحمراء (<٧٥٪) بعد إضافة
     المهام المتأخرة القائمة المذكورة أدناه. */
  const TARGET = {
    rel: 1.00, hr: 1.00, edu_f: 1.00, vol: 0.97,   // متوقَّع أخضر
    fin: 0.92, ceo: 0.90, edu_m: 0.88,             // متوقَّع أصفر
    inv: 0.70, qa: 0.65,                           // متوقَّع أحمر
  };

  function generateTasks(state) {
    const today = new Date(); today.setHours(11, 0, 0, 0);
    const employees = state.profiles.filter(p => p.role === "employee");
    const managers = state.profiles.filter(p => p.role === "manager");
    const requesters = state.profiles.filter(p => p.role !== "owner");

    state.departments.forEach(dept => {
      const svcs = state.services.filter(s => s.department_id === dept.id);
      const staff = employees.filter(p => p.department_id === dept.id);
      const mgr = managers.filter(p => p.department_id === dept.id)[0];
      const pool = staff.length ? staff : (mgr ? [mgr] : []);
      const target = TARGET[dept.id] || 0.9;

      const n = 12 + Math.floor(rnd() * 5);   // ١٢–١٦ مهمة لكل إدارة
      for (let i = 0; i < n; i++) {
        const svc = pick(svcs);
        const requester = pick(requesters.filter(p => p.department_id !== dept.id).concat(requesters));
        const ageDays = Math.floor(rnd() * 155);          // خلال ~٥ أشهر
        const created = new Date(today.getTime() - ageDays * 86400000);
        created.setHours(8 + Math.floor(rnd() * 7), Math.floor(rnd() * 60), 0, 0);

        const priority = chance(0.12) ? "urgent" : "normal";
        const slaDays = SLA.effectiveDays(svc.sla_days, priority);

        const t = {
          id: uid("t"),
          ref_no: null,
          service_id: svc.id,
          title: svc.name,
          description: "طلب مقدَّم عبر «" + svc.channel + "».",
          priority,
          requester_id: requester.id,
          requester_dept: requester.department_id,
          department_id: dept.id,
          assignee_id: null,
          status: "submitted",
          sla_days: slaDays,
          created_at: iso(created),
          accepted_at: null, due_at: null, completed_at: null, closed_at: null,
          return_reason: null, satisfaction: null,
        };

        /* مسار الطلب: نسبة صغيرة تُعاد أو تُرفض أو تُسحب */
        if (ageDays < 3 && chance(0.5)) {
          pushEvent(state, t, null, "submitted", requester.id, created, "رفع الطلب");
          finalize(state, t); continue;
        }
        if (chance(0.06)) {
          t.status = "returned";
          t.return_reason = "المرفقات غير مكتملة — يرجى إرفاق المستند المعتمد.";
          pushEvent(state, t, null, "submitted", requester.id, created, "رفع الطلب");
          pushEvent(state, t, "submitted", "returned", mgr ? mgr.id : requester.id,
            addH(created, 6), t.return_reason);
          finalize(state, t); continue;
        }
        if (chance(0.04)) {
          t.status = "rejected";
          pushEvent(state, t, null, "submitted", requester.id, created, "رفع الطلب");
          pushEvent(state, t, "submitted", "rejected", mgr ? mgr.id : requester.id,
            addH(created, 10), "الطلب خارج نطاق خدمات الإدارة.");
          finalize(state, t); continue;
        }

        /* القبول وبدء المدة */
        const acceptedAt = addH(created, 3 + Math.floor(rnd() * 20));
        t.accepted_at = iso(acceptedAt);
        t.due_at = iso(SLA.addWorkingDays(acceptedAt, slaDays));
        pushEvent(state, t, null, "submitted", requester.id, created, "رفع الطلب");
        pushEvent(state, t, "submitted", "accepted", mgr ? mgr.id : requester.id, acceptedAt,
          "الطلب مكتمل المتطلبات — بدأ احتساب المدة.");

        const assignee = pool.length ? pick(pool) : null;
        if (assignee) {
          t.assignee_id = assignee.id;
          t.status = "assigned";
          pushEvent(state, t, "accepted", "assigned", mgr ? mgr.id : requester.id,
            addH(acceptedAt, 2), "إسناد المهمة إلى " + assignee.full_name);
        }

        const due = new Date(t.due_at);

        if (due > today) {
          if (assignee && chance(0.8)) {
            t.status = "in_progress";
            pushEvent(state, t, "assigned", "in_progress", assignee.id, addH(acceptedAt, 6), "");
            if (chance(0.3)) {
              t.status = "pending_approval";
              pushEvent(state, t, "in_progress", "pending_approval", assignee.id,
                addH(acceptedAt, 20), "تم إنجاز المطلوب ورفعه للاعتماد.");
            }
          }
          finalize(state, t); continue;
        }

        /* مهمة منتهية — يُحدَّد التزامها وفق نسبة الإدارة المستهدفة */
        const onTime = chance(target);
        let completedAt;
        if (onTime) {
          const span = Math.max(1, SLA.workingDaysBetween(acceptedAt, due) - Math.floor(rnd() * 2));
          completedAt = SLA.addWorkingDays(acceptedAt, Math.max(1, span));
          if (completedAt > due) completedAt = new Date(due.getTime() - 3600000);
        } else {
          completedAt = SLA.addWorkingDays(due, 1 + Math.floor(rnd() * 4));
        }
        if (completedAt > today) completedAt = new Date(today.getTime() - 86400000);

        if (assignee) {
          pushEvent(state, t, t.status, "in_progress", assignee.id, addH(acceptedAt, 6), "");
          pushEvent(state, t, "in_progress", "pending_approval", assignee.id,
            addH(completedAt, -2), "تم إنجاز المطلوب ورفعه للاعتماد.");
        }
        t.status = "completed";
        t.completed_at = iso(completedAt);
        pushEvent(state, t, "pending_approval", "completed", mgr ? mgr.id : requester.id,
          completedAt, "اعتماد الإنجاز.");

        if (chance(0.7)) {
          const closedAt = addH(completedAt, 4 + Math.floor(rnd() * 30));
          if (closedAt < today) {
            t.status = "closed";
            t.closed_at = iso(closedAt);
            t.satisfaction = chance(0.8) ? 5 : (chance(0.6) ? 4 : 3);
            pushEvent(state, t, "completed", "closed", requester.id, closedAt,
              "تم الاستلام — التقييم: " + t.satisfaction + "/5");
          }
        }
        finalize(state, t);
      }

      /* ---- مهام متأخرة قائمة ----
         تُولَّد بعدد ثابت لكل إدارة بدل تركها للاحتمال، لأن المؤشر الأحمر
         وآلية التصعيد لا تظهران إن لم يوجد تأخر قائم. العدد يتناسب عكسياً
         مع نسبة التزام الإدارة. */
      const quota = Math.max(1, Math.round((1 - target) * 5));
      for (let k = 0; k < quota && svcs.length; k++) {
        const svc = pick(svcs);
        const requester = pick(requesters);
        const assignee = pool.length ? pick(pool) : null;
        const overdueBy = 1 + Math.floor(rnd() * 9);   // متأخرة ١–٩ أيام عمل

        /* ارجع للخلف بعدد أيام تقويمية صحيح يغطي المدة + التأخر + العطل */
        const backDays = Math.round((svc.sla_days + overdueBy) * 1.5) + 2;
        const acceptedAt = new Date(today.getTime() - backDays * 86400000);
        acceptedAt.setHours(9, 30, 0, 0);
        const createdAt = addH(acceptedAt, -5);
        const dueAt = SLA.addWorkingDays(acceptedAt, svc.sla_days);
        if (dueAt >= today) continue;                  // لم تتأخر فعلاً — تجاوزها

        const t = {
          id: uid("t"), ref_no: null, service_id: svc.id, title: svc.name,
          description: "طلب مقدَّم عبر «" + svc.channel + "».",
          priority: chance(0.25) ? "urgent" : "normal",
          requester_id: requester.id, requester_dept: requester.department_id,
          department_id: dept.id, assignee_id: assignee ? assignee.id : null,
          status: assignee ? (chance(0.3) ? "pending_approval" : "in_progress") : "accepted",
          sla_days: svc.sla_days,
          created_at: iso(createdAt), accepted_at: iso(acceptedAt), due_at: iso(dueAt),
          completed_at: null, closed_at: null, return_reason: null, satisfaction: null,
        };
        pushEvent(state, t, null, "submitted", requester.id, createdAt, "رفع الطلب");
        pushEvent(state, t, "submitted", "accepted", mgr ? mgr.id : requester.id, acceptedAt,
          "الطلب مكتمل المتطلبات — بدأ احتساب المدة.");
        if (assignee) {
          pushEvent(state, t, "accepted", "assigned", mgr ? mgr.id : requester.id,
            addH(acceptedAt, 2), "إسناد المهمة إلى " + assignee.full_name);
          pushEvent(state, t, "assigned", "in_progress", assignee.id, addH(acceptedAt, 7), "");
          if (t.status === "pending_approval")
            pushEvent(state, t, "in_progress", "pending_approval", assignee.id,
              addH(acceptedAt, 26), "تم إنجاز المطلوب ورفعه للاعتماد.");
        }
        finalize(state, t);
      }
    });

    /* ترقيم المهام حسب تاريخ الرفع */
    state.tasks.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    state.tasks.forEach(t => { t.ref_no = nextRef(state, new Date(t.created_at)); });
  }

  const addH = (d, h) => new Date(new Date(d).getTime() + h * 3600000);

  function finalize(state, t) { state.tasks.push(t); }

  function pushEvent(state, t, from, to, actor, when, note) {
    state.events.push({
      id: uid("e"), task_id: t.id, actor_id: actor,
      from_status: from, to_status: to, note: note || "", created_at: iso(when),
    });
  }

  function nextRef(state, when) {
    state.seq += 1;
    return "BN-" + (when || new Date()).getFullYear() + "-" + String(state.seq).padStart(4, "0");
  }

  /* ---------- تحميل الحالة ---------- */
  function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        S = JSON.parse(raw);
        if (S && S.tasks && S.profiles) { SLA.setHolidays(S.holidays || []); return; }
      } catch (e) { /* بيانات تالفة — تُعاد البذور */ }
    }
    S = buildDemoState();
    save();
  }

  /* ---------- نطاق الرؤية (نفس منطق RLS في قاعدة البيانات) ---------- */
  function visible(t, me) {
    if (!me) return false;
    if (me.role === "owner") return true;
    if (me.role === "manager") {
      return t.department_id === me.department_id || t.requester_dept === me.department_id;
    }
    return t.assignee_id === me.id || t.requester_id === me.id;
  }

  const pub = p => p && {
    id: p.id, email: p.email, full_name: p.full_name, role: p.role,
    department_id: p.department_id, job_title: p.job_title, active: p.active,
  };

  /* ============ الواجهة العامة ============ */
  const api = {

    mode: "demo",

    async init() {
      load();
      const saved = sessionStorage.getItem(KEY + "_me");
      if (saved) {
        const p = S.profiles.filter(x => x.id === saved)[0];
        if (p && p.active) session = p;
      }
      return true;
    },

    async signIn(email, password) {
      const p = S.profiles.filter(x =>
        x.email.toLowerCase() === String(email).trim().toLowerCase())[0];
      if (!p) throw new Error("لا يوجد حساب بهذا البريد الإلكتروني.");
      if (p.password !== password) throw new Error("كلمة المرور غير صحيحة.");
      if (!p.active) throw new Error("هذا الحساب معطَّل — راجع مالك النظام.");
      session = p;
      sessionStorage.setItem(KEY + "_me", p.id);
      return pub(p);
    },

    async signOut() { session = null; sessionStorage.removeItem(KEY + "_me"); },

    me() { return pub(session); },

    async listDepartments() { return clone(S.departments).sort((a, b) => a.sort_order - b.sort_order); },

    async listServices() { return clone(S.services); },

    async saveService(svc) {
      if (session.role !== "owner") throw new Error("هذا الإجراء للمالك فقط.");
      const i = S.services.findIndex(s => s.id === svc.id);
      if (i === -1) S.services.push(Object.assign({ id: uid("s"), active: true }, svc));
      else S.services[i] = Object.assign(S.services[i], svc);
      save(); return true;
    },

    async deleteService(id) {
      if (session.role !== "owner") throw new Error("هذا الإجراء للمالك فقط.");
      const s = S.services.filter(x => x.id === id)[0];
      if (s) s.active = false;
      save(); return true;
    },

    async listProfiles() { return S.profiles.map(pub); },

    async saveProfile(p) {
      if (session.role !== "owner") throw new Error("إدارة المستخدمين للمالك فقط.");
      const i = S.profiles.findIndex(x => x.id === p.id);
      if (i === -1) {
        if (S.profiles.some(x => x.email.toLowerCase() === String(p.email).toLowerCase()))
          throw new Error("هذا البريد مسجَّل مسبقاً.");
        S.profiles.push(Object.assign({ id: uid("u"), password: DEMO_PASSWORD, active: true }, p));
      } else {
        S.profiles[i] = Object.assign(S.profiles[i], p);
      }
      save(); return true;
    },

    async listTasks() {
      return S.tasks.filter(t => visible(t, session)).map(clone);
    },

    async getTask(id) {
      const t = S.tasks.filter(x => x.id === id)[0];
      if (!t || !visible(t, session)) return null;
      return clone(t);
    },

    async createTask(payload) {
      const svc = S.services.filter(s => s.id === payload.service_id)[0];
      if (!svc) throw new Error("الخدمة غير موجودة.");
      const now = new Date();
      const t = {
        id: uid("t"),
        ref_no: nextRef(S, now),
        service_id: svc.id,
        title: payload.title || svc.name,
        description: payload.description || "",
        priority: payload.priority === "urgent" ? "urgent" : "normal",
        requester_id: session.id,
        requester_dept: session.department_id,
        department_id: svc.department_id,
        assignee_id: null,
        status: "submitted",
        sla_days: SLA.effectiveDays(svc.sla_days, payload.priority),
        created_at: iso(now),
        accepted_at: null, due_at: null, completed_at: null, closed_at: null,
        return_reason: null, satisfaction: null,
      };
      S.tasks.push(t);
      pushEvent(S, t, null, "submitted", session.id, now, payload.description || "رفع الطلب");
      (payload.files || []).forEach(f => S.files.push({
        id: uid("f"), task_id: t.id, file_name: f.name, data: f.data,
        uploaded_by: session.id, created_at: iso(now),
      }));
      save();
      return clone(t);
    },

    /* تنفيذ إجراء على المهمة — يطبّق نفس فحص الصلاحية الموجود في WF.can */
    async act(taskId, actionId, extra) {
      extra = extra || {};
      const t = S.tasks.filter(x => x.id === taskId)[0];
      if (!t) throw new Error("المهمة غير موجودة.");
      const action = WF.actionById(actionId);
      if (!action) throw new Error("إجراء غير معروف.");
      if (!WF.can(action, t, session)) throw new Error("لا تملك صلاحية هذا الإجراء.");

      const now = new Date();
      const from = t.status;
      let note = extra.note || extra.reason || "";

      switch (actionId) {
        case "accept":
          t.accepted_at = iso(now);
          t.due_at = iso(SLA.addWorkingDays(now, t.sla_days));
          note = note || "الطلب مكتمل المتطلبات — بدأ احتساب المدة.";
          break;
        case "return":
          if (!extra.reason) throw new Error("يجب بيان الناقص في الطلب.");
          /* يبقى السبب محفوظاً بعد الاستكمال أيضاً، ليُحتسب مؤشر
             «الطلبات المعادة لنقص البيانات» على تاريخ الطلب لا على حالته */
          t.return_reason = extra.reason;
          break;
        case "assign": {
          if (!extra.assignee) throw new Error("اختر المنفّذ المكلَّف.");
          const a = S.profiles.filter(p => p.id === extra.assignee)[0];
          if (!a) throw new Error("المنفّذ غير موجود.");
          t.assignee_id = a.id;
          note = "إسناد المهمة إلى " + a.full_name + (note ? " — " + note : "");
          break;
        }
        case "approve":
          t.completed_at = iso(now);
          note = note || "اعتماد الإنجاز.";
          break;
        case "close": {
          const sat = Number(extra.satisfaction);
          if (!sat || sat < 1 || sat > 5) throw new Error("اختر تقييم الخدمة من ١ إلى ٥.");
          t.closed_at = iso(now);
          t.satisfaction = sat;
          note = "تم الاستلام — التقييم: " + sat + "/5" + (note ? " — " + note : "");
          break;
        }
        case "reject":
        case "cancel":
          if (!extra.reason) throw new Error("يجب بيان السبب.");
          break;
      }

      t.status = action.to;
      pushEvent(S, t, from, action.to, session.id, now, note);

      (extra.files || []).forEach(f => S.files.push({
        id: uid("f"), task_id: t.id, file_name: f.name, data: f.data,
        uploaded_by: session.id, created_at: iso(now),
      }));

      save();
      return clone(t);
    },

    async listEvents(taskId) {
      return S.events.filter(e => e.task_id === taskId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(clone);
    },

    async listFiles(taskId) {
      return S.files.filter(f => f.task_id === taskId).map(clone);
    },

    async addFiles(taskId, files) {
      const now = new Date();
      (files || []).forEach(f => S.files.push({
        id: uid("f"), task_id: taskId, file_name: f.name, data: f.data,
        uploaded_by: session.id, created_at: iso(now),
      }));
      save(); return true;
    },

    async listHolidays() { return clone(S.holidays || []); },

    async saveHoliday(h) {
      if (session.role !== "owner") throw new Error("هذا الإجراء للمالك فقط.");
      S.holidays = (S.holidays || []).filter(x => x.date !== h.date).concat([h])
        .sort((a, b) => a.date.localeCompare(b.date));
      SLA.setHolidays(S.holidays); save(); return true;
    },

    async deleteHoliday(date) {
      if (session.role !== "owner") throw new Error("هذا الإجراء للمالك فقط.");
      S.holidays = (S.holidays || []).filter(x => x.date !== date);
      SLA.setHolidays(S.holidays); save(); return true;
    },

    /* نسخ احتياطي / استرجاع */
    async exportAll() { return JSON.stringify(S, null, 2); },

    async importAll(json) {
      const data = JSON.parse(json);
      if (!data.tasks || !data.profiles) throw new Error("الملف لا يطابق صيغة نسخة النظام.");
      S = data; SLA.setHolidays(S.holidays || []); save(); return true;
    },

    async resetDemo() {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY + "_me");
      S = buildDemoState(); save(); session = null; return true;
    },
  };

  return api;
})();
