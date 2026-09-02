/* =============================================================
   المهام — القائمة، رفع الطلب، تفاصيل المهمة والإجراءات
   ============================================================= */

const Tasks = (() => {

  const esc = UI.esc, AR = UI.AR;

  let F = { q: "", dept: "", status: "", assignee: "", scope: "auto", late: false };

  const preset = o => { F = Object.assign({ q: "", dept: "", status: "", assignee: "", scope: "auto", late: false }, o); };

  /* ---------- تصفية ---------- */
  function filtered() {
    const me = App.state.me, now = App.state.now;
    let list = App.state.tasks.slice();

    if (F.scope === "mine") list = list.filter(t => t.assignee_id === me.id);
    else if (F.scope === "requests") list = list.filter(t => t.requester_id === me.id);
    else if (F.scope === "dept") list = list.filter(t => t.department_id === me.department_id);

    if (F.dept) list = list.filter(t => t.department_id === F.dept);
    if (F.assignee) list = list.filter(t => t.assignee_id === F.assignee);
    if (F.late) list = list.filter(t => SLA.isLate(t, now) && SLA.isOpen(t));

    if (F.status === "open") list = list.filter(SLA.isOpen);
    else if (F.status === "done") list = list.filter(SLA.isDone);
    else if (F.status === "unstarted") list = list.filter(t => SLA.notStarted(t) && SLA.isOpen(t));
    else if (F.status) list = list.filter(t => t.status === F.status);

    if (F.q) {
      const words = SLA.norm(F.q).split(" ");
      list = list.filter(t => {
        const hay = SLA.norm([t.ref_no, t.title, t.description,
          App.deptName(t.department_id), App.userName(t.assignee_id),
          App.userName(t.requester_id)].join(" "));
        return words.every(w => hay.indexOf(w) !== -1);
      });
    }

    return list.sort((a, b) => {
      const la = SLA.isLate(a, now) && SLA.isOpen(a), lb = SLA.isLate(b, now) && SLA.isOpen(b);
      if (la !== lb) return la ? -1 : 1;
      const oa = SLA.isOpen(a), ob = SLA.isOpen(b);
      if (oa !== ob) return oa ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  /* ---------- القائمة ---------- */
  function render(el) {
    const me = App.state.me, now = App.state.now;
    const scopes = me.role === "employee"
      ? [["auto", "الكل"], ["mine", "مهامي المسندة"], ["requests", "طلباتي المرفوعة"]]
      : me.role === "manager"
        ? [["auto", "الكل"], ["dept", "مهام إدارتي"], ["mine", "مهامي المسندة"], ["requests", "طلباتي"]]
        : [["auto", "كل الإدارات"], ["requests", "طلباتي"]];

    el.innerHTML = `
      <div class="page-head">
        <h2>المهام</h2>
        <div class="sp">
          <button class="btn" id="t-new">➕ رفع طلب جديد</button>
          <button class="btn ghost" id="t-csv">⬇️ تصدير CSV</button>
        </div>
      </div>

      <div class="toolbar">
        <div class="row">
          <div class="search"><input id="t-q" type="search" placeholder="ابحث برقم المتابعة أو اسم المهمة أو الموظف…" value="${esc(F.q)}"></div>
          <select id="t-scope">${scopes.map(([v, l]) =>
            `<option value="${v}" ${F.scope === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <select id="t-status">
            <option value="">كل الحالات</option>
            <option value="open" ${F.status === "open" ? "selected" : ""}>قيد العمل</option>
            <option value="unstarted" ${F.status === "unstarted" ? "selected" : ""}>لم تبدأ مدتها</option>
            <option value="done" ${F.status === "done" ? "selected" : ""}>منجزة ومغلقة</option>
            ${Object.keys(WF.STATUS).map(k =>
              `<option value="${k}" ${F.status === k ? "selected" : ""}>— ${WF.STATUS[k].label}</option>`).join("")}
          </select>
          ${me.role !== "employee" ? `<select id="t-assignee">
            <option value="">كل المنفّذين</option>
            ${App.state.profiles.filter(p => me.role === "owner" || p.department_id === me.department_id)
              .map(p => `<option value="${p.id}" ${F.assignee === p.id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
          </select>` : ""}
          <label class="chip ${F.late ? "on" : ""}" id="t-late" style="cursor:pointer">🔴 المتأخرة فقط</label>
        </div>
        ${me.role === "owner" ? `<div class="chips" id="t-depts">
          <button class="chip ${F.dept === "" ? "on" : ""}" data-d="">كل الإدارات</button>
          ${App.state.departments.map(d =>
            `<button class="chip ${F.dept === d.id ? "on" : ""}" data-d="${d.id}">${d.icon} ${esc(d.name)}</button>`).join("")}
        </div>` : ""}
      </div>

      <div id="t-body"></div>`;

    const body = UI.$("#t-body", el);

    function draw() {
      const list = filtered();
      const s = SLA.summarize(list, now);
      body.innerHTML = `
        <div class="count">
          عدد المهام المعروضة: <b>${AR(list.length)}</b>
          ${list.length ? ` · منجزة ${AR(s.done)} · متأخرة ${AR(s.lateOpen)} · نسبة الالتزام ${SLA.pctText(s.commitment)}` : ""}
        </div>
        ${list.length ? Dashboard.taskCards(list, "") : UI.empty("🔍", "لا توجد مهمة مطابقة.", "جرّب توسيع الفلاتر.")}`;
      UI.$$("[data-task]", body).forEach(n => n.onclick = () => open(n.dataset.task));
    }

    UI.$("#t-q", el).oninput = e => { F.q = e.target.value.trim(); draw(); };
    UI.$("#t-scope", el).onchange = e => { F.scope = e.target.value; draw(); };
    UI.$("#t-status", el).onchange = e => { F.status = e.target.value; draw(); };
    const as = UI.$("#t-assignee", el); if (as) as.onchange = e => { F.assignee = e.target.value; draw(); };
    UI.$("#t-late", el).onclick = e => { F.late = !F.late; e.target.classList.toggle("on", F.late); draw(); };
    const dc = UI.$("#t-depts", el);
    if (dc) dc.onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      F.dept = b.dataset.d;
      UI.$$(".chip", dc).forEach(c => c.classList.toggle("on", c === b));
      draw();
    };
    UI.$("#t-new", el).onclick = newTask;
    UI.$("#t-csv", el).onclick = () => exportCSV(filtered());

    draw();
  }

  /* ---------- تصدير ---------- */
  function exportCSV(list) {
    const now = App.state.now;
    const rows = [[
      "رقم المتابعة", "المهمة", "الإدارة المنفذة", "مقدم الطلب", "المنفذ", "الأولوية",
      "الحالة", "مدة الخدمة (أيام عمل)", "تاريخ الرفع", "تاريخ القبول", "تاريخ الاستحقاق",
      "تاريخ الإنجاز", "ملتزم؟", "أيام التأخر", "التقييم",
    ]];
    list.forEach(t => rows.push([
      t.ref_no, t.title, App.dept(t.department_id).name,
      App.userName(t.requester_id), t.assignee_id ? App.userName(t.assignee_id) : "",
      t.priority === "urgent" ? "عاجل" : "عادي",
      (WF.STATUS[t.status] || {}).label || t.status,
      t.sla_days,
      SLA.fmtShort(t.created_at),
      t.accepted_at ? SLA.fmtShort(t.accepted_at) : "",
      t.due_at ? SLA.fmtShort(t.due_at) : "",
      t.completed_at ? SLA.fmtShort(t.completed_at) : "",
      SLA.notStarted(t) || SLA.isDead(t) ? "" : (SLA.isLate(t, now) ? "لا" : "نعم"),
      SLA.isLate(t, now) ? Math.abs(SLA.daysLeft(t, now)) : 0,
      t.satisfaction || "",
    ]));
    UI.download(UI.toCSV(rows), "مهام_بيان_" + SLA.dateKey(now) + ".csv", "text/csv");
    UI.ok("تم تصدير " + AR(list.length) + " مهمة.");
  }

  /* ---------- رفع طلب جديد ---------- */
  function newTask(presetService) {
    const services = App.state.services.filter(s => s.active !== false);

    UI.modal({
      title: "➕ رفع طلب جديد",
      body: `
        <div class="notice info">اختر الإدارة ثم الخدمة. لن يُقبل الطلب قبل اكتمال متطلباته —
          المدة تبدأ من لحظة القبول لا من لحظة الإرسال.</div>

        <div class="form-grid">
          <div class="field req"><label>الإدارة المعنية بالتنفيذ</label>
            <select id="nt-dept"><option value="">— اختر —</option>
              ${App.state.departments.map(d => `<option value="${d.id}">${d.icon} ${esc(d.name)}</option>`).join("")}
            </select></div>
          <div class="field req"><label>الخدمة</label>
            <select id="nt-svc" disabled><option value="">— اختر الإدارة أولاً —</option></select></div>
        </div>

        <div id="nt-info"></div>

        <div class="field"><label>عنوان الطلب</label>
          <input id="nt-title" type="text" placeholder="يُعبَّأ تلقائياً باسم الخدمة، ويمكنك تخصيصه">
        </div>

        <div class="field req"><label>تفاصيل الطلب</label>
          <textarea id="nt-desc" placeholder="اشرح المطلوب بدقة: ما هو، ولمن، ومتى تحتاجه."></textarea>
        </div>

        <div class="form-grid">
          <div class="field"><label>الأولوية</label>
            <select id="nt-pri">
              <option value="normal">عادي — المدة المعتمدة كاملة</option>
              <option value="urgent">عاجل — نصف المدة (يتطلب موافقة مديرك)</option>
            </select></div>
          <div class="field"><label>المرفقات</label>
            <input id="nt-files" type="file" multiple>
            <div class="help">حتى 5 ميجابايت للملف الواحد.</div></div>
        </div>`,
      foot: `<button class="btn" id="nt-go">📤 إرسال الطلب</button>
             <button class="btn ghost" onclick="UI.close()">إلغاء</button>`,
      onOpen(ov) {
        const dSel = UI.$("#nt-dept", ov), sSel = UI.$("#nt-svc", ov), info = UI.$("#nt-info", ov);

        dSel.onchange = () => {
          const list = services.filter(s => s.department_id === dSel.value);
          sSel.disabled = !list.length;
          sSel.innerHTML = `<option value="">— اختر الخدمة —</option>` +
            list.map(s => `<option value="${s.id}">${esc(s.name)} — ${SLA.dayWord(s.sla_days)}</option>`).join("");
          info.innerHTML = ""; sSel.onchange();
        };

        sSel.onchange = () => {
          const s = App.svc(sSel.value);
          if (!s) { info.innerHTML = ""; return; }
          UI.$("#nt-title", ov).value = s.name;
          const pri = UI.$("#nt-pri", ov).value;
          const days = SLA.effectiveDays(s.sla_days, pri);
          info.innerHTML = `
            <div class="panel tight" style="margin-bottom:14px;background:#f9fcfb">
              <div class="row" style="justify-content:space-between">
                <span class="tag ok">⏱️ المدة: ${SLA.dayWord(days)}</span>
                <span class="tag grey">قناة الطلب: ${esc(s.channel)}</span>
              </div>
              <p class="small" style="margin:10px 0 6px"><b style="color:var(--ink)">
                أكّد اكتمال المتطلبات — الطلب الناقص يُعاد ولا تبدأ مدته:</b></p>
              <div class="checks" id="nt-reqs">
                ${s.reqs.map((r, i) => `<label class="check">
                  <input type="checkbox" data-req="${i}"><span>${esc(r)}</span></label>`).join("")}
              </div>
              ${s.note ? `<div class="svcnote">⚠️ ${esc(s.note)}</div>` : ""}
              <p class="small muted" style="margin-top:10px">
                تاريخ الاستحقاق المتوقع لو قُبل الطلب الآن:
                <b>${SLA.fmtDate(SLA.addWorkingDays(new Date(), days))}</b></p>
            </div>`;
          UI.$$("#nt-reqs input", ov).forEach(c =>
            c.onchange = () => c.closest(".check").classList.toggle("done", c.checked));
        };

        UI.$("#nt-pri", ov).onchange = () => sSel.onchange();

        UI.$("#nt-go", ov).onclick = async () => {
          const s = App.svc(sSel.value);
          if (!s) return UI.err("اختر الخدمة المطلوبة.");
          const desc = UI.$("#nt-desc", ov).value.trim();
          if (desc.length < 10) return UI.err("اكتب تفاصيل الطلب (10 أحرف على الأقل).");
          const boxes = UI.$$("#nt-reqs input", ov);
          if (boxes.some(b => !b.checked))
            return UI.err("أكّد اكتمال جميع المتطلبات قبل الإرسال.");

          const btn = UI.$("#nt-go", ov); btn.disabled = true; btn.textContent = "جارٍ الإرسال…";
          try {
            const files = await UI.readFiles(UI.$("#nt-files", ov));
            const t = await DB.createTask({
              service_id: s.id,
              title: UI.$("#nt-title", ov).value.trim() || s.name,
              description: desc,
              priority: UI.$("#nt-pri", ov).value,
              files,
            });
            UI.close();
            await App.refresh();
            UI.ok("تم رفع الطلب برقم " + t.ref_no + " — بانتظار فرز الإدارة المعنية.");
            open(t.id);
          } catch (ex) {
            UI.err(ex.message);
            btn.disabled = false; btn.textContent = "📤 إرسال الطلب";
          }
        };

        if (presetService) {
          const s = App.svc(presetService);
          if (s) { dSel.value = s.department_id; dSel.onchange(); sSel.value = s.id; sSel.onchange(); }
        }
      },
    });
  }

  /* ---------- تفاصيل المهمة ---------- */
  async function open(id) {
    const t = await DB.getTask(id);
    if (!t) return UI.err("المهمة غير موجودة أو لا تملك صلاحية الاطلاع عليها.");
    const [events, files] = await Promise.all([DB.listEvents(id), DB.listFiles(id)]);
    const now = App.state.now;
    const s = App.svc(t.service_id);
    const tr = WF.trackState(t);
    const acts = WF.actionsFor(t, App.state.me);
    const escl = SLA.escalationLevel(t, now);

    const kv = (k, v) => `<tr><th style="width:38%">${esc(k)}</th><td>${v}</td></tr>`;

    UI.modal({
      title: `${esc(t.title)} <span class="small muted" style="font-family:monospace">${esc(t.ref_no)}</span>`,
      size: "wide",
      body: `
        <div class="row" style="margin-bottom:14px">${UI.statusTag(t, now)}</div>

        ${t.return_reason && t.status === "returned" ? `<div class="notice warn">
          <b>مُعاد لاستكمال البيانات:</b> ${esc(t.return_reason)}</div>` : ""}
        ${escl ? `<div class="notice danger">
          <b>${esc(escl.label)}:</b> تجاوزت المهمة مدتها بـ ${AR(escl.over)} يوم عمل —
          التصعيد إلى ${esc(escl.to)}.</div>` : ""}

        <div class="panel tight" style="margin-bottom:14px">
          ${UI.track(tr.request, "request", WF.TRACK_REQUEST.title, WF.TRACK_REQUEST.hint)}
          <div style="height:16px;border-bottom:1px dashed var(--line);margin-bottom:16px"></div>
          ${UI.track(tr.exec, "exec", WF.TRACK_EXEC.title, WF.TRACK_EXEC.hint)}
        </div>

        <div class="grid-2">
          <div class="tbl-wrap"><table><tbody>
            ${kv("الإدارة المنفِّذة", esc(App.deptName(t.department_id)))}
            ${kv("الخدمة", s ? esc(s.name) : "—")}
            ${kv("مقدّم الطلب", esc(App.userName(t.requester_id)) +
              (t.requester_dept ? ` <span class="small muted">— ${esc(App.dept(t.requester_dept).name)}</span>` : ""))}
            ${kv("المنفّذ المكلَّف", t.assignee_id ? esc(App.userName(t.assignee_id))
              : '<span class="tag warn">لم يُسند بعد</span>')}
            ${kv("الأولوية", t.priority === "urgent"
              ? '<span class="tag urgent">عاجل</span>' : "عادي")}
            ${kv("المدة المعتمدة", SLA.dayWord(t.sla_days))}
          </tbody></table></div>

          <div class="tbl-wrap"><table><tbody>
            ${kv("تاريخ رفع الطلب", SLA.fmtDateTime(t.created_at))}
            ${kv("تاريخ القبول <span class='small muted'>(بدء المدة)</span>",
              t.accepted_at ? SLA.fmtDateTime(t.accepted_at)
                : '<span class="tag info">لم تبدأ المدة بعد</span>')}
            ${kv("تاريخ الاستحقاق", t.due_at
              ? `<b>${SLA.fmtDate(t.due_at)}</b>` : "—")}
            ${kv("تاريخ الإنجاز", t.completed_at ? SLA.fmtDateTime(t.completed_at) : "—")}
            ${kv("الالتزام", SLA.notStarted(t) || SLA.isDead(t) ? "—"
              : SLA.isLate(t, now)
                ? `<span class="tag danger">تجاوزت المدة بـ ${AR(Math.abs(SLA.daysLeft(t, now)))} يوم عمل</span>`
                : `<span class="tag ok">${SLA.isDone(t) ? "أُنجزت في الموعد" : SLA.relDays(SLA.daysLeft(t, now))}</span>`)}
            ${kv("تقييم المستفيد", t.satisfaction
              ? `<span class="tag gold">${"★".repeat(t.satisfaction)}${"☆".repeat(5 - t.satisfaction)} ${AR(t.satisfaction)}/5</span>`
              : "—")}
          </tbody></table></div>
        </div>

        <h4 style="margin:18px 0 6px;color:var(--ink)">تفاصيل الطلب</h4>
        <div class="panel tight small" style="white-space:pre-wrap">${esc(t.description || "—")}</div>

        ${s ? `<h4 style="margin:18px 0 6px;color:var(--ink)">متطلبات الخدمة</h4>
          <ul class="small" style="padding-right:20px">${s.reqs.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
          <h4 style="margin:14px 0 6px;color:var(--ink)">مسار التنفيذ المعتمد لهذه الخدمة</h4>
          <ol class="small" style="padding-right:20px">${s.flow.map(f => `<li>${esc(f)}</li>`).join("")}</ol>` : ""}

        <h4 style="margin:18px 0 6px;color:var(--ink)">المرفقات (${AR(files.length)})</h4>
        ${files.length ? `<div class="files">${files.map(f => `
          <div class="file"><span>📄</span><span class="fname">${esc(f.file_name)}</span>
            <a href="${f.url || f.data || "#"}" download="${esc(f.file_name)}" target="_blank">تنزيل</a>
          </div>`).join("")}</div>`
          : `<p class="small muted">لا توجد مرفقات.</p>`}
        <button class="btn ghost sm" id="td-addfile" style="margin-top:9px">➕ إضافة مرفق</button>
        <input type="file" id="td-file-input" multiple hidden>

        <h4 style="margin:20px 0 6px;color:var(--ink)">سجل الإجراءات</h4>
        <ul class="timeline">${events.map(e => `
          <li>
            <b>${esc((WF.STATUS[e.to_status] || {}).label || e.to_status)}</b>
            <span class="small muted">— ${esc(App.userName(e.actor_id))}</span>
            <div class="tl-when">${SLA.fmtDateTime(e.created_at)}</div>
            ${e.note ? `<div class="tl-note">${esc(e.note)}</div>` : ""}
          </li>`).join("")}</ul>`,

      foot: acts.length
        ? acts.map(a => `<button class="btn ${a.style || ""}" data-act="${a.id}" title="${esc(a.hint || "")}">
            ${a.icon} ${esc(a.label)}</button>`).join("") +
          `<button class="btn ghost" onclick="UI.close()">إغلاق</button>`
        : `<span class="small muted" style="align-self:center">لا توجد إجراءات متاحة لك على هذه المهمة في حالتها الحالية.</span>
           <button class="btn ghost" onclick="UI.close()" style="margin-inline-start:auto">إغلاق</button>`,

      onOpen(ov) {
        UI.$$("[data-act]", ov).forEach(b =>
          b.onclick = () => runAction(t, WF.actionById(b.dataset.act)));

        const fi = UI.$("#td-file-input", ov);
        UI.$("#td-addfile", ov).onclick = () => fi.click();
        fi.onchange = async () => {
          try {
            const files2 = await UI.readFiles(fi);
            if (!files2.length) return;
            await DB.addFiles(t.id, files2);
            UI.ok("تمت إضافة " + AR(files2.length) + " مرفق.");
            open(t.id);
          } catch (ex) { UI.err(ex.message); }
        };
      },
    });
  }

  /* ---------- تنفيذ إجراء ---------- */
  function runAction(t, action) {
    const needs = action.needs || [];
    const me = App.state.me;

    /* إجراء بلا مدخلات — تأكيد سريع */
    if (!needs.length) {
      UI.confirmBox(action.icon + " " + action.label, action.hint || "هل تريد المتابعة؟",
        () => submit(t, action, {}), action.label, action.style === "danger");
      return;
    }

    const staff = App.state.profiles.filter(p =>
      p.active && p.department_id === t.department_id && p.role !== "owner");

    UI.modal({
      title: action.icon + " " + action.label,
      size: "narrow",
      body: `
        ${action.hint ? `<div class="notice info">${esc(action.hint)}</div>` : ""}

        ${needs.indexOf("assignee") !== -1 ? `
          <div class="field req"><label>المنفّذ المكلَّف</label>
            <select id="ac-assignee">
              <option value="">— اختر —</option>
              ${staff.map(p => {
                const load = App.state.tasks.filter(x => x.assignee_id === p.id && SLA.isOpen(x)).length;
                return `<option value="${p.id}" ${t.assignee_id === p.id ? "selected" : ""}>
                  ${esc(p.full_name)} — ${esc(p.job_title || "")} (${load} مهمة جارية)</option>`;
              }).join("")}
            </select>
            ${staff.length ? "" : `<div class="help">لا يوجد موظفون في هذه الإدارة — أضِفهم من لوحة المستخدمين.</div>`}
          </div>` : ""}

        ${needs.indexOf("satisfaction") !== -1 ? `
          <div class="field req"><label>تقييم الخدمة</label>
            <select id="ac-sat">
              <option value="5">5 — ممتاز</option><option value="4">4 — جيد جداً</option>
              <option value="3">3 — جيد</option><option value="2">2 — ضعيف</option>
              <option value="1">1 — ضعيف جداً</option>
            </select></div>` : ""}

        ${needs.indexOf("reason") !== -1 ? `
          <div class="field req"><label>${esc(action.reasonLabel || "السبب")}</label>
            <textarea id="ac-reason" placeholder="اكتب بوضوح — يُحفظ في سجل المهمة ويراه مقدّم الطلب."></textarea>
          </div>` : ""}

        ${needs.indexOf("note") !== -1 ? `
          <div class="field req"><label>${esc(action.reasonLabel || "ملاحظة")}</label>
            <textarea id="ac-note"></textarea></div>` : ""}

        ${["submit_work", "resubmit"].indexOf(action.id) !== -1 ? `
          <div class="field"><label>إرفاق ملفات</label><input id="ac-files" type="file" multiple></div>` : ""}`,

      foot: `<button class="btn ${action.style || ""}" id="ac-go">${esc(action.label)}</button>
             <button class="btn ghost" onclick="UI.close()">إلغاء</button>`,

      onOpen(ov) {
        UI.$("#ac-go", ov).onclick = async () => {
          const g = sel => { const n = UI.$(sel, ov); return n ? n.value.trim() : ""; };
          const extra = {
            assignee: g("#ac-assignee"),
            satisfaction: g("#ac-sat"),
            reason: g("#ac-reason"),
            note: g("#ac-note"),
          };
          if (needs.indexOf("reason") !== -1 && extra.reason.length < 5)
            return UI.err("اكتب السبب بوضوح (5 أحرف على الأقل).");
          if (needs.indexOf("note") !== -1 && extra.note.length < 5)
            return UI.err("اكتب ملاحظة موجزة (5 أحرف على الأقل).");
          if (needs.indexOf("assignee") !== -1 && !extra.assignee)
            return UI.err("اختر المنفّذ المكلَّف.");

          const fi = UI.$("#ac-files", ov);
          if (fi) { try { extra.files = await UI.readFiles(fi); } catch (ex) { return UI.err(ex.message); } }

          const btn = UI.$("#ac-go", ov); btn.disabled = true; btn.textContent = "جارٍ التنفيذ…";
          await submit(t, action, extra, () => {
            btn.disabled = false; btn.textContent = action.label;
          });
        };
      },
    });
  }

  async function submit(t, action, extra, onFail) {
    try {
      const updated = await DB.act(t.id, action.id, extra);
      UI.close();
      await App.refresh();
      let msg = "تم: " + action.label + ".";
      if (action.id === "accept" && updated && updated.due_at)
        msg = "قُبل الطلب — تاريخ الاستحقاق: " + SLA.fmtDate(updated.due_at) + ".";
      UI.ok(msg);
      open(t.id);
    } catch (ex) {
      UI.err(ex.message);
      if (onFail) onFail();
    }
  }

  return { render, open, newTask, preset, exportCSV };
})();
