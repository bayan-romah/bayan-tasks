/* =============================================================
   طبقة البيانات — قاعدة البيانات المشتركة (Supabase)
   -------------------------------------------------------------
   تنفّذ نفس واجهة db-demo.js حرفياً.

   الحماية الحقيقية ليست هنا بل في سياسات RLS داخل قاعدة البيانات
   (راجع supabase/schema.sql). ما في هذا الملف مجرد استعلامات —
   ولو تلاعب أحد بها من المتصفح فلن يحصل على صف واحد لا يملكه.
   ============================================================= */

const SupaDB = (() => {

  let sb = null;        // عميل Supabase
  let session = null;   // الملف الشخصي للمستخدم الحالي

  const fail = (e, fallback) => {
    const msg = (e && (e.message || e.error_description)) || fallback || "تعذّر تنفيذ العملية.";
    throw new Error(translate(msg));
  };

  /* ترجمة رسائل Supabase الشائعة */
  function translate(m) {
    const map = {
      "Invalid login credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "Email not confirmed": "لم يتم تأكيد البريد الإلكتروني بعد.",
      "Failed to fetch": "تعذّر الاتصال بقاعدة البيانات — تحقّق من الإنترنت ومن الرابط في config.js.",
      "User already registered": "هذا البريد مسجَّل مسبقاً.",
    };
    return map[m] || m;
  }

  const api = {

    mode: "supabase",

    async init() {
      if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
        throw new Error("لم تُحمَّل مكتبة Supabase — تحقّق من الاتصال بالإنترنت أو استخدم النسخة المحلية.");
      }
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });

      const { data } = await sb.auth.getSession();
      if (data && data.session) {
        try { await loadProfile(data.session.user.id); }
        catch (e) { session = null; }
      }
      await refreshHolidays();
      return true;
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: String(email).trim(), password,
      });
      if (error) fail(error);
      await loadProfile(data.user.id);
      await refreshHolidays();
      return session;
    },

    async signOut() { await sb.auth.signOut(); session = null; },

    me() { return session; },

    async listDepartments() {
      const { data, error } = await sb.from("departments").select("*").order("sort_order");
      if (error) fail(error); return data;
    },

    async listServices() {
      const { data, error } = await sb.from("services").select("*").eq("active", true).order("name");
      if (error) fail(error); return data;
    },

    async saveService(svc) {
      const row = {
        department_id: svc.department_id, name: svc.name, sla_days: svc.sla_days,
        audience: svc.audience, channel: svc.channel, reqs: svc.reqs,
        flow: svc.flow, note: svc.note, active: svc.active !== false,
      };
      const q = svc.id
        ? sb.from("services").update(row).eq("id", svc.id)
        : sb.from("services").insert(row);
      const { error } = await q;
      if (error) fail(error, "تعذّر حفظ الخدمة — هذا الإجراء للمالك فقط.");
      return true;
    },

    async deleteService(id) {
      const { error } = await sb.from("services").update({ active: false }).eq("id", id);
      if (error) fail(error); return true;
    },

    async listProfiles() {
      const { data, error } = await sb.from("profiles").select("*").order("full_name");
      if (error) fail(error); return data;
    },

    async saveProfile(p) {
      if (!p.id) {
        throw new Error(
          "إنشاء حساب جديد يتم بتسجيل الموظف لنفسه من شاشة الدخول (زر «حساب جديد»)، " +
          "ثم تفعّله أنت من هنا وتسند له الإدارة والدور. " +
          "السبب: إنشاء الحسابات مباشرة يتطلب مفتاحاً سرّياً لا يجوز وضعه في المتصفح."
        );
      }
      const { error } = await sb.from("profiles").update({
        full_name: p.full_name, role: p.role,
        department_id: p.department_id, job_title: p.job_title, active: p.active,
      }).eq("id", p.id);
      if (error) fail(error, "تعذّر حفظ المستخدم — إدارة المستخدمين للمالك فقط.");
      return true;
    },

    /* تسجيل ذاتي — يُنشئ الحساب معطَّلاً بانتظار تفعيل المالك */
    async signUp(email, password, fullName) {
      const { error } = await sb.auth.signUp({
        email: String(email).trim(), password,
        options: { data: { full_name: fullName } },
      });
      if (error) fail(error);
      return true;
    },

    /* لا يوجد فلترة يدوية هنا — RLS هي التي تقرّر ما يُرجَع */
    async listTasks() {
      const { data, error } = await sb.from("tasks").select("*").order("created_at", { ascending: false });
      if (error) fail(error); return data;
    },

    async getTask(id) {
      const { data, error } = await sb.from("tasks").select("*").eq("id", id).maybeSingle();
      if (error) fail(error); return data;
    },

    async createTask(payload) {
      const services = await api.listServices();
      const svc = services.filter(s => s.id === payload.service_id)[0];
      if (!svc) throw new Error("الخدمة غير موجودة.");

      const { data, error } = await sb.from("tasks").insert({
        service_id: svc.id,
        title: payload.title || svc.name,
        description: payload.description || "",
        priority: payload.priority === "urgent" ? "urgent" : "normal",
        requester_id: session.id,
        requester_dept: session.department_id,
        department_id: svc.department_id,
        status: "submitted",
        sla_days: SLA.effectiveDays(svc.sla_days, payload.priority),
      }).select().single();
      if (error) fail(error);

      if (payload.files && payload.files.length) await api.addFiles(data.id, payload.files);
      return data;
    },

    /* الانتقالات تمر عبر دالة في القاعدة تتحقق من الصلاحية وتكتب السجل */
    async act(taskId, actionId, extra) {
      extra = extra || {};
      const { data, error } = await sb.rpc("task_action", {
        p_task: taskId,
        p_action: actionId,
        p_note: extra.note || null,
        p_reason: extra.reason || null,
        p_assignee: extra.assignee || null,
        p_satisfaction: extra.satisfaction ? Number(extra.satisfaction) : null,
      });
      if (error) fail(error);
      if (extra.files && extra.files.length) await api.addFiles(taskId, extra.files);
      return data;
    },

    async listEvents(taskId) {
      const { data, error } = await sb.from("task_events").select("*")
        .eq("task_id", taskId).order("created_at");
      if (error) fail(error); return data;
    },

    async listFiles(taskId) {
      const { data, error } = await sb.from("task_files").select("*")
        .eq("task_id", taskId).order("created_at");
      if (error) fail(error);
      return Promise.all((data || []).map(async f => {
        const { data: signed } = await sb.storage.from("task-files")
          .createSignedUrl(f.storage_path, 3600);
        return Object.assign({}, f, { url: signed ? signed.signedUrl : null });
      }));
    },

    async addFiles(taskId, files) {
      for (const f of (files || [])) {
        const path = taskId + "/" + Date.now() + "-" + f.name.replace(/[^\w.؀-ۿ-]/g, "_");
        const blob = f.blob || dataUrlToBlob(f.data);
        const { error: upErr } = await sb.storage.from("task-files").upload(path, blob, { upsert: false });
        if (upErr) fail(upErr, "تعذّر رفع المرفق.");
        const { error } = await sb.from("task_files").insert({
          task_id: taskId, file_name: f.name, storage_path: path, uploaded_by: session.id,
        });
        if (error) fail(error);
      }
      return true;
    },

    async listHolidays() {
      const { data, error } = await sb.from("holidays").select("*").order("date");
      if (error) fail(error); return data;
    },

    async saveHoliday(h) {
      const { error } = await sb.from("holidays").upsert({ date: h.date, name: h.name });
      if (error) fail(error, "تعديل العطل الرسمية للمالك فقط.");
      await refreshHolidays(); return true;
    },

    async deleteHoliday(date) {
      const { error } = await sb.from("holidays").delete().eq("date", date);
      if (error) fail(error);
      await refreshHolidays(); return true;
    },

    async exportAll() {
      const [tasks, events, profiles, services, holidays] = await Promise.all([
        api.listTasks(), sb.from("task_events").select("*"), api.listProfiles(),
        api.listServices(), api.listHolidays(),
      ]);
      return JSON.stringify({
        exported_at: new Date().toISOString(),
        tasks, events: events.data, profiles, services, holidays,
      }, null, 2);
    },

    async importAll() {
      throw new Error(
        "الاسترجاع إلى قاعدة البيانات المشتركة لا يتم من المتصفح حفاظاً على سلامة البيانات. " +
        "استخدم لوحة Supabase ← SQL Editor لاستيراد النسخة."
      );
    },
  };

  async function loadProfile(userId) {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) fail(error);
    if (!data) {
      await sb.auth.signOut();
      throw new Error("لا يوجد ملف شخصي مرتبط بهذا الحساب — راجع مالك النظام.");
    }
    if (!data.active) {
      await sb.auth.signOut();
      throw new Error("هذا الحساب لم يُفعَّل بعد — راجع مالك النظام لتفعيله وإسناد إدارتك.");
    }
    session = data;
    return data;
  }

  async function refreshHolidays() {
    try {
      const { data } = await sb.from("holidays").select("date");
      SLA.setHolidays(data || []);
    } catch (e) { SLA.setHolidays([]); }
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = String(dataUrl).split(",");
    const mime = (head.match(/:(.*?);/) || [, "application/octet-stream"])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  return api;
})();

/* ---------- اختيار الطبقة المناسبة حسب config.js ---------- */
const DB = (CONFIG.MODE === "supabase") ? SupaDB : DemoDB;
