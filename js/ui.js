/* =============================================================
   أدوات الواجهة المشتركة — لا منطق عمل هنا، عرض فقط
   ============================================================= */

const UI = (() => {

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const esc = SLA.esc;
  const AR = SLA.AR;

  /* ---------- التنبيهات ---------- */
  function toast(msg, kind) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".3s"; }, 3400);
    setTimeout(() => el.remove(), 3800);
  }
  const ok = m => toast(m, "ok");
  const err = m => toast(m, "err");

  /* ---------- النافذة المنبثقة ---------- */
  let openModal = null;

  function modal(opts) {
    close();
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `
      <div class="modal ${opts.size || ""}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${opts.title}</h3>
          <button class="x" aria-label="إغلاق">×</button>
        </div>
        <div class="modal-body">${opts.body}</div>
        ${opts.foot ? `<div class="modal-foot">${opts.foot}</div>` : ""}
      </div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    openModal = ov;
    $(".x", ov).onclick = close;
    ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
    if (opts.onOpen) opts.onOpen(ov);
    return ov;
  }

  function close() {
    if (openModal) { openModal.remove(); openModal = null; document.body.style.overflow = ""; }
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  /* تأكيد بسيط */
  function confirmBox(title, text, onYes, yesLabel, danger) {
    modal({
      title, size: "narrow",
      body: `<p class="small">${text}</p>`,
      foot: `<button class="btn ${danger ? "danger" : ""}" id="cf-yes">${yesLabel || "تأكيد"}</button>
             <button class="btn ghost" id="cf-no">إلغاء</button>`,
      onOpen(ov) {
        $("#cf-yes", ov).onclick = () => { close(); onYes(); };
        $("#cf-no", ov).onclick = close;
      },
    });
  }

  /* ---------- حلقة النسبة المئوية ---------- */
  function ring(pct, label, sub, size) {
    const s = size || 96, r = (s / 2) - 8, c = 2 * Math.PI * r;
    const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    const col = SLA.slaColor(pct);
    return `
      <div class="ring">
        <div class="ring-wrap" style="width:${s}px;height:${s}px">
          <svg width="${s}" height="${s}">
            <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
            <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${col.color}" stroke-width="8"
              stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}"/>
          </svg>
          <div class="ring-val" style="color:${col.color}">
            ${pct == null ? "—" : SLA.pctText(pct)}
            ${sub ? `<small>${esc(sub)}</small>` : ""}
          </div>
        </div>
        ${label ? `<div class="ring-label"><b>${esc(label)}</b>${col.label}</div>` : ""}
      </div>`;
  }

  /* ---------- شريط نسبة ---------- */
  function barline(pct) {
    const col = SLA.slaColor(pct);
    const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    return `<div class="barline">
      <div class="bar"><i style="width:${v}%;background:${col.color}"></i></div>
      <span class="pv" style="color:${col.color}">${pct == null ? "—" : SLA.pctText(pct)}</span>
    </div>`;
  }

  /* ---------- بطاقة مؤشر ---------- */
  function stat(value, label, kind, hint) {
    return `<div class="stat ${kind || ""}">
      <b>${value}</b><span>${esc(label)}</span>
      ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}
    </div>`;
  }

  /* ---------- وسم الحالة ---------- */
  function statusTag(task, now) {
    const st = WF.STATUS[task.status] || { label: task.status, tag: "grey" };
    let html = `<span class="tag ${st.tag}">${esc(st.label)}</span>`;
    if (task.priority === "urgent" && SLA.isOpen(task)) html += ` <span class="tag urgent">عاجل</span>`;
    if (SLA.isLate(task, now) && !SLA.isDone(task)) {
      const d = SLA.daysLeft(task, now);
      html += ` <span class="tag danger">متأخرة ${AR(Math.abs(d))} يوم عمل</span>`;
    } else if (SLA.isDone(task) && SLA.isLate(task, now)) {
      html += ` <span class="tag danger">أُنجزت متأخرة</span>`;
    } else if (SLA.isDone(task)) {
      html += ` <span class="tag ok">في الموعد</span>`;
    } else if (!SLA.notStarted(task)) {
      const d = SLA.daysLeft(task, now);
      html += ` <span class="tag ${d <= 1 ? "warn" : "grey"}">${esc(SLA.relDays(d))}</span>`;
    }
    return html;
  }

  /* لون البطاقة حسب حالتها الزمنية */
  function taskClass(task, now) {
    if (SLA.isDead(task)) return "grey";
    if (SLA.isLate(task, now)) return "danger";
    if (SLA.isDone(task)) return "ok";
    const d = SLA.daysLeft(task, now);
    if (d != null && d <= 1) return "warn";
    return "";
  }

  /* ---------- خطوات المسار ---------- */
  function track(steps, kind, title, hint) {
    return `<div class="track">
      <div class="track-head ${kind}"><span class="dot"></span>${esc(title)}
        <span class="muted small" style="font-weight:400">— ${esc(hint)}</span></div>
      <div class="steps">
        ${steps.map(s => `
          <div class="step ${s.cls}">
            <div class="bub">${s.cls === "done" ? "✓" : s.cls === "bad" ? "!" : AR(s.n)}</div>
            <div class="lbl">${esc(s.label)}</div>
          </div>`).join("")}
      </div>
    </div>`;
  }

  /* ---------- حالة فارغة ---------- */
  const empty = (icon, text, sub) => `<div class="empty">
    <span class="big">${icon}</span>${esc(text)}
    ${sub ? `<div class="small" style="margin-top:6px">${esc(sub)}</div>` : ""}
  </div>`;

  /* ---------- تحميل الملفات إلى نص base64 ---------- */
  function readFiles(input) {
    const files = Array.prototype.slice.call(input.files || []);
    return Promise.all(files.map(f => new Promise((res, rej) => {
      if (f.size > 5 * 1024 * 1024) { rej(new Error(`الملف «${f.name}» أكبر من ٥ ميجابايت.`)); return; }
      const r = new FileReader();
      r.onload = () => res({ name: f.name, data: r.result, blob: f, size: f.size });
      r.onerror = () => rej(new Error("تعذّرت قراءة الملف " + f.name));
      r.readAsDataURL(f);
    })));
  }

  /* ---------- تنزيل ملف ---------- */
  function download(content, filename, mime) {
    const blob = content instanceof Blob ? content
      : new Blob(["﻿" + content], { type: (mime || "text/plain") + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- تصدير جدول إلى CSV ---------- */
  function toCSV(rows) {
    return rows.map(r => r.map(c => {
      const v = c == null ? "" : String(c);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(",")).join("\r\n");
  }

  return {
    $, $$, esc, AR, toast, ok, err, modal, close, confirmBox,
    ring, barline, stat, statusTag, taskClass, track, empty,
    readFiles, download, toCSV,
  };
})();
