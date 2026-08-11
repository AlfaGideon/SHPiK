/* ============================================================
   app.js — состояние, хранение (localStorage), рендер, события
   ============================================================ */

(function () {
  "use strict";

  const LS_KEY = "shpik_db_v1";

  /* ---------- состояние ---------- */

  let pairs = load();
  const ui = { groupBy: "group", diffFilter: "all", sort: "new", query: "", partial: true };

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch (e) { return []; }
  }
  let storageWarned = false;
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(pairs));
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        showError("Браузер блокирует localStorage: база работает только до перезагрузки страницы. Откройте приложение через веб-сервер, а не из просмотрщика файлов.");
      }
    }
  }

  // Немая ошибка недопустима: любая непойманная ошибка покажется баннером.
  function showError(msg) {
    let el = document.getElementById("errBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "errBanner";
      el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99;padding:10px 16px;background:#7f1d1d;color:#fecaca;font:13px/1.5 sans-serif;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)";
      document.body.appendChild(el);
    }
    el.textContent = "⚠️ " + msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 8000);
  }
  window.addEventListener("error", e => showError("Ошибка интерфейса: " + (e.message || "неизвестная")));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Ключ пары без учёта порядка слов и регистра — для дедупликации
  function pairKey(a, b) {
    const x = [normalize(a), normalize(b)].sort();
    return x[0] + "‖" + x[1];
  }

  /* ---------- DOM ---------- */

  const $ = id => document.getElementById(id);
  const wordA = $("wordA"), wordB = $("wordB");
  const autoGroupEl = $("autoGroup"), autoDiffEl = $("autoDiff");
  const groupSelect = $("groupSelect"), diffSelect = $("diffSelect");
  const searchInput = $("searchInput"), partialCheck = $("partialCheck");
  const searchResults = $("searchResults");
  const dbList = $("dbList");
  const toastWrap = $("toastWrap");

  /* ---------- утилиты ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function toast(msg, type = "ok") {
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = msg;
    toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  function diffBadge(d, auto) {
    const info = DIFFICULTIES[d] || DIFFICULTIES[0];
    return `<span class="chip chip-diff df${info.id}" title="Сложность: ${info.name}${auto ? " (авто)" : " (вручную)"}">${info.name}${auto ? "" : " ✎"}</span>`;
  }

  function groupChip(group, icon, sub, auto) {
    const label = sub && sub !== group && sub !== "без категории" ? `${group} · ${sub}` : group;
    return `<span class="chip chip-group" title="${esc(label)}${auto ? " (авто)" : " (вручную)"}">${icon || "🎲"} ${esc(label)}${auto ? "" : " ✎"}</span>`;
  }

  // Подсветка совпадения: индекс ищем в fold()-строке (длина сохраняется)
  function highlight(orig, query) {
    const folded = fold(orig);
    const q = fold(query);
    const idx = folded.indexOf(q);
    if (idx < 0 || !q) return esc(orig);
    return esc(orig.slice(0, idx)) + "<mark>" + esc(orig.substr(idx, q.length)) + "</mark>" + esc(orig.slice(idx + q.length));
  }

  function wordMatches(word, q, partial) {
    const w = fold(word), f = fold(q);
    if (!w || !f) return false;
    if (partial) return w.includes(f);
    return w === f || w.split(/[\s\-–]+/).includes(f);
  }

  /* ---------- авто-превью в форме добавления ---------- */

  function currentAuto(a, b) {
    const diff = autoDifficulty(a, b);
    const grp = autoGroup(a, b);
    return { diff, grp };
  }

  function fillGroupSelect(sel, autoLabel, selected) {
    sel.innerHTML =
      `<option value="auto">Авто${autoLabel ? ": " + esc(autoLabel) : ""}</option>` +
      allGroups().map(g =>
        `<option value="${esc(g.group)}" ${selected === g.group ? "selected" : ""}>${g.icon} ${esc(g.group)}</option>`
      ).join("");
  }

  function fillDiffSelect(sel, autoLabel, selected) {
    sel.innerHTML =
      `<option value="auto">Авто${autoLabel ? ": " + esc(autoLabel) : ""}</option>` +
      DIFFICULTIES.map(d =>
        `<option value="${d.id}" ${String(selected) === String(d.id) ? "selected" : ""}>${d.name}</option>`
      ).join("");
  }

  function refreshAutoPreview() {
    const a = wordA.value.trim(), b = wordB.value.trim();
    if (!a || !b) {
      autoGroupEl.textContent = "—";
      autoGroupEl.className = "chip chip-group";
      autoDiffEl.textContent = "—";
      autoDiffEl.className = "chip";
      fillGroupSelect(groupSelect, wordA.value || wordB.value ? "введите оба слова" : "");
      fillDiffSelect(diffSelect, "");
      return;
    }
    const { diff, grp } = currentAuto(a, b);
    autoGroupEl.textContent = `${grp.icon} ${grp.group}${grp.sub !== grp.group && grp.sub !== "без категории" ? " · " + grp.sub : ""}`;
    autoGroupEl.className = "chip chip-group";
    autoDiffEl.textContent = `${diff.name} (${Math.round(diff.score * 100)}%)`;
    autoDiffEl.className = `chip chip-diff df${diff.id}`;
    autoDiffEl.title = diff.reason;
    const gsel = groupSelect.value, dsel = diffSelect.value;
    fillGroupSelect(groupSelect, grp.group, gsel === "auto" ? null : gsel);
    fillDiffSelect(diffSelect, diff.name, dsel === "auto" ? null : dsel);
  }

  /* ---------- добавление ---------- */

  function addPair() {
    const a = wordA.value.trim(), b = wordB.value.trim();
    if (!a || !b) { toast("Введите оба слова", "warn"); return; }
    if (normalize(a) === normalize(b)) { toast("Слова не должны совпадать", "warn"); return; }

    const key = pairKey(a, b);
    if (pairs.some(p => pairKey(p.a, p.b) === key)) {
      toast("Такая пара уже есть в базе", "warn");
      return;
    }

    const { diff, grp } = currentAuto(a, b);
    const manualGroup = groupSelect.value !== "auto";
    const manualDiff = diffSelect.value !== "auto";

    const gObj = manualGroup
      ? { ...allGroups().find(g => g.group === groupSelect.value), sub: groupSelect.value }
      : grp;

    pairs.unshift({
      id: uid(),
      a, b,
      group: gObj.group,
      icon: gObj.icon || "🎲",
      sub: gObj.sub || "без категории",
      difficulty: manualDiff ? Number(diffSelect.value) : diff.id,
      auto: !(manualGroup || manualDiff),
      createdAt: Date.now()
    });
    save();
    wordA.value = ""; wordB.value = "";
    groupSelect.value = "auto"; diffSelect.value = "auto";
    refreshAutoPreview();
    renderAll();
    toast(`Добавлено: ${a} ⇄ ${b}`);
    wordA.focus();
  }

  /* ---------- удаление / редактирование ---------- */

  function removePair(id, btn) {
    if (!btn.dataset.confirm) {
      btn.dataset.confirm = "1";
      btn.classList.add("danger-confirm");
      const old = btn.textContent;
      btn.textContent = "Удалить?";
      setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = old; btn.classList.remove("danger-confirm"); }, 2500);
      return;
    }
    pairs = pairs.filter(p => p.id !== id);
    save();
    renderAll();
    toast("Пара удалена", "warn");
  }

  let editingId = null;
  const editModal = $("editModal");
  const editA = $("editA"), editB = $("editB");
  const editGroupSelect = $("editGroupSelect"), editDiffSelect = $("editDiffSelect");

  function openEdit(id) {
    const p = pairs.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    editA.value = p.a; editB.value = p.b;
    fillGroupSelect(editGroupSelect, autoGroup(p.a, p.b).group, p.auto ? "auto" : p.group);
    fillDiffSelect(editDiffSelect, autoDifficulty(p.a, p.b).name, p.auto ? "auto" : p.difficulty);
    editModal.hidden = false;
    editA.focus();
  }

  function saveEdit() {
    const p = pairs.find(x => x.id === editingId);
    if (!p) return closeEdit();
    const a = editA.value.trim(), b = editB.value.trim();
    if (!a || !b) { toast("Оба слова обязательны", "warn"); return; }
    if (normalize(a) === normalize(b)) { toast("Слова не должны совпадать", "warn"); return; }
    const key = pairKey(a, b);
    if (pairs.some(x => x.id !== p.id && pairKey(x.a, x.b) === key)) {
      toast("Другая такая пара уже существует", "warn");
      return;
    }
    const { diff, grp } = currentAuto(a, b);
    const manualGroup = editGroupSelect.value !== "auto";
    const manualDiff = editDiffSelect.value !== "auto";
    const gObj = manualGroup
      ? { ...allGroups().find(g => g.group === editGroupSelect.value), sub: editGroupSelect.value }
      : grp;

    p.a = a; p.b = b;
    p.group = gObj.group; p.icon = gObj.icon || "🎲"; p.sub = gObj.sub || "без категории";
    p.difficulty = manualDiff ? Number(editDiffSelect.value) : diff.id;
    p.auto = !(manualGroup || manualDiff);
    save(); closeEdit(); renderAll();
    toast("Сохранено");
  }

  function closeEdit() { editModal.hidden = true; editingId = null; }

  /* ---------- сортировка и фильтры ---------- */

  function sortPairs(list) {
    const arr = [...list];
    switch (ui.sort) {
      case "old":  arr.sort((x, y) => x.createdAt - y.createdAt); break;
      case "alpha": arr.sort((x, y) => normalize(x.a).localeCompare(normalize(y.a), "ru")); break;
      case "diff": arr.sort((x, y) => y.difficulty - x.difficulty || x.createdAt - y.createdAt); break;
      default:     arr.sort((x, y) => y.createdAt - x.createdAt);
    }
    return arr;
  }

  function filterDiff(list) {
    if (ui.diffFilter === "all") return list;
    return list.filter(p => p.difficulty === Number(ui.diffFilter));
  }

  /* ---------- рендер статистики ---------- */

  function renderStats() {
    $("statTotal").textContent = pairs.length;
    $("statGroups").textContent = new Set(pairs.map(p => p.group)).size;
    $("statHard").textContent = pairs.filter(p => p.difficulty >= 2).length;
  }

  /* ---------- рендер поиска ---------- */

  function renderSearch() {
    const q = ui.query.trim();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ""; return; }

    const matches = pairs.filter(p =>
      wordMatches(p.a, q, ui.partial) || wordMatches(p.b, q, ui.partial)
    );

    // все «комбинации»: уникальные слова-партнёры
    const partners = [];
    const seen = new Set();
    matches.forEach(p => {
      const other = wordMatches(p.a, q, ui.partial) ? p.b : p.a;
      const k = normalize(other);
      if (!seen.has(k)) { seen.add(k); partners.push(other); }
    });

    let html = `<div class="sr-head">Найдено <b>${matches.length}</b> ${plural(matches.length, "пара", "пары", "пар")} со словом «${esc(q)}»</div>`;

    if (matches.length === 0) {
      html += `<div class="empty">😕 Ничего не найдено. Добавьте пару с этим словом через форму слева.</div>`;
    } else {
      if (partners.length) {
        html += `<div class="sr-chips">` + partners.map(w =>
          `<button class="chip chip-partner" data-partner="${esc(w)}" title="Искать это слово">⇄ ${esc(w)}</button>`
        ).join("") + `</div>`;
      }
      html += `<div class="sr-list">` + sortPairs(matches).map(p => {
        const ha = wordMatches(p.a, q, ui.partial) ? highlight(p.a, q) : esc(p.a);
        const hb = wordMatches(p.b, q, ui.partial) ? highlight(p.b, q) : esc(p.b);
        return `<div class="sr-item">
          <span class="sr-words">${ha} <i>⇄</i> ${hb}</span>
          ${groupChip(p.group, p.icon, p.sub, p.auto)}
          ${diffBadge(p.difficulty, p.auto)}
        </div>`;
      }).join("") + `</div>`;
    }

    searchResults.innerHTML = html;
    searchResults.hidden = false;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* ---------- рендер базы ---------- */

  function pairCard(p) {
    return `<div class="pair-card" data-id="${p.id}">
      <div class="pair-main">
        <span class="pair-words">${esc(p.a)} <i>⇄</i> ${esc(p.b)}</span>
        <span class="pair-badges">
          ${groupChip(p.group, p.icon, p.sub, p.auto)}
          ${diffBadge(p.difficulty, p.auto)}
        </span>
      </div>
      <div class="pair-actions">
        <button class="icon-btn btn-edit" data-id="${p.id}" title="Редактировать">✏️</button>
        <button class="icon-btn btn-del" data-id="${p.id}" title="Удалить">🗑</button>
      </div>
    </div>`;
  }

  function renderDb() {
    const list = filterDiff(sortPairs(pairs));

    if (!pairs.length) {
      dbList.innerHTML = `<div class="empty big-empty">
        <div class="empty-art">🕵️‍♂️📒</div>
        <b>База пустая</b><br>
        Добавьте первую пару слов — интерфейс сам определит её категорию и сложность.
      </div>`;
      return;
    }
    if (!list.length) {
      dbList.innerHTML = `<div class="empty">Нет пар с выбранной сложностью.</div>`;
      return;
    }

    if (ui.groupBy === "flat") {
      dbList.innerHTML = `<div class="group-block open"><div class="group-items">${list.map(pairCard).join("")}</div></div>`;
      return;
    }

    const buckets = new Map();
    list.forEach(p => {
      const key = ui.groupBy === "group" ? `${p.icon}|${p.group}` : `df${p.difficulty}|${DIFFICULTIES[p.difficulty].name}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    const sortedKeys = [...buckets.keys()].sort((a, b) => {
      if (ui.groupBy === "difficulty") return Number(b[2]) - Number(a[2]);
      return buckets.get(b).length - buckets.get(a).length;
    });

    dbList.innerHTML = sortedKeys.map(key => {
      const [icon, ...rest] = key.split("|");
      const title = rest.join("|");
      const items = buckets.get(key);
      const realIcon = ui.groupBy === "difficulty" ? ["🟢", "🟡", "🟠", "🔴"][Number(icon[2])] : icon;
      return `<div class="group-block open">
        <button class="group-head" data-toggle>
          <span class="caret">▾</span>
          <span class="group-title">${realIcon} ${esc(title)}</span>
          <span class="group-count">${items.length}</span>
        </button>
        <div class="group-items">${items.map(pairCard).join("")}</div>
      </div>`;
    }).join("");
  }

  function renderAll() {
    renderStats();
    renderSearch();
    renderDb();
  }

  /* ---------- экспорт / импорт ---------- */

  function exportJson() {
    const blob = new Blob([JSON.stringify(pairs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shpik_pairs.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("База выгружена в JSON");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("not array");
        let added = 0, skipped = 0;
        const keys = new Set(pairs.map(p => pairKey(p.a, p.b)));
        data.forEach(row => {
          if (!row || typeof row.a !== "string" || typeof row.b !== "string") { skipped++; return; }
          const a = row.a.trim(), b = row.b.trim();
          if (!a || !b || normalize(a) === normalize(b)) { skipped++; return; }
          const key = pairKey(a, b);
          if (keys.has(key)) { skipped++; return; }
          keys.add(key);
          const { diff, grp } = currentAuto(a, b);
          pairs.push({
            id: uid(), a, b,
            group: row.group || grp.group,
            icon: row.icon || grp.icon || "🎲",
            sub: row.sub || grp.sub || "без категории",
            difficulty: Number.isInteger(row.difficulty) ? Math.min(3, Math.max(0, row.difficulty)) : diff.id,
            auto: typeof row.auto === "boolean" ? row.auto : !(row.group || Number.isInteger(row.difficulty)),
            createdAt: row.createdAt || Date.now()
          });
          added++;
        });
        save(); renderAll();
        toast(`Импортировано: ${added} новых пар${skipped ? `, пропущено: ${skipped}` : ""}`);
      } catch (e) {
        toast("Не удалось прочитать файл — нужен JSON из экспорта", "err");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- случайная пара ---------- */

  const randomModal = $("randomModal");
  function showRandom() {
    if (!pairs.length) { toast("База пуста — сначала добавьте пары", "warn"); return; }
    const p = pairs[Math.floor(Math.random() * pairs.length)];
    $("randomContent").innerHTML = `
      <div class="random-words">${esc(p.a)} <i>⇄</i> ${esc(p.b)}</div>
      <div class="random-meta">${groupChip(p.group, p.icon, p.sub, p.auto)} ${diffBadge(p.difficulty, p.auto)}</div>`;
    randomModal.hidden = false;
  }

  /* ---------- события ---------- */

  $("btnAdd").addEventListener("click", addPair);
  [wordA, wordB].forEach(inp => {
    inp.addEventListener("input", refreshAutoPreview);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") addPair(); });
  });

  searchInput.addEventListener("input", () => { ui.query = searchInput.value; renderSearch(); });
  partialCheck.addEventListener("change", () => { ui.partial = partialCheck.checked; renderSearch(); });
  $("btnClearSearch").addEventListener("click", () => { searchInput.value = ""; ui.query = ""; renderSearch(); searchInput.focus(); });

  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement !== searchInput && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault(); searchInput.focus();
    }
    if (e.key === "Escape") { closeEdit(); randomModal.hidden = true; }
  });

  $("groupBySeg").addEventListener("click", e => {
    const btn = e.target.closest("button[data-gb]");
    if (!btn) return;
    ui.groupBy = btn.dataset.gb;
    document.querySelectorAll("#groupBySeg button").forEach(b => b.classList.toggle("active", b === btn));
    renderDb();
  });

  $("diffFilter").addEventListener("click", e => {
    const btn = e.target.closest("button[data-df]");
    if (!btn) return;
    ui.diffFilter = btn.dataset.df;
    document.querySelectorAll("#diffFilter button").forEach(b => b.classList.toggle("active", b === btn));
    renderDb();
  });

  $("sortSelect").addEventListener("change", e => { ui.sort = e.target.value; renderDb(); });

  dbList.addEventListener("click", e => {
    const head = e.target.closest(".group-head");
    if (head) { head.closest(".group-block").classList.toggle("open"); return; }
    const del = e.target.closest(".btn-del");
    if (del) { removePair(del.dataset.id, del); return; }
    const edit = e.target.closest(".btn-edit");
    if (edit) { openEdit(edit.dataset.id); return; }
  });

  searchResults.addEventListener("click", e => {
    const chip = e.target.closest("[data-partner]");
    if (chip) { searchInput.value = chip.dataset.partner; ui.query = chip.dataset.partner; renderSearch(); }
  });

  $("btnExport").addEventListener("click", exportJson);
  $("btnImport").addEventListener("click", () => $("fileImport").click());
  $("fileImport").addEventListener("change", e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });

  $("btnEditCancel").addEventListener("click", closeEdit);
  $("btnEditSave").addEventListener("click", saveEdit);
  [editA, editB].forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") saveEdit(); }));
  editModal.addEventListener("click", e => { if (e.target === editModal) closeEdit(); });

  $("btnRandom").addEventListener("click", showRandom);
  $("btnRandomAgain").addEventListener("click", showRandom);
  $("btnRandomClose").addEventListener("click", () => randomModal.hidden = true);
  randomModal.addEventListener("click", e => { if (e.target === randomModal) randomModal.hidden = true; });

  /* ---------- init ---------- */
  refreshAutoPreview();
  renderAll();
})();
