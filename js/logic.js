/* ============================================================
   logic.js — нормализация, сходство слов, авто-категория,
   авто-сложность. Чистые функции, без DOM.
   ============================================================ */

/* --- Нормализация --- */

// Для поиска/сравнения: регистр не важен, ё = е, лишние пробелы убираем.
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

// Только регистр + ё (длина строки сохраняется) — для подсветки совпадений.
function fold(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е");
}

// Грубое «основание» слова: срезаем типичные русские окончания.
const ENDINGS = [
  "ения", "ание", "ость", "ости", "ающ", "яющ",
  "ами", "ями", "ого", "его", "ому", "ему", "ыми", "ими",
  "ах", "ях", "ам", "ям", "ом", "ем", "ой", "ей", "ов", "ев",
  "ий", "ый", "ой", "ая", "яя", "ое", "ее", "ые", "ие", "ую", "юю",
  "а", "я", "о", "е", "ы", "и", "у", "ю", "й", "ь", "ъ"
];

function stem(w) {
  w = normalize(w);
  if (w.length <= 4) return w;
  for (let pass = 0; pass < 2; pass++) {
    let cut = false;
    for (const suf of ENDINGS) {
      if (w.endsWith(suf) && w.length - suf.length >= 4) {
        w = w.slice(0, w.length - suf.length);
        cut = true;
        break;
      }
    }
    if (!cut) break;
  }
  return w;
}

/* --- Сходство написания --- */

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

function diceCoeff(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  A.forEach((cnt, g) => {
    if (B.has(g)) inter += Math.min(cnt, B.get(g));
  });
  return (2 * inter) / ((a.length - 1) + (b.length - 1));
}

function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Итоговое сходство написания: 0..1
function surfaceSimilarity(rawA, rawB) {
  const a = normalize(rawA), b = normalize(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const dice = diceCoeff(a, b);
  const pref = commonPrefixLen(a, b) / Math.max(a.length, b.length);
  const rootMatch = stem(a) === stem(b) ? 0.9 : 0;
  return Math.max(lev, dice, pref >= 0.4 ? pref * 0.95 : 0, rootMatch);
}

/* --- Авто-категория --- */

let _LEX_PREPARED = null;
function lexPrepared() {
  if (_LEX_PREPARED) return _LEX_PREPARED;
  _LEX_PREPARED = LEX_FLAT.map(e => ({
    ...e,
    norm: normalize(e.raw),
    st: stem(e.raw)
  }));
  return _LEX_PREPARED;
}

// Совпадение по «основаниям»: один префикс другого, длина общей части >= 4
function stemMatch(a, b) {
  if (!a || !b) return false;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return a === b;
  return a.startsWith(b) || b.startsWith(a) || a === b;
}

// Классификация одного слова -> { group, icon, sub } | FALLBACK_GROUP
function classifyWord(raw) {
  const w = normalize(raw);
  if (!w) return FALLBACK_GROUP;
  const lex = lexPrepared();

  // 1) точное совпадение всей фразы
  let hit = lex.find(e => e.norm === w);
  if (hit) return pick(hit);

  // 2) совпадение по частям фразы (для "быстрый завтрак" и т.п.)
  const parts = w.split(/[\s\-–]+/).filter(Boolean);
  for (const p of parts) {
    hit = lex.find(e => e.norm === p);
    if (hit) return pick(hit);
  }

  // 3) совпадение по основам — берём самое длинное (конкретное)
  let best = null;
  const targets = [stem(w), ...parts.map(stem)];
  for (const e of lex) {
    for (const t of targets) {
      if (stemMatch(t, e.st)) {
        if (!best || e.norm.length > best.norm.length) best = e;
        break;
      }
    }
  }
  if (best) return pick(best);

  return FALLBACK_GROUP;
}

function pick(e) {
  return { group: e.group, icon: e.icon, sub: e.sub };
}

/* --- Авто-сложность --- */

const DIFFICULTIES = [
  { id: 0, name: "Лёгкая",  short: "Лёгкая",  color: "#34d399" },
  { id: 1, name: "Средняя", short: "Средняя", color: "#fbbf24" },
  { id: 2, name: "Сложная", short: "Сложная", color: "#fb923c" },
  { id: 3, name: "Эксперт", short: "Эксперт", color: "#f87171" }
];

// Определяет, насколько пара похожа по смыслу и написанию.
// Чем похоже — тем сложнее шпиону. Возвращает { id, name, score, reason }.
function autoDifficulty(rawA, rawB) {
  const clsA = classifyWord(rawA);
  const clsB = classifyWord(rawB);
  const surf = surfaceSimilarity(rawA, rawB);

  let score, reason;
  const sameSub =
    clsA.sub !== FALLBACK_GROUP.sub && clsA.group === clsB.group && clsA.sub === clsB.sub;
  const sameGroup = clsA.group === clsB.group && clsA.group !== FALLBACK_GROUP.group;

  if (sameSub) {
    score = 0.78 + surf * 0.22;
    reason = `оба слова из «${clsA.sub}»`;
  } else if (sameGroup) {
    score = 0.55 + surf * 0.22;
    reason = `оба слова из группы «${clsA.group}»`;
  } else {
    score = surf * 0.9;
    reason = surf >= 0.55 ? "слова похожи по написанию" : "слова из разных тем";
  }

  score = Math.max(0, Math.min(1, score));
  const id = score >= 0.82 ? 3 : score >= 0.60 ? 2 : score >= 0.40 ? 1 : 0;
  return { id, name: DIFFICULTIES[id].name, score, reason, clsA, clsB };
}

// Авто-категория пары: точная если совпали, иначе категория первого,
// иначе второго, иначе «Разное».
function autoGroup(rawA, rawB) {
  const clsA = classifyWord(rawA);
  const clsB = classifyWord(rawB);
  if (clsA.group === clsB.group) return { ...clsA, sub: clsA.sub === clsB.sub ? clsA.sub : clsA.group };
  if (clsA.group !== FALLBACK_GROUP.group) return clsA;
  if (clsB.group !== FALLBACK_GROUP.group) return clsB;
  return FALLBACK_GROUP;
}

/* Списки для селектов */
function allGroups() {
  return [...LEXICON.map(g => ({ group: g.group, icon: g.icon })), { ...FALLBACK_GROUP }];
}
