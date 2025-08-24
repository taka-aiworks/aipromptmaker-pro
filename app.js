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
    n_expr:[], n_expo:[], n_situ:[], n_light:[],
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

    nsfw_expr:  new Set((NSFW.expression||[]).map(x=>x.tag||x)),
    nsfw_expo:  new Set((NSFW.exposure||[]).map(x=>x.tag||x)),
    nsfw_situ:  new Set((NSFW.situation||[]).map(x=>x.tag||x)),
    nsfw_light: new Set((NSFW.lighting||[]).map(x=>x.tag||x)),
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

    if (S.nsfw_expr.has(t))  { buckets.n_expr.push(t);  continue; }
    if (S.nsfw_expo.has(t))  { buckets.n_expo.push(t);  continue; }
    if (S.nsfw_situ.has(t))  { buckets.n_situ.push(t);  continue; }
    if (S.nsfw_light.has(t)) { buckets.n_light.push(t); continue; }

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

// 学習用ネガ統合（ソロ強制の既存処理に追記）
function getNegLearn(){
  const extra = (document.getElementById('learn_neg')?.value||"").trim();
  return buildNegative(extra);
}


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
  // 空文字("")は有効。undefined/nullだけ除外したいので ?? を使う
  const tag   = x.tag ?? x.en ?? x.keyword ?? x.value ?? x.name;
  const ja    = x.ja || x.jp || x["name_ja"] || x["label_ja"] || x.desc || x.label;
  const label = (ja && String(ja).trim()) ? String(ja).trim() : (tag || "");
  const level = (x.level || "L1").toUpperCase();
  return (tag === undefined || tag === null) ? null : { tag: String(tag), label, level };
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
  const L = normList(list||[]);
  const has = (t, re) => re.test(t.tag);
  const top = L.filter(t => /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer|puffer\ jacket|parka|windbreaker|raincoat)\b/i.test(t.tag));
  const pants = L.filter(t=> has(t, /\b(jeans|pants|trousers|shorts|cargo pants|leggings|overalls|bermuda shorts)\b/i));
  const skirt = L.filter(t=> has(t, /\b(skirt|pleated skirt|long skirt|hakama)\b/i));
  const dress = L.filter(t => /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita dress|kimono dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|nurse\s+uniform|tracksuit|sportswear|jersey|robe|poncho|cape|witch\s+outfit|idol\s+costume|stage\s+costume)\b/i.test(t.tag));
  const shoes = L.filter(t => /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori|thigh-high\ socks|knee-high\ socks)\b/i.test(t.tag));
   return { top, pants, skirt, dress, shoes }; // ← 追加
}

function normNSFW(ns) {
  // --- 新: nsfw_tags 形式を吸収 ---
  if (ns?.nsfw_tags) {
    const m = ns.nsfw_tags;
    const pack = (arr, lv) => (arr || []).map(t => ({ tag: String(t), label: String(t), level: lv }));
    // とりあえず “カテゴリー未分割” のフラットなタグなので、situation に寄せる（UI で使えるようになる）
    const situation = [
      ...pack(m.R15,  "L1"),
      ...pack(m.R18,  "L2"),
      ...pack(m.R18G, "L3"),
    ];
    // ライティング/表情/露出は空のまま
    return {
      expression: [],
      exposure:   [],
      situation,
      lighting:   [],
      // ここでは NEGATIVE_* は触らない（必要なら getNeg に統合する）
    };
  }

  // --- 従来: categories or 直接キー形式 ---
  const src = (ns && ns.categories) ? ns.categories : (ns || {});
  const JP2EN = { "表情":"expression", "露出":"exposure", "シチュ":"situation", "ライティング":"lighting" };
  const keys = ["expression","exposure","situation","lighting"];
  const out = {};
  keys.forEach(k=>{
    const jpKey = Object.keys(JP2EN).find(j=>JP2EN[j]===k);
    out[k] = normList(src[k] || (jpKey ? src[jpKey] : []) || []);
  });
  return out;
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


function mergeIntoNSFW(json) {
  const src = json?.NSFW ? normNSFW(json.NSFW) : normNSFW(json);
  NSFW = {
    expression: dedupeByTag([...(NSFW.expression||[]), ...src.expression]),
    exposure:   dedupeByTag([...(NSFW.exposure||[]),   ...src.exposure]),
    situation:  dedupeByTag([...(NSFW.situation||[]),  ...src.situation]),
    lighting:   dedupeByTag([...(NSFW.lighting||[]),   ...src.lighting]),
  };
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

// 追加：学習用ホワイトリスト（必要ならここを編集）
// 学習モードで使う最小・安定セット
const SCOPE = {
  learning: {
    // 背景：単色/スタジオ系のみに絞る（屋外や雑多小物を排除）
    background: [
      "plain background", "white background", "solid background",
      "studio background", "light gray background"
    ],
    // ポーズ：骨格崩れが出にくい静的中心（手は少しだけ見せる）
    pose: [
      "standing", "sitting",
      "hands on hips", "crossed arms", "hand on chest"
    ],
    // 構図：距離3種＋ポートレート。センタリングを常に許容
    composition: [
      "full body", "waist up", "bust", "portrait",
      "centered composition"
    ],
    // 視点：正面・3/4 を基軸。横/後ろは少量、極端角度は外す
    view: [
      "front view", "three-quarters view",
      "side view", "back view"
    ],
    // 表情：個性重視、極端は外す（涙は1段だけ許容）
    expressions: [
      "neutral expression", "smiling", "smiling open mouth",
      "serious", "determined",
      "slight blush", "surprised (mild)", "pouting (slight)",
      "teary eyes"
    ],
    // ライティング：安定光中心。ドラマチックは控えめに残す
    lighting: [
      "normal lighting", "even lighting", "soft lighting",
      "window light", "overcast", "natural lighting",
      "studio lighting", "backlighting"
    ]
  }
};

// 追加：タグ配列をホワイトリストで絞る共通関数
function filterByScope(items, allow) {
  if (!Array.isArray(items)) return [];
  if (!Array.isArray(allow) || allow.length === 0) return items;
  const s = new Set(allow);
  return items.filter(x => s.has(x.tag));
}



/* ===========================================================
 * 単語モード JS（辞書→UI描画、テーブル追加、コピー、保存）
 * 依存：対応するHTML & CSS。辞書は既存の SFW/NSFW をそのまま参照。
 * 保存：localStorage "wm_rows_v1" に {jp,en,cat} の配列で保存。
 * 仕様：辞書の文字列は変換しない（キー名やプロパティ名の“受け口”だけ用意）
 * =========================================================== */
(function(){
  // ---- lazy init：初回に「単語」タブへ切り替わった時だけ描画 ----
  let initialized = false;

  document.addEventListener('DOMContentLoaded', () => {
    const tab = document.querySelector('.tab[data-mode="word"]');
    if (!tab) return;
    tab.addEventListener('click', async () => {
      if (!initialized) {
        initialized = true;
        await initWordMode();
      }
    });
    if (tab.classList.contains('active')) {
      initialized = true;
      initWordMode();
    }
  });

  async function initWordMode(){
    const panel = document.getElementById('panelWordMode');
    if (!panel) return;

    const MAX_ROWS = 20;
    const LS_KEY = "wm_rows_v1";

    // ---- DOM refs ----
    const elItems = {
      background:        document.getElementById('wm-items-background'),
      pose:              document.getElementById('wm-items-pose'),
      composition:       document.getElementById('wm-items-composition'),
      view:              document.getElementById('wm-items-view'),
      'expression-sfw':  document.getElementById('wm-items-expression-sfw'),
      'lighting-sfw':    document.getElementById('wm-items-lighting-sfw'),
      world:             document.getElementById('wm-items-world'),
      personality:       document.getElementById('wm-items-personality'),
      relationship:      document.getElementById('wm-items-relationship'),
      accessories:       document.getElementById('wm-items-accessories'),   // ← 追加

      'expression-nsfw': document.getElementById('wm-items-expression-nsfw'),
      exposure:          document.getElementById('wm-items-exposure'),
      situation:         document.getElementById('wm-items-situation'),
      'lighting-nsfw':   document.getElementById('wm-items-lighting-nsfw'),

      color:             document.getElementById('wm-items-color'),
    };

    const elCounts = {
      background:        document.getElementById('wm-count-background'),
      pose:              document.getElementById('wm-count-pose'),
      composition:       document.getElementById('wm-count-composition'),
      view:              document.getElementById('wm-count-view'),
      'expression-sfw':  document.getElementById('wm-count-expression-sfw'),
      'lighting-sfw':    document.getElementById('wm-count-lighting-sfw'),
      world:             document.getElementById('wm-count-world'),
      personality:       document.getElementById('wm-count-personality'),
      relationship:      document.getElementById('wm-count-relationship'),
      accessories:       document.getElementById('wm-count-accessories'),   // ← 追加

      'expression-nsfw': document.getElementById('wm-count-expression-nsfw'),
      exposure:          document.getElementById('wm-count-exposure'),
      situation:         document.getElementById('wm-count-situation'),
      'lighting-nsfw':   document.getElementById('wm-count-lighting-nsfw'),

      color:             document.getElementById('wm-count-color'),
    };

    const tplItem = document.getElementById('wm-item-tpl');
    const tplItemColor = document.getElementById('wm-item-tpl-color');
    const tplRow = document.getElementById('wm-row-tpl');

    const tblBody = document.getElementById('wm-table-body');
    const btnCopyENAll = document.getElementById('wm-copy-en-all');
    const btnCopyBothAll = document.getElementById('wm-copy-both-all');
    const btnTableClear = document.getElementById('wm-table-clear');

    const chipArea = document.getElementById('wm-selected-chips');
    const chipCount = document.getElementById('wm-selected-count');
    const btnSelectedClear = document.getElementById('wm-selected-clear');

    // ---- Clipboard helper ----
    async function copyText(text){
      try {
        await navigator.clipboard.writeText(text);
        flashOK();
      } catch(e){
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        flashOK();
      }
    }
    function flashOK(){
      panel.style.boxShadow = "0 0 0 2px rgba(120,200,255,.35) inset";
      setTimeout(()=> panel.style.boxShadow = "", 180);
    }

    // =========================================================
    // ここから：辞書の“受け口”だけを用意（内容は加工しない）
    // =========================================================
    async function loadFallbackJSON(path){
      try{
        const r = await fetch(path, {cache:"no-store"});
        if(!r.ok) throw new Error('bad status');
        return await r.json();
      }catch(_){ return null; }
    }
    function firstNonNull(...vals){ return vals.find(v => v != null); }
    function sniffGlobalDict(nameCandidates){
      for (const key of nameCandidates){
        const obj = getByPath(window, key);
        if (obj && typeof obj === 'object') return obj;
      }
      return null;
    }
    function getByPath(root, path){
      const parts = path.split('.');
      let cur = root;
      for (const p of parts){
        if (!cur) return null;
        cur = cur[p];
      }
      return cur;
    }
    function normalizeEntries(arr){
      return (Array.isArray(arr) ? arr : []).map(x => ({
        ja: firstNonNull(x.ja, x.jp, x.label, x.name, ""),
        en: firstNonNull(x.en, x.tag, x.value, ""),
        level: x.level
      })).filter(o => o.ja && o.en);
    }
    function pickCat(dict, ...names){
      for (const n of names){
        if (dict && Array.isArray(dict[n])) return dict[n];
      }
      return [];
    }
    function pickNSFW(ns, key){
      if (!ns) return [];
      const fromCat = ns.categories && Array.isArray(ns.categories[key]) ? ns.categories[key] : null;
      const flat    = Array.isArray(ns[key]) ? ns[key] : null;
      return firstNonNull(fromCat, flat, []);
    }

    async function getWordModeDict(){
      const sfwRaw = sniffGlobalDict([
        'SFW','sfw','DICT_SFW','dictSfw','app.dict.sfw','APP_DICT.SFW'
      ]);
      const nsfwRaw = sniffGlobalDict([
        'NSFW','nsfw','DICT_NSFW','dictNsfw','app.dict.nsfw','APP_DICT.NSFW'
      ]);

      const sfw = sfwRaw || await loadFallbackJSON('dict/default_sfw.json') || {};
      const nsfw = nsfwRaw || await loadFallbackJSON('dict/default_nsfw.json') || {};

      const sfwTop = sfw.sfw || sfw.SFW || sfw;
      const nsfwTop= nsfw.nsfw|| nsfw.NSFW|| nsfw;

      const out = {
        sfw: {
          background:   normalizeEntries(pickCat(sfwTop, 'background')),
          pose:         normalizeEntries(pickCat(sfwTop, 'pose')),
          composition:  normalizeEntries(pickCat(sfwTop, 'composition')),
          view:         normalizeEntries(pickCat(sfwTop, 'view')),
          expression:   normalizeEntries(pickCat(sfwTop, 'expression','expressions')),
          lighting:     normalizeEntries(pickCat(sfwTop, 'lighting')),
          world:        normalizeEntries(pickCat(sfwTop, 'world','worldview')),
          personality:  normalizeEntries(pickCat(sfwTop, 'personality')),
          relationship: normalizeEntries(pickCat(sfwTop, 'relationship')),
          accessories:  normalizeEntries(pickCat(sfwTop, 'accessories','accessory')), // ← 追加
          color:        normalizeEntries(pickCat(sfwTop, 'color','colors'))
        },
        nsfw: {
          expression: normalizeEntries(pickNSFW(nsfwTop, 'expression')),
          exposure:   normalizeEntries(pickNSFW(nsfwTop, 'exposure')),
          situation:  normalizeEntries(pickNSFW(nsfwTop, 'situation')),
          lighting:   normalizeEntries(pickNSFW(nsfwTop, 'lighting')),
        }
      };
      return out;
    }

    // ---- Build UI ----
    async function renderAll(){
      const dict = await getWordModeDict();

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
      fillCat('accessories', dict.sfw.accessories);        // ← 追加

      // NSFW
      fillCat('expression-nsfw', dict.nsfw.expression);
      fillCat('exposure', dict.nsfw.exposure);
      fillCat('situation', dict.nsfw.situation);
      fillCat('lighting-nsfw', dict.nsfw.lighting);

      // Color（SFW側の colors が正式。color に書かれていても拾う）
      fillCat('color', dict.sfw?.colors || dict.sfw?.color || [], true);

      restoreRows();
      updateSelectedView();
    }

    function fillCat(catKey, items, isColor=false){
      const host = elItems[catKey];
      if (!host) return;
      host.innerHTML = "";
      const useTpl = isColor ? tplItemColor : tplItem;
      (items || []).forEach(obj=>{
        const jp = obj.ja || obj.jp || "";
        const en = obj.en || "";
        if (!jp || !en) return;

        const node = useTpl.content.firstElementChild.cloneNode(true);
        node.dataset.en = en;
        node.dataset.jp = jp;
        node.dataset.cat = catKey;

        node.querySelector('.wm-jp').textContent = jp;
        node.querySelector('.wm-en').textContent = en;

        node.addEventListener('click', (ev)=>{
          if (ev.target.closest('.wm-actions')) return;
          addRow({jp, en, cat:catKey});
        });

        const bEn = node.querySelector('.wm-copy-en');
        if (bEn) bEn.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          copyText(en);
        });

        const bBoth = node.querySelector('.wm-copy-both');
        if (bBoth) bBoth.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          copyText(`${jp} (${en})`);
        });

        host.appendChild(node);
      });

      if (elCounts[catKey]) elCounts[catKey].textContent = String(items.length || 0);
    }

    // ---- Table ops ----
    function currentRows(){
      const rows = [];
      tblBody.querySelectorAll('tr').forEach(tr=>{
        rows.push({
          jp: tr.querySelector('.wm-row-jp')?.textContent || "",
          en: tr.dataset.en || tr.querySelector('.wm-row-en')?.textContent || "",
          cat: tr.dataset.cat || ""
        });
      });
      return rows;
    }
    function hasRow(en){
      return !!tblBody.querySelector(`tr[data-en="${cssEscape(en)}"]`);
    }
    function addRow(item){
      if (!item || !item.en) return;
      if (hasRow(item.en)) return;
      const rows = currentRows();
      if (rows.length >= MAX_ROWS) { flashOK(); return; }

      const tr = tplRow.content.firstElementChild.cloneNode(true);
      tr.dataset.en = item.en;
      tr.dataset.cat = item.cat || "";
      tr.querySelector('.wm-row-jp').textContent = item.jp || "";
      tr.querySelector('.wm-row-en').textContent = item.en || "";

      tr.querySelector('.wm-row-copy-en').addEventListener('click', ()=> copyText(item.en));
      tr.querySelector('.wm-row-copy-both').addEventListener('click', ()=> copyText(`${item.jp} (${item.en})`));
      tr.querySelector('.wm-row-remove').addEventListener('click', ()=>{
        tr.remove(); persistRows(); updateSelectedView();
      });

      tblBody.appendChild(tr);
      persistRows();
      updateSelectedView();
    }
    function persistRows(){
      const rows = currentRows();
      try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch(e){}
    }
    function restoreRows(){
      try {
        const s = localStorage.getItem(LS_KEY);
        if (!s) return;
        const rows = JSON.parse(s);
        rows.forEach(addRow);
      } catch(e){}
    }
    function clearRows(){
      tblBody.innerHTML = "";
      persistRows();
      updateSelectedView();
    }
    function copyAllEN(){
      const tags = currentRows().map(r=>r.en).filter(Boolean);
      if (!tags.length) return;
      copyText(tags.join(", "));
    }
    function copyAllBoth(){
      const lines = currentRows().map(r=>`${r.jp} (${r.en})`).filter(Boolean);
      if (!lines.length) return;
      copyText(lines.join("\n"));
    }

    // ---- Selected chips ----
    function updateSelectedView(){
      const rows = currentRows();
      chipCount.textContent = String(rows.length);
      chipArea.innerHTML = "";
      rows.forEach(r=>{
        const chip = document.createElement('span');
        chip.className = "wm-chip";
        chip.innerHTML = `<span>${escapeHTML(r.jp)}</span> <small>${escapeHTML(r.en)}</small> <span class="x" title="削除">×</span>`;
        chip.querySelector('.x').addEventListener('click', ()=>{
          const tr = tblBody.querySelector(`tr[data-en="${cssEscape(r.en)}"]`);
          if (tr) tr.remove();
          persistRows(); updateSelectedView();
        });
        chipArea.appendChild(chip);
      });
    }

    // ---- Utils ----
    function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    function cssEscape(s){ return String(s).replace(/"/g, '\\"'); }

    // ---- Global buttons ----
    btnCopyENAll?.addEventListener('click', copyAllEN);
    btnCopyBothAll?.addEventListener('click', copyAllBoth);
    btnTableClear?.addEventListener('click', clearRows);
    btnSelectedClear?.addEventListener('click', clearRows);

    // ---- Render now ----
    await renderAll();
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

// === 共通：基本情報（固定）を配列で返す ===
// 固定/ネガ（撮影モード用）
function pmGetFixed(){
  // 既存の固定タグ入力欄
  const base = (document.getElementById('pl_fixed')?.value||'')
    .split(',').map(s=>s.trim()).filter(Boolean);

  // Basicタブの服選択（チップ）を読むユーティリティ（ローカル）
  const pickChip = (id) => {
    const el = document.querySelector(`#${id} input[type="radio"]:checked`);
    return el ? String(el.value||'').trim() : '';
  };

  // Basicタブの状態
  const isOnepiece = document.getElementById('outfitModeDress')?.checked;
  const topName    = pickChip('outfit_top');      // 例: "t-shirt"
  const pantsName  = pickChip('outfit_pants');    // 例: "shorts"
  const skirtName  = pickChip('outfit_skirt');    // 例: "skirt"
  const dressName  = pickChip('outfit_dress');    // 例: "one-piece dress"

  // 色タグ（スウォッチのテキスト）
  const readTag = (id) => (document.getElementById(id)?.textContent||'').trim();
  const topColor    = readTag('tag_top');
  const bottomColor = readTag('tag_bottom');
  const shoesColor  = readTag('tag_shoes');

  const out = [...base];

  // 服の「実名」をここで入れる（←これが無いと色と合体できない）
  if (isOnepiece) {
    if (dressName) out.push(dressName);
  } else {
    if (topName) out.push(topName);
    // どちらのカテゴリが有効かは UI 側の選択に依存。両方未選択なら何も入らない
    const bottomName = document.getElementById('bottomCat_skirt')?.checked ? skirtName : pantsName;
    if (bottomName) out.push(bottomName);
  }

  // 色タグは generic 名詞付きで入れる（pairWearColors がここを見て結合）
  if (topColor && topColor !== '—')        out.push(`${topColor} top`);
  if (!isOnepiece && bottomColor && bottomColor !== '—') out.push(`${bottomColor} bottom`);
  if (shoesColor && shoesColor !== '—')    out.push(`${shoesColor} shoes`);

  return out.filter(Boolean);
}

// 単一選択スキャフォルド（scroller内で data-checked のチップのテキストを取る）
function _selectedChipText(rootSel){
  const root = document.querySelector(rootSel);
  if (!root) return '';
  const chip = root.querySelector('.chip[data-checked="true"], .chip.is-checked');
  // チップの表示テキスト（タグ文字列）を採用
  return (chip?.textContent || '').trim();
}

function pmGetNeg(){
  const useDef = document.getElementById('pl_useDefaultNeg')?.checked;
  const base   = useDef ? NEG_TIGHT.join(", ") : "";
  const extra  = (document.getElementById('pl_neg')?.value||"").trim();
  return buildNegative([base, extra].filter(Boolean).join(","));
}

/* 撮影モード NSFW（制限なし、レベル上限のみ） */
function pmRenderNSFWPlanner(){
  var on = pmChecked('pl_nsfw');
  var panel = pmById('pl_nsfwPanel');
  if (panel) panel.style.display = on ? '' : 'none';
  if (!on) return;

  var capEl = document.querySelector('input[name="pl_nsfwLevel"]:checked');
  var cap   = capEl ? capEl.value : 'L1';
  var order = {L1:1,L2:2,L3:3};
  function allow(lv){ return (order[lv||'L1'] || 1) <= (order[cap] || 1); }
  function lvl(x){ return {L1:'R-15',L2:'R-18',L3:'R-18G'}[x||'L1'] || 'R-15'; }

  var ns = pmNSFW();

  function chips(list, name){
    list = pmNormList(list);
    var i, o, html = [];
    for (i=0; i<list.length; i++){
      o = list[i] || {};
      if (!allow(o.level)) continue;
      var tg = String(o.tag||'').trim();
      var lb = String(o.label||tg).trim();
      if (!tg) continue;
      html.push(
        '<label class="chip">' +
          '<input type="radio" name="pl_nsfw_'+ name +'" value="'+ tg +'">' +
          lb + '<span class="mini"> '+ lvl(o.level) +'</span>' +
        '</label>'
      );
    }
    return html.join('');
  }

  var e;
  e = pmById('pl_nsfw_expr');  if (e) e.innerHTML  = chips(ns.expression, 'expr');
  e = pmById('pl_nsfw_expo');  if (e) e.innerHTML  = chips(ns.exposure,   'expo');
  e = pmById('pl_nsfw_situ');  if (e) e.innerHTML  = chips(ns.situation,  'situ');
  e = pmById('pl_nsfw_light'); if (e) e.innerHTML  = chips(ns.lighting,   'light');
}
function pmBindNSFWPlanner(){
  var tgl = pmById('pl_nsfw');
  if (tgl){ tgl.addEventListener('change', pmRenderNSFWPlanner); }
  var lv = document.querySelectorAll('input[name="pl_nsfwLevel"]');
  for (var i=0; i<lv.length; i++){ lv[i].addEventListener('change', pmRenderNSFWPlanner); }
}

/* 画面描画 */
function pmRenderPlanner(){
  var sfw = pmSFW();
  pmRenderRadios('pl_bg',    pmPickList(sfw, ['background','bg']),           { groupName:'pl_bg' });
  pmRenderRadios('pl_pose',  pmPickList(sfw, ['pose','poses']),              { groupName:'pl_pose', allowEmpty:true });
  pmRenderRadios('pl_comp',  pmPickList(sfw, ['composition','comp']),        { groupName:'pl_comp' });
  pmRenderRadios('pl_view',  pmPickList(sfw, ['view','views']),              { groupName:'pl_view' });
  pmRenderRadios('pl_expr',  pmPickList(sfw, ['expressions','expr']),        { groupName:'pl_expr' });
  pmRenderRadios('pl_light', pmPickList(sfw, ['lighting','light','lights']), { groupName:'pl_light' });

  pmRenderNSFWPlanner();
  pmRenderAcc();
}

/* 1件出力（置き換え版 + 靴ガード） */
function pmBuildOne(){
  var name = pmValById('charName');
  var seed = (typeof seedFromName === 'function') ? seedFromName(name,1) : 0;

  // ---- 基本情報 ----
  var base = [];
  if (name) base.push(name);

  var tmp;
  tmp = pmPickOne('bf_age');    if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_gender'); if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_body');   if (tmp) base.push(tmp);
  tmp = pmPickOne('bf_height'); if (tmp) base.push(tmp);
  tmp = pmPickOne('hairStyle'); if (tmp) base.push(tmp);   // 髪型
  tmp = pmPickOne('eyeShape');  if (tmp) base.push(tmp);   // 目の形

  tmp = pmTextById('tagH');     if (tmp) base.push(tmp);
  tmp = pmTextById('tagE');     if (tmp) base.push(tmp);
  tmp = pmTextById('tagSkin');  if (tmp) base.push(tmp);

  // ---- 差分（SFW） ----
  var bg    = pmPickOne('pl_bg')   || 'plain background';
  var pose  = pmPickOne('pl_pose') || '';
  var comp  = pmPickOne('pl_comp') || 'bust';
  var view  = pmPickOne('pl_view') || 'three-quarters view';
  var exprS = pmPickOne('pl_expr') || 'neutral expression';
  var liteS = pmPickOne('pl_light')|| 'soft lighting';

  // ---- NSFW ----
  var nsfwOn    = pmChecked('pl_nsfw');
  var nsfwExpr  = nsfwOn ? pmPickOne('pl_nsfw_expr')  : '';
  var nsfwExpo  = nsfwOn ? pmPickOne('pl_nsfw_expo')  : '';
  var nsfwSitu  = nsfwOn ? pmPickOne('pl_nsfw_situ')  : '';
  var nsfwLight = nsfwOn ? pmPickOne('pl_nsfw_light') : '';

  // 表情はNSFWを優先して置換
  var expr = nsfwOn && nsfwExpr ? nsfwExpr : exprS;
  var lite = nsfwOn && nsfwLight ? nsfwLight : liteS;

  // ---- アクセ ----
  var accName = pmValById('pl_accSel');
  var acc = '';
  if (accName){
    var color = pmGetAccColor ? pmGetAccColor() : '';
    acc = color ? (accName + ', ' + color) : accName;
  }

  // ---- 固定タグ ----
  var fixed = pmGetFixed();

  // ---- ひとまず全て積む ----
  var parts = []
    .concat(['solo'])
    .concat((typeof getGenderCountTag==='function') ? [(getGenderCountTag()||'')] : [])
    .concat(fixed)
    .concat(base)
    .concat([bg, pose, comp, view, expr, lite, acc]);

  if (nsfwOn){
    if (nsfwExpo) parts.push(nsfwExpo);
    if (nsfwSitu) parts.push(nsfwSitu);
  }

  // ---- 空除去 ----
  parts = parts.filter(Boolean);

  // === 服/露出の優先整理（色付けより先に実行） ===
  if (typeof applyNudePriority === 'function') parts = applyNudePriority(parts);
  if (typeof enforceOnePieceExclusivity === 'function') parts = enforceOnePieceExclusivity(parts);

  // === 露出系の時は通常服＆色プレースホルダを除去（辞書の色付き露出タグだけ残す） ===
  var EXPOSURE_EXCLUSIVE_RE = /\b(bikini|swimsuit|lingerie|micro_bikini|string_bikini|sling_bikini|wet_swimsuit|nipple[_\s]?cover[_\s]?bikini|crotchless[_\s]?swimsuit|bodypaint[_\s]?swimsuit|topless|bottomless|nude)\b/i;
  if (nsfwOn && parts.some(t => EXPOSURE_EXCLUSIVE_RE.test(String(t)))){
    var CLOTH_NOUN_RE  = /\b(top|bottom|skirt|pants|shorts|jeans|t-?shirt|shirt|blouse|sweater|hoodie|jacket|coat|dress|one[-\s]?piece|gown)\b/i;
    var COLOR_WORD_RE  = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\b/i;
    var COLOR_PLACE_RE = /\b(white|black|red|blue|green|azure|yellow|pink|purple|brown|beige|gray|grey|silver|gold|navy|teal|cyan|magenta|orange)\s+(top|bottom|skirt|pants|shorts|jeans|t-?shirt|shirt|blouse|sweater|hoodie|jacket|coat|dress|one[-\s]?piece|gown)\b/i;
    var FOOTWEAR_RE    = /\b(shoes|boots|sneakers|loafers|sandals|heels|mary janes|geta|zori)\b/i;

    parts = parts.filter(function(t){
      var s = String(t);
      if (CLOTH_NOUN_RE.test(s))  return false;       // 通常服名詞を落とす
      if (COLOR_PLACE_RE.test(s)) return false;       // 色+服のプレースホルダを落とす
      if (FOOTWEAR_RE.test(s))    return false;       // 露出時は靴も強制で落とす
      // 単独色（色だけのトークン）も外す
      if (COLOR_WORD_RE.test(s) && !/\s/.test(s)) return false;
      return true;
    });
    // 露出の色は辞書タグ（pl_nsfw_expo）に含まれている前提なので追記不要
  }

  // === 靴“勝手混入”防止（露出でない場合も評価） ===
  (function shoeGuard(){
    // 基本タブの「靴色を使う」チェック（無ければ false 扱いにしない＝undefined対策で !! せず参照）
    var useShoesFlag = document.getElementById('use_shoes') ? !!document.getElementById('use_shoes').checked : true;

    // 露出系フラグ（上で除去済みでも true/false は見ておく）
    var isExposure = parts.some(t => EXPOSURE_EXCLUSIVE_RE.test(String(t)));

    // 配列に靴の名詞があるか（色ペアリング前の素片も拾う）
    var HAS_FOOTWEAR_NOUN_RE = /\b(shoes|boots|sneakers|loafers|sandals|heels|mary janes|geta|zori)\b/i;
    var hasFootwearNoun = parts.some(t => HAS_FOOTWEAR_NOUN_RE.test(String(t)));

    // 靴らしきトークン（色付きや名詞部を含む）を検出
    var looksShoeToken = (s)=> /\b(?:[\w-]+\s+)?(?:shoes|boots|sneakers|loafers|sandals|heels|mary janes|geta|zori)\b/i.test(String(s));

    // 条件：露出系 or 靴色フラグOFF or 靴名詞が無い → 靴関連を一掃
    if (isExposure || !useShoesFlag || !hasFootwearNoun){
      parts = parts.filter(t => !looksShoeToken(t));
    }
  })();

  // === ここで初めて色ペアリング（通常服のみ影響） ===
  if (typeof pairWearColors === 'function') parts = pairWearColors(parts);

  // === 整理：SOLOガード/重複ヒント整理 ===
  if (typeof stripMultiHints === 'function') parts = stripMultiHints(parts);
  if (typeof forceSoloPos === 'function')    parts = forceSoloPos(parts);

  // === 排他 → 並び順 → 先頭固定 ===
  if (typeof fixExclusives === 'function')     parts = fixExclusives(parts);
  if (typeof ensurePromptOrder === 'function') parts = ensurePromptOrder(parts);
  if (typeof enforceHeadOrder === 'function')  parts = enforceHeadOrder(parts);

  // ---- ネガティブ ----
  var neg = (typeof withSoloNeg==='function') ? withSoloNeg(pmGetNeg()) : pmGetNeg();

  // ---- 戻り値（従来互換：配列で返す）----
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

/* ========= タブ切替 ========= */
/* function initTabs(){
  $$(".tab").forEach(t=> t.addEventListener("click", ()=>{
    $$(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    const m=t.dataset.mode;
    $("#panelBasic").hidden      = (m !== "basic");
    $("#panelPlanner").hidden    = (m !== "planner");   // ← 追加
    $("#panelLearning").hidden   = (m !== "learning");
    $("#panelProduction").hidden = (m !== "production");
    $("#panelSettings").hidden   = (m !== "settings");

    if (m === "planner") initPlannerOnce();             // ← 追加
  }));

  // 初期アクティブを強制クリック（状態反映）
  const active = $$(".tab.active")[0] || $$(".tab")[0];
  if (active) active.click();
}

/* ========= 辞書 I/O ========= */
function isNSFWDict(json){
  const j = json?.NSFW || json || {};
  return !!(
    j.categories ||
    j.expression || j.exposure || j.situation || j.lighting ||
    j["表情"] || j["露出"] || j["シチュ"] || j["ライティング"] ||
    j.nsfw_tags
  );
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
        renderNSFWProduction(); renderNSFWLearning();
        toast("NSFW辞書を追記しました");
      } else {
        mergeIntoSFW(json);
        renderSFW(); fillAccessorySlots();
        toast("SFW辞書を追記しました");
      }
    } catch { toast("辞書の読み込みに失敗（JSONを確認）"); }
    finally { e.target.value = ""; }
  });

  $("#btnExport")?.addEventListener("click", ()=>{
    const save = {
      __meta:{ app:"LoRA Prompt Maker", version:"1.0", exported_at:new Date().toISOString() },
      sfw:SFW, nsfw:NSFW, settings:Settings
    };
    dl("lora_prompt_maker_settings.json", JSON.stringify(save,null,2));
  });
}

/* ========= キャラ設定 I/O ========= */
function setRadio(name, value){
  const els = $$(`input[name="${name}"]`); let hit=false;
  els.forEach(el=>{ const ok=(el.value===String(value)); el.checked=ok; if(ok) hit=true; });
  return hit;
}
function setChecks(name, values){
  const set = new Set((values||[]).map(String));
  $$(`input[name="${name}"]`).forEach(el=> el.checked = set.has(el.value));
}
function setVal(sel, v){ const el=$(sel); if(el!=null && typeof v==="string") el.value=v; }
function setColorTag(tagSel, text){ const el=$(tagSel); if(el && text) el.textContent = text; }
function setSkinTone(v){
  if(typeof v!=="number") return;
  const inp=$("#skinTone"); if(!inp) return;
  const c=Math.max(0, Math.min(100, Math.round(v)));
  inp.value=c; inp.dispatchEvent(new Event("input",{bubbles:true}));
}
function applyLearnAccessoryPreset(obj){
  if(!obj) return;
  if(obj.tag){ const sel=$("#learn_acc"); if(sel) sel.value = obj.tag; }
  if(obj.color){ setColorTag("#tag_learnAcc", obj.color); }
}
function applyNSFWLearningPreset(p){
  if(!p) return;
  if(typeof p.on==="boolean"){ $("#nsfwLearn").checked=p.on; $("#nsfwLearnPanel").style.display=p.on?"":"none"; }
  if(p.level) setRadio("nsfwLevelLearn", p.level);
  renderNSFWLearning();
  if(p.selected){
    if(p.selected.expression) setChecks("nsfwL_expr", p.selected.expression);
    if(p.selected.exposure)   setChecks("nsfwL_expo", p.selected.exposure);
    if(p.selected.situation)  setChecks("nsfwL_situ", p.selected.situation);
  }
}

function applyCharacterPreset(cfg){
  // ===== 小ヘルパ（ローカル） =====
  const arrify = (v)=> Array.isArray(v) ? v : (v != null ? [v] : []);
  const uniq = (a)=> Array.from(new Set((a||[]).filter(Boolean)));
  const tagOf = (x)=> (typeof x === "string" ? x : (x && x.tag) ? x.tag : "");
  const toSet = (list)=> new Set((list||[]).map(tagOf));

  // ====== マスタ定義から分類セットを作る（HTMLに寄せる） ======
  // pose は新: SFW.pose / 旧: SFW.pose_composition のどちらでも組む
  const POSE = toSet(SFW.pose || SFW.pose_composition || []);
  const COMP = toSet(SFW.composition || []); // 構図
  const VIEW = toSet(SFW.view || []);        // 視点

  // ====== 文字列系 ======
  setVal("#charName",   cfg.charName || cfg.characterName || "");
  setVal("#loraTag",    cfg.loraTag  || cfg.lora || "");
  setVal("#fixedManual",cfg.fixed    || cfg.fixedTags || "");
  setVal("#negGlobal",  cfg.negative || cfg.negativeTags || "");

  // ====== 旧データ互換：pose_composition を分解して各バケツへ ======
  const legacy = arrify(cfg.pose_composition);
  const legacyPose = legacy.filter(t => POSE.has(String(t)));
  const legacyComp = legacy.filter(t => COMP.has(String(t)));
  const legacyView = legacy.filter(t => VIEW.has(String(t)));

  // ====== 構図(comp) ======
  {
    const fromNew   = arrify(cfg.comp);
    const fromAlt   = arrify(cfg.composition); // 互換キー
    const merged    = uniq([...fromNew, ...fromAlt, ...legacyComp]);
    setChecks("comp", merged);
  }

  // ====== 視点(view) ←★ここが出ていなかった原因の本命 ======
  {
    const fromNew = arrify(cfg.view);
    const merged  = uniq([...fromNew, ...legacyView]);
    setChecks("view", merged);
  }

  // ====== 形状（ラジオ） ======
  if (cfg.hairStyle) setRadio("hairStyle", String(cfg.hairStyle));
  if (cfg.eyeShape)  setRadio("eyeShape",  String(cfg.eyeShape));
  if (cfg.face)      setRadio("face",      String(cfg.face));
  if (cfg.skinBody)  setRadio("skinBody",  String(cfg.skinBody));
  if (cfg.artStyle)  setRadio("artStyle",  String(cfg.artStyle));

  // ====== 背景/表情/ライティング（学習タブのチェック群） ======
  if (cfg.background)   setChecks("bg",   arrify(cfg.background));
  if (cfg.expressions)  setChecks("expr", arrify(cfg.expressions));

  // ライティング：新キー lightLearn / 互換 lighting
  {
    const fromNew = arrify(cfg.lightLearn);
    const fromAlt = arrify(cfg.lighting);
    setChecks("lightLearn", uniq([...fromNew, ...fromAlt]));
  }

  // ====== ポーズ（チェック群） ======
  {
    const fromNew = arrify(cfg.pose);
    const merged  = uniq([...fromNew, ...legacyPose]);
    setChecks("pose", merged);
  }

  // ====== 色（髪/瞳/肌） ======
  if (cfg.hairColorTag) setColorTag("#tagH", String(cfg.hairColorTag));
  if (cfg.eyeColorTag)  setColorTag("#tagE", String(cfg.eyeColorTag));
  if (typeof cfg.skinTone === "number") setSkinTone(cfg.skinTone);

  // ====== 基本情報（bf_*) ======
  const bf = cfg.bf || {};
  if (bf.age)        setRadio("bf_age",    String(bf.age));
  if (bf.gender)     setRadio("bf_gender", String(bf.gender));
  if (bf.body)       setRadio("bf_body",   String(bf.body));
  if (bf.height)     setRadio("bf_height", String(bf.height));

  // dataset にも保持（必要なら）
  {
    const host = document.body || document.documentElement;
    if (host && host.dataset) {
      if (bf.age)        host.dataset.bfAge    = String(bf.age);
      if (bf.gender)     host.dataset.bfGender = String(bf.gender);
      if (bf.body)       host.dataset.bfBody   = String(bf.body);
      if (bf.height)     host.dataset.bfHeight = String(bf.height);
    }
  }

  // ====== outfit（分割&モード） ======
  const outf = cfg.outfit || cfg.outfitSel || cfg.outfits;
  if (typeof outf === "string") {
    if (isOnePieceOutfitTag(outf)) {
      setRadio("outfitMode", "onepiece");
      setRadio("outfit_dress", outf);
    } else {
      setRadio("outfitMode", "separate");
      setRadio("outfit_top", outf);
    }
  } else if (outf && typeof outf === "object") {
    const mode = outf.mode || "separate";
    setRadio("outfitMode", mode);

    if (mode === "onepiece") {
      if (outf.dress) setRadio("outfit_dress", String(outf.dress));
    } else {
      if (outf.top) setRadio("outfit_top", String(outf.top));
      const cat = (outf.bottomCat || "pants").toLowerCase();
      if (cat === "skirt") {
        setRadio("outfit_skirt", String(outf.bottom||""));
        __bottomCat = "skirt";
      } else {
        setRadio("outfit_pants", String(outf.bottom||""));
        __bottomCat = "pants";
      }
    }
    if (typeof window.__applyBottomCatSwap === 'function') window.__applyBottomCatSwap();
  }

  // ====== 学習用ウェア色 + ON/OFF ======
  const wc = cfg.wearColors || {};
  const wu = cfg.wearColorUse || {};
  const applyWear = (idBase, text, useOn) => {
    const useEl = (idBase === "bottom") ? document.getElementById("useBottomColor")
                                        : document.getElementById("use_"+idBase);
    if (useEl) useEl.checked = !!useOn;
    if (text)  setColorTag("#tag_"+idBase, String(text));
    updateWearPanelEnabled(idBase);
  };
  applyWear("top",    wc.top,    (wu.top    ?? !!wc.top));
  applyWear("bottom", wc.bottom, (wu.bottom ?? !!wc.bottom));
  applyWear("shoes",  wc.shoes,  (wu.shoes  ?? !!wc.shoes));

  // ====== 学習アクセ ======
  if (cfg.learnAccessory) applyLearnAccessoryPreset(cfg.learnAccessory);

  // ====== NSFW（学習） ======
  if (cfg.nsfwLearn) applyNSFWLearningPreset(cfg.nsfwLearn);

  // ====== 最後に依存更新 ======
  if (typeof updateOneTestReady === "function") updateOneTestReady();
  toast("キャラ設定を読み込みました");
}


function collectCharacterPreset(){
  const outfitSel = getBasicSelectedOutfit();

  return {
    // 基本
    charName: $("#charName")?.value || "",
    loraTag:  $("#loraTag")?.value  || "",
    fixed:    $("#fixedManual")?.value || "",
    negative: $("#negGlobal")?.value   || "",

    // 形状系
    hairStyle: getOne("hairStyle"),
    eyeShape:  getOne("eyeShape"),
    face:      getOne("face"),
    skinBody:  getOne("skinBody"),
    artStyle:  getOne("artStyle"),

    // シーン
    background:  getMany("bg"),
    pose: getMany("pose"),
    comp: getMany("comp"),
    view: getMany("view"),
    expressions: getMany("expr"),
    // ★ 追加：構図とライティング（学習タブ）
    comp:        getMany("comp"),
    lightLearn:  getMany("lightLearn"),

    // 色（髪/瞳/肌）
    hairColorTag: $("#tagH")?.textContent || "",
    eyeColorTag:  $("#tagE")?.textContent || "",
    skinTone: Number($("#skinTone")?.value || 0),

    // ★ 基本情報（bf_*）
    bf: {
      age:        getOne("bf_age"),
      gender:     getOne("bf_gender"),
      body:       getOne("bf_body"),
      height:     getOne("bf_height"),
      // personality:getOne("bf_person"),
      // tone:       getOne("bf_tone"),
    },

    // ★ outfit（分割&モード）
    outfit: {
      mode: outfitSel.mode,
      top: outfitSel.top || "",
      bottom: outfitSel.bottom || "",
      dress: outfitSel.dress || "",
      bottomCat: outfitSel.bottomCat || (__bottomCat || "pants")
    },

    // ★ 服カラー（学習タブの固定色）
    wearColors: {
      top:    getWearColorTag("top"),
      bottom: getWearColorTag("bottom"),
      shoes:  getWearColorTag("shoes")
    },
    wearColorUse: {
      top:    !!document.getElementById("use_top")?.checked,
      bottom: !!document.getElementById("useBottomColor")?.checked,
      shoes:  !!document.getElementById("use_shoes")?.checked
    },

    // アクセ（学習）
    learnAccessory:{ tag:$("#learn_acc")?.value||"", color:$("#tag_learnAcc")?.textContent||"" },

    // NSFW（学習）
    nsfwLearn:{
      on: $("#nsfwLearn")?.checked || false,
      level: (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1",
      selected: {
        expression: $$('input[name="nsfwL_expr"]:checked').map(x=>x.value),
        exposure:   $$('input[name="nsfwL_expo"]:checked').map(x=>x.value),
        situation:  $$('input[name="nsfwL_situ"]:checked').map(x=>x.value)
      }
    }
  };
}

function bindCharIO(){
  const input = document.getElementById("importChar");
  if (input) {
    input.addEventListener("change", async (e)=>{
      const f = e.target.files[0]; if (!f) return;
      try{ const json = JSON.parse(await f.text()); applyCharacterPreset(json); }
      catch{ toast("キャラ設定の読み込みに失敗（JSONを確認）"); }
      finally{ e.target.value=""; }
    });
  }
  $("#btnExportChar")?.addEventListener("click", ()=>{
    const preset = collectCharacterPreset();
    dl("character_preset.json", JSON.stringify(preset, null, 2));
    toast("キャラ設定をローカル（JSON）に保存しました");
  });
}


// === 学習用 NSFW ホワイトリスト（JSONと一致 & 学習向きだけ） ===
const NSFW_LEARN_SCOPE = {
  expression: [
    "aroused","flushed","embarrassed","seductive_smile",
    "half_lidded_eyes","bedroom_eyes","lip_bite"
  ],
  exposure: [
    "mild_cleavage","off_shoulder","bare_back","leggy",
    "garter_belt","thighhighs","lingerie","bikini",
    "wet_clothes","see_through","sideboob","underboob"
  ],
  situation: [
    "suggestive_pose","mirror_selfie","after_shower","towel_wrap",
    "in_bed_sheets","undressing","zipper_down","covered_nudity","censored_bars","massage_oil",
    "beach","poolside","sunbathing","swim_competition","waterpark",
    "shower_outdoor","changing_room","beach_night","foam_party",
    "private_pool","photoshoot_studio","after_party_suite"
  ],
  lighting: [
    "softbox","rim_light","backlit","window_glow","golden_hour",
    "neon","candlelight","low_key","hard_light","colored_gels",
    "film_noir","dappled_light","spotlight","moody"
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

function renderNSFWLearning(){
  // 学習は常にホワイトリスト＆R-18G遮断＋レベル上限
  const cap = (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1";
  const allowWL = (arr, name) => {
    const wl = new Set(NSFW_LEARN_SCOPE[name] || []);
    return normList(arr).filter(it =>
      wl.has(it.tag) && isLevelAllowedForLearn(cap, it.level)
    );
  };
  const chips = (arr,name)=> arr.map(o => {
    const lvlLabel = (o.level === "L2" ? "R-18" : "R-15"); // L3 はここまでに落ちている
    return `<label class="chip">
      <input type="checkbox" name="nsfwL_${name}" value="${o.tag}">
      ${o.label}<span class="mini"> ${lvlLabel}</span>
    </label>`;
  }).join("");

  $("#nsfwL_expr")  && ($("#nsfwL_expr").innerHTML  = chips(allowWL(NSFW.expression,"expression"), "expr"));
  $("#nsfwL_expo")  && ($("#nsfwL_expo").innerHTML  = chips(allowWL(NSFW.exposure,  "exposure"),   "expo"));
  $("#nsfwL_situ")  && ($("#nsfwL_situ").innerHTML  = chips(allowWL(NSFW.situation, "situation"),  "situ"));
  $("#nsfwL_light") && ($("#nsfwL_light").innerHTML = chips(allowWL(NSFW.lighting,  "lighting"),   "light"));
}

function getSelectedNSFW_Learn(){
  if (!$("#nsfwLearn").checked) return [];
  const cap = (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1";

  const picked = [
    ...$$('input[name="nsfwL_expr"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_expo"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_situ"]:checked').map(x=>x.value),
    ...$$('input[name="nsfwL_light"]:checked').map(x=>x.value)
  ];

  // ★ホワイトリスト最終適用＋レベル上限でフィルタ
  const idx = {
    expression: new Map(normList(NSFW.expression).map(o=>[o.tag,o])),
    exposure:   new Map(normList(NSFW.exposure).map(o=>[o.tag,o])),
    situation:  new Map(normList(NSFW.situation).map(o=>[o.tag,o])),
    lighting:   new Map(normList(NSFW.lighting).map(o=>[o.tag,o]))
  };

  const inWL = (tag)=>{
    return (
      NSFW_LEARN_SCOPE.expression.includes(tag) ||
      NSFW_LEARN_SCOPE.exposure.includes(tag)   ||
      NSFW_LEARN_SCOPE.situation.includes(tag)  ||
      NSFW_LEARN_SCOPE.lighting.includes(tag)
    );
  };

  const ok = [];
  for (const t of picked){
    if (!inWL(t)) continue;
    const meta = idx.expression.get(t) || idx.exposure.get(t) || idx.situation.get(t) || idx.lighting.get(t);
    if (!meta) continue;
    if (!isLevelAllowedForLearn(cap, meta.level)) continue; // L3遮断含む
    ok.push(t);
  }
  return uniq(ok);
}


function renderNSFWProduction(){
  const cap = document.querySelector('input[name="nsfwLevelProd"]:checked')?.value || "L1";
  const order = {L1:1,L2:2,L3:3};
  const allow = (lv)=> order[(lv||"L1")] <= order[cap];
  const lvl = (x)=>({L1:"R-15",L2:"R-18",L3:"R-18G"}[(x||"L1")] || "R-15");
  const filt = (arr)=> normList(arr).filter(x=> allow(x.level));
  $("#nsfwP_expr")  && ($("#nsfwP_expr").innerHTML  = filt(NSFW.expression).map(o=>`<label class="chip"><input type="checkbox" name="nsfwP_expr" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`).join(""));
  $("#nsfwP_expo")  && ($("#nsfwP_expo").innerHTML  = filt(NSFW.exposure).map(o=>`<label class="chip"><input type="checkbox" name="nsfwP_expo" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`).join(""));
  $("#nsfwP_situ")  && ($("#nsfwP_situ").innerHTML  = filt(NSFW.situation).map(o=>`<label class="chip"><input type="checkbox" name="nsfwP_situ" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`).join(""));
  $("#nsfwP_light") && ($("#nsfwP_light").innerHTML = filt(NSFW.lighting).map(o=>`<label class="chip"><input type="checkbox" name="nsfwP_light" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`).join(""));
}
function bindNSFWToggles(){
  $("#nsfwLearn")?.addEventListener("change", e=>{
    $("#nsfwLearnPanel").style.display = e.target.checked ? "" : "none";
    if(e.target.checked) renderNSFWLearning();
  });
  $$('input[name="nsfwLevelLearn"]').forEach(x=> x.addEventListener('change', ()=>{
    if ($("#nsfwLearn")?.checked) renderNSFWLearning();
  }));
  $$('input[name="nsfwLevelProd"]').forEach(x=> x.addEventListener('change', renderNSFWProduction));
  $("#nsfwProd")?.addEventListener("change", e=> $("#nsfwProdPanel").style.display = e.target.checked ? "" : "none");
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

// ④ 配分ルール（必要なら数値だけ調整してOK）
const MIX_RULES = {
  // 視点（横顔/背面は割合で、残りは 3/4 or 正面に後で丸める）
    view: {
    group: ["front view","three-quarters view","profile view","side view","back view"],
    targets: {
      "profile view":[0.15,0.20],
      "back view":[0.08,0.12]
    },
    fallback: "three-quarters view"
  },

  comp: {
    group: ["full body","waist up","upper body","bust","portrait","close-up","wide shot"],
    targets: {
      "full body":[0.20,0.25],
      "waist up":[0.30,0.35],
      "upper body":[0.05,0.10],   // 追加
      "bust":[0.20,0.25],
      "close-up":[0.05,0.10],     // 追加
      "wide shot":[0.05,0.10]     // 追加
    },
    fallback: "portrait"
  },

  // 表情（UIで選ばれた中だけから配分。未選択なら fallback=neutral）
expr: {
  group: [
    "neutral expression",
    "smiling",
    "smiling open mouth",
    "serious",
    "determined",
    "slight blush",
    "surprised (mild)",
    "pouting (slight)"
  ],
  // ★デフォルト配分（汎用SFW）
  targets: {
    "neutral expression": [0.55, 0.65],
    "smiling":            [0.18, 0.25],
    "smiling open mouth": [0.05, 0.10],
    "serious":            [0.01, 0.02],
    "determined":         [0.01, 0.02],
    "slight blush":       [0.03, 0.05]
    // "surprised (mild)" や "pouting (slight)" を使う時はここに追記してね（各 0.03–0.05 程度）
  },
  fallback: "neutral expression"
},

  // 背景（無地/スタジオを多め。bedroom は少し）
  bg: {
    group: ["plain background","studio background","solid background","white background","bedroom"],
    targets: {
      "plain background":[0.35,0.45]
      
    },
    fallback: "plain background"
  },

  // ライティング（安定寄り）
  light: {
    group: ["soft lighting","even lighting","normal lighting","window light","overcast"],
    targets: {
      "soft lighting":[0.35,0.45],
      "even lighting":[0.25,0.35],
      "normal lighting":[0.10,0.20]
    },
    fallback: "soft lighting"
  }
};

// EXPR_ALL はそのまま使う
const EXPR_ALL = new Set([
  ...Object.keys(MIX_RULES.expr.targets),
  MIX_RULES.expr.fallback
]);




function buildOneLearning(extraSeed = 0){
  // ===== 1) ベース構築 =====
  const fixed = assembleFixedLearning();

  // UI 取得（分離後のID）
  const BG = getMany("bg");          // 背景
  const PO = getMany("pose");        // ポーズ
  const CO = getMany("comp");        // 構図・距離
  const VI = getMany("view");        // 視点・アングル
  const EX = getMany("expr");        // 表情
  const LI = getMany("lightLearn");  // ライティング(学習)
  const addon = getSelectedNSFW_Learn?.() || [];

  // 1件ずつランダム選択（空なら ""）
  const b = pick(BG) || "";
  const p = pick(PO) || "";
  const c = pick(CO) || "";
  const v = pick(VI) || "";
  const e = pick(EX) || "";
  const l = LI.length ? pick(LI) : "";

  // 学習は常に1人
  const partsSolo = ["solo"];
  const genderCount = getGenderCountTag(); // "1girl" / "1boy" / ""
  if (genderCount) partsSolo.push(genderCount);

  // ここで comp と view も parts に入れる
  let parts = uniq([
    ...partsSolo, ...fixed,
    b, p, c, v, e, l,
    ...addon
  ]).filter(Boolean);

  // ===== 2) 服の整合・色置換など既存ルール =====
  parts = applyNudePriority(parts);
  parts = enforceOnePieceExclusivity(parts);
  parts = pairWearColors(parts);

  // ===== 3) 学習ノイズ除去 =====
  const NSFW_HARD_BLOCK_RE = /\b(blood(_splatter)?|injur(y|ies)|wound(ed)?|gore|gory|violence|torture)\b/i;
  const LEARN_NOISE_RE = /\b(crowd|group|multiple people|two people|three people|duo|trio|background people|lens flare|cinematic lighting|dramatic lighting|stage lighting|studio lighting|hdr|tilt-?shift|fisheye|wide-?angle|dutch angle|extreme close-?up|depth of field|strong bokeh|motion blur|watermark|signature|copyright|smartphone|phone|camera|microphone|mic|weapon|gun|sword|shield|staff|laptop|keyboard|headphones|backpack|bag|umbrella|drink|food|ice cream|skateboard)\b/i;

  parts = parts.filter(t => !NSFW_HARD_BLOCK_RE.test(String(t)));
  parts = parts.filter(t => !LEARN_NOISE_RE.test(String(t)));
  parts = stripMultiHints(parts);
  parts = forceSoloPos(parts);

  // ===== 4) 不足アンカーの補完（view も対象）=====
  const asText = parts.join(", ");

  // 視点：無ければ正面（フォールバック）
  const hasView = /\b(front view|three-quarters view|profile view|side view|back view|from below|overhead view|looking down|looking up|eye-level|low angle|high angle)\b/i
    .test(parts.join(", "));
  if (!hasView) parts.push("front view");

  // 背景
  if (!/\b(plain background|studio background|solid background)\b/i.test(asText)) {
    parts.push("plain background");
  }
  // 構図・距離（pose/comp どちらもヒットしなければ）
  if (!/\b(upper body|bust|waist up|portrait|full body)\b/i.test(asText)) {
    parts.push("upper body");
  }
  // 表情
  if (!/\b(neutral expression|smiling|serious|determined|slight blush|surprised \(mild\)|pouting \(slight\))\b/i.test(asText)) {
    parts.push("neutral expression");
  }
  // ライティング
  if (!/\b(soft lighting|even lighting|normal lighting)\b/i.test(asText)) {
    parts.push("soft lighting");
  }
  // 構図の安定化（中央寄せ）
  if (!/\b(center(ed)?\s?composition|centered composition)\b/i.test(asText)) {
    parts.push("centered composition");
  }

// ⑤ 排他・整形・シード（置き換え）
  // 1) 排他整理（あれば使う）
  if (typeof fixExclusives === 'function') {
    parts = fixExclusives(parts);
  }

  // 2) 一意化 → 並び順整形
  let pos = Array.from(new Set(parts.filter(Boolean)));
  if (typeof ensurePromptOrder === 'function') {
    pos = ensurePromptOrder(pos);
  }

  // 3) 先頭固定: solo と 1girl/1boy
  if (typeof enforceHeadOrder === 'function') {
    pos = enforceHeadOrder(pos);
  } else {
    const g = (typeof getGenderCountTag === 'function' ? (getGenderCountTag() || '') : '');
    const head = ['solo', g].filter(Boolean);
    pos = head.concat(pos.filter(t => !head.includes(t)));
  }

  // 4) Seed
  const seed = (typeof seedFromName === 'function')
    ? seedFromName((document.getElementById('charName')?.value || ''), extraSeed)
    : 0;

  // 5) ネガティブ（共通ビルダーへ集約）
  const EXTRA_NEG = ["props","accessories","smartphone","phone","camera"];
  const baseNeg = [
    (typeof getNeg === 'function' ? getNeg() : ""),
    ...EXTRA_NEG
  ].filter(Boolean).join(", ");
  const neg = (typeof buildNegative === 'function') ? buildNegative(baseNeg) : baseNeg;

  // 6) 戻り値
  return { seed, pos, neg, text: `${pos.join(", ")} --neg ${neg} seed:${seed}` };
}

// === 横顔の制御（学習用・割合ベース） =======================
// 横顔を全体の 15〜20% で混ぜたい場合

function enforceViewVariant(parts, viewTag){
  const RE_VIEW = /\b(front view|three-quarters view|profile view|side view|back view)\b/i;
  const out = [];
  for (const t of (parts||[])) {
    if (RE_VIEW.test(String(t))) continue; // 既存の視点タグを除去
    out.push(t);
  }
  if (viewTag) out.push(viewTag);
  return out;
}

// === 学習用：視点/構図/表情/背景/光の “割合ミキサー” =======================

// ① グループ内の既存タグを落として target を入れる（並び直し＋先頭固定まで面倒を見る）
function replaceGroupTag(parts, groupTags, targetTag){
  const RE = new RegExp("\\b(" + groupTags.map(t=>t.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")).join("|") + ")\\b","i");
  const out = [];
  for (const t of (parts||[])) { if (!RE.test(String(t))) out.push(t); }
  if (targetTag) out.push(targetTag);

  // 並び直し → 先頭固定
  let arranged = (typeof ensurePromptOrder==='function') ? ensurePromptOrder(out) : out;
  if (typeof enforceHeadOrder==='function') arranged = enforceHeadOrder(arranged);
  return arranged;
}

// ② n枚中、min..max 割合で k 枚をランダムに選んで tag を差し込む
function applyPercentForTag(rows, groupTags, targetTag, pctMin, pctMax){
  if (!Array.isArray(rows) || !rows.length) return;
  const n = rows.length;
  const ratio = pctMin + Math.random() * (pctMax - pctMin);
  const k = Math.max(1, Math.min(n, Math.round(n * ratio)));
  const idxs = [...Array(n)].map((_,i)=>i).sort(()=>Math.random()-0.5).slice(0,k);
  for (const i of idxs){
    rows[i].pos  = replaceGroupTag(rows[i].pos, groupTags, targetTag);
    // 念のためここでも頭固定
    if (typeof enforceHeadOrder==='function') rows[i].pos = enforceHeadOrder(rows[i].pos);
    rows[i].text = `${rows[i].pos.join(", ")} --neg ${rows[i].neg} seed:${rows[i].seed}`;
  }
}

function fillRemainder(rows, groupTags, fallbackTag){
  for (const r of rows){
    const hasAny = r.pos.some(t => groupTags.includes(String(t)));
    if (!hasAny){
      r.pos = replaceGroupTag(r.pos, groupTags, fallbackTag);
      if (typeof enforceHeadOrder==='function') r.pos = enforceHeadOrder(r.pos);
      r.text = `${r.pos.join(", ")} --neg ${r.neg} seed:${r.seed}`;
    }
  }
}



// ⑤ まとめ適用（学習バッチだけに適用）
function applyPercentMixToLearning(rule, selected) {
  // selected が空なら fallback 固定
  if (!selected || selected.length === 0) {
    return [rule.fallback];
  }

  // selected があるとき → groupから未選択は除外
  const group = rule.group.filter(g => selected.includes(g));

  // 全部外れてたら fallback
  if (group.length === 0) {
    return [rule.fallback];
  }

  // targets に設定があるものだけ確率で選ぶ
  const rand = Math.random();
  let acc = 0;
  for (const tag of group) {
    const [min, max] = rule.targets[tag] || [0, 0];
    const p = (min + max) / 2; // 平均で扱う（お好みで）
    acc += p;
    if (rand < acc) {
      return [tag];
    }
  }

  // 余ったら fallback
  return [rule.fallback];
}

/* ============================================================================
 * 学習モード一括生成（修正版・置き換え用）
 * 目的：
 *  1) 行ごとにユニーク優先で buildOneLearning を積み上げ、足りない分は重複許容で補完
 *  2) 生成後に「割合ミックス」適用（VIEW / COMP / EXP / BG / LIGHT）
 *  3) NSFWがONなら nsfwL_*（表情/露出/シチュ/光）を各カテゴリ1つだけ反映し、
 *     表情はSFW表情を確実に置換。露出が水着/下着/ヌード系なら服上下＋色プレースホルダを削除し、
 *     辞書にある色付きワードだけ残す。
 *  4) 最終整形：排他→一意化→並び順→先頭固定→NEG統一→seed/text同期
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

  // ③ 割合ミックス適用
  {
    const rows = out;
    applyPercentForTag(rows, MIX_RULES.view.group, "profile view", ...MIX_RULES.view.targets["profile view"]);
    applyPercentForTag(rows, MIX_RULES.view.group, "back view",    ...MIX_RULES.view.targets["back view"]);
    fillRemainder(rows, MIX_RULES.view.group, MIX_RULES.view.fallback);

    for (const [tag, rng] of Object.entries(MIX_RULES.comp.targets)) {
      applyPercentForTag(rows, MIX_RULES.comp.group, tag, rng[0], rng[1]);
    }
    fillRemainder(rows, MIX_RULES.comp.group, MIX_RULES.comp.fallback);

    const selExpr = getMany("expr") || [];
    const exprGroupBase = selExpr.length ? selExpr : MIX_RULES.expr.group;
    const exprGroup = Array.from(new Set([...exprGroupBase, "neutral expression"]));
    for (const [tag, rng] of Object.entries(MIX_RULES.expr.targets)) {
      if (!exprGroup.includes(tag)) continue;
      applyPercentForTag(rows, exprGroup, tag, rng[0], rng[1]);
    }
    fillRemainder(rows, exprGroup, MIX_RULES.expr.fallback);

    for (const [tag, rng] of Object.entries(MIX_RULES.bg.targets)) {
      applyPercentForTag(rows, MIX_RULES.bg.group, tag, rng[0], rng[1]);
    }
    fillRemainder(rows, MIX_RULES.bg.group, MIX_RULES.bg.fallback);

    for (const [tag, rng] of Object.entries(MIX_RULES.light.targets)) {
      applyPercentForTag(rows, MIX_RULES.light.group, tag, rng[0], rng[1]);
    }
    fillRemainder(rows, MIX_RULES.light.group, MIX_RULES.light.fallback);
  }

  // ③.5 NSFW整理
{
  const nsfwOn = !!document.querySelector("#nsfwLearn")?.checked;
  if (nsfwOn){
    const gExpr = getMany("nsfwL_expr")  || [];
    const gExpo = getMany("nsfwL_expo")  || [];
    const gSitu = getMany("nsfwL_situ")  || [];
    const gLight= getMany("nsfwL_light") || [];

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

      // --- 先に「選択済みの先頭1件」を決める（あれば）
      const chosenExpr  = gExpr.length  ? gExpr[0]  : "";
      const chosenExpo  = gExpo.length  ? gExpo[0]  : "";
      const chosenSitu  = gSitu.length  ? gSitu[0]  : "";
      const chosenLight = gLight.length ? gLight[0] : "";

      // --- 表情：SFW表情を全て外してから NSFW表情を1つ注入
      if (chosenExpr){
        const sfwExprGroup = Array.from(new Set([...(getMany("expr")||[]), ...MIX_RULES.expr.group, "neutral expression"]));
        p = p.filter(t => !sfwExprGroup.includes(t));    // SFW表情を除去
        if (!p.includes(chosenExpr)) p.push(chosenExpr); // NSFW表情を1つだけ
      }

      // --- 露出：服/色プレースホルダを先に排他 → 選んだ露出を必ず1つ入れる
      if (chosenExpo){
        // ヌード/露出優先（上下・色のプレースを除去する側の既存処理）
        p = applyNudePriority(p);
        p = enforceOnePieceExclusivity(p);

        // “bikini/lingerie/nude” 系を使うときは、通常服・色プレースは残さない
        const isExpoWear = /\b(bikini|lingerie|micro_bikini|string_bikini|sling_bikini|wet_swimsuit|nipple_cover_bikini|crotchless_swimsuit|bodypaint_swimsuit|topless|bottomless|nude)\b/i.test(chosenExpo);
        if (isExpoWear){
          // 服プレースホルダ
          p = p.filter(t => !/\b(top|bottom|skirt|pants|dress|t-?shirt)\b/i.test(t));
          // 色だけの単独タグ（辞書の色付きワードは残す想定）
          p = p.filter(t => !/\b(white|black|azure|red|blue|green|pink|yellow|purple|orange|brown|beige|silver|gold)\b/i.test(t));
        }

        if (!p.includes(chosenExpo)) p.push(chosenExpo); // 露出タグを注入（色付き辞書ならそのまま）
      } else {
        // 選ばれていない場合でも既存の複数が混在していたら1つに整理
        p = keepOneFrom(p, gExpo);
      }

      // --- シチュ/ライティング：各カテゴリ1つだけ入れる（足りなければ注入）
      if (chosenSitu){
        p = keepOneFrom(p, gSitu);
        if (!p.includes(chosenSitu)) p.push(chosenSitu);
      } else {
        p = keepOneFrom(p, gSitu);
      }

      if (chosenLight){
        p = keepOneFrom(p, gLight);
        if (!p.includes(chosenLight)) p.push(chosenLight);
      } else {
        p = keepOneFrom(p, gLight);
      }

      // --- 服と色のペアリング（露出注入後に実行）
      p = pairWearColors(p);

      // 同期
      r.pos    = p;
      r.prompt = p.join(", ");
    }
  }
}
  // ④ 最終整形
  for (const r of out){
    let p = Array.isArray(r.pos) ? r.pos.slice()
          : (typeof r.prompt === 'string' ? r.prompt.split(/\s*,\s*/) : []);

    if (typeof fixExclusives === 'function') p = fixExclusives(p);
    p = Array.from(new Set(p.filter(Boolean)));
    if (typeof ensurePromptOrder === 'function') p = ensurePromptOrder(p);
    if (typeof enforceHeadOrder === 'function')  p = enforceHeadOrder(p);

    r.pos    = p;
    r.prompt = p.join(", ");

    const extraNeg = ["props","accessories","smartphone","phone","camera"].join(", ");
    const baseNeg  = [ (typeof getNeg === 'function' ? getNeg() : ""), extraNeg ].filter(Boolean).join(", ");
    r.neg    = (typeof buildNegative === 'function') ? buildNegative(baseNeg) : baseNeg;

    r.seed   = r.seed || seedFromName($("#charName")?.value || "", 1);
    r.text   = `${r.prompt} --neg ${r.neg} seed:${r.seed}`;
  }

  return out;
}

// 置き換え: ensurePromptOrder
function ensurePromptOrder(parts) {
  const set = new Set(parts.filter(Boolean));

  // 所属マップ
  const asSet = (arr) => new Set((arr||[]).map(x => (typeof x==='string'? x : x.tag)));
  const S = {
    age:        asSet(SFW.age),
    gender:     asSet(SFW.gender),
    body_basic: asSet(SFW.body_type),
    height:     asSet(SFW.height),
    person:     asSet(SFW.personality),
    world:      asSet(SFW.worldview),
    tone:       asSet(SFW.speech_tone),

    hair_style: asSet(SFW.hair_style),
    eyes_shape: asSet(SFW.eyes),
    face:       asSet(SFW.face),
    skin_body:  asSet(SFW.skin_body),
    art_style:  asSet(SFW.art_style),
    outfit:     asSet(SFW.outfit),
    acc:        asSet(SFW.accessories),
    background: asSet(SFW.background),
    pose:       asSet(SFW.pose),
    composition:asSet(SFW.composition),   // ★追加
    view:       asSet(SFW.view),          // ★追加
    expr:       asSet(SFW.expressions),
    light:      asSet(SFW.lighting),

    nsfw_expr:  asSet(NSFW.expression),
    nsfw_expo:  asSet(NSFW.exposure),
    nsfw_situ:  asSet(NSFW.situation),
    nsfw_light: asSet(NSFW.lighting),
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
    bg:[], pose:[], expr:[], light:[],
    // NSFW
    n_expr:[], n_expo:[], n_situ:[], n_light:[],
    other:[]
  };

  const charName = ($("#charName")?.value || "").trim();

  for (const t of set) {
    if (!t) continue;
    if (t.startsWith("<lora:") || /\b(?:LoRA|<lyco:)/i.test(t)) { buckets.lora.push(t); continue; }
    if (charName && t === charName) { buckets.name.push(t); continue; }

    // 人となり
    if (S.age.has(t))      { buckets.b_age.push(t); continue; }
    if (S.gender.has(t))   { buckets.b_gender.push(t); continue; }
    if (S.body_basic.has(t)){ buckets.b_body.push(t); continue; }
    if (S.height.has(t))   { buckets.b_height.push(t); continue; }
    if (S.person.has(t))   { buckets.b_person.push(t); continue; }
    if (S.world.has(t))    { buckets.b_world.push(t); continue; }
    if (S.tone.has(t))     { buckets.b_tone.push(t); continue; }

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

    // 服・アクセ（色付き服も outfit に寄せる想定）
    const WEAR_NAME_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer|skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts|dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;
    if (S.outfit.has(t) || WEAR_NAME_RE.test(t)) { buckets.wear.push(t); continue; }
    if (S.acc.has(t)) { buckets.acc.push(t); continue; }

    // シーン
    if (S.background.has(t)) { buckets.bg.push(t);   continue; }
    if (S.pose.has(t))       { buckets.pose.push(t); continue; }
    if (S.expr.has(t))       { buckets.expr.push(t); continue; }
    if (S.light.has(t))      { buckets.light.push(t);continue; }

    // NSFW
    if (S.nsfw_expr.has(t))  { buckets.n_expr.push(t);  continue; }
    if (S.nsfw_expo.has(t))  { buckets.n_expo.push(t);  continue; }
    if (S.nsfw_situ.has(t))  { buckets.n_situ.push(t);  continue; }
    if (S.nsfw_light.has(t)) { buckets.n_light.push(t); continue; }

    buckets.other.push(t);
  }

  // --- 最終ガード：表情/構図/視点をグローバルに正規化 ---

  // 1) 表情：SFW と NSFW を統合して 1 つだけ残す
  {
    const ALL_EXPR = [...buckets.expr, ...buckets.n_expr];
    if (ALL_EXPR.length > 0) {
      const PREFER_EXPR = ["smiling","neutral expression","slight blush","surprised (mild)","pouting (slight)"];
      const keepExpr = PREFER_EXPR.find(t => ALL_EXPR.includes(t)) || ALL_EXPR[0];
      buckets.expr = [keepExpr];
      buckets.n_expr = []; // 吸収済み
    }
  }

  // 2) 構図/距離/視点：全バケツ横断でヒット収集 → 1 つだけ残す
  {
    const COMP_VIEW_ORDER = [
      // 距離・フレーミング優先
      "full body","wide shot","waist up","upper body","bust","portrait","close-up",
      // 視点
      "three-quarters view","front view","profile view","back view","side view"
    ];
    const keys = Object.keys(buckets);
    const hits = [];
    for (const k of keys) {
      for (const t of buckets[k]) {
        if (COMP_VIEW_ORDER.includes(t)) hits.push(t);
      }
    }
    if (hits.length > 1) {
      const keep = COMP_VIEW_ORDER.find(t => hits.includes(t)) || hits[0];
      for (const k of keys) {
        buckets[k] = buckets[k].filter(t => !(COMP_VIEW_ORDER.includes(t) && t !== keep));
      }
    }
  }

  const out = [
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
    ...buckets.bg, ...buckets.pose, ...buckets.expr, ...buckets.light,
    // NSFW
    ...buckets.n_expr, ...buckets.n_expo, ...buckets.n_situ, ...buckets.n_light,
    // その他
    ...buckets.other
  ].filter(Boolean);

  // 念押しの一意化
  return Array.from(new Set(out));
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

// ② 完全置き換え版：buildBatchProduction（基本情報 + SFW/NSFW 正規化 + 服色ペアリング + 単一ライト/単一背景 + プレースホルダ除去）
function buildBatchProduction(n){
  const seedMode = document.querySelector('input[name="seedMode"]:checked')?.value || "fixed";

  // 固定タグ（先頭側に混ぜる）
  const fixed = ($("#p_fixed").value||"").split(",").map(s=>s.trim()).filter(Boolean);
  const neg = getNegProd();

  // 服セット {top, pants, skirt, dress, shoes}
  const O = readProductionOutfits();

  // 差分（各カテゴリ）
  const bgs    = getMany("p_bg");
  const poses  = getMany("p_pose");
  const comps  = getMany("p_comp");
  const views  = getMany("p_view");
  const exprs  = getMany("p_expr");
  const lights = getMany("p_light");          // SFWライト
  const acc    = readAccessorySlots();

  // NSFW（ON のときだけ各カテゴリから最大1つ）
  const nsfwOn   = !!$("#nsfwProd")?.checked;
  const nsfwExpr = nsfwOn ? getMany("nsfwP_expr")  : [];
  const nsfwExpo = nsfwOn ? getMany("nsfwP_expo")  : [];
  const nsfwSitu = nsfwOn ? getMany("nsfwP_situ")  : [];
  const nsfwLite = nsfwOn ? getMany("nsfwP_light") : [];  // NSFWライト

  // 服色（top/bottom/shoes のプレースホルダ → 通常服のみ pairWearColors で合体）
  const PC = {
    top:    getProdWearColorTag("top"),
    bottom: getProdWearColorTag("bottom"),
    shoes:  getProdWearColorTag("shoes"),
  };

  const baseSeed = seedFromName($("#charName").value||"", 0);
  const out  = [];
  const seen = new Set();
  let guard  = 0;

  const pickOne = (arr)=> (arr && arr.length ? pick(arr) : "");

  const makeOne = (i)=>{
    const parts = [];

    // --- 基本情報 ---
    const name = ($("#charName")?.value||"").trim();
    if (name) parts.push(name);

    parts.push("solo");
    if (typeof getGenderCountTag === 'function'){
      const gct = (getGenderCountTag()||"").trim();
      if (gct) parts.push(gct); // 1girl / 1boy 等
    }

    // テキスト基礎（年齢/性別/体型/身長）
    let tmp;
    tmp = pmPickOne('bf_age');    if (tmp) parts.push(tmp);
    tmp = pmPickOne('bf_gender'); if (tmp) parts.push(tmp);
    tmp = pmPickOne('bf_body');   if (tmp) parts.push(tmp);
    tmp = pmPickOne('bf_height'); if (tmp) parts.push(tmp);

    // 見た目（髪色/瞳色/肌・髪型・目の形）
    tmp = pmTextById('tagH');     if (tmp) parts.push(tmp);
    tmp = pmTextById('tagE');     if (tmp) parts.push(tmp);
    tmp = pmTextById('tagSkin');  if (tmp) parts.push(tmp);
    tmp = pmPickOne('hairStyle'); if (tmp) parts.push(tmp);
    tmp = pmPickOne('eyeShape');  if (tmp) parts.push(tmp);

    // --- 服の選定（ワンピ優先 / 上下）--- ※各カテゴリ 1つだけ採用
    let usedDress = false;
    let chosenDress = "";
    if (O.dress.length && Math.random() < 0.35) {
      chosenDress = pick(O.dress);      // ワンピから1つ
      parts.push(chosenDress);
      usedDress = true;
    } else {
      if (O.top.length) parts.push(pick(O.top));            // トップス 1
      let bottomPool = [];
      if (O.pants.length && O.skirt.length) bottomPool = (Math.random() < 0.5) ? O.pants : O.skirt;
      else if (O.pants.length) bottomPool = O.pants;
      else if (O.skirt.length) bottomPool = O.skirt;
      if (bottomPool.length) parts.push(pick(bottomPool));   // ボトム 1
    }
    if (O.shoes && O.shoes.length) parts.push(pick(O.shoes)); // 靴 1

    // --- 服色の付与（この段階ではプレースホルダ） ---
    if (usedDress) {
      const RE_ONE = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|witch\s+outfit|idol\s+costume|stage\s+costume)\b/i;
      if (PC.top && chosenDress) {
        const noun = (chosenDress.match(RE_ONE)?.[1] || "").toLowerCase();
        if (noun) parts.push(`${PC.top} ${noun}`); // 例: "white dress"
      }
    } else {
      if (PC.top)    parts.push(`${PC.top} top`);       // 例: "white top"
      if (PC.bottom) parts.push(`${PC.bottom} bottom`); // 例: "azure bottom"
    }
    if (PC.shoes) parts.push(`${PC.shoes} shoes`);

    // --- アクセ/シーン ---
    if (acc.length)  parts.push(...acc);
    if (bgs.length)  parts.push(pick(bgs));
    if (poses.length)parts.push(pick(poses));
    if (comps.length)parts.push(pick(comps));
    if (views.length)parts.push(pick(views));
    if (!comps.length) parts.push("centered composition");

    // --- 表情（SFW/NSFW 切替）---
    if (nsfwOn && nsfwExpr.length){
      parts.push(pickOne(nsfwExpr)); // NSFW表情で置換扱い
    } else {
      parts.push(exprs.length ? pick(exprs) : "neutral expression");
    }

    // --- ライティング（SFW/NSFW をまとめて 1 個に統一） ---
    if (lights.length) parts.push(pick(lights));
    if (nsfwOn && nsfwLite.length) parts.push(pickOne(nsfwLite));

    // --- NSFW：露出/シチュ（各1）---
    if (nsfwOn && nsfwExpo.length) parts.push(pickOne(nsfwExpo));
    if (nsfwOn && nsfwSitu.length) parts.push(pickOne(nsfwSitu));

    // --- 整合処理（順序が重要） ---
    let all = uniq([...fixed, ...parts]).filter(Boolean);

    // 露出/ワンピ優先（上下や色プレースホルダの除去はここで）
    if (typeof applyNudePriority === 'function')           all = applyNudePriority(all);
    if (typeof enforceOnePieceExclusivity === 'function')  all = enforceOnePieceExclusivity(all);

    // 露出の有無は配列全体から検出（固定タグ経由でも拾う）
    const EXPOSURE_EXCLUSIVE_RE =
      /\b(bikini|swimsuit|lingerie|micro_bikini|string_bikini|sling_bikini|wet_swimsuit|nipple_cover_bikini|crotchless_swimsuit|bodypaint_swimsuit|topless|bottomless|nude)\b/i;
    const hasExposure = all.some(t => EXPOSURE_EXCLUSIVE_RE.test(String(t)));

    if (hasExposure) {
      // 既存の上下服・ワンピ・靴・色プレースホルダを除去（色は露出タグ側の色込みに任せる）
      const CLOTH_NOUN_RE =
        /\b(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|windbreaker|dress|one[-\s]?piece|cheongsam|qipao|yukata|kimono|hanbok|gown|tracksuit|jersey|robe|poncho|cape|leotard|uniform)\b/i;
      const SHOES_RE =
        /\b(boots|sneakers|loafers|mary\s+janes|heels|sandals|shoes)\b/i;
      const COLOR_WORD_RE =
        /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\b/i;
      const COLOR_PLACE_RE =
        /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\s+(top|bottom|skirt|pants|trousers|shorts|jeans|cargo\s+pants|t-?shirt|shirt|blouse|sweater|hoodie|cardigan|jacket|coat|parka|dress|one[-\s]?piece|gown|uniform|shoes|boots|sneakers|loafers|mary\s+janes|heels|sandals)\b/i;

      all = all.filter(s =>
        !CLOTH_NOUN_RE.test(s) &&
        !SHOES_RE.test(s) &&
        !COLOR_PLACE_RE.test(s) &&
        !(COLOR_WORD_RE.test(s) && !/\s/.test(s)) // 単独色タグも除去
      );
    } else {
      // 通常服：色合体の前に“カテゴリ1個だけ”を最終保証してから合体
      all = ensureSingleWearPerRow(all);
      if (typeof pairWearColors === 'function') all = pairWearColors(all);
      // 色プレースホルダ（color + top/bottom/shoes）と生の top/bottom は最終的に落とす
      all = removeWearPlaceholders(all);
    }

    // --- 背景は 1 つだけ（empty background は他があれば落とす）---
    all = enforceSingleBackground(all);

    // --- ライティングは最終的に 1 つだけ ---
    all = unifyLightingOnce(all);

    // SOLOガードやヒント整理
    if (typeof stripMultiHints === 'function') all = stripMultiHints(all);
    if (typeof forceSoloPos === 'function')    all = forceSoloPos(all);

    // 排他カテゴリの整理 → 並び順 → 先頭固定
    if (typeof fixExclusives === 'function')     all = fixExclusives(all);
    if (typeof ensurePromptOrder === 'function') all = ensurePromptOrder(all);
    if (typeof enforceHeadOrder === 'function')  all = enforceHeadOrder(all);

    const seed = (seedMode === "fixed")
      ? baseSeed
      : seedFromName($("#charName").value||"", i);

    return { seed, pos: all, neg: withSoloNeg(neg) };
  };

  // ユニーク優先生成
  while (out.length < n && guard < n * 400) {
    guard++;
    const r = makeOne(out.length + 1);
    const key = r.pos.join("|") + "|" + r.seed;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  while (out.length < n) out.push(makeOne(out.length + 1)); // フォールバック

  return out;
}


// 服カテゴリは 1 行につき 1 つだけに制限する保険（既存をそのまま使う）
function ensureSingleWearPerRow(arr){
  const kept = new Set();
  const out = [];
  const MAP = [
    ["dress",  /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\s+dress)\b/i],
    ["top",    /\b(t-?shirt|tank\s+top|blouse|shirt|hoodie|sweater|cardigan|jacket|coat|parka|windbreaker|camisole|crop\s+top|turtleneck|uniform|jersey)\b/i],
    ["bottom", /\b(pants|trousers|shorts|jeans|cargo\s+pants|skirt|hakama)\b/i],
    ["shoes",  /\b(boots|sneakers|loafers|mary\s+janes|heels|sandals|shoes)\b/i],
  ];
  for (const t of arr){
    const s = String(t);
    let cat = null;
    for (const [c, re] of MAP){ if (re.test(s)) { cat = c; break; } }
    if (!cat) { out.push(t); continue; }
    if (kept.has(cat)) continue;
    kept.add(cat);
    out.push(t);
  }
  return out;
}

// 色プレースホルダ（color + top/bottom/shoes）と生の top/bottom/shoes を削除
// ※ white shirt / blue skirt / black sneakers 等の“具体服”は削らない
function removeWearPlaceholders(arr){
  const COLOR = /\b(white|black|red|blue|azure|navy|teal|cyan|magenta|green|yellow|orange|pink|purple|brown|beige|gray|grey|silver|gold)\b/i;
  const PLACE = /\b(top|bottom|shoes)\b/i; // ← プレースホルダ名詞のみ
  return arr.filter(t=>{
    const s = String(t);
    // color + placeholder（例: orange top / blue bottom / black shoes）
    if (COLOR.test(s) && PLACE.test(s)) return false;
    // 単独 placeholder（rare だが一応）
    if (/^(top|bottom|shoes)$/i.test(s.trim())) return false;
    return true;
  });
}

// ライティング（SFW/NSFW 含む）を“最終的に 1 つだけ”残す
function unifyLightingOnce(arr){
  const LIGHT_RE = /\b(normal lighting|even lighting|flat studio lighting|soft lighting|softbox lighting|clamshell lighting|backlighting|backlit|rim light|dramatic lighting|golden hour|neon lighting|window light|moonlight|candlelight|spotlight|overcast|volumetric light|moody|hard_light|soft_light)\b/i;
  let keep = "";
  for (let i = arr.length - 1; i >= 0; i--){
    const s = String(arr[i]);
    if (LIGHT_RE.test(s)){ keep = s; break; }
  }
  if (!keep) return arr;
  const cleaned = arr.filter(s => !LIGHT_RE.test(String(s)));
  cleaned.push(keep);
  return cleaned;
}

// 背景は 1 つだけ。empty background は他があれば落とす
function enforceSingleBackground(arr){
  const BG_RE = /\b(plain background|white background|solid background|studio background|white seamless|gray seamless|gradient background|bedroom|classroom|street at night|beach|forest|shrine|sci-fi lab|cafe|library|rooftop|train platform|festival stalls|shrine festival|classroom after school|snowy town|autumn park|spring cherry blossoms|space interior|poolside|swimming pool|water park|beach daytime|beach sunset|empty background|autumn park|forest|swimming pool)\b/i;
  const bg = arr.filter(s => BG_RE.test(String(s)));
  if (bg.length <= 1) return arr;

  const hasNonEmpty = bg.some(s => !/empty background/i.test(String(s)));
  let keep = "";
  if (hasNonEmpty){
    for (let i = arr.length - 1; i >= 0; i--){
      const s = String(arr[i]);
      if (BG_RE.test(s) && !/empty background/i.test(s)) { keep = s; break; }
    }
  } else {
    keep = "empty background";
  }
  const cleaned = arr.filter(s => !BG_RE.test(String(s)));
  if (keep) cleaned.push(keep);
  return cleaned;
}

function getNegProd(){
  const custom = ($("#p_neg").value||"").trim();
  return buildNegative(custom);
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
// 追加パッチ：NSFW拡張（pose/acc/outfit/body）＋ 単語SFWアクセ
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
    mountChecklist('#pl_nsfw_pose',    dict.nsfw.pose);
    mountChecklist('#pl_nsfw_acc',     dict.nsfw.accessory);
    mountChecklist('#pl_nsfw_outfit',  dict.nsfw.outfit);
    mountChecklist('#pl_nsfw_body',    dict.nsfw.body);
    mountChecklist('#pl_nsfw_nipple',  dict.nsfw.nipple);   // ★追加

    // ---- 学習モード（NSFW） ----
    mountChecklist('#nsfwL_pose',      dict.nsfw.pose);
    mountChecklist('#nsfwL_acc',       dict.nsfw.accessory);
    mountChecklist('#nsfwL_outfit',    dict.nsfw.outfit);
    mountChecklist('#nsfwL_body',      dict.nsfw.body);
    mountChecklist('#nsfwL_nipple',    dict.nsfw.nipple);   // ★追加

    // ---- 量産モード（NSFW） ----
    mountChecklist('#nsfwP_pose',      dict.nsfw.pose);
    mountChecklist('#nsfwP_acc',       dict.nsfw.accessory);
    mountChecklist('#nsfwP_outfit',    dict.nsfw.outfit);
    mountChecklist('#nsfwP_body',      dict.nsfw.body);
    mountChecklist('#nsfwP_nipple',    dict.nsfw.nipple);   // ★追加

    // ---- 単語モード：SFWアクセ / NSFW各種（必要分だけ）----
    mountWordItems('#wm-items-accessories', '#wm-count-accessories', dict.sfw.accessories);

    // NSFW（単語モード）に nipple を追加
    mountWordItems('#wm-items-nipple-nsfw', '#wm-count-nipple-nsfw', dict.nsfw.nipple);
    // 既存の expression/exposure/situation/lighting/pose/outfit/body は
    // すでに別所で流し込んでいるなら不要。未実装なら同様に mountWordItems(...) を呼ぶ。
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
    const nsfw = {
      pose:      normalizeNSFW(nsfwTop,'pose'),
      accessory: normalizeNSFW(nsfwTop,'accessories','accessory','acc'),
      outfit:    normalizeNSFW(nsfwTop,'outfit','outfits','costume','clothes'),
      body:      normalizeNSFW(nsfwTop,'body','anatomy','feature','features'),
      nipple:    normalizeNSFW(nsfwTop,'nipple','nipples')  // ★追加
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
