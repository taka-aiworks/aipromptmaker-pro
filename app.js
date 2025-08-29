/* =========================
   AI Prompt Maker – app.js
   （分割版 / 軽量化込み）
   ========================= */




/* ================== DEBUG SHIM (single source of truth) ==================
 * 使い方:
 *   - window.DEBUG_PROMPT_LOG = true/false で全体のON/OFF
 *   - _dbg(label, value, channel?) で値をログしつつそのまま返す（パイプ的に使える）
 *   - _diff(before, after) で配列差分 {added, removed}
 *   - ログ例: [DBG][PROMPT-LEARN] after applyWearColorPipeline {"added":[...], ...}
 * 置き場所: ファイルの一番上（他の関数より前）
 * 削除: このブロックをまるごと消す or DEBUG_PROMPT_LOG=false
 * ======================================================================= */ƒ
(function(){
  // 全体トグル
  window.DEBUG_PROMPT_LOG = (typeof window.DEBUG_PROMPT_LOG === 'boolean') ? window.DEBUG_PROMPT_LOG : false;

  // 安全JSON化（関数・undefined・循環参照に対応）
  function safeStringify(v){
    try{
      const seen = new WeakSet();
      return JSON.stringify(v, (k, val) => {
        if (typeof val === 'function')   return `[Function ${val.name||'anon'}]`;
        if (typeof val === 'undefined')  return '[undefined]';
        if (typeof val === 'object' && val !== null){
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      });
    }catch(e){
      try { return String(v); } catch { return '[Unserializable]'; }
    }
  }

  // ロガー（上書き・統一）
  window._dbg = function(label, value, channel='PROMPT'){
    try{
      if (!window.DEBUG_PROMPT_LOG) return value;
      const s = safeStringify(value);
      // console.log を使うことで devtools の詳細レベルに左右されにくくする
      console.log('[DBG]['+channel+']', label, s);
    }catch(_){}
    return value;
  };

  // 差分（配列想定）
  window._diff = function(before, after){
    const b = new Set(before || []);
    const a = new Set(after  || []);
    return {
      added:  (after  || []).filter(x => !b.has(x)),
      removed:(before || []).filter(x => !a.has(x)),
    };
  };

  // パイプ用タップ（副作用ログして値を返す）
  window._tap = function(value, label='tap', channel='PROMPT'){
    return window._dbg(label, value, channel);
  };

  // 起動Ping
  try { console.log('[DBG] shim ready'); } catch(_){}
})();




/* ======================= DBG: pipeline tap (背景刈り取り追跡) ======================= */
(function(){
  const TAG = '[DBG][BGTRACE]';
  window.DEBUG_BGTRACE = true;   // ← オン/オフ

  const log = (...a)=> { if (window.DEBUG_BGTRACE) console.log(TAG, ...a); };

  // --- ユーティリティ ---
  const clone = a => Array.isArray(a) ? a.slice() : a;
  const hasBgLike = arr => (arr||[]).some(t => /\b(background|studio|lab|classroom|beach|forest|street|sky|room|office|cafe|park|city|town|mountain|sea|ocean|lake|river|desert|temple)\b/i.test(String(t||"")));
  const hasLiteralBackground = arr => (arr||[]).some(t => String(t||"").trim().toLowerCase()==='background');

  // --- ラップ処理（before/afterを丸ごと出す） ---
  function wrapFn(obj, name){
    if (!obj || typeof obj[name] !== 'function') return;
    if (obj[name].__wrapped) return; // 二重ラップ防止
    const orig = obj[name];
    obj[name] = function(...args){
      const before = clone(args[0]);
      const out = orig.apply(this, args);
      const after = clone(out);
      const info = {
        fn: name,
        before_len: (before||[]).length,
        after_len: (after||[]).length,
        before_bgLike: hasBgLike(before),
        after_bgLike: hasBgLike(after),
        before_hasLiteralBackground: hasLiteralBackground(before),
        after_hasLiteralBackground: hasLiteralBackground(after),
      };
      // 背景が消えた/増えた/リテラルbackgroundが混入 などの兆候を強調
      if (info.before_bgLike && !info.after_bgLike) log('⚠️ BG DROPPED', info, {before, after});
      else if (!info.before_bgLike && info.after_bgLike) log('🆙 BG ADDED', info, {before, after});
      else if (info.after_hasLiteralBackground) log('⚠️ LITERAL "background" FOUND', info, {after});
      else log('pass', info);
      return out;
    };
    obj[name].__wrapped = true;
    log('wrap:', name);
  }

  // グローバル関数を順に監視ラップ
  wrapFn(window, 'finalizePromptArray');
  wrapFn(window, 'enforceSingletonByCategory');
  wrapFn(window, 'ensurePromptOrder');
  wrapFn(window, 'ensurePromptOrderLocal');
  wrapFn(window, 'enforceHeadOrder');
  wrapFn(window, 'fixExclusives');
  wrapFn(window, 'unifyLightingOnce');
  wrapFn(window, 'stripSeparatesWhenDressPresent');
  wrapFn(window, 'dropColorizedShoesUnlessUserSelected');
  wrapFn(window, 'dedupeStable');

  // 呼び出し点でもログ（撮影/学習ビルダー）
  const tapBuilder = (name, fnName) => {
    if (typeof window[fnName] !== 'function' || window[fnName].__tapped) return;
    const orig = window[fnName];
    window[fnName] = function(...args){
      log(`>>> ENTER ${name}`);
      const out = orig.apply(this, args);
      try {
        const arrs = Array.isArray(out) ? out : [];
        const first = arrs[0] || {};
        log(`<<< EXIT  ${name}`, {
          seed:first.seed, hasBgLike: hasBgLike(first.pos), pos:first.pos
        });
      } catch(e){ /* no-op */ }
      return out;
    };
    window[fnName].__tapped = true;
    log('tap builder:', fnName);
  };

  tapBuilder('pmBuildOne', 'pmBuildOne');
  tapBuilder('buildBatchLearning', 'buildBatchLearning');
  tapBuilder('buildBatchProduction', 'buildBatchProduction');

  // もし finalizer が読み込まれていない場合の警告
  if (typeof window.finalizePromptArray !== 'function'){
    log('⚠️ finalizePromptArray not found at load time');
  } else {
    log('shim ready');
  }
})();













// DOMに出ている「服の候補」から辞書配列を復元して公開
// ① 関数化
window.refreshOutfitDict = function refreshOutfitDict(){
  const byId = {
    top:    '#outfit_top [data-en], #outfit_top [value], #outfit_top button, #outfit_top .scroller-item',
    pants:  '#outfit_pants [data-en], #outfit_pants [value], #outfit_pants button, #outfit_pants .scroller-item',
    skirt:  '#outfit_skirt [data-en], #outfit_skirt [value], #outfit_skirt button, #outfit_skirt .scroller-item',
    dress:  '#outfit_dress [data-en], #outfit_dress [value], #outfit_dress button, #outfit_dress .scroller-item',
    shoes:  '#outfit_shoes [data-en], #outfit_shoes [value], #outfit_shoes button, #outfit_shoes .scroller-item',
  };
  const pickTag = (el) =>
    (el.dataset?.en || el.dataset?.tag || el.getAttribute?.('value') || el.textContent || '')
    .trim().toLowerCase().replace(/\s+/g,' ');

  const dict = [];
  for (const [cat, sel] of Object.entries(byId)) {
    document.querySelectorAll(sel).forEach(el => {
      const tag = pickTag(el);
      if (!tag || /[\u3040-\u30ff\u4e00-\u9faf]/.test(tag)) return;
      dict.push({ tag, cat });
    });
  }
  const seen = new Set();
  const dedup = dict.filter(e => { const k = e.cat+'|'+e.tag; if (seen.has(k)) return false; seen.add(k); return true; });

  window.__OUTFIT_DICT__ = dedup;
  window.__OUTFIT_SRC = dedup;           // ← ensureCatalog が拾えるようにスナップショットも更新
  console.log('[DOM→DICT] count =', dedup.length, dedup.slice(0,10));
};

(function patchMakeFinal(){
  const orig = window.makeFinalOutfitTags;
  if (typeof orig !== 'function') return console.warn('makeFinalOutfitTags not found');

  window.makeFinalOutfitTags = function(selectedOutfits, colorTags){
    // ここで辞書ソースを差し替え（SFW.outfit → __OUTFIT_DICT__ フォールバック）
    const sel = Array.isArray(selectedOutfits) ? selectedOutfits.filter(Boolean) : [];
    const colors = Object.assign({ top:"", bottom:"", shoes:"" }, (colorTags||{}));

    // 1) 優先は SFW.outfit、無ければ 2) __OUTFIT_DICT__、どちらも無ければ []。
    const dict = (window.SFW?.outfit && Array.isArray(window.SFW.outfit))
      ? window.SFW.outfit
      : (Array.isArray(window.__OUTFIT_DICT__) ? window.__OUTFIT_DICT__ : []);

    const catMap = new Map();
    for (const e of dict) if (e && e.tag && e.cat)
      catMap.set(String(e.tag).toLowerCase(), String(e.cat).toLowerCase());

    const guessCat = (tag) => {
      const k = String(tag||"").toLowerCase();
      if (catMap.has(k)) return catMap.get(k);
      if (/(dress|kimono|yukata|cheongsam|hanbok|sari|uniform|gown)$/.test(k)) return "dress";
      if (/skirt$/.test(k)) return "skirt";
      if (/(jeans|pants|trousers|shorts|overalls|hakama)$/.test(k)) return "pants";
      if (/(boots|sneakers|loafers|mary janes|socks)$/.test(k)) return "shoes";
      return "top";
    };

    // 以降は元のロジックを使うため、catだけ差し替える
    // 手っ取り早く：元関数に渡す前に window.SFW を“見えるよう”に偽装する作戦も可
    const _SFW = window.SFW;
    try {
      // 一時SFWを置いて元の実装を有効化
      window.SFW = Object.assign({}, _SFW, { outfit: dict });
      return orig.call(this, sel, colors);
    } finally {
      window.SFW = _SFW;
    }
  };

  console.log('[patch] makeFinalOutfitTags uses __OUTFIT_DICT__ fallback');
})();


function getColorTagsFromUI(){
  const onepiece = document.querySelector('input[name="outfitMode"]:checked')?.value === 'onepiece';
  const topOn    = document.querySelector('#use_top')?.checked;
  const bottomOn = document.querySelector('#useBottomColor')?.checked && !onepiece;
  const shoesOn  = document.querySelector('#use_shoes')?.checked;

  const tag = sel => {
    const t = document.querySelector(sel)?.textContent?.trim() || '';
    return (t === '—') ? '' : t; // 未操作は空
  };

  return {
    top:    topOn    ? tag('#tag_top')    : '',
    bottom: bottomOn ? tag('#tag_bottom') : '',
    shoes:  shoesOn  ? tag('#tag_shoes')  : ''
  };
}

(function patchMakeFinal(){
  const orig = window.makeFinalOutfitTags;
  if (typeof orig !== 'function') { console.warn('makeFinalOutfitTags not found'); return; }

  window.makeFinalOutfitTags = function(selectedOutfits, colorTags){
    const hasColors = !!(colorTags && (colorTags.top || colorTags.bottom || colorTags.shoes));
    const colors = hasColors ? colorTags : getColorTagsFromUI(); // ←ここが肝
    return orig.call(this, selectedOutfits, colors);
  };
  console.log('[patch] makeFinalOutfitTags now falls back to UI colors');
})();

















/* ===== Tag Dictionary Bootstrap (SFW/NSFW) ===== */
window.TAGMAP = {
  en: new Map(),      // "plain background" -> "plain background"
  ja2tag: new Map(),  // "白背景" -> "plain background"
  label2tag: new Map(), // "white background" (UI label) -> "plain background"
  id2tag: new Map()   // "pl_bg:white_background" 等 -> "plain background"
};

async function initTagDictionaries(){
  async function safeLoad(url){
    try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json(); }
    catch(_){ return null; }
  }
  const [sfw, nsfw] = await Promise.all([
    safeLoad('dict/default_sfw.json'), safeLoad('dict/default_nsfw.json')
  ]);

  function addAll(obj, nsKey){
    if (!obj) return;
    // 形状差分に耐える：{SFW:{categories:{...}}} / {categories:{...}}
    const root = obj[nsKey]?.categories || obj.categories || {};
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(addItem);
      else if (v && typeof v==='object') Object.values(v).forEach(walk);
    };
    function addItem(it){
      if (!it || typeof it!=='object') return;
      const tag = String(it.tag||"").trim();
      if (!tag) return;
      const ja = String(it.ja || it.label || "").trim();
      const id = String(it.id || it.key || "").trim();
      const label = String(it.label || "").trim();

      window.TAGMAP.en.set(tag.toLowerCase(), tag);
      if (ja)    window.TAGMAP.ja2tag.set(ja, tag);
      if (label) window.TAGMAP.label2tag.set(label, tag);
      if (id)    window.TAGMAP.id2tag.set(id, tag);
    }
    walk(root);
  }
  addAll(sfw, 'SFW');
  addAll(nsfw, 'NSFW');
}


/* ========= ユーティリティ & 状態 ========= */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const toast = (msg) => {
  const t = $("#toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1500);
};

function dl(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
const uniq = (a) => [...new Set(a.filter(Boolean))];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function nowStamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
}
function seedFromName(nm, extra = 0) {
  if (!nm) return Math.floor(Math.random() * 1e9);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < nm.length; i++) { h ^= nm.charCodeAt(i); h = (h >>> 0) * 16777619 >>> 0; }
  if (extra) h = (h + (extra * 2654435761 >>> 0)) >>> 0;
  return h >>> 0;
}

// 候補が空なら全出し、配列があればそのタグだけに絞る
const byScope = (items, allowList) =>
  Array.isArray(allowList) && allowList.length
    ? items.filter(x => allowList.includes(x.tag))
    : items;


// --- BF系（age/gender/…）の取得：ラジオ優先＋datasetフォールバック
function getBFValue(name){
  // name: "age" | "gender" | "body" | "height" | "person" | "world" | "tone"
  const sel = document.querySelector(`input[name="bf_${name}"]:checked`);
  if (sel && sel.value) return sel.value;

  // UIが無い/未レンダ時は dataset を見る（applyCharacterPreset が書き込む）
  const host = document.body || document.documentElement;
  const key  = `bf${name[0].toUpperCase()}${name.slice(1)}`; // bfAge, bfGender, ...
  return (host?.dataset?.[key] || "").trim();
}

// --- 学習モード専用: 性別から 1girl / 1boy を決める ---
function getGenderCountTag() {
  const g = document.querySelector('input[name="bf_gender"]:checked')?.value?.toLowerCase() || "";
  if (!g) return ""; // 未選択なら何もしない
  // 候補語にゆるくマッチ
  if (/\b(female|girl|woman|feminine|女子|女性)\b/.test(g)) return "1girl";
  if (/\b(male|boy|man|masculine|男子|男性)\b/.test(g))     return "1boy";
  return ""; // 中立系（androgynous 等）は solo のみで制御
}

/* ============================================================================
 * enforceHeadOrder（人数/群衆トークンを整理）
 * - 先頭に必ず solo, その後に 1girl/1boy（getGenderCountTag）
 * - その他の人数/群衆系は全削除
 * - normalizeTag で比較
 * ========================================================================== */
function enforceHeadOrder(parts){
  const norm = t => (typeof normalizeTag==='function') ? normalizeTag(String(t||"")) : String(t||"").trim().toLowerCase();
  const solo = "solo";
  const want = (typeof getGenderCountTag === "function" ? norm(getGenderCountTag() || "") : "");

  // JSON定義から人数系を集める（なければ固定正規表現）
  const dictCounts = (window.SFW?.person_count || []).map(x => norm(x.tag || x));
  const COUNT_RE = /\b(?:\d+\s*(girls?|boys?)|[23]\s*girls?|[23]\s*boys?|two people|three people|duo|trio|multiple people|group|crowd|background people|bystanders|another person)\b/i;

  const seen = new Set();
  const rest = [];

  for (const raw of (parts||[])){
    const t = norm(raw);
    if (!t) continue;
    if (t === solo || t === want) continue;     // 先頭に回すのでスキップ
    if (dictCounts.includes(t) || COUNT_RE.test(t)) continue; // 人数系は弾く
    if (!seen.has(t)) {
      seen.add(t);
      rest.push(raw); // rawを残してオリジナルの大文字小文字も維持
    }
  }

  const head = [solo];
  if (want) head.push(want);

  return [...head, ...rest];
}

// どのモードでも共通で使う最小強力セット（≈28語）
const NEG_TIGHT = [
  // 人物の混入（背景・反射・看板由来も含む）
  "multiple people","group","crowd","background people","bystanders","another person",
  "photobomb","reflection","mirror","poster","billboard","tv screen",

  // 手・四肢の破綻
  "bad hands","bad anatomy","extra fingers","extra arms","extra legs",
  "fused fingers","malformed hands","long fingers",

  // 画質・文字
  "lowres","blurry","low quality","worst quality","jpeg artifacts",
  "text","watermark","logo"
];

// ネガティブを組み立てる共通関数
function buildNegative(baseText = "", useDefault = true) {
  // デフォルト（固定のネガティブリスト）を配列化
  const base = useDefault ? [...NEG_TIGHT] : [];

  // ユーザー入力を配列化
  const custom = baseText
    ? baseText.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  // デフォルト＋ユーザー入力を結合して重複排除
  return Array.from(new Set([...base, ...custom])).join(", ");
}




// 背景が人混みに寄りやすいタグ → “無人化”の弱い補正を足す
const MULTI_RISK_BG = new Set([
  "festival stalls","shrine festival","street at night","classroom",
  "train platform","beach","rooftop","library","caf\u00e9","snowy town",
]);

// 先頭に必ず入れるべきタグ
const SOLO_POS = ["solo", "1girl", "1boy"];

function forceSoloPos(parts){
  // ソロ系の明示タグを必ず入れる
  const s = new Set(parts.filter(Boolean));
  SOLO_POS.forEach(t => s.add(t));
  // 背景が “人を呼ぶ” ときは「no crowd/empty background」を添える
  for (const t of parts) {
    if (MULTI_RISK_BG.has(String(t))) {
      s.add("no crowd");
      s.add("empty background");
      break;
    }
  }
  return [...s];
}

// ネガに複数人ブロックを必ず混ぜる
function withSoloNeg(neg){
    return buildNegative(neg);
}

// 複数人を示唆しがちな語を“念のため”落とす（プロンプト側）
const MULTI_HINT_RE = /\b(duo|trio|group|crowd|pair|couple|twins?|roommates|bandmates|classmates|teammates|mentor and pupil|master and servant|idol and fan|two people|three people|multiple people)\b/i;
function stripMultiHints(parts){
  return parts.filter(t => !MULTI_HINT_RE.test(String(t)));
}

/* ===== JSONベース：カテゴリ単一化の基盤 ===== */
const SINGLETON_CATS = [
  'background',
  'pose',
  'composition',
  'view',
  'expression',   // ← JSONは単数
  'lighting'
];

// 足りないときに自動補完する既定（好みで調整OK）
const CAT_DEFAULTS = {
  background:  'plain background',
  pose:        'standing',
  composition: 'upper body',
  view:        'front view',
  expressions: 'neutral expression',
  lighting:    'soft lighting',
};

// 辞書オブジェクトの取得（あなたの環境に合わせてどちらかが入っている想定）
function _getSfwDictRoot(){
  const d = (window.DICT_SFW || window.default_sfw || {});
  // default_sfw.json は { SFW: { … } } 構造
  return d.SFW || d;
}

// tag → category の索引を構築（スペースとアンスコ両方をキー登録）
function buildTagCategoryIndex(dictRoot=_getSfwDictRoot()){
  const map = new Map();
  for (const cat of SINGLETON_CATS){
    const list = Array.isArray(dictRoot?.[cat]) ? dictRoot[cat] : [];
    for (const item of list){
      const raw = (item?.tag ?? item?.en ?? item?.value ?? item);
      if (!raw) continue;
      const tag = (typeof toTag==='function') ? toTag(raw) : String(raw);
      const k1 = (typeof normalizeTag==='function') ? normalizeTag(tag).toLowerCase() : String(tag).trim().toLowerCase();
      const k2 = k1.replace(/\s+/g, '_');
      map.set(k1, cat);
      map.set(k2, cat);
    }
  }
  return map;
}

// 起動時に一度だけ作って再利用
let __TAG2CAT = null;
function getTag2Cat(){
  if (!__TAG2CAT) __TAG2CAT = buildTagCategoryIndex();
  return __TAG2CAT;
}


// 1) JSONから「tag -> category」を作る（toTagで統一）
function buildTagCatalogFromJSON() {
  const cat = {};
  const S = (window && window.SFW) ? window.SFW : {};
  const add = (k)=>{
    const arr = Array.isArray(S[k]) ? S[k] : [];
    for (const it of arr){
      const raw = (it && (it.tag ?? it)) || "";
      const t = (typeof toTag==='function') ? toTag(raw) : String(raw||"").trim();
      if (!t) continue;
      // outfit は各要素に cat があるので特別扱い
      if (k === 'outfit' && it && it.cat){
        cat[t] = it.cat; // top / pants / skirt / dress / shoes
      } else {
        cat[t] = k;      // background / pose / composition / view / expressions / lighting など
      }
    }
  };
  // 必要なキーを全部なめる
  ['background','pose','composition','view','expressions','lighting',
   'age','gender','body_type','height','hair_style','eyes','face','skin_body',
   'outfit','accessories','colors'
  ].forEach(add);
  return cat;
}

// 2) カテゴリ単一化（辞書で “後勝ち置き換え”）、不足はデフォ補完
/* ===== enforceSingletonByCategory（UI背景最優先・無正規表現・無normalize） ===== */
function enforceSingletonByCategory(arr, opt = { addDefaults:true, noDefaultsFor:[] }) {
  console.log('[BGFIX] enter enforceSingletonByCategory', {len:(arr||[]).length, opt});

  const toT = t => String(t||'').trim();
  const tokens = (arr||[]).map(toT).filter(Boolean);

  // タグ→カテゴリ辞書
  const TAG2CAT = (typeof getTag2Cat === 'function') ? getTag2Cat() : new Map();
  const catOf = (t) => {
    const low = t.toLowerCase();
    return TAG2CAT.get(low) || TAG2CAT.get(low.replace(/\s+/g,'_')) || null;
  };

  // デフォルト（背景は opt.noDefaultsFor に入ってたら挿さない）
  const CAT_DEFAULTS = {
    pose: 'standing',
    composition: 'upper body',
    view: 'front view',
    expressions: 'neutral expression',
    lighting: 'soft lighting',
    background: 'plain_background'
  };
  const ORDERED_CATS = ['background','pose','composition','view','expressions','lighting'];
  const noDef = new Set(opt.noDefaultsFor || []);

  // 出力用バッファ
  const nonDictOut = [];        // 辞書外（UIそのまま）
  const seenNonDict = new Set();

  // 背景は UI 最優先（最初に見つかった1つだけキープ）
  let firstBackground = null;

  // そのほか単一カテゴリは“後勝ち”
  const keepLast = {};          // cat -> token

  for (const t of tokens) {
    const c = catOf(t);
    if (!c) {
      // 辞書外はそのまま保持（重複は1回）
      if (!seenNonDict.has(t)) { nonDictOut.push(t); seenNonDict.add(t); }
      continue;
    }

    if (c === 'background') {
      if (firstBackground === null) {
        firstBackground = t; // 最初の1個だけ採用（UIが勝つ）
      } else {
        // 2個目以降の背景は捨てる（置換しない）
      }
    } else {
      // 背景以外は “後勝ち”
      keepLast[c] = t;
    }
  }

  // 再構成：辞書外（UI）→ 背景 → 他カテゴリ（固定順）
  const out = [];
  out.push(...nonDictOut);

  if (firstBackground) {
    out.push(firstBackground);
  } else if (opt.addDefaults && !noDef.has('background') && CAT_DEFAULTS.background) {
    // 背景が一切無く、かつデフォ許可ならのみ補完
    out.push(toT(CAT_DEFAULTS.background));
    console.log('[BGFIX] background default injected');
  }

  for (const cat of ORDERED_CATS) {
    if (cat === 'background') continue; // 既に処理済み
    const tk = keepLast[cat];
    if (tk) {
      out.push(tk);
    } else if (opt.addDefaults && !noDef.has(cat) && CAT_DEFAULTS[cat]) {
      out.push(toT(CAT_DEFAULTS[cat]));
    }
  }

  // 「full body がいるなら upper/bust/waist up/portrait を掃除」（リテラル一致で）
  const COMPO_FULL = new Set(['full body','full_body']);
  const COMPO_DROP_IF_FULL = new Set(['upper body','upper_body','bust','waist up','waist_up','portrait']);
  const hasFull = out.some(t => COMPO_FULL.has(t.toLowerCase()));
  if (hasFull) {
    for (let i = out.length - 1; i >= 0; i--) {
      const k = out[i].toLowerCase();
      if (COMPO_DROP_IF_FULL.has(k)) out.splice(i, 1);
    }
  }

  console.log('[BGFIX] exit enforceSingletonByCategory', {outLen: out.length, out});
  return out;
}



// 文字列→配列共通
function splitTags(v){
  return String(v||"").split(",").map(s=>s.trim()).filter(Boolean);
}



// === 表記ゆれ修正（辞書準拠） ==================
const SCOPE = {
  learning: {
    background: [
      "plain_background","white_background","solid_background",
      "studio_background","white_seamless","gray_seamless"
    ],
    pose: [
      "standing","sitting","hands on hips","crossed arms",
      "hand on chest","hands behind back","head tilt","waving"
    ],
    composition: [
      "full body","waist up","bust","close-up","portrait","centered composition"
    ],
    view: [
      "front view","three-quarter view","side view","profile view","back view" // ← 修正
    ],
    expressions: [
      "neutral expression","smiling","smiling open mouth","serious","determined",
      "slight blush","surprised (mild)","pouting (slight)","teary eyes","laughing","embarrassed"
    ],
    lighting: [
      "normal lighting","even lighting","soft lighting","window light","overcast",
      "flat studio lighting","backlighting","rim light"
    ]
  }
};

// === 顔安定版・配分ルール =======================
const MIX_RULES = {
  view: {
    group: ["front view","three-quarter view","side view","profile view","back view"], // ← 修正
    targets: {
      "three-quarter view":[0.55,0.65], // ← 修正
      "front view":[0.30,0.35],
      "side view":[0.02,0.04],
      "profile view":[0.01,0.03],
      "back view":[0.00,0.01]
    },
    fallback: "three-quarter view" // ← 修正
  },
  comp: {
    group: ["bust","waist up","portrait","upper body","close-up","full body","wide shot"],
    targets: {
      "bust":[0.35,0.45],
      "waist up":[0.30,0.35],
      "portrait":[0.10,0.15],
      "upper body":[0.05,0.08],
      "close-up":[0.03,0.05],
      "full body":[0.00,0.02],
      "wide shot":[0.00,0.01]
    },
    fallback: "bust"
  },
  expr: {
    group: [
      "neutral expression","smiling","smiling open mouth",
      "slight blush","serious","determined","pouting (slight)"
    ],
    targets: {
      "neutral expression":[0.55,0.65],
      "smiling":[0.20,0.25],
      "smiling open mouth":[0.03,0.05],
      "slight blush":[0.03,0.05],
      "serious":[0.01,0.02],
      "determined":[0.01,0.02],
      "pouting (slight)":[0.01,0.02]
    },
    fallback: "neutral expression"
  },
  bg: {
    group: ["plain_background","white_background","studio_background","solid_background","white_seamless","gray_seamless"],
    targets: {
      "plain_background":[0.55,0.62],
      "white_background":[0.15,0.22],
      "studio_background":[0.08,0.12],
      "solid_background":[0.04,0.07],
      "white_seamless":[0.01,0.02],
      "gray_seamless":[0.01,0.02]
    },
    fallback: "plain_background"
  },
  light: {
    group: ["even lighting","soft lighting","normal lighting","window light","overcast"],
    targets: {
      "even lighting":[0.35,0.45],
      "soft lighting":[0.30,0.35],
      "normal lighting":[0.15,0.20],
      "window light":[0.05,0.08],
      "overcast":[0.00,0.02]
    },
    fallback: "even lighting"
  }
};
window.MIX_RULES = MIX_RULES;

const EXPR_ALL = new Set([...Object.keys(MIX_RULES.expr.targets), MIX_RULES.expr.fallback]);

// === outfitの取り込み方針 =======================
// mode: 'off'（入れない / 推奨デフォ）| 'on'（そのまま入れる）| 'neutral'（汎用タグに置換）
const TRAINING_POLICY = {
  outfit: { mode: 'off', neutral_tag: 'casual outfit' } // neutral_tag は辞書内の汎用衣装タグ
};

// ユーザ選択を元に学習タグを構築
function buildTrainingTags(userSel = {}) {
  const tags = [];

  // --- identity最小限（例） ---
  if (userSel.hair_style) tags.push(userSel.hair_style);
  if (userSel.hair_color) tags.push(userSel.hair_color);
  if (userSel.eye_color)  tags.push(userSel.eye_color);

  // --- outfitの扱いを制御 ---
  const mode = TRAINING_POLICY.outfit.mode;
  if (mode === 'on' && userSel.outfit) {
    tags.push(userSel.outfit);
  } else if (mode === 'neutral') {
    // 具体的な衣装は捨てて、汎用タグだけ入れる（分布を若干安定させる）
    tags.push(TRAINING_POLICY.outfit.neutral_tag);
  }
  // 'off' の場合は一切入れない

  // --- 自動サンプリング（学習安定プリセット） ---
  const pickByRule = (rule) => {
    const r = Math.random();
    let acc = 0;
    for (const k of rule.group) {
      const [lo, hi] = rule.targets[k] || [0,0];
      const p = (lo + hi) / 2;
      acc += p;
      if (r <= acc) return k;
    }
    return rule.fallback;
  };

  tags.push(
    pickByRule(MIX_RULES.view),
    pickByRule(MIX_RULES.comp),
    pickByRule(MIX_RULES.expr),
    pickByRule(MIX_RULES.bg),
    pickByRule(MIX_RULES.light)
  );

  // ポーズはホワイトリストから軽くばらす
  const POSE_POOL = SCOPE.learning.pose;
  tags.push(POSE_POOL[Math.floor(Math.random() * POSE_POOL.length)]);

  return Array.from(new Set(tags));
}


// === 学習用 NSFW ホワイトリスト（LoRA安定用・衣装＋体型のみ） ===
const NSFW_LEARN_SCOPE = {
  outfit: [
    "bunny_suit","nurse_uniform","maid_outfit",
    "school_swimsuit","sailor_uniform_r18","blazer_uniform_r18","gym_bloomers",
    "bikini","micro_bikini","string_bikini","sling_bikini","wet_swimsuit",
    "cheerleader_outfit","idol_stage_costume","cosplay_police","cosplay_teacher",
    "princess_dress_r18","magical_girl_r18","witch_outfit"
  ],
  body: [
    "flat_chest","small_breasts","average_bust","big_breasts",
    "chubby","plump","muscular_body","athletic_body",
    "petite_body","tall_body","hourglass","doll_like_body"
  ]
};





















/* ===== asTag：UI表示(日本語/英語/ID) → 英語タグへ統一 ===== */
function asTag(x){
  if (!x) return "";
  const s0 = String(x).trim();
  if (!s0 || s0.toLowerCase() === "none") return "";

  // 1) 辞書（TAGMAP）があれば最優先でID/表示名→tagに解決
  if (window.TAGMAP){
    // 完全一致ID
    if (TAGMAP.id2tag && TAGMAP.id2tag.has(s0)) return TAGMAP.id2tag.get(s0);
    // 英語ラベル（小文字）一致
    const low = s0.toLowerCase();
    if (TAGMAP.en && TAGMAP.en.has(low)) return TAGMAP.en.get(low);
    // 日本語ラベル一致
    if (TAGMAP.ja2tag && TAGMAP.ja2tag.has(s0)) return TAGMAP.ja2tag.get(s0);
    // 任意label→tag
    if (TAGMAP.label2tag && TAGMAP.label2tag.has(s0)) return TAGMAP.label2tag.get(s0);
  }

  // 2) 辞書で拾えない場合は規則ベースで英語タグ化
  if (typeof toEnTagStrict === 'function') return toEnTagStrict(s0);
  if (typeof toTag === 'function')         return toTag(s0);
  return s0;
}

/* picker系も asTag に統一 */
function pickTag(id){
  const v = (typeof pickOneFromScroller === 'function') ? pickOneFromScroller(id) : "";
  return asTag(v);
}
function textTag(id){
  const el = document.getElementById(id);
  const v  = (el?.textContent || el?.value || "").trim();
  return asTag(v);
}

















// --- 英語タグ強制（日本語+英語混在も英語だけ抽出） ---
function toEnTagStrict(t){
  let s = String(t||"").trim();
  if (!s) return "";

  // JSON から構築した対訳を優先
  if (window && window.TAG_I18N && window.TAG_I18N[s]) {
    s = window.TAG_I18N[s];
  }

  // 「日本語 + 英語」混在は英語塊を抽出して最後の塊を採用
  // 例: "無地背景 plain background" → "plain background"
  const EN_CHUNK = /[A-Za-z0-9][A-Za-z0-9'’\- ]*/g;
  const chunks = s.match(EN_CHUNK);
  if (chunks && chunks.length) {
    s = chunks[chunks.length - 1].trim();
  } else {
    // 英語が無い場合は対訳で落ちなかった日本語を諦めて空に
    s = "";
  }

  if (!s) return "";
  if (typeof toTag === 'function') s = toTag(s);
  if (typeof normalizeTag === 'function') s = normalizeTag(s);
  return s;
}



// 初期化
  window.PC = { top:"", bottom:"", shoes:"" };
  window.USE_TOP_COLOR = false;
  window.USE_BOTTOM_COLOR = false;
  window.USE_SHOES_COLOR = false;

  // トップ（例：オレンジを選んだとき）
  function setTopColorTag(tag){           // tag 例: "orange" or ""
    window.PC.top = tag || "";
    window.USE_TOP_COLOR = !!document.getElementById('use_top').checked && !!tag;
    document.getElementById('tag_top').textContent = tag || "—";
  }
  // ボトム（例：ブルー）
  function setBottomColorTag(tag){
    window.PC.bottom = tag || "";
    window.USE_BOTTOM_COLOR = !!document.getElementById('useBottomColor').checked && !!tag;
    document.getElementById('tag_bottom').textContent = tag || "—";
  }
  // 靴（必要なら）
  function setShoesColorTag(tag){
    window.PC.shoes = tag || "";
    window.USE_SHOES_COLOR = !!document.querySelector('#panel_shoes #use_shoes')?.checked && !!tag;
    document.getElementById('tag_shoes').textContent = tag || "—";
  }






/* ===================== 服色パイプライン（辞書ベース・プレースホルダ無し） ===================== */
/* 期待する辞書:
   window.SFW && SFW.outfit : [{tag, cat, emit?}, ...]
   ※ emit が無ければ tag をそのまま出力（UI表示も同じ文字列）
*/
(function(){
  // ---- 可変：先頭から除去したい固定接頭辞（必要な時だけ設定）----
  // 例: window.OUTFIT_STRIP_PREFIXES = ["plain "]
  window.OUTFIT_STRIP_PREFIXES = window.OUTFIT_STRIP_PREFIXES || [];

  // ---- 共通ユーティリティ ----
  // これで置き換え
   const canon = s => String(s||"")
     // ハイフン/マイナス系ぜんぶ → スペース
     .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D_-]+/g, ' ')
     // 余分な空白を1つに
     .replace(/\s+/g, ' ')
     .toLowerCase()
     .trim();
  const norm  = s => String(s||"").trim();
  const startsWithAny = (s, arr)=> (arr||[]).some(p=> s.toLowerCase().startsWith(String(p||'').toLowerCase()));

  // ---- 色語彙（SFW.colors を取り込み）----
  function buildColorRe(){
    const pool = new Set([
      "white","black","red","blue","green","yellow","pink","purple","orange","brown","gray","grey",
      "silver","gold","beige","navy","teal","magenta","ivory","khaki","olive","violet","lavender",
      "mint","peach","light blue","sky blue","dark blue","light green","dark green","turquoise","emerald","crimson","scarlet"
    ]);
    try {
      const list = (window.SFW && Array.isArray(window.SFW.colors)) ? window.SFW.colors : [];
      list.map(e=>e&&e.tag).filter(Boolean).forEach(t=> pool.add(String(t).toLowerCase()));
    } catch {}
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
    const alt = Array.from(pool).sort((a,b)=>b.length-a.length).map(esc).join('|');
    return new RegExp(`^(?:${alt})(?:\\s|-)+`, 'i');
  }
  window._COLOR_RE = window._COLOR_RE || buildColorRe();

  // ---- outfit辞書 -> カタログ化（tag で引く / emit は出力文字）----
  function ensureCatalog(){
  // 既に作ってあればそれを使う
  if (window.SFW_CATALOG && window.SFW_CATALOG.size) return window.SFW_CATALOG;

  // ★スナップショットを最優先に使う
  let src = Array.isArray(window.__OUTFIT_SRC) && window.__OUTFIT_SRC.length
            ? window.__OUTFIT_SRC
            : (Array.isArray(window.SFW?.outfit) ? window.SFW.outfit : []);

  const m = new Map();
  for (const e of (src || [])){
    const tag  = e?.tag ? norm(e.tag) : ""; if (!tag) continue;
    const cat  = e?.cat ? norm(e.cat) : ""; if (!cat) continue;
    const emit = e?.emit ? norm(e.emit) : tag;
    m.set(canon(tag), { cat: canon(cat), emit, tag });
  }
  window.SFW_CATALOG = m;
  try {
    console.log('[WEAR] ensureCatalog built, size=', m.size);
  } catch {}
  return m;
}

   
  // ---- 入力トークン -> outfitメタ（先頭の色は一時剥離して辞書照合）----
  function getOutfitMeta(token){
    const raw = norm(token);
    const withoutColor = raw.replace(window._COLOR_RE, '').trim();
    const m = ensureCatalog();
    // 色を剥いだ形優先 → そのまま
    return m.get(canon(withoutColor)) || m.get(canon(raw)) || null; // {cat, emit, tag} or null
  }

  // ---- 任意: 接頭辞（例: "plain "）を emit から除去 ----
  function maybeStripPrefix(s){
    if (!s) return s;
    return startsWithAny(s, window.OUTFIT_STRIP_PREFIXES)
      ? s.replace(/^(\S+\s+)/,'').replace(/^plain\s+/i,'').trim()
      : s;
  }

  // ---- 既存互換：色指定の受け取り（opts > window.PC）----
  function resolvePC(opts){
    const base = { top:"", bottom:"", shoes:"" };
    const glob = (typeof window.PC==='object' && window.PC) ? window.PC : {};
    const pc   = Object.assign({}, base, glob, (opts||{}));
    for (const k of Object.keys(pc)) {
      const v = String(pc[k] || '').trim().toLowerCase();
      pc[k] = (v && v!=='none') ? v : '';
    }
    return pc;
  }

  // ---- 1) ここを修正：pairWearColors 先頭で ensureCatalog() を必ず実行
window.pairWearColors = function pairWearColors(arr, opts={}){
  ensureCatalog(); // ★追加：空配列でもカタログを初期化
  if (!Array.isArray(arr)) return arr || [];
  const PC = resolvePC(opts);
  const out = [];
  for (const token of arr){
    const t = norm(token); if (!t) continue;
    const meta = getOutfitMeta(t);
    if (meta && meta.cat === 'dress' && PC.top && !window._COLOR_RE.test(t)){
      const emit = maybeStripPrefix(meta.emit);
      out.push(`${PC.top} ${emit}`);
    } else {
      out.push(meta ? maybeStripPrefix(meta.emit) : t);
    }
  }
  return out;
};

// ---- 2) ここも修正：applyWearColorPipeline 先頭で ensureCatalog() を必ず実行
window.applyWearColorPipeline = function applyWearColorPipeline(p, opts={}){
  ensureCatalog(); // ★追加：必ず辞書を作る
  if (!Array.isArray(p)) return p || [];
  const PC = resolvePC(opts);

  // 先に dress へ top 色を直焼き & emit 正規化
  p = window.pairWearColors(p, PC);

  const out = [];
  for (const token of p){
    let t = norm(token); if (!t) continue;

    if (window._COLOR_RE.test(t)) { out.push(t); continue; }

    const meta = getOutfitMeta(t);
    if (!meta) { out.push(t); continue; }

    const emit = maybeStripPrefix(meta.emit);
    if (meta.cat === 'top' || meta.cat === 'dress'){
      out.push(PC.top    ? `${PC.top} ${emit}`    : emit);
    } else if (meta.cat === 'pants' || meta.cat === 'skirt'){
      out.push(PC.bottom ? `${PC.bottom} ${emit}` : emit);
    } else if (meta.cat === 'shoes'){
      out.push(PC.shoes  ? `${PC.shoes} ${emit}`  : emit);
    } else {
      out.push(emit);
    }
  }
  return out;
};

// ---- 3) （任意）明示初期化API：どこからでも叩けるように
window.initWearColorEngine = function(){
  const m = ensureCatalog();
  window._COLOR_RE = window._COLOR_RE || buildColorRe();
  try { console.log('[BOOT] SFW_CATALOG size =', m?.size); } catch{}
  return m;
};

// 服色IIFEの末尾（initWearColorEngine定義の直後あたり）に追加
window.__WEAR_VERSION = 'v3'; // ←あなたの好きな値でOK

// 既存の関数をラップして、呼ばれるたびに中の辞書状況を必ず出す
const _origPair = window.pairWearColors;
window.pairWearColors = function(arr, opts){
  const m = ensureCatalog();
  console.log('[WEAR]', window.__WEAR_VERSION, 'pairWearColors() catalog.size=', m?.size,
              'has t-shirt?', m?.has(canon('t-shirt')), 'has jeans?', m?.has(canon('jeans')));
  return _origPair.call(this, arr, opts);
};

const _origPipe = window.applyWearColorPipeline;
window.applyWearColorPipeline = function(p, opts){
  const m = ensureCatalog();
  console.log('[WEAR]', window.__WEAR_VERSION, 'applyWearColorPipeline() catalog.size=', m?.size,
              'PC=', opts || {});
  return _origPipe.call(this, p, opts);
};
   
})();


const canon2 = s => String(s||"").toLowerCase()
  .replace(/[_-]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

console.log('[CHK] catalog size', window.SFW_CATALOG?.size);
console.log('[CHK] keys sample', Array.from(window.SFW_CATALOG?.keys?.() || []).slice(0,10));
console.log('[CHK] lookup by tag',
  window.SFW_CATALOG?.get?.(canon2('t-shirt')),
  window.SFW_CATALOG?.get?.(canon2('jeans'))
);


// 追加: UI から照明候補セットを取る（正規表現なし）
function getLightingCandidatesFromUI(){
  const vals = [];

  // セレクトやスクロール UI から候補値を吸う
  const grab = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      for (const opt of el.options) {
        const v = (opt.value || opt.textContent || "").trim();
        if (v) vals.push(v);
      }
    }
    // スクロールUIや独自UI向けに、候補を返す関数があるなら併用（なければ無視される）
    if (typeof getMany === 'function') {
      const alt = getMany(id + '_all'); // 実装していなければ [] が返る想定
      if (Array.isArray(alt)) for (const v of alt) if (v) vals.push(String(v).trim());
    }
  };

  // SFW/NSFW 両方の照明UIを候補に
  grab('pl_light');
  grab('pl_nsfw_light');

  // 表記ゆれ（アンダースコア等）だけは UI の表示どおりに整える
  const norm = s => String(s||'').replace(/_/g,' ').trim().toLowerCase();
  return new Set(vals.map(norm));
}












// ===== NSFW表情セット & 単一化 =====
const NSFW_EXPR_SET = new Set([
  "flushed", "aroused", "seductive smile", "embarrassed",
  // もし他にも使うならここに追加
]);

// ===== NSFW優先・単一化ヘルパ =====
// POSE_ALL は MIX_RULES から自動生成（無ければ空）
const POSE_ALL = (function(){
  try {
    const g = MIX_RULES?.pose?.targets ? Object.keys(MIX_RULES.pose.targets) : [];
    const fb = MIX_RULES?.pose?.fallback;
    return new Set([...(g||[]), fb].filter(Boolean).map(s=>String(s).toLowerCase()));
  } catch { return new Set(); }
})();

// EXPR_ALL はあなたの既存生成を使用（ここでは参照だけ）
// NSFW_EXPR_SET / NSFW_POSE_SET は“外部で定義されている前提”にして、無ければ空集合に
const _NSFW_EXPR = (typeof NSFW_EXPR_SET !== 'undefined') ? NSFW_EXPR_SET : new Set();
const _NSFW_POSE = (typeof NSFW_POSE_SET !== 'undefined') ? NSFW_POSE_SET : new Set();
const _EXPR_ALL  = (typeof EXPR_ALL      !== 'undefined') ? EXPR_ALL      : new Set();

// 共通：集合判定
function _in(set, t){ return set && set.has(String(t||"").toLowerCase()); }

// ===== 表情・ポーズ・ライティング：NSFW優先で単一化（MIX_RULES の直後に貼り付け） =====
(function(){
  const _lc = s => String(s||"").trim().toLowerCase();
  const _mkSet = (g=[], fb) => new Set([...(g||[]), fb].filter(Boolean).map(_lc));
  const _has = (set, t) => !!set && set.has(_lc(t));

  // --- 全候補セット（MIX_RULES が無くても安全） ---
  const EXPR_ALL  = (function(){ try {
    // 既に外部で定義済みならそれを尊重（顔の安定化ルールと互換）
    if (typeof window.EXPR_ALL !== 'undefined') return window.EXPR_ALL;
    const g  = MIX_RULES?.expr?.targets ? Object.keys(MIX_RULES.expr.targets) : [];
    const fb = MIX_RULES?.expr?.fallback;
    return _mkSet(g, fb);
  } catch { return new Set(); } })();

  const POSE_ALL  = (function(){ try {
    const g  = MIX_RULES?.pose?.targets ? Object.keys(MIX_RULES.pose.targets) : [];
    const fb = MIX_RULES?.pose?.fallback;
    return _mkSet(g, fb);
  } catch { return new Set(); } })();

  const LIGHT_ALL = (function(){ try {
    const g  = MIX_RULES?.light?.targets ? Object.keys(MIX_RULES.light.targets) : [];
    const fb = MIX_RULES?.light?.fallback;
    return _mkSet(g, fb);
  } catch { return new Set(); } })();

  // --- NSFW セット（外部定義があれば採用、無ければ空） ---
  const NSFW_EXPR  = (typeof window.NSFW_EXPR_SET  !== 'undefined') ? window.NSFW_EXPR_SET  : new Set();
  const NSFW_POSE  = (typeof window.NSFW_POSE_SET  !== 'undefined') ? window.NSFW_POSE_SET  : new Set();
  const NSFW_LIGHT = (typeof window.NSFW_LIGHT_SET !== 'undefined') ? window.NSFW_LIGHT_SET : new Set();

  // --- 汎用：NSFW優先でカテゴリ要素を1つに絞る ---
  const _unifyOne = (arr, nsfwSet, allSet) => {
    if (!Array.isArray(arr)) return arr || [];
    const hits = [];
    for (let i=0;i<arr.length;i++){
      const raw = String(arr[i]||"").trim(); if (!raw) continue;
      const t = _lc(raw);
      if (_has(nsfwSet,t) || _has(allSet,t)) hits.push({i,t});
    }
    if (hits.length <= 1) return arr;
    // 既定は最後の一致を残す。NSFWがあればそれを優先
    let keep = hits[hits.length-1].i;
    for (const h of hits){ if (_has(nsfwSet,h.t)) { keep = h.i; break; } }
    const drop = new Set(hits.map(h=>h.i).filter(i=>i!==keep));
    return arr.filter((_,i)=>!drop.has(i));
  };

  // --- 公開関数 ---
  window.unifyExprOnce  = function(arr){ return _unifyOne(arr, NSFW_EXPR,  EXPR_ALL ); };
  window.unifyPoseOnce  = function(arr){ return _unifyOne(arr, NSFW_POSE,  POSE_ALL ); };
  window.unifyLightOnce = function(arr){ return _unifyOne(arr, NSFW_LIGHT, LIGHT_ALL); };
})();







// ===== 共通コア：タグ正規化・単一化・順序統一 =====
function buildPromptCore(opts){
  const {
    tags = [],          // 集めたタグ配列
    nsfwOn = false,     // NSFWフラグ
    fixed = [],         // 固定タグ（配列）
    addNeg = "",        // ネガティブ追加
    useDefNeg = false,  // デフォネガON/OFF
    charName = "",      // キャラ名（seed用）
    seedOffset = 0,     // シードオフセット
    // ★ 追加: 学習モードでは false を指定してフォールバック抑止
    singletonDefaults = true, // enforceSingletonByCategory の addDefaults
    singletonKeep = 'last'    // 念のため外から上書きできるように
  } = opts || {};

  const _to   = t => (typeof toTag==='function' ? toTag(t) : String(t||"").trim());
  const _norm = t => (typeof normalizeTag==='function') ? normalizeTag(String(t||"")) : String(t||"").trim();

  let p = (tags||[]).map(_to).filter(Boolean);

  // --- NSFW処理 ---
  if (nsfwOn){
    if (typeof stripSfwWearWhenNSFW==='function'){
      p = stripSfwWearWhenNSFW(p, new Set());
    }
    p = p.filter(t => String(t).toUpperCase() !== "NSFW");
    p.unshift("NSFW");
  }

  // --- カテゴリ単一化（不足補完の有無を切り替え可能）---
  if (typeof enforceSingletonByCategory==='function'){
    p = enforceSingletonByCategory(p, { addDefaults: !!singletonDefaults, keep: singletonKeep });
  }

  // --- 後処理 ---
  if (typeof dropBareColors==='function')           p = dropBareColors(p);
  if (typeof fixExclusives==='function')            p = fixExclusives(p);
  if (typeof ensurePromptOrder==='function')        p = ensurePromptOrder(p);
  if (typeof enforceHeadOrder==='function')         p = enforceHeadOrder(p);
  if (typeof enforceSingleBackground==='function')  p = enforceSingleBackground(p);
  if (typeof unifyLightingOnce==='function')        p = unifyLightingOnce(p);

  // --- 固定タグを先頭に ---
  if (fixed && fixed.length){
    const f = fixed.map(_to).filter(Boolean).map(_norm);
    p = [...f, ...p];
  }

  // --- 重複除去（normalize後）---
  if (typeof dedupeStable==='function'){
    p = dedupeStable(p);
  } else {
    const seen = new Set(), out = [];
    for (const t of p){
      const k = _to(t).toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(_norm(t));
    }
    p = out;
  }

  // --- seed / neg 組み立て ---
  const seed = (typeof seedFromName==='function')
    ? seedFromName(charName||"", seedOffset)
    : seedOffset;

  const negParts = [];
  if (useDefNeg && typeof getCommonDefaultNeg==='function'){
    const d = getCommonDefaultNeg(); if (d) negParts.push(d);
  }
  if (addNeg) negParts.push(addNeg);
  const neg = negParts.join(", ");

  const prompt = p.join(", ");
  return { seed, pos:p, neg, prompt, text: `${prompt}${neg?` --neg ${neg}`:""} seed:${seed}` };
}



// === Rラベル/none掃除 ===
const _isRating = t => /^R[\s-]?1[58](?:[\s-]?G)?$/i.test(String(t||""));
function sanitizePromptArray(arr){
  return (arr||[])
    .map(x => (x||"").trim())
    .filter(x => x && x.toLowerCase()!=='none' && !_isRating(x));
}

// === 単一/複数UI両対応で「1つ」取得（従来の挙動用） ===
function pickOneFromUI(id){
  if (typeof getMany === 'function'){
    const pool = (getMany(id) || []).map(asTag).filter(Boolean).filter(t => t.toLowerCase()!=='none');
    if (pool.length) return pool[Math.floor(Math.random()*pool.length)];
  }
  const one = (typeof pickOneFromScroller === 'function') ? pickOneFromScroller(id) : "";
  const t = asTag(one);
  return (t && t.toLowerCase()!=='none') ? t : "";
}

// === MIX_RULESに基づく重み抽選 ===
function pickByMixRules(ruleKey, uiId){
  const rule = (window.MIX_RULES || {})[ruleKey];
  if (!rule) return "";

  // 1) UI側で候補が選ばれていれば、その中に限定
  let candidates = [];
  if (typeof getMany === 'function'){
    const sel = (getMany(uiId) || []).map(asTag).filter(Boolean);
    // UI候補のうちMIX_RULESのgroupに含まれるものだけ
    const groupSet = new Set(rule.group.map(asTag));
    candidates = sel.filter(t => groupSet.has(asTag(t)));
  }
  if (!candidates.length){
    // UI未指定ならルールのgroup全部
    candidates = rule.group.slice();
  }

  // 2) 各候補に重みを割り当て（targetsの[min,max]から一様に1回サンプル）
  let total = 0;
  const weights = candidates.map(tag=>{
    const key = asTag(tag);
    const range = rule.targets[key];
    const w = range ? (range[0] + Math.random()*(range[1]-range[0])) : 0.0001; // 未定義は微小
    total += w;
    return {tag:key, w};
  });
  if (!total) return rule.fallback || candidates[0] || "";

  // 3) 重みに基づくルーレット選択
  let r = Math.random() * total;
  for (const {tag, w} of weights){
    r -= w;
    if (r <= 0) return tag;
  }
  return weights[weights.length-1].tag;
}








/* ---------- 共通ヘルパ：ライト統一（強化版） ---------- */
function unifyLightingOnce(arr){
  if (!Array.isArray(arr)) return arr || [];
  const norm = t => (typeof normalizeTag==='function')
    ? normalizeTag(String(t||""))
    : String(t||"").trim().toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ');

  const harvest = (xs)=> (Array.isArray(xs) ? xs : []).map(x => norm(x?.tag ?? x));
  const dictSet = new Set([
    ...harvest(window?.SFW?.lighting),
    ...harvest(window?.NSFW?.lighting),
    ...harvest(window?.MIX_RULES?.light?.group),
    "soft lighting","normal lighting","even lighting","backlighting","rim lighting","neon lighting","studio lighting"
  ]);

  const kept = [];
  let chosen = null;
  for (const raw of arr){
    if (!raw) continue;
    const k = norm(raw);
    const isLight = dictSet.has(k) || /\blight(ing)?\b/.test(k);
    if (isLight){
      if (!chosen){ kept.push(raw); chosen = k; }
      // 2個目以降は捨てる
    } else {
      kept.push(raw);
    }
  }
  return kept;
}

/* ---------- 共通ヘルパ：ワンピのとき上下を必ず落とす ---------- */
function stripSeparatesWhenDressPresent(p){
  if (!Array.isArray(p)) return p||[];
  const TXT = p.map(x=>String(x||""));
  const dressRe = /\b(dress|one[-\s]?piece|qipao|cheongsam|yukata|kimono(?:\s+dress)?|gown|sundress|hanbok)\b/i;
  const hasDress = TXT.some(s=>dressRe.test(s));
  if (!hasDress) return p;

  const COLOR_PLACE_RE = /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold|emerald)\b\s+(top|bottom)/i;
  const SEP_RE = /\b(top|bottom|skirt|pants|shorts|jeans)\b/i;

  return p.filter(s=>{
    const x = String(s||"");
    if (COLOR_PLACE_RE.test(x)) return false;
    if (SEP_RE.test(x))        return false;
    return true;
  });
}

/* ---------- 共通ヘルパ：靴の色は明示選択が無ければ外す ---------- */
function dropColorizedShoesUnlessUserSelected(p){
  if (!Array.isArray(p)) return p||[];
  const shoesColorPicked =
    !!(document.getElementById('tag_shoesColor')?.value || "").trim() ||
    !!(document.getElementById('pl_shoesColor')?.value  || "").trim();
  if (shoesColorPicked) return p;

  const COLOR_SHOES_RE = /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold|emerald)\b\s+(shoes|boots|sneakers|loafers|sandals|heels|mary\s+janes)\b/i;
  return p.filter(s => !COLOR_SHOES_RE.test(String(s||"")));
}

/* ---------- 共通ヘルパ：仕上げの順序を強制（UI背景を刈らない版＋デバッグログ） ---------- */
function finalizePromptArray(p){
  // ====== デバッグトグル ======
  // 有効化: window.DEBUG_FINALIZE = true;
  const TAG = '[DBG][FINALIZE]';
  const on  = !!window.DEBUG_FINALIZE;
  const snap = (arr)=> Array.isArray(arr) ? arr.slice() : [];

  const log = (...args)=> { if (on) console.log(TAG, ...args); };
  const step = (name, fn)=>{
    const before = snap(p);
    try{
      const out = fn(before);
      p = Array.isArray(out) ? out : before;  // 失敗時は巻き戻し
      log(name, { before, after: snap(p) });
    }catch(e){
      log(name + ' [ERROR]', e);
      p = before;
    }
  };

  p = p || [];
  log('INPUT', snap(p));

  // 服の整合（ワンピ時は上下とその色プレースを落とす）
  if (typeof stripSeparatesWhenDressPresent === 'function'){
    step('stripSeparatesWhenDressPresent', arr => stripSeparatesWhenDressPresent(arr));
  }

  // 靴の色はユーザー未指定なら外す
  if (typeof dropColorizedShoesUnlessUserSelected === 'function'){
    step('dropColorizedShoesUnlessUserSelected', arr => dropColorizedShoesUnlessUserSelected(arr));
  }

  // JSONカテゴリ単一化（背景のデフォ補完は抑制：UI優先）
  if (typeof enforceSingletonByCategory === 'function'){
    step('enforceSingletonByCategory', arr =>
      enforceSingletonByCategory(arr, {
        addDefaults: true,
        keep: 'last',                 // 互換用（未使用実装なら無視される）
        noDefaultsFor: ['background'] // ★ plain_background 等を勝手に入れない
      })
    );
  }

  // ライトは最終1つ（※後段でNSFWライトを優先する処理が別にあるならそれを尊重）
  if (typeof unifyLightingOnce === 'function'){
    step('unifyLightingOnce', arr => unifyLightingOnce(arr));
  }

  // 排他・順序（背景は刈らない：★ enforceSingleBackground は呼ばない）
  if (typeof dropBareColors === 'function'){
    step('dropBareColors', arr => dropBareColors(arr));
  }
  if (typeof fixExclusives === 'function'){
    step('fixExclusives', arr => fixExclusives(arr));
  }

  if (typeof ensurePromptOrder === 'function'){
    step('ensurePromptOrder', arr => ensurePromptOrder(arr));
  } else if (typeof ensurePromptOrderLocal === 'function'){
    step('ensurePromptOrderLocal', arr => ensurePromptOrderLocal(arr));
  }

  if (typeof enforceHeadOrder === 'function'){
    step('enforceHeadOrder', arr => enforceHeadOrder(arr));
  }

  // ★ ここでは背景プレースホルダの削除はしない
  //    （必要なら呼び出し側で "background" リテラル除去を実施）

  // 重複除去
  if (typeof dedupeStable === 'function'){
    step('dedupeStable', arr => dedupeStable(arr));
  } else {
    step('dedupe(fallback)', arr => {
      const seen = new Set(); const out = [];
      for (const t of (arr||[])){
        const k = String(t||"").toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();
        if (!k || seen.has(k)) continue;
        seen.add(k); out.push(t);
      }
      return out;
    });
  }

  log('OUTPUT', snap(p));
  return p;
}



/* ===================== COMMON PATCHES ===================== */
// 汎用：{tag, ja}配列から <select> を構築
function populateSelect(selectId, items, { includeNone=true, noneLabel="なし" } = {}){
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = "";
  if (includeNone){
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = noneLabel;
    el.appendChild(opt);
  }
  (items||[]).forEach(it=>{
    const opt = document.createElement("option");
    opt.value = it.tag || "";                       // 英語タグ ← 出力にそのまま使う
    opt.textContent = it.ja || it.tag || "";        // 表示は日本語（なければ英語）
    el.appendChild(opt);
  });
}

// 辞書からカテゴリを安全に読む
function getDictList(dictRoot, categoryPath){
  // 例: getDictList(window.NSFW, ["categories","expression"])
  try{
    return categoryPath.reduce((o,k)=> (o||{})[k], dictRoot) || [];
  }catch(_){ return []; }
}

// 表示名→タグの解決（JSON辞書の name / tag / alias を総当たり）
// window.SFW / window.NSFW（default_sfw.json / default_nsfw.json）を前提に逆引きを作成
function mapUIToTag(s){
  const key = (x)=> String(x||"").toLowerCase().trim();
  if (!s) return "";

  // 一度だけ逆引きテーブルを構築
  if (!window.__NAME2TAG){
    const put = (obj, t, names=[])=>{
      const tag = toEnTagStrict(t);
      const bucket = [t].concat(names||[]);
      bucket.forEach(n=>{ const k = key(n); if (k) obj[k] = tag; });
    };
    const buildFromDict = (dict, acc)=>{
      if (!dict) return;
      Object.keys(dict).forEach(cat=>{
        (dict[cat]||[]).forEach(item=>{
          if (!item) return;
          // 想定: { tag:"plain background", name:"白背景", aliases:["white background"] } 等
          const tag = item.tag || item.en || item.value || item.name || item;
          const names = []
            .concat(item.name||[])
            .concat(item.names||[])
            .concat(item.alias||[])
            .concat(item.aliases||[]);
          put(acc, tag, names);
        });
      });
    };
    window.__NAME2TAG = Object.create(null);
    try { buildFromDict(window.SFW,  window.__NAME2TAG); } catch(e){}
    try { buildFromDict(window.NSFW, window.__NAME2TAG); } catch(e){}
    // I18Nマップも反映
    if (window.TAG_I18N){
      Object.keys(window.TAG_I18N).forEach(k=>{
        const v = window.TAG_I18N[k];
        if (v) window.__NAME2TAG[key(k)] = toEnTagStrict(v);
      });
    }
  }

  const k = key(s);
  const viaDict = window.__NAME2TAG && window.__NAME2TAG[k];
  return toEnTagStrict(viaDict || s);
}




// NSFWヘッダを**常に先頭**へ（重複除去）
function pushNSFWFirst(p){
  p = (p||[]).filter(t => String(t||"").toUpperCase()!=="NSFW");
  p.unshift("NSFW");
  return p;
}

// 共通ネガ（無ければ空）
function buildCommonNeg(extra=[]){
  const xs = [];
  if (typeof getCommonDefaultNeg==='function'){
    const d = getCommonDefaultNeg();
    if (d) xs.push(d);
  }
  if (Array.isArray(extra) && extra.length) xs.push(...extra);
  return xs.filter(Boolean).join(", ");
}

// 学習順序のざっくり版（無ければ使う）
function ensurePromptOrderLocal(arr){
  const key = s => String(s||"").toLowerCase().replace(/_/g,' ');
  const bucket = s=>{
    const k = key(s);
    if (k==='solo') return 0;
    if (/^\d+\s*(girl|boy|girls|boys)\b/.test(k)) return 0.1;
    if (/\bhair\b/.test(k) && !/\b(bob|ponytail|bun|cut|bangs)\b/.test(k)) return 1.0;
    if (/\b(almond|round|slanted|monolid|hooded)\s*eyes?\b/.test(k)) return 1.1;
    if (/\beyes?\b/.test(k)) return 1.2;
    if (/\bskin\b/.test(k)) return 1.3;
    if (/\b(t-?shirt|shirt|blouse|hoodie|jacket|coat|sweater|dress|one ?-?piece|gown|top|bottom|skirt|pants|shorts|jeans|shoes|boots|sandals)\b/.test(k)) return 1.5;
    if (/\b(late|early|teen|adult|child)\b|\bage\b/.test(k)) return 2.0;
    if (/\b(female|male|androgynous)\b/.test(k)) return 2.1;
    if (/\b(slim|voluptuous|curvy|athletic|petite|build)\b/.test(k)) return 2.2;
    if (/\b(average height|short|tall|height)\b/.test(k)) return 2.3;
    if (/\b(bob|ponytail|bun|pixie|bangs|cut)\b/.test(k)) return 2.6;
    if (/(?:^| )plain background|studio background|background$/.test(k)) return 3.0;
    if (/\b(standing|sitting|kneeling|lying|pose)\b/.test(k)) return 3.1;
    if (/\b(centered composition|composition)\b/.test(k)) return 3.2;
    if (/\b(front view|three-quarters|profile|side view|back view|looking|eye-level|angle)\b/.test(k)) return 3.3;
    if (/\b(neutral expression|smiling|serious|determined|blush|pouting|surprised)\b/.test(k)) return 3.4;
    if (/\b(soft lighting|even lighting|normal lighting|lighting)\b/.test(k)) return 3.5;
    if (k==='nsfw') return -0.5;
    if (/\b(exposure|underwear|lingerie|bikini|swimsuit|nipple|areola|pasties|topless|bottomless|nude)\b/.test(k)) return 5.0;
    return 9;
  };
  return (arr||[]).map((t,i)=>({t,i,b:bucket(t)}))
                  .sort((a,b)=> a.b===b.b ? a.i-b.i : a.b-b.b)
                  .map(x=>x.t);
}




// どの関数が何を返してるか確認
function debugWearColors(){
  const getProd = (typeof getProdWearColorTag==='function') ? getProdWearColorTag : _=> '';
  const getWear = (typeof getWearColorTag==='function') ? getWearColorTag : _=> '';

  const topP = (getProd('top')||'').trim();
  const botP = (getProd('bottom')||'').trim();
  const shP  = (getProd('shoes')||'').trim();

  const topW = (getWear('top')||'').trim();
  const botW = (getWear('bottom')||'').trim();
  const shW  = (getWear('shoes')||'').trim();

  console.log('[color] prod:', {topP, botP, shP});
  console.log('[color] wear:', {topW, botW, shW});

  // 今のタグ列を擬似的に作って色パイプライン前後を比較
  let p = [];
  if (typeof getOutfitNouns==='function') p.push(...getOutfitNouns().map(asTag));
  if (typeof injectWearColorPlaceholders==='function') injectWearColorPlaceholders(p);
  const before = p.slice();
  if (typeof pairWearColors==='function') p = pairWearColors(p);
  // dress に top の色がのってるか確認（撮影/学習は forceDressColor/_forceDressColor もある）
  const topColor = topP || topW;
  if (topColor){
    p = p.map(t=>{
      if (/\b(one ?-?piece|dress|gown)\b/i.test(String(t))) {
        return `${topColor} ${String(t).replace(/^(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+/i,'')}`;
      }
      return t;
    });
  }
  console.log('[color] before:', before);
  console.log('[color] after :', p);
}

// one-piece への色適用がズレてないか点検
function validateDressColor(tags){
  const txt = Array.isArray(tags) ? tags.join(', ') : String(tags||'');
  const m = txt.match(/\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+(one ?-?piece|dress|gown)\b/i);
  const top = (typeof getProdWearColorTag==='function' && getProdWearColorTag('top')) 
           || (typeof getWearColorTag==='function' && getWearColorTag('top')) || '';
  console.log('[dress-check] found:', m && m[1], ' expected top:', top);
}


// --- 追加：プレースホルダ掃除 ---
const PLACEHOLDER_WORDS = new Set([
  'background','body','view','expression','upper_body','full_body' // 必要なら足してOK
]);
function dropPlaceholders(arr){
  return (arr||[]).filter(t=>{
    const s = String(t||'').trim().toLowerCase();
    return s && !PLACEHOLDER_WORDS.has(s);
  });
}

// --- 追加：最終整形（単一化→順序→重複→プレース掃除）---
function finalizePromptArray(p){
  if (!Array.isArray(p)) p = [];
  if (typeof enforceSingletonByCategory==='function')
    p = enforceSingletonByCategory(p, { addDefaults:true, keep:'last' });
  if (typeof unifyLightingOnce==='function') p = unifyLightingOnce(p);
  if (typeof ensurePromptOrder==='function') p = ensurePromptOrder(p);
  else if (typeof ensurePromptOrderLocal==='function') p = ensurePromptOrderLocal(p);
  if (typeof fixExclusives==='function') p = fixExclusives(p);
  if (typeof enforceHeadOrder==='function') p = enforceHeadOrder(p);
  if (typeof enforceSingleBackground==='function') p = enforceSingleBackground(p);

  // プレースホルダ掃除＆重複排除
  p = dropPlaceholders(p);
  p = Array.from(new Set(p.map(x=>String(x||'').trim()))).filter(Boolean);

  // NSFWは常に先頭（入っていれば）
  p = p.filter(x => String(x).toUpperCase() !== 'NSFW');
  const hasNSFW = (arr=[]) => arr.some(x=>String(x).toUpperCase()==='NSFW');
  if (hasNSFW(p)) p.unshift('NSFW');

  // soloは必ず先頭（NSFWより後にしない）
  const soloIdx = p.indexOf('solo');
  if (soloIdx > 0){ p.splice(soloIdx,1); p.unshift('solo'); }

  return p;
}



/* ===== helpers for learning batch ===== */

// 既存の pickEnTag 参照を満たす：UI選択値→英語tag（noneは落とす）
function pickEnTag(scrollerId){
  const v = (typeof pickOneFromScroller==='function') ? pickOneFromScroller(scrollerId) : "";
  if (!v) return "";
  const s = String(v).trim();
  if (!s || s.toLowerCase()==='none') return "";
  return asTag(s);
}

// NSFW を1つだけ先頭に
function pushNSFWFirst(arr){
  const out = (arr||[]).filter(t => String(t).toUpperCase()!=='NSFW');
  out.unshift('NSFW');
  return out;
}





// === 共通ヘルパ：最終整形（単一化→順序→重複→プレース掃除→NSFW/solo先頭）===
function finalizePromptArray(p){
  if (!Array.isArray(p)) p = [];
  if (typeof enforceSingletonByCategory==='function')
    p = enforceSingletonByCategory(p, { addDefaults:true, keep:'last' });
  if (typeof unifyLightingOnce==='function') p = unifyLightingOnce(p);
  if (typeof ensurePromptOrder==='function') p = ensurePromptOrder(p);
  else if (typeof ensurePromptOrderLocal==='function') p = ensurePromptOrderLocal(p);
  if (typeof fixExclusives==='function') p = fixExclusives(p);
  if (typeof enforceHeadOrder==='function') p = enforceHeadOrder(p);
  if (typeof enforceSingleBackground==='function') p = enforceSingleBackground(p);

  p = dropPlaceholders(p);
  p = Array.from(new Set(p.map(x=>String(x||'').trim()))).filter(Boolean);

  // NSFW先頭（入っていれば）
  let hasNS = false;
  p = p.filter(x => {
    const isNS = String(x).toUpperCase()==='NSFW';
    if (isNS) hasNS = true;
    return !isNS;
  });
  if (hasNS) p.unshift('NSFW');

  // solo 必ず先頭（NSFWより後にしない）
  const soloIdx = p.indexOf('solo');
  if (soloIdx > 0){ p.splice(soloIdx,1); p.unshift('solo'); }

  return p;
}

// === 共通ヘルパ：色パイプライン（ワンピ＝top色、靴＝shoes色、top/bottom色パーツは出力から除去） ===
const COLOR_WORD_RE = /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\b/i;
function applyWearColorPipeline(p, palette){
  if (typeof injectWearColorPlaceholders==='function') injectWearColorPlaceholders(p);
  if (typeof pairWearColors==='function') p = pairWearColors(p);

  const topColor   = (palette?.top||'').trim();
  const shoesColor = (palette?.shoes||'').trim();

  // ワンピは top 色で上書き
  const dIdx = (p||[]).findIndex(t=>/\b(one ?-?piece|dress|gown)\b/i.test(String(t||'')));
  if (dIdx >= 0 && topColor){
    p[dIdx] = String(p[dIdx]||'')
      .replace(new RegExp(`^${COLOR_WORD_RE.source}\\s+`,'i'),'')
      .replace(/\s+/g,' ')
      .trim();
    p[dIdx] = `${topColor} ${p[dIdx]}`.trim();
  }

  // "white top" / "azure bottom" 等は出力から除去
  p = (p||[]).filter(t => !/^\s*(?:white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+(?:top|bottom)\s*$/i.test(String(t||'')));

  // 靴の色を shoesColor で上書き
  if (shoesColor){
    p = p.map(tag=>{
      const s = String(tag||'');
      if (/\b(shoes|boots|sneakers|loafers|sandals|heels|mary janes|geta|zori)\b/i.test(s)){
        const base = s.replace(new RegExp(`^${COLOR_WORD_RE.source}\\s+`,'i'), '').trim();
        return `${shoesColor} ${base}`.trim();
      }
      return tag;
    });
  }
  return p;
}

// === 共通ヘルパ：ネガの共通ビルド（UI空ならフォールバック） ===
function buildNeg({useDefault=false, userNeg=""}={}){
  const parts = [];
  if (useDefault && typeof getCommonDefaultNeg==='function'){
    const d = getCommonDefaultNeg(); if (d) parts.push(d);
  }
  if (userNeg) parts.push(userNeg);
  if (!parts.length && typeof getNeg==='function'){
    const g = getNeg(); if (g) parts.push(g);
  }
  return parts.filter(Boolean).join(', ');
}


// ▼ 学習モード：NSFW収集ヘルパ（複数→単一の順で拾う。ID表記ゆれも面倒見る）
function _collectNSFW(idsOrId){
  const ids = Array.isArray(idsOrId) ? idsOrId : [idsOrId];
  let out = [];
  for (const id of ids){
    // 1) 複数選択（getMany）があれば最優先
    if (typeof getMany === 'function'){
      const many = getMany(id) || [];
      if (many.length){
        out.push(...many.map(asTag).filter(Boolean));
        continue;
      }
    }
    // 2) 単一選択（pickOneFromScroller）でフォールバック
    if (typeof pickOneFromScroller === 'function'){
      const one = pickOneFromScroller(id);
      if (one) out.push(asTag(one));
    }
  }
  return out;
}











/* ===== 学習モード：1枚テスト（服“完全なし”対応・固定アクセ常時適用） ===== */
function buildOneLearning(extraSeed = 0){
  _dbg('enter buildOneLearning', {extraSeed});

  const AS_IS = t => String(t||"").trim();  // normalize/asTag 不使用
  const _text = id => (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();
  const _tag  = id => AS_IS(_text(id));

  // 固定アクセ（常時）
  const accSel = (document.getElementById('learn_acc')?.value || "").trim();
  const accTag = AS_IS(accSel);
  const accClr = _tag('tag_learnAcc'); // 例: "black"
  const fixedAccToken = accTag ? (accClr ? `${accClr} ${accTag}` : accTag) : "";

  // 服モード（basic / generic → generic は完全になし）
  const wearMode = (document.querySelector('input[name="learnWearMode"]:checked')?.value || 'basic');

  let p = ["solo"];
  _dbg('init p', p.slice());

  // 人数（1girl / 1boy）
  if (typeof getGenderCountTag === 'function'){
    const g = getGenderCountTag() || "";
    if (g) p.push(AS_IS(g));
  }

  // 基本情報
  p.push(...[
    pickTag('bf_age'), pickTag('bf_gender'), pickTag('bf_body'), pickTag('bf_height'),
    pickTag('hairStyle'), pickTag('eyeShape'),
    _tag('tagH'), _tag('tagE'), _tag('tagSkin')
  ].filter(Boolean).map(AS_IS));

  // シーン系（UIにある分だけ）
  p.push(...[
    pickTag('bg'), pickTag('pose'), pickTag('comp'),
    pickTag('view'), pickTag('expr'), pickTag('lightLearn')
  ].filter(Boolean).map(AS_IS));

  // 固定アクセ（常時）
  if (fixedAccToken) p.push(fixedAccToken);

  // 服（SFWのみ）
  if (wearMode === 'basic'){
    if (typeof getOutfitNouns==='function')             p.push(...getOutfitNouns().map(AS_IS));
    if (typeof injectWearColorPlaceholders==='function') injectWearColorPlaceholders(p);

    // 色パイプライン
    const normColor = v => {
      const s = String(v||'').trim().toLowerCase();
      return (s && s!=='none') ? s : '';
    };
    const pal = {
      top:   normColor(getWearColorTag?.('top')    || getProdWearColorTag?.('top')),
      bottom:normColor(getWearColorTag?.('bottom') || getProdWearColorTag?.('bottom')),
      shoes:normColor(getWearColorTag?.('shoes')   || getProdWearColorTag?.('shoes')),
    };
    if (typeof pairWearColors==='function')           p = pairWearColors(p);
    if (typeof applyWearColorPipeline==='function')   p = applyWearColorPipeline(p, window.PC || pal || {});
  }
  // generic は何も入れない（完全なし）

  // solo を先頭に維持
  if (p[0] !== "solo"){
    const idx = p.indexOf("solo");
    if (idx > 0){ p.splice(idx,1); p.unshift("solo"); }
  }

  // 固定タグ（学習タブ）
  const fixed = (document.getElementById('fixedLearn')?.value || "").trim();
  if (fixed){
    const f = (typeof splitTags==='function') ? splitTags(fixed) : fixed.split(/\s*,\s*/);
    p = [...f.map(AS_IS).filter(Boolean), ...p];
    if (p[0] !== "solo"){
      const idx = p.indexOf("solo");
      if (idx > 0){ p.splice(idx,1); p.unshift("solo"); }
    }
  }

  // ネガ
  const useDefNeg = !!document.getElementById('useDefaultNeg')?.checked;
  const addNeg    = (document.getElementById('negLearn')?.value || "").trim();
  const neg = buildNeg({useDefault:useDefNeg, userNeg:addNeg});

  // seed
  const seed = (typeof seedFromName === 'function')
    ? seedFromName((document.getElementById('charName')?.value || ''), extraSeed)
    : extraSeed;

  const prompt = p.join(", ");
  const text = `${prompt}${neg?` --neg ${neg}`:""} seed:${seed}`;
  _dbg('return one-learning', {prompt, seed, neg});
  return { seed, pos:p, neg, text };
}

















/* ====================== 学習モード：服“完全なし”対応・固定アクセ常時適用・NSFW(衣装/体型)固定適用（asTag/normalize不使用, 背景UI優先） ====================== */
function buildBatchLearning(n){
  const rows = [];
  const wantCount = Math.max(1, Number(n)||1);

  const AS_IS = t => String(t||"").trim();
  const _text = id => (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();
  const _tag  = id => AS_IS(_text(id));
  const _many = id => (typeof getMany==='function' ? (getMany(id)||[]) : []).map(AS_IS).filter(Boolean);

  // 固定アクセ（全行共通）
  const accSel = (document.getElementById('learn_acc')?.value || "").trim();
  const accTag = AS_IS(accSel);
  const accClr = _tag('tag_learnAcc');
  const fixedAccToken = accTag ? (accClr ? `${accClr} ${accTag}` : accTag) : "";

  // 服モード
  const wearMode = (document.querySelector('input[name="learnWearMode"]:checked')?.value || 'basic');

  // NSFW
  const nsfwOn = !!document.getElementById('nsfwLearn')?.checked;
  const nsfwBodySelRaw   = nsfwOn ? _many('nsfwL_body')   : [];
  const nsfwOutfitSelRaw = nsfwOn ? _many('nsfwL_outfit') : [];

  const NSFW_OK_OUTFIT = new Set(((window.NSFW_LEARN_SCOPE?.outfit)||[]).map(s=>String(s).toLowerCase()));
  const NSFW_OK_BODY   = new Set(((window.NSFW_LEARN_SCOPE?.body)||[]).map(s=>String(s).toLowerCase()));
  const keepIf = (set, xs)=> xs.filter(t => set.size ? set.has(String(t).toLowerCase()) : true);
  const nsfwOutfitSel = keepIf(NSFW_OK_OUTFIT, nsfwOutfitSelRaw);
  const nsfwBodySel   = keepIf(NSFW_OK_BODY,   nsfwBodySelRaw);

  // 固定タグ
  const fixedText = (document.getElementById('fixedLearn')?.value || "").trim();
  const fixed = fixedText
    ? ((typeof splitTags==='function') ? splitTags(fixedText) : fixedText.split(/\s*,\s*/)).map(AS_IS).filter(Boolean)
    : [];

  // ネガ
  const useDefNeg = !!document.getElementById('useDefaultNeg')?.checked;
  const addNeg    = (document.getElementById('negLearn')?.value || "").trim();

  // 年齢セーフガード
  const MINOR_AGE_TAGS = new Set(["newborn","toddler","child","preteen","early_teen","teen"]);
  const ADULT_FALLBACK = "young adult (18+)";
  const filterAgeForNSFW = (tags)=>{
    const out = [];
    for (const t of tags){
      const s = AS_IS(t);
      if (!s) continue;
      if (MINOR_AGE_TAGS.has(s.toLowerCase())) continue;
      out.push(s);
    }
    if (!out.some(t => /adult|20s|30s|40s|50s|60s/i.test(t))) out.push(ADULT_FALLBACK);
    return out;
  };

  for (let i=0;i<wantCount;i++){
    let p = ["solo"];

    // 1girl/1boy
    if (typeof getGenderCountTag === 'function'){
      const g = getGenderCountTag() || "";
      if (g) p.push(AS_IS(g));
    }

    // 基本情報
    p.push(...[
      pickTag('bf_age'), pickTag('bf_gender'), pickTag('bf_body'), pickTag('bf_height'),
      pickTag('hairStyle'), pickTag('eyeShape'),
      _tag('tagH'), _tag('tagE'), _tag('tagSkin')
    ].filter(Boolean).map(AS_IS));

    // 服
    if (!nsfwOn && wearMode === 'basic'){
      let wearAdded = false;
      if (typeof getOutfitNouns==='function'){
        const nouns = getOutfitNouns().map(AS_IS).filter(Boolean);
        if (nouns.length){ p.push(...nouns); wearAdded = true; }
      }
      if (wearAdded && typeof injectWearColorPlaceholders==='function') injectWearColorPlaceholders(p);
      if (wearAdded && typeof pairWearColors==='function')              p = pairWearColors(p);
      if (wearAdded && typeof applyWearColorPipeline==='function'){
        p = applyWearColorPipeline(p, getColorTagsFromUI?.() || {});
      }
    }

    // 固定アクセ
    if (fixedAccToken) p.push(fixedAccToken);

    // NSFW outfit/body
    if (nsfwOn){
      if (typeof stripSfwWearWhenNSFW==='function') p = stripSfwWearWhenNSFW(p);
      const notNS = t => AS_IS(t).toUpperCase() !== "NSFW";
      if (nsfwOutfitSel.length) p.push(...nsfwOutfitSel.map(AS_IS).filter(notNS));
      if (nsfwBodySel.length)   p.push(...nsfwBodySel.map(AS_IS).filter(notNS));
      p = filterAgeForNSFW(p);
    }

    // シーン系 → ★ UI優先
    const bgUI  = pickTag('bg');
    const bgMix = (typeof pickByMixRules==='function') ? pickByMixRules('bg','bg') : "";
    const bg    = bgUI || bgMix;

    const comp = pickTag('comp') || ((typeof pickByMixRules==='function') ? pickByMixRules('comp','comp') : "");
    const view = pickTag('view') || ((typeof pickByMixRules==='function') ? pickByMixRules('view','view') : "");
    const expr = pickTag('expr') || ((typeof pickByMixRules==='function') ? pickByMixRules('expr','expr') : "");
    const lite = pickTag('lightLearn') || ((typeof pickByMixRules==='function') ? pickByMixRules('light','lightLearn') : "");

    p.push(...[bg, comp, view, expr, lite].filter(Boolean));

    // background ダミーを削除
    p = p.filter(t => AS_IS(t).toLowerCase() !== 'background');

    // buildPromptCore
    const charName = document.getElementById('charName')?.value || "";
    let out = (typeof buildPromptCore==='function')
      ? buildPromptCore({ tags:p, nsfwOn, fixed, addNeg, useDefNeg, charName, seedOffset:(i+1), singletonDefaults:false, singletonKeep:'last' })
      : (function fallback(){
          const seed = (typeof seedFromName==='function') ? seedFromName(charName,(i+1)) : (i+1);
          const neg  = (typeof buildNegative==='function') ? buildNegative(addNeg,useDefNeg) : addNeg;
          const prompt = Array.from(new Set(p.filter(Boolean))).join(", ");
          return { seed, pos:p.slice(), neg, prompt, text:`${prompt}${neg?` --neg ${neg}`:""} seed:${seed}` };
        })();

    // ヘッダ固定
    if (nsfwOn && out && Array.isArray(out.pos)){
      const body = out.pos.filter(t => {
        const s = AS_IS(t);
        return s.toUpperCase()!=="NSFW" && s!=="solo";
      });
      out.pos = ["NSFW","solo",...body];
      out.prompt = out.pos.join(", ");
      out.text   = `${out.prompt}${out.neg?` --neg ${out.neg}`:""} seed:${out.seed}`;
    } else if (!nsfwOn && out && Array.isArray(out.pos)){
      const body = out.pos.filter(t => AS_IS(t) !== "solo");
      out.pos = ["solo",...body];
      out.prompt = out.pos.join(", ");
      out.text   = `${out.prompt}${out.neg?` --neg ${out.neg}`:""} seed:${out.seed}`;
    }

    rows.push(out);
  }
  return rows;
}









/* ===== 撮影モード：UI尊重（補完なし）/ NSFW→solo固定 / none & Rラベル掃除（asTag/normalize不使用） ===== */
function pmBuildOne(){
  const AS_IS = t => String(t || "").trim();
  const _isRating = t => /^R[\s-]?1[58](?:[\s-]?G)?$/i.test(String(t||""));
  const _clean = arr => (arr||[])
    .map(x => AS_IS(x))
    .filter(x => x && x.toLowerCase()!=='none' && !_isRating(x));

  // 単一/複数どちらのUIにも対応する安全取得
  const pickManySafe = (id) => {
    if (typeof getMany === 'function') {
      const arr = getMany(id) || [];
      if (Array.isArray(arr) && arr.length) return arr;
    }
    const one = (typeof pickOneFromScroller === 'function') ? pickOneFromScroller(id) : "";
    return one ? [one] : [];
  };

  let p = ["solo"];

  // 基本情報（UIそのまま）
  const basics = [
    pickTag('bf_age'), pickTag('bf_gender'), pickTag('bf_body'), pickTag('bf_height'),
    pickTag('hairStyle'), pickTag('eyeShape'),
    textTag('tagH'), textTag('tagE'), textTag('tagSkin')
  ].filter(Boolean).map(AS_IS);
  p.push(...basics);

  // SFW服（名詞→色ペアリング）※asTag使わない
  if (typeof getOutfitNouns==='function')              p.push(...getOutfitNouns().map(AS_IS).filter(Boolean));
  if (typeof injectWearColorPlaceholders==='function') injectWearColorPlaceholders(p);
  if (typeof pairWearColors==='function')              p = pairWearColors(p);

  // 色（ワンピ＝top色など）
  const pal = {
    top:   AS_IS(getWearColorTag?.('top')    || getProdWearColorTag?.('top')    || ''),
    bottom:AS_IS(getWearColorTag?.('bottom') || getProdWearColorTag?.('bottom') || ''),
    shoes: AS_IS(getWearColorTag?.('shoes')  || getProdWearColorTag?.('shoes')  || '')
  };
  if (typeof applyWearColorPipeline==='function') p = applyWearColorPipeline(p, pal);

  // シーン（UIそのまま・プレースホルダ入れない／UI優先）
  const bg   = AS_IS(pickTag('pl_bg'));   // ← UI選択をそのまま
  const pose = AS_IS(pickTag('pl_pose'));
  const comp = AS_IS(pickTag('pl_comp'));
  const view = AS_IS(pickTag('pl_view'));
  let expr   = AS_IS(pickTag('pl_expr')  || "neutral expression");
  let lite   = AS_IS(pickTag('pl_light') || "soft lighting");
  const chosenLiteRaw = lite;

  // —— NSFW（UIだけ反映）——
  const nsfwOn = !!document.getElementById('pl_nsfw')?.checked;
  let nsfwAdd = [];
  let nsfwLightChosen = "";
  if (nsfwOn){
    const ex2 = AS_IS((pickManySafe('pl_nsfw_expr').filter(Boolean).filter(t=>!_isRating(t))[0]) || "");
    const li2 = AS_IS((pickManySafe('pl_nsfw_light').filter(Boolean).filter(t=>!_isRating(t))[0]) || "");
    if (ex2) expr = ex2;
    if (li2) { lite = li2; nsfwLightChosen = li2; }
    nsfwAdd = [
      ...pickManySafe('pl_nsfw_expo'),
      ...pickManySafe('pl_nsfw_underwear'),
      ...pickManySafe('pl_nsfw_outfit'),
      ...pickManySafe('pl_nsfw_situ'),
      ...pickManySafe('pl_nsfw_pose'),
      ...pickManySafe('pl_nsfw_acc'),
      ...pickManySafe('pl_nsfw_body'),
      ...pickManySafe('pl_nsfw_nipple'),
    ]
    .map(AS_IS)
    .filter(x => x && x.toLowerCase() !== 'none' && !_isRating(x));
    if (typeof stripSfwWearWhenNSFW==='function') p = stripSfwWearWhenNSFW(p);
    p.push(...nsfwAdd);
  }

  // シーン確定（選択値を素直に入れる）
  p.push(...[bg, pose, comp, view, expr, lite].filter(Boolean));

  // 表情・ポーズ単一化（ライトは後で）
  if (typeof unifyExprOnce  === 'function') p = unifyExprOnce(p);
  if (typeof unifyPoseOnce  === 'function') p = unifyPoseOnce(p);

  // —— 最終整形（UI尊重）——
  p = _clean(p);
  if (typeof ensurePromptOrder==='function')           p = ensurePromptOrder(p);
  else if (typeof ensurePromptOrderLocal==='function') p = ensurePromptOrderLocal(p);
  if (typeof fixExclusives==='function')               p = fixExclusives(p);
  if (typeof enforceHeadOrder==='function')            p = enforceHeadOrder(p);

  // 背景のプレースホルダ "background" は常に除去（具体背景だけ残す）
  p = p.filter(t => AS_IS(t).toLowerCase() !== 'background');

  // ライト一本化（NSFW優先・フォールバック無し）
  if (typeof isLightingTag === 'function'){
    const desiredLight = nsfwOn ? (nsfwLightChosen || "") : (chosenLiteRaw || "");
    p = p.filter(t => !isLightingTag(t));
    if (desiredLight) p.push(desiredLight);
    if (typeof ensurePromptOrder==='function')           p = ensurePromptOrder(p);
    else if (typeof ensurePromptOrderLocal==='function') p = ensurePromptOrderLocal(p);
  }

  // ヘッダ固定（NSFW→solo）
  if (nsfwOn){
    p = p.filter(t => t.toUpperCase()!=='NSFW' && t!=='solo');
    p = ["NSFW", "solo", ...p];
  } else {
    const i = p.indexOf("solo");
    if (i>0){ p.splice(i,1); p.unshift("solo"); }
    if (i===-1) p.unshift("solo");
  }

  // LoRA を最前列へ（solo/NSFWより前）
  if (typeof putLoraAtHead === 'function') {
    p = putLoraAtHead(p, { nsfwOn });
  }

  // 固定タグ（追加のみ・補完なし）
  const fixed = (document.getElementById('fixedPlanner')?.value || "").trim();
  if (fixed){
    const f = (typeof splitTags==='function') ? splitTags(fixed) : fixed.split(/\s*,\s*/);
    p = _clean([ ...p, ...f.map(AS_IS).filter(Boolean) ]);
    if (typeof enforceHeadOrder==='function') p = enforceHeadOrder(p);
    // ヘッダ再固定
    if (nsfwOn){
      p = p.filter(t => t.toUpperCase()!=='NSFW' && t!=='solo');
      p = ["NSFW", "solo", ...p];
    } else {
      const i2 = p.indexOf("solo");
      if (i2>0){ p.splice(i2,1); p.unshift("solo"); }
      if (i2===-1) p.unshift("solo");
    }
    // 念のためプレースホルダ再除去
    p = p.filter(t => AS_IS(t).toLowerCase() !== 'background');
  }

  // ネガ
  const useDefNeg = !!document.getElementById('pl_useDefaultNeg')?.checked;
  const addNeg    = (document.getElementById('negPlanner')?.value || "").trim();
  const neg = buildNegative(addNeg, useDefNeg);

  const name  = (document.getElementById('charName')?.value || "");
  const seed  = (typeof seedFromName==='function') ? seedFromName(name,1) : 1;
  const prompt= p.join(", ");
  return [{ seed, pos:p, prompt, neg, text: `${prompt}${neg?` --neg ${neg}`:""} seed:${seed}` }];
}








/* ====================== 量産モード（最終版・置換用 / asTag・normalizeTag不使用） ====================== */
function buildBatchProduction(n){
  const want = Math.max(1, Number(n) || 1);
  const seedMode = (document.querySelector('input[name="seedMode"]:checked') || {}).value || "fixed";

  // asTag/normalizeなし：そのまま通す（trimのみ）
  const asIs  = t => String(t||"").trim();
  const _pick = arr => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random()*arr.length)] : "");

  const _isRating = t => /^R[\s-]?1[58](?:[\s-]?G)?$/i.test(String(t||""));
  const _clean = arr => (arr||[])
    .map(x => asIs(x))
    .filter(x => x && x.toLowerCase()!=='none' && !_isRating(x));

  const fixedArr = (typeof getFixedProd === 'function') ? (getFixedProd() || []) : [];
  const negUI    = (typeof getNegProd   === 'function') ? (getNegProd()   || "") : "";

  // 衣装プリセット（UI側JSON）
  const Oraw = (typeof readProductionOutfits === 'function') ? (readProductionOutfits() || {}) : {};
  const O = {
    top:   Array.isArray(Oraw.top)   ? Oraw.top   : [],
    pants: Array.isArray(Oraw.pants) ? Oraw.pants : [],
    skirt: Array.isArray(Oraw.skirt) ? Oraw.skirt : [],
    dress: Array.isArray(Oraw.dress) ? Oraw.dress : [],
    shoes: Array.isArray(Oraw.shoes) ? Oraw.shoes : []
  };

  // 差分カテゴリ（複数選択可）
  const _gm = id => (typeof getMany === 'function' ? (getMany(id)||[]) : []);
  const bgs    = _gm("p_bg");
  const poses  = _gm("p_pose");
  const comps  = _gm("p_comp");
  const views  = _gm("p_view");
  const exprs  = _gm("p_expr");
  const lights = _gm("p_light");
  const accSel = (typeof readAccessorySlots==='function' ? (readAccessorySlots()||[]) : []);

  // NSFWパネル
  const nsfwOn = !!((document.getElementById("nsfwProd") || {}).checked);
  const nsfw = nsfwOn ? {
    expr:  _gm("nsfwP_expr"),
    expo:  _gm("nsfwP_expo"),
    situ:  _gm("nsfwP_situ"),
    light: _gm("nsfwP_light"),
    pose:  _gm("nsfwP_pose"),
    acc:   _gm("nsfwP_acc"),
    outfit:_gm("nsfwP_outfit"),
    body:  _gm("nsfwP_body"),
    nip:   _gm("nsfwP_nipple"),
    under: _gm("nsfwP_underwear")
  } : null;

  // 基準色（top / bottom / shoes）
  const getColorTagSafe = (typeof getProdWearColorTag==='function')
    ? slot => (getProdWearColorTag(slot) || "")
    : _ => "";
  const PC = {
    top:    asIs(getColorTagSafe("top")),
    bottom: asIs(getColorTagSafe("bottom")),
    shoes:  asIs(getColorTagSafe("shoes"))
  };

  // seed
  const cnEl = document.getElementById('charName');
  const charName = cnEl ? cnEl.value : "";
  const baseSeed = (typeof seedFromName === 'function') ? seedFromName(charName || "", 0) : 0;

  const out  = [];
  const seen = new Set();
  let guard  = 0;

  while (out.length < want && guard++ < want*20){
    let p = ["solo"];
    let sfwLightChosen = "";   // SFWで選ばれたライト（後で1個だけ残す）
    let nsfwLightChosen = "";  // NSFWで選ばれたライト（優先）

    // 1girl/1boy
    const genderCount = (typeof getGenderCountTag === 'function') ? (getGenderCountTag() || "") : "";
    if (genderCount) p.push(asIs(genderCount));

    // 基本情報（髪/瞳/肌はテキスト欄、他はセレクタ）
    const basics = [
      ((document.getElementById('tagH')||{}).textContent || (document.getElementById('tagH')||{}).value || ""),
      ((document.getElementById('tagE')||{}).textContent || (document.getElementById('tagE')||{}).value || ""),
      ((document.getElementById('tagSkin')||{}).textContent || (document.getElementById('tagSkin')||{}).value || ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('bf_age')     : ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('bf_gender')  : ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('bf_body')    : ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('bf_height')  : ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('hairStyle')  : ""),
      (typeof pickOneFromScroller==='function' ? pickOneFromScroller('eyeShape')   : "")
    ].map(asIs).filter(Boolean);
    p.push(...basics);

    // 服（ワンピ3割 / 上下7割）
    let choseDress = false;
    if (O.dress.length && Math.random() < 0.33){
      const d = asIs(_pick(O.dress));
      if (d){ p.push(d); choseDress = true; }
    } else {
      if (O.top.length) {
        const t = asIs(_pick(O.top));
        if (t) p.push(t);
      }
      const bottomPool = [].concat(O.pants||[], O.skirt||[]);
      if (bottomPool.length){
        const b = asIs(_pick(bottomPool));
        if (b) p.push(b);
      }
    }
    if (O.shoes.length){
      const s = asIs(_pick(O.shoes));
      if (s) p.push(s);
    }

    // 差分（背景/ポーズ/構図/視点/表情/光） + アクセ
    const pickedLight = _pick(lights);
    [ _pick(bgs), _pick(poses), _pick(comps), _pick(views), _pick(exprs) ]
      .filter(Boolean).forEach(x=> p.push(asIs(x)));
    if (pickedLight){
      sfwLightChosen = asIs(pickedLight);
      p.push(sfwLightChosen);
    }
    (accSel||[]).forEach(x=> p.push(asIs(x)));

    // 色パイプライン（dress=top色、shoes=shoes色、色パーツを正規化）※入力タグはasIsのまま
    if (typeof applyWearColorPipeline === 'function'){
      p = applyWearColorPipeline(p, { top:PC.top, bottom:PC.bottom, shoes:PC.shoes });
    }

    // —— NSFW：SFW服掃除→NSFW要素追加→年齢ガード→ヘッダ整形 ——
    if (nsfwOn && nsfw){
      const addNS = _clean([
        _pick(nsfw.expo),  _pick(nsfw.under), _pick(nsfw.outfit),
        _pick(nsfw.expr),  _pick(nsfw.situ),
        (nsfwLightChosen = asIs(_pick(nsfw.light) || "")),
        _pick(nsfw.pose),  _pick(nsfw.acc),   _pick(nsfw.body), _pick(nsfw.nip)
      ]);

      if (typeof stripSfwWearWhenNSFW==='function') p = stripSfwWearWhenNSFW(p);
      p.push(...addNS);

      // 表情/ポーズは単一化、ライトは後段の一本化で処理
      if (typeof unifyExprOnce  === 'function') p = unifyExprOnce(p);
      if (typeof unifyPoseOnce  === 'function') p = unifyPoseOnce(p);

      // 年齢安全ガード：未成年表現は除去して 18+ を強制
      const idxAge = p.findIndex(t => /(^|\b)(teen|teens|under\s*18|\b\d{1,2}\s*yo\b|years\s*old)/i.test(String(t)));
      if (idxAge !== -1) p.splice(idxAge, 1);
      if (!p.some(t => /18\+|adult|young adult/i.test(String(t)))) p.push("young adult (18+)");

      // 先頭に NSFW を1つだけ
      p = p.filter(t => String(t).toUpperCase()!=="NSFW");
      p.unshift("NSFW");
    }

    // 固定タグ（量産タブ）は**先頭にしない**：ヘッダの後ろに追加
    if (fixedArr.length){
      const f = _clean(fixedArr.map(asIs));
      if (f.length) p = [...p, ...f];
    }

    // —— 最終整形：単一化→順序→重複→プレースホルダ掃除 ——
    if (typeof finalizePromptArray === 'function') p = finalizePromptArray(p);
    if (typeof ensurePromptOrder  === 'function')  p = ensurePromptOrder(p);
    else if (typeof ensurePromptOrderLocal === 'function') p = ensurePromptOrderLocal(p);
    if (typeof fixExclusives     === 'function')   p = fixExclusives(p);
    if (typeof enforceHeadOrder  === 'function')   p = enforceHeadOrder(p);
    if (typeof enforceSingleBackground === 'function') p = enforceSingleBackground(p);

    // ★ ライト一本化（NSFW優先・フォールバック無し）
    if (typeof isLightingTag === 'function'){
      p = p.filter(t => !isLightingTag(t)); // 全ライト除去
      const desiredLight = nsfwOn ? (nsfwLightChosen || "") : (sfwLightChosen || "");
      if (desiredLight) p.push(desiredLight);
      if (typeof ensurePromptOrder  === 'function')  p = ensurePromptOrder(p);
      else if (typeof ensurePromptOrderLocal === 'function') p = ensurePromptOrderLocal(p);
    }

    // ヘッダ：solo 位置の保険（NSFWなら NSFW→solo、それ以外は solo先頭）
    if (nsfwOn){
      p = p.filter(t => t!=='solo' && String(t).toUpperCase()!=='NSFW');
      p = ["NSFW", "solo", ...p];
    } else {
      const i = p.indexOf("solo");
      if (i>0){ p.splice(i,1); p.unshift("solo"); }
      if (i===-1) p.unshift("solo");
    }

    // LoRA を常に最前列へ（NSFW/soloより前）
    if (typeof putLoraAtHead === 'function') {
      p = putLoraAtHead(p, { nsfwOn });
    }

    // クリーニング最終
    p = _clean(p);

    const prompt = p.join(", ");
    if (seen.has(prompt)) continue;
    seen.add(prompt);

    // seed
    const idx = out.length + 1;
    const seed = (seedMode === "fixed")
      ? baseSeed
      : ((typeof seedFromName==='function')
          ? seedFromName(charName || "", idx)
          : (baseSeed + idx));

    // ネガ：UIが空ならデフォを自動補完（buildNegative を使用）
    const hasUI = !!asIs(negUI);
    const neg = buildNegative(hasUI ? negUI : "", /*useDefault*/ !hasUI);

    out.push({
      seed,
      pos: p,
      neg,
      prompt,
      text: `${prompt}${neg?` --neg ${neg}`:""} seed:${seed}`
    });
  }
  return out;
}

















/* ===== 撮影モード ===== */
function pmGetFixed(){
  const v = document.getElementById("fixedPlanner")?.value
         ?? document.getElementById("fixedManual")?.value; // 旧ID互換
  return splitTags(v);
}
function pmGetNeg(){
  const useDef = !!document.getElementById("pl_useDefaultNeg")?.checked;
  const extra  = (document.getElementById("negPlanner")?.value
               ?? document.getElementById("negGlobal")?.value  // 旧ID互換
               ?? "").trim();
  const base   = Array.isArray(NEG_TIGHT) ? NEG_TIGHT.join(", ") : String(NEG_TIGHT||"");
  return [useDef ? base : "", extra].filter(Boolean).join(", ");
}

/* ===== 学習モード：固定+基本情報を集約（pm系ナシ / bf_* 対応） ===== */
function getFixedLearn(){
  // 手入力の固定タグ（どちらか存在する方）
  const fromFixed =
    (document.getElementById("fixedLearn")?.value ?? "") ||
    (document.getElementById("fixedManual")?.value ?? "");

  const tokens = [];

  // ▼ 基本情報（scroller系は getMany から拾う）
  const addMany = (id)=>{
    try{
      if (typeof getMany === "function"){
        const v = getMany(id) || [];
        if (Array.isArray(v) && v.length) tokens.push(...v);
      }
    }catch(_){}
  };
  ["bf_age","bf_gender","bf_body","bf_height","hairStyle","eyeShape"].forEach(addMany);

  // ▼ 色：髪/瞳/肌（確定タグ表示をそのまま使う）
  const txt = id => (document.getElementById(id)?.textContent || "").trim();
  tokens.push(txt("tagH"), txt("tagE"), txt("tagSkin"));

  // ※ 服パーツ/服カラーはここには入れない（後段で合成するため）
  // ["outfit_top","outfit_dress","outfit_pants","outfit_skirt","outfit_shoes"].forEach(addMany);
  // tokens.push(txt("tag_top"), txt("tag_bottom"), txt("tag_shoes"));

  // ▼ まとめ → 分割 → 正規化 → 一意化
  const merged = [fromFixed, ...tokens.filter(Boolean)].join(", ");
  const split = (typeof splitTags === "function")
    ? splitTags(merged)
    : merged.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);

  const normed = (typeof normalizeTag === "function") ? split.map(normalizeTag) : split;
  return Array.from(new Set(normed));
}


function getNegLearn(){
  const useDef = !!document.getElementById("useDefaultNeg")?.checked;
  const extra  = (document.getElementById("negLearn")?.value
               ?? document.getElementById("negGlobal")?.value  // 旧ID互換
               ?? "").trim();
  const base   = Array.isArray(NEG_TIGHT) ? NEG_TIGHT.join(", ") : String(NEG_TIGHT||"");
  return [useDef ? base : "", extra].filter(Boolean).join(", ");
}

/* ===== 量産モード ===== */
function getFixedProd(){
  const v = document.getElementById("fixedProd")?.value
         ?? document.getElementById("fixedManual")?.value; // 旧ID互換
  return splitTags(v);
}
// 量産のネガは元からユニーク
function getNegProd(){
  return (document.getElementById("p_neg")?.value || "").trim();
}



/* ===== 辞書ベース判定 & 正規化ユーティリティ（置き換え） ===== */
(function(){
  // --- 汎用: ネスト取得
  function getByPath(root, path){
    return path.split('.').reduce((a,k)=> (a?a[k]:null), root);
  }

  // --- SFW/NSFW の辞書を探す
  function sniffSFWRoot(){
    const cands = ['SFW','sfw','DICT_SFW','dictSfw','app.dict.sfw','APP_DICT.SFW'];
    for (const k of cands){
      const v = getByPath(window, k);
      if (v && typeof v === 'object') return v;
    }
    return null;
  }
  function sniffNSFWRoot(){
    const cands = ['NSFW','nsfw','DICT_NSFW','dictNsfw','app.dict.nsfw','APP_DICT.NSFW'];
    for (const k of cands){
      const v = getByPath(window, k);
      if (v && typeof v === 'object') return v;
    }
    return null;
  }

  // --- 正規化
  function normTag(x){
    return String((x && (x.en || x.tag || x.value)) || '').trim().toLowerCase();
  }

  // --- 再構築（SFW 通常服 / NSFW 露出カテゴリ）
  function rebuildWearSets(){
    // SFW 側（通常服カテゴリ）
    const sfw = sniffSFWRoot() || {};
    const top = sfw.SFW || sfw.sfw || sfw;
    const cat = top.categories || top;
    // 追加・修正：SFW 通常服を再構築
    const wearArr = []
     .concat(cat?.top      || [])
     .concat(cat?.bottom   || [])
     .concat(cat?.dress    || [])
     .concat(cat?.outer    || [])
     .concat(cat?.footwear || [])
     .concat(cat?.outfit   || []);  // ★ これを追加（outfit一括対応）
    const setWear = new Set();
    (Array.isArray(wearArr)?wearArr:[]).forEach(o=>{
      const t = normTag(o); if (t) setWear.add(t);
    });

    // NSFW 側（露出/下着/NSFW衣装）
    const nsfw = sniffNSFWRoot() || {};
    const ntop = nsfw.NSFW || nsfw.nsfw || nsfw;
    const ncat = ntop.categories || ntop;
    const toSet = (arr)=> {
      const s = new Set();
      (Array.isArray(arr)?arr:[]).forEach(o=>{ const t = normTag(o); if (t) s.add(t); });
      return s;
    };

    window.WEAR_SFW = setWear; // 通常服のベース語セット
    window.NSFW_SETS = {
      EXPOSURE : toSet(ncat?.exposure),
      UNDERWEAR: toSet(ncat?.underwear),
      OUTFIT   : toSet(ncat?.outfit)
    };
  }

  // --- 露出系の検出（辞書ベース。末尾語フォールバック有）
  window.hasExposureLike = window.hasExposureLike || function(parts){
    const sets = window.NSFW_SETS;
    if (!sets) return false;
    const BASES = new Set([...sets.EXPOSURE, ...sets.UNDERWEAR, ...sets.OUTFIT]);
    for (const t of (Array.isArray(parts)?parts:[])){
      const s = String(t).toLowerCase().trim();
      const last = s.split(/\s+/).pop();
      if (BASES.has(s) || BASES.has(last)) return true;
    }
    return false;
  };

  // --- 通常服トークン判定（辞書ベース + 靴語の末尾判定）
  window.isNormalWearToken = function(t){
    const s = String(t).toLowerCase().trim();
    if (!s) return false;
    if (window.WEAR_SFW && window.WEAR_SFW.has(s)) return true;
    // 末尾語が footwear の代表なら true（例: "white shoes"）
    const last = s.split(/\s+/).pop();
    return /\b(shoes|boots|sneakers|loafers|sandals|heels|mary_janes|mary\s+janes|geta|zori)\b/i.test(last);
  };

  // --- 色の一次掃除（単独色 / 色+通常服プレース）
  const COLOR_WORD = '(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)';
  const COLOR_WORD_RE  = new RegExp('\\b' + COLOR_WORD + '\\b','i');
  const COLOR_PLACE_RE = new RegExp('\\b' + COLOR_WORD + '\\s+(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|dress|one[-\\s]?piece|gown|uniform|shoes|boots|sneakers|loafers|mary\\s+janes|heels|sandals)\\b','i');

  // 既存の stripWearColorsOnce をこの内容で上書き
   window.stripWearColorsOnce = function(parts){
     const COLOR_WORD_RE =
       /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\b/i;
   
     // ★ ここに bikini/swimsuit/lingerie/underwear を追加
     const COLOR_PLACE_RE =
       /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|dress|one[-\s]?piece|gown|uniform|shoes|boots|sneakers|loafers|mary\s+janes|heels|sandals|bikini|swimsuit|lingerie|underwear)\b/i;
   
     return (parts||[]).filter(s=>{
       const x = String(s);
       if (COLOR_PLACE_RE.test(x)) return false;            // 例: "white bikini"
       if (COLOR_WORD_RE.test(x) && !/\s/.test(x)) return false; // 単独色 "white"
       return true;
     });
   };

  // 既存の collapseExposureDuplicates をこの内容で上書き
window.collapseExposureDuplicates = function(list){
  const L = Array.isArray(list) ? list.slice() : [];

  const sets = (window.NSFW_SETS || {});
  const BASES = new Set([
    ...(sets.EXPOSURE || []),
    ...(sets.UNDERWEAR || []),
    ...(sets.OUTFIT || [])
  ]); // 例: "bikini","swimsuit","lingerie","underwear" ...

  // ★辞書に“フル形”で存在する露出タグ（色付き含む）
  const FULL = new Set();
  for (const s of [ ...(sets.EXPOSURE || []), ...(sets.UNDERWEAR || []), ...(sets.OUTFIT || []) ]) {
    if (s && typeof s === 'string') FULL.add(String(s).trim().toLowerCase());
  }

  const baseOf = (t)=>{
    const s = String(t).toLowerCase().trim();
    const last = s.split(/\s+/).pop();
    if (BASES.has(s))   return s;    // そのままが base の場合
    if (BASES.has(last))return last; // "white bikini" → "bikini"
    return "";
  };

  // base -> {keep:string} を決める
  const chosen = new Map();
  for (const tok of L){
    const base = baseOf(tok);
    if (!base) continue;

    const s = String(tok).toLowerCase().trim();
    const isColoredForm = /\s/.test(s); // スペース含む＝色付き等の複合形
    const existsAsFullDict = FULL.has(s);

    // ルール:
    // 1) 基本は base（色なし）を優先
    // 2) ただし “色付きそのもの” が辞書に *フル一致* で存在するなら色付き優先
    const current = chosen.get(base);
    if (!current) {
      chosen.set(base, existsAsFullDict ? tok : base);
    } else {
      // 既に何か選ばれている場合でも、辞書フル一致の色付きが来たら置き換え
      if (existsAsFullDict) chosen.set(base, tok);
    }
  }

  // chosen に該当するもの“だけ”残す
  return L.filter(tok=>{
    const base = baseOf(tok);
    if (!base) return true; // 露出系以外は触らない
    const keep = chosen.get(base);
    // keep が base（文字列）なら、"bikini" という“色なし”の完全一致だけを残す
    // keep が "white bikini" など色付きなら、その完全一致だけを残す
    return String(tok).toLowerCase().trim() === String(keep).toLowerCase().trim();
  });
};

  // --- NSFW時：通常服/色/靴をまとめて落とす（最後の安全網）
  window.stripNormalWearWhenNSFW = function(parts){
    let out = Array.isArray(parts) ? parts.slice() : [];
    out = out.filter(t => !window.isNormalWearToken(t));
    out = window.stripWearColorsOnce(out);
    return out;
  };

  // 初期化（辞書読み込み後にも再構築）
  document.addEventListener('DOMContentLoaded', rebuildWearSets);
  document.addEventListener('dict:updated',   rebuildWearSets);
})();



// 露出/下着/NSFW衣装の重複を“末尾名詞”で束ねて、色付き等の具体的な方を優先して1個だけ残す
function collapseExposureDuplicates(parts){
  const sets = (window.NSFW_SETS || {});
  const EXP = sets.EXPOSURE  || new Set();
  const UND = sets.UNDERWEAR || new Set();
  const OUF = sets.OUTFIT    || new Set();

  const isWearish = (s)=>{
    const x = String(s).toLowerCase().trim();
    const last = x.split(/\s+/).pop();
    return EXP.has(x) || UND.has(x) || OUF.has(x) || EXP.has(last) || UND.has(last) || OUF.has(last);
  };

  const keyOf = (s)=> String(s).toLowerCase().trim().split(/\s+/).pop(); // 末尾名詞（bikini, swimsuit など）
  const kept = [];
  const byBase = new Map(); // base名詞 -> index in kept

  for (const t of (parts||[])){
    if (!isWearish(t)){ kept.push(t); continue; }

    const base = keyOf(t);
    const idx  = byBase.get(base);

    if (idx == null){
      byBase.set(base, kept.length);
      kept.push(t);
    } else {
      // 既に同じ末尾名詞を保持している場合：素 vs 複語（色付き等）を比較して“具体的な方”を残す
      const cur = kept[idx];
      const curHasSpace = /\s/.test(String(cur));
      const newHasSpace = /\s/.test(String(t));
      if (!curHasSpace && newHasSpace){
        kept[idx] = t; // 素の "bikini" を "white bikini" に置き換え
      }
      // 逆（すでに具体的→新規が素）は捨てる
    }
  }
  return kept;
}





/* === 学習ガード：過剰要素の除去＆上限 === */

// === ポーズ/構図のゆる判定（片方のボックスが無いときは無視していい） ===
function categorizePoseComp(list){
  const L = normList(list||[]);
  const isComp = (t) => /\b(front view|side view|back view|profile(?:\sview)?|three-quarters view|looking up|looking down|overhead view|from below|bust(?:\s?shot)?|waist up|upper body|full body|portrait|close-?up|wide shot|centered composition|rule of thirds)\b/i.test(t);
  const poseTags = [];
  const compTags = [];
  for (const it of L){
    const tag = it.tag || "";
    if (isComp(tag)) compTags.push(it); else poseTags.push(it);
  }
  return { poseTags, compTags };
}


// 変化が大きく学習をブレさせやすい語を落とす（学習時のみ）
const LEARN_EXCLUDE_RE = /\b(?:fisheye|wide[-\s]?angle|ultra[-\s]?wide|dutch\s?angle|extreme\s?(?:close[-\s]?up|zoom|perspective)|motion\s?blur|long\s?exposure|bokeh\s?balls|tilt[-\s]?shift|depth\s?of\s?field|hdr|high\s?contrast|dynamic\s?lighting|dramatic\s?lighting|backlight(?:ing)?|rim\s?light(?:ing)?|fireworks|sparks|confetti|holding\s+\w+|wielding\s+\w+|carrying\s+\w+|using\s+\w+|smartphone|cell\s?phone|microphone|camera|sign|banner|weapon)\b/i;

// カテゴリ単位で“最大数”を制限（学習時）
const LEARN_BUCKET_CAP = {
  lora:  2, name: 1,
  b_age:1, b_gender:1, b_body:1, b_height:1, b_person:1, b_world:1, b_tone:1,
  c_hair:1, c_eye:1, c_skin:1,
  s_hair:1, s_eye:1, s_face:1, s_body:1, s_art:1,
  wear:2, acc:0,
  bg:1, pose:1, comp:1, view:1, expr:1, light:1,  // ★ comp / view を追加
  n_expr:1, n_expo:1, n_situ:1, n_light:1,
  n_pose:1, n_acc:1, n_outfit:1, n_body:1, n_nipples:1,
  // ★ 追加：下着
  n_underwear:1,
  other:0
};

// ensurePromptOrder と同じ仕分けを流用して“刈る”
/* === 学習テーブル用：完全一致だけで仕分け＆刈り込み（無改変） === */
function trimByBucketForLearning(parts){
  // 1) ここでは ensurePromptOrder を呼ばない（無改変）
  const src = Array.isArray(parts) ? parts.map(x=>String(x||'').trim()).filter(Boolean) : [];

  // 2) セット化（辞書そのまま）※完全一致のみ
  const S = {
    age:        new Set((SFW.age||[]).map(x=>x.tag||x)),
    gender:     new Set((SFW.gender||[]).map(x=>x.tag||x)),
    body_basic: new Set((SFW.body_type||[]).map(x=>x.tag||x)),
    height:     new Set((SFW.height||[]).map(x=>x.tag||x)),
    person:     new Set((SFW.personality||[]).map(x=>x.tag||x)),
    world:      new Set((SFW.worldview||[]).map(x=>x.tag||x)),
    tone:       new Set((SFW.speech_tone||[]).map(x=>x.tag||x)),

    hair_style: new Set((SFW.hair_style||[]).map(x=>x.tag||x)),
    eyes_shape: new Set((SFW.eyes||[]).map(x=>x.tag||x)),
    face:       new Set((SFW.face||[]).map(x=>x.tag||x)),
    skin_body:  new Set((SFW.skin_body||[]).map(x=>x.tag||x)),
    art_style:  new Set((SFW.art_style||[]).map(x=>x.tag||x)),
    outfit:     new Set((SFW.outfit||[]).map(x=>x.tag||x)),
    acc:        new Set((SFW.accessories||[]).map(x=>x.tag||x)),

    background: new Set((SFW.background||[]).map(x=>x.tag||x)),
    comp:       new Set((SFW.composition||[]).map(x=>x.tag||x)),
    pose:       new Set((SFW.pose||[]).map(x=>x.tag||x)),
    view:       new Set((SFW.view||[]).map(x=>x.tag||x)),
    expr:       new Set((SFW.expressions||[]).map(x=>x.tag||x)),
    light:      new Set((SFW.lighting||[]).map(x=>x.tag||x)),

    nsfw_expr:     new Set((NSFW.expression||[]).map(x=>x.tag||x)),
    nsfw_expo:     new Set((NSFW.exposure||[]).map(x=>x.tag||x)),
    nsfw_situ:     new Set((NSFW.situation||[]).map(x=>x.tag||x)),
    nsfw_light:    new Set((NSFW.lighting||[]).map(x=>x.tag||x)),
    nsfw_pose:     new Set((NSFW.pose||[]).map(x=>x.tag||x)),
    nsfw_acc:      new Set((NSFW.accessories || NSFW.accessory || []).map(x=>x.tag||x)),
    nsfw_nipples:  new Set((NSFW.nipple || NSFW.nipples || []).map(x=>x.tag||x)),
    nsfw_outfit:   new Set((NSFW.outfit||[]).map(x=>x.tag||x)),
    nsfw_body:     new Set((NSFW.body||[]).map(x=>x.tag||x)),
    nsfw_underwear:new Set((NSFW.underwear||[]).map(x=>x.tag||x)),
  };

  // 3) バケツ（入力順を保つ。unknown は other へ）
  const buckets = {
    lora:[], name:[],
    b_age:[], b_gender:[], b_body:[], b_height:[], b_person:[], b_world:[], b_tone:[],
    c_hair:[], c_eye:[], c_skin:[],
    s_hair:[], s_eye:[], s_face:[], s_body:[], s_art:[],
    wear:[], acc:[],
    bg:[], comp:[], pose:[], view:[], expr:[], light:[],
    n_expr:[], n_expo:[], n_situ:[], n_light:[],
    n_pose:[], n_acc:[], n_outfit:[], n_body:[], n_nipples:[], n_underwear:[],
    other:[]
  };

  const isNameEq = t => (document.getElementById('charName')?.value || '').trim() === t;

  for (const t of src){
    if (!t || (typeof LEARN_EXCLUDE_RE!=='undefined' && LEARN_EXCLUDE_RE.test(t))) continue;

    if (t.startsWith("<lora:") || /\b(?:<lyco:|LoRA)\b/i.test(t)) { buckets.lora.push(t); continue; }
    if (isNameEq(t)) { buckets.name.push(t); continue; }

    if (S.age.has(t))        { buckets.b_age.push(t); continue; }
    if (S.gender.has(t))     { buckets.b_gender.push(t); continue; }
    if (S.body_basic.has(t)) { buckets.b_body.push(t); continue; }
    if (S.height.has(t))     { buckets.b_height.push(t); continue; }
    if (S.person.has(t))     { buckets.b_person.push(t); continue; }
    if (S.world.has(t))      { buckets.b_world.push(t); continue; }
    if (S.tone.has(t))       { buckets.b_tone.push(t); continue; }

    if (S.hair_style.has(t)) { buckets.s_hair.push(t); continue; }
    if (S.eyes_shape.has(t)) { buckets.s_eye.push(t);  continue; }
    if (S.face.has(t))       { buckets.s_face.push(t); continue; }
    if (S.skin_body.has(t))  { buckets.s_body.push(t); continue; }
    if (S.art_style.has(t))  { buckets.s_art.push(t);  continue; }

    if (S.outfit.has(t)) { buckets.wear.push(t); continue; }
    if (S.acc.has(t))    { buckets.acc.push(t);  continue; }

    if (S.background.has(t)) { buckets.bg.push(t);   continue; }
    if (S.comp.has(t))       { buckets.comp.push(t); continue; }
    if (S.pose.has(t))       { buckets.pose.push(t); continue; }
    if (S.view.has(t))       { buckets.view.push(t); continue; }
    if (S.expr.has(t))       { buckets.expr.push(t); continue; }
    if (S.light.has(t))      { buckets.light.push(t);continue; }

    if (S.nsfw_expr.has(t))     { buckets.n_expr.push(t);     continue; }
    if (S.nsfw_expo.has(t))     { buckets.n_expo.push(t);     continue; }
    if (S.nsfw_situ.has(t))     { buckets.n_situ.push(t);     continue; }
    if (S.nsfw_light.has(t))    { buckets.n_light.push(t);    continue; }
    if (S.nsfw_pose.has(t))     { buckets.n_pose.push(t);     continue; }
    if (S.nsfw_acc.has(t))      { buckets.n_acc.push(t);      continue; }
    if (S.nsfw_outfit.has(t))   { buckets.n_outfit.push(t);   continue; }
    if (S.nsfw_body.has(t))     { buckets.n_body.push(t);     continue; }
    if (S.nsfw_nipples.has(t))  { buckets.n_nipples.push(t);  continue; }
    if (S.nsfw_underwear.has(t)){ buckets.n_underwear.push(t);continue; }

    // 未知タグは other にそのまま残す（lab などはここ）
    buckets.other.push(t);
  }

  // 4) 既定補完は「空のときのみ」入れる（既に何かあれば足さない）
  if (typeof LEARN_DEFAULTS !== 'undefined'){
    if (!buckets.expr.length && Array.isArray(LEARN_DEFAULTS.expr))  buckets.expr.push(...LEARN_DEFAULTS.expr);
    if (!buckets.bg.length   && Array.isArray(LEARN_DEFAULTS.bg))    buckets.bg.push(...LEARN_DEFAULTS.bg);
    if (!buckets.light.length&& Array.isArray(LEARN_DEFAULTS.light)) buckets.light.push(...LEARN_DEFAULTS.light);
    // anchors は other の補助タグ的に扱う
    if (Array.isArray(LEARN_DEFAULTS.anchors)) buckets.other.push(...LEARN_DEFAULTS.anchors);
  }

  // 5) 上限刈り（定義が無ければ無制限）＆結合（入力順は各バケツ内で維持）
  const capped = [];
  const pushCap = (k)=>{
    const arr = buckets[k]||[];
    const cap = (typeof LEARN_BUCKET_CAP!=='undefined' && LEARN_BUCKET_CAP[k]!==undefined) ? LEARN_BUCKET_CAP[k] : undefined;
    if (cap === undefined) { capped.push(...arr); }
    else if (cap > 0) { capped.push(...arr.slice(0, cap)); }
  };

  // 出力順（必要に応じ並べ替えてOK）
  [
    'lora','name',
    'b_age','b_gender','b_body','b_height','b_person','b_world','b_tone',
    's_hair','s_eye','s_face','s_body','s_art',
    'c_hair','c_eye','c_skin', // 使っていなければ空のまま
    'wear','acc',
    'bg','comp','pose','view','expr','light',
    'n_expr','n_expo','n_situ','n_light','n_pose','n_acc','n_outfit','n_body','n_nipples','n_underwear',
    'other'
  ].forEach(pushCap);

  return capped;
}


/* === 学習アンカー：不足時の自動補完（安定化） === */
const LEARN_DEFAULTS = {
  // 構図・距離・視線
  pose: ["upper body", "bust", "waist up", "portrait"],
  expr: ["neutral expression"],
  bg:   ["plain background", "studio background", "solid background"],
  light:["soft lighting", "even lighting"],
  // 追加の安定化（過激にならず識別に効く）
  anchors: ["facing viewer", "centered composition", "clear focus"]
};

// bucketsから“1つも入っていない”ものにだけ1語足す
function addLearningAnchorsIfMissing(parts){
  const S = new Set(parts);
  const need = [];

  const hasPose   = /\b(upper body|bust|waist up|portrait)\b/i.test(parts.join(", "));
  const hasExpr   = /\b(neutral expression)\b/i.test(parts.join(", "));
  const hasBG     = /\b(plain background|studio background|solid background)\b/i.test(parts.join(", "));
  const hasLight  = /\b(soft lighting|even lighting)\b/i.test(parts.join(", "));
  const hasFacing = /\b(facing viewer)\b/i.test(parts.join(", "));
  const hasCenter = /\b(centered composition)\b/i.test(parts.join(", "));

  if (!hasPose)  need.push(LEARN_DEFAULTS.pose[0]);
  if (!hasExpr)  need.push(LEARN_DEFAULTS.expr[0]);
  if (!hasBG)    need.push(LEARN_DEFAULTS.bg[0]);
  if (!hasLight) need.push(LEARN_DEFAULTS.light[0]);
  if (!hasFacing)need.push("facing viewer");
  if (!hasCenter)need.push("centered composition");

  need.forEach(t => S.add(t));
  return [...S];
}

/* === 学習強化ネガ === */
const DEFAULT_TRAINING_NEG = [
  "props", "holding object", "microphone", "smartphone", "camera", "sign", "banner",
  "dynamic lighting", "backlighting", "rim lighting",
  "fisheye", "wide-angle", "tilt-shift", "motion blur"
].join(", ");



/* ========= 設定（LocalStorage） ========= */
const LS_KEY = "LPM_SETTINGS_V1";
const Settings = { gasUrl: "", gasToken: "" };

function loadSettings() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    Object.assign(Settings, j || {});
  } catch {}
  $("#set_gasUrl") && ($("#set_gasUrl").value   = Settings.gasUrl || "");
  $("#set_gasToken") && ($("#set_gasToken").value = Settings.gasToken || "");
}
function saveSettings() {
  Settings.gasUrl   = ($("#set_gasUrl")?.value || "").trim();
  Settings.gasToken = ($("#set_gasToken")?.value || "").trim();
  localStorage.setItem(LS_KEY, JSON.stringify(Settings));
}
function resetSettings() {
  Object.keys(localStorage).forEach(k => { if (/^LPM_/.test(k) || k === LS_KEY) localStorage.removeItem(k); });
  $("#gasTestResult") && ($("#gasTestResult").textContent = "初期化しました");
}

/* ========= 内蔵辞書（空で開始） ========= */
 const EMBED_SFW = {
   hair_style:[], eyes:[], outfit:[], face:[], skin_body:[], art_style:[], background:[],
   // 新分離
   pose:[], composition:[], view:[],
   // 互換レガシ
   pose_composition:[],
   expressions:[], accessories:[], lighting:[],
   age:[], gender:[], body_type:[], height:[], personality:[]
 };
const EMBED_NSFW = { categories:{ expression:[], exposure:[], situation:[], lighting:[] } };

let SFW  = JSON.parse(JSON.stringify(EMBED_SFW));
let NSFW = normNSFW(EMBED_NSFW);

/* ========= 正規化 ========= */
function normItem(x) {
  if (typeof x === "string") return { tag: x, label: x, level: "L1" };
  if (!x || typeof x !== "object") return null;

  const tag   = x.tag ?? x.en ?? x.keyword ?? x.value ?? x.name;
  const ja    = x.ja || x.jp || x["name_ja"] || x["label_ja"] || x.desc || x.label;
  const label = (ja && String(ja).trim()) ? String(ja).trim() : (tag || "");
  const level = (x.level || "L1").toUpperCase();

  if (tag === undefined || tag === null) return null;
  // ← ここがポイント：未知フィールド（cat 含む）を温存
  return { ...x, tag: String(tag), label, level };
}

function normList(arr){ return (arr || []).map(normItem).filter(Boolean); }

// ==== KEYMAP（UI見出し → SFWキー）====
const KEYMAP = {
  "髪型":"hair_style",
  "目の形":"eyes",
  "服":"outfit",
  "顔の特徴":"face",
  "体型":"skin_body",
  "視点":"view",
  "画風":"art_style",
  "背景":"background",
  "ポーズ":"pose",
  "構図":"composition",
  "表情":"expressions",
  "アクセサリー":"accessories",
  "ライティング":"lighting",
  "年齢":"age",
  "性別":"gender",
  "体型(基本)":"body_type",
  "身長":"height",
  "性格":"personality"
};

// ==== SFW の分割正規化（読み込み直後に1回呼ぶ）====
function normalizeSFWKeys(){
  if (!window.SFW) return;
  // 旧キー → 新キー
  const legacy = SFW.pose_composition || [];
  // 既に新キーがあればそれを優先
  SFW.pose        = SFW.pose || legacy.filter(t => /^(standing|sitting|lying down|jumping|running|pointing|crossed arms|hands on hips|hands behind back|peace sign|waving|head tilt|slumped shoulders|head hung low|staggering|hands on cheeks|facepalm)$/i.test(t));
  SFW.composition = SFW.composition || legacy.filter(t => /^(full body|upper body|close-up|bust|waist up|portrait|centered composition|rule of thirds|over-the-shoulder|foreshortening)$/i.test(t));
  SFW.view        = SFW.view || legacy.filter(t => /^(front view|three-quarters view|back view|profile view|side view|eye-level|low angle|high angle|from below|looking down|overhead view|facing viewer|looking to the side|looking up|looking away|looking at viewer)$/i.test(t));
  // 廃止キーはクリア
  delete SFW.pose_composition;
}

// === outfit をカテゴリ分配 ===
function categorizeOutfit(list){
  const L = normList(list || []);
  const C = { top:[], pants:[], skirt:[], dress:[], shoes:[] };

  for (const t of L) {
    const cat = (t.cat || "").toLowerCase();

    if (cat === "top")      { C.top.push(t);   continue; }
    if (cat === "pants")    { C.pants.push(t); continue; }
    if (cat === "skirt")    { C.skirt.push(t); continue; }
    if (cat === "dress")    { C.dress.push(t); continue; }
    if (cat === "shoes")    { C.shoes.push(t); continue; }

    // cat が無い/不明なときは従来のタグ名ヒューリスティック
    const tag = (t.tag || "").toLowerCase();
    if (/(t-shirt|tank|blouse|shirt|hoodie|sweater|cardigan|jacket|coat|trench|blazer|turtleneck|camisole|off-shoulder|crop|sweatshirt|puffer|parka|windbreaker|raincoat)/.test(tag)) { C.top.push(t);   continue; }
    if (/(jeans|pants|trousers|shorts|cargo|bermuda|leggings|overalls|hakama)/.test(tag))                                         { C.pants.push(t); continue; }
    if (/(skirt)/.test(tag))                                                                                                       { C.skirt.push(t); continue; }
    if (/(dress|gown|yukata|kimono|cheongsam|hanbok|sari|uniform|maid|waitress|suit|tracksuit|sportswear|jersey|armor|witch|idol|stage|casual|loungewear|pajamas|lolita|apron|robe|poncho|cape|swimsuit|speedo|trunks|tankini|rash_guard|kneesuit|jammer|briefs|racerback|high_cut|spats|open_back|skirted|striped|polka|floral|retro|school_swimsuit|kids_swimsuit|float_ring|swim_cap)/.test(tag)) { C.dress.push(t); continue; }
    if (/(boots|sneakers|loafers|mary janes)/.test(tag))                                                                           { C.shoes.push(t); continue; }

    // ← ここがデフォルト先：分類できなければ dress
    C.dress.push(t);
  }
  return C;
}

// ========== 置き換え: NSFW 正規化（拡張カテゴリ対応） ==========
function normNSFW(ns) {
  // --- フラットな nsfw_tags 形式（R15/R18/R18G）に対応：とりあえず situation に寄せる ---
  if (ns?.nsfw_tags) {
    const m = ns.nsfw_tags;
    const pack = (arr, lv) => (arr || []).map(t => ({ tag: String(t), label: String(t), level: lv }));
    const situation = [
      ...pack(m.R15,  "L1"),
      ...pack(m.R18,  "L2"),
      ...pack(m.R18G, "L3"),
    ];
    return {
      expression: [], exposure: [], situation,
      lighting: [], background: [],
      // 拡張キーは空で返す（merge側で安全に扱える）
      pose: [], accessory: [], outfit: [], body: [], nipples: [], underwear: []
    };
  }

  // --- 従来: NSFW.categories または 直下キー ---
  const src = (ns && ns.categories) ? ns.categories : (ns || {});
  // 日本語キー・別名の吸収
  const ALIAS = {
    expression: ['expression','表情'],
    exposure:   ['exposure','露出'],
    situation:  ['situation','シチュ','scenario','context'],
    lighting:   ['lighting','ライティング','light'],
    background: ['background','背景'],
    pose:       ['pose','poses','ポーズ'],
    accessory:  ['accessory','accessories','acc','アクセ','アクセサリー'],
    outfit:     ['outfit','outfits','costume','clothes','衣装'],
    body:       ['body','anatomy','feature','features','body_features','body_shape','身体','体型'],
    nipples:    ['nipples','nipple','乳首','乳首系'],
    underwear:  ['underwear','lingerie','下着','インナー']   // ★追加
  };
  const pickBy = (names)=> {
    for (const k of names) {
      if (Array.isArray(src?.[k])) return normList(src[k]);
    }
    return [];
  };

  return {
    expression: pickBy(ALIAS.expression),
    exposure:   pickBy(ALIAS.exposure),
    situation:  pickBy(ALIAS.situation),
    lighting:   pickBy(ALIAS.lighting),
    background: pickBy(ALIAS.background),
    pose:       pickBy(ALIAS.pose),
    accessory:  pickBy(ALIAS.accessory),
    outfit:     pickBy(ALIAS.outfit),
    body:       pickBy(ALIAS.body),
    nipples:    pickBy(ALIAS.nipples),
    underwear:  pickBy(ALIAS.underwear), // ★追加
  };
}

// ========== 置き換え: NSFW マージ（拡張カテゴリ対応） ==========
function mergeIntoNSFW(json) {
  const src = json?.NSFW ? normNSFW(json.NSFW) : normNSFW(json);

  // まだ無ければ空配列を用意（初期化保険）
  NSFW = NSFW || {};
  const ensure = (k)=> { if (!Array.isArray(NSFW[k])) NSFW[k] = []; };
  [
    'expression','exposure','situation','lighting','background',
    'pose','accessory','outfit','body','nipples','underwear'  // ★追加
  ].forEach(ensure);

  NSFW = {
    expression: dedupeByTag([...(NSFW.expression||[]), ...(src.expression||[])]),
    exposure:   dedupeByTag([...(NSFW.exposure||[]),   ...(src.exposure||[])]),
    situation:  dedupeByTag([...(NSFW.situation||[]),  ...(src.situation||[])]),
    lighting:   dedupeByTag([...(NSFW.lighting||[]),   ...(src.lighting||[])]),
    background: dedupeByTag([...(NSFW.background||[]), ...(src.background||[])]),
    pose:       dedupeByTag([...(NSFW.pose||[]),       ...(src.pose||[])]),
    accessory:  dedupeByTag([...(NSFW.accessory||[]),  ...(src.accessory||[])]),
    outfit:     dedupeByTag([...(NSFW.outfit||[]),     ...(src.outfit||[])]),
    body:       dedupeByTag([...(NSFW.body||[]),       ...(src.body||[])]),
    nipples:    dedupeByTag([...(NSFW.nipples||[]),    ...(src.nipples||[])]),
    underwear:  dedupeByTag([...(NSFW.underwear||[]),  ...(src.underwear||[])]), // ★追加
  };
}

/* ========= 追記マージ ========= */
function dedupeByTag(list) {
  const seen = new Set(); const out=[];
  for (const it of normList(list)) { if (seen.has(it.tag)) continue; seen.add(it.tag); out.push(it); }
  return out;
}
 // 互換マージ：SFW辞書を追記（pose_composition → pose/composition/view に分解）
// 置き換え版
function mergeIntoSFW(json) {
  const src  = json?.SFW || json || {};
  const next = { ...SFW };

  for (const [k, v] of Object.entries(src || {})) {
    const key = KEYMAP[k] || k;

    // 互換：pose_composition → pose / composition / view に分配
    if (key === "pose_composition") {
      const L = normList(v);
      const isView = (t)=> /\b(front view|three-quarters view|profile view|side view|back view|eye-level|low angle|high angle|from below|looking down|overhead view|facing viewer|looking to the side|looking up|looking away|looking at viewer)\b/i.test(t);
      const isComp = (t)=> /\b(full body|waist up|upper body|bust|portrait|close-?up|wide shot|centered composition|rule of thirds|over-the-shoulder|foreshortening)\b/i.test(t);

      const poseArr = L.filter(it => !(isView(it.tag) || isComp(it.tag)));
      const compArr = L.filter(it =>  isComp(it.tag));
      const viewArr = L.filter(it =>  isView(it.tag));

      next.pose        = dedupeByTag([...(next.pose||[]),        ...poseArr]);
      next.composition = dedupeByTag([...(next.composition||[]), ...compArr]);
      next.view        = dedupeByTag([...(next.view||[]),        ...viewArr]);
      continue;
    }

    // 既知キーのみマージ
    if (next[key] === undefined) continue;
    next[key] = dedupeByTag([...(next[key]||[]), ...normList(v)]);
  }

  SFW = next;

  // ← ここで旧キーを消しつつ新キーへ正規化（保険）
  normalizeSFWKeys();
}


let __bottomCat = "pants"; // 既定はパンツ
// ▼ 下カテゴリ（パンツ/スカート）切替：fieldset だけで制御
function bindBottomCategoryRadios(){
  const rPants = document.getElementById('bottomCat_pants');
  const rSkirt = document.getElementById('bottomCat_skirt');
  const fsP = document.getElementById('fsBottom_pants');
  const fsS = document.getElementById('fsBottom_skirt');

  const swap = () => {
    const isSkirt = !!rSkirt?.checked;

    // 見た目は fieldset 自身だけグレーアウト（親パネルは触らない）
    fsP?.classList.toggle('is-disabled',  isSkirt);
    fsS?.classList.toggle('is-disabled', !isSkirt);

    // 実際の入力停止も fieldset だけ
    if (fsP) fsP.disabled = isSkirt;
    if (fsS) fsS.disabled = !isSkirt;

// 直近カテゴリを記録（関数スコープ変数 & 参照用に window にも）
     __bottomCat = isSkirt ? 'skirt' : 'pants';
     window.__bottomCat = __bottomCat;
  };

  rPants?.addEventListener('change', swap);
  rSkirt?.addEventListener('change', swap);

  // 他からも再適用できるように公開
  window.__applyBottomCatSwap = swap;

  swap(); // 初期反映（パンツ既定→スカート側を無効）
}

// ===== 1枚テスト: 必須チェック（髪・瞳・肌だけ必須） =====
function listMissingForOneTest() {
  const miss = [];

  // 色タグ（髪・瞳・肌）だけ必須
  const hairTag = ($("#tagH")?.textContent || "").trim();
  const eyeTag  = ($("#tagE")?.textContent || "").trim();
  const skinTag = ($("#tagSkin")?.textContent || "").trim();

  if (!hairTag) miss.push("髪色");
  if (!eyeTag)  miss.push("瞳色");
  if (!skinTag) miss.push("肌トーン");

  return miss;
}


function isBasicReadyForOneTest(){ return listMissingForOneTest().length === 0; }

function updateOneTestReady(){
  const btn = $("#btnOneLearn");
  if (!btn) return;
  const miss = listMissingForOneTest();
  const ok = miss.length === 0;
  btn.disabled = !ok;
  btn.classList.toggle("disabled", !ok);
  btn.title = ok ? "" : ("不足: " + miss.join(" / "));
}

// ===== 1枚テスト: 生成 & 描画 =====
let __lastOneTestRows = []; // フォーマット切替再描画用

function runOneTest() {
  const lack = listMissingForOneTest();
  if (lack.length) { toast("1枚テスト 未入力: " + lack.join(" / ")); return; }

  const one = buildOneLearning();
  if (one?.error) { toast(one.error); return; }

  __lastOneTestRows = [one];
  renderLearnTableTo("#tblLearnTest tbody", __lastOneTestRows);
  renderTextTriplet('outLearnTest', __lastOneTestRows, 'fmtLearn');
}

// 初期化時に一度だけバインド
function bindOneTest(){
  bindCopyTripletExplicit([
    ['btnCopyLearnTestAll',    'outLearnTestAll'],
    ['btnCopyLearnTestPrompt', 'outLearnTestPrompt'],
    ['btnCopyLearnTestNeg',    'outLearnTestNeg']
  ]);
}

function copyOneTestText(){
  const el = $("#outLearnTest");
  if (!el) return;
  const txt = el.textContent || "";
  if (!txt) { toast("コピーするテキストがありません"); return; }
  navigator.clipboard.writeText(txt).then(()=> toast("コピーしました"));
}

// const DEFAULT_NEG = "extra fingers, fused fingers, mutated hands, extra hands, extra arms, multiple hands, multiple arms, extra legs, extra head, cloned face, multiple body, blurry, lowres, bad anatomy, bad hands, bad feet, bad face, bad eyes, asymmetrical eyes, deformed face, disfigured, bad proportions, long neck, text, letters, text on clothes, watermark, logo, busy background, extra objects, low quality, worst quality, jpeg artifacts, multiple people, group, crowd, another person, second person, background people, bystanders, photobomb, reflection, poster, billboard, tv screen";

// チェックボックスのON/OFFを読む（要素が無ければtrue扱い＝互換）
function isDefaultNegOn() {
  const el = document.getElementById("useDefaultNeg");
  return el ? !!el.checked : true;
}

/* ========= カラーユーティリティ ========= */
function hslToRgb(h,s,l){
  s/=100; l/=100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){[r,g,b]=[c,x,0]} else if(h<120){[r,g,b]=[x,c,0]} else if(h<180){[r,g,b]=[0,c,x]}
  else if(h<240){[r,g,b]=[0,x,c]} else if(h<300){[r,g,b]=[x,0,c]} else {[r,g,b]=[c,0,x]}
  return [(r+m)*255,(g+m)*255,(b+m)*255].map(v=>Math.round(v));
}
function labToXyz(L,a,b){ const Yn=1,Xn=0.95047, Zn=1.08883;
  const fy=(L+16)/116, fx=a/500+fy, fz=fy-b/200;
  const f=t=> t**3>0.008856 ? t**3 : (t-16/116)/7.787;
  return [Xn*f(fx), Yn*f(fy), Zn*f(fz)];
}
function xyzToRgb(X,Y,Z){
  let [R,G,B]=[ 3.2406*X -1.5372*Y -0.4986*Z, -0.9689*X +1.8758*Y +0.0415*Z, 0.0557*X -0.2040*Y +1.0570*Z];
  const g=t=> t<=0.0031308? 12.92*t : 1.055*t**(1/2.4)-0.055;
  return [R,G,B].map(v=>Math.round(Math.min(1,Math.max(0,g(v)))*255));
}
function hexFromLab(L,a,b){ const [X,Y,Z]=labToXyz(L,a,b); const [r,g,b2]=xyzToRgb(X,Y,Z);
  return `#${[r,g,b2].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}
const SKIN_LAB = [
  //    L,  a,  b   ← 明るい……→暗い（最後はかなりディープ）
  [96,  0,  6],   // porcelain
  [88,  4, 10],   // very fair
  [78,  8, 16],   // fair-light
  [66, 13, 20],   // medium
  [56, 15, 22],   // tan
  [46, 14, 20],   // brown
  [34, 12, 18],   // dark brown
  [20, 10, 16],   // very dark / deep
  [14,  8, 12],   // near-ebony（ほぼ黒に近い深いトーン）
];
const SKIN_GAMMA_DARK = 1.25; // 数字↑で暗側を強調（1.15～1.35あたりが使いやすい）

function toneToHex(v){
  // v: 0..100（UIのスライダ値）
  const raw = Math.max(0, Math.min(100, v)) / 100;
  const t   = Math.pow(raw, SKIN_GAMMA_DARK);   // 暗い側にグッと寄せる
  const seg = t * (SKIN_LAB.length - 1);
  const i = Math.min(SKIN_LAB.length - 2, Math.floor(seg));
  const k = seg - i;

  const L = SKIN_LAB[i][0] * (1-k) + SKIN_LAB[i+1][0] * k;
  const A = SKIN_LAB[i][1] * (1-k) + SKIN_LAB[i+1][1] * k;
  const B = SKIN_LAB[i][2] * (1-k) + SKIN_LAB[i+1][2] * k;
  return hexFromLab(L, A, B);
}
function toneToTag(v){
  if (v <= 10) return "porcelain skin";
  if (v <= 25) return "very fair skin";
  if (v <= 40) return "light skin";
  if (v <= 55) return "medium skin";
  if (v <= 70) return "tan skin";
  if (v <= 85) return "brown skin";
  if (v <= 95) return "dark brown skin";
  return "deep / ebony skin";
}

// === 色名ユーティリティ（アクセ & 髪/瞳で共用可） ===
function colorNameFromHSL(h, s, l) {
  if (l < 12) return "black";
  if (l > 92 && s < 20) return "white";
  if (s < 10) {
    if (l < 30) return "dark gray";
    if (l > 70) return "light gray";
    return "gray";
  }
  const table = [
    { h:   0, name: "red" },
    { h:  12, name: "crimson" },
    { h:  22, name: "vermilion" },
    { h:  32, name: "orange" },
    { h:  45, name: "gold" },
    { h:  60, name: "yellow" },
    { h:  75, name: "lime" },
    { h:  90, name: "green" },
    { h: 110, name: "emerald" },
    { h: 150, name: "teal" },
    { h: 180, name: "cyan" },
    { h: 200, name: "aqua" },
    { h: 210, name: "sky blue" },
    { h: 225, name: "azure" },
    { h: 240, name: "blue" },
    { h: 255, name: "indigo" },
    { h: 270, name: "violet" },
    { h: 285, name: "purple" },
    { h: 300, name: "magenta" },
    { h: 320, name: "fuchsia" },
    { h: 335, name: "rose" },
    { h: 350, name: "pink" },
    { h: 360, name: "red" }
  ];
  let base = table[0].name, min = 360;
  for (const t of table) {
    let d = Math.abs(h - t.h); if (d > 180) d = 360 - d;
    if (d < min) { min = d; base = t.name; }
  }
  let prefix = "";
  if (s >= 70 && l <= 40) prefix = "deep";
  else if (s >= 70 && l >= 70) prefix = "bright";
  else if (l >= 85 && s >= 20 && s <= 60) prefix = "pastel";
  else if (s <= 35) prefix = "muted";
  else if (l <= 30) prefix = "dark";
  else if (l >= 80) prefix = "light";
  return prefix ? `${prefix} ${base}` : base;
}

/* ========= 服色ユーティリティ（学習） ========= */
function getWearColorTag(idBase){
  // idBase: "top" | "bottom" | "shoes"
  let use = document.getElementById("use_"+idBase);
  /*if (idBase === "bottom") {
    use = document.getElementById("useBottomColor") || document.getElementById("use_bottom");
  }
  */
  if (idBase === "bottom") use = document.getElementById("useBottomColor");

   
  if (use && !use.checked) return "";

  const t = document.getElementById("tag_"+idBase);
  if (!t) return "";
  const txt = (t.textContent || "").trim();
  return (txt && txt !== "—") ? txt : "";
}

// 追加：部位の有効/無効を見た目＆入力に反映
function updateWearPanelEnabled(idBase){
   const panel = (idBase === "bottom")
     ? document.getElementById("panel_bottom")
     : document.getElementById("panel_"+idBase);
   const use   = (idBase === "bottom")
     ? document.getElementById("useBottomColor")
    : document.getElementById("use_"+idBase);


  const disabled = !!(use && !use.checked);

  if (panel) panel.classList.toggle("is-disabled", disabled);

  // スライダは操作不可に
  const sat = document.getElementById("sat_"+idBase);
  const lit = document.getElementById("lit_"+idBase);
  if (sat) sat.disabled = disabled;
  if (lit) lit.disabled = disabled;

  // 末尾付近に追記（disabledでもpointerは戻す）
   const cb = (idBase === "bottom")
     ? document.getElementById("useBottomColor")
     : document.getElementById("use_" + idBase);
  if (cb) {
    cb.disabled = false; // 常に再チェックできる
}
}


// 追加：チェックボックスのバインド
function bindWearToggles(){
  // 既存：チェックボックス → パネル有効/無効
  ["top","bottom","shoes"].forEach(idBase=>{
     const cb = (idBase === "bottom")
     ? document.getElementById("useBottomColor")
     : document.getElementById("use_"+idBase);

    if (!cb) return;
    cb.addEventListener("change", ()=> updateWearPanelEnabled(idBase));
    updateWearPanelEnabled(idBase);
  });

// outfitモードに応じて、ワンピ/上下のUIと「下カラー」チェックを同期させる
const syncBottomForOutfit = ()=>{
  const mode = document.querySelector('input[name="outfitMode"]:checked')?.value || "separate";

  const fsDress = document.getElementById('fsDress');
  const topPanel    = document.getElementById('outfit_top')?.closest('.panel');
  const bottomPanel = document.getElementById('bottomCategoryRadios')?.closest('.panel');

  // 入力を一括で止める/戻すヘルパ（※ 使うのは onepiece の時だけ）
  const setInputsDisabled = (root, on) => {
    if (!root) return;
    root.querySelectorAll('input, select, button').forEach(el => { el.disabled = !!on; });
    root.classList.toggle('is-disabled', !!on);
  };

  if (mode === "onepiece") {
    if (fsDress) fsDress.disabled = false;   // ワンピ選択可
    setInputsDisabled(topPanel,    true);    // 上下は触れない
    setInputsDisabled(bottomPanel, true);    // 下カテゴリも触れない

    // 下カラーを自動OFF
    const cb = document.getElementById("useBottomColor");
    if (cb) { cb.checked = false; updateWearPanelEnabled("bottom"); }

  } else {
    // separate：
    if (fsDress) fsDress.disabled = true;    // ワンピを無効化
    // 見た目だけ有効化（内部の input は触らない：fieldset の有効/無効は swap に任せる）
    topPanel?.classList.remove('is-disabled');
    bottomPanel?.classList.remove('is-disabled');

    // カテゴリラジオは必ず押せるように
    const rP = document.getElementById('bottomCat_pants');
    const rS = document.getElementById('bottomCat_skirt');
    if (rP) rP.disabled = false;
    if (rS) rS.disabled = false;

    // 現在の選択に従って fieldset の enable/disable を再適用
    if (typeof window.__applyBottomCatSwap === 'function') window.__applyBottomCatSwap();

    // どちらかの“下”が選ばれてたら、下カラーを自動ON（既存ロジック）
    const cb = document.getElementById("useBottomColor");
    const pantsSel = document.querySelector('input[name="outfit_pants"]:checked');
    const skirtSel = document.querySelector('input[name="outfit_skirt"]:checked');
    if (cb && (pantsSel || skirtSel) && !cb.checked) {
      cb.checked = true;
      updateWearPanelEnabled("bottom");
    }
  }
};
// 既存のバインドでOK（差し替え後もこのまま使う）
$$('input[name="outfitMode"]').forEach(el=> el.addEventListener("change", syncBottomForOutfit));


  // ★ パンツ/スカート選択に連動してボトム色を自動ON
  const autoEnableBottomColor = ()=>{
    const mode = document.querySelector('input[name="outfitMode"]:checked')?.value || "separate";
    if (mode !== "separate") return;
    const cb = document.getElementById("useBottomColor");
    if (cb && !cb.checked) {
      cb.checked = true;
      updateWearPanelEnabled("bottom");
    }
  };
  // ラップ要素でも、内側のラジオでも OK なように両方へバインド
  $$('input[name="outfit_pants"]').forEach(r=> r.addEventListener("change", autoEnableBottomColor));
  $$('input[name="outfit_skirt"]').forEach(r=> r.addEventListener("change", autoEnableBottomColor));

  // 初期同期
  syncBottomForOutfit();
}

 function isOnePieceOutfitTag(tag){
   return /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress)\b/i
     .test(tag || "");
 }

function getLearningWearColorParts(sel){
  // sel: {mode, top, bottom, dress}
  const parts = [];
  const top   = getWearColorTag("top");
  const bottom= getWearColorTag("bottom");
  const shoes = getWearColorTag("shoes");

   if (sel.mode === "onepiece") {
     if (sel.dress && top) {
      // そのまま実体タグに色を被せる → "orange sailor uniform" など
      parts.push(`${top} ${sel.dress}`);
    }
  } else {
    if (sel.top && top)       parts.push(`${top} top`);
    if (sel.bottom && bottom) parts.push(`${bottom} bottom`);
  }
  if (shoes) parts.push(`${shoes} shoes`);
  return parts;
}

/* ========= 服色ユーティリティ（量産） ========= */
const COLOR_RATE = 0.5;
function maybeColorizeOutfit(tag){
  if (!tag) return tag;
  const base = (typeof getOutfitBaseColor === "function" ? getOutfitBaseColor() : "").trim();
  if (base && base !== "—") return `${base} ${tag}`;
  if (Math.random() >= COLOR_RATE) return tag;
  const c = randomOutfitColorName();
  return `${c} ${tag}`;
}
function randomInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function randomOutfitColorName(){
  const h = randomInt(0,359);
  const s = randomInt(60,90);
  const l = randomInt(35,65);
  return colorNameFromHSL(h,s,l);
}

/* 角度ドラッグ共通 */
function addHueDrag(wheelEl, thumbEl, onHueChange){
  if(!wheelEl || !thumbEl) return;
  const getCenter = () => {
    const r = wheelEl.getBoundingClientRect();
    return { cx: r.left + r.width/2, cy: r.top + r.height/2, rOuter: r.width/2 - 7 };
  };
  const setThumb = (hue) => {
    const { rOuter } = getCenter();
    const rad = (hue - 90) * Math.PI / 180;
    thumbEl.style.left = (wheelEl.clientWidth/2 + rOuter*Math.cos(rad) - 7) + "px";
    thumbEl.style.top  = (wheelEl.clientHeight/2 + rOuter*Math.sin(rad) - 7) + "px";
  };
  let dragging = false;
  const updateFromEvent = (e) => {
    const { cx, cy } = getCenter();
    const x = (e.clientX ?? (e.touches && e.touches[0]?.clientX)) - cx;
    const y = (e.clientY ?? (e.touches && e.touches[0]?.clientY)) - cy;
    const ang = Math.atan2(y, x);
    const hue = (ang * 180 / Math.PI + 360 + 90) % 360;
    setThumb(hue);
    onHueChange(hue);
  };
  const onDown = (e) => {
    e.preventDefault();
    dragging = true;
    updateFromEvent(e);
  };
  const onMove = (e) => { if (dragging) updateFromEvent(e); };
  const onUp   = () => { dragging = false; };
  wheelEl.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup",   onUp);
  const ro = new ResizeObserver(()=> {
    const h = (onHueChange.__lastHue != null) ? onHueChange.__lastHue : 0;
    setThumb(h)
  });
  ro.observe(wheelEl);
  return setThumb;
}

/* ======= 色ホイール（髪/瞳） ======= */
function initWheel(wId,tId,sId,lId,swId,tagId,baseTag){
  const wheel=$(wId), thumb=$(tId), sat=$(sId), lit=$(lId), sw=$(swId), tagEl=$(tagId);

  // 追加: どれか欠けてたら安全に抜ける
  if (!wheel || !thumb || !sat || !lit || !sw || !tagEl) {
    return () => (document.querySelector(tagId)?.textContent || "").trim();
  }
   
  let hue = 35;
  function paint(){
    const s = +sat.value, l = +lit.value;
    const [r,g,b] = hslToRgb(hue, s, l);
    sw.style.background = `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
    const cname = colorNameFromHSL(hue, s, l);
    tagEl.textContent = `${cname} ${baseTag}`;
  }
  const onHue = (h)=>{ hue = h; onHue.__lastHue = h; paint(); };
  onHue.__lastHue = hue;
  addHueDrag(wheel, thumb, onHue);
  sat.addEventListener("input", paint);
  lit.addEventListener("input", paint);
  requestAnimationFrame(()=>{
    paint();
    const rect = wheel.getBoundingClientRect();
    const r = rect.width/2 - 7;
    const rad = (hue - 90) * Math.PI/180;
    thumb.style.left = (rect.width/2  + r*Math.cos(rad) - 7) + "px";
    thumb.style.top  = (rect.height/2 + r*Math.sin(rad) - 7) + "px";
  });
  return ()=> (($(tagId).textContent) || "").trim();
}


/* ======= 色ホイール（アクセ） ======= */
function initColorWheel(idBase, defaultHue=0, defaultS=80, defaultL=50){
  const wheel = document.getElementById("wheel_"+idBase);
  const thumb = document.getElementById("thumb_"+idBase);
  const sat   = document.getElementById("sat_"+idBase);
  const lit   = document.getElementById("lit_"+idBase);
  const sw    = document.getElementById("sw_"+idBase);
  const tag   = document.getElementById("tag_"+idBase);
  if (!wheel || !thumb || !sat || !lit || !sw || !tag) {
    return () => (document.getElementById("tag_"+idBase)?.textContent || "").trim();
  }
  let hue = defaultHue; sat.value = defaultS; lit.value = defaultL;
  function paint(){
    const s=+sat.value, l=+lit.value;
    const [r,g,b]=hslToRgb(hue,s,l);
    sw.style.background = `rgb(${r},${g},${b})`;
    tag.textContent = colorNameFromHSL(hue,s,l);
  }
  const onHue = (h)=>{ hue = h; onHue.__lastHue = h; paint(); };
  onHue.__lastHue = hue;
  addHueDrag(wheel, thumb, onHue);
  sat.addEventListener("input", paint);
  lit.addEventListener("input", paint);
  requestAnimationFrame(()=>{
    paint();
    const rect = wheel.getBoundingClientRect();
    const r = rect.width/2 - 7;
    const rad = (hue - 90) * Math.PI/180;
    thumb.style.left = (rect.width/2  + r*Math.cos(rad) - 7) + "px";
    thumb.style.top  = (rect.height/2 + r*Math.sin(rad) - 7) + "px";
  });
  return ()=> tag.textContent.trim();
}

// チェックボックス版（radioListと対になるやつ）
function checkList(el, list, name, { prechecked = [] } = {}) {
  if (!el) return;
  const items = normList(list);
  const checkedSet = new Set(prechecked.map(String));
  el.innerHTML = items.map((it) => {
    const showMini = it.tag && it.label && it.tag !== it.label;
    const checked = checkedSet.has(String(it.tag)) ? 'checked' : '';
    return `<label class="chip">
      <input type="checkbox" name="${name}" value="${it.tag}" ${checked}>
      ${it.label}${showMini ? `<span class="mini"> ${it.tag}</span>` : ""}
    </label>`;
  }).join("");
}

/* ========= UI生成 ========= */
function radioList(el, list, name, {checkFirst = true} = {}) {
  if (!el) return;
  const items = normList(list);
  el.innerHTML = items.map((it, i) => {
    const showMini = it.tag && it.label && it.tag !== it.label;
    const checked = (checkFirst && i === 0) ? 'checked' : '';
    return `<label class="chip">
      <input type="radio" name="${name}" value="${it.tag}" ${checked}>
      ${it.label}${showMini ? `<span class="mini"> ${it.tag}</span>` : ""}
    </label>`;
  }).join("");
}

const getOne  = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";

// 複数値を取得（chip.on / is-selected / ARIA / 入力系）
function getMany(idOrName){
  const root = document.getElementById(idOrName);
  if (root) {
    const nodes = root.querySelectorAll(
      '.chip.on,' +
      '.wm-item.is-selected,' +
      '[aria-selected="true"],' +
      '[data-selected="true"],' +
      '.selected,.active,.sel,' +
      '.option.selected,.item.selected,' +
      'input[type=checkbox]:checked,' +
      'input[type=radio]:checked'
    );
    return Array.from(nodes).map(_toEnTagFromEl).filter(Boolean);
  }
  // name=... （旧ラジオ/チェックボックス）
  const els = document.querySelectorAll(`input[name="${idOrName}"]:checked`);
  if (els?.length) return Array.from(els).map(_toEnTagFromEl).filter(Boolean);
  return [];
}




/* ===========================================================
 * 単語モード（置き換え版）
 * 変更点:
 *  - getWordModeDict: NSFW拡張カテゴリを返す
 *  - renderAll: nipple-nsfw に統一（nipples-nsfw を削除）
 *  - fillCat: テンプレ/ホストが無い場合でも安全
 * =========================================================== */
(function(){
  // ====== state ======
  var initialized = false;

  // DOM handles（initで埋める）
  var elItems = {}, elCounts = {};
  var tplItem = null, tplItemColor = null, tplRow = null;
  var tblBody = null, btnCopyENAll = null, btnCopyBothAll = null, btnTableClear = null;
  var chipArea = null, chipCount = null, btnSelectedClear = null;
  var panel = null;

  var MAX_ROWS = 20;
  var LS_KEY = "wm_rows_v1";

  // ====== events ======
  document.addEventListener('dict:updated', function(){
    refreshWordMode();
  });

  document.addEventListener('DOMContentLoaded', function(){
    var tab = document.querySelector('.tab[data-mode="word"]');
    if (!tab) return;

    tab.addEventListener('click', function(){
      if (!initialized) {
        initialized = true;
        initWordMode();
      }
    });
  });

  // ====== refresh (辞書更新で呼ぶ) ======
  function refreshWordMode(){
    if (!initialized) return;
    renderAll().catch(function(e){ console.warn('Word mode refresh failed:', e); });
  }

  // ====== init ======
  function initWordMode(){
    panel = document.getElementById('panelWordMode');
    if (!panel) return;

    var el = function(id){ return document.getElementById(id); };

    elItems = {
      background:        el('wm-items-background'),
      pose:              el('wm-items-pose'),
      composition:       el('wm-items-composition'),
      view:              el('wm-items-view'),
      'expression-sfw':  el('wm-items-expression-sfw'),
      'lighting-sfw':    el('wm-items-lighting-sfw'),
      world:             el('wm-items-world'),
      personality:       el('wm-items-personality'),
      relationship:      el('wm-items-relationship'),
      accessories:       el('wm-items-accessories'),

      'expression-nsfw': el('wm-items-expression-nsfw'),
      exposure:          el('wm-items-exposure'),
      situation:         el('wm-items-situation'),
      'lighting-nsfw':   el('wm-items-lighting-nsfw'),

      'pose-nsfw':       el('wm-items-pose-nsfw'),
      'accessory-nsfw':  el('wm-items-accessory-nsfw'),
      'outfit-nsfw':     el('wm-items-outfit-nsfw'),
      'body-nsfw':       el('wm-items-body-nsfw'),
      'nipple-nsfw':     el('wm-items-nipple-nsfw'),
      'underwear-nsfw':  el('wm-items-underwear-nsfw'),

      color:             el('wm-items-color')
    };

    elCounts = {
      background:        el('wm-count-background'),
      pose:              el('wm-count-pose'),
      composition:       el('wm-count-composition'),
      view:              el('wm-count-view'),
      'expression-sfw':  el('wm-count-expression-sfw'),
      'lighting-sfw':    el('wm-count-lighting-sfw'),
      world:             el('wm-count-world'),
      personality:       el('wm-count-personality'),
      relationship:      el('wm-count-relationship'),
      accessories:       el('wm-count-accessories'),

      'expression-nsfw': el('wm-count-expression-nsfw'),
      exposure:          el('wm-count-exposure'),
      situation:         el('wm-count-situation'),
      'lighting-nsfw':   el('wm-count-lighting-nsfw'),

      'pose-nsfw':       el('wm-count-pose-nsfw'),
      'accessory-nsfw':  el('wm-count-accessory-nsfw'),
      'outfit-nsfw':     el('wm-count-outfit-nsfw'),
      'body-nsfw':       el('wm-count-body-nsfw'),
      'nipple-nsfw':     el('wm-count-nipple-nsfw'),
      'underwear-nsfw':  el('wm-count-underwear-nsfw'),

      color:             el('wm-count-color')
    };

    tplItem      = el('wm-item-tpl');
    tplItemColor = el('wm-item-tpl-color');
    tplRow       = el('wm-row-tpl');

    tblBody         = el('wm-table-body');
    btnCopyENAll    = el('wm-copy-en-all');
    btnCopyBothAll  = el('wm-copy-both-all');
    btnTableClear   = el('wm-table-clear');

    chipArea        = el('wm-selected-chips');
    chipCount       = el('wm-selected-count');
    btnSelectedClear= el('wm-selected-clear');

    if (btnCopyENAll) btnCopyENAll.addEventListener('click', copyAllEN);
    if (btnCopyBothAll && btnCopyBothAll.parentNode) btnCopyBothAll.parentNode.removeChild(btnCopyBothAll);
    if (btnTableClear) btnTableClear.addEventListener('click', clearRows);
    if (btnSelectedClear) btnSelectedClear.addEventListener('click', clearRows);

    renderAll().catch(function(e){ console.error(e); });
  }

  // ====== fetch dicts ======
  function loadFallbackJSON(path){
    return fetch(path, {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .catch(function(){ return null; });
  }
  function firstNonNull(){
    for (var i=0;i<arguments.length;i++){ if (arguments[i]!=null) return arguments[i]; }
    return null;
  }
  function getByPath(root, path){
    var parts = path.split('.');
    var cur = root;
    for (var i=0;i<parts.length;i++){
      if (!cur) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function sniffGlobalDict(cands){
    for (var i=0;i<cands.length;i++){
      var obj = getByPath(window, cands[i]);
      if (obj && typeof obj === 'object') return obj;
    }
    return null;
  }

  // 日本語/英語の先頭ラベル除去（例: 「日本語-」「Japanese:」「English-」「日本語固有名:」）
  function stripLabelPrefix(s){
    s = String(s||"");
    s = s.replace(/^\s*(?:日本語(?:固有名)?|Japanese|English)\s*[-:：]\s*/i, "");
    s = s.replace(/\s*\(?(?:日本語|Japanese|English)\)?\s*$/i, "");
    return s.trim();
  }

  // === JP/ENを保持して正規化（コピーはEN、表示はJP大/EN小、テーブルJPは固有名のみ）===
  function normalizeEntries(arr){
    arr = Array.isArray(arr) ? arr : [];
    var out = [];
    for (var i=0;i<arr.length;i++){
      var x = arr[i] || {};
      var ja = stripLabelPrefix(firstNonNull(x.ja, x.jp, x.label, x.name, ""));
      var en = stripLabelPrefix(firstNonNull(x.en, x.tag, x.value, ""));
      if (!en) continue;               // EN空はスキップ（コピーできないため）
      out.push({ ja: ja, en: en, level: x.level || "" });
    }
    return out;
  }

  function pickCat(dict, names){
    for (var i=0;i<names.length;i++){
      var n = names[i];
      if (dict && Array.isArray(dict[n])) return dict[n];
    }
    return [];
  }
  function pickNSFW(ns, keys){
    if (!ns) return [];
    for (var i=0;i<keys.length;i++){
      var k = keys[i];
      var fromCat = ns.categories && Array.isArray(ns.categories[k]) ? ns.categories[k] : null;
      var flat    = Array.isArray(ns[k]) ? ns[k] : null;
      if (fromCat) return fromCat;
      if (flat) return flat;
    }
    return [];
  }

  function getWordModeDict(){
    var sfwRaw  = sniffGlobalDict(['SFW','sfw','DICT_SFW','dictSfw','app.dict.sfw','APP_DICT.SFW']);
    var nsfwRaw = sniffGlobalDict(['NSFW','nsfw','DICT_NSFW','dictNsfw','app.dict.nsfw','APP_DICT.NSFW']);

    var sfwP = (sfwRaw ? Promise.resolve(sfwRaw) : loadFallbackJSON('dict/default_sfw.json'));
    var nsfwP= (nsfwRaw? Promise.resolve(nsfwRaw): loadFallbackJSON('dict/default_nsfw.json'));

    return Promise.all([sfwP, nsfwP]).then(function(res){
      var sfw  = res[0] || {};
      var nsfw = res[1] || {};

      var sfwTop  = sfw.sfw  || sfw.SFW  || sfw;
      var nsfwTop = nsfw.NSFW|| nsfw.nsfw|| nsfw;

      return {
        sfw: {
          background:   normalizeEntries(pickCat(sfwTop, ['background'])),
          pose:         normalizeEntries(pickCat(sfwTop, ['pose'])),
          composition:  normalizeEntries(pickCat(sfwTop, ['composition'])),
          view:         normalizeEntries(pickCat(sfwTop, ['view'])),
          expression:   normalizeEntries(pickCat(sfwTop, ['expression','expressions'])),
          lighting:     normalizeEntries(pickCat(sfwTop, ['lighting'])),
          world:        normalizeEntries(pickCat(sfwTop, ['world','worldview'])),
          personality:  normalizeEntries(pickCat(sfwTop, ['personality'])),
          relationship: normalizeEntries(pickCat(sfwTop, ['relationship'])),
          accessories:  normalizeEntries(pickCat(sfwTop, ['accessories','accessory'])),
          color:        normalizeEntries(pickCat(sfwTop, ['color','colors']))
        },
        nsfw: {
          expression: normalizeEntries(pickNSFW(nsfwTop, ['expression','表情'])),
          exposure:   normalizeEntries(pickNSFW(nsfwTop, ['exposure','露出'])),
          situation:  normalizeEntries(pickNSFW(nsfwTop, ['situation','シチュ','scenario'])),
          lighting:   normalizeEntries(pickNSFW(nsfwTop, ['lighting','light','ライティング'])),
          pose:       normalizeEntries(pickNSFW(nsfwTop, ['pose','poses','ポーズ'])),
          accessory:  normalizeEntries(pickNSFW(nsfwTop, ['accessory','accessories','acc','アクセ','アクセサリー'])),
          outfit:     normalizeEntries(pickNSFW(nsfwTop, ['outfit','outfits','costume','clothes','衣装'])),
          body:       normalizeEntries(pickNSFW(nsfwTop, ['body','anatomy','features','身体','体型'])),
          nipples:    normalizeEntries(pickNSFW(nsfwTop, ['nipples','nipple','乳首'])),
          underwear:  normalizeEntries(pickNSFW(nsfwTop, ['underwear','lingerie','下着','インナー']))
        }
      };
    });
  }

  // ====== render ======
  function renderAll(){
    return getWordModeDict().then(function(dict){
      // SFW
      fillCat('background', dict.sfw.background);
      fillCat('pose', dict.sfw.pose);
      fillCat('composition', dict.sfw.composition);
      fillCat('view', dict.sfw.view);
      fillCat('expression-sfw', dict.sfw.expression);
      fillCat('lighting-sfw', dict.sfw.lighting);
      fillCat('world', dict.sfw.world);
      fillCat('personality', dict.sfw.personality);
      fillCat('relationship', dict.sfw.relationship);
      fillCat('accessories', dict.sfw.accessories);

      // NSFW 基本
      fillCat('expression-nsfw', dict.nsfw.expression);
      fillCat('exposure',        dict.nsfw.exposure);
      fillCat('situation',       dict.nsfw.situation);
      fillCat('lighting-nsfw',   dict.nsfw.lighting);

      // NSFW 追加
      fillCat('pose-nsfw',       dict.nsfw.pose);
      fillCat('accessory-nsfw',  dict.nsfw.accessory);
      fillCat('outfit-nsfw',     dict.nsfw.outfit);
      fillCat('body-nsfw',       dict.nsfw.body);
      fillCat('nipple-nsfw',     dict.nsfw.nipples);
      fillCat('underwear-nsfw',  dict.nsfw.underwear);

      // 色
      fillCat('color', dict.sfw.color, true);

      restoreRows();
      updateSelectedView();
    });
  }

  // ====== fillCat（一覧は JP大 / EN小。クリックで行追加：JPも保存、コピーはENのみ） ======
  function fillCat(catKey, items, isColor){
    var host = elItems[catKey];
    if (!host) return;

    host.innerHTML = "";
    var useTpl = isColor ? tplItemColor : tplItem;
    if (!useTpl || !useTpl.content) {
      if (elCounts[catKey]) elCounts[catKey].textContent = String(items && items.length ? items.length : 0);
      return;
    }

    items = Array.isArray(items) ? items : [];
    for (var i=0;i<items.length;i++){
      (function(obj){
        var jp = obj.ja || "";
        var en = obj.en || "";
        if (!en) return;

        var node = useTpl.content.firstElementChild.cloneNode(true);
        node.dataset.en  = en;
        node.dataset.jp  = jp;
        node.dataset.cat = catKey;

        var jpEl = node.querySelector('.wm-jp');
        var enEl = node.querySelector('.wm-en');
        if (jpEl) jpEl.textContent = jp;
        if (enEl) enEl.textContent = en;

        node.addEventListener('click', function(ev){
          if (closest(ev.target, '.wm-actions')) return;
          addRow({ jp: jp, en: en, cat: catKey });
        });

        var bEn = node.querySelector('.wm-copy-en');
        if (bEn){
          bEn.addEventListener('click', function(ev){
            ev.stopPropagation();
            copyText(en);
          });
        }
        var bBoth = node.querySelector('.wm-copy-both');
        if (bBoth && bBoth.parentNode) bBoth.parentNode.removeChild(bBoth);

        host.appendChild(node);
      })(items[i] || {});
    }

    if (elCounts[catKey]) elCounts[catKey].textContent = String(items.length);
  }

  // ====== table ops ======
  function currentRows(){
    var rows = [];
    if (!tblBody) return rows;
    var trs = tblBody.querySelectorAll('tr');
    for (var i=0;i<trs.length;i++){
      var tr = trs[i];
      rows.push({
        jp:  (tr.querySelector('.wm-row-jp') ? tr.querySelector('.wm-row-jp').textContent : ""),
        en:  tr.getAttribute('data-en') || (tr.querySelector('.wm-row-en') ? tr.querySelector('.wm-row-en').textContent : ""),
        cat: tr.getAttribute('data-cat') || ""
      });
    }
    return rows;
  }
  function hasRow(en){
    if (!tblBody) return false;
    var sel = 'tr[data-en="' + cssEscape(en) + '"]';
    return !!tblBody.querySelector(sel);
  }
  function addRow(item){
    if (!item || !item.en || !tplRow || !tplRow.content || !tblBody) return;
    if (hasRow(item.en)) return;
    var rows = currentRows();
    if (rows.length >= MAX_ROWS) { flashOK(); return; }

    // JPのラベル語は念押し除去（固有名のみ残す）
    var jpClean = stripLabelPrefix(item.jp || "");

    var tr = tplRow.content.firstElementChild.cloneNode(true);
    tr.setAttribute('data-en', item.en);
    tr.setAttribute('data-cat', item.cat || "");

    var jpCell = tr.querySelector('.wm-row-jp');
    var enCell = tr.querySelector('.wm-row-en');
    if (jpCell) jpCell.textContent = jpClean;     // ← 固有名のみ
    if (enCell) enCell.textContent = item.en;     // ← 実際のプロンプト

    var bEn = tr.querySelector('.wm-row-copy-en');
    if (bEn) bEn.addEventListener('click', function(){ copyText(item.en); });
    var bBoth = tr.querySelector('.wm-row-copy-both');
    if (bBoth && bBoth.parentNode) bBoth.parentNode.removeChild(bBoth);

    var bDel = tr.querySelector('.wm-row-remove');
    if (bDel) bDel.addEventListener('click', function(){
      tr.remove(); persistRows(); updateSelectedView();
    });

    tblBody.appendChild(tr);
    persistRows();
    updateSelectedView();
  }
  function persistRows(){
    var rows = currentRows().map(function(r){ return { jp:r.jp, en:r.en, cat:r.cat }; });
    try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch(e){}
  }
  function restoreRows(){
    try{
      var s = localStorage.getItem(LS_KEY);
      if (!s) return;
      var rows = JSON.parse(s);
      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        addRow({ jp:r.jp, en:r.en, cat:r.cat });
      }
    }catch(e){}
  }
  function clearRows(){
    if (!tblBody) return;
    tblBody.innerHTML = "";
    persistRows();
    updateSelectedView();
  }

  function copyAllEN(){
    var tags = currentRows().map(function(r){ return r.en; }).filter(Boolean);
    if (!tags.length) return;
    copyText(tags.join(", "));
  }

  // 選択中チップ：JP大/EN小（コピーUIなし、削除のみ）
  function updateSelectedView(){
    if (!chipArea) return;
    var rows = currentRows();
    if (chipCount) chipCount.textContent = String(rows.length);
    chipArea.innerHTML = "";
    for (var i=0;i<rows.length;i++){
      (function(r){
        var chip = document.createElement('span');
        chip.className = "wm-chip";
        var jpClean = stripLabelPrefix(r.jp || "");
        chip.innerHTML =
          '<span>'+escapeHTML(jpClean)+'</span> ' +
          '<small>'+escapeHTML(r.en)+'</small> ' +
          '<span class="x" title="削除">×</span>';
        var x = chip.querySelector('.x');
        if (x) x.addEventListener('click', function(){
          if (!tblBody) return;
          var tr = tblBody.querySelector('tr[data-en="'+cssEscape(r.en)+'"]');
          if (tr) tr.remove();
          persistRows(); updateSelectedView();
        });
        chipArea.appendChild(chip);
      })(rows[i]);
    }
  }

  // ====== utils ======
  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
  }
  function cssEscape(s){ return String(s).replace(/"/g, '\\"'); }
  function closest(el, sel){
    while (el){
      if (el.matches && el.matches(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  function flashOK(){
    if (!panel) return;
    panel.style.boxShadow = "0 0 0 2px rgba(120,200,255,.35) inset";
    setTimeout(function(){ panel.style.boxShadow = ""; }, 180);
    }
  function copyText(text){
    if (navigator && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(flashOK).catch(function(){
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e){}
    ta.remove();
    flashOK();
  }

})();


/* =========================================
   共通ユーティリティ（既存があればそのままでOK）
========================================= */
// 既存の $ / $$ が無い環境でも動くよう保険
window.$  = window.$  || (s => document.querySelector(s));
window.$$ = window.$$ || (s => document.querySelectorAll(s));

/* =========================================
   撮影モード（pm* 名前空間）
========================================= */

/* 安全ヘルパ */
function pmById(id){ return document.getElementById(id); }
// 追加：撮影モード専用 英語化ヘルパ
function pmTextByIdEn(id){
  const raw = (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();
  return raw ? toEnTagStrict(raw) : "";
}
function pmPickOneEn(id){
  // 既存 pickOneFromScroller は toTag 済み想定だが、日本語ラベルが混ざるUIがあるため最終で英語化を強制
  const v = (typeof pickOneFromScroller === 'function') ? pickOneFromScroller(id) : "";
  return v ? toEnTagStrict(v) : "";
}
function pmValById(id){
  var el = pmById(id); return el && typeof el.value !== 'undefined' ? String(el.value).trim() : '';
}
function pmChecked(id){
  var el = pmById(id); return !!(el && el.checked);
}

/* SFW / NSFW 取得（存在すればそれを返す） */
function pmSFW(){
  if (typeof SFW !== 'undefined' && SFW) return SFW;
  if (typeof globalThis !== 'undefined' && globalThis.SFW) return globalThis.SFW;
  if (typeof window !== 'undefined' && window.SFW) return window.SFW;
  return {};
}
function pmNSFW(){
  if (typeof NSFW !== 'undefined' && NSFW) return NSFW;
  if (typeof globalThis !== 'undefined' && globalThis.NSFW) return globalThis.NSFW;
  if (typeof window !== 'undefined' && window.NSFW) return window.NSFW;
  return {};
}

/* list 正規化（外部の normList があれば使い、無ければ簡易版） */
function pmNormList(list){
  if (typeof normList === 'function') return normList(list);
  var out = [];
  if (!list || Object.prototype.toString.call(list) !== '[object Array]') return out;
  for (var i=0; i<list.length; i++){
    var it = list[i];
    if (typeof it === 'string'){
      out.push({ tag: String(it), label: String(it) });
    } else if (it && typeof it === 'object'){
      var tg = (it.tag || it.value || it.en || it.id || '');
      var lb = (it.label || it.jp || it.name || it.title || it.tag || '');
      tg = String(tg || '').trim();
      lb = String(lb || '').trim();
      if (tg || lb) out.push({ tag: tg || lb, label: lb || tg });
    }
  }
  return out;
}

/* ラジオの選択値取得 */
function pmPickOne(name){
  var el = document.querySelector('input[name="'+ name +'"]:checked');
  return el ? (el.value || '') : '';
}

/* 安全に候補配列を拾う */
function pmPickList(obj, keys){
  if (!obj) return [];
  for (var i=0; i<keys.length; i++){
    var v = obj[keys[i]];
    if (v && Object.prototype.toString.call(v) === '[object Array]') return v;
  }
  return [];
}

/* chips風ラジオ（主表示=日本語label / 右肩小さく英tag。value=英tag） */
function pmRenderRadios(containerId, list, opts){
  opts = opts || {};
  var groupName  = opts.groupName || containerId;
  var allowEmpty = !!opts.allowEmpty;
  var checkFirst = !!opts.checkFirst;

  var root = pmById(containerId);
  if (!root) return;

  var items = pmNormList(list);
  var html = [];

  if (allowEmpty){
    html.push(
      '<label class="chip">' +
        '<input type="radio" name="'+ groupName +'" value="" checked>' +
        '<span>指定なし <span class="mini en">none</span></span>' +
      '</label>'
    );
  }

  for (var i=0; i<items.length; i++){
    var it = items[i] || {};
    var tag   = String(it.tag   || '').trim();
    var label = String(it.label || tag).trim();
    var showMini = (tag && label && tag !== label);
    var checked  = (!allowEmpty && checkFirst && i === 0) ? ' checked' : '';
    html.push(
      '<label class="chip">' +
        '<input type="radio" name="'+ groupName +'" value="'+ (tag || label) +'"'+ checked +'>' +
        '<span>'+ label + (showMini ? ' <span class="mini en">'+ tag +'</span>' : '') +'</span>' +
      '</label>'
    );
  }

  root.innerHTML = html.join('');
}

/* アクセ（セレクト）— 表示は日本語、value=英tag。色は initColorWheel があれば利用 */
var pmGetAccColor = function(){
  var t = pmById('tag_plAcc');
  var s = t && t.textContent ? String(t.textContent).trim() : '';
  return s || '';
};

function pmRenderAcc(){
  var sel = pmById('pl_accSel');
  if (!sel) return;

  var src   = pmSFW().accessories || pmSFW().acc || [];
  var items = pmNormList(src);
  var html  = ['<option value="">未選択</option>'];

  for (var i=0; i<items.length; i++){
    var it = items[i] || {};
    var tag   = String(it.tag   || '').trim();
    var label = String(it.label || tag).trim();
    if (!tag && !label) continue;
    html.push('<option value="'+ (tag || label) +'">'+ label +'</option>');
  }
  sel.innerHTML = html.join('');

  if (typeof initColorWheel === 'function'){
    // plAcc 名で wheel/sat/lit/sw/tag を束ねた関数が返る想定
    pmGetAccColor = initColorWheel('plAcc', 0, 75, 50);
  }
}


// 単一選択スキャフォルド（scroller内で data-checked のチップのテキストを取る）
function _selectedChipText(rootSel){
  const root = document.querySelector(rootSel);
  if (!root) return '';
  const chip = root.querySelector('.chip[data-checked="true"], .chip.is-checked');
  // チップの表示テキスト（タグ文字列）を採用
  return (chip?.textContent || '').trim();
}


/* 撮影モード NSFW（制限なし、レベル上限のみ） */
function pmRenderNSFWPlanner(){
  const on = pmChecked('pl_nsfw');
  const panel = pmById('pl_nsfwPanel');
  if (panel) panel.style.display = on ? '' : 'none';
  if (!on) return;

  // レベル上限
  const capEl = document.querySelector('input[name="pl_nsfwLevel"]:checked');
  const cap   = capEl ? capEl.value : 'L1';
  const order = {L1:1, L2:2, L3:3};
  const allow = (lv)=> (order[String(lv||'L1')] || 1) <= (order[cap] || 1);
  const lvl   = (x)=> ({L1:'R-15', L2:'R-18', L3:'R-18G'})[x||'L1'] || 'R-15';

  const ns = pmNSFW() || {};

  // 安全なHTML化
  const esc = (s)=> String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]
  ));

  function chips(list, groupName){
    list = pmNormList(list);
    const out = [];
    for (let i=0; i<list.length; i++){
      const o = list[i] || {};
      if (!allow(o.level)) continue;
      const tg = esc((o.tag||'').trim());
      if (!tg) continue;
      const lb = esc((o.label||o.tag||'').trim());
      out.push(
        '<label class="chip">' +
          '<input type="radio" name="pl_nsfw_'+ groupName +'" value="'+ tg +'">' +
          lb + '<span class="mini"> '+ lvl(o.level) +'</span>' +
        '</label>'
      );
    }
    return out.join('');
  }

  // 対象IDとキーのマッピング（ここを増やせばUIにも即反映）
  const targets = [
    // id                     key          group[name]
    ['pl_nsfw_expr',       'expression', 'expr'],
    ['pl_nsfw_expo',       'exposure',   'expo'],
    ['pl_nsfw_situ',       'situation',  'situ'],
    ['pl_nsfw_light',      'lighting',   'light'],
    ['pl_nsfw_pose',       'pose',       'pose'],
    ['pl_nsfw_acc',        'accessory',  'acc'],
    ['pl_nsfw_outfit',     'outfit',     'outfit'],
    ['pl_nsfw_body',       'body',       'body'],
    ['pl_nsfw_nipple',     'nipples',    'nipple'],    // ← 統一
    ['pl_nsfw_underwear',  'underwear',  'underwear'], // ← 下着
  ];

  for (const [id, key, groupName] of targets){
    const el = pmById(id);
    if (!el) continue;
    el.innerHTML = chips(ns[key] || [], groupName);
  }
}

function pmBindNSFWPlanner(){
  const tgl = pmById('pl_nsfw');
  if (tgl) tgl.addEventListener('change', pmRenderNSFWPlanner);
  const lv = document.querySelectorAll('input[name="pl_nsfwLevel"]');
  for (let i=0; i<lv.length; i++){
    lv[i].addEventListener('change', pmRenderNSFWPlanner);
  }
}

/* 画面描画 */
function pmRenderPlanner(){
  const sfw = pmSFW();
  pmRenderRadios('pl_bg',    pmPickList(sfw, ['background','bg']),           { groupName:'pl_bg' });
  pmRenderRadios('pl_pose',  pmPickList(sfw, ['pose','poses']),              { groupName:'pl_pose', allowEmpty:true });
  pmRenderRadios('pl_comp',  pmPickList(sfw, ['composition','comp']),        { groupName:'pl_comp' });
  pmRenderRadios('pl_view',  pmPickList(sfw, ['view','views']),              { groupName:'pl_view' });
  pmRenderRadios('pl_expr',  pmPickList(sfw, ['expressions','expr']),        { groupName:'pl_expr' });
  pmRenderRadios('pl_light', pmPickList(sfw, ['lighting','light','lights']), { groupName:'pl_light' });

  pmRenderNSFWPlanner();
  pmRenderAcc();
}


/* テーブル描画 */
function pmRenderTable(tbodySel, rows){
  var tb = document.querySelector(tbodySel); if (!tb) return;
  var frag = document.createDocumentFragment();
  for (var i=0; i<rows.length; i++){
    var r = rows[i];
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>'+ (i+1) +'</td>' +
      '<td>'+ r.seed +'</td>' +
      '<td>'+ r.pos.join(', ') +'</td>' +
      '<td>'+ r.neg +'</td>';
    frag.appendChild(tr);
  }
  tb.innerHTML = '';
  tb.appendChild(frag);
}

/* 初期化（1回だけ） */
function pmInitPlannerOnce(){
  if (pmInitPlannerOnce._done) return;

  // SFW 辞書読み込みの準備完了待ち
  var sfw = (typeof pmSFW === 'function' ? pmSFW() : (window.SFW || {}));
  var ready =
    pmPickList(sfw, ['background','bg']).length ||
    pmPickList(sfw, ['pose','poses']).length   ||
    pmPickList(sfw, ['composition','comp']).length;

  if (!ready){
    setTimeout(pmInitPlannerOnce, 80);
    return;
  }

  pmInitPlannerOnce._done = true;

  // ラジオ・アクセ等の描画
  if (typeof pmRenderPlanner === 'function') pmRenderPlanner();

  // 撮影モードの NSFW UI（実装がある場合だけ呼ぶ）
  if (typeof pmBindNSFWPlanner === 'function') pmBindNSFWPlanner();

      // === 1件出力 ===
   var btn = document.getElementById('btnPlanOne');
   if (btn) btn.addEventListener('click', function () {
     var rows = pmBuildOne();
     pmRenderTable('#tblPlanner tbody', rows);
     renderTextTriplet('outPlanner', rows, 'fmtPlanner');   // ← 追加
     toast && toast('プランを出力しました');
   });
   
   // 3分割コピー小ボタンのバインド
   bindCopyTripletExplicit([
     ['btnCopyPlannerAll',    'outPlannerAll'],
     ['btnCopyPlannerPrompt', 'outPlannerPrompt'],
     ['btnCopyPlannerNeg',    'outPlannerNeg']
   ]);

  // === 単一ボックス用コピー（旧互換・任意） ===
  var btnCopy = document.getElementById('btnCopyPlanner');
  if (btnCopy) btnCopy.addEventListener('click', function () {
    var text = (document.getElementById('outPlanner')?.textContent || '').trim();
    if (!text){
      if (typeof toast === 'function') toast('コピーする内容がありません');
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(()=> { if (typeof toast==='function') toast('コピーしました'); })
        .catch(()=> fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    function fallbackCopy(t){
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      if (typeof toast==='function') toast('コピーしました');
    }
  });
}
// 念のため公開
window.pmInitPlannerOnce = pmInitPlannerOnce;


// 元の categorizePoseComp はそのまま利用する前提
function renderSFW(){
  // --- 基本（従来の固定系はそのまま）
  radioList($("#hairStyle"),   SFW.hair_style,      "hairStyle");
  radioList($("#eyeShape"),    SFW.eyes,            "eyeShape");
  radioList($("#face"),        SFW.face,            "face");
  radioList($("#skinBody"),    SFW.skin_body,       "skinBody");
  radioList($("#artStyle"),    SFW.art_style,       "artStyle");

  // ===== 学習タブ：背景/表情/ライトはホワイトリスト適用 =====
  const bg_learn   = filterByScope(SFW.background,   SCOPE.learning.background);
  const expr_learn = filterByScope(SFW.expressions,  SCOPE.learning.expressions);
  const lit_learn  = filterByScope(SFW.lighting,     SCOPE.learning.lighting);

  checkList($("#bg"),         bg_learn,   "bg");
  checkList($("#expr"),       expr_learn, "expr");
  checkList($("#lightLearn"), lit_learn,  "lightLearn");

  // ===== 量産タブ：フル辞書（従来どおり） =====
  checkList($("#p_bg"),    SFW.background,   "p_bg");
  checkList($("#p_expr"),  SFW.expressions,  "p_expr");
  checkList($("#p_light"), SFW.lighting,     "p_light");

   // --- ポーズ/構図/視点（分離版）
   {
     const poseTags = SFW.pose || [];
     const compTags = SFW.composition || [];
     const viewTags = SFW.view || [];
 
     // 学習タブ：ホワイトリスト適用
     const pose_learn = filterByScope(poseTags, SCOPE.learning.pose);
     const comp_learn = filterByScope(compTags, SCOPE.learning.composition);
     const view_learn = filterByScope(viewTags, SCOPE.learning.view);
     checkList($("#pose"), pose_learn, "pose");
     checkList($("#comp"), comp_learn, "comp");
     checkList($("#view"), view_learn, "view");
 
     // 量産タブ：フル辞書
     checkList($("#p_pose"), poseTags, "p_pose");
     checkList($("#p_comp"), compTags, "p_comp");
     checkList($("#p_view"), viewTags, "p_view");
   }

  // ★ outfit をカテゴリに分配して描画（そのまま）
  const C = categorizeOutfit(SFW.outfit);
  radioList($("#outfit_top"),    C.top,   "outfit_top",   {checkFirst:false});
  radioList($("#outfit_pants"),  C.pants, "outfit_pants", {checkFirst:false});
  radioList($("#outfit_skirt"),  C.skirt, "outfit_skirt", {checkFirst:false});
  radioList($("#outfit_dress"),  C.dress, "outfit_dress", {checkFirst:false});
  radioList($("#outfit_shoes"),  C.shoes, "outfit_shoes", {checkFirst:false});
  checkList($("#p_outfit_shoes"), C.shoes, "p_outfit_shoes");
  checkList($("#p_outfit_top"),   C.top,   "p_outfit_top");
  checkList($("#p_outfit_pants"), C.pants, "p_outfit_pants");
  checkList($("#p_outfit_skirt"), C.skirt, "p_outfit_skirt");
  checkList($("#p_outfit_dress"), C.dress, "p_outfit_dress");

  // ★ 基本情報（ID / name は既存の通り）
  radioList($("#bf_age"),      SFW.age,          "bf_age");
  radioList($("#bf_gender"),   SFW.gender,       "bf_gender");
  radioList($("#bf_body"),     SFW.body_type,    "bf_body");
  radioList($("#bf_height"),   SFW.height,       "bf_height");
  // radioList($("#bf_person"),   SFW.personality,  "bf_person");
  // radioList($("#bf_world"),    SFW.worldview,    "bf_world");
  // radioList($("#bf_tone"),     SFW.speech_tone,  "bf_tone");

  // 動的生成後の必須チェック
  if (typeof updateOneTestReady === "function") updateOneTestReady();
}

function bindBottomCategoryGuess(){
  const pan = document.getElementById("outfit_pants");
  const skl = document.getElementById("outfit_skirt");
  pan && pan.addEventListener("click", ()=> __bottomCat = "pants");
  skl && skl.addEventListener("click", ()=> __bottomCat = "skirt");
}

function getBasicSelectedOutfit(){
  const mode = document.querySelector('input[name="outfitMode"]:checked')?.value || "separate";
  if (mode === "onepiece") {
    const d = getOne("outfit_dress");
    return { mode, top:null, bottom:null, dress:d || "" };
  }
  // separate：直近で触られたカテゴリを優先し、無ければ“選べている方”
  const top = getOne("outfit_top") || "";

  const pantsVal = getOne("outfit_pants") || "";
  const skirtVal = getOne("outfit_skirt") || "";

  let bottom = "";
  if (pantsVal && skirtVal){
    bottom = (__bottomCat === "skirt") ? skirtVal : pantsVal;
  } else {
    bottom = skirtVal || pantsVal; // どちらかだけ選ばれている場合
  }
  return { mode, top, bottom, dress:null, bottomCat: (bottom===skirtVal ? "skirt" : "pants") };
}

/* ========= 辞書 I/O ========= */
function isNSFWDict(json){
  const j = json?.NSFW || json || {};
  const cat = j.categories || {};

  // 新旧＋和名エイリアスも検出
  const KEYS = [
    // 旧来
    'expression','exposure','situation','lighting',
    // 追加カテゴリ
    'background','pose','accessory','outfit','body','nipples','underwear',
    // 和名・別名
    '表情','露出','シチュ','ライティング','背景','ポーズ',
    'アクセ','アクセサリー','衣装','身体','体型','乳首','下着','インナー',
    // フラット形式
    'nsfw_tags'
  ];

  const hasArr = (o, k) => Array.isArray(o?.[k]) && o[k].length > 0;

  // 直下 or categories のどちらかに上記キー配列が存在すれば NSFW と判定
  return KEYS.some(k => hasArr(j, k) || hasArr(cat, k));
}

function bindDictIO(){
  const input = document.getElementById("importDict");
  if (!input) return;
  input.addEventListener("change", async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    try {
      const raw = await f.text();
      const json = JSON.parse(raw);
      if (isNSFWDict(json)) {
        mergeIntoNSFW(json);
        renderNSFWProduction();
        renderNSFWLearning();
        toast("NSFW辞書を追記しました");
      } else {
        mergeIntoSFW(json);
        renderSFW();
        fillAccessorySlots();
        toast("SFW辞書を追記しました");
        document.dispatchEvent(new CustomEvent('dict:updated', { detail:{ kind:'sfw' }}));
      }
    } catch {
      toast("辞書の読み込みに失敗（JSONを確認）");
    } finally {
      e.target.value = "";
    }
  });

  $("#btnExport")?.addEventListener("click", ()=>{
    const save = {
      __meta:{ app:"LoRA Prompt Maker", version:"1.0", exported_at:new Date().toISOString() },
      sfw:SFW, nsfw:NSFW, settings:Settings
    };
    dl("lora_prompt_maker_settings.json", JSON.stringify(save,null,2));
  });
}

/* ========= キャラ設定 I/O（HTMLに準拠・完全版） ========= */
/* 既存ユーティリティ ($, $$, dl, toast, getOne, getMany,
   getWearColorTag, updateWearPanelEnabled, getBasicSelectedOutfit,
   isOnePieceOutfitTag など) はそのまま利用可能な想定。 */

function setRadio(name, value){
  const els = document.querySelectorAll(`input[name="${name}"]`);
  let hit=false;
  Array.from(els).forEach(el=>{
    const ok = (el.value === String(value));
    el.checked = ok;
    if (ok) hit = true;
  });
  return hit;
}
function setChecksByName(name, values){
  const set = new Set((values||[]).map(String));
  Array.from(document.querySelectorAll(`input[name="${name}"]`))
    .forEach(el=> el.checked = set.has(el.value));
}
function setChecksIn(containerId, values){
  const box = document.getElementById(containerId);
  if (!box) return;
  const set = new Set((values||[]).map(String));
  Array.from(box.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
    .forEach(el=> el.checked = set.has(el.value));
}
function getManyIn(containerId){
  const box = document.getElementById(containerId);
  if (!box) return [];
  return Array.from(box.querySelectorAll('input:checked')).map(el=>el.value);
}
function setVal(sel, v){
  const el = document.querySelector(sel);
  if (el!=null && typeof v === "string") el.value = v;
}
function setColorTag(tagSel, text){
  const el = document.querySelector(tagSel);
  if (el) el.textContent = (text==null ? "" : String(text));
}
function setSkinTone(v){
  if(typeof v!=="number") return;
  const inp=document.getElementById("skinTone"); if(!inp) return;
  const c=Math.max(0, Math.min(100, Math.round(v)));
  inp.value=c;
  inp.dispatchEvent(new Event("input",{bubbles:true}));
}
function applyLearnAccessoryPreset(obj){
  if(!obj) return;
  if(obj.tag!=null){ const sel=document.getElementById("learn_acc"); if(sel) sel.value = String(obj.tag); }
  if(obj.color!=null){ setColorTag("#tag_learnAcc", obj.color); }
}
function show(el, on){ if(el) el.style.display = on ? "" : "none"; }

/* ---------- インポート（適用） ---------- */
function applyCharacterPreset(cfg){
  // 小ヘルパ
  const arrify = (v)=> Array.isArray(v) ? v : (v != null ? [v] : []);
  const uniq   = (a)=> Array.from(new Set((a||[]).filter(x=>x!=="" && x!=null)));
  const tagOf  = (x)=> (typeof x === "string" ? x : (x && x.tag) ? x.tag : "");
  const toSet  = (list)=> new Set((list||[]).map(tagOf));

  // マスタから旧→新の判別用
  const POSE = (typeof SFW!=="undefined") ? toSet(SFW.pose || SFW.pose_composition || []) : new Set();
  const COMP = (typeof SFW!=="undefined") ? toSet(SFW.composition || []) : new Set();
  const VIEW = (typeof SFW!=="undefined") ? toSet(SFW.view || []) : new Set();

  /* ===== 基本テキスト ===== */
  setVal("#charName",   cfg.charName || cfg.characterName || "");
  setVal("#loraTag",    cfg.loraTag  || cfg.lora || "");

  // プロキシ経由（fixedManual/negGlobal）は active タブに転送される想定だが、
  // 値を直接も復元したいので、存在すれば各モード側にも反映
  setVal("#fixedManual", cfg.fixed    || cfg.fixedTags || "");
  setVal("#negGlobal",   cfg.negative || cfg.negativeTags || "");

  /* ===== 構図/視点（旧 pose_composition 分解） ===== */
  const legacy = arrify(cfg.pose_composition);
  const legacyPose = legacy.filter(t => POSE.has(String(t)));
  const legacyComp = legacy.filter(t => COMP.has(String(t)));
  const legacyView = legacy.filter(t => VIEW.has(String(t)));

  // comp
  setChecksByName("comp", uniq([...(cfg.comp||[]), ...(cfg.composition||[]), ...legacyComp]));
  // view
  setChecksByName("view", uniq([...(cfg.view||[]), ...legacyView]));
  // pose
  setChecksByName("pose", uniq([...(cfg.pose||[]), ...legacyPose]));
  // background/expressions/light（学習タブのライト）
  if (cfg.background)  setChecksByName("bg",   arrify(cfg.background));
  if (cfg.expressions) setChecksByName("expr", arrify(cfg.expressions));
  {
    const fromNew = arrify(cfg.lightLearn);
    const fromAlt = arrify(cfg.lighting);
    setChecksByName("lightLearn", uniq([...fromNew, ...fromAlt]));
  }

  /* ===== 形状（ラジオ） ===== */
  if (cfg.hairStyle) setRadio("hairStyle", String(cfg.hairStyle));
  if (cfg.eyeShape)  setRadio("eyeShape",  String(cfg.eyeShape));
  if (cfg.face)      setRadio("face",      String(cfg.face));
  if (cfg.skinBody)  setRadio("skinBody",  String(cfg.skinBody));
  if (cfg.artStyle)  setRadio("artStyle",  String(cfg.artStyle));

  /* ===== 色（髪/瞳/肌） ===== */
  if (cfg.hairColorTag!=null) setColorTag("#tagH", String(cfg.hairColorTag||""));
  if (cfg.eyeColorTag!=null)  setColorTag("#tagE", String(cfg.eyeColorTag||""));
  if (typeof cfg.skinTone === "number") setSkinTone(cfg.skinTone);

  /* ===== 基本情報（bf_*） ===== */
  const bf = cfg.bf || {};
  if (bf.age)    setRadio("bf_age",    String(bf.age));
  if (bf.gender) setRadio("bf_gender", String(bf.gender));
  if (bf.body)   setRadio("bf_body",   String(bf.body));
  if (bf.height) setRadio("bf_height", String(bf.height));

  /* ===== outfit（上下/ワンピ/靴） ===== */
  {
    const outf = cfg.outfit || cfg.outfitSel || cfg.outfits;
    if (typeof outf === "string") {
      // 旧：単一タグ
      if (typeof isOnePieceOutfitTag === "function" && isOnePieceOutfitTag(outf)) {
        setRadio("outfitMode", "onepiece");
        setChecksByName("outfit_dress", [outf]);
      } else {
        setRadio("outfitMode", "separate");
        setChecksByName("outfit_top", [outf]);
      }
    } else if (outf && typeof outf === "object") {
      const mode = outf.mode || "separate";
      setRadio("outfitMode", mode);

      if (mode === "onepiece") {
        if (outf.dress) setChecksByName("outfit_dress", [String(outf.dress)]);
      } else {
        if (outf.top) setChecksByName("outfit_top", [String(outf.top)]);
        const cat = (outf.bottomCat || "pants").toLowerCase();
        if (cat === "skirt") {
          if (outf.bottom) setChecksByName("outfit_skirt", [String(outf.bottom)]);
          window.__bottomCat = "skirt";
        } else {
          if (outf.bottom) setChecksByName("outfit_pants", [String(outf.bottom)]);
          window.__bottomCat = "pants";
        }
      }
      // 靴（基本情報タブのラジオ）
      if (outf.shoes) {
        // outfit_shoes は「ラジオ1つ選択」の想定
        const box = document.getElementById("outfit_shoes");
        if (box) {
          // box内部の name はランタイム生成だけど、いずれにせよ value マッチでいける
          setChecksIn("outfit_shoes", [String(outf.shoes)]);
        } else {
          // name 指定版（生成済みなら）
          setChecksByName("outfit_shoes", [String(outf.shoes)]);
        }
      }
    }
    if (typeof window.applyOutfitMode === "function") window.applyOutfitMode();
  }

  /* ===== 服カラー（固定：top/bottom/shoes） ===== */
  {
    const wc = cfg.wearColors || {};
    const wu = cfg.wearColorUse || {};
    const applyWear = (idBase, text, useOn) => {
      const useEl = (idBase === "bottom") ? document.getElementById("useBottomColor")
                                          : document.getElementById("use_"+idBase);
      if (useEl) useEl.checked = !!useOn;
      if (text!=null) setColorTag("#tag_"+idBase, String(text||""));
      if (typeof updateWearPanelEnabled === "function") updateWearPanelEnabled(idBase);
    };
    applyWear("top",    wc.top,    (wu.top    ?? !!wc.top));
    applyWear("bottom", wc.bottom, (wu.bottom ?? !!wc.bottom));
    applyWear("shoes",  wc.shoes,  (wu.shoes  ?? !!wc.shoes));
  }

  /* ===== 学習アクセ ===== */
  if (cfg.learnAccessory) applyLearnAccessoryPreset(cfg.learnAccessory);

  /* ===== 学習モード NSFW ===== */
  if (cfg.nsfwLearn) {
    const p = cfg.nsfwLearn;
    const t = document.getElementById("nsfwLearn");
    const panel = document.getElementById("nsfwLearnPanel");
    if (typeof p.on === "boolean" && t) { t.checked = p.on; show(panel, p.on); }
    if (p.level) setRadio("nsfwLevelLearn", p.level);
    if (p.selected) {
      const S = p.selected;
      setChecksIn("nsfwL_expo",    S.exposure);
      setChecksIn("nsfwL_underwear", S.underwear);
      setChecksIn("nsfwL_outfit",  S.outfit);
      setChecksIn("nsfwL_expr",    S.expression);
      setChecksIn("nsfwL_situ",    S.situation);
      setChecksIn("nsfwL_light",   S.lighting);
      setChecksIn("nsfwL_pose",    S.pose);
      setChecksIn("nsfwL_acc",     S.accessory);
      setChecksIn("nsfwL_body",    S.body);
      setChecksIn("nsfwL_nipple",  S.nipples || S.nipple);
    }
  }

  /* ===== 撮影モード（planner） ===== */
  if (cfg.planner && typeof cfg.planner === "object") {
    const P = cfg.planner;
    setChecksIn("pl_bg",   P.background);
    setChecksIn("pl_pose", P.pose);
    setChecksIn("pl_comp", P.comp);
    setChecksIn("pl_view", P.view);
    setChecksIn("pl_expr", P.expressions);
    setChecksIn("pl_light",P.lighting);

    // 固定アクセ（タグ＋色）
    if (P.accessory) {
      if (P.accessory.tag!=null) { const s=document.getElementById("pl_accSel"); if(s) s.value=String(P.accessory.tag); }
      if (P.accessory.color!=null) setColorTag("#tag_plAcc", P.accessory.color);
    }

    // 固定/ネガ
    if (P.fixed!=null) setVal("#fixedPlanner", String(P.fixed));
    if (P.negative!=null) setVal("#negPlanner", String(P.negative));
    if (typeof P.useDefaultNeg === "boolean") {
      const el = document.getElementById("pl_useDefaultNeg"); if (el) el.checked = P.useDefaultNeg;
    }

    // NSFW（撮影）
    if (P.nsfw && typeof P.nsfw === "object") {
      const t = document.getElementById("pl_nsfw");
      const panel = document.getElementById("pl_nsfwPanel");
      if (typeof P.nsfw.on === "boolean" && t) { t.checked = P.nsfw.on; show(panel, P.nsfw.on); }
      if (P.nsfw.level) setRadio("pl_nsfwLevel", P.nsfw.level);
      if (P.nsfw.selected) {
        const S = P.nsfw.selected;
        setChecksIn("pl_nsfw_expo",     S.exposure);
        setChecksIn("pl_nsfw_underwear",S.underwear);
        setChecksIn("pl_nsfw_outfit",   S.outfit);
        setChecksIn("pl_nsfw_expr",     S.expression);
        setChecksIn("pl_nsfw_situ",     S.situation);
        setChecksIn("pl_nsfw_light",    S.lighting);
        setChecksIn("pl_nsfw_pose",     S.pose);
        setChecksIn("pl_nsfw_acc",      S.accessory);
        setChecksIn("pl_nsfw_body",     S.body);
        setChecksIn("pl_nsfw_nipple",   S.nipple || S.nipples);
      }
    }
    // 出力フォーマット（任意）
    if (P.fmtOne) setVal("#fmtPlanner", String(P.fmtOne));
  }

  /* ===== 学習モード 付帯（固定/ネガ・フォーマット・件数） ===== */
  if (cfg.learning && typeof cfg.learning === "object") {
    const L = cfg.learning;
    if (L.fixed!=null) setVal("#fixedLearn", String(L.fixed));
    if (L.negative!=null) setVal("#negLearn", String(L.negative));
    if (typeof L.useDefaultNeg === "boolean") {
      const el = document.getElementById("useDefaultNeg"); if (el) el.checked = L.useDefaultNeg;
    }
    if (L.fmtOne) setVal("#fmtLearn", String(L.fmtOne));
    if (L.fmtBatch) setVal("#fmtLearnBatch", String(L.fmtBatch));
    if (L.countBatch!=null) setVal("#countLearn", String(L.countBatch));
  }

  /* ===== 量産モード（production） ===== */
  if (cfg.production && typeof cfg.production === "object") {
    const R = cfg.production;

    // 服（複数選択）
    setChecksIn("p_outfit_top",   R.outfit?.top);
    setChecksIn("p_outfit_pants", R.outfit?.pants);
    setChecksIn("p_outfit_skirt", R.outfit?.skirt);
    setChecksIn("p_outfit_dress", R.outfit?.dress);
    setChecksIn("p_outfit_shoes", R.outfit?.shoes);

    // カラー（量産用）
    if (R.colors) {
      const C = R.colors;
      if (typeof C.useTop === "boolean")   { const el=document.getElementById("p_use_top");    if(el) el.checked=C.useTop; }
      if (typeof C.useBottom === "boolean"){ const el=document.getElementById("p_use_bottom"); if(el) el.checked=C.useBottom; }
      if (typeof C.useShoes === "boolean") { const el=document.getElementById("p_use_shoes");  if(el) el.checked=C.useShoes; }
      if (C.topTag!=null)    setColorTag("#tag_p_top",    C.topTag);
      if (C.bottomTag!=null) setColorTag("#tag_p_bottom", C.bottomTag);
      if (C.shoesTag!=null)  setColorTag("#tag_p_shoes",  C.shoesTag);
    }
    // 置換許可
    if (typeof R.allowBottomSwap === "boolean") {
      const el = document.getElementById("allowBottomSwap"); if (el) el.checked = R.allowBottomSwap;
    }

    // NSFW（量産）
    if (R.nsfw) {
      const t = document.getElementById("nsfwProd");
      const panel = document.getElementById("nsfwProdPanel");
      if (typeof R.nsfw.on === "boolean" && t) { t.checked = R.nsfw.on; show(panel, R.nsfw.on); }
      if (R.nsfw.level) setRadio("nsfwLevelProd", R.nsfw.level);
      if (R.nsfw.selected) {
        const S = R.nsfw.selected;
        setChecksIn("nsfwP_expo",     S.exposure);
        setChecksIn("nsfwP_underwear",S.underwear);
        setChecksIn("nsfwP_outfit",   S.outfit);
        setChecksIn("nsfwP_expr",     S.expression);
        setChecksIn("nsfwP_situ",     S.situation);
        setChecksIn("nsfwP_light",    S.lighting);
        setChecksIn("nsfwP_pose",     S.pose);
        setChecksIn("nsfwP_acc",      S.accessory);
        setChecksIn("nsfwP_body",     S.body);
        setChecksIn("nsfwP_nipple",   S.nipple || S.nipples);
      }
    }

    // 固定/ネガ・件数/seed/フォーマット
    if (R.fixed!=null) setVal("#fixedProd", String(R.fixed));
    if (R.negative!=null) setVal("#p_neg", String(R.negative));
    if (R.count!=null) setVal("#countProd", String(R.count));
    if (R.seedMode) setRadio("seedMode", R.seedMode);
    if (R.fmt) setVal("#fmtProd", String(R.fmt));
  }

  // 最後：依存更新
  if (typeof updateOneTestReady === "function") updateOneTestReady();
  toast("キャラ設定を読み込みました");
}

/* ---------- エクスポート（収集） ---------- */
function collectCharacterPreset(){
  // outfit（基本情報タブ）
  const outfitSel = (typeof getBasicSelectedOutfit === "function")
    ? getBasicSelectedOutfit()
    : { mode:"separate", top:"", bottom:"", dress:"", bottomCat:(window.__bottomCat||"pants"), shoes:"" };

  // 装備：靴（基本情報タブのラジオ1つ）
  // getBasicSelectedOutfit に shoes が無いケースもあるので、補完で拾う
  if (!outfitSel.shoes) {
    const box = document.getElementById("outfit_shoes");
    if (box) {
      const r = box.querySelector('input:checked');
      if (r) outfitSel.shoes = r.value;
    } else {
      const r = document.querySelector('input[name="outfit_shoes"]:checked');
      if (r) outfitSel.shoes = r.value;
    }
  }

  // 基本の固定色（タグ）
  const wearColors = {
    top:    (typeof getWearColorTag === "function") ? getWearColorTag("top")    : (document.getElementById("tag_top")?.textContent||""),
    bottom: (typeof getWearColorTag === "function") ? getWearColorTag("bottom") : (document.getElementById("tag_bottom")?.textContent||""),
    shoes:  (typeof getWearColorTag === "function") ? getWearColorTag("shoes")  : (document.getElementById("tag_shoes")?.textContent||"")
  };
  const wearColorUse = {
    top:    !!document.getElementById("use_top")?.checked,
    bottom: !!document.getElementById("useBottomColor")?.checked,
    shoes:  !!document.getElementById("use_shoes")?.checked
  };

  // ===== 撮影モード（planner） =====
  const planner = (()=>{
    const o = {
      background:  getManyIn("pl_bg"),
      pose:        getManyIn("pl_pose"),
      comp:        getManyIn("pl_comp"),
      view:        getManyIn("pl_view"),
      expressions: getManyIn("pl_expr"),
      lighting:    getManyIn("pl_light"),
      accessory: {
        tag:   document.getElementById("pl_accSel")?.value || "",
        color: document.getElementById("tag_plAcc")?.textContent || ""
      },
      fixed:       document.getElementById("fixedPlanner")?.value || "",
      negative:    document.getElementById("negPlanner")?.value || "",
      useDefaultNeg: !!document.getElementById("pl_useDefaultNeg")?.checked,
      fmtOne:      document.getElementById("fmtPlanner")?.value || ""
    };
    // NSFW
    const on = !!document.getElementById("pl_nsfw")?.checked;
    const level = (document.querySelector('input[name="pl_nsfwLevel"]:checked')?.value) || "L1";
    const selected = {
      exposure:   getManyIn("pl_nsfw_expo"),
      underwear:  getManyIn("pl_nsfw_underwear"),
      outfit:     getManyIn("pl_nsfw_outfit"),
      expression: getManyIn("pl_nsfw_expr"),
      situation:  getManyIn("pl_nsfw_situ"),
      lighting:   getManyIn("pl_nsfw_light"),
      pose:       getManyIn("pl_nsfw_pose"),
      accessory:  getManyIn("pl_nsfw_acc"),
      body:       getManyIn("pl_nsfw_body"),
      nipple:     getManyIn("pl_nsfw_nipple")
    };
    const hasNS = Object.values(selected).some(a=>a && a.length);
    return { ...o, nsfw: { on, level, ...(hasNS?{selected}:{} ) } };
  })();

  // ===== 学習モード（補助） =====
  const learning = (()=>{
    return {
      fixed:         document.getElementById("fixedLearn")?.value || "",
      negative:      document.getElementById("negLearn")?.value || "",
      useDefaultNeg: !!document.getElementById("useDefaultNeg")?.checked,
      fmtOne:        document.getElementById("fmtLearn")?.value || "",
      fmtBatch:      document.getElementById("fmtLearnBatch")?.value || "",
      countBatch:    Number(document.getElementById("countLearn")?.value || 0) || undefined
    };
  })();

  // ===== 量産モード =====
  const production = (()=>{
    const outfit = {
      top:   getManyIn("p_outfit_top"),
      pants: getManyIn("p_outfit_pants"),
      skirt: getManyIn("p_outfit_skirt"),
      dress: getManyIn("p_outfit_dress"),
      shoes: getManyIn("p_outfit_shoes"),
    };
    const colors = {
      useTop:    !!document.getElementById("p_use_top")?.checked,
      useBottom: !!document.getElementById("p_use_bottom")?.checked,
      useShoes:  !!document.getElementById("p_use_shoes")?.checked,
      topTag:    document.getElementById("tag_p_top")?.textContent || "",
      bottomTag: document.getElementById("tag_p_bottom")?.textContent || "",
      shoesTag:  document.getElementById("tag_p_shoes")?.textContent || "",
    };
    const nsfw = {
      on: !!document.getElementById("nsfwProd")?.checked,
      level: (document.querySelector('input[name="nsfwLevelProd"]:checked')?.value) || "L1",
      selected: {
        exposure:   getManyIn("nsfwP_expo"),
        underwear:  getManyIn("nsfwP_underwear"),
        outfit:     getManyIn("nsfwP_outfit"),
        expression: getManyIn("nsfwP_expr"),
        situation:  getManyIn("nsfwP_situ"),
        lighting:   getManyIn("nsfwP_light"),
        pose:       getManyIn("nsfwP_pose"),
        accessory:  getManyIn("nsfwP_acc"),
        body:       getManyIn("nsfwP_body"),
        nipple:     getManyIn("nsfwP_nipple")
      }
    };
    const fixed  = document.getElementById("fixedProd")?.value || "";
    const neg    = document.getElementById("p_neg")?.value || "";
    const count  = Number(document.getElementById("countProd")?.value || 0) || undefined;
    const seedMd = (document.querySelector('input[name="seedMode"]:checked')?.value) || "fixed";
    const fmt    = document.getElementById("fmtProd")?.value || "a1111";
    const allowBottomSwap = !!document.getElementById("allowBottomSwap")?.checked;

    return {
      outfit, colors, nsfw,
      fixed, negative:neg, count, seedMode:seedMd, fmt,
      allowBottomSwap
    };
  })();

  return {
    /* ========== 基本 ========== */
    charName: document.getElementById("charName")?.value || "",
    loraTag:  document.getElementById("loraTag")?.value  || "",
    fixed:    document.getElementById("fixedManual")?.value || "",
    negative: document.getElementById("negGlobal")?.value   || "",

    /* 形状 */
    hairStyle: getOne("hairStyle"),
    eyeShape:  getOne("eyeShape"),
    face:      getOne("face"),
    skinBody:  getOne("skinBody"),
    artStyle:  getOne("artStyle"),

    /* シーン */
    background:  getMany("bg"),
    pose:        getMany("pose"),
    comp:        getMany("comp"),
    view:        getMany("view"),
    expressions: getMany("expr"),
    lightLearn:  getMany("lightLearn"),

    /* 色（髪/瞳/肌） */
    hairColorTag: document.getElementById("tagH")?.textContent || "",
    eyeColorTag:  document.getElementById("tagE")?.textContent || "",
    skinTone: Number(document.getElementById("skinTone")?.value || 0),

    /* bf_* */
    bf: {
      age:    getOne("bf_age"),
      gender: getOne("bf_gender"),
      body:   getOne("bf_body"),
      height: getOne("bf_height"),
    },

    /* outfit（上下/ワンピ/靴） */
    outfit: {
      mode: outfitSel.mode,
      top: outfitSel.top || "",
      bottom: outfitSel.bottom || "",
      dress: outfitSel.dress || "",
      shoes: outfitSel.shoes || "",
      bottomCat: outfitSel.bottomCat || (window.__bottomCat || "pants")
    },

    /* 服カラー（固定） */
    wearColors,
    wearColorUse,

    /* 学習アクセ */
    learnAccessory:{ 
      tag:   document.getElementById("learn_acc")?.value||"", 
      color: document.getElementById("tag_learnAcc")?.textContent||"" 
    },

    /* 学習 NSFW（チェック群） */
    nsfwLearn:{
      on: !!document.getElementById("nsfwLearn")?.checked,
      level: (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1",
      selected: {
        expression: Array.from(document.querySelectorAll('#nsfwL_expr input:checked')).map(x=>x.value),
        exposure:   Array.from(document.querySelectorAll('#nsfwL_expo input:checked')).map(x=>x.value),
        situation:  Array.from(document.querySelectorAll('#nsfwL_situ input:checked')).map(x=>x.value),
        lighting:   Array.from(document.querySelectorAll('#nsfwL_light input:checked')).map(x=>x.value),
        pose:       Array.from(document.querySelectorAll('#nsfwL_pose input:checked')).map(x=>x.value),
        accessory:  Array.from(document.querySelectorAll('#nsfwL_acc input:checked')).map(x=>x.value),
        outfit:     Array.from(document.querySelectorAll('#nsfwL_outfit input:checked')).map(x=>x.value),
        body:       Array.from(document.querySelectorAll('#nsfwL_body input:checked')).map(x=>x.value),
        nipples:    Array.from(document.querySelectorAll('#nsfwL_nipple input:checked')).map(x=>x.value),
        underwear:  Array.from(document.querySelectorAll('#nsfwL_underwear input:checked')).map(x=>x.value)
      }
    },

    /* 撮影モード（planner） */
    planner,

    /* 学習モード（補助フィールド） */
    learning,

    /* 量産モード */
    production
  };
}

/* ---------- I/Oボタン バインド ---------- */
function bindCharIO(){
  const input = document.getElementById("importChar");
  if (input) {
    input.addEventListener("change", async (e)=>{
      const f = e.target.files[0]; if (!f) return;
      try{
        const json = JSON.parse(await f.text());
        applyCharacterPreset(json);
      }catch{
        toast("キャラ設定の読み込みに失敗（JSONを確認）");
      }finally{
        e.target.value="";
      }
    });
  }

  document.getElementById("btnExportChar")?.addEventListener("click", ()=>{
    const preset = collectCharacterPreset();
    dl("character_preset.json", JSON.stringify(preset, null, 2));
    toast("キャラ設定をローカル（JSON）に保存しました");
  });
}





// --- 便利フィルタ（生成/学習前の最終ガード用） ---
function filterNSFWByWhitelist(category, tags){
  const allow = new Set(NSFW_LEARN_SCOPE[category] || []);
  return (tags || []).filter(t => allow.has(t));
}

// ★追加：レベル許可（L1/L2のみ。L3は学習では常に遮断）
function isLevelAllowedForLearn(cap, lv){
  const ord = { L1:1, L2:2, L3:3 };
  const capN = ord[(cap||'L1')] || 1;
  const lvN  = ord[(lv ||'L1')] || 1;
  // 学習では R-18G(L3) は常に除外
  if (lvN >= ord.L3) return false;
  return lvN <= capN;
}

// 学習タブ：NSFW一覧を描画（ホワイトリスト + レベル上限、L3は遮断）
function renderNSFWLearning(){
  const cap = (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1";

  // 学習では L3 は常に不可にする前提のフィルタ
  function isLevelAllowedForLearn(capLevel, itemLevel){
    const rank = { L1:1, L2:2, L3:3 };
    // L3は遮断（capに関わらず）
    if ((itemLevel||"L1") === "L3") return false;
    return (rank[itemLevel||"L1"]||1) <= (rank[capLevel||"L1"]||1);
  }

  // WL に載っていて、かつレベル許容されたものだけ通す
  const allowWL = (arr, name) => {
    const wl = new Set(NSFW_LEARN_SCOPE[name] || []);
    return normList(arr).filter(it =>
      wl.has(it.tag) && isLevelAllowedForLearn(cap, it.level)
    );
  };

  // チップHTML（学習はチェックボックス）
  const chips = (arr,name)=> arr.map(o => {
    const lvlLabel = (o.level === "L2" ? "R-18" : "R-15"); // L3はここまでに落ちている
    return `<label class="chip">
      <input type="checkbox" name="nsfwL_${name}" value="${o.tag}">
      ${o.label}<span class="mini"> ${lvlLabel}</span>
    </label>`;
  }).join("");

  // ---- 従来4カテゴリ ----
  const M = [
    ["nsfwL_expr",  "expression", "expr"],
    ["nsfwL_expo",  "exposure",   "expo"],
    ["nsfwL_situ",  "situation",  "situ"],
    ["nsfwL_light", "lighting",   "light"],
  ];

  // ---- 追加６カテゴリ ----
  // UI側IDとデータ側キーのマップ（nipples -> nsfwL_nipple）
  M.push(
    ["nsfwL_pose",    "pose",       "pose"],
    ["nsfwL_acc",     "accessory",  "acc"],
    ["nsfwL_outfit",  "outfit",     "outfit"],
    ["nsfwL_body",    "body",       "body"],
    ["nsfwL_nipple",  "nipples",    "nipple"],
    ["nsfwL_underwear","underwear", "underwear"],
  );

  // 一括レンダ
  for (const [elId, nsKey, shortName] of M){
    const host = document.getElementById(elId);
    if (!host) continue;
    const srcArr = allowWL(NSFW[nsKey] || [], nsKey);
    host.innerHTML = chips(srcArr, shortName);
  }
}

/* 取得：学習タブで選んだ NSFW を最終確定（WL + レベル上限） */
function getSelectedNSFW_Learn(){
  if (!$("#nsfwLearn")?.checked) return [];
  const cap = (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1";

  // いったん UI から全部集める（従来4 + 追加6）
  const picked = [
    ...$$('input[name="nsfwL_expr"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_expo"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_situ"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_light"]:checked').map(x=>x.value),

    ...$$('input[name="nsfwL_pose"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_acc"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_outfit"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_body"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_nipple"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_underwear"]:checked').map(x=>x.value),
  ];

  // メタ参照インデックス（全部のカテゴリ）
  const idx = {
    expression: new Map(normList(NSFW.expression).map(o=>[o.tag,o])),
    exposure:   new Map(normList(NSFW.exposure).map(o=>[o.tag,o])),
    situation:  new Map(normList(NSFW.situation).map(o=>[o.tag,o])),
    lighting:   new Map(normList(NSFW.lighting).map(o=>[o.tag,o])),
    pose:       new Map(normList(NSFW.pose).map(o=>[o.tag,o])),
    accessory:  new Map(normList(NSFW.accessory).map(o=>[o.tag,o])),
    outfit:     new Map(normList(NSFW.outfit).map(o=>[o.tag,o])),
    body:       new Map(normList(NSFW.body).map(o=>[o.tag,o])),
    nipples:    new Map(normList(NSFW.nipples).map(o=>[o.tag,o])),
    underwear:  new Map(normList(NSFW.underwear).map(o=>[o.tag,o])),
  };

  // WL収載チェック（全部のカテゴリを見る）
  const inWL = (tag)=>{
    return (
      (NSFW_LEARN_SCOPE.expression||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.exposure  ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.situation ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.lighting  ||[]).includes(tag) ||

      (NSFW_LEARN_SCOPE.pose      ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.accessory ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.outfit    ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.body      ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.nipples   ||[]).includes(tag) ||
      (NSFW_LEARN_SCOPE.underwear ||[]).includes(tag)
    );
  };

  const ok = [];
  for (const t of picked){
    if (!inWL(t)) continue;

    // どのカテゴリに属するかを順に探索
    const meta =
      idx.expression.get(t) || idx.exposure.get(t) || idx.situation.get(t) || idx.lighting.get(t) ||
      idx.pose.get(t)       || idx.accessory.get(t)|| idx.outfit.get(t)    || idx.body.get(t)     ||
      idx.nipples.get(t)    || idx.underwear.get(t);

    if (!meta) continue;
    if (!isLevelAllowedForLearn(cap, meta.level)) continue; // L3遮断含む
    ok.push(t);
  }
  return uniq(ok);
}


/* 量産タブ：NSFW一覧を描画（レベル上限のみ。WLは無し） */
function renderNSFWProduction(){
  const cap = document.querySelector('input[name="nsfwLevelProd"]:checked')?.value || "L1";
  const order = {L1:1,L2:2,L3:3};
  const allow = (lv)=> (order[(lv||"L1")]||1) <= (order[cap]||1);
  const lvl = (x)=>({L1:"R-15",L2:"R-18",L3:"R-18G"}[(x||"L1")] || "R-15");
  const filt = (arr)=> normList(arr).filter(x=> allow(x.level));
  const chips = (o,name)=> `<label class="chip"><input type="checkbox" name="${name}" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`;

  // 従来4カテゴリ
  $("#nsfwP_expr")  && ($("#nsfwP_expr").innerHTML  = filt(NSFW.expression).map(o=>chips(o,"nsfwP_expr")).join(""));
  $("#nsfwP_expo")  && ($("#nsfwP_expo").innerHTML  = filt(NSFW.exposure).map(o=>chips(o,"nsfwP_expo")).join(""));
  $("#nsfwP_situ")  && ($("#nsfwP_situ").innerHTML  = filt(NSFW.situation).map(o=>chips(o,"nsfwP_situ")).join(""));
  $("#nsfwP_light") && ($("#nsfwP_light").innerHTML = filt(NSFW.lighting).map(o=>chips(o,"nsfwP_light")).join(""));

  // 追加6カテゴリ
  $("#nsfwP_pose")     && ($("#nsfwP_pose").innerHTML     = filt(NSFW.pose).map(o=>chips(o,"nsfwP_pose")).join(""));
  $("#nsfwP_acc")      && ($("#nsfwP_acc").innerHTML      = filt(NSFW.accessory).map(o=>chips(o,"nsfwP_acc")).join(""));
  $("#nsfwP_outfit")   && ($("#nsfwP_outfit").innerHTML   = filt(NSFW.outfit).map(o=>chips(o,"nsfwP_outfit")).join(""));
  $("#nsfwP_body")     && ($("#nsfwP_body").innerHTML     = filt(NSFW.body).map(o=>chips(o,"nsfwP_body")).join(""));
  $("#nsfwP_nipple")   && ($("#nsfwP_nipple").innerHTML   = filt(NSFW.nipples).map(o=>chips(o,"nsfwP_nipple")).join(""));
  $("#nsfwP_underwear")&& ($("#nsfwP_underwear").innerHTML= filt(NSFW.underwear).map(o=>chips(o,"nsfwP_underwear")).join(""));
}


/* 18禁トグルのバインド（学習/量産 両方） */
function bindNSFWToggles(){
  $("#nsfwLearn")?.addEventListener("change", e=>{
    $("#nsfwLearnPanel").style.display = e.target.checked ? "" : "none";
    if(e.target.checked) renderNSFWLearning();
  });
  $$('input[name="nsfwLevelLearn"]').forEach(x=> x.addEventListener('change', ()=>{
    if ($("#nsfwLearn")?.checked) renderNSFWLearning();
  }));

  // 量産：レベル変更で再描画
  $$('input[name="nsfwLevelProd"]').forEach(x=> x.addEventListener('change', renderNSFWProduction));

  // 量産：ON にした瞬間に中身も描画
  $("#nsfwProd")?.addEventListener("change", e=>{
    $("#nsfwProdPanel").style.display = e.target.checked ? "" : "none";
    if (e.target.checked) renderNSFWProduction();
  });
}

/* ========= 肌トーン描画 ========= */
function paintSkin(){
    const v   = +($("#skinTone").value||0);
    const hex = toneToHex(v);
    const tag = toneToTag(v);
    $("#swSkin").style.background = hex;
    const label = $("#tagSkin");
    label.textContent = tag;
    // ← 文字色は変えない（過去につけたインライン色があれば消す）
    label.style.color = "";
    // または label.style.removeProperty("color");
  }

/* ========= アクセ色相環 ========= */
let getHairColorTag, getEyeColorTag, getLearnAccColor, getAccAColor, getAccBColor, getAccCColor;
let getOutfitBaseColor;

/* ========= フォーマッタ & CSV ========= */
const FORMATTERS = {
  a1111:{ label:"Web UI（汎用）",
    line:(p,n,seed)=>`Prompt: ${p}\nNegative prompt: ${n}\nSeed: ${seed}`,
    csvHeader:['"no"','"seed"','"prompt"','"negative"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"${seed}"`,`"${p.replace(/"/g,'""')}"`,`"${n.replace(/"/g,'""')}"`].join(",") },
  invoke:{ label:"InvokeAI",
    line:(p,n,seed)=>`invoke --prompt "${p}" --negative_prompt "${n}" --seed ${seed}`,
    csvHeader:['"no"','"command"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"invoke --prompt \\\"${p.replace(/\"/g,'\"\"')}\\\" --negative_prompt \\\"${n.replace(/\"/g,'\"\"')}\\\" --seed ${seed}"`].join(",") },
  comfy:{ label:"ComfyUI（テキスト）",
    line:(p,n,seed)=>`positive="${p}"\nnegative="${n}"\nseed=${seed}`,
    csvHeader:['"no"','"seed"','"positive"','"negative"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"${seed}"`,`"${p.replace(/"/g,'""')}"`,`"${n.replace(/"/g,'""')}"`].join(",") },
  sdnext:{ label:"SD.Next（dream.py）",
    line:(p,n,seed)=>`python dream.py -p "${p}" -n "${n}" -S ${seed}`,
    csvHeader:['"no"','"command"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"python dream.py -p \\\"${p.replace(/\"/g,'\"\"')}\\\" - n \\\"${n.replace(/\"/g,'\"\"')}\\\" -S ${seed}"`].join(",").replace(" - n "," -n ") },
  nai:{ label:"NovelAI",
    line:(p,n,seed)=>`Prompt: ${p}\nUndesired: ${n}\nSeed: ${seed}`,
    csvHeader:['"no"','"seed"','"prompt"','"undesired"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"${seed}"`,`"${p.replace(/"/g,'""')}"`,`"${n.replace(/"/g,'""')}"`].join(",") }
};
const getFmt = (selId, fallback="a1111") => FORMATTERS[$(selId)?.value || fallback] || FORMATTERS[fallback];


// --- 追加：結合版（プロンプト＋ネガ）を作るヘルパ
function buildMergedPrompt(p, n) {
  return `${p}\nNegative prompt: ${n}`;
}


// ===== 共通関数：3分割出力 & コピー =====
// rows: [{ pos[], neg, seed, text }]
function renderTextTriplet(baseId, rows, fmtId) {
  if (!rows || !rows.length) return;
  const r = rows[0]; // 単発前提（バッチでも最初の行を表示する用途）
  const prompt = Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "");
  const neg    = r.neg || "";
  const seed   = r.seed || 0;

  // "全部" のテキスト
  const fmt = (typeof getFmt === 'function') ? getFmt(`#${fmtId||'fmtPlanner'}`) : null;
  const allText = fmt && typeof formatLines === 'function'
    ? formatLines(rows, fmt)
    : `Prompt: ${prompt}\nNegative prompt: ${neg}\nSeed: ${seed}`;

  // 各ボックスへ出力
  const outAll = document.getElementById(`${baseId}All`);
  if (outAll) outAll.textContent = allText;

  const outPrompt = document.getElementById(`${baseId}Prompt`);
  if (outPrompt) outPrompt.textContent = prompt;

  const outNeg = document.getElementById(`${baseId}Neg`);
  if (outNeg) outNeg.textContent = neg;
}

// ===== 3分割コピー：明示バインド（All / Prompt / Neg の小ボタン用）=====
function bindCopyTripletExplicit(pairs){
  // 正しい形: [['btnId','outId'], ...]
  if (!Array.isArray(pairs)) return;
  pairs.forEach(pair => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const [btnId, outId] = pair;
    const btn = document.getElementById(btnId);
    const out = document.getElementById(outId);
    if (!btn || !out) return;

    btn.addEventListener('click', () => {
      const text = (out.textContent || '').trim();
      if (!text) { window.toast && toast('コピーする内容がありません'); return; }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
          .then(()=> window.toast && toast('コピーしました'))
          .catch(()=> fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    });
  });

  function fallbackCopy(t){
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    window.toast && toast('コピーしました');
  }
}

// すべてのモードの 3分割コピー小ボタンを一括バインド
function initCopyTripletAllModes(){
  // 撮影モード
  bindCopyTripletExplicit?.([
    ['btnCopyPlannerAll',    'outPlannerAll'],
    ['btnCopyPlannerPrompt', 'outPlannerPrompt'],
    ['btnCopyPlannerNeg',    'outPlannerNeg'],
  ]);

  // 基本情報タブ：1枚テスト
  bindCopyTripletExplicit?.([
    ['btnCopyLearnTestAll',    'outLearnTestAll'],
    ['btnCopyLearnTestPrompt', 'outLearnTestPrompt'],
    ['btnCopyLearnTestNeg',    'outLearnTestNeg'],
  ]);

  // 学習モード：セット出力
  bindCopyTripletExplicit?.([
    ['btnCopyLearnAll',    'outLearnAll'],
    ['btnCopyLearnPrompt', 'outLearnPrompt'],
    ['btnCopyLearnNeg',    'outLearnNeg'],
  ]);

  // 量産モード
  bindCopyTripletExplicit?.([
    ['btnCopyProdAll',    'outProdAll'],
    ['btnCopyProdPrompt', 'outProdPrompt'],
    ['btnCopyProdNeg',    'outProdNeg'],
  ]);
}

/* ========= CSV 抽出（学習）：新しい4列に対応 ========= */
function csvFromLearn(fmtSelId = "#fmtLearnBatch") {
  const fmt = getFmt(fmtSelId);
  const header = [
    '"no"',
    '"seed"',
    '"prompt"',
    '"negative"',
    '"merged"',
    '"line"'
  ];

  const rows = Array.from($("#tblLearn tbody")?.querySelectorAll("tr") || []).map((tr) => {
    const get = (sel, fallbackIdx) => {
      const byAttr = tr.querySelector(sel)?.textContent || "";
      if (byAttr) return byAttr.trim();
      // 旧レイアウト互換（列位置ベタ取り）——残しておくと移行が安全
      const tds = Array.from(tr.children).map(td => td.textContent || "");
      return (tds[fallbackIdx] || "").trim();
    };

    const no   = get('td[data-col="no"]',       0);
    const seed = get('td[data-col="seed"]',     1);
    const p    = get('td[data-col="prompt"]',   5); // 旧: 6列目（0始まりで5）
    const n    = get('td[data-col="negative"]', 6); // 旧: 7列目（0始まりで6）

    const merged = `${p}\nNegative prompt: ${n}`;
    const line   = fmt.line(p, n, seed);

    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [esc(no), esc(seed), esc(p), esc(n), esc(merged), esc(line)].join(",");
  });

  return [header.join(","), ...rows].join("\n");
}


function csvFromProd(fmtSelId = "#fmtProd") {
  const fmt = getFmt(fmtSelId);
  const header = [
    '"no"',
    '"seed"',
    '"prompt"',
    '"negative"',
    '"merged"',
    '"line"'
  ];

  const rows = Array.from($("#tblProd tbody")?.querySelectorAll("tr") || []).map((tr) => {
    // 量産テーブルは既存実装に合わせて（no=td[0], seed=td[1], prompt=td[2], neg=td[3]）
    const tds = Array.from(tr.children).map(td => td.textContent || "");
    const no   = tds[0] || "";
    const seed = tds[1] || "";
    const p    = tds[2] || "";
    const n    = tds[3] || "";

    const merged = buildMergedPrompt(p, n);
    const line   = fmt.line(p, n, seed);

    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [
      esc(no),
      esc(seed),
      esc(p),
      esc(n),
      esc(merged),
      esc(line)
    ].join(",");
  });

  return [header.join(","), ...rows].join("\n");
}


// 追加：実際に投げるURLを作るヘルパ
function buildGasUrl() {
  const base = (Settings.gasUrl || '').trim();
  const t    = (Settings.gasToken || '').trim(); // ← ここは “クエリ” に付ける
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}

/* ========= クラウド送信 ========= */
async function postCSVtoGAS(kind, csv, meta = {}) {
  const url = buildGasUrl();
  if (!url) { toast("クラウド保存URL（GAS）を設定タブで入力してください"); throw new Error("missing GAS url"); }

  const nameChar = ($("#charName")?.value || "").replace(/[^\w\-]/g, "_") || "noname";
  const body = {
    kind,
    filename: `${kind}_${nameChar}_${nowStamp()}.csv`,
    csv,
    meta: { charName: $("#charName")?.value || "", fmt:(kind==="learning" ? $("#fmtLearnBatch")?.value : $("#fmtProd")?.value)||"", ...meta },
    ts: Date.now()
  };

  // ★ Authorizationヘッダを消す／Content-Typeはtext/plain
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: JSON.stringify(body)
  });

  const txt = await r.text().catch(()=>"(no text)");
  if (!r.ok) throw new Error("bad status: " + r.status + " " + txt);
  toast("クラウド（GAS）へ保存しました（応答: " + txt.slice(0,80) + "…）");
}

function bindGASTools(){
  document.getElementById("btnSaveSettings")?.addEventListener("click", saveSettings);
  document.getElementById("btnResetSettings")?.addEventListener("click", resetSettings);

  $("#btnTestGAS")?.addEventListener("click", async ()=>{
    saveSettings();

    const url = buildGasUrl(); // ← token を ?token= に付与
    const out = $("#gasTestResult");
    if (!url) { if(out) out.textContent = "URL未設定"; return; }

    if(out) out.textContent = "テスト中…";
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 6000);

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" }, // ← text/plain に統一
        body: JSON.stringify({ kind: "ping", ts: Date.now() }),   // ← 本体と同じ形式
        signal: ctrl.signal
      });
      clearTimeout(timer);

      const txt = await r.text().catch(()=>"(no text)");
      if(out) out.textContent = r.ok ? (txt ? `OK: ${txt}` : "OK") : `NG (${r.status})`;
    } catch (e) {
      // CORSで応答が読めない環境でも “送信はできた” 旨だけ表示
      if(out) out.textContent = "送信は完了（no-corsのため応答確認不可）";
    }
  });
}

/* ========= 学習：組み立て ========= */
function getNeg(){
  const extra = (document.getElementById('learn_neg')?.value||"").trim();
  return buildNegative(extra);
}

// 置き換え: assembleFixedLearning
function assembleFixedLearning(){
  const out = [];

  // 0) LoRA / キャラ名
  out.push($("#loraTag").value.trim());
  out.push($("#charName").value.trim());

  // 修正後
  ["age","gender","body","height"]
    .forEach(k => {
      const v = getBFValue(k);
      if (v) out.push(v);
    });

  // 2) 色（髪/瞳/肌）
  out.push(getHairColorTag && getHairColorTag());
  out.push(getEyeColorTag && getEyeColorTag());
  out.push($("#tagSkin").textContent);

  // 3) 形（髪型/目の形/顔/体/画風）
  ["hairStyle","eyeShape","face","skinBody","artStyle"].forEach(n=>{
    const v=document.querySelector(`input[name="${n}"]:checked`)?.value;
    if (v) out.push(v);
  });

  // 4) 服（カテゴリ考慮） 
const sel = getBasicSelectedOutfit();
if (sel.mode === "onepiece") {
  if (sel.dress) {
    const topColor = getWearColorTag("top"); // ← 学習タブの top色
    if (!topColor) {
      // 色指定が無いときだけ素のワンピを入れる
      out.push(sel.dress);
    }
    // top色がある場合は素ワンピは入れない（色付きは step5 で入る）
  }
} else {
  if (sel.top)    out.push(sel.top);
  if (sel.bottom) out.push(sel.bottom);
}

  // 5) 服カラー（top/bottom/dress/shoes は後でペア化）
  out.push(...getLearningWearColorParts(sel)); // ex) "orange top", "sky blue bottom", "gray shoes"

  // 6) 恒常アクセ（色付きで）
  const acc = $("#learn_acc")?.value || "";
  if (acc) out.push(`${getLearnAccColor && getLearnAccColor()} ${acc}`);

  // 7) 手動固定
  const fixedManual = $("#fixedManual").value.split(",").map(s=>s.trim()).filter(Boolean);
  out.push(...fixedManual);

  return uniq(out).filter(Boolean);
}

// 共有: 服色と服名をペア化（順序保持・単独色対応・DOM色優先・DOM色時もプレース除去）
function pairWearColors(parts){
  if (!Array.isArray(parts)) return parts || [];
  const list = parts.filter(Boolean).map(s => String(s));

  const COLORS_RE = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b/i;

  const TOP_RE    = /\b(plain\s+)?(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\s+coat|tank\s+top|camisole|turtleneck|off-shoulder\s+top|crop\s+top|sweatshirt|blazer)\b/i;
  const BOTTOM_RE = /\b(plain\s+)?(skirt|pleated\s+skirt|long\s+skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\s+shorts)\b/i;
  const DRESS_RE  = /\b(plain\s+)?(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape)\b/i;
  const SHOES_RE  = /\b(plain\s+)?(shoes|boots|heels|sandals|sneakers|loafers|mary\s+janes|mary_janes|geta|zori)\b/i;

  const domText = id => (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();
  const domColorTop    = domText("tag_top");
  const domColorBottom = domText("tag_bottom");
  const domColorShoes  = domText("tag_shoes");

  const colorIdxs = [];
  list.forEach((t,i)=>{ if (COLORS_RE.test(t)) colorIdxs.push(i); });

  const idx = {
    top:    list.findIndex(t => TOP_RE.test(t)),
    bottom: list.findIndex(t => BOTTOM_RE.test(t)),
    dress:  list.findIndex(t => DRESS_RE.test(t)),
    shoes:  list.findIndex(t => SHOES_RE.test(t)),
  };

  const usedColor = new Set();

  // プレース "white top/bottom/dress/shoes" を色・名詞で探して usedColor に入れる
  const markPlaceholderUsed = (color, nounKind /*top|bottom|dress|shoes*/) => {
    if (!color) return;
    const re = new RegExp(`\\b${color}\\b\\s+${nounKind}\\b`, 'i');
    const k = list.findIndex((t, i) => !usedColor.has(i) && re.test(String(t)));
    if (k >= 0) usedColor.add(k);
  };

  const takeColor = (preferred /*string|""*/, nounKind /*top|bottom|dress|shoes*/) => {
    if (preferred && COLORS_RE.test(preferred)) {
      const c = preferred.match(COLORS_RE)[1].toLowerCase();
      // DOM色を使った場合でも、対応するプレースがあれば消費扱いにする
      markPlaceholderUsed(c, nounKind);
      return c;
    }
    const k = colorIdxs.find(j => !usedColor.has(j));
    if (k == null) return "";
    usedColor.add(k);
    return (list[k].match(COLORS_RE)[1] || "").toLowerCase();
  };

  const cleanNoun = (s, re) => {
    const m = String(s).match(re);
    return m ? m[2].toLowerCase() : "";
  };

  const combineAt = (nounIndex, re, preferredColor, kind) => {
    if (nounIndex < 0) return;
    const noun = cleanNoun(list[nounIndex], re);
    const color = takeColor(preferredColor, kind);
    list[nounIndex] = color ? `${color} ${noun}` : noun;
  };

  if (idx.dress >= 0) combineAt(idx.dress,  DRESS_RE,  domText("tag_top") /*ワンピはtop色*/, 'dress');
  if (idx.dress < 0) {
    if (idx.top    >= 0) combineAt(idx.top,    TOP_RE,    domColorTop,    'top');
    if (idx.bottom >= 0) combineAt(idx.bottom, BOTTOM_RE, domColorBottom, 'bottom');
  }
  if (idx.shoes >= 0)   combineAt(idx.shoes,  SHOES_RE,  domColorShoes,  'shoes');

  const out = list.filter((_,i) => !usedColor.has(i));
  return Array.from(new Set(out));
}

// === 一式（ワンピ）優先：重複衣服の排除＆色プレースホルダの置換 ===
function enforceOnePieceExclusivity(parts){
  // 文字列配列に正規化
  let P = (parts||[]).filter(Boolean).map(String);

  const RE_TOP    = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer)\b/i;
  const RE_BOTTOM = /\b(skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts)\b/i;
  const RE_SHOES  = /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;
  const RE_ONE    = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|witch\s+outfit|idol\s+costume|stage\s+costume)\b/i;

  const firstDress = P.find(t => RE_ONE.test(t));
  if (!firstDress) return P; // ワンピ無しなら何もしない

  // 1) ワンピは1語に統一（最初の1つだけ残す）
  P = P.filter((t, i) => !RE_ONE.test(t) || (t === firstDress && i === P.indexOf(firstDress)));

  // 2) トップ/ボトムの“実服”を削除（靴は残す）
  P = P.filter(t => !(RE_TOP.test(t) || RE_BOTTOM.test(t)));

  // 3) 「色 top / 色 bottom」などのプレースホルダ処理
  //    - 色 top → 色 + <ワンピ名> に置換
  //    - 色 bottom → 破棄
  const dressNoun = (firstDress.match(RE_ONE)?.[1] || "").toLowerCase();
  const RE_COLOR_TOP    = /^(.+?)\s+top$/i;
  const RE_COLOR_BOTTOM = /^(.+?)\s+bottom$/i;

  P = P.flatMap(t => {
    if (RE_COLOR_TOP.test(t)) {
      const color = t.replace(RE_COLOR_TOP, "$1");
      return [`${color} ${dressNoun}`];
    }
    if (RE_COLOR_BOTTOM.test(t)) {
      return []; // 捨てる
    }
    return [t];
  });

  // 4) 念のため重複除去（順序は維持）
  const seen = new Set(); const out = [];
  for (const t of P) { if (!seen.has(t)) { seen.add(t); out.push(t); } }
  return out;
}



// ===== 排他ガード（表情/構図/視点の同時混入を防ぐ） =====
// === 共通：タグ表記ゆれ吸収（front_view ⇔ front view） ==================
function _canon(t){
  return String(t||"").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
function _has(parts, tag){
  const c = _canon(tag);
  return parts.some(x => _canon(x) === c);
}
// 既存配列のスタイルに合わせて出力（配列内に1個でも _ があれば _ を使う）
function _styleOut(tag, parts){
  const useUnderscore = parts.some(x => /_/.test(String(x)));
  return useUnderscore ? tag.replace(/ /g, "_") : tag;
}
// GROUP のいずれかに当たる要素を除去
function _withoutGroup(parts, GROUP){
  const G = GROUP.map(_canon);
  return parts.filter(x => !G.includes(_canon(x)));
}
// PREFER/GROUPの順で1つだけ残す
function pickOneFromGroup(parts, GROUP, PREFER){
  const keep =
    (PREFER || []).find(t => _has(parts, t)) ||
    (GROUP  || []).find(t => _has(parts, t));
  if (!keep) return parts;
  const rest = _withoutGroup(parts, GROUP);
  return [...rest, _styleOut(keep, parts)];
}

// 表情：必ず1つだけ
function ensureExprExclusive(parts){
  const GROUP = [
    "neutral expression",
    "smiling",
    "smiling open mouth",
    "serious",
    "determined",
    "slight blush",
    "surprised (mild)",
    "pouting (slight)"
  ];
  const PREFER = [
    "neutral expression",
    "smiling",
    "slight blush",
    "surprised (mild)",
    "pouting (slight)",
    "smiling open mouth",
    "serious",
    "determined"
  ];
  return pickOneFromGroup(parts, GROUP, PREFER);
}

// 構図/距離：portrait と full body 等を同時にしない
// かつ wide shot は他の距離タグがあるなら落とす
function ensureCompExclusive(parts){
  const GROUP = ["full body","waist up","upper body","bust","portrait","close-up","wide shot"];

  // 現在のヒットを抽出
  const hits = GROUP.filter(g => parts.includes(g));
  if (hits.length <= 1) return parts;

  // 他の距離タグが1つでもあれば wide shot は除去対象に
  let pool = hits;
  if (hits.some(t => t !== "wide shot")) {
    pool = hits.filter(t => t !== "wide shot");
  }

  // 優先順位（“広い”方を優先、最後に wide shot）
  const PREFER = ["full body","waist up","upper body","bust","portrait","close-up","wide shot"];
  const keep = PREFER.find(t => pool.includes(t)) || pool[0];

  // keep 以外の距離タグを削除
  return parts.filter(t => !(GROUP.includes(t) && t !== keep));
}

// 表情：必ず1つだけ
function ensureExprExclusive(parts){
  const GROUP = [
    "neutral expression",
    "smiling",
    "smiling open mouth",
    "serious",
    "determined",
    "slight blush",
    "surprised (mild)",
    "pouting (slight)"
  ];
  const PREFER = [
    "neutral expression",
    "smiling",
    "slight blush",
    "surprised (mild)",
    "pouting (slight)",
    "smiling open mouth",
    "serious",
    "determined"
  ];
  return pickOneFromGroup(parts, GROUP, PREFER);
}

// 構図/距離：portrait と full body 等を同時にしない
// wide shot は他の距離があれば落とす
function ensureCompExclusive(parts){
  const GROUP = ["full body","waist up","upper body","bust","portrait","close-up","wide shot"];

  // 現在ヒット
  const hits = GROUP.filter(g => _has(parts, g));
  if (hits.length <= 1) return parts;

  // 他があれば wide shot を候補から外す
  let pool = hits;
  if (hits.some(t => _canon(t) !== _canon("wide shot"))) {
    pool = hits.filter(t => _canon(t) !== _canon("wide shot"));
  }

  // 優先順位（“広い”方を優先、最後に wide shot）
  const PREFER = ["full body","waist up","upper body","bust","portrait","close-up","wide shot"];
  const keep = PREFER.find(t => pool.some(h => _canon(h)===_canon(t))) || pool[0];

  // keep 以外を除去して、keep を現在のスタイルで戻す
  let out = _withoutGroup(parts, GROUP);
  out.push(_styleOut(keep, parts));
  return out;
}

// 視点：front / three-quarters / profile / side / back は1つに
function ensureViewExclusive(parts){
  const GROUP = ["front view","three-quarters view","profile view","side view","back view"];
  const PREFER = ["three-quarters view","front view","profile view","back view","side view"];
  return pickOneFromGroup(parts, GROUP, PREFER);
}

// まとめ（排他系はここで一括適用）
function fixExclusives(parts){
  let p = (Array.isArray(parts) ? parts : []).filter(Boolean);

  if (typeof ensureExprExclusive === 'function')  p = ensureExprExclusive(p);
  if (typeof ensureCompExclusive === 'function')  p = ensureCompExclusive(p);
  if (typeof ensureViewExclusive === 'function')  p = ensureViewExclusive(p);

  // 背景：1つ（関数側で plain 優先等やってるならそのまま）
  if (typeof enforceSingleBackground === 'function') p = enforceSingleBackground(p);

  // ライティング：SFW/NSFW統合を1回
  if (typeof unifyLightingOnce === 'function') p = unifyLightingOnce(p);

  // 仕上げの重複除去（正規化で比較→既存順維持で1本化）
  const seen = new Set();
  const out = [];
  for (const t of p){
    const c = _canon(t);
    if (!seen.has(c)){ seen.add(c); out.push(t); }
  }
  return out;
}



// === 学習用：割合ベース挿入ユーティリティ =======================
// rows: buildBatchLearning() の出力配列
// groupTags: 同カテゴリのタグ一覧
// targetTag: 混ぜたいタグ
// pctMin, pctMax: 挿入割合 (0.1=10%)
function applyPercentForTag(rows, groupTags, targetTag, pctMin, pctMax){
  if (!Array.isArray(rows) || !rows.length) return;

  const n = rows.length;
  const ratio = pctMin + Math.random() * (pctMax - pctMin);
  const k = Math.max(1, Math.min(n, Math.round(n * ratio)));

  const idxs = Array.from({length:n}, (_,i)=>i).sort(()=>Math.random()-0.5).slice(0,k);
  for (const i of idxs){
    const row = rows[i];
    let pos = Array.isArray(row.pos) ? row.pos.slice() : [];
    // 同カテゴリを一掃して target を入れる
    pos = pos.filter(t => !groupTags.includes(String(t)));
    pos.push(targetTag);

    if (typeof ensurePromptOrder === 'function') pos = ensurePromptOrder(pos);
    if (typeof enforceHeadOrder === 'function')  pos = enforceHeadOrder(pos);

    row.pos  = pos;
    row.text = `${pos.join(", ")} --neg ${row.neg} seed:${row.seed}`;
  }
}
window.applyPercentForTag = applyPercentForTag; // どこからでも呼べるように

// グループ内に何も入らなかった行へフォールバックを補完
function fillRemainder(rows, groupTags, fallbackTag){
  if (!Array.isArray(rows) || !rows.length) return;
  for (const r of rows){
    const pos = Array.isArray(r.pos) ? r.pos : [];
    const hasAny = pos.some(t => groupTags.includes(String(t)));
    if (!hasAny){
      const out = pos.filter(t => !groupTags.includes(String(t)));
      out.push(fallbackTag);
      let arranged = (typeof ensurePromptOrder==='function') ? ensurePromptOrder(out) : out;
      if (typeof enforceHeadOrder==='function') arranged = enforceHeadOrder(arranged);
      r.pos  = arranged;
      r.text = `${arranged.join(", ")} --neg ${r.neg} seed:${r.seed}`;
    }
  }
}
window.fillRemainder = fillRemainder;



// 追加：タグ配列をホワイトリストで絞る共通関数
function filterByScope(items, allow) {
  if (!Array.isArray(items)) return [];
  if (!Array.isArray(allow) || allow.length === 0) return items;
  const s = new Set(allow);
  return items.filter(x => s.has(x.tag));
}



// === NSFWヘッダ統一関数（置き換え版）========================
// 使い方: 配列を渡すだけ。現在のモードのNSFWチェック状態を見て、
// - ON なら "NSFW" を先頭に追加（すでにあれば先頭へ並べ替え）
// - OFFなら "NSFW" を取り除く
// どのモードかはチェックボックスのIDを総当りで検出します。
function ensureNSFWHead(arr){
  const out = Array.isArray(arr) ? arr.slice() : [];

  // いろんなIDを許容（存在するものだけ見ます）
  const ids = [
    // 撮影モード
    'pl_nsfw',
    // 学習モード（プロジェクトに合わせて複数候補）
    'nsfwLearn','nsfwL','nsfw_learning',
    // 量産モード
    'nsfwProd'
  ];

  // 現在ONのチェックボックスがあるか
  let nsfwOn = false;
  for (const id of ids){
    const el = document.getElementById(id);
    if (el && el.checked) { nsfwOn = true; break; }
  }

  // まず既存の "NSFW" を全部除去
  for (let i = out.length - 1; i >= 0; i--) {
    if (String(out[i]) === "NSFW") out.splice(i, 1);
  }

  // ONなら先頭に付与、OFFなら付けない（＝消えたまま）
  if (nsfwOn) out.unshift("NSFW");

  return out;
}




// ===== 強力な重複除去（_ と空白・大文字小文字を無視して同一判定）=====
function _normKey(t){
  const s = (typeof normalizeTag==='function') ? normalizeTag(String(t||"")) : String(t||"").trim();
  return s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}
function dedupeStable(arr){
  const seen = new Set(), out = [];
  for (const t of (arr||[])){
    const k = _normKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push((typeof normalizeTag==='function') ? normalizeTag(String(t)) : String(t));
  }
  return out;
}



/*
// 1枚テスト（学習タブのカード）への出力
document.getElementById('btnOneLearn')?.addEventListener('click', () => {
  const { pos, neg } = buildOneLearning(1);
  const all = `${pos.join(", ")}${neg ? `\n\nNegative prompt: ${neg}` : ""}`;
  const $ = (id)=>document.getElementById(id);
  $('#outLearnTestAll').textContent    = all;
  $('#outLearnTestPrompt').textContent = pos.join(", ");
  $('#outLearnTestNeg').textContent    = neg || "";
}); */


// 背景など“グループ内は1つだけ”にする共通ユーティリティ
function enforceSingleFromGroup(p, group, fallback){
  if (!Array.isArray(p) || !Array.isArray(group) || group.length===0) return p || [];
  const set = new Set(group);
  const normed = (p || []).map(normalizeTag); // ここで正規化も通す

  // 今入っているグループ該当タグを抽出
  const hit = [];
  for (const t of normed){
    if (set.has(t)) hit.push(t);
  }
  if (hit.length <= 1) return normed;

  // 優先順位＝groupの並び。最初に見つかったものを残す
  const winner = group.find(g => hit.includes(g)) || hit[0];

  // いったんグループ全削除 → 勝者だけ戻す
  const filtered = normed.filter(t => !set.has(t));
  filtered.push(winner);
  return filtered;
}

// === scroller 選択値取得（chip.on）===
// 複数必要なら getChipTexts、1つだけなら getChipOne
function getChipTexts(id){
  const box = document.getElementById(id);
  if (!box) return [];
  return Array.from(box.querySelectorAll('.chip.on'))
    .map(e => (e.textContent || '').trim())
    .filter(Boolean);
}
function getChipOne(id){
  const a = getChipTexts(id);
  return a[0] || "";
}



/* ====================== 共通ユーティリティ ====================== */

// --- 安全ヘルパ ---
const norm = (t)=> (typeof normalizeTag==='function') ? normalizeTag(String(t||"")) : String(t||"").trim();
const textOf = (id)=> (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();
const checked = (id)=> !!document.getElementById(id)?.checked;

// ▼テキスト→英語タグ化（data-en 優先）の共通ヘルパ
function _labelToTag(el){
  if (!el) return "";
  const en = (el.dataset && (el.dataset.en || el.getAttribute?.("data-en"))) || "";
  const raw = en || el.value || el.textContent || "";
  // 既存の toTag / norm があれば尊重
  if (typeof toTag === "function") return toTag(raw);
  if (typeof norm  === "function") return norm(String(raw).trim());
  return String(raw).trim().toLowerCase();
}

// ===== normalize 全停止（互換ノープ）=====
/** 既存コードが呼んでも何もしない（trimのみ） */
window.normalizeTag = function(t){
  return String(t ?? "").trim();
};

// 旧 normalize 用のアンカーや同義語辞書は完全撤去
// （three-quarter/three quarters 等の吸収は一切しない）


// 任意の文字列→英語タグ（日本語→辞書化してるならここで対応。無ければ normalize だけ）
function toTag(txt){
  return normalizeTag(txt);
}

// 要素から“英語タグ”を安全に取り出す総合関数
function _toEnTagFromEl(el){
  if(!el) return "";

  // 1) data-en があれば最優先
  const den = el.getAttribute?.('data-en');
  if (den) return normalizeTag(den);

  // 2) ボタン/入力の value
  const val = (el.value || el.getAttribute?.('value') || "");
  if (val && /[A-Za-z]/.test(val)) return normalizeTag(val);

  // 3) 単語モードカード: <small class="wm-en">english</small>
  const enSmall = el.querySelector?.('.wm-en')?.textContent;
  if (enSmall) return normalizeTag(enSmall);

  // 4) <code class="tag">english</code> を拾う
  const codeTag = el.querySelector?.('code.tag, code')?.textContent;
  if (codeTag) return normalizeTag(codeTag);

  // 5) ラベル連結: <input ...><label data-en="...">..</label>
  if (el.tagName === 'INPUT'){
    const lab = el.nextElementSibling;
    if (lab){
      const labDen = lab.getAttribute?.('data-en');
      if (labDen) return normalizeTag(labDen);
      const labSmall = lab.querySelector?.('.wm-en')?.textContent;
      if (labSmall) return normalizeTag(labSmall);
      const labCode  = lab.querySelector?.('code.tag, code')?.textContent;
      if (labCode) return normalizeTag(labCode);
      const labTxt = lab.textContent?.trim();
      if (labTxt) return toTag(labTxt);
    }
  }

  // 6) テキスト最後の砦
  const txt = el.textContent || "";
  return toTag(txt);
}

// scroller から “複数” 選択を取得（英語タグの配列で返す）
function pickManyFromScroller(rootId){
  const root = document.getElementById(rootId);
  if (!root) return [];
  const nodes = root.querySelectorAll(
    '[role="option"][aria-selected="true"],' +
    '[aria-checked="true"],[aria-pressed="true"],' +
    '[data-selected="true"],' +
    '.selected,.active,.sel,.option.selected,.item.selected,' +
    'input[type=checkbox]:checked,input[type=radio]:checked'
  );
  const out = [];
  nodes.forEach(n=>{
    if (n.tagName==='INPUT'){
      const lab = n.nextElementSibling;
      out.push(_labelToTag(lab) || norm(n.value));
    } else {
      out.push(_labelToTag(n));
    }
  });
  return Array.from(new Set(out.filter(Boolean)));
}

// === 基本情報タブの服（名詞）を拾う ===
function getOutfitNouns(){
  const out = [];
  // 上下/ワンピースのモード判定
  const isOnepiece = document.querySelector('input[name="outfitMode"]:checked')?.value === "onepiece";

  if (isOnepiece) {
    const dress = pickOneFromScroller("outfit_dress");
    if (dress) out.push(dress);
  } else {
    const top = pickOneFromScroller("outfit_top");
    const pants = pickOneFromScroller("outfit_pants");
    const skirt = pickOneFromScroller("outfit_skirt");
    if (top) out.push(top);
    if (pants) out.push(pants);
    if (skirt) out.push(skirt);
  }

  // 靴は共通
  const shoes = pickOneFromScroller("outfit_shoes");
  if (shoes) out.push(shoes);

  return out.filter(Boolean);
}
window._getOutfitNouns = getOutfitNouns; // 後方互換

// 服“色”プレースを配列へ注入（名詞がある時だけ／ワンピ時は下色無効、上色は dress に紐づけ）
function injectWearColorPlaceholders(arr, sel){
  const norm = t => (typeof normalizeTag==='function') ? normalizeTag(String(t||"")) : String(t||"").trim();
  const textOf = id => (document.getElementById(id)?.textContent || document.getElementById(id)?.value || "").trim();

  const useTop    = !!document.getElementById("use_top")?.checked;
  const useBottom = !!document.getElementById("useBottomColor")?.checked;
  const useShoes  = !!document.getElementById("use_shoes")?.checked;

  const pushColor = (ok, tagId, noun)=>{
    if (!ok) return;
    const t = textOf(tagId);
    if (!t || t === "—") return;
    arr.push(norm(`${t} ${noun}`));
  };

  if (sel?.isDress){
    // ワンピース：dress がある時だけ、top色→dress に付ける
    if (sel.dress) pushColor(useTop, 'tag_top', 'dress');
  } else {
    // セパレート：該当名詞がある時だけ色を押し込む
    if (sel?.top)    pushColor(useTop,    'tag_top',    'top');
    if (sel?.bottom) pushColor(useBottom, 'tag_bottom', 'bottom');
  }
  if (sel?.shoes) pushColor(useShoes, 'tag_shoes', 'shoes');
}



// 単独色トークンの掃除（"white" だけ等）
function dropBareColors(arr){
  const COLOR_WORD_RE=/\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b/i;
  return (arr||[]).filter(t=>!(COLOR_WORD_RE.test(t)&&!/\s/.test(t)));
}

// 既定ネガの取得（アプリ側実装があればそれを使う）
function getCommonDefaultNeg(){
  if (typeof getDefaultNeg === 'function') return getDefaultNeg();
  if (typeof pmGetNeg === 'function')      return pmGetNeg();        // 互換
  return (window.DEFAULT_NEG || "");
}











/* ============================================================================
 * 学習モード一括生成（全面置き換え版）
 * - pm系は使わない（DOM直参照）
 * - 服の名詞は outfit_* の「選択中」だけ採取（未選択は入れない）
 * - 色タグは tag_top/tag_bottom/tag_shoes（チェックONのみ）→ "white top" 等のプレースにしてから pair
 * - pairWearColors() を ③.5 開始直後と ④ 最終整形で必ず実行
 * - 露出注入時も、pair で合成済みの服トークンは OUTFIT_FIXED として保護
 * - getFixedLearn() はあなたの現行実装をそのまま利用
 * ========================================================================== */

/* ===========================================================
 * 共通ユーティリティ：色×服ペアリング / 背景正規化
 * =========================================================== */

/* 色語の正規化（小文字＆別名吸収） */
const COLOR_ALIASES = new Map(Object.entries({
  "grey":"gray", "silver":"silver", "gold":"gold",
  "navy blue":"navy", "sky blue":"azure",
  "light blue":"azure"
}));
function normColorWord(w){
  let s = String(w||"").trim().toLowerCase();
  s = COLOR_ALIASES.get(s) || s;
  return s;
}

/* 服カテゴリの代表名詞（JSON由来の語彙と被りにくい素直な既定値） */
const WEAR_DEFAULT = {
  top:    "t-shirt",
  bottom: "shorts",
  dress:  "dress",
  shoes:  "shoes"
};

/* 服名詞の正規化（t shirt/t-shirt/T-Shirt → t-shirt 等） */
function normWearNoun(s){
  s = String(s||"").trim().toLowerCase();
  // よくあるバリエーションを吸収
  s = s.replace(/\bt\s*shirt\b/i, "t-shirt")
       .replace(/\btee\b/i, "t-shirt")
       .replace(/\btrouser(s)?\b/i, "pants");
  return s;
}

/* 背景シノニムの一本化（solid_background ↔ plain_background） */
function normalizeBackgroundTags(arr){
  const out = [];
  let hasPlain = false, hasSolid = false;
  for (const t0 of arr){
    const t = String(t0||"");
    if (/^solid[_\s]?background$/i.test(t)) { hasSolid = true; continue; }
    if (/^plain[_\s]?background$/i.test(t)){ hasPlain = true; continue; }
    out.push(t0);
  }
  // どちらか一方だけに統一（plain_backgroundに寄せる）
  if (hasPlain || hasSolid) out.push("plain_background");
  return out;
}

/* 汎用：配列のタグを完全小文字化＆両端スペース削除（normalizeTagがあればそちら優先） */
function _norm(t){
  const s = String(t ?? "").trim();
  return (typeof normalizeTag === 'function') ? normalizeTag(s) : s.toLowerCase();
}

/* === ここが肝：色×服ペアリング ===
 * 入力配列のうち、
 *   - 「white top / azure bottom / black shoes / ...」などプレースに
 *   - 実在の服名詞（t-shirt / shorts / dress / shoes 等）を結合
 * 結合後は単独色の残滓や generic名詞(top/bottom そのもの)を除去する
 * 服名詞が見つからない場合は WEAR_DEFAULT を使って結合する
 */
/* function pairWearColors(parts){
  let P = (parts||[]).filter(Boolean).map(_norm);
  const S = new Set(P);

  // プレース（色 + generic）
  const PLACE_RE = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b\s+(top|bottom|dress|shoes)\b/i;

  // まず実在の服名詞（top/bottom/dress/shoesに該当しそうな名詞）を拾う
  // ※ S.outfit がある環境ではそちらも利用
  const wearNouns = new Set();
  for (const t of P){
    const raw = t;
    const n = normWearNoun(raw);
    // 明確に generic のみは除外
    if (/^(top|bottom|dress|shoes)$/.test(n)) continue;
    // 靴
    if (/\b(shoes|boots|heels|sandals|sneakers|loafers|mary\s+janes|geta|zori)\b/i.test(n)){
      wearNouns.add(n);
      continue;
    }
    // 上下・ワンピ風
    if (/\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|tank\s*top|camisole|turtleneck|off-shoulder\s+top|crop\s+top|sweatshirt|blazer)\b/i.test(n)
    ||  /\b(skirt|shorts|pants|jeans|trousers|leggings|overalls|bermuda\s+shorts|pleated\s+skirt|long\s+skirt|hakama)\b/i.test(n)
    ||  /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress|uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape)\b/i.test(n)) {
      wearNouns.add(n);
    }
  }

  // generic→カテゴリー候補の探索
  function pickNounFor(generic){
    // 既に居る名詞群から generic に合うものを1つ選ぶ
    const reTop    = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|tank\s*top|camisole|turtleneck|off-shoulder\s+top|crop\s+top|sweatshirt|blazer)\b/i;
    const reBottom = /\b(skirt|shorts|pants|jeans|trousers|leggings|overalls|bermuda\s+shorts|pleated\s+skirt|long\s+skirt|hakama)\b/i;
    const reDress  = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress|uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape)\b/i;
    const reShoes  = /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\s+janes|geta|zori)\b/i;

    const pool = Array.from(wearNouns);
    if (generic === "top")    return pool.find(x => reTop.test(x))    || WEAR_DEFAULT.top;
    if (generic === "bottom") return pool.find(x => reBottom.test(x)) || WEAR_DEFAULT.bottom;
    if (generic === "dress")  return pool.find(x => reDress.test(x))  || WEAR_DEFAULT.dress;
    if (generic === "shoes")  return pool.find(x => reShoes.test(x))  || WEAR_DEFAULT.shoes;
    return WEAR_DEFAULT[generic] || generic;
  }

  // プレースを走査して結合品を作る
  const additions = [];
  const toDelete  = new Set();
  for (let i=0;i<P.length;i++){
    const x = P[i];
    const m = x.match(PLACE_RE);
    if (!m) continue;
    const colorRaw = m[1];
    const generic  = m[2].toLowerCase();
    const color = normColorWord(colorRaw);

    const noun = pickNounFor(generic); // nounは既存から拾う or 既定
    const paired = `${color} ${noun}`;
    additions.push(paired);
    toDelete.add(x); // プレースは削除
    // noun が単独であるならそれも消して良い（色付きへ集約）
    toDelete.add(noun);
  }

  // プレースを掃除して結合品を反映
  P = P.filter(t => !toDelete.has(t));
  P.push(...additions);

  // 単独色（"white" 単体など）を掃除
  const SOLO_COLOR = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b/i;
  P = P.filter(t => !(SOLO_COLOR.test(t) && !/\s/.test(t)));

  // 背景の二重化をこの場で一本化（solid/ plain）
  P = normalizeBackgroundTags(P);

  // 一意化
  return Array.from(new Set(P));
} */

// =====================================================
// 共通：ラベル → 英語タグ抽出＆正規化 / scroller選択取得
// =====================================================

// scroller から “1件だけ” 選択を取得（英語タグ優先・堅牢版）
function pickOneFromScroller(rootId){
  const root = typeof rootId === "string" ? document.getElementById(rootId) : rootId;
  if (!root) return "";

  // chip系 → 単語カード → ARIA/data → stateクラス → 入力系 の優先順で1つ
  const q =
    root.querySelector('.chip.on') ||
    root.querySelector('.wm-item.is-selected') ||
    root.querySelector('[aria-selected="true"]') ||
    root.querySelector('[data-selected="true"]') ||
    root.querySelector('.selected, .active, .sel, .option.selected, .item.selected') ||
    root.querySelector('input[type="radio"]:checked') ||
    root.querySelector('input[type="checkbox"]:checked');

  if (!q) return "";

  if (q.tagName === 'INPUT') {
    const lab = q.nextElementSibling;
    return _toEnTagFromEl(lab) || _toEnTagFromEl(q) || "";
  }
  return _toEnTagFromEl(q) || "";
}

// ===== NSFW選択時に SFW服/色プレース/靴を掃除 =====
function stripSfwWearWhenNSFW(parts, lockedSet = new Set()){
  const CLOTH_NOUN_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\s*coat|tank\s*top|camisole|turtleneck|off-shoulder\s*top|crop\s*top|sweatshirt|blazer|skirt|pleated\s*skirt|long\s*skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\s*shorts|dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|swimsuit|bikini|leotard)\b/i;
  const SHOES_RE      = /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\s*jan(es)?|geta|zori)\b/i;
  const COLOR_PLACE_RE= /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b\s+\b(top|bottom|dress|shoes)\b/i;

  return (parts||[]).filter(s=>{
    const t = String(s||"");
    if (lockedSet.has(toTag(t))) return true; // ロック指定があれば残す
    if (COLOR_PLACE_RE.test(t)) return false; // 例: "white top"
    if (CLOTH_NOUN_RE.test(t))  return false; // 服名詞（SFW）
    if (SHOES_RE.test(t))       return false; // 靴
    return true;
  });
}




/* ============================================================
 * 服の名詞をDOMから抽出（outfit_*）
 * - ワンピースモードONなら dress のみ
 * - ワンピースOFFなら top + (pants/skirt のどちらか)
 * - 靴は任意
 * - normalizeTag で正規化
 * ============================================================ */
/* function getOutfitNouns(){
  const nouns = [];
  const isDressMode = !!document.getElementById('outfitModeDress')?.checked;
  const useSkirt    = !!document.getElementById('bottomCat_skirt')?.checked;

  // scrollerの選択中テキストを取る小ヘルパ
  const pick = (id)=>{
    const root = document.getElementById(id);
    if (!root) return "";
    const q = root.querySelector(
      '.selected, .active, .sel, [aria-selected="true"], [data-selected="true"], '+
      'input[type=radio]:checked + label, .option.selected, .item.selected'
    );
    return q?.textContent?.trim() || "";
  };

  if (isDressMode){
    const dress = pick('outfit_dress');
    if (dress) nouns.push(dress);
  } else {
    const top = pick('outfit_top');
    if (top) nouns.push(top);

    if (useSkirt){
      const skirt = pick('outfit_skirt');
      if (skirt) nouns.push(skirt);
    } else {
      const pants = pick('outfit_pants');
      if (pants) nouns.push(pants);
    }
  }

  const shoes = pick('outfit_shoes');
  if (shoes) nouns.push(shoes);

  // 正規化 & 重複除去
  const out = nouns.map(s=> (typeof normalizeTag==='function') ? normalizeTag(s) : s)
                   .filter(Boolean);
  return Array.from(new Set(out));
}

// 互換用（過去に _getOutfitNouns を呼んでいる箇所も拾えるように）
window._getOutfitNouns = getOutfitNouns; */







/* ============================================================================
 * 置き換え: ensurePromptOrder（構図/view を独立で1つずつ保持 + 正規化 + 安全化）
 * ========================================================================== */
function ensurePromptOrder(parts) {
  const norm = (t)=> (typeof normalizeTag==='function' ? normalizeTag(String(t||"")) : String(t||"").trim().toLowerCase());
  const P = (Array.isArray(parts) ? parts : []).filter(Boolean).map(norm);

  const asSet = (arr) => new Set(
    (Array.isArray(arr) ? arr : [])
      .map(x => (typeof x==='string' ? x : (x && x.tag ? String(x.tag) : "")))
      .filter(Boolean)
      .map(norm)
  );

  const S = {
    // 基本属性
    age:        asSet(window.SFW?.age),
    gender:     asSet(window.SFW?.gender),
    body_basic: asSet(window.SFW?.body_type),
    height:     asSet(window.SFW?.height),
    person:     asSet(window.SFW?.personality),
    world:      asSet(window.SFW?.worldview),
    tone:       asSet(window.SFW?.speech_tone),

    // 形
    hair_style: asSet(window.SFW?.hair_style),
    eyes_shape: asSet(window.SFW?.eyes),
    face:       asSet(window.SFW?.face),
    skin_body:  asSet(window.SFW?.skin_body),
    art_style:  asSet(window.SFW?.art_style),

    // 服・アクセ
    outfit:     asSet(window.SFW?.outfit),
    acc:        asSet(window.SFW?.accessories),

    // シーン（SFW）
    background:  asSet(window.SFW?.background),
    pose:        asSet(window.SFW?.pose),
    composition: asSet(window.SFW?.composition),
    view:        asSet(window.SFW?.view),
    expr:        asSet(window.SFW?.expressions),
    light:       asSet(window.SFW?.lighting),

    // NSFW（従来）
    nsfw_expr:  asSet(window.NSFW?.expression),
    nsfw_expo:  asSet(window.NSFW?.exposure),
    nsfw_situ:  asSet(window.NSFW?.situation),
    nsfw_light: asSet(window.NSFW?.lighting),

    // NSFW（追加）
    nsfw_pose:     asSet(window.NSFW?.pose),
    nsfw_acc:      asSet(window.NSFW?.accessory),
    nsfw_outfit:   asSet(window.NSFW?.outfit),
    nsfw_body:     asSet(window.NSFW?.body),
    nsfw_nipples:  asSet(window.NSFW?.nipples),
    nsfw_under:    asSet(window.NSFW?.underwear),
  };

  const isHairColor = (t)=> /\bhair$/.test(t) && !S.hair_style.has(t);
  const isEyeColor  = (t)=> /\beyes$/.test(t) && !S.eyes_shape.has(t);
  const isSkinTone  = (t)=> /\bskin$/.test(t) && !S.skin_body.has(t);

  const buckets = {
    lora:[], name:[],

    // 人となり
    b_age:[], b_gender:[], b_body:[], b_height:[], b_person:[], b_world:[], b_tone:[],

    // 色
    c_hair:[], c_eye:[], c_skin:[],

    // 形
    s_hair:[], s_eye:[], s_face:[], s_body:[], s_art:[],

    // 服・アクセ
    wear:[], acc:[],

    // シーン
    bg:[], comp:[], pose:[], view:[], expr:[], light:[],

    // NSFW（従来）
    n_expr:[], n_expo:[], n_situ:[], n_light:[],

    // NSFW（追加6）
    n_pose:[], n_acc:[], n_outfit:[], n_body:[], n_nipples:[], n_under:[],

    other:[]
  };

  const charName = (document.getElementById('charName')?.value || "").trim();
  const WEAR_NAME_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer|skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts|dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;

  // 一意化（元順序はこの関数で付け直すのでOK）
  const set = new Set(P);

  for (const t of set) {
    if (!t) continue;

    if (t.startsWith("<lora:") || /\b(?:lora|<lyco:)/i.test(t)) { buckets.lora.push(t); continue; }
    if (charName && t === norm(charName)) { buckets.name.push(t); continue; }

    // 人となり
    if (S.age.has(t))        { buckets.b_age.push(t); continue; }
    if (S.gender.has(t))     { buckets.b_gender.push(t); continue; }
    if (S.body_basic.has(t)) { buckets.b_body.push(t); continue; }
    if (S.height.has(t))     { buckets.b_height.push(t); continue; }
    if (S.person.has(t))     { buckets.b_person.push(t); continue; }
    if (S.world.has(t))      { buckets.b_world.push(t); continue; }
    if (S.tone.has(t))       { buckets.b_tone.push(t); continue; }

    // 色
    if (isHairColor(t)) { buckets.c_hair.push(t); continue; }
    if (isEyeColor(t))  { buckets.c_eye.push(t);  continue; }
    if (isSkinTone(t))  { buckets.c_skin.push(t); continue; }

    // 形
    if (S.hair_style.has(t)) { buckets.s_hair.push(t); continue; }
    if (S.eyes_shape.has(t)) { buckets.s_eye.push(t);  continue; }
    if (S.face.has(t))       { buckets.s_face.push(t); continue; }
    if (S.skin_body.has(t))  { buckets.s_body.push(t); continue; }
    if (S.art_style.has(t))  { buckets.s_art.push(t);  continue; }

    // 服・アクセ
    if (S.outfit.has(t) || WEAR_NAME_RE.test(t)) { buckets.wear.push(t); continue; }
    if (S.acc.has(t)) { buckets.acc.push(t); continue; }

    // シーン（SFW）
    if (S.background.has(t))  { buckets.bg.push(t);   continue; }
    if (S.composition.has(t)) { buckets.comp.push(t); continue; }
    if (S.pose.has(t))        { buckets.pose.push(t); continue; }
    if (S.view.has(t))        { buckets.view.push(t); continue; }
    if (S.expr.has(t))        { buckets.expr.push(t); continue; }
    if (S.light.has(t))       { buckets.light.push(t);continue; }

    // NSFW（従来）
    if (S.nsfw_expr.has(t))   { buckets.n_expr.push(t);  continue; }
    if (S.nsfw_expo.has(t))   { buckets.n_expo.push(t);  continue; }
    if (S.nsfw_situ.has(t))   { buckets.n_situ.push(t);  continue; }
    if (S.nsfw_light.has(t))  { buckets.n_light.push(t); continue; }

    // NSFW（追加）
    if (S.nsfw_pose.has(t))     { buckets.n_pose.push(t);     continue; }
    if (S.nsfw_acc.has(t))      { buckets.n_acc.push(t);      continue; }
    if (S.nsfw_outfit.has(t))   { buckets.n_outfit.push(t);   continue; }
    if (S.nsfw_body.has(t))     { buckets.n_body.push(t);     continue; }
    if (S.nsfw_nipples.has(t))  { buckets.n_nipples.push(t);  continue; }
    if (S.nsfw_under.has(t))    { buckets.n_under.push(t);    continue; }

    buckets.other.push(t);
  }

  // --- グローバル正規化 ---
  // 1) 表情：SFW/NSFW 横断で 1つだけ
  {
    const all = [...buckets.expr, ...buckets.n_expr];
    if (all.length > 0) {
      const prefer = ["smiling","neutral expression","slight blush","surprised (mild)","pouting (slight)"];
      const keep = prefer.find(x => all.includes(x)) || all[0];
      buckets.expr = [keep];
      buckets.n_expr = [];
    }
  }

  // 2) 構図：1つだけ（view とは独立）
  if (buckets.comp.length > 1) {
    const ORDER = ["full body","wide shot","waist up","upper body","bust","portrait","close-up"];
    const keep = ORDER.find(x => buckets.comp.includes(x)) || buckets.comp[0];
    buckets.comp = [keep];
  }
  // 3) 視点：1つだけ（composition とは独立）
  if (buckets.view.length > 1) {
    const ORDER = ["three-quarters view","front view","profile view","side view","back view"];
    const keep = ORDER.find(x => buckets.view.includes(x)) || buckets.view[0];
    buckets.view = [keep];
  }

  // 最終並び（学習向けの順）
  const orderedOut = [
    ...buckets.lora, ...buckets.name,
    // 人となり
    ...buckets.b_age, ...buckets.b_gender, ...buckets.b_body, ...buckets.b_height,
    ...buckets.b_person, ...buckets.b_world, ...buckets.b_tone,
    // 色
    ...buckets.c_hair, ...buckets.c_eye, ...buckets.c_skin,
    // 形
    ...buckets.s_hair, ...buckets.s_eye, ...buckets.s_face, ...buckets.s_body, ...buckets.s_art,
    // 服・アクセ
    ...buckets.wear, ...buckets.acc,
    // シーン
    ...buckets.bg, ...buckets.comp, ...buckets.pose, ...buckets.view, ...buckets.expr, ...buckets.light,
    // NSFW（従来）
    ...buckets.n_expo, ...buckets.n_situ, ...buckets.n_light,
    // NSFW（追加）
    ...buckets.n_pose, ...buckets.n_acc, ...buckets.n_outfit, ...buckets.n_body, ...buckets.n_nipples, ...buckets.n_under,
    // その他
    ...buckets.other
  ].filter(Boolean);

  // 一意化して返す（順序はこの配列の並びを維持）
  return Array.from(new Set(orderedOut));
}

/* === ヌード優先ルール（全裸 / 上半身裸 / 下半身裸） === */
function applyNudePriority(parts){
  let filtered = [...parts];
  const has = (re)=> filtered.some(t => re.test(String(t)));
  const hasNude       = has(/\b(nude|naked|no clothes|全裸|完全に裸)\b/i);
  const hasTopless    = has(/\b(topless|上半身裸)\b/i);
  const hasBottomless = has(/\b(bottomless|下半身裸)\b/i);
  const RE_TOP      = /\b(top|shirt|t[-\s]?shirt|blouse|sweater|hoodie|jacket|coat|cardigan|tank top|camisole|bra|bikini top)\b/i;
  const RE_BOTTOM   = /\b(bottom|skirt|shorts|pants|jeans|trousers|leggings|bikini bottom|panties|underwear|briefs)\b/i;
  const RE_ONEPIECE = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|cape)\b/i;
  const RE_SHOES    = /\b(shoes|boots|heels|sandals|sneakers)\b/i;
  const removeWhere = (re)=> { filtered = filtered.filter(t => !re.test(String(t))); };
  if (hasNude) {
    removeWhere(RE_TOP);
    removeWhere(RE_BOTTOM);
    removeWhere(RE_ONEPIECE);
    removeWhere(RE_SHOES);
  } else {
    if (hasTopless) removeWhere(RE_TOP);
    if (hasBottomless) {
      removeWhere(RE_BOTTOM);
      removeWhere(RE_ONEPIECE);
    }
  }
  return filtered;
}

/* ========= 量産：アクセ3スロット & 組み立て ========= */
function readAccessorySlots(){
  const A = $("#p_accA")?.value || "", Ac = getAccAColor && getAccAColor();
  const B = $("#p_accB")?.value || "", Bc = getAccBColor && getAccBColor();
  const C = $("#p_accC")?.value || "", Cc = getAccCColor && getAccCColor();
  const pack = (noun,color)=> noun ? (color ? `${color} ${noun}` : noun) : "";
  return [pack(A,Ac), pack(B,Bc), pack(C,Cc)].filter(Boolean);
}

/* ① 量産用：カテゴリ別 outfit を読む */
function readProductionOutfits(){
  return {
    top:   getMany("p_outfit_top"),
    pants: getMany("p_outfit_pants"),
    skirt: getMany("p_outfit_skirt"),
    dress: getMany("p_outfit_dress"),
    shoes: getMany("p_outfit_shoes"),
  };
}

// 服色タグ取得（量産パネル用）
function getProdWearColorTag(idBase){
  // idBase: "top" | "bottom" | "shoes"
  const use = document.getElementById("p_use_"+idBase);
  if (use && !use.checked) return "";
  const t = document.getElementById("tag_p_"+idBase);
  const txt = (t?.textContent || "").trim();
  return (txt && txt !== "—") ? txt : "";
}







/* ========= レンダラ（学習テーブル：no/seed/prompt/negative のみ） ========= */
function renderLearnTableTo(tbodySel, rows){
  const tb = document.querySelector(tbodySel);
  if (!tb) return;

  const frag = document.createDocumentFragment();
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    // r.pos は配列想定（buildOneLearning の戻りを想定）。フォールバックも用意。
    const prompt = Array.isArray(r.pos) ? r.pos.join(", ")
                 : (typeof r.prompt === "string" ? r.prompt : "");
    const neg = r.neg || "";

    tr.innerHTML = `
      <td data-col="no">${i + 1}</td>
      <td data-col="seed">${r.seed}</td>
      <td data-col="prompt">${prompt}</td>
      <td data-col="negative">${neg}</td>
    `;
    frag.appendChild(tr);
  });

  tb.innerHTML = "";
  tb.appendChild(frag);
}


function formatLines(rows, fmt){
  return rows.map((r,i)=>{
    const p = (r.pos || []).join(", ");
    const line = fmt.line(p, r.neg, r.seed);
    return `[${String(i+1).padStart(2,"0")}] ${line}`;
  }).join("\n\n");
}
function renderLearnTextTo(outSel, rows, selId="fmtLearnBatch"){
  const fmt = getFmt(`#${selId}`);
  const box = document.querySelector(outSel);
  if (box) box.textContent = formatLines(rows, fmt);
}
function renderProdTable(rows){
  const tb=$("#tblProd tbody"); if (!tb) return;
  const frag = document.createDocumentFragment();
  rows.forEach((r,i)=>{ const tr = document.createElement("tr"); tr.innerHTML = `<td>${i+1}</td><td>${r.seed}</td><td>${r.prompt}</td><td>${r.neg}</td>`; frag.appendChild(tr); });
  tb.innerHTML = ""; tb.appendChild(frag);
}

/* function renderProdText(rows){
  const fmt = getFmt("#fmtProd");
  const lines = rows.map((r,i)=> {
    const p = r.prompt; const n = r.neg; const line = fmt.line(p, n, r.seed);
    return `[${String(i+1).padStart(2,"0")}] ${line}`;
  }).join("\n\n");
  $("#outProd").textContent = lines;
} */

function renderProdText(rows){
  // 3分割出力（ボックスが無い場合は従来 #outProd にまとめて出力）
  renderTextTriplet("outProd", rows);
}

// 撮影モード：1枚テキスト出力（1枚テストと同じ経路）
function renderPlannerTextTo(outSel, rows, selId="fmtPlanner"){
  const fmt = getFmt(`#${selId}`, "a1111");
  const box = document.querySelector(outSel);
  if (box) box.textContent = formatLines(rows, fmt); // ← textContentなので%20化しない
}


/* ========= アクセ選択肢 ========= */
function fillAccessorySlots(){
  const accs = normList(SFW.accessories || []);
  const options = `<option value="">（未選択）</option>` + accs.map(a=>`<option value="${a.tag}">${a.label || a.tag}</option>`).join("");
  ["p_accA","p_accB","p_accC","learn_acc"].forEach(id=>{
    const sel = document.getElementById(id); if (sel) sel.innerHTML = options;
  });
}

/* ========= デフォルト辞書ロード ========= */
async function loadDefaultDicts(){
  const tryFetch = async (path)=>{
    try{
      const r = await fetch(path, {cache:"no-store"});
      if(!r.ok) throw new Error("bad status");
      return await r.json();
    }catch(_){ return null; }
  };
  const sfw = await tryFetch("dict/default_sfw.json");
  if(sfw){ mergeIntoSFW(sfw); renderSFW(); fillAccessorySlots(); toast("SFW辞書を読み込みました"); }
  const nsfw = await tryFetch("dict/default_nsfw.json");
  if(nsfw){ mergeIntoNSFW(nsfw); renderNSFWProduction(); renderNSFWLearning(); toast("NSFW辞書を読み込みました"); }
}

/* ========= ボタン等のイベント ========= */
function bindLearnTest(){
  let __lastOneLearn = null;

  /*
   $("#btnOneLearn")?.addEventListener("click", ()=>{
    const one = buildOneLearning();
    if(one.error){ toast(one.error); return; }
    __lastOneLearn = one;
    renderLearnTableTo("#tblLearnTest tbody", [one]);
    renderLearnTextTo("#outLearnTest", [one], "fmtLearn");
  });

  $("#btnCopyLearnTest")?.addEventListener("click", ()=>{
    const text = __lastOneLearn ? (__lastOneLearn.pos||[]).join(", ")
      : ($("#tblLearnTest tbody tr td:nth-child(6)")?.textContent||"");
    if(!text){ toast("コピー対象がありません"); return; }
    navigator.clipboard?.writeText(text).then(()=> toast("プロンプトのみコピーしました"))
      .catch(()=>{
        const r=document.createRange(); const d=document.createElement("div"); d.textContent=text; document.body.appendChild(d);
        r.selectNodeContents(d); const s=getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand("copy"); s.removeAllRanges(); d.remove(); toast("プロンプトのみコピーしました");
      });
  });
  */
}

// ← これで置き換え
function bindLearnBatch(){
  // セット生成
  document.getElementById("btnBatchLearn")?.addEventListener("click", ()=>{
    const cnt  = parseInt(document.getElementById("countLearn")?.value, 10) || 24;
    const rows = buildBatchLearning(cnt);
    if (rows?.error){ toast(rows.error); return; }

    renderLearnTableTo("#tblLearn tbody", rows);
    // 3分割出力（renderTextTriplet が無ければ内部フォールバック）
    if (typeof renderTextTriplet === "function"){
      renderTextTriplet("outLearn", rows, "fmtLearnBatch");
    }
  });

  // 「全コピー」大ボタン（All をコピー）
  document.getElementById("btnCopyLearn")?.addEventListener("click", ()=>{
    const t = (document.getElementById("outLearnAll")?.textContent || "").trim();
    if (!t){ toast("学習テキストが空です"); return; }
    if (navigator.clipboard?.writeText){
      navigator.clipboard.writeText(t).then(()=> toast("学習セットをコピーしました"))
        .catch(()=> fallbackCopy(t));
    } else {
      fallbackCopy(t);
    }
  });

  // 小ボタン（All / Prompt / Neg）
  if (typeof bindCopyTripletExplicit === "function"){
    bindCopyTripletExplicit([
      ["btnCopyLearnAll",    "outLearnAll"],
      ["btnCopyLearnPrompt", "outLearnPrompt"],
      ["btnCopyLearnNeg",    "outLearnNeg"]
    ]);
  }

  // CSV保存
  document.getElementById("btnCsvLearn")?.addEventListener("click", ()=>{
    const csv = csvFromLearn("#fmtLearnBatch");
    if (!csv || csv.split("\n").length <= 1){ toast("学習テーブルが空です"); return; }
    const char = (document.getElementById("charName")?.value || "noname").replace(/[^\w\-]/g,"_");
    dl(`learning_${char}_${nowStamp()}.csv`, csv);
    toast("学習セットをローカル（CSV）に保存しました");
  });

  // クラウド保存
  document.getElementById("btnCloudLearn")?.addEventListener("click", async ()=>{
    const csv = csvFromLearn("#fmtLearnBatch");
    if (!csv || csv.split("\n").length <= 1){ toast("学習テーブルが空です"); return; }
    await postCSVtoGAS("learning", csv);
  });

  function fallbackCopy(text){
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
    toast?.("学習セットをコピーしました");
  }
}


function bindProduction(){
  // 生成
  document.getElementById("btnGenProd")?.addEventListener("click", ()=>{
    const cnt = parseInt(document.getElementById("countProd").value,10) || 50;
    const rows = buildBatchProduction(cnt);               // ← あなたの完全置換版を使用
    // テーブル
    if (typeof renderProdTableTo === 'function') {
      renderProdTableTo("#tblProd tbody", rows);
    } else if (typeof renderProdTable === 'function') {
      // 旧名が残っている場合の保険
      renderProdTable(rows);
    }
    // ★ 3分割テキスト（All/Prompt/Neg）を出力
    renderTextTriplet('outProd', rows, 'fmtProd');
  });

  // 「全コピー」＝All をコピー
  document.getElementById("btnCopyProd")?.addEventListener("click", ()=>{
    const t = (document.getElementById("outProdAll")?.textContent||"").trim();
    if (!t) { toast("量産テキストが空です"); return; }
    navigator.clipboard.writeText(t).then(()=> toast("量産セットをコピーしました"));
  });

  // CSV
  document.getElementById("btnCsvProd")?.addEventListener("click", ()=>{
    const csv = csvFromProd("#fmtProd");
    if(!csv || csv.split("\n").length<=1){ toast("量産テーブルが空です"); return; }
    const char=(document.getElementById("charName")?.value||"noname").replace(/[^\w\-]/g,"_");
    dl(`production_${char}_${nowStamp()}.csv`, csv);
    toast("量産セットをローカル（CSV）に保存しました");
  });

  // クラウド
  document.getElementById("btnCloudProd")?.addEventListener("click", async ()=>{
    const csv = csvFromProd("#fmtProd");
    if(!csv || csv.split("\n").length<=1){ toast("量産テーブルが空です"); return; }
    await postCSVtoGAS("production", csv);
  });

  // ★ 3分割コピー小ボタンの個別バインド（旧 bindCopyTriplet は使わない）
  bindCopyTripletExplicit([
    ['btnCopyProdAll',    'outProdAll'],
    ['btnCopyProdPrompt', 'outProdPrompt'],
    ['btnCopyProdNeg',    'outProdNeg']
  ]);
}

bindCopyTripletExplicit(document.getElementById('panelProduction') || document, 'outProd');

// ===========================================================
// 追加パッチ：NSFW拡張（pose/acc/outfit/body/nipples/underwear）＋ 単語SFWアクセ
// 依存：このHTML内のID（pl_*/nsfwL_*/nsfwP_* / wm-*）のみ
// 辞書：window.SFW / window.NSFW（無ければ簡易フォールバックJSONは無し）
// 既存getMany等に触らず、チェックボックスUIを自前で構築
// ===========================================================
(function(){
  let initialized = false;
  document.addEventListener('DOMContentLoaded', initOnce);

  async function initOnce(){
    if (initialized) return; initialized = true;
    const dict = getDictView();

    // ---- 撮影モード（NSFW） ----
    mountChecklist('#pl_nsfw_pose',       dict.nsfw.pose);
    mountChecklist('#pl_nsfw_acc',        dict.nsfw.accessory);
    mountChecklist('#pl_nsfw_outfit',     dict.nsfw.outfit);
    mountChecklist('#pl_nsfw_body',       dict.nsfw.body);
    mountChecklist('#pl_nsfw_nipple',     dict.nsfw.nipples);    // ← 複数キーに統一
    mountChecklist('#pl_nsfw_underwear',  dict.nsfw.underwear);  // ← 下着

    // ---- 学習モード（NSFW） ----
    mountChecklist('#nsfwL_pose',         dict.nsfw.pose);
    mountChecklist('#nsfwL_acc',          dict.nsfw.accessory);
    mountChecklist('#nsfwL_outfit',       dict.nsfw.outfit);
    mountChecklist('#nsfwL_body',         dict.nsfw.body);
    mountChecklist('#nsfwL_nipple',       dict.nsfw.nipples);    // ← 複数キーに統一
    mountChecklist('#nsfwL_underwear',    dict.nsfw.underwear);  // ← 下着（IDがあれば）

    // ---- 量産モード（NSFW） ----
    mountChecklist('#nsfwP_pose',         dict.nsfw.pose);
    mountChecklist('#nsfwP_acc',          dict.nsfw.accessory);
    mountChecklist('#nsfwP_outfit',       dict.nsfw.outfit);
    mountChecklist('#nsfwP_body',         dict.nsfw.body);
    mountChecklist('#nsfwP_nipple',       dict.nsfw.nipples);    // ← 複数キーに統一
    mountChecklist('#nsfwP_underwear',    dict.nsfw.underwear);  // ← 下着（IDがあれば）

    // ---- 単語モード：SFWアクセ / NSFW（必要分だけ）----
    mountWordItems('#wm-items-accessories', '#wm-count-accessories', dict.sfw.accessories);

    // NSFW（単語モード）に nipples / underwear も流し込み（コンテナがあれば）
    mountWordItems('#wm-items-nipple-nsfw',    '#wm-count-nipple-nsfw',    dict.nsfw.nipples);
    mountWordItems('#wm-items-underwear-nsfw', '#wm-count-underwear-nsfw', dict.nsfw.underwear);
    // ※ 既に expression/exposure/situation/lighting/pose/outfit/body を別処理で入れているなら不要
    //   未実装なら同じ mountWordItems(...) を呼んで追加してください。
  }

  // ====== dict 正規化 ======
  function getDictView(){
    const sfwRoot  = sniffGlobalDict(['SFW','sfw','DICT_SFW','dictSfw','app.dict.sfw','APP_DICT.SFW']) || {};
    const nsfwRoot = sniffGlobalDict(['NSFW','nsfw','DICT_NSFW','dictNsfw','app.dict.nsfw','APP_DICT.NSFW']) || {};

    const sfwTop  = sfwRoot.sfw  || sfwRoot.SFW  || sfwRoot;
    const nsfwTop = nsfwRoot.NSFW || nsfwRoot.nsfw || nsfwRoot;

    const sfw = {
      accessories: normalize(pick(sfwTop, 'accessories','accessory','acc','items','props'))
    };

    // NSFW は別名も吸収して配列[{tag,label,level}]化
    const nsfw = {
      pose:       normalizeNSFW(nsfwTop, 'pose','poses','ポーズ'),
      accessory:  normalizeNSFW(nsfwTop, 'accessory','accessories','acc','アクセ','アクセサリー'),
      outfit:     normalizeNSFW(nsfwTop, 'outfit','outfits','costume','clothes','衣装'),
      body:       normalizeNSFW(nsfwTop, 'body','anatomy','feature','features','body_features','身体','体型'),
      nipples:    normalizeNSFW(nsfwTop, 'nipples','nipple','乳首','乳首系'),       // ← 複数キー
      underwear:  normalizeNSFW(nsfwTop, 'underwear','lingerie','下着','インナー') // ← 下着
    };
    return {sfw, nsfw};
  }

  function sniffGlobalDict(cands){
    for (const k of cands){
      const v = getByPath(window, k);
      if (v && typeof v === 'object') return v;
    }
    return null;
  }
  function getByPath(root, path){
    const segs = path.split('.');
    let cur = root;
    for (const s of segs){ if (!cur) return null; cur = cur[s]; }
    return cur;
  }
  function pick(obj, ...names){
    for (const n of names){ if (obj && Array.isArray(obj[n])) return obj[n]; }
    return [];
  }
  function normalizeNSFW(nsroot, ...keys){
    if (!nsroot) return [];
    // categories.* 優先、無ければ直下キー
    for (const k of keys){
      const fromCat = nsroot.categories && Array.isArray(nsroot.categories[k]) ? nsroot.categories[k] : null;
      if (fromCat) return normalize(fromCat, true);
      if (Array.isArray(nsroot[k])) return normalize(nsroot[k], true);
    }
    return [];
  }
  function normalize(arr, withLevel=false){
    return (Array.isArray(arr) ? arr : []).map(x => ({
      ja: firstNonNull(x.ja, x.jp, x.label, x.name, ""),
      en: firstNonNull(x.en, x.tag, x.value, ""),
      level: x.level || ""
    })).filter(o => o.ja && o.en);
  }
  function firstNonNull(...v){ return v.find(x => x != null); }

  // ====== 汎用チェックリスト描画 ======
  function mountChecklist(sel, items){
    const host = document.querySelector(sel);
    if (!host || !Array.isArray(items)) return;
    host.innerHTML = '';
    items.forEach(it => {
      const wrap = document.createElement('label');
      wrap.className = 'chip';
      wrap.title = it.ja;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = it.en;
      cb.dataset.ja = it.ja;
      if (it.level) cb.dataset.level = it.level; // ← レベル上限フィルタ用

      const span = document.createElement('span');
      span.textContent = it.ja;

      const small = document.createElement('small');
      small.className = 'en';
      small.textContent = it.en;

      wrap.appendChild(cb);
      wrap.appendChild(span);
      wrap.appendChild(small);
      host.appendChild(wrap);
    });
  }

  // ====== 単語モード描画 ======
  function mountWordItems(itemsSel, countSel, items){
    const host = document.querySelector(itemsSel);
    const cnt  = document.querySelector(countSel);
    const tpl  = document.getElementById('wm-item-tpl');
    if (!host || !tpl) return;
    host.innerHTML = '';
    items.forEach(o=>{
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.en  = o.en;
      node.dataset.jp  = o.ja;
      node.dataset.cat = 'nsfw'; // 任意。必要なら具体カテゴリ名でもOK
      if (o.level) node.dataset.level = o.level;

      node.querySelector('.wm-jp').textContent = o.ja;
      node.querySelector('.wm-en').textContent = o.en;

      node.addEventListener('click', (ev)=>{
        if (ev.target.closest('.wm-actions')) return;
        host.dispatchEvent(new CustomEvent('wm:addRow', {
          detail:{jp:o.ja, en:o.en, cat:'nsfw'}, bubbles:true
        }));
      });
      node.querySelector('.wm-copy-en')?.addEventListener('click', e=>{
        e.stopPropagation(); copyToClipboard(o.en);
      });
      node.querySelector('.wm-copy-both')?.addEventListener('click', e=>{
        e.stopPropagation(); copyToClipboard(`${o.ja} (${o.en})`);
      });

      host.appendChild(node);
    });
    if (cnt) cnt.textContent = String(items.length || 0);
  }

  async function copyToClipboard(text){
    try { await navigator.clipboard.writeText(text); }
    catch(_){
      const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
  }
})();









/* ===== ここから追記：総合初期化 ===== */
function initHairEyeAndAccWheels(){
  // --- 髪/瞳（スクエア付きHSLピッカー） ---
  // 既定色はお好みで
  /* getHairColorTag = initWheelWithSquare(
    "#wheelH", "#thumbH", "#swH", "#tagH", "hair",
    35, 75, 50
  );
  getEyeColorTag = initWheelWithSquare(
    "#wheelE", "#thumbE", "#swE", "#tagE", "eyes",
    210, 60, 50
  ); */
   
 // ✅ S/Lスライダー版に戻す
  getHairColorTag = initWheel(
    "#wheelH", "#thumbH", "#satH", "#litH", "#swH", "#tagH", "hair"
  );
  getEyeColorTag = initWheel(
    "#wheelE", "#thumbE", "#satE", "#litE", "#swE", "#tagE", "eyes"
  );


  // --- 学習アクセ & 量産アクセ A/B/C ---
  getLearnAccColor = initColorWheel("learnAcc", 0,   75, 50);
  getAccAColor     = initColorWheel("accA",     0,   80, 50);
  getAccBColor     = initColorWheel("accB",   200,   80, 50);
  getAccCColor     = initColorWheel("accC",   120,   80, 50);

  // --- ベース服色（任意。使うUIがあるなら） ---
  getOutfitBaseColor = initColorWheel("outfitBase", 35, 80, 50);

  // --- 服色ON/OFFの連動 ---
  bindWearToggles();
}
function initSkinTone(){
  const s = document.getElementById('skinTone');
  if (s) {
    s.addEventListener('input', paintSkin);
    paintSkin(); // 初回反映
  }
}

function initNSFWStatusBadge(){
  const badge = document.getElementById('nsfwState');
  if (!badge) return;
  const update = () => {
    const on = document.getElementById('nsfwLearn')?.checked || document.getElementById('nsfwProd')?.checked;
    badge.textContent = on ? 'ON' : 'OFF';
  };
  document.getElementById('nsfwLearn')?.addEventListener('change', update);
  document.getElementById('nsfwProd')?.addEventListener('change', update);
  update();
}



function initAll(){
  if (window.__LPM_INITED) return;
  window.__LPM_INITED = true;

  loadSettings();
  initTabs();
  bindDictIO();
  bindCharIO();
  bindNSFWToggles();
  bindLearnTest();
  bindLearnBatch();
  bindGASTools();
  initTagDictionaries();

  loadDefaultDicts().then(()=>{
    // 1) UI描画
   // initAll() の loadDefaultDicts().then(()=>{ ... }) ブロック内
   renderSFW();
   window.__SFW_RENDERED = true;
   
   // ★ここを追加：辞書スナップショットを固定
   window.__OUTFIT_SRC = Array.isArray(window.SFW?.outfit) ? window.SFW.outfit.slice() : [];
   console.log('[BOOT] outfit snapshot length =', window.__OUTFIT_SRC.length);
   
   // カラエンジン起動（ログが size>0 になるはず）
   window.initWearColorEngine?.();

     
    // 2) 服まわり補助
    bindBottomCategoryGuess();
    bindBottomCategoryRadios();
    fillAccessorySlots();

    // 3) NSFWや各種ピッカー
    renderNSFWLearning();
    renderNSFWProduction();
    initHairEyeAndAccWheels();

    // 4) カラーホイール（固定＆量産）— 戻り値を "window" に公開！
    window.getTopColor    = initColorWheel("top",     35, 80, 55);
    window.getBottomColor = initColorWheel("bottom", 210, 70, 50);
    window.getShoesColor  = initColorWheel("shoes",    0,  0, 30);

    window.getPTopColor    = initColorWheel("p_top",     35, 80, 55);
    window.getPBottomColor = initColorWheel("p_bottom", 210, 70, 50);
    window.getPShoesColor  = initColorWheel("p_shoes",    0,  0, 30);

    // PCへ同期
    function syncWearColors(){
      window.PC = window.PC || {};
      const useTop    = document.getElementById("use_top")?.checked;
      const useBottom = document.getElementById("useBottomColor")?.checked;
      const useShoes  = document.getElementById("use_shoes")?.checked;
      window.PC.top    = useTop    ? (window.getTopColor?.()    || "") : "";
      window.PC.bottom = useBottom ? (window.getBottomColor?.() || "") : "";
      window.PC.shoes  = useShoes  ? (window.getShoesColor?.()  || "") : "";
      // デバッグ（必要なら）
      // console.log('[PC]', window.PC);
    }

    // 初期同期
    syncWearColors();

    // トグル変更で同期
    ["use_top","useBottomColor","use_shoes"].forEach(id=>{
      document.getElementById(id)?.addEventListener("change", syncWearColors);
    });

    // 色名ラベルの変化でも同期（ホイール操作反映）
    function observeTag(id){
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(syncWearColors).observe(el, {
        childList:true, characterData:true, subtree:true
      });
    }
    observeTag("tag_top");
    observeTag("tag_bottom");
    observeTag("tag_shoes");

    initSkinTone();
    initNSFWStatusBadge();
    initCopyTripletAllModes();

    // 5) 量産タブのイベント
    bindProduction();
  });
}

document.addEventListener('DOMContentLoaded', initAll);



function bindOneTestUI(){
  // クリック
  $("#btnOneLearn")?.addEventListener("click", runOneTest);
  $("#btnCopyLearnTest")?.addEventListener("click", copyOneTestText);

  // フォーマット変更時に再整形
  $("#fmtLearn")?.addEventListener("change", ()=>{
    if (__lastOneTestRows.length) renderLearnTextTo("#outLearnTest", __lastOneTestRows, "fmtLearn");
  });

  // 入力監視：基本情報一式が更新されたら判定を更新
  const watchSelectors = [
    "#charName", "#tagH", "#tagE", "#tagSkin",
    'input[name="hairStyle"]','input[name="eyeShape"]','input[name="face"]','input[name="skinBody"]','input[name="artStyle"]',
    'input[name="outfitMode"]','input[name="outfit_top"]','input[name="outfit_pants"]','input[name="outfit_skirt"]','input[name="outfit_dress"]',
    'input[name="bg"]','input[name="pose"]','input[name="expr"]',
    "#use_top","#useBottomColor","#use_shoes",
    "#sat_top","#lit_top","#sat_bottom","#lit_bottom","#sat_shoes","#lit_shoes",
  ];

  // 変化を広めに捕捉（input/change/DOM変化）
  watchSelectors.forEach(sel=>{
    $$(sel).forEach(el=>{
      el.addEventListener("change", updateOneTestReady);
      el.addEventListener("input",  updateOneTestReady);
    });
  });

  // 初回判定
  updateOneTestReady();
}

// 既存の初期化の最後にこれを呼ぶ
document.addEventListener("DOMContentLoaded", ()=>{
  // ...既存の init / bind 系...
  bindOneTestUI();
});
