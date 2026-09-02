/* =============================================================
   دليل الخدمات — تطوير لشاشة كتالوج اتفاقية مستوى الخدمة
   نفس البحث والفلاتر السابقة، مع إمكانية رفع الطلب مباشرة.
   ============================================================= */

const Catalog = (() => {

  const esc = UI.esc, AR = UI.AR;
  let F = { q: "", dept: "", aud: "", sort: "dept" };

  const slaClass = n => n <= 2 ? "fast" : n >= 7 ? "slow" : "";

  function all() {
    return App.state.services.filter(s => s.active !== false).map(s =>
      Object.assign({}, s, { deptName: App.dept(s.department_id).name, deptIcon: App.dept(s.department_id).icon }));
  }

  function render(el) {
    const list0 = all();
    const auds = [];
    list0.forEach(s => (s.audience || []).forEach(a => { if (auds.indexOf(a) === -1) auds.push(a); }));

    el.innerHTML = `
      <div class="page-head">
        <h2>🔎 دليل الخدمات</h2>
        <div class="sp">
          <button class="btn" id="c-new">➕ رفع طلب جديد</button>
          <button class="btn ghost" id="c-expand">توسيع الكل</button>
          <button class="btn ghost" id="c-md">⬇️ تصدير الدليل (Markdown)</button>
          <button class="btn ghost" onclick="window.print()">🖨️ طباعة</button>
        </div>
      </div>

      <div class="stats" style="margin-bottom:14px">
        ${UI.stat(AR(App.state.departments.length), "عدد الإدارات")}
        ${UI.stat(AR(list0.length), "إجمالي الخدمات")}
        ${UI.stat(SLA.dayWord(CONFIG.DEFAULT_SLA_DAYS), "المدة الافتراضية", "info", "الأحد – الخميس")}
        ${UI.stat(SLA.dayWord(Math.min.apply(null, list0.map(s => s.sla_days))), "أسرع خدمة", "ok")}
        ${UI.stat(SLA.dayWord(Math.max.apply(null, list0.map(s => s.sla_days))), "أطول خدمة", "warn")}
      </div>

      <div class="toolbar">
        <div class="row">
          <div class="search"><input id="c-q" type="search"
            placeholder="ابحث باسم الخدمة أو الإدارة… مثال: رابط تبرع"></div>
          <select id="c-aud"><option value="">كل الفئات المستفيدة</option>
            ${auds.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join("")}</select>
          <select id="c-sort">
            <option value="dept">ترتيب حسب الإدارة</option>
            <option value="fast">الأسرع إنجازاً أولاً</option>
            <option value="slow">الأطول مدة أولاً</option>
          </select>
        </div>
        <div class="chips" id="c-depts">
          <button class="chip on" data-d="">كل الإدارات</button>
          ${App.state.departments.map(d =>
            `<button class="chip" data-d="${d.id}">${d.icon} ${esc(d.name)}</button>`).join("")}
        </div>
      </div>

      <div class="count" id="c-count"></div>
      <div class="cards" id="c-grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))"></div>
      <div id="c-empty"></div>

      <h3 class="section-title">🧾 ملخص المدد حسب الإدارة</h3>
      <div class="panel tbl-wrap" id="c-summary"></div>`;

    const grid = UI.$("#c-grid", el), cnt = UI.$("#c-count", el), emp = UI.$("#c-empty", el);
    let expanded = false;

    function draw() {
      let list = all().filter(s => {
        if (F.dept && s.department_id !== F.dept) return false;
        if (F.aud && (s.audience || []).indexOf(F.aud) === -1) return false;
        if (F.q) {
          const hay = SLA.norm([s.name, s.deptName, s.channel,
            (s.audience || []).join(" "), (s.reqs || []).join(" "), (s.flow || []).join(" ")].join(" "));
          if (SLA.norm(F.q).split(" ").some(w => hay.indexOf(w) === -1)) return false;
        }
        return true;
      });

      if (F.sort === "fast") list.sort((a, b) => a.sla_days - b.sla_days);
      else if (F.sort === "slow") list.sort((a, b) => b.sla_days - a.sla_days);

      cnt.textContent = list.length
        ? `عدد الخدمات المعروضة: ${AR(list.length)} من ${AR(all().length)}` : "";
      emp.innerHTML = list.length ? "" : UI.empty("🔍", "لا توجد خدمة مطابقة للبحث.");

      grid.innerHTML = list.map(s => `
        <article class="svc">
          <div class="dept">${s.deptIcon} ${esc(s.deptName)}</div>
          <h3>${esc(s.name)}</h3>
          <span class="sla ${slaClass(s.sla_days)}">⏱️ ${SLA.dayWord(s.sla_days)}</span>
          <div class="aud">${(s.audience || []).map(a => `<span>${esc(a)}</span>`).join("")}</div>
          <button class="more" data-more>عرض المتطلبات ومسار التنفيذ ▾</button>
          <div class="details ${expanded ? "open" : ""}">
            <h4>قناة تقديم الطلب</h4>
            <p class="small">${esc(s.channel)}</p>
            <h4>متطلبات لا يُقبل الطلب بدونها</h4>
            <ul>${(s.reqs || []).map(r => `<li>${esc(r)}</li>`).join("")}</ul>
            <h4>مسار التنفيذ داخل الإدارة</h4>
            <ol style="padding-right:18px;font-size:.88rem;color:#3d4f4c">
              ${(s.flow || []).map(f => `<li>${esc(f)}</li>`).join("")}</ol>
            ${s.note ? `<div class="svcnote">⚠️ ${esc(s.note)}</div>` : ""}
            <button class="btn sm" style="margin-top:12px" data-req="${s.id}">➕ رفع طلب لهذه الخدمة</button>
          </div>
        </article>`).join("");

      UI.$$("[data-more]", grid).forEach(b => b.onclick = () => {
        const d = b.nextElementSibling;
        const on = d.classList.toggle("open");
        b.textContent = on ? "إخفاء التفاصيل ▴" : "عرض المتطلبات ومسار التنفيذ ▾";
      });
      UI.$$("[data-req]", grid).forEach(b => b.onclick = () => Tasks.newTask(b.dataset.req));
    }

    /* جدول الملخص */
    UI.$("#c-summary", el).innerHTML = `<table>
      <thead><tr><th>الإدارة</th><th class="num">عدد الخدمات</th><th>أسرع خدمة</th>
        <th>أطول خدمة</th><th class="num">متوسط أيام العمل</th></tr></thead>
      <tbody>${App.state.departments.map(d => {
        const svcs = all().filter(s => s.department_id === d.id);
        if (!svcs.length) return `<tr><td>${d.icon} ${esc(d.name)}</td>
          <td class="num">٠</td><td colspan="3" class="muted small">لا توجد خدمات مسجّلة</td></tr>`;
        const days = svcs.map(s => s.sla_days);
        const min = Math.min.apply(null, days), max = Math.max.apply(null, days);
        const avg = Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
        return `<tr>
          <td>${d.icon} ${esc(d.name)}</td>
          <td class="num">${AR(svcs.length)}</td>
          <td class="small">${esc(svcs.filter(s => s.sla_days === min)[0].name)} — ${SLA.dayWord(min)}</td>
          <td class="small">${esc(svcs.filter(s => s.sla_days === max)[0].name)} — ${SLA.dayWord(max)}</td>
          <td class="num">${AR(String(avg).replace(".", "٫"))}</td>
        </tr>`;
      }).join("")}</tbody></table>`;

    UI.$("#c-q", el).oninput = e => { F.q = e.target.value.trim(); draw(); };
    UI.$("#c-aud", el).onchange = e => { F.aud = e.target.value; draw(); };
    UI.$("#c-sort", el).onchange = e => { F.sort = e.target.value; draw(); };
    UI.$("#c-depts", el).onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      F.dept = b.dataset.d;
      UI.$$(".chip", UI.$("#c-depts", el)).forEach(c => c.classList.toggle("on", c === b));
      draw();
    };
    UI.$("#c-new", el).onclick = () => Tasks.newTask();
    UI.$("#c-expand", el).onclick = e => {
      expanded = !expanded;
      e.target.textContent = expanded ? "طيّ الكل" : "توسيع الكل";
      draw();
    };
    UI.$("#c-md", el).onclick = exportMd;

    draw();
  }

  /* تصدير الدليل إلى Markdown — بنفس صيغة الملف السابق */
  function exportMd() {
    let md = "# دليل خدمات جمعية بيان — المدد ومسارات التنفيذ\n\n";
    md += "> مولَّد آلياً من نظام إدارة المهام.\n";
    md += "> أيام العمل: " + QAWAID.workDays + " · ساعات العمل: " + QAWAID.workHours + "\n";
    md += "> المدة الافتراضية: " + SLA.dayWord(CONFIG.DEFAULT_SLA_DAYS) + "\n\n";

    App.state.departments.forEach(d => {
      const svcs = all().filter(s => s.department_id === d.id);
      if (!svcs.length) return;
      md += "\n## " + d.icon + " " + d.name + "\n\n" + (d.desc || "") + "\n\n";
      md += "| الخدمة | مدة الإنجاز | الفئة المستفيدة | قناة الطلب |\n|---|---|---|---|\n";
      svcs.forEach(s => {
        md += "| " + s.name + " | " + SLA.dayWord(s.sla_days) + " | " +
          (s.audience || []).join("، ") + " | " + s.channel + " |\n";
      });
      md += "\n<details><summary>المتطلبات ومسارات التنفيذ</summary>\n\n";
      svcs.forEach(s => {
        md += "**" + s.name + "** — " + SLA.dayWord(s.sla_days) + "\n\n";
        md += "- المتطلبات: " + (s.reqs || []).join("؛ ") + "\n";
        md += "- المسار: " + (s.flow || []).map((f, i) => (i + 1) + ") " + f).join(" ← ") + "\n";
        if (s.note) md += "- ملاحظة: " + s.note + "\n";
        md += "\n";
      });
      md += "</details>\n";
    });

    UI.download(md, "دليل_الخدمات.md", "text/markdown");
    UI.ok("تم تصدير دليل الخدمات.");
  }

  return { render, exportMd };
})();
