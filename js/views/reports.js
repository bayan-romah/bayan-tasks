/* =============================================================
   تقارير الأداء — تقرير قابل للطباعة والتصدير
   يحترم نطاق صلاحية المستخدم: المالك كل الإدارات، والمدير إدارته.
   ============================================================= */

const Reports = (() => {

  const esc = UI.esc, AR = UI.AR;
  let P = { from: "", to: "", dept: "" };

  function inRange(t) {
    const d = new Date(t.created_at);
    if (P.from && d < new Date(P.from + "T00:00:00")) return false;
    if (P.to && d > new Date(P.to + "T23:59:59")) return false;
    return true;
  }

  function scope() {
    let list = App.scopeTasks().filter(inRange);
    if (P.dept) list = list.filter(t => t.department_id === P.dept);
    return list;
  }

  function render(el) {
    const me = App.state.me;
    if (!P.from) {
      const d = new Date(App.state.now); d.setMonth(d.getMonth() - 3);
      P.from = SLA.dateKey(d);
      P.to = SLA.dateKey(App.state.now);
    }

    el.innerHTML = `
      <div class="page-head">
        <h2>📈 تقرير الأداء</h2>
        <div class="sp">
          <button class="btn ghost" id="r-csv">⬇️ تصدير CSV</button>
          <button class="btn ghost" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
        </div>
      </div>

      <div class="toolbar">
        <div class="row">
          <div class="field" style="margin:0"><label>من تاريخ</label>
            <input type="date" id="r-from" value="${P.from}"></div>
          <div class="field" style="margin:0"><label>إلى تاريخ</label>
            <input type="date" id="r-to" value="${P.to}"></div>
          ${me.role === "owner" ? `<div class="field" style="margin:0"><label>الإدارة</label>
            <select id="r-dept"><option value="">كل الإدارات</option>
              ${App.state.departments.map(d =>
                `<option value="${d.id}" ${P.dept === d.id ? "selected" : ""}>${d.icon} ${esc(d.name)}</option>`).join("")}
            </select></div>` : ""}
        </div>
      </div>

      <div id="r-body"></div>`;

    const body = UI.$("#r-body", el);

    function draw() {
      const list = scope();
      const now = App.state.now;
      const s = SLA.summarize(list, now);

      /* مؤشرات الاتفاقية الخمسة */
      /* أي طلب أُعيد مرة واحدة على الأقل — يُحفظ سبب الإعادة ولا يُمحى */
      const returned = list.filter(t => !!t.return_reason).length;
      const escalated = list.filter(t => SLA.isLate(t, now)).length;
      const rated = list.filter(t => t.satisfaction);
      const avgSat = rated.length
        ? Math.round((rated.reduce((a, t) => a + t.satisfaction, 0) / rated.length) * 10) / 10 : null;
      const retPct = s.live ? Math.round((returned / s.live) * 1000) / 10 : null;
      const escPct = s.live ? Math.round((escalated / s.live) * 1000) / 10 : null;

      const kpiRow = (name, value, target, met) => `<tr>
        <td>${esc(name)}</td><td class="num"><b>${value}</b></td><td class="num">${esc(target)}</td>
        <td class="num"><span class="tag ${met === null ? "grey" : met ? "ok" : "danger"}">
          ${met === null ? "لا توجد بيانات" : met ? "محقّق" : "غير محقّق"}</span></td></tr>`;

      body.innerHTML = `
        <div class="panel" style="margin-bottom:14px">
          <p class="small muted">
            التقرير يغطي المهام المرفوعة من <b>${SLA.fmtDate(P.from)}</b>
            إلى <b>${SLA.fmtDate(P.to)}</b>
            ${P.dept ? ` — إدارة <b>${esc(App.dept(P.dept).name)}</b>` : ""}
            ${App.state.me.role === "manager" ? ` — نطاق <b>${esc(App.dept(App.state.me.department_id).name)}</b>` : ""}
            · صدر بتاريخ ${SLA.fmtDate(now)}.
          </p>
        </div>

        <div class="stats">
          ${UI.stat(AR(s.live), "إجمالي المهام")}
          ${UI.stat(AR(s.done), "منجزة", "ok")}
          ${UI.stat(AR(s.open), "قيد العمل", "info")}
          ${UI.stat(AR(s.late), "تجاوزت المدة", s.late ? "danger" : "ok")}
          ${UI.stat(AR(s.cancelled), "ملغاة / مرفوضة", "")}
          ${UI.stat(avgSat == null ? "—" : AR(String(avgSat).replace(".", "٫")) + "/٥", "متوسط الرضا", "info")}
        </div>

        <div class="grid-2" style="margin-top:16px">
          <div class="panel">
            <h3>🎯 المؤشران الرئيسيان</h3>
            <div style="display:flex;gap:26px;flex-wrap:wrap;justify-content:space-around;padding:6px 0">
              ${UI.ring(s.commitment, "نسبة الالتزام بالمدة")}
              ${UI.ring(s.completion, "معدل الإنجاز")}
            </div>
          </div>
          <div class="panel tbl-wrap">
            <h3>📊 مؤشرات الاتفاقية</h3>
            <table>
              <thead><tr><th>المؤشر</th><th class="num">القيمة</th><th class="num">المستهدف</th><th class="num">النتيجة</th></tr></thead>
              <tbody>
                ${kpiRow("نسبة الالتزام بالمدة", SLA.pctText(s.commitment), "٩٠٪ فأعلى",
                  s.commitment == null ? null : s.commitment >= CONFIG.THRESHOLD_OK)}
                ${kpiRow("معدل الإنجاز", SLA.pctText(s.completion), "٩٠٪ فأعلى",
                  s.completion == null ? null : s.completion >= CONFIG.THRESHOLD_OK)}
                ${kpiRow("الطلبات المعادة لنقص البيانات", SLA.pctText(retPct), "أقل من ١٠٪",
                  retPct == null ? null : retPct < 10)}
                ${kpiRow("الطلبات المتجاوزة للمدة", SLA.pctText(escPct), "أقل من ٥٪",
                  escPct == null ? null : escPct < 5)}
                ${kpiRow("رضا مقدّمي الطلبات", avgSat == null ? "—" : AR(String(avgSat).replace(".", "٫")) + "/٥",
                  "٤ من ٥ فأعلى", avgSat == null ? null : avgSat >= 4)}
                ${kpiRow("متوسط أيام الإنجاز", s.avgDays == null ? "—" : SLA.dayWord(Math.round(s.avgDays)),
                  SLA.dayWord(CONFIG.DEFAULT_SLA_DAYS),
                  s.avgDays == null ? null : s.avgDays <= CONFIG.DEFAULT_SLA_DAYS)}
              </tbody>
            </table>
          </div>
        </div>

        <h3 class="section-title">🏢 الأداء حسب الإدارة</h3>
        ${Dashboard.deptTable(list)}

        ${App.state.me.role !== "employee" ? `
          <h3 class="section-title">👥 الأداء حسب الموظف</h3>
          ${staffReport(list)}` : ""}

        <h3 class="section-title">📋 الخدمات الأكثر طلباً</h3>
        ${topServices(list)}

        <h3 class="section-title">⏫ المهام المتأخرة</h3>
        ${Dashboard.lateList(list, 15)}`;

      UI.$$("[data-task]", body).forEach(n => n.onclick = () => Tasks.open(n.dataset.task));
      UI.$$("[data-dept]", body).forEach(n => n.onclick = () => {
        Tasks.preset({ dept: n.dataset.dept }); App.go("tasks");
      });
    }

    function staffReport(list) {
      const now = App.state.now;
      const ids = [];
      list.forEach(t => { if (t.assignee_id && ids.indexOf(t.assignee_id) === -1) ids.push(t.assignee_id); });
      if (!ids.length) return UI.empty("👤", "لا توجد مهام مُسندة في هذه الفترة.");

      const rows = ids.map(id => {
        const u = App.user(id) || { full_name: "—", department_id: null, job_title: "" };
        const t = list.filter(x => x.assignee_id === id);
        return { u, s: SLA.summarize(t, now) };
      }).sort((a, b) => (b.s.commitment == null ? -1 : b.s.commitment) - (a.s.commitment == null ? -1 : a.s.commitment));

      return `<div class="panel tbl-wrap"><table>
        <thead><tr><th>الموظف</th><th>الإدارة</th><th class="num">المهام</th>
          <th class="num">منجزة</th><th class="num">متأخرة</th><th class="num">متوسط الأيام</th>
          <th style="min-width:180px">نسبة الالتزام</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${esc(r.u.full_name)}<div class="small muted">${esc(r.u.job_title || "")}</div></td>
          <td class="small">${esc(App.dept(r.u.department_id).name)}</td>
          <td class="num">${AR(r.s.live)}</td>
          <td class="num">${AR(r.s.done)}</td>
          <td class="num" style="${r.s.late ? "color:var(--danger);font-weight:700" : ""}">${AR(r.s.late)}</td>
          <td class="num">${r.s.avgDays == null ? "—" : AR(String(r.s.avgDays).replace(".", "٫"))}</td>
          <td>${UI.barline(r.s.commitment)}</td>
        </tr>`).join("")}</tbody></table></div>`;
    }

    function topServices(list) {
      const now = App.state.now;
      const map = {};
      list.forEach(t => {
        const k = t.service_id || t.title;
        if (!map[k]) map[k] = { name: (App.svc(t.service_id) || {}).name || t.title, dept: t.department_id, items: [] };
        map[k].items.push(t);
      });
      const rows = Object.keys(map).map(k => ({
        r: map[k], s: SLA.summarize(map[k].items, now),
      })).sort((a, b) => b.s.live - a.s.live).slice(0, 12);

      if (!rows.length) return UI.empty("📋", "لا توجد بيانات في هذه الفترة.");
      return `<div class="panel tbl-wrap"><table>
        <thead><tr><th>الخدمة</th><th>الإدارة</th><th class="num">عدد الطلبات</th>
          <th class="num">متوسط الأيام</th><th style="min-width:180px">نسبة الالتزام</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td>${esc(x.r.name)}</td>
          <td class="small">${esc(App.deptName(x.r.dept))}</td>
          <td class="num">${AR(x.s.live)}</td>
          <td class="num">${x.s.avgDays == null ? "—" : AR(String(x.s.avgDays).replace(".", "٫"))}</td>
          <td>${UI.barline(x.s.commitment)}</td>
        </tr>`).join("")}</tbody></table></div>`;
    }

    UI.$("#r-from", el).onchange = e => { P.from = e.target.value; draw(); };
    UI.$("#r-to", el).onchange = e => { P.to = e.target.value; draw(); };
    const ds = UI.$("#r-dept", el); if (ds) ds.onchange = e => { P.dept = e.target.value; draw(); };
    UI.$("#r-csv", el).onclick = () => Tasks.exportCSV(scope());

    draw();
  }

  return { render };
})();
