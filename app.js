/* =========================
   AI Prompt Maker – app.js
   （分割版 / 軽量化込み）
   ========================= */

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

// 先頭を solo と 1girl/1boy に固定しつつ、他の人数/群衆系トークンを全除去
function enforceHeadOrder(parts){
  const solo = 'solo';
  const want = (typeof getGenderCountTag === 'function' ? (getGenderCountTag() || '') : '');

  // 「人数・群衆」系はここで全部落とす（後から混入した 1boy も消える）
  const COUNT_RE = /\b(?:1girl|1boy|[23]\s*girls?|[23]\s*boys?|two people|three people|duo|trio|multiple people|group|crowd|background people|bystanders|another person)\b/i;

  // いったん solo と want を除外し、人数系は全部弾く
  let rest = (parts || []).filter(t =>
    t &&
    t.toLowerCase() !== solo &&
    t.toLowerCase() !== want.toLowerCase() &&
    !COUNT_RE.test(String(t))
  );

  // 先頭に solo と want（空なら入れない）を置く
  const head = [solo];
  if (want) head.push(want);

  // 重複防止
  return [...new Set([...head, ...rest])].filter(Boolean);
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
function buildNegative(baseText="") {
  const custom = baseText
    ? baseText.split(",").map(s=>s.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...NEG_TIGHT, ...custom])).join(", ");
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


// 文字列→配列共通
function splitTags(v){
  return String(v||"").split(",").map(s=>s.trim()).filter(Boolean);
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

/* ===== 学習モード ===== */
/* ===== 学習モード：固定タグ + 基本情報を統合（pm系不使用） ===== */
function getFixedLearn(){
  // 既存の固定入力（固定欄 / 旧ID互換）
  const fromFixed =
    (document.getElementById("fixedLearn")?.value ??
     document.getElementById("fixedManual")?.value ??
     "");

  // 汎用: value があれば value、無ければ textContent を拾う
  const readVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return "";
    const v = (el.value !== undefined) ? el.value : el.textContent;
    return (typeof v === "string") ? v.trim() : "";
  };

  // 基本情報（学習UIの bf_*）
  const basics = [
    readVal('bf_age'),
    readVal('bf_gender'),
    readVal('bf_body'),
    readVal('bf_height')
  ].filter(Boolean).join(", ");

  // 髪/瞳/肌（ID_* があればそっち、無ければ tagH/tagE/tagSkin）
  const colors = [
    readVal('ID_HAIR')  || readVal('tagH'),
    readVal('ID_EYE')   || readVal('tagE'),
    readVal('ID_SKIN')  || readVal('tagSkin')
  ].filter(Boolean).join(", ");

  // 分割→重複除去（splitTags は既存ユーティリティ）
  const merged = [fromFixed, basics, colors].filter(Boolean).join(", ");
  return Array.from(new Set(splitTags(merged)));
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
// 学習テーブル用：カテゴリ別に仕分けして必要分だけ残す（置き換え）
function trimByBucketForLearning(parts){
  const ordered = ensurePromptOrder(parts);

  // ← comp を追加、列順もこの通りでテーブルに出ます
  const buckets = {
    lora:[], name:[],
    b_age:[], b_gender:[], b_body:[], b_height:[], b_person:[], b_world:[], b_tone:[],
    c_hair:[], c_eye:[], c_skin:[],
    s_hair:[], s_eye:[], s_face:[], s_body:[], s_art:[],
    wear:[], acc:[],
    bg:[], comp:[], pose:[], view:[], expr:[], light:[],
    // NSFW（従来）
    n_expr:[], n_expo:[], n_situ:[], n_light:[],
    // NSFW（追加カテゴリ）
    n_pose:[], n_acc:[], n_outfit:[], n_body:[], n_nipples:[],
    // ★ 追加：下着（NSFW）
    n_underwear:[],
    other:[]
  };

  // ensurePromptOrder の分類に合わせた簡易セット
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
    comp:       new Set((SFW.composition||[]).map(x=>x.tag||x)), // 構図
    pose:       new Set((SFW.pose||[]).map(x=>x.tag||x)),        // ポーズ
    view:       new Set((SFW.view||[]).map(x=>x.tag||x)),        // 視点
    expr:       new Set((SFW.expressions||[]).map(x=>x.tag||x)),
    light:      new Set((SFW.lighting||[]).map(x=>x.tag||x)),

    // NSFW 従来
    nsfw_expr:  new Set((NSFW.expression||[]).map(x=>x.tag||x)),
    nsfw_expo:  new Set((NSFW.exposure||[]).map(x=>x.tag||x)),
    nsfw_situ:  new Set((NSFW.situation||[]).map(x=>x.tag||x)),
    nsfw_light: new Set((NSFW.lighting||[]).map(x=>x.tag||x)),

    // NSFW 追加
    nsfw_pose:     new Set((NSFW.pose||[]).map(x=>x.tag||x)),
    // ★ アクセサリ：plural/singular 両対応
    nsfw_acc:     new Set((NSFW.accessories || NSFW.accessory || []).map(x=>x.tag||x)),
    // ★ 乳首：plural/singular 両対応
    nsfw_nipples: new Set((NSFW.nipple || NSFW.nipples || []).map(x=>x.tag||x)),
    nsfw_outfit:   new Set((NSFW.outfit||[]).map(x=>x.tag||x)),
    nsfw_body:     new Set((NSFW.body||[]).map(x=>x.tag||x)),
    // ★ 追加：下着
    nsfw_underwear:new Set((NSFW.underwear||[]).map(x=>x.tag||x)),
  };

  const isHairColor = (t)=> /\bhair$/.test(t) && !S.hair_style.has(t);
  const isEyeColor  = (t)=> /\beyes$/.test(t) && !S.eyes_shape.has(t);
  const isSkinTone  = (t)=> /\bskin$/.test(t) && !S.skin_body.has(t);
  const WEAR_NAME_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer|skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts|dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;

  for (const t0 of ordered) {
    const t = String(t0||"").trim();
    if (!t || LEARN_EXCLUDE_RE.test(t)) continue;

    if (t.startsWith("<lora:") || /\b(?:LoRA|<lyco:)/i.test(t)) { buckets.lora.push(t); continue; }
    if (($("#charName")?.value||"").trim() === t) { buckets.name.push(t); continue; }

    if (S.age.has(t))         { buckets.b_age.push(t);    continue; }
    if (S.gender.has(t))      { buckets.b_gender.push(t); continue; }
    if (S.body_basic.has(t))  { buckets.b_body.push(t);   continue; }
    if (S.height.has(t))      { buckets.b_height.push(t); continue; }
    if (S.person.has(t))      { buckets.b_person.push(t); continue; }
    if (S.world.has(t))       { buckets.b_world.push(t);  continue; }
    if (S.tone.has(t))        { buckets.b_tone.push(t);   continue; }

    if (isHairColor(t)) { buckets.c_hair.push(t); continue; }
    if (isEyeColor(t))  { buckets.c_eye.push(t);  continue; }
    if (isSkinTone(t))  { buckets.c_skin.push(t); continue; }

    if (S.hair_style.has(t)) { buckets.s_hair.push(t); continue; }
    if (S.eyes_shape.has(t)) { buckets.s_eye.push(t);  continue; }
    if (S.face.has(t))       { buckets.s_face.push(t); continue; }
    if (S.skin_body.has(t))  { buckets.s_body.push(t); continue; }
    if (S.art_style.has(t))  { buckets.s_art.push(t);  continue; }

    if (S.outfit.has(t) || WEAR_NAME_RE.test(t)) { buckets.wear.push(t); continue; }
    if (S.acc.has(t)) { buckets.acc.push(t); continue; }

    if (S.background.has(t)) { buckets.bg.push(t);   continue; }
    if (S.comp.has(t))       { buckets.comp.push(t); continue; } // 構図
    if (S.pose.has(t))       { buckets.pose.push(t); continue; } // ポーズ
    if (S.view.has(t))       { buckets.view.push(t); continue; } // 視点
    if (S.expr.has(t))       { buckets.expr.push(t); continue; }
    if (S.light.has(t))      { buckets.light.push(t);continue; }

    // === NSFW: 従来 + 追加カテゴリ ===
    if (S.nsfw_expr.has(t))     { buckets.n_expr.push(t);     continue; }
    if (S.nsfw_expo.has(t))     { buckets.n_expo.push(t);     continue; }
    if (S.nsfw_situ.has(t))     { buckets.n_situ.push(t);     continue; }
    if (S.nsfw_light.has(t))    { buckets.n_light.push(t);    continue; }
    if (S.nsfw_pose.has(t))     { buckets.n_pose.push(t);     continue; }
    if (S.nsfw_acc.has(t))      { buckets.n_acc.push(t);      continue; }
    if (S.nsfw_outfit.has(t))   { buckets.n_outfit.push(t);   continue; }
    if (S.nsfw_body.has(t))     { buckets.n_body.push(t);     continue; }
    if (S.nsfw_nipples.has(t))  { buckets.n_nipples.push(t);  continue; }
    // ★ 追加：下着
    if (S.nsfw_underwear.has(t)){ buckets.n_underwear.push(t);continue; }

    buckets.other.push(t);
  }

  // 上限で刈り込み（未定義は無制限）
  const capped = [];
  for (const [bk, arr] of Object.entries(buckets)) {
    const cap = (LEARN_BUCKET_CAP && LEARN_BUCKET_CAP[bk]);
    if (cap === undefined) { capped.push(...arr); continue; }
    if (cap > 0) capped.push(...arr.slice(0, cap));
  }
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
const getMany = (name) => $$(`input[name="${name}"]:checked`).map(x=>x.value);





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
function pmTextById(id){
  var el = pmById(id); return el && el.textContent ? String(el.textContent).trim() : '';
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

/* ===== 撮影モード：置き換え ===== */
function pmBuildOne(){
  // 基本情報・シード
  var name = pmValById('charName');
  var seed = (typeof seedFromName === 'function') ? seedFromName(name,1) : 0;

  // 基本情報
  var base = [];
  if (name) base.push(name);
  var tmp;
  tmp = pmPickOne('bf_age');    if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_gender'); if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_body');   if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_height'); if (tmp) base.push(tmp);
  tmp = pmPickOne('hairStyle'); if (tmp) base.push(tmp);
  tmp = pmPickOne('eyeShape');  if (tmp) base.push(tmp);
  tmp = pmTextById('tagH');     if (tmp) base.push(tmp);
  tmp = pmTextById('tagE');     if (tmp) base.push(tmp);
  tmp = pmTextById('tagSkin');  if (tmp) base.push(tmp);

  // 差分（SFW）
  var bg    = pmPickOne('pl_bg')   || 'plain background';
  var pose  = pmPickOne('pl_pose') || '';
  var comp  = pmPickOne('pl_comp') || 'bust';
  var view  = pmPickOne('pl_view') || 'three-quarters view';
  var exprS = pmPickOne('pl_expr') || 'neutral expression';
  var liteS = pmPickOne('pl_light')|| 'soft lighting';

  // NSFW
  var nsfwOn    = pmChecked('pl_nsfw');
  var nsfwExpr  = nsfwOn ? pmPickOne('pl_nsfw_expr')  : '';
  var nsfwExpo  = nsfwOn ? pmPickOne('pl_nsfw_expo')  : '';
  var nsfwSitu  = nsfwOn ? pmPickOne('pl_nsfw_situ')  : '';
  var nsfwLight = nsfwOn ? pmPickOne('pl_nsfw_light') : '';
  var nsfwPose  = nsfwOn ? (pmPickOne('pl_nsfw_pose')      || '') : '';
  var nsfwAcc   = nsfwOn ? (pmPickOne('pl_nsfw_acc')       || '') : '';
  var nsfwOut   = nsfwOn ? (pmPickOne('pl_nsfw_outfit')    || '') : '';
  var nsfwBody  = nsfwOn ? (pmPickOne('pl_nsfw_body')      || '') : '';
  var nsfwNip   = nsfwOn ? (pmPickOne('pl_nsfw_nipple')    || '') : '';
  var nsfwUnder = nsfwOn ? (pmPickOne('pl_nsfw_underwear') || '') : '';

  // 表情/光：NSFW優先
  var expr = (nsfwOn && nsfwExpr)  ? nsfwExpr  : exprS;
  var lite = (nsfwOn && nsfwLight) ? nsfwLight : liteS;

  // 固定アクセ
  var accName = pmValById('pl_accSel');
  var acc = '';
  if (accName){
    var color = pmGetAccColor ? pmGetAccColor() : '';
    acc = color ? (accName + ', ' + color) : accName;
  }

  var fixed = pmGetFixed();

  // 一旦全部積む
  var parts = []
    .concat(['solo'])
    .concat((typeof getGenderCountTag==='function') ? [(getGenderCountTag()||'')] : [])
    .concat(fixed)
    .concat(base)
    .concat([bg, pose, comp, view, expr, lite, acc]);

  if (nsfwOn){
    if (nsfwExpo)  parts.push(nsfwExpo);
    if (nsfwSitu)  parts.push(nsfwSitu);
    if (nsfwPose)  parts.push(nsfwPose);
    if (nsfwAcc)   parts.push(nsfwAcc);
    if (nsfwOut)   parts.push(nsfwOut);
    if (nsfwBody)  parts.push(nsfwBody);
    if (nsfwNip)   parts.push(nsfwNip);
    if (nsfwUnder) parts.push(nsfwUnder);
  }

  parts = parts.filter(Boolean);

  // 服/露出の優先
  if (typeof applyNudePriority === 'function') parts = applyNudePriority(parts);
  if (typeof enforceOnePieceExclusivity === 'function') parts = enforceOnePieceExclusivity(parts);

  // 露出検知
  var isExposure = nsfwOn && (typeof hasExposureLike === 'function') && hasExposureLike(parts);

  // 露出なら：色の一次掃除 + 露出ダブり畳み（※一度だけ）
  if (isExposure){
    if (typeof stripWearColorsOnce === 'function') parts = stripWearColorsOnce(parts);
    if (typeof collapseExposureDuplicates === 'function') parts = collapseExposureDuplicates(parts);
  }

  // 靴ガード
  (function shoeGuard(){
    var looksShoe = function(s){
      var x = String(s).toLowerCase();
      return /\b(shoes|boots|sneakers|loafers|sandals|heels|mary\s+janes|mary_janes|geta|zori)\b/i.test(x);
    };
    if (isExposure){
      parts = parts.filter(function(t){ return !looksShoe(t); });
    } else {
      var useShoesFlag = document.getElementById('use_shoes') ? !!document.getElementById('use_shoes').checked : true;
      if (!useShoesFlag) parts = parts.filter(function(t){ return !looksShoe(t); });
    }
  })();

  // 非露出のみ色ペアリング
  if (!isExposure && typeof pairWearColors === 'function') {
    parts = pairWearColors(parts);
  }

  // 整理
  if (typeof stripMultiHints === 'function') parts = stripMultiHints(parts);
  if (typeof forceSoloPos === 'function')    parts = forceSoloPos(parts);

  // NSFW時：通常服/色/靴の最終一掃（※ここは一回だけ）
  if (nsfwOn && typeof stripNormalWearWhenNSFW === 'function'){
    parts = stripNormalWearWhenNSFW(parts);
  }

  // 排他 → 並び順 → 先頭固定
  if (typeof fixExclusives === 'function')     parts = fixExclusives(parts);
  if (typeof ensurePromptOrder === 'function') parts = ensurePromptOrder(parts);
  if (typeof enforceHeadOrder === 'function')  parts = enforceHeadOrder(parts);

  if (nsfwOn) {
    parts = parts.filter(function(t){ return String(t) !== "NSFW"; });
    parts.unshift("NSFW");
  }

  // ネガ
  var negBase = (typeof pmGetNeg === 'function') ? pmGetNeg() : "";
  var neg = (typeof withSoloNeg==='function') ? withSoloNeg(negBase) : negBase;

  return [{ seed: seed, pos: parts, neg: neg }];
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
  radioList($("#outfit_shoes"),  C.dress, "outfit_shoes", {checkFirst:false});
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



// === 学習用 NSFW ホワイトリスト（軽度中心・ブレにくい範囲で拡張） ===
const NSFW_LEARN_SCOPE = {
  expression: [
    // L1: ごく軽い表情中心（幅の拡張）
    "aroused","flushed","embarrassed","seductive_smile",
    "half_lidded_eyes","bedroom_eyes","lip_bite",
    "bashful","pouting",
    // 追加（L2の中でも弱め・視覚的ノイズ少なめ）
    "moist_lips","tearful"
    // ※ ahegao/rolling_eyes 等の強すぎるL2は除外のまま
  ],

  exposure: [
    // L1: 肌見せ系の軽度
    "mild_cleavage","off_shoulder","bare_back","leggy",
    // L2: 透け/濡れ・部分露出（露出そのものだが破綻を起こしにくい範囲）
    "wet_clothes","see_through","sideboob","underboob"
    // ※ topless/bottomless/nude は学習ブレが大きいので対象外のまま
  ],

  situation: [
    // L1: 日常的/撮影的な軽度シチュ
    "suggestive_pose","mirror_selfie","after_shower","towel_wrap",
    "sauna_steam","sunbathing",
    // L2: “脱ぎかけ/隠し”など控えめ寄り
    "in_bed_sheets","undressing","zipper_down","covered_nudity",
    "photoshoot_studio"
    // ※ 体液・explicit系は除外（学習の安定性重視）
  ],

  // 追加：背景（学習では安定度が高く、構図に一貫性が出やすい）
  background: [
    "beach","poolside","waterpark","beach_night"
  ],

  lighting: [
    // 既存で安定していた範囲を維持
    "softbox","rim_light","backlit","window_glow","golden_hour",
    "neon","candlelight","low_key","hard_light","colored_gels",
    "film_noir","dappled_light","spotlight","moody"
  ],

  // 追加カテゴリも“軽度”に限定
  pose: [
    "seductive_pose","lying_on_bed","stretching","crossed_legs",
    "arched_back","against_wall" // 増やすが、性行為連想の強い体位は除外
  ],

  outfit: [
    // 露骨なFetish系を避けつつ、見た目の幅だけ拡張
    "nightgown","babydoll","camisole","crop_top","see_through_top",
    "bikini","school_swimsuit","wet_swimsuit"
  ],

  body: [
    // L1を追加して“体型バリエーション”を増やす（安定しやすい）
    "flat_chest","small_breasts","petite_bust",
    // 既存の一部は維持（誇張すぎるものは外してもOK）
    "big_breasts","soft_body","wide_hips"
    // ※ thicc/bubble_butt/slim_thick/hourglass_exaggerated は好みで残してOKだが、
    //   学習のキャラ安定を優先するなら一旦外すのを推奨
  ],

  nipples: [
    // L1のみ（露出度は上がるが、形状要素は比較的安定しやすい）
    "puffy_nipples","inverted_nipples","large_areolae","dark_areolae"
    // ※ pierced 等の付加要素は外すと安定
  ],

  underwear: [
    // 下着は“透け/レース/スポーツ/ストッキング系”を中心に
    "lace_panties","sheer_panties","thong","gstring",
    "lace_bra","sports_bra","stockings","thighhighs"
  ]
};



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

// 共有: 服色と服名をペア化（top/bottom/shoes の色→実服名へ）
function pairWearColors(parts){
  const P = new Set((parts || []).filter(Boolean));
  const S = s => String(s || "");

  const TOP_RE    = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer)\b/i;
  const BOTTOM_RE = /\b(skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts)\b/i;
  const DRESS_RE  = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape)\b/i;
  const SHOES_RE  = /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;

  const find = re => [...P].find(t => re.test(S(t)));
  const noun = (hit, re) => { const m = S(hit).match(re); return m ? m[1].toLowerCase() : ""; };

  const topWord    = noun(find(TOP_RE), TOP_RE);
  const bottomWord = noun(find(BOTTOM_RE), BOTTOM_RE);
  const dressWord  = noun(find(DRESS_RE), DRESS_RE);
  const shoesWord  = noun(find(SHOES_RE), SHOES_RE);

  const replaceGeneric = (generic, nounWord) => {
    if (!nounWord) return;
    const reColor = new RegExp(`^(.+?)\\s+${generic}$`, "i"); // 例: "white top"
    const colorHit = [...P].find(t => reColor.test(S(t)));
    if (!colorHit) return;
    const color = S(colorHit).replace(reColor, "$1");
    P.delete(colorHit);
    [...P].forEach(x => {
      if (new RegExp(`\\b${generic}\\b`, "i").test(S(x))) P.delete(x);
      if (new RegExp(`\\b${nounWord}\\b`, "i").test(S(x))) P.delete(x);
    });
    P.add(`${color} ${nounWord}`);
  };

  if (!dressWord) { // ワンピ採用行は top/bottom の置換は不要
    replaceGeneric("top",    topWord);
    replaceGeneric("bottom", bottomWord);
  }
  replaceGeneric("shoes", shoesWord);

  return [...P];
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

// ユーティリティ：グループ内は1つだけ残す
function pickOneFromGroup(parts, group, preferOrder = null){
  const S = new Set(parts);
  const hits = group.filter(g => S.has(g));
  if (hits.length <= 1) return parts;

  let keep = hits[0];
  if (Array.isArray(preferOrder) && preferOrder.length){
    for (const cand of preferOrder){ if (S.has(cand)) { keep = cand; break; } }
  }
  return parts.filter(t => !(group.includes(t) && t !== keep));
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

// 視点：front / three-quarters / profile / back は1つに
function ensureViewExclusive(parts){
  const GROUP = ["front view","three-quarters view","profile view","side view","back view"];
  const PREFER = ["three-quarters view","front view","profile view","back view","side view"];
  return pickOneFromGroup(parts, GROUP, PREFER);
}

// まとめ（呼び出し側はこれだけ使う）
function fixExclusives(parts){
  let p = parts.slice();
  p = ensureExprExclusive(p);  // 表情：1つ
  p = ensureCompExclusive(p);  // 構図/距離：1つ
  p = ensureViewExclusive(p);  // 視点：1つ ←★これが抜けてた
  return p;
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

// ▼ 正規化：辞書準拠（profileは“side”に吸収しない／light gray → gray_seamless）
function normalizeTag(t){
  if(!t) return "";
  const s = String(t).trim().toLowerCase();

  // ---- view ----
  if (s==="3/4 view" || s==="three quarters view") return "three-quarters view";
  if (s==="profile") return "profile view"; // 吸収せず表記だけ統一

  // ---- composition ----
  if (s==="close up" || s==="closeup") return "close-up";
  if (s==="bust shot" || s==="bust-up" || s==="bust up") return "bust";
  if (s==="upper-body" || s==="upperbody") return "upper body";

  // ---- background（snake_caseへ統一）----
  if (s==="plain background")  return "plain_background";
  if (s==="solid background")  return "solid_background";
  if (s==="studio background") return "studio_background";
  if (s==="white background")  return "white_background";
  if (s==="white seamless")    return "white_seamless";
  if (s==="light gray background" || s==="light grey background") return "gray_seamless";

  // ---- lighting ----
  if (s==="rim lighting") return "rim light";        // 辞書：rim light
  if (s==="back light" || s==="back-lighting") return "backlighting";
  if (s==="studio lighting") return "flat studio lighting"; // 辞書：flat studio lighting

  return s;
}

// 追加：タグ配列をホワイトリストで絞る共通関数
function filterByScope(items, allow) {
  if (!Array.isArray(items)) return [];
  if (!Array.isArray(allow) || allow.length === 0) return items;
  const s = new Set(allow);
  return items.filter(x => s.has(x.tag));
}

// === 学習用ホワイトリスト（辞書準拠） ==================
const SCOPE = {
  learning: {
    background: [
      "plain_background",
      "white_background",
      "solid_background",
      "studio_background",
      "white_seamless",
      "gray_seamless"
    ],
    pose: [
      "standing",
      "sitting",
      "hands on hips",
      "crossed arms",
      "hand on chest",
      "hands behind back",
      "head tilt",
      "waving"
      // ※ "arms crossed behind head" は辞書外なので除外
    ],
    composition: [
      "full body",
      "waist up",
      "bust",
      "close-up",
      "portrait",
      "centered composition"
    ],
    view: [
      "front view",
      "three-quarters view",
      "side view",
      "profile view", // 追加：配分ルールに合わせる
      "back view"
    ],
    expressions: [
      "neutral expression",
      "smiling",
      "smiling open mouth",
      "serious",
      "determined",
      "slight blush",
      "surprised (mild)",
      "pouting (slight)",
      "teary eyes",
      "laughing",
      "embarrassed"
    ],
    lighting: [
      "normal lighting",
      "even lighting",
      "soft lighting",
      "window light",
      "overcast",
      "flat studio lighting", // 辞書準拠
      "backlighting",
      "rim light"             // 辞書準拠
    ]
  }
};

// === 顔安定版・配分ルール =======================
const MIX_RULES = {
  view: {
    group: ["front view","three-quarters view","side view","profile view","back view"],
    targets: {
      "three-quarters view":[0.55,0.65],
      "front view":[0.30,0.35],
      "side view":[0.02,0.04],
      "profile view":[0.01,0.03],
      "back view":[0.00,0.01]
    },
    fallback: "three-quarters view"
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
      "plain_background":[0.55,0.62],   // 主軸（下げすぎない）
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

// 使っているならそのまま
const EXPR_ALL = new Set([
  ...Object.keys(MIX_RULES.expr.targets),
  MIX_RULES.expr.fallback
]);


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




/* ===== 学習モード：置き換え（修正版） ===== */
function buildOneLearning(extraSeed = 0){
  const getManySafe = (id) => {
    try {
      const v = (typeof getMany === 'function') ? getMany(id) : [];
      return Array.isArray(v) ? v : [];
    } catch(_) { return []; }
  };
  const pickSafe = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return "";
    if (typeof pick === 'function') return pick(arr);
    // pick が無い場合のフォールバック
    return arr[Math.floor(Math.random()*arr.length)];
  };

  // 固定タグ
  const fixed = (typeof getFixedLearn === 'function') ? (getFixedLearn() || []) : [];

  // 差分プール
  const BG = getManySafe("bg");
  const PO = getManySafe("pose");
  const CO = getManySafe("comp");
  const VI = getManySafe("view");
  const EX = getManySafe("expr");
  const LI = getManySafe("lightLearn");

  // NSFW（学習）選択の追加分
  const addon = (typeof getSelectedNSFW_Learn === 'function' ? (getSelectedNSFW_Learn()||[]) : []);

  // NSFW ON?
  const ids = ['nsfwLearn','nsfwL','nsfw_learning'];
  let nsfwOn = addon.length > 0;
  for (const id of ids){
    const el = document.getElementById(id);
    if (el && el.checked) { nsfwOn = true; break; }
  }

  // 1件ピック
  const b = pickSafe(BG), p = pickSafe(PO), c = pickSafe(CO),
        v = pickSafe(VI), e = pickSafe(EX), l = pickSafe(LI);

  // 基本付与
  const partsSolo = ["solo"];
  const genderCount = (typeof getGenderCountTag === 'function' ? (getGenderCountTag()||"") : "");
  if (genderCount) partsSolo.push(genderCount);

  // parts を一度だけ作る（※ 重複宣言しない）
  let parts = Array.from(new Set([
    ...partsSolo, ...fixed, b, p, c, v, e, l, ...addon
  ].filter(Boolean)));

  // 服/露出の優先
  if (typeof applyNudePriority === 'function')          parts = applyNudePriority(parts);
  if (typeof enforceOnePieceExclusivity === 'function') parts = enforceOnePieceExclusivity(parts);

  // 露出検知
  const isExposure = nsfwOn && (typeof hasExposureLike === 'function') && hasExposureLike(parts);

  // 露出時：色の一次掃除 + 露出ダブり畳み（※一度だけ）/ 非露出：色ペアリング
  if (isExposure){
    if (typeof stripWearColorsOnce === 'function') parts = stripWearColorsOnce(parts);
    if (typeof collapseExposureDuplicates === 'function') parts = collapseExposureDuplicates(parts);
  } else {
    if (typeof pairWearColors === 'function') parts = pairWearColors(parts);
  }

  // 学習ノイズ除去
  const NSFW_HARD_BLOCK_RE = /\b(blood(_splatter)?|injur(y|ies)|wound(ed)?|gore|gory|violence|torture)\b/i;
  const LEARN_NOISE_RE = /\b(crowd|group|multiple people|two people|three people|duo|trio|background people|lens flare|cinematic lighting|dramatic lighting|stage lighting|studio lighting|hdr|tilt-?shift|fisheye|wide-?angle|dutch angle|extreme close-?up|depth of field|strong bokeh|motion blur|watermark|signature|copyright|smartphone|phone|camera|microphone|mic|weapon|gun|sword|shield|staff|laptop|keyboard|headphones|backpack|bag|umbrella|drink|food|ice cream|skateboard)\b/i;
  parts = parts.filter(t => !NSFW_HARD_BLOCK_RE.test(String(t)));
  parts = parts.filter(t => !LEARN_NOISE_RE.test(String(t)));
  if (typeof stripMultiHints === 'function') parts = stripMultiHints(parts);
  if (typeof forceSoloPos === 'function')    parts = forceSoloPos(parts);

  // アンカー補完
  const asText = parts.join(", ");
  if (!/\b(front view|three-quarters view|profile view|side view|back view|from below|overhead view|looking down|looking up|eye-level|low angle|high angle)\b/i.test(asText)) parts.push("front view");
  if (!/\b(plain background|studio background|solid background)\b/i.test(asText)) parts.push("plain background");
  if (!/\b(upper body|bust|waist up|portrait|full body)\b/i.test(asText)) parts.push("upper body");
  if (!/\b(neutral expression|smiling|serious|determined|slight blush|surprised \(mild\)|pouting \(slight\))\b/i.test(asText)) parts.push("neutral expression");
  if (!/\b(soft lighting|even lighting|normal lighting)\b/i.test(asText)) parts.push("soft lighting");
  if (!/\b(center(ed)?\s?composition|centered composition)\b/i.test(asText)) parts.push("centered composition");

  // 排他→整列
  if (typeof fixExclusives === 'function') parts = fixExclusives(parts);
  let pos = Array.from(new Set(parts.filter(Boolean)));
  if (typeof ensurePromptOrder === 'function') pos = ensurePromptOrder(pos);
  if (typeof enforceHeadOrder === 'function')  pos = enforceHeadOrder(pos);

  // NSFW時：通常服/色/靴の最終一掃
  if (nsfwOn && typeof stripNormalWearWhenNSFW === 'function') {
    pos = stripNormalWearWhenNSFW(pos);
  }

  // NSFW トークン
  pos = pos.filter(t => String(t) !== "NSFW");
  if (nsfwOn) pos.unshift("NSFW");

  // seed / neg
  const seed = (typeof seedFromName === 'function')
    ? seedFromName((document.getElementById('charName')?.value || ''), extraSeed)
    : 0;

  const EXTRA_NEG = ["props","accessories","smartphone","phone","camera"];
  const baseNeg = [
    (typeof getNeg === 'function' ? getNeg() : ""),
    ...EXTRA_NEG
  ].filter(Boolean).join(", ");
  const neg = (typeof buildNegative === 'function') ? buildNegative(baseNeg) : baseNeg;

  return { seed, pos, neg, text: `${pos.join(", ")} --neg ${neg} seed:${seed}` };
}


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

/* ============================================================================
 * 学習モード一括生成（修正版・置き換え用 / 追加NSFW6カテゴリ対応 + 先頭NSFW）
 * ========================================================================== */
function buildBatchLearning(n){
  const out  = [];
  const used = new Set();
  let guard  = 0;

  // ① ユニーク優先
  while (out.length < n && guard < n * 300){
    guard++;
    let r = buildOneLearning(out.length + 1);
    if (typeof enforceHeadOrder === 'function') r.pos = enforceHeadOrder(r.pos || []);
    const key = (r.pos || []).join("|");
    if (used.has(key)) continue;
    used.add(key);
    out.push(r);
  }

  // ② 足りない分は重複許容
  while (out.length < n){
    let r = buildOneLearning(out.length + 1);
    if (typeof enforceHeadOrder === 'function') r.pos = enforceHeadOrder(r.pos || []);
    out.push(r);
  }

  // ③ 割合ミックス適用（VIEW / COMP / EXP / BG / LIGHT）
  if (typeof applyPercentForTag === 'function' && typeof fillRemainder === 'function' && typeof MIX_RULES === 'object'){
    const rows = out;

    // view
    if (MIX_RULES.view) {
      applyPercentForTag(rows, MIX_RULES.view.group, "profile view", ...MIX_RULES.view.targets["profile view"]);
      applyPercentForTag(rows, MIX_RULES.view.group, "back view",    ...MIX_RULES.view.targets["back view"]);
      fillRemainder(rows, MIX_RULES.view.group, MIX_RULES.view.fallback);
    }

    // comp
    if (MIX_RULES.comp) {
      for (const [tag, rng] of Object.entries(MIX_RULES.comp.targets || {})) {
        applyPercentForTag(rows, MIX_RULES.comp.group, tag, rng[0], rng[1]);
      }
      fillRemainder(rows, MIX_RULES.comp.group, MIX_RULES.comp.fallback);
    }

    // expr（SFW基準）
    if (MIX_RULES.expr) {
      const selExpr = getMany("expr") || [];
      const exprGroupBase = selExpr.length ? selExpr : MIX_RULES.expr.group;
      const exprGroup = Array.from(new Set([...exprGroupBase, "neutral expression"]));
      for (const [tag, rng] of Object.entries(MIX_RULES.expr.targets || {})) {
        if (!exprGroup.includes(tag)) continue;
        applyPercentForTag(rows, exprGroup, tag, rng[0], rng[1]);
      }
      fillRemainder(rows, exprGroup, MIX_RULES.expr.fallback);
    }

    // bg
    if (MIX_RULES.bg) {
      for (const [tag, rng] of Object.entries(MIX_RULES.bg.targets || {})) {
        applyPercentForTag(rows, MIX_RULES.bg.group, tag, rng[0], rng[1]);
      }
      fillRemainder(rows, MIX_RULES.bg.group, MIX_RULES.bg.fallback);
    }

    // light
    if (MIX_RULES.light) {
      for (const [tag, rng] of Object.entries(MIX_RULES.light.targets || {})) {
        applyPercentForTag(rows, MIX_RULES.light.group, tag, rng[0], rng[1]);
      }
      fillRemainder(rows, MIX_RULES.light.group, MIX_RULES.light.fallback);
    }
  }

  // ③.5 NSFW整理（UI 選択分を各カテゴリ1つだけ反映 + 先頭NSFW付与条件の判定材料）
  {
    const nsfwOn = !!document.querySelector("#nsfwLearn")?.checked;

    const gExpr   = getMany("nsfwL_expr")      || [];
    const gExpo   = getMany("nsfwL_expo")      || [];
    const gSitu   = getMany("nsfwL_situ")      || [];
    const gLight  = getMany("nsfwL_light")     || [];
    const gPose   = getMany("nsfwL_pose")      || [];
    const gAcc    = getMany("nsfwL_acc")       || [];
    const gOutfit = getMany("nsfwL_outfit")    || [];
    const gBody   = getMany("nsfwL_body")      || [];
    const gNip    = getMany("nsfwL_nipple")    || [];
    const gUnder  = getMany("nsfwL_underwear") || [];

    const isAnyNSFWSelected =
      gExpr.length || gExpo.length || gSitu.length || gLight.length ||
      gPose.length || gAcc.length || gOutfit.length || gBody.length ||
      gNip.length  || gUnder.length;

    const keepOneFrom = (arr, pool)=>{
      if (!Array.isArray(arr) || !pool || !pool.length) return arr;
      let kept = false, ret = [];
      for (const t of arr){
        if (pool.includes(t)) {
          if (!kept){ ret.push(t); kept = true; }
        } else ret.push(t);
      }
      return ret;
    };

    for (const r of out){
  let p = Array.isArray(r.pos) ? r.pos.slice()
        : (typeof r.prompt === 'string' ? r.prompt.split(/\s*,\s*/) : []);
  p = (p || []).map(normalizeTag);

  // ★ 先に「色×服」を合成 → ここで新規に生まれたトークンを保護対象にする
  const beforePair = new Set(p);
  if (typeof pairWearColors === 'function') p = pairWearColors(p);
  const OUTFIT_FIXED = new Set(
    p.filter(t => !beforePair.has(t)).map(normalizeTag)
  );

  const chosenExpr   = gExpr[0]   || "";
  const chosenExpo   = gExpo[0]   || "";
  const chosenSitu   = gSitu[0]   || "";
  const chosenLight  = gLight[0]  || "";
  const chosenPose   = gPose[0]   || "";
  const chosenAcc    = gAcc[0]    || "";
  const chosenOutfit = gOutfit[0] || "";
  const chosenBody   = gBody[0]   || "";
  const chosenNip    = gNip[0]    || "";
  const chosenUnder  = gUnder[0]  || "";

  // 表情：SFW表情を除去 → NSFW表情1つ注入 or 既存から1つだけ残す
  if (chosenExpr){
    const sfwExprGroup = Array.from(new Set([...(getMany("expr")||[]), ...(MIX_RULES?.expr?.group||[]), "neutral expression"]));
    p = p.filter(t => !sfwExprGroup.includes(t));
    if (!p.includes(chosenExpr)) p.push(chosenExpr);
  } else {
    p = keepOneFrom(p, gExpr);
  }

  // 露出：服色プレース排他。ただし ★OUTFIT_FIXED は絶対に残す
  if (chosenExpo){
    if (typeof applyNudePriority === 'function') p = applyNudePriority(p);
    if (typeof enforceOnePieceExclusivity === 'function') p = enforceOnePieceExclusivity(p);

    const IS_EXPOSURE_WEAR = /\b(bikini|swimsuit|lingerie|underwear|micro_bikini|string_bikini|sling_bikini|wet_swimsuit|nipple[_\s]?cover[_\s]?bikini|crotchless[_\s]?swimsuit|bodypaint[_\s]?swimsuit|topless|bottomless|nude)\b/i;
    if (IS_EXPOSURE_WEAR.test(chosenExpo)){
      const CLOTH_NOUN_RE  = /\b(top|bottom|skirt|pants|shorts|jeans|t-?shirt|shirt|blouse|sweater|hoodie|jacket|coat|dress|one[-\s]?piece|gown)\b/i;
      const COLOR_WORD_RE  = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b/i;
      const COLOR_PLACE_RE = new RegExp(`${COLOR_WORD_RE.source}\\s+(top|bottom|skirt|pants|shorts|jeans|t-?shirt|shirt|blouse|sweater|hoodie|jacket|coat|dress|one[-\\s]?piece|gown)`,`i`);
      const FOOTWEAR_RE    = /\b(shoes|boots|sneakers|loafers|sandals|heels|mary janes|geta|zori)\b/i;

      p = p.filter(s=>{
        const x  = String(s);
        const nx = normalizeTag(x);
        if (OUTFIT_FIXED.has(nx)) return true;   // ★ 保護
        if (CLOTH_NOUN_RE.test(x))  return false;
        if (COLOR_PLACE_RE.test(x)) return false;
        if (FOOTWEAR_RE.test(x))    return false;
        if (COLOR_WORD_RE.test(x) && !/\s/.test(x)) return false;
        return true;
      });
    }
    if (!p.includes(chosenExpo)) p.push(chosenExpo);
  } else {
    p = keepOneFrom(p, gExpo);
  }

  // シチュ/光：各1
  if (gSitu.length){ p = keepOneFrom(p, gSitu);  if (chosenSitu  && !p.includes(chosenSitu))  p.push(chosenSitu); }
  if (gLight.length){ p = keepOneFrom(p, gLight); if (chosenLight && !p.includes(chosenLight)) p.push(chosenLight); }

  // 追加：ポーズ/アクセ/衣装/身体/乳首/下着：各1
  if (gPose.length)   { p = keepOneFrom(p, gPose);   if (chosenPose   && !p.includes(chosenPose))   p.push(chosenPose); }
  if (gAcc.length)    { p = keepOneFrom(p, gAcc);    if (chosenAcc    && !p.includes(chosenAcc))    p.push(chosenAcc); }
  if (gOutfit.length) { p = keepOneFrom(p, gOutfit); if (chosenOutfit && !p.includes(chosenOutfit)) p.push(chosenOutfit); }
  if (gBody.length)   { p = keepOneFrom(p, gBody);   if (chosenBody   && !p.includes(chosenBody))   p.push(chosenBody); }
  if (gNip.length)    { p = keepOneFrom(p, gNip);    if (chosenNip    && !p.includes(chosenNip))    p.push(chosenNip); }
  if (gUnder.length)  { p = keepOneFrom(p, gUnder);  if (chosenUnder  && !p.includes(chosenUnder))  p.push(chosenUnder); }

  // NSFW を先頭へ
  if ((nsfwOn || isAnyNSFWSelected) && !p.includes("NSFW")) {
    p.unshift("NSFW");
  } else if (p.includes("NSFW") && p[0] !== "NSFW") {
    p = p.filter(t => t !== "NSFW");
    p.unshift("NSFW");
  }

  r.pos    = p;
  r.prompt = p.join(", ");
}
  }

  // ④ 最終整形（ここで基本情報を必ず前段に注入）
for (const r of out){
  let p = Array.isArray(r.pos) ? r.pos.slice()
        : (typeof r.prompt === 'string' ? r.prompt.split(/\s*,\s*/) : []);
  p = (p || []).map(normalizeTag);

  // 固定（従来どおり）
  const fixed = (typeof getFixedLearn === 'function') ? getFixedLearn() : [];

  // ★ 基本情報をDOMから直接取得（pm系は一切使わない）
  const basicsRaw = [
    document.getElementById('ID_AGE')?.value,
    document.getElementById('ID_GENDER')?.value,
    document.getElementById('ID_BODY')?.value,
    document.getElementById('ID_HEIGHT')?.value,
    document.getElementById('ID_HAIR')?.value,
    document.getElementById('ID_EYE')?.value,
    document.getElementById('ID_SKIN')?.value,
    document.getElementById('tagH')?.value,
    document.getElementById('tagE')?.value,
    document.getElementById('tagSkin')?.value
  ].filter(Boolean);

  const basics = basicsRaw
    .flatMap(s => String(s).split(/\s*,\s*/))
    .map(normalizeTag)
    .filter(Boolean);

  // 固定 → 基本情報 → 既存p
  p = [...fixed, ...basics, ...p].filter(Boolean);

  if (typeof fixExclusives === 'function') p = fixExclusives(p);
  p = Array.from(new Set(p)); // 重複除去

  // （任意）ビュー/光/背景の1本化や順序調整
  if (typeof enforceSingleBackground === 'function') p = enforceSingleBackground(p);
  if (typeof unifyLightingOnce       === 'function') p = unifyLightingOnce(p);
  if (typeof ensureViewExclusive     === 'function') p = ensureViewExclusive(p);
  if (typeof ensurePromptOrder === 'function') p = ensurePromptOrder(p);
  if (typeof enforceHeadOrder  === 'function') p = enforceHeadOrder(p);

  // NSFW を先頭に固定
  if (p.includes("NSFW") && p[0] !== "NSFW"){
    p = p.filter(t => t !== "NSFW");
    p.unshift("NSFW");
  }

  r.pos    = p;
  r.prompt = p.join(", ");

  const addonNeg = ["props","accessories","smartphone","phone","camera"].join(", ");
  const learnNeg = (typeof getNegLearn === 'function') ? getNegLearn() : "";
  r.neg  = [learnNeg, addonNeg].filter(Boolean).join(", ");

  r.seed = r.seed || seedFromName($("#charName")?.value || "", 1);
  r.text = `${r.prompt} --neg ${r.neg} seed:${r.seed}`;
}

  return out;
}


/* ============================================================================
 * 置き換え: ensurePromptOrder（構図/view + NSFW追加6カテゴリに対応）
 * ========================================================================== */
function ensurePromptOrder(parts) {
  const set = new Set(parts.filter(Boolean));
  const asSet = (arr) => new Set((arr||[]).map(x => (typeof x==='string'? x : x.tag)));

  const S = {
    // 基本属性
    age:        asSet(SFW.age),
    gender:     asSet(SFW.gender),
    body_basic: asSet(SFW.body_type),
    height:     asSet(SFW.height),
    person:     asSet(SFW.personality),
    world:      asSet(SFW.worldview),
    tone:       asSet(SFW.speech_tone),

    // 形
    hair_style: asSet(SFW.hair_style),
    eyes_shape: asSet(SFW.eyes),
    face:       asSet(SFW.face),
    skin_body:  asSet(SFW.skin_body),
    art_style:  asSet(SFW.art_style),

    // 服・アクセ
    outfit:     asSet(SFW.outfit),
    acc:        asSet(SFW.accessories),

    // シーン（SFW）
    background:  asSet(SFW.background),
    pose:        asSet(SFW.pose),
    composition: asSet(SFW.composition), // ★
    view:        asSet(SFW.view),        // ★
    expr:        asSet(SFW.expressions),
    light:       asSet(SFW.lighting),

    // NSFW（従来）
    nsfw_expr:  asSet(NSFW.expression),
    nsfw_expo:  asSet(NSFW.exposure),
    nsfw_situ:  asSet(NSFW.situation),
    nsfw_light: asSet(NSFW.lighting),

    // NSFW（追加）
    nsfw_pose:     asSet(NSFW.pose),
    nsfw_acc:      asSet(NSFW.accessory),
    nsfw_outfit:   asSet(NSFW.outfit),
    nsfw_body:     asSet(NSFW.body),
    nsfw_nipples:  asSet(NSFW.nipples),
    nsfw_under:    asSet(NSFW.underwear),
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

  const charName = ($("#charName")?.value || "").trim();
  const WEAR_NAME_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer|skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts|dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;

  for (const t of set) {
    if (!t) continue;

    if (t.startsWith("<lora:") || /\b(?:LoRA|<lyco:)/i.test(t)) { buckets.lora.push(t); continue; }
    if (charName && t === charName) { buckets.name.push(t); continue; }

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

    // シーン
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

  // --- グローバル正規化（表情/構図/視点） ---
  // 1) 表情：SFW/NSFW 横断で 1つだけ
  {
    const ALL_EXPR = [...buckets.expr, ...buckets.n_expr];
    if (ALL_EXPR.length > 0) {
      const PREFER_EXPR = ["smiling","neutral expression","slight blush","surprised (mild)","pouting (slight)"];
      const keepExpr = PREFER_EXPR.find(t => ALL_EXPR.includes(t)) || ALL_EXPR[0];
      buckets.expr = [keepExpr];
      buckets.n_expr = [];
    }
  }
  // 2) 構図/視点：横断収集 → 1つだけ
  {
    const COMP_VIEW_ORDER = [
      "full body","wide shot","waist up","upper body","bust","portrait","close-up",
      "three-quarters view","front view","profile view","back view","side view"
    ];
    const keys = Object.keys(buckets);
    const hits = [];
    for (const k of keys) {
      for (const t of buckets[k]) if (COMP_VIEW_ORDER.includes(t)) hits.push(t);
    }
    if (hits.length > 1) {
      const keep = COMP_VIEW_ORDER.find(t => hits.includes(t)) || hits[0];
      for (const k of keys) {
        buckets[k] = buckets[k].filter(t => !(COMP_VIEW_ORDER.includes(t) && t !== keep));
      }
    }
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

// ② 完全置き換え版：buildBatchProduction（nullセーフ化 only）
function buildBatchProduction(n){
  const seedMode = document.querySelector('input[name="seedMode"]:checked')?.value || "fixed";

  // 固定タグ（先頭側に混ぜる）
  const fixedArr = (typeof getFixedProd === 'function') ? getFixedProd() : [];

  // ネガ（量産タブの個別欄をそのまま取得）
  const neg = (typeof getNegProd === 'function') ? getNegProd() : "";

  // 服セット {top, pants, skirt, dress, shoes}
  const Oraw = (typeof readProductionOutfits === 'function') ? (readProductionOutfits() || {}) : {};
  const O = {
    top:   Array.isArray(Oraw.top)   ? Oraw.top   : [],
    pants: Array.isArray(Oraw.pants) ? Oraw.pants : [],
    skirt: Array.isArray(Oraw.skirt) ? Oraw.skirt : [],
    dress: Array.isArray(Oraw.dress) ? Oraw.dress : [],
    shoes: Array.isArray(Oraw.shoes) ? Oraw.shoes : [],
  };

  // 差分（各カテゴリ）
  const bgs    = (typeof getMany === 'function' ? (getMany("p_bg")   || []) : []);
  const poses  = (typeof getMany === 'function' ? (getMany("p_pose") || []) : []);
  const comps  = (typeof getMany === 'function' ? (getMany("p_comp") || []) : []);
  const views  = (typeof getMany === 'function' ? (getMany("p_view") || []) : []);
  const exprs  = (typeof getMany === 'function' ? (getMany("p_expr") || []) : []);
  const lights = (typeof getMany === 'function' ? (getMany("p_light")|| []) : []); // SFWライト
  const acc    = (typeof readAccessorySlots === 'function' ? (readAccessorySlots() || []) : []);

  // NSFW（ON のときだけ各カテゴリから最大1つ）
  const nsfwOn   = !!((typeof $ === 'function' && $("#nsfwProd")) ? $("#nsfwProd").checked : false);
  const nsfwExpr = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_expr")     || []) : [])) : [];
  const nsfwExpo = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_expo")     || []) : [])) : [];
  const nsfwSitu = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_situ")     || []) : [])) : [];
  const nsfwLite = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_light")    || []) : [])) : [];  // NSFWライト

  // ★ 追加6カテゴリ
  const nsfwPose   = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_pose")      || []) : [])) : [];
  const nsfwAcc    = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_acc")       || []) : [])) : [];
  const nsfwOutfit = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_outfit")    || []) : [])) : [];
  const nsfwBody   = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_body")      || []) : [])) : [];
  const nsfwNip    = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_nipple")    || []) : [])) : [];
  const nsfwUnder  = nsfwOn ? ((typeof getMany === 'function' ? (getMany("nsfwP_underwear") || []) : [])) : [];

  // 服色プレースホルダ
  const getColorTagSafe = (typeof getProdWearColorTag === 'function')
    ? (slot)=> (getProdWearColorTag(slot) || "")
    : (_)=>"";
  const PC = {
    top:    getColorTagSafe("top"),
    bottom: getColorTagSafe("bottom"),
    shoes:  getColorTagSafe("shoes"),
  };

  const baseSeed = (typeof seedFromName === 'function')
    ? seedFromName(((typeof $==='function' && $("#charName")) ? $("#charName").value : "") || "", 0)
    : 0;

  const out  = [];
  const seen = new Set();
  let guard  = 0;

  const pickOne = (arr)=> (Array.isArray(arr) && arr.length ? (typeof pick === 'function' ? pick(arr) : arr[Math.floor(Math.random()*arr.length)]) : "");

  // ---- ヘルパ（この関数内だけで使う軽量版）----
  const EXPOSURE_EXCLUSIVE_RE =
    /\b(bikini|swimsuit|lingerie|underwear|micro_bikini|string_bikini|sling_bikini|wet_swimsuit|nipple[_\s]?cover[_\s]?bikini|crotchless[_\s]?swimsuit|bodypaint[_\s]?swimsuit|topless|bottomless|nude)\b/i;
  const CLOTH_NOUN_RE =
    /\b(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|windbreaker|dress|one[-\s]?piece|cheongsam|qipao|yukata|kimono|hanbok|gown|tracksuit|jersey|robe|poncho|cape|leotard|uniform)\b/i;
  const SHOES_RE =
    /\b(boots|sneakers|loafers|mary\s+janes|heels|sandals|shoes)\b/i;
  const COLOR_WORD_RE =
    /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\b/i;
  const COLOR_PLACE_RE =
    /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|dress|one[-\s]?piece|gown|uniform|shoes|boots|sneakers|loafers|mary\s+janes|heels|sandals)\b/i;

  function ensureSingleWearPerRow(arr){
    const seenWear = { top:false, bottom:false, dress:false, shoes:false };
    return (arr||[]).filter(t=>{
      const s = String(t);
      if (/\b(top)\b/i.test(s))    { if (seenWear.top)    return false; seenWear.top=true; }
      if (/\b(bottom|pants|trousers|skirt|shorts|jeans|cargo\s+pants)\b/i.test(s))
                                  { if (seenWear.bottom) return false; seenWear.bottom=true; }
      if (/\b(dress|one[-\s]?piece|gown)\b/i.test(s))
                                  { if (seenWear.dress)  return false; seenWear.dress=true; }
      if (/\b(shoes|boots|sneakers|loafers|mary\s+janes|heels|sandals)\b/i.test(s))
                                  { if (seenWear.shoes)  return false; seenWear.shoes=true; }
      return true;
    });
  }
  function removeWearPlaceholders(arr){
    return (arr||[]).filter(s=>{
      const x = String(s);
      if (COLOR_PLACE_RE.test(x)) return false;
      if (/\b(?:top|bottom)\b/i.test(x)) return false;
      return true;
    });
  }
  function enforceSingleBackground(arr){
    const BGdict = (((typeof window!=='undefined' && window.SFW && Array.isArray(window.SFW.background)) ? window.SFW.background : []) || []).map(x=>x?.tag || x);
    const set = new Set();
    const kept = [];
    for (const t of (arr||[])){
      if (BGdict.includes(t) || /background$/i.test(String(t))){
        if (!set.size) { set.add("bg"); kept.push(t); }
        else {
          if (/^plain background$/i.test(String(t))) continue;
        }
      } else kept.push(t);
    }
    const firstNonPlain = kept.find(x=> (BGdict.includes(x)||/background$/i.test(String(x))) && !/^plain background$/i.test(String(x)));
    if (firstNonPlain) {
      return kept.filter(x=>{
        const isBg = BGdict.includes(x)||/background$/i.test(String(x));
        return !isBg || x===firstNonPlain;
      });
    }
    return kept;
  }
  function unifyLightingOnce(arr){
    const Ls = []
      .concat( (((typeof window!=='undefined' && window.SFW && Array.isArray(window.SFW.lighting)) ? window.SFW.lighting : []) || []).map(x=>x?.tag||x) )
      .concat( (((typeof window!=='undefined' && window.NSFW && Array.isArray(window.NSFW.lighting)) ? window.NSFW.lighting : []) || []).map(x=>x?.tag||x) );
    const kept = [];
    let used = false;
    for (const t of (arr||[])){
      if (Ls.includes(t)){
        if (used) continue;
        used = true;
      }
      kept.push(t);
    }
    return kept;
  }
  function keepOneFrom(arr, pool){
    if (!Array.isArray(arr) || !Array.isArray(pool) || !pool.length) return arr||[];
    let kept = false, ret = [];
    for (const t of arr){
      if (pool.includes(t)) {
        if (!kept){ ret.push(t); kept = true; }
      } else ret.push(t);
    }
    return ret;
  }

  const makeOne = (i)=>{
    const parts = [];

    // --- 基本情報 ---
    const nameEl = (typeof $==='function' && $("#charName")) ? $("#charName") : null;
    const name = (nameEl?.value || "").trim();
    if (name) parts.push(name);

    parts.push("solo");
    if (typeof getGenderCountTag === 'function'){
      const gct = (getGenderCountTag()||"").trim();
      if (gct) parts.push(gct);
    }

    // テキスト基礎（年齢/性別/体型/身長）
    let tmp;
    tmp = (typeof pmPickOne==='function' ? pmPickOne('bf_age')    : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmPickOne==='function' ? pmPickOne('bf_gender') : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmPickOne==='function' ? pmPickOne('bf_body')   : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmPickOne==='function' ? pmPickOne('bf_height') : ""); if (tmp) parts.push(tmp);

    // 見た目（髪色/瞳色/肌・髪型・目の形）
    tmp = (typeof pmTextById==='function' ? pmTextById('tagH')    : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmTextById==='function' ? pmTextById('tagE')    : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmTextById==='function' ? pmTextById('tagSkin') : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmPickOne==='function' ? pmPickOne('hairStyle') : ""); if (tmp) parts.push(tmp);
    tmp = (typeof pmPickOne==='function' ? pmPickOne('eyeShape')  : ""); if (tmp) parts.push(tmp);

    // --- 服の選定（ワンピ優先 / 上下）--- ※各カテゴリ 1つだけ採用
    let usedDress = false;
    let chosenDress = "";
    if (O.dress.length && Math.random() < 0.35) {
      chosenDress = pickOne(O.dress);
      if (chosenDress) { parts.push(chosenDress); usedDress = true; }
    } else {
      if (O.top.length) parts.push(pickOne(O.top));
      let bottomPool = [];
      if (O.pants.length && O.skirt.length) bottomPool = (Math.random() < 0.5) ? O.pants : O.skirt;
      else if (O.pants.length) bottomPool = O.pants;
      else if (O.skirt.length) bottomPool = O.skirt;
      if (bottomPool.length) parts.push(pickOne(bottomPool));
    }
    if (O.shoes.length) parts.push(pickOne(O.shoes));

    // --- 服色の付与（この段階ではプレースホルダ） ---
    if (usedDress) {
      const RE_ONE = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|witch\s+outfit|idol\s+costume|stage\s+costume)\b/i;
      if (PC.top && chosenDress) {
        const noun = (chosenDress.match(RE_ONE)?.[1] || "").toLowerCase();
        if (noun) parts.push(`${PC.top} ${noun}`);
      }
    } else {
      if (PC.top)    parts.push(`${PC.top} top`);
      if (PC.bottom) parts.push(`${PC.bottom} bottom`);
    }
    if (PC.shoes) parts.push(`${PC.shoes} shoes`);

    // --- アクセ/シーン ---
    if (acc.length)  parts.push(...acc);
    if (bgs.length)  parts.push(pickOne(bgs));
    if (poses.length)parts.push(pickOne(poses));
    if (comps.length)parts.push(pickOne(comps));
    if (views.length)parts.push(pickOne(views));
    if (!comps.length) parts.push("centered composition");

    // --- 表情（SFW/NSFW 切替）---
    if (nsfwOn && nsfwExpr.length){
      parts.push(pickOne(nsfwExpr));
    } else {
      parts.push(exprs.length ? pickOne(exprs) : "neutral expression");
    }

    // --- ライティング（SFW/NSFW をまとめて 1 個に統一） ---
    if (lights.length) parts.push(pickOne(lights));
    if (nsfwOn && nsfwLite.length) parts.push(pickOne(nsfwLite));

    // --- NSFW：露出/シチュ + 追加6カテゴリ（各1）---
    if (nsfwOn && nsfwExpo.length)   parts.push(pickOne(nsfwExpo));
    if (nsfwOn && nsfwSitu.length)   parts.push(pickOne(nsfwSitu));
    if (nsfwOn && nsfwPose.length)   parts.push(pickOne(nsfwPose));
    if (nsfwOn && nsfwAcc.length)    parts.push(pickOne(nsfwAcc));
    if (nsfwOn && nsfwOutfit.length) parts.push(pickOne(nsfwOutfit));
    if (nsfwOn && nsfwBody.length)   parts.push(pickOne(nsfwBody));
    if (nsfwOn && nsfwNip.length)    parts.push(pickOne(nsfwNip));
    if (nsfwOn && nsfwUnder.length)  parts.push(pickOne(nsfwUnder));

    // --- 整合処理（順序が重要） ---
    let all = (Array.isArray(fixedArr) ? fixedArr : []).concat(parts).filter(Boolean);

    if (nsfwOn && !all.includes("NSFW")) all.unshift("NSFW");

    if (typeof applyNudePriority === 'function')           all = applyNudePriority(all);
    if (typeof enforceOnePieceExclusivity === 'function')  all = enforceOnePieceExclusivity(all);

    const hasExposure = nsfwOn && (
      (typeof hasExposureLike === 'function' && hasExposureLike(all)) ||
      all.some(t => EXPOSURE_EXCLUSIVE_RE.test(String(t)))
    );

    if (hasExposure) {
      all = all.filter(s =>
        !CLOTH_NOUN_RE.test(String(s)) &&
        !SHOES_RE.test(String(s)) &&
        !COLOR_PLACE_RE.test(String(s)) &&
        !(COLOR_WORD_RE.test(String(s)) && !/\s/.test(String(s)))
      );
    } else {
      all = ensureSingleWearPerRow(all);
      if (typeof pairWearColors === 'function') all = pairWearColors(all);
      all = removeWearPlaceholders(all);
    }

    all = enforceSingleBackground(all);
    all = unifyLightingOnce(all);

    if (typeof stripMultiHints === 'function') all = stripMultiHints(all);
    if (typeof forceSoloPos === 'function')    all = forceSoloPos(all);

    if (typeof fixExclusives === 'function')     all = fixExclusives(all);
    if (typeof ensurePromptOrder === 'function') all = ensurePromptOrder(all);
    if (typeof enforceHeadOrder === 'function')  all = enforceHeadOrder(all);

    if (nsfwOn && typeof ensureNSFWHead === 'function') {
      all = ensureNSFWHead(all);
    } else if (nsfwOn) {
      const idx = all.indexOf("NSFW");
      if (idx > 0){ all.splice(idx,1); all.unshift("NSFW"); }
    }

    const seed = (seedMode === "fixed")
      ? baseSeed
      : ((typeof seedFromName === 'function')
          ? seedFromName(((typeof $==='function' && $("#charName")) ? $("#charName").value : "") || "", i)
          : 0);

    return { seed, pos: all, neg: (typeof withSoloNeg==='function' ? withSoloNeg(neg) : neg) };
  };

  // ユニーク優先生成
  while (out.length < n && guard < n * 400) {
    guard++;
    const r = makeOne(out.length + 1);
    const key = (Array.isArray(r.pos) ? r.pos.join("|") : "") + "|" + String(r.seed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  while (out.length < n) out.push(makeOne(out.length + 1)); // フォールバック

  return out;
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

  // ← ここでは “服系のバインド” は呼ばない（UIがまだ無い）

  loadDefaultDicts().then(()=>{
    // 1) 辞書ロード後にUIを描画
    renderSFW();                    // 量産タブの p_outfit_* / p_bg などもここで生成
    window.__SFW_RENDERED = true;

    // 2) 服まわりの補助バインドは描画後に
    bindBottomCategoryGuess();      // （クリックで __bottomCat 推定）
    bindBottomCategoryRadios();     // ← 移動：radio 生成後にバインド
    fillAccessorySlots();

    // 3) NSFWリストや各種ピッカー
    renderNSFWLearning();
    renderNSFWProduction();
    initHairEyeAndAccWheels();

    // 4) カラーホイール（基本／量産）
    initColorWheel("top",     35, 80, 55);
    initColorWheel("bottom", 210, 70, 50);
    initColorWheel("shoes",    0,  0, 30);
    initColorWheel("p_top",    35, 80, 55);
    initColorWheel("p_bottom",210, 70, 50);
    initColorWheel("p_shoes",   0,  0, 30);

    initSkinTone();
    initNSFWStatusBadge();
    initCopyTripletAllModes();

    // 5) 量産タブのイベント等はUIが揃ってから
    bindProduction();               // ← 移動：renderSFW 後に実行
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
