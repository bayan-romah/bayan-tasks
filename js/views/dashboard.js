/* =============================================================
   لوحة المتابعة — تتفرّع حسب دور المستخدم
     المالك      : كل الإدارات + ترتيبها + الاتجاه الشهري
     مدير إدارة  : إدارته فقط + أداء موظفيه
     موظف        : مهامه وطلباته + التزامه الشخصي
   ============================================================= */

const Dashboard = (() => {

  const esc = UI.esc, AR = UI.AR;

  function render(el) {
    const me = App.state.me;
    if (me.role === "owner") return owner(el);
    if (me.role === "manager") return manager(el);
    return employee(el);
  }

  /* ---------- مكوّنات مشتركة ---------- */

  function statRow(s) {
    return `<div class="stats">
      ${UI.stat(AR(s.live), "إجمالي المهام", "", "عدا الملغاة والمرفوضة")}
      ${UI.stat(AR(s.open), "قيد العمل", "info")}
      ${UI.stat(AR(s.done), "منجزة", "ok")}
      ${UI.stat(AR(s.lateOpen), "متأخرة الآن", s.lateOpen ? "danger" : "ok",
        s.lateOpen ? "تحتاج تدخّلاً فورياً" : "لا يوجد تأخر قائم")}
      ${UI.stat(AR(s.awaiting), "بانتظار الفرز", s.awaiting ? "warn" : "", "لم تبدأ مدتها بعد")}
      ${UI.stat(s.avgDays == null ? "—" : AR(s.avgDays),
        "متوسط أيام الإنجاز", "", "بأيام العمل")}
    </div>`;
  }

  function ringsPanel(s, title) {
    return `<div class="panel">
      <h3>${esc(title)}</h3>
      <div style="display:flex;gap:26px;flex-wrap:wrap;justify-content:space-around;padding:6px 0">
        ${UI.ring(s.commitment, "نسبة الالتزام بالمدة")}
        ${UI.ring(s.completion, "معدل الإنجاز")}
      </div>
      <div class="notice ${SLA.slaColor(s.commitment).key === "ok" ? "ok"
        : SLA.slaColor(s.commitment).key === "warn" ? "warn"
        : SLA.slaColor(s.commitment).key === "danger" ? "danger" : "info"}" style="margin:12px 0 0">
        ${commitmentMessage(s)}
      </div>
    </div>`;
  }

  function commitmentMessage(s) {
    if (s.commitment == null) return "لا توجد مهام منتهية بعد لاحتساب نسبة الالتزام.";
    const c = SLA.slaColor(s.commitment);
    if (c.key === "ok") return `الالتزام ضمن المستهدف (90% فأعلى). ${s.lateOpen ? "لكن هناك " + AR(s.lateOpen) + " مهمة متأخرة قائمة تحتاج معالجة." : "استمر."}`;
    if (c.key === "warn") return `الالتزام انخفض دون المستهدف — <b>مؤشر أصفر</b>. راجع المهام المتأخرة قبل أن تنزل النسبة عن 75%.`;
    return `الالتزام أقل من 75% — <b>مؤشر أحمر</b>. الوضع يستدعي تدخلاً مباشراً وخطة تصحيحية.`;
  }

  /* شبكة الأقسام */
  function deptGrid(tasks) {
    const now = App.state.now;
    const rows = App.state.departments.map(d => {
      const dt = tasks.filter(t => t.department_id === d.id);
      const s = SLA.summarize(dt, now);
      return { d, s, color: SLA.slaColor(s.commitment) };
    });
    return `<div class="dept-grid">
      ${rows.map(r => `
        <div class="dept-card ${r.color.key}" data-dept="${r.d.id}" title="اعرض مهام ${esc(r.d.name)}">
          ${UI.ring(r.s.commitment, null, null, 84)}
          <div class="dname">${r.d.icon} ${esc(r.d.name)}</div>
          <div class="dmeta">${AR(r.s.live)} مهمة · ${AR(r.s.done)} منجزة
            ${r.s.lateOpen ? ` · <b style="color:var(--danger)">${AR(r.s.lateOpen)} متأخرة</b>` : ""}</div>
        </div>`).join("")}
    </div>`;
  }

  /* جدول ترتيب الإدارات */
  function deptTable(tasks) {
    const now = App.state.now;
    const rows = App.state.departments.map(d => {
      const dt = tasks.filter(t => t.department_id === d.id);
      return { d, s: SLA.summarize(dt, now) };
    }).sort((a, b) => (b.s.commitment == null ? -1 : b.s.commitment) - (a.s.commitment == null ? -1 : a.s.commitment));

    return `<div class="panel tbl-wrap">
      <table>
        <thead><tr>
          <th>الإدارة</th><th class="num">المهام</th><th class="num">منجزة</th>
          <th class="num">متأخرة</th><th class="num">متوسط الأيام</th>
          <th style="min-width:190px">نسبة الالتزام</th><th class="num">التقييم</th>
        </tr></thead>
        <tbody>${rows.map(r => `
          <tr class="clickable" data-dept="${r.d.id}">
            <td>${r.d.icon} ${esc(r.d.name)}</td>
            <td class="num">${AR(r.s.live)}</td>
            <td class="num">${AR(r.s.done)}</td>
            <td class="num" style="${r.s.lateOpen ? "color:var(--danger);font-weight:600" : ""}">${AR(r.s.lateOpen)}</td>
            <td class="num">${r.s.avgDays == null ? "—" : AR(r.s.avgDays)}</td>
            <td>${UI.barline(r.s.commitment)}</td>
            <td class="num">${UI.stateBadge(r.s.commitment)}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  }

  /* الاتجاه الشهري — أعمدة (في الموعد / متأخرة) */
  function trend(tasks) {
    const now = App.state.now;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth(), label: monthLabel(d), onTime: 0, late: 0 });
    }
    tasks.filter(SLA.isDone).forEach(t => {
      const d = new Date(t.completed_at || t.closed_at);
      const slot = months.filter(x => x.y === d.getFullYear() && x.m === d.getMonth())[0];
      if (!slot) return;
      if (SLA.isLate(t, now)) slot.late++; else slot.onTime++;
    });
    const max = Math.max(1, ...months.map(m => m.onTime + m.late));

    return `<div class="panel">
      <h3>اتجاه الإنجاز — آخر ستة أشهر</h3>
      <div class="trend">
        ${months.map(m => {
          const tot = m.onTime + m.late;
          const tip = `${m.label}: ${tot} منجزة · ${m.onTime} في الموعد · ${m.late} متأخرة`;
          return `<div class="col" data-tip="${esc(tip)}">
            <div class="stack" style="height:${Math.max(4, (tot / max) * 100)}%">
              ${m.late ? `<i class="late" style="height:${(m.late / tot) * 100}%"></i>` : ""}
              ${m.onTime ? `<i class="on-time" style="height:${(m.onTime / tot) * 100}%"></i>` : ""}
            </div>
            <div class="lbl">${m.label}<b>${AR(tot)}</b></div>
          </div>`;
        }).join("")}
      </div>
      <div class="legend">
        <span><i style="background:var(--ok)"></i> في الموعد</span>
        <span><i style="background:var(--danger)"></i> متأخرة</span>
      </div>
    </div>`;
  }

  const AR_M = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const monthLabel = d => AR_M[d.getMonth()];

  /* أكثر المهام تأخراً */
  function lateList(tasks, limit) {
    const now = App.state.now;
    const late = tasks.filter(t => SLA.isOpen(t) && SLA.isLate(t, now))
      .sort((a, b) => SLA.daysLeft(a, now) - SLA.daysLeft(b, now))
      .slice(0, limit || 10);

    if (!late.length) return `<div class="panel">
      <h3>المهام المتأخرة</h3>
      ${UI.empty("✅", "لا توجد مهام متأخرة حالياً.", "كل المهام القائمة ضمن مدتها المعتمدة.")}
    </div>`;

    return `<div class="panel tbl-wrap">
      <h3>المهام المتأخرة — الأقدم أولاً</h3>
      <table>
        <thead><tr><th>الرقم</th><th>المهمة</th><th>الإدارة</th><th>المنفّذ</th>
          <th class="num">الاستحقاق</th><th class="num">التأخر</th><th class="num">التصعيد</th></tr></thead>
        <tbody>${late.map(t => {
          const esc_ = SLA.escalationLevel(t, now);
          return `<tr class="clickable" data-task="${t.id}">
            <td class="small" style="font-family:monospace">${esc(t.ref_no)}</td>
            <td>${esc(t.title)}</td>
            <td class="small">${esc(App.deptName(t.department_id))}</td>
            <td class="small">${t.assignee_id ? esc(App.userName(t.assignee_id)) : "<span class='tag warn'>غير مُسندة</span>"}</td>
            <td class="num small">${SLA.fmtShort(t.due_at)}</td>
            <td class="num"><span class="tag danger">${AR(Math.abs(SLA.daysLeft(t, now)))} يوم عمل</span></td>
            <td class="num small">${esc_ ? `<span class="tag warn">${esc(esc_.label)} → ${esc(esc_.to)}</span>` : "—"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
  }

  /* جدول أداء الموظفين */
  function staffTable(deptId) {
    const now = App.state.now;
    const staff = App.state.profiles.filter(p => p.department_id === deptId && p.role !== "owner");
    if (!staff.length) return "";

    const rows = staff.map(p => {
      const t = App.state.tasks.filter(x => x.assignee_id === p.id);
      return { p, s: SLA.summarize(t, now) };
    }).sort((a, b) => (b.s.commitment == null ? -1 : b.s.commitment) - (a.s.commitment == null ? -1 : a.s.commitment));

    return `<div class="panel tbl-wrap">
      <h3>أداء موظفي الإدارة</h3>
      <table>
        <thead><tr>
          <th>الموظف</th><th>المسمّى</th><th class="num">مُسندة</th><th class="num">قيد العمل</th>
          <th class="num">منجزة</th><th class="num">متأخرة</th><th class="num">متوسط الأيام</th>
          <th style="min-width:180px">نسبة الالتزام</th>
        </tr></thead>
        <tbody>${rows.map(r => `
          <tr class="clickable" data-assignee="${r.p.id}">
            <td>${esc(r.p.full_name)}${r.p.role === "manager" ? ' <span class="tag info">مدير</span>' : ""}</td>
            <td class="small muted">${esc(r.p.job_title || "—")}</td>
            <td class="num">${AR(r.s.live)}</td>
            <td class="num">${AR(r.s.open)}</td>
            <td class="num">${AR(r.s.done)}</td>
            <td class="num" style="${r.s.lateOpen ? "color:var(--danger);font-weight:700" : ""}">${AR(r.s.lateOpen)}</td>
            <td class="num">${r.s.avgDays == null ? "—" : AR(r.s.avgDays)}</td>
            <td>${UI.barline(r.s.commitment)}</td>
          </tr>`).join("")}</tbody>
      </table>
      <p class="small muted" style="margin-top:9px">تُحتسب نسبة الموظف من المهام المُسندة إليه فقط.</p>
    </div>`;
  }

  /* بطاقات مهام مختصرة */
  function taskCards(tasks, emptyMsg, limit) {
    const now = App.state.now;
    if (!tasks.length) return UI.empty("🗂️", emptyMsg);
    return `<div class="cards">${tasks.slice(0, limit || 60).map(t => `
      <article class="card ${UI.taskClass(t, now)}" data-task="${t.id}">
        <div class="ref">${esc(t.ref_no)}</div>
        <h4>${esc(t.title)}</h4>
        <div class="cdept">${esc(App.deptName(t.department_id))}
          ${t.assignee_id ? " · " + esc(App.userName(t.assignee_id)) : ""}</div>
        <div class="meta">${UI.statusTag(t, now)}</div>
      </article>`).join("")}</div>`;
  }

  /* ---------- لوحة المالك ---------- */
  function owner(el) {
    const tasks = App.state.tasks;
    const s = SLA.summarize(tasks, App.state.now);

    el.innerHTML = `
      <div class="page-head">
        <h2>لوحة المتابعة العامة</h2>
        <div class="sp">
          <button class="btn" data-new>➕ رفع طلب جديد</button>
          <button class="btn ghost" onclick="window.print()">🖨️ طباعة</button>
        </div>
      </div>
      ${statRow(s)}

      <div class="grid-2" style="margin-top:16px">
        ${ringsPanel(s, "🎯 مؤشر الالتزام العام")}
        ${trend(tasks)}
      </div>

      <h3 class="section-title">الإدارات التسع — نسبة الالتزام</h3>
      ${deptGrid(tasks)}

      <h3 class="section-title">ترتيب الإدارات</h3>
      ${deptTable(tasks)}

      <h3 class="section-title">المتابعة العاجلة</h3>
      ${lateList(tasks, 12)}`;

    wire(el);
  }

  /* ---------- لوحة مدير الإدارة ---------- */
  function manager(el) {
    const me = App.state.me;
    const d = App.dept(me.department_id);
    const inbound = App.state.tasks.filter(t => t.department_id === me.department_id);
    const outbound = App.state.tasks.filter(t =>
      t.requester_dept === me.department_id && t.department_id !== me.department_id);
    const s = SLA.summarize(inbound, App.state.now);
    const pending = inbound.filter(t => ["submitted", "returned"].indexOf(t.status) !== -1);
    const approve = inbound.filter(t => t.status === "pending_approval");
    const unassigned = inbound.filter(t => t.status === "accepted");

    el.innerHTML = `
      <div class="page-head">
        <h2>لوحة ${esc(d.icon + " " + d.name)}</h2>
        <div class="sp">
          <button class="btn" data-new>➕ رفع طلب جديد</button>
          <button class="btn ghost" onclick="window.print()">🖨️ طباعة</button>
        </div>
      </div>
      ${statRow(s)}

      ${(pending.length || approve.length || unassigned.length) ? `
        <div class="notice warn" style="margin-top:14px">
          <b>يحتاج قرارك:</b>
          ${pending.length ? `${AR(pending.length)} طلب بانتظار الفرز · ` : ""}
          ${unassigned.length ? `${AR(unassigned.length)} مقبول بلا إسناد · ` : ""}
          ${approve.length ? `${AR(approve.length)} بانتظار الاعتماد` : ""}
        </div>` : ""}

      <div class="grid-2" style="margin-top:16px">
        ${ringsPanel(s, "🎯 التزام الإدارة")}
        ${trend(inbound)}
      </div>

      ${pending.length || unassigned.length || approve.length ? `
        <h3 class="section-title">صندوق القرارات</h3>
        ${taskCards(pending.concat(unassigned, approve), "لا توجد قرارات معلّقة.")}` : ""}

      <h3 class="section-title">أداء الموظفين</h3>
      ${staffTable(me.department_id)}

      <h3 class="section-title">المهام المتأخرة في الإدارة</h3>
      ${lateList(inbound, 10)}

      ${outbound.length ? `
        <h3 class="section-title">طلبات إدارتك لدى الإدارات الأخرى</h3>
        ${taskCards(outbound.filter(SLA.isOpen), "لا توجد طلبات صادرة قائمة.", 12)}` : ""}`;

    wire(el);
  }

  /* ---------- لوحة الموظف ---------- */
  function employee(el) {
    const now = App.state.now;
    const mine = App.myTasks();
    const reqs = App.myRequests();
    const s = SLA.summarize(mine, now);
    const openMine = mine.filter(SLA.isOpen)
      .sort((a, b) => new Date(a.due_at || a.created_at) - new Date(b.due_at || b.created_at));
    const needMe = reqs.filter(t => ["returned", "completed"].indexOf(t.status) !== -1);

    el.innerHTML = `
      <div class="page-head">
        <h2>لوحتي</h2>
        <div class="sp"><button class="btn" data-new>➕ رفع طلب جديد</button></div>
      </div>

      <div class="stats">
        ${UI.stat(AR(openMine.length), "مهام قيد العمل", "info")}
        ${UI.stat(AR(s.done), "أنجزتُها", "ok")}
        ${UI.stat(AR(s.lateOpen), "متأخرة عليّ", s.lateOpen ? "danger" : "ok")}
        ${UI.stat(AR(reqs.filter(SLA.isOpen).length), "طلباتي الجارية", "")}
        ${UI.stat(s.avgDays == null ? "—" : AR(s.avgDays),
          "متوسط أيام إنجازي", "", "بأيام العمل")}
      </div>

      ${needMe.length ? `<div class="notice warn" style="margin-top:14px">
        <b>ينتظر إجراءك:</b> ${AR(needMe.length)} من طلباتك تحتاج استكمال بيانات أو استلاماً وإغلاقاً.
      </div>` : ""}

      <div class="grid-2" style="margin-top:16px">
        ${ringsPanel(s, "🎯 التزامي الشخصي")}
        <div class="panel">
          <h3>أقرب المهام استحقاقاً</h3>
          ${openMine.length ? `<ul class="timeline">${openMine.slice(0, 6).map(t => `
            <li>
              <b>${esc(t.title)}</b>
              <div class="tl-when">${esc(t.ref_no)} · ${esc(App.deptName(t.department_id))}</div>
              <div style="margin-top:5px">${UI.statusTag(t, now)}</div>
            </li>`).join("")}</ul>`
            : UI.empty("🎉", "لا توجد مهام مسندة إليك حالياً.")}
        </div>
      </div>

      <h3 class="section-title">مهامي المسندة</h3>
      ${taskCards(openMine, "لا توجد مهام مسندة إليك حالياً.")}

      <h3 class="section-title">طلباتي المرفوعة</h3>
      ${taskCards(reqs.filter(SLA.isOpen).concat(needMe.filter(t => !SLA.isOpen(t))),
        "لم ترفع أي طلب بعد — استخدم زر «رفع طلب جديد».")}`;

    wire(el);
  }

  /* ---------- الربط ---------- */
  function wire(el) {
    UI.$$("[data-task]", el).forEach(n => n.onclick = () => Tasks.open(n.dataset.task));
    UI.$$("[data-dept]", el).forEach(n => n.onclick = () => {
      Tasks.preset({ dept: n.dataset.dept }); App.go("tasks");
    });
    UI.$$("[data-assignee]", el).forEach(n => n.onclick = e => {
      e.stopPropagation();
      Tasks.preset({ assignee: n.dataset.assignee }); App.go("tasks");
    });
    UI.$$("[data-new]", el).forEach(n => n.onclick = () => Tasks.newTask());
  }

  return { render, taskCards, lateList, staffTable, deptTable };
})();
