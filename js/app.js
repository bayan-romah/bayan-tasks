/* =============================================================
   نواة التطبيق — الحالة، التنقّل، شاشة الدخول
   ============================================================= */

const App = (() => {

  const $ = UI.$;

  const state = {
    me: null,
    departments: [], services: [], profiles: [], tasks: [], holidays: [],
    now: new Date(),
    route: "dashboard",
  };

  /* ---------- بحث سريع ---------- */
  const dept = id => state.departments.filter(d => d.id === id)[0] || { name: "—", icon: "▪️", id: null };
  const svc = id => state.services.filter(s => s.id === id)[0] || null;
  const user = id => state.profiles.filter(p => p.id === id)[0] || null;
  const userName = id => { const u = user(id); return u ? u.full_name : "—"; };
  const deptName = id => { const d = dept(id); return (d.icon || "") + " " + d.name; };

  const ROLE_LABEL = { owner: "مالك النظام", manager: "مدير إدارة", employee: "موظف" };

  /* المهام الظاهرة للمستخدم — الفلترة الحقيقية تقع في قاعدة البيانات،
     وهذه نسخة موازية لضبط ما تعرضه كل شاشة */
  const myTasks = () => state.tasks.filter(t => t.assignee_id === state.me.id);
  const myRequests = () => state.tasks.filter(t => t.requester_id === state.me.id);
  const deptTasks = () => state.me.role === "owner"
    ? state.tasks
    : state.tasks.filter(t => t.department_id === state.me.department_id);

  /* نطاق اللوحة حسب الدور */
  function scopeTasks() {
    if (state.me.role === "owner") return state.tasks;
    if (state.me.role === "manager") return deptTasks();
    return state.tasks.filter(t => t.assignee_id === state.me.id || t.requester_id === state.me.id);
  }

  /* ---------- تحميل البيانات ---------- */
  async function loadAll() {
    state.now = new Date();
    const [departments, services, profiles, tasks, holidays] = await Promise.all([
      DB.listDepartments(), DB.listServices(), DB.listProfiles(), DB.listTasks(), DB.listHolidays(),
    ]);
    state.departments = departments;
    state.services = services;
    state.profiles = profiles;
    state.tasks = tasks;
    state.holidays = holidays;
    SLA.setHolidays(holidays);
  }

  async function refresh() {
    await loadAll();
    render();
  }

  /* ---------- التنقّل ---------- */
  function tabs() {
    const r = state.me.role;
    const late = scopeTasks().filter(t => SLA.isOpen(t) && SLA.isLate(t, state.now)).length;
    const inbox = r === "employee"
      ? myTasks().filter(t => SLA.isOpen(t)).length
      : deptTasks().filter(t => ["submitted", "returned", "pending_approval"].indexOf(t.status) !== -1).length;

    const list = [
      { id: "dashboard", ic: "◫", label: "لوحة المتابعة" },
      { id: "tasks", ic: "☰", label: r === "employee" ? "مهامي وطلباتي" : "المهام", n: inbox },
      { id: "catalog", ic: "◎", label: "دليل الخدمات" },
      { id: "reports", ic: "◱", label: "تقارير الأداء" },
      { id: "rules", ic: "§", label: "قواعد الاتفاقية" },
    ];
    if (r === "owner") list.push({ id: "admin", ic: "⚙", label: "الإعدادات والمستخدمون" });
    return list.map(t => Object.assign(t, { late }));
  }

  /* ---------- الوضع الليلي ---------- */
  const THEME_KEY = "bayan_theme";

  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* وضع التصفح الخاص */ }
    const b = $("#theme");
    if (b) {
      b.textContent = t === "dark" ? "☀" : "☾";
      b.title = t === "dark" ? "التحويل للوضع النهاري" : "التحويل للوضع الليلي";
    }
  }

  function go(route) {
    state.route = route;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- الرسم ---------- */
  function render() {
    if (!state.me) { renderLogin(); return; }

    $("#login").hidden = true;
    $("#app").hidden = false;

    const m = state.me;
    const initials = m.full_name.replace(/^أ\.\s*/, "").trim().charAt(0) || "؟";
    $("#whoami").innerHTML = `
      <span class="avatar">${UI.esc(initials)}</span>
      <span class="meta">
        <b>${UI.esc(m.full_name)}</b>
        <span>${ROLE_LABEL[m.role]}${m.department_id ? " · " + UI.esc(dept(m.department_id).name) : ""}</span>
      </span>`;

    $("#nav").innerHTML = tabs().map(t => `
      <button data-r="${t.id}" class="${state.route === t.id ? "on" : ""}"
              ${state.route === t.id ? 'aria-current="page"' : ""}>
        <span class="ic" aria-hidden="true">${t.ic}</span>
        <span>${t.label}</span>
        ${t.n ? `<span class="badge-n" title="بانتظار إجراء">${UI.AR(t.n)}</span>` : ""}
      </button>`).join("");

    const body = $("#view");
    switch (state.route) {
      case "dashboard": Dashboard.render(body); break;
      case "tasks": Tasks.render(body); break;
      case "catalog": Catalog.render(body); break;
      case "reports": Reports.render(body); break;
      case "rules": renderRules(body); break;
      case "admin": Admin.render(body); break;
      default: Dashboard.render(body);
    }
  }

  /* ---------- قواعد الاتفاقية ---------- */
  function renderRules(el) {
    el.innerHTML = `
      <div class="page-head"><h2>قواعد اتفاقية مستوى الخدمة</h2>
        <div class="sp"><button class="btn ghost" onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
      </div>

      <div class="panel">
        <p class="small"><b style="color:var(--ink)">أيام العمل:</b> ${QAWAID.workDays}
           &nbsp;·&nbsp; <b style="color:var(--ink)">ساعات العمل:</b> ${QAWAID.workHours}
           &nbsp;·&nbsp; <b style="color:var(--ink)">المدة الافتراضية:</b> ${SLA.dayWord(CONFIG.DEFAULT_SLA_DAYS)}</p>
        <ul style="margin-top:10px">${QAWAID.rules.map(r => `<li>${UI.esc(r)}</li>`).join("")}</ul>
      </div>

      <h3 class="section-title">المساران: الطلب والتنفيذ</h3>
      <div class="panel">
        ${UI.track(WF.TRACK_REQUEST.steps.map(s => Object.assign({ cls: "done" }, s)),
                   "request", WF.TRACK_REQUEST.title, WF.TRACK_REQUEST.hint)}
        <div style="height:18px"></div>
        ${UI.track(WF.TRACK_EXEC.steps.map(s => Object.assign({ cls: "done" }, s)),
                   "exec", WF.TRACK_EXEC.title, WF.TRACK_EXEC.hint)}
        <div class="notice info" style="margin-top:16px">
          الفرق بين المسارين هو جوهر الاتفاقية: <b>المدة لا تبدأ من لحظة إرسال الطلب</b>،
          بل من لحظة قبوله بعد التأكد من اكتمال متطلباته. الطلب الناقص يُعاد ولا يُحتسب على الإدارة المنفِّذة.
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="panel">
          <h3>آلية التصعيد عند التأخر</h3>
          <ul>${QAWAID.escalation.map(r => `<li>${UI.esc(r)}</li>`).join("")}</ul>
        </div>
        <div class="panel">
          <h3>عتبات ألوان المؤشر</h3>
          <div class="small" style="display:flex;flex-direction:column;gap:9px;margin-top:6px">
            <div><span class="tag ok">أخضر — ملتزم</span> نسبة الالتزام 90% فأعلى</div>
            <div><span class="tag warn">أصفر — تحت المتابعة</span> النسبة من 75% إلى أقل من 90%</div>
            <div><span class="tag danger">أحمر — متعثر</span> النسبة أقل من 75%</div>
          </div>
          <div class="notice warn" style="margin-top:14px">
            <b>نسبة الالتزام</b> = المنجز في الموعد ÷ (المنجز + المتأخر).<br>
            <b>معدل الإنجاز</b> = المنجز ÷ إجمالي المهام الفاعلة. المؤشران منفصلان ولا يُخلطان.
          </div>
        </div>
      </div>

      <h3 class="section-title">مؤشرات قياس الالتزام</h3>
      <div class="panel tbl-wrap">
        <table>
          <thead><tr><th>المؤشر</th><th>المستهدف</th><th>ملاحظة</th></tr></thead>
          <tbody>${QAWAID.kpis.map(k => `<tr>
            <td>${UI.esc(k.name)}</td><td>${UI.esc(k.target)}</td>
            <td class="muted small">${UI.esc(k.note || "")}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  /* ---------- شاشة الدخول ---------- */
  function renderLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;

    const demo = DB.mode === "demo";
    $("#login").innerHTML = `
      <div class="login-card">
        <div class="logo"><img src="${CONFIG.LOGO_PATH}" alt=""
             onerror="this.replaceWith(document.createTextNode('📗'))"></div>
        <h1>نظام إدارة المهام</h1>
        <p class="sub">${UI.esc(CONFIG.ORG_NAME)}</p>

        ${demo ? `<div class="notice warn">
          <b>الوضع التجريبي.</b> البيانات محفوظة في متصفح هذا الجهاز فقط ولا يراها بقية الموظفين.
          لتشغيل النظام على قاعدة بيانات مشتركة، عبّئ المفتاحين في <code>js/config.js</code>
          وفق «دليل_التشغيل.md».</div>` : ""}

        <form id="login-form">
          <div class="field">
            <label for="li-email">البريد الإلكتروني</label>
            <input id="li-email" type="email" autocomplete="username" required
                   placeholder="name@bayan.sa">
          </div>
          <div class="field">
            <label for="li-pass">كلمة المرور</label>
            <input id="li-pass" type="password" autocomplete="current-password" required>
          </div>
          <div id="li-err" class="notice danger" hidden></div>
          <button class="btn block" type="submit" id="li-go">دخول</button>
          ${!demo ? `<button class="btn ghost block" type="button" id="li-signup"
                       style="margin-top:9px">حساب جديد</button>` : ""}
        </form>

        ${demo ? `
        <details class="demo-users" open>
          <summary>الحسابات التجريبية — اضغط أي حساب للدخول به</summary>
          <p class="small muted" style="margin:8px 0 0">كلمة المرور الموحّدة: <b>${DEMO_PASSWORD}</b></p>
          <div class="du-list">
            ${USERS_SEED.map(u => `
              <button type="button" class="du" data-e="${UI.esc(u.email)}">
                <span><b>${UI.esc(u.name)}</b><small>${UI.esc(u.title)}</small></span>
                <span class="tag ${u.role === "owner" ? "gold" : u.role === "manager" ? "info" : "grey"}">
                  ${ROLE_LABEL[u.role]}</span>
              </button>`).join("")}
          </div>
        </details>` : ""}
      </div>`;

    const showErr = m => { const e = $("#li-err"); e.textContent = m; e.hidden = false; };

    $("#login-form").onsubmit = async e => {
      e.preventDefault();
      const btn = $("#li-go"); btn.disabled = true; btn.textContent = "جارٍ الدخول…";
      $("#li-err").hidden = true;
      try {
        state.me = await DB.signIn($("#li-email").value, $("#li-pass").value);
        await loadAll();
        state.route = "dashboard";
        render();
      } catch (ex) {
        showErr(ex.message);
        btn.disabled = false; btn.textContent = "دخول";
      }
    };

    UI.$$(".du").forEach(b => b.onclick = () => {
      $("#li-email").value = b.dataset.e;
      $("#li-pass").value = DEMO_PASSWORD;
      $("#login-form").requestSubmit();
    });

    const su = $("#li-signup");
    if (su) su.onclick = () => UI.modal({
      title: "إنشاء حساب جديد", size: "narrow",
      body: `<div class="notice info">بعد التسجيل يبقى الحساب <b>معطَّلاً</b> حتى يفعّله مالك
               النظام ويسند لك الإدارة والدور.</div>
             <div class="field req"><label>الاسم الكامل</label><input id="su-name" type="text"></div>
             <div class="field req"><label>البريد الإلكتروني</label><input id="su-email" type="email"></div>
             <div class="field req"><label>كلمة المرور</label><input id="su-pass" type="password">
               <div class="help">8 أحرف على الأقل.</div></div>`,
      foot: `<button class="btn" id="su-go">تسجيل</button>
             <button class="btn ghost" onclick="UI.close()">إلغاء</button>`,
      onOpen(ov) {
        UI.$("#su-go", ov).onclick = async () => {
          try {
            await DB.signUp(UI.$("#su-email", ov).value, UI.$("#su-pass", ov).value,
              UI.$("#su-name", ov).value);
            UI.close();
            UI.ok("تم التسجيل. راجع بريدك للتأكيد، ثم اطلب من المالك تفعيل حسابك.");
          } catch (ex) { UI.err(ex.message); }
        };
      },
    });
  }

  /* ---------- الإقلاع ---------- */
  async function boot() {
    try {
      await DB.init();
    } catch (ex) {
      document.body.innerHTML = `<div class="wrap"><div class="notice danger">
        <b>تعذّر تشغيل النظام.</b><br>${UI.esc(ex.message)}</div></div>`;
      return;
    }

    applyTheme(currentTheme());
    $("#theme").onclick = () => applyTheme(currentTheme() === "dark" ? "light" : "dark");

    $("#mode-tag").textContent = DB.mode === "demo" ? "وضع تجريبي" : "قاعدة بيانات مشتركة";
    $("#mode-tag").className = "tag " + (DB.mode === "demo" ? "warn" : "ok");

    const me = DB.me();
    if (me) { state.me = me; await loadAll(); }
    render();

    $("#nav").addEventListener("click", e => {
      const b = e.target.closest("button[data-r]");
      if (b) go(b.dataset.r);
    });

    $("#logout").onclick = () => UI.confirmBox("تسجيل الخروج", "هل تريد الخروج من النظام؟",
      async () => { await DB.signOut(); state.me = null; render(); }, "خروج");

    $("#refresh").onclick = async () => {
      $("#refresh").disabled = true;
      try { await refresh(); UI.ok("تم تحديث البيانات."); }
      catch (ex) { UI.err(ex.message); }
      $("#refresh").disabled = false;
    };
  }

  return {
    state, boot, render, refresh, go, loadAll,
    dept, svc, user, userName, deptName, ROLE_LABEL,
    myTasks, myRequests, deptTasks, scopeTasks,
  };
})();

document.addEventListener("DOMContentLoaded", App.boot);
