/* =============================================================
   لوحة المالك — المستخدمون، الخدمات، العطل الرسمية، النسخ الاحتياطي
   كل ما في هذه الشاشة محجوز للمالك؛ والحجب الحقيقي في قاعدة البيانات.
   ============================================================= */

const Admin = (() => {

  const esc = UI.esc, AR = UI.AR;
  let tab = "users";

  function render(el) {
    if (App.state.me.role !== "owner") {
      el.innerHTML = UI.empty("🔒", "هذه الشاشة لمالك النظام فقط.");
      return;
    }

    el.innerHTML = `
      <div class="page-head"><h2>⚙️ الإعدادات والمستخدمون</h2></div>
      <div class="toolbar"><div class="row" id="ad-tabs">
        ${[["users", "👥 المستخدمون"], ["services", "🧾 الخدمات والمدد"],
           ["holidays", "📅 العطل الرسمية"], ["backup", "💾 النسخ الاحتياطي"]]
          .map(([id, l]) => `<button class="chip ${tab === id ? "on" : ""}" data-t="${id}">${l}</button>`).join("")}
      </div></div>
      <div id="ad-body"></div>`;

    UI.$("#ad-tabs", el).onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      tab = b.dataset.t; render(el);
    };

    const body = UI.$("#ad-body", el);
    if (tab === "users") users(body);
    else if (tab === "services") services(body);
    else if (tab === "holidays") holidays(body);
    else backup(body);
  }

  /* ---------- المستخدمون ---------- */
  function users(el) {
    const now = App.state.now;
    const rows = App.state.profiles.slice().sort((a, b) => {
      const o = { owner: 0, manager: 1, employee: 2 };
      return (o[a.role] - o[b.role]) || String(a.department_id).localeCompare(String(b.department_id));
    });

    el.innerHTML = `
      ${DB.mode === "supabase" ? `<div class="notice info">
        الموظف الجديد يسجّل لنفسه من زر «حساب جديد» في شاشة الدخول، ثم يظهر هنا
        <b>معطَّلاً</b> فتُفعّله وتسند له الإدارة والدور. الحذف النهائي غير متاح من المتصفح —
        <b>التعطيل يمنع الدخول فعلياً</b>.</div>`
        : `<div class="notice warn">أنت في الوضع التجريبي — الحسابات هنا وهمية،
           وكلمة المرور الموحّدة <b>${DEMO_PASSWORD}</b>.</div>`}

      <div class="page-head" style="margin-top:14px">
        <h3 style="color:var(--deep)">المستخدمون (${AR(rows.length)})</h3>
        ${DB.mode === "demo" ? `<div class="sp"><button class="btn" id="u-add">➕ إضافة مستخدم</button></div>` : ""}
      </div>

      <div class="panel tbl-wrap"><table>
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الإدارة</th>
          <th>المسمّى</th><th class="num">مهام جارية</th><th class="num">الحالة</th><th class="num">إجراء</th></tr></thead>
        <tbody>${rows.map(p => {
          const load = App.state.tasks.filter(t => t.assignee_id === p.id && SLA.isOpen(t)).length;
          return `<tr>
            <td>${esc(p.full_name)}</td>
            <td class="small muted">${esc(p.email || "—")}</td>
            <td><span class="tag ${p.role === "owner" ? "gold" : p.role === "manager" ? "info" : "grey"}">
              ${App.ROLE_LABEL[p.role]}</span></td>
            <td class="small">${p.department_id ? esc(App.deptName(p.department_id)) : "—"}</td>
            <td class="small muted">${esc(p.job_title || "—")}</td>
            <td class="num">${AR(load)}</td>
            <td class="num"><span class="tag ${p.active ? "ok" : "danger"}">
              ${p.active ? "مفعَّل" : "معطَّل"}</span></td>
            <td class="num"><button class="btn ghost sm" data-edit="${p.id}">تعديل</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>`;

    UI.$$("[data-edit]", el).forEach(b => b.onclick = () => editUser(App.user(b.dataset.edit)));
    const add = UI.$("#u-add", el);
    if (add) add.onclick = () => editUser(null);
  }

  function editUser(p) {
    const isNew = !p;
    p = p || { full_name: "", email: "", role: "employee", department_id: "", job_title: "", active: true };

    UI.modal({
      title: isNew ? "➕ إضافة مستخدم" : "تعديل: " + esc(p.full_name),
      size: "narrow",
      body: `
        <div class="field req"><label>الاسم الكامل</label>
          <input id="u-name" type="text" value="${esc(p.full_name)}"></div>
        <div class="field ${isNew ? "req" : ""}"><label>البريد الإلكتروني</label>
          <input id="u-email" type="email" value="${esc(p.email || "")}" ${isNew ? "" : "disabled"}>
          ${isNew ? "" : `<div class="help">البريد لا يُعدَّل — هو معرّف الدخول.</div>`}</div>
        <div class="field req"><label>الدور</label>
          <select id="u-role">
            <option value="employee" ${p.role === "employee" ? "selected" : ""}>موظف — يرى مهامه وطلباته فقط</option>
            <option value="manager" ${p.role === "manager" ? "selected" : ""}>مدير إدارة — يرى إدارته ويسند مهامها</option>
            <option value="owner" ${p.role === "owner" ? "selected" : ""}>مالك — صلاحية كاملة على كل الإدارات</option>
          </select></div>
        <div class="field"><label>الإدارة</label>
          <select id="u-dept"><option value="">— بلا إدارة (للمالك) —</option>
            ${App.state.departments.map(d =>
              `<option value="${d.id}" ${p.department_id === d.id ? "selected" : ""}>${d.icon} ${esc(d.name)}</option>`).join("")}
          </select></div>
        <div class="field"><label>المسمّى الوظيفي</label>
          <input id="u-title" type="text" value="${esc(p.job_title || "")}"></div>
        <label class="check"><input type="checkbox" id="u-active" ${p.active ? "checked" : ""}>
          <span>الحساب مفعَّل — إلغاء التفعيل يمنع الدخول ويُبقي كل سجلاته.</span></label>`,
      foot: `<button class="btn" id="u-save">حفظ</button>
             <button class="btn ghost" onclick="UI.close()">إلغاء</button>`,
      onOpen(ov) {
        UI.$("#u-save", ov).onclick = async () => {
          const role = UI.$("#u-role", ov).value;
          const dept = UI.$("#u-dept", ov).value;
          const name = UI.$("#u-name", ov).value.trim();
          if (name.length < 3) return UI.err("اكتب الاسم الكامل.");
          if (role !== "owner" && !dept)
            return UI.err("المدير والموظف يجب إسنادهما لإدارة.");
          try {
            await DB.saveProfile({
              id: p.id, full_name: name,
              email: isNew ? UI.$("#u-email", ov).value.trim() : p.email,
              role, department_id: dept || null,
              job_title: UI.$("#u-title", ov).value.trim(),
              active: UI.$("#u-active", ov).checked,
            });
            UI.close(); await App.refresh(); UI.ok("تم حفظ بيانات المستخدم.");
          } catch (ex) { UI.err(ex.message); }
        };
      },
    });
  }

  /* ---------- الخدمات ---------- */
  function services(el) {
    el.innerHTML = `
      <div class="notice info">تعديل مدة أي خدمة يسري على <b>الطلبات الجديدة فقط</b>؛
        الطلبات القائمة تحتفظ بالمدة التي قُبلت بها حتى لا تتغيّر نتائج القياس بأثر رجعي.</div>

      <div class="page-head" style="margin-top:14px">
        <h3 style="color:var(--deep)">الخدمات (${AR(App.state.services.length)})</h3>
        <div class="sp"><button class="btn" id="s-add">➕ إضافة خدمة</button></div>
      </div>

      ${App.state.departments.map(d => {
        const svcs = App.state.services.filter(s => s.department_id === d.id);
        if (!svcs.length) return "";
        return `<h4 class="section-title" style="font-size:1rem">${d.icon} ${esc(d.name)}</h4>
        <div class="panel tbl-wrap"><table>
          <thead><tr><th>الخدمة</th><th class="num">أيام العمل</th><th>قناة الطلب</th>
            <th class="num">الحالة</th><th class="num">إجراء</th></tr></thead>
          <tbody>${svcs.map(s => `<tr>
            <td>${esc(s.name)}</td>
            <td class="num"><span class="tag ${s.sla_days <= 2 ? "ok" : s.sla_days >= 7 ? "warn" : "grey"}">
              ${AR(s.sla_days)}</span></td>
            <td class="small muted">${esc(s.channel)}</td>
            <td class="num"><span class="tag ${s.active !== false ? "ok" : "grey"}">
              ${s.active !== false ? "فعّالة" : "موقوفة"}</span></td>
            <td class="num"><button class="btn ghost sm" data-svc="${s.id}">تعديل</button></td>
          </tr>`).join("")}</tbody></table></div>`;
      }).join("")}`;

    UI.$$("[data-svc]", el).forEach(b => b.onclick = () => editService(App.svc(b.dataset.svc)));
    UI.$("#s-add", el).onclick = () => editService(null);
  }

  function editService(s) {
    const isNew = !s;
    s = s || { name: "", department_id: "", sla_days: CONFIG.DEFAULT_SLA_DAYS, channel: "",
      audience: [], reqs: [], flow: [], note: "", active: true };

    UI.modal({
      title: isNew ? "➕ إضافة خدمة" : "تعديل: " + esc(s.name),
      body: `
        <div class="form-grid">
          <div class="field req"><label>اسم الخدمة</label>
            <input id="s-name" type="text" value="${esc(s.name)}"></div>
          <div class="field req"><label>الإدارة المنفِّذة</label>
            <select id="s-dept"><option value="">— اختر —</option>
              ${App.state.departments.map(d =>
                `<option value="${d.id}" ${s.department_id === d.id ? "selected" : ""}>${d.icon} ${esc(d.name)}</option>`).join("")}
            </select></div>
          <div class="field req"><label>مدة الإنجاز (أيام عمل)</label>
            <input id="s-days" type="number" min="1" max="60" value="${s.sla_days}">
            <div class="help">الافتراضي ${AR(CONFIG.DEFAULT_SLA_DAYS)} أيام عمل (الأحد – الخميس).</div></div>
          <div class="field req"><label>قناة تقديم الطلب</label>
            <input id="s-ch" type="text" value="${esc(s.channel)}"></div>
        </div>
        <div class="field"><label>الفئات المستفيدة</label>
          <div class="checks" style="flex-direction:row;flex-wrap:wrap">
            ${FIAT.map(f => `<label class="check" style="flex:1 1 200px">
              <input type="checkbox" data-aud value="${esc(f)}" ${(s.audience || []).indexOf(f) !== -1 ? "checked" : ""}>
              <span>${esc(f)}</span></label>`).join("")}
          </div></div>
        <div class="field req"><label>المتطلبات — سطر لكل متطلب</label>
          <textarea id="s-reqs">${esc((s.reqs || []).join("\n"))}</textarea></div>
        <div class="field req"><label>مسار التنفيذ — سطر لكل خطوة بالترتيب</label>
          <textarea id="s-flow">${esc((s.flow || []).join("\n"))}</textarea></div>
        <div class="field"><label>ملاحظة (اختياري)</label>
          <input id="s-note" type="text" value="${esc(s.note || "")}"></div>
        <label class="check"><input type="checkbox" id="s-active" ${s.active !== false ? "checked" : ""}>
          <span>الخدمة فعّالة وتظهر في دليل الخدمات</span></label>`,
      foot: `<button class="btn" id="s-save">حفظ</button>
             <button class="btn ghost" onclick="UI.close()">إلغاء</button>`,
      onOpen(ov) {
        UI.$("#s-save", ov).onclick = async () => {
          const lines = sel => UI.$(sel, ov).value.split("\n").map(x => x.trim()).filter(Boolean);
          const payload = {
            id: s.id,
            name: UI.$("#s-name", ov).value.trim(),
            department_id: UI.$("#s-dept", ov).value,
            sla_days: Math.max(1, parseInt(UI.$("#s-days", ov).value, 10) || CONFIG.DEFAULT_SLA_DAYS),
            channel: UI.$("#s-ch", ov).value.trim(),
            audience: UI.$$("[data-aud]", ov).filter(c => c.checked).map(c => c.value),
            reqs: lines("#s-reqs"), flow: lines("#s-flow"),
            note: UI.$("#s-note", ov).value.trim(),
            active: UI.$("#s-active", ov).checked,
          };
          if (!payload.name || !payload.department_id) return UI.err("اسم الخدمة والإدارة مطلوبان.");
          if (!payload.reqs.length) return UI.err("أضف متطلباً واحداً على الأقل.");
          if (!payload.flow.length) return UI.err("أضف خطوة واحدة على الأقل في مسار التنفيذ.");
          try {
            await DB.saveService(payload);
            UI.close(); await App.refresh(); UI.ok("تم حفظ الخدمة.");
          } catch (ex) { UI.err(ex.message); }
        };
      },
    });
  }

  /* ---------- العطل الرسمية ---------- */
  function holidays(el) {
    const list = App.state.holidays.slice().sort((a, b) => a.date.localeCompare(b.date));
    el.innerHTML = `
      <div class="notice info">الأيام المسجّلة هنا <b>لا تُحتسب</b> ضمن مدة الإنجاز،
        شأنها شأن الجمعة والسبت. سجّلها مسبقاً حتى لا تُحسب مهام على الإدارات ظلماً.</div>

      <div class="grid-2" style="margin-top:14px">
        <div class="panel">
          <h3>➕ إضافة عطلة</h3>
          <div class="field"><label>التاريخ</label><input type="date" id="h-date"></div>
          <div class="field"><label>المناسبة</label><input type="text" id="h-name" placeholder="مثال: إجازة عيد الفطر"></div>
          <button class="btn" id="h-add">إضافة</button>
        </div>
        <div class="panel tbl-wrap">
          <h3>📅 العطل المسجّلة (${AR(list.length)})</h3>
          ${list.length ? `<table>
            <thead><tr><th>التاريخ</th><th>اليوم</th><th>المناسبة</th><th class="num">إجراء</th></tr></thead>
            <tbody>${list.map(h => `<tr>
              <td class="small">${SLA.fmtShort(h.date)}</td>
              <td class="small muted">${SLA.fmtDate(h.date).split(" ")[0]}</td>
              <td>${esc(h.name)}</td>
              <td class="num"><button class="btn ghost sm" data-del="${h.date}">حذف</button></td>
            </tr>`).join("")}</tbody></table>`
            : UI.empty("📅", "لا توجد عطل مسجّلة.")}
        </div>
      </div>`;

    UI.$("#h-add", el).onclick = async () => {
      const date = UI.$("#h-date", el).value, name = UI.$("#h-name", el).value.trim();
      if (!date || !name) return UI.err("أدخل التاريخ والمناسبة.");
      try { await DB.saveHoliday({ date, name }); await App.refresh(); UI.ok("تمت إضافة العطلة."); }
      catch (ex) { UI.err(ex.message); }
    };
    UI.$$("[data-del]", el).forEach(b => b.onclick = () =>
      UI.confirmBox("حذف عطلة", "سيُعاد احتساب أيام العمل لهذا التاريخ. متابعة؟", async () => {
        try { await DB.deleteHoliday(b.dataset.del); await App.refresh(); UI.ok("تم الحذف."); }
        catch (ex) { UI.err(ex.message); }
      }, "حذف", true));
  }

  /* ---------- النسخ الاحتياطي ---------- */
  function backup(el) {
    el.innerHTML = `
      <div class="grid-2">
        <div class="panel">
          <h3>⬇️ تصدير نسخة كاملة</h3>
          <p class="small muted">ملف JSON يحوي المهام والسجلات والمستخدمين والخدمات والعطل.
            احتفظ به خارج الجهاز.</p>
          <div class="actions">
            <button class="btn" id="b-export">تصدير نسخة JSON</button>
            <button class="btn ghost" id="b-csv">تصدير كل المهام CSV</button>
          </div>
        </div>

        <div class="panel">
          <h3>⬆️ استرجاع نسخة</h3>
          ${DB.mode === "demo"
            ? `<p class="small muted">سيُستبدل محتوى النظام بالكامل بمحتوى الملف.</p>
               <div class="field" style="margin-top:10px"><input type="file" id="b-file" accept=".json"></div>
               <button class="btn danger" id="b-import">استرجاع واستبدال</button>`
            : `<div class="notice warn">الاسترجاع إلى قاعدة البيانات المشتركة يتم من لوحة
               Supabase ← SQL Editor، لا من المتصفح، حفاظاً على سلامة بيانات بقية المستخدمين.</div>`}
        </div>
      </div>

      ${DB.mode === "demo" ? `
      <h3 class="section-title">⚠️ منطقة الخطر</h3>
      <div class="panel">
        <p class="small">إعادة ضبط الوضع التجريبي تحذف كل ما أدخلته وتعيد البيانات النموذجية.</p>
        <div class="actions"><button class="btn danger" id="b-reset">إعادة ضبط البيانات التجريبية</button></div>
      </div>` : ""}`;

    UI.$("#b-export", el).onclick = async () => {
      UI.download(await DB.exportAll(), "نسخة_نظام_بيان_" + SLA.dateKey(new Date()) + ".json", "application/json");
      UI.ok("تم تصدير النسخة.");
    };
    UI.$("#b-csv", el).onclick = () => Tasks.exportCSV(App.state.tasks);

    const imp = UI.$("#b-import", el);
    if (imp) imp.onclick = () => {
      const f = UI.$("#b-file", el).files[0];
      if (!f) return UI.err("اختر ملف النسخة أولاً.");
      UI.confirmBox("استرجاع نسخة", "سيُستبدل محتوى النظام بالكامل. هذا الإجراء لا يمكن التراجع عنه.",
        () => {
          const r = new FileReader();
          r.onload = async () => {
            try { await DB.importAll(r.result); await App.refresh(); UI.ok("تم الاسترجاع."); }
            catch (ex) { UI.err(ex.message); }
          };
          r.readAsText(f);
        }, "استرجاع واستبدال", true);
    };

    const rst = UI.$("#b-reset", el);
    if (rst) rst.onclick = () => UI.confirmBox("إعادة ضبط",
      "ستُحذف كل البيانات الحالية وتعود البيانات النموذجية. متابعة؟",
      async () => { await DB.resetDemo(); location.reload(); }, "إعادة الضبط", true);
  }

  return { render };
})();
