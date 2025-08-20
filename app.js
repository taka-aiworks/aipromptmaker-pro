/* =========================
   LoRA Prompt Maker – app.js
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

// --- 学習モード専用: 複数人を抑止するネガティブを付足 ---
function withSoloNegatives(negText) {
  const add = [
    "2girls", "2boys", "two people", "multiple people", "group",
    "crowd", "duo", "trio"
  ];
  const base = (negText || "").split(",").map(s=>s.trim()).filter(Boolean);
  return uniq([...base, ...add]).join(", ");
}

/* === ソロ強制ガード（複数人対策） ======================= */
const SOLO_POS = ["solo"]; // 1人明示
const SOLO_NEG = [
  "multiple people",   // 複数人
  "group",             // グループ・集合
  "crowd",             // 群衆
  "background people", // 背景にいる人
  "text on clothes",   // シャツに余計な文字が含まれないようにする
  "letters",           // 文字全般
  "logo"
];

// 背景が人混みに寄りやすいタグ → “無人化”の弱い補正を足す
const MULTI_RISK_BG = new Set([
  "festival stalls","shrine festival","street at night","classroom",
  "train platform","beach","rooftop","library","caf\u00e9","snowy town",
]);

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
  const base = (neg || "").split(",").map(s=>s.trim()).filter(Boolean);
  const merged = new Set([...base, ...SOLO_NEG]);
  return [...merged].join(", ");
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
  wear:2, acc:0,          // ← 服は最大2語（top/bottom or dress）。アクセは0（固定にしたい場合は1でもOK）
  bg:1, pose:1, expr:1, light:1,
  n_expr:1, n_expo:1, n_situ:1, n_light:1,
  other:0
};

// ensurePromptOrder と同じ仕分けを流用して“刈る”
function trimByBucketForLearning(parts){
  const ordered = ensurePromptOrder(parts);
  const buckets = {
    lora:[], name:[],
    b_age:[], b_gender:[], b_body:[], b_height:[], b_person:[], b_world:[], b_tone:[],
    c_hair:[], c_eye:[], c_skin:[],
    s_hair:[], s_eye:[], s_face:[], s_body:[], s_art:[],
    wear:[], acc:[],
    bg:[], pose:[], expr:[], light:[],
    n_expr:[], n_expo:[], n_situ:[], n_light:[],
    other:[]
  };

  // ensurePromptOrder の分類ロジックに合わせるため、所属判定は同じ関数内の簡易模倣
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
    pose:       new Set((SFW.pose_composition||[]).map(x=>x.tag||x)),
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

  for (const t of ordered) {
    if (!t || LEARN_EXCLUDE_RE.test(t)) continue;

    if (t.startsWith("<lora:") || /\b(?:LoRA|<lyco:)/i.test(t)) { buckets.lora.push(t); continue; }
    if (($("#charName")?.value||"").trim() === t) { buckets.name.push(t); continue; }

    if (S.age.has(t))       { buckets.b_age.push(t); continue; }
    if (S.gender.has(t))    { buckets.b_gender.push(t); continue; }
    if (S.body_basic.has(t)){ buckets.b_body.push(t); continue; }
    if (S.height.has(t))    { buckets.b_height.push(t); continue; }
    if (S.person.has(t))    { buckets.b_person.push(t); continue; }
    if (S.world.has(t))     { buckets.b_world.push(t); continue; }
    if (S.tone.has(t))      { buckets.b_tone.push(t); continue; }

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
    if (S.pose.has(t))       { buckets.pose.push(t); continue; }
    if (S.expr.has(t))       { buckets.expr.push(t); continue; }
    if (S.light.has(t))      { buckets.light.push(t);continue; }

    if (S.nsfw_expr.has(t))  { buckets.n_expr.push(t);  continue; }
    if (S.nsfw_expo.has(t))  { buckets.n_expo.push(t);  continue; }
    if (S.nsfw_situ.has(t))  { buckets.n_situ.push(t);  continue; }
    if (S.nsfw_light.has(t)) { buckets.n_light.push(t); continue; }

    buckets.other.push(t);
  }

  const capped = [];
  for (const [bk, arr] of Object.entries(buckets)) {
    const cap = LEARN_BUCKET_CAP[bk];
    if (cap === undefined) { capped.push(...arr); continue; }
    if (cap <= 0) continue;
    capped.push(...arr.slice(0, cap));
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
  const base = getNeg(); // 既存（DEFAULT_NEG + カスタム）
  return withSoloNeg(uniq([...(base||"").split(",").map(s=>s.trim()).filter(Boolean), ...DEFAULT_TRAINING_NEG.split(",")]).join(", "));
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
const EMBED_SFW = { hair_style:[], eyes:[], outfit:[], face:[], skin_body:[], art_style:[], background:[], pose_composition:[], expressions:[], accessories:[], lighting:[], age:[], gender:[], body_type:[], height:[], personality:[], worldview:[], speech_tone:[] };
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

const KEYMAP = {
  "髪型":"hair_style","目の形":"eyes","服":"outfit","顔の特徴":"face","体型":"skin_body",
  "画風":"art_style","背景":"background","ポーズ":"pose_composition","ポーズ・構図":"pose_composition",
  "表情":"expressions","アクセサリー":"accessories","ライティング":"lighting","年齢":"age","性別":"gender",
  "体型(基本)":"body_type",   // 好きな日本語キーに合わせて
  "身長":"height",
  "性格":"personality",
  "世界観":"worldview",
  "口調":"speech_tone"
};

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
function mergeIntoSFW(json) {
  const src = json?.SFW || json || {};
  const next = { ...SFW };
  for (const [k,v] of Object.entries(src||{})) {
    const key = KEYMAP[k] || k;
    if (next[key] === undefined) continue;
    next[key] = dedupeByTag([...(next[key] || []), ...normList(v)]);
  }
  SFW = next;
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

// ===== 1枚テスト: 必須チェック =====
function listMissingForOneTest() {
  const miss = [];

  // 名前（seed固定用）
  const name = ($("#charName")?.value || "").trim();
  if (!name) miss.push("キャラ名");

  // 色タグ（髪・瞳・肌）
  const hairTag = ($("#tagH")?.textContent || "").trim();
  const eyeTag  = ($("#tagE")?.textContent || "").trim();
  const skinTag = ($("#tagSkin")?.textContent || "").trim();
  if (!hairTag) miss.push("髪色");
  if (!eyeTag)  miss.push("瞳色");
  if (!skinTag) miss.push("肌トーン");

  // 形状1択（髪型・目の形）
  if (!getOne("hairStyle")) miss.push("髪型");
  if (!getOne("eyeShape"))  miss.push("目の形");

  // 推奨（任意）
  if (!getOne("skinBody"))  miss.push("体型（任意）");
  if (!getOne("face"))      miss.push("顔の特徴（任意）");
  if (!getOne("artStyle"))  miss.push("画風（任意）");

  // ★ 服は“任意”に変更（学習タブ）
  const mode = document.querySelector('input[name="outfitMode"]:checked')?.value || "separate";

  // 服は未選択でもOKなので、miss.push は行わない
  // 選択されていればそのまま利用される
  // ここでは何もチェックしない

  // 任意は不足扱いにしない
  return miss.filter(x => !/（任意）$/.test(x));
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

  const one = buildOneLearning(); // 既存（BG/PO/EXが無いとerrorを返す）
  if (one?.error) { toast(one.error); return; }

  // 既存レンダラを使って、1枚テスト用テーブル/テキストへ
  __lastOneTestRows = [one];
  renderLearnTableTo("#tblLearnTest tbody", __lastOneTestRows);
  // #fmtLearn の選択に従ってテキスト化（第3引数はセレクトID）
  renderLearnTextTo("#outLearnTest", __lastOneTestRows, "fmtLearn");
}

function copyOneTestText(){
  const el = $("#outLearnTest");
  if (!el) return;
  const txt = el.textContent || "";
  if (!txt) { toast("コピーするテキストがありません"); return; }
  navigator.clipboard.writeText(txt).then(()=> toast("コピーしました"));
}

// 固定で常に入れたいネガティブ（必要になったらここに増やす）
const DEFAULT_NEG = "extra fingers, blurry, lowres, bad anatomy, bad hands, bad feet, text, watermark";

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

/*
  // --- SLスクエア（DOMを動的追加） ---
  // wheel の直後に 200x140 のキャンバスとサムを生成
  const slWrap = document.createElement("div");
  slWrap.style.position = "relative";
  slWrap.style.width = "200px"; slWrap.style.height = "140px";
  slWrap.style.marginTop = "8px";
  const slCanvas = document.createElement("canvas");
  slCanvas.width = 200; slCanvas.height = 140;
  slCanvas.style.width="200px"; slCanvas.style.height="140px";
  slCanvas.style.borderRadius="8px";
  slCanvas.style.cursor="crosshair";
  const slThumb = document.createElement("div");
  Object.assign(slThumb.style, {
    position:"absolute", width:"10px", height:"10px", border:"2px solid #fff",
    borderRadius:"50%", boxShadow:"0 0 0 1px #0006", transform:"translate(-50%,-50%)",
    pointerEvents:"none"
  });
  slWrap.appendChild(slCanvas); slWrap.appendChild(slThumb);
  wheel.parentElement.insertBefore(slWrap, wheel.nextSibling);

  // --- 状態 ---
  let H = defaultHue, S = defaultS, L = defaultL;

  // --- 共通描画 ---
  function paintPreviewAndLabel(){
    const [r,g,b] = hslToRgb(H, S, L);
    sw.style.background = `rgb(${r},${g},${b})`;
    tagEl.textContent = `${colorNameFromHSL(H, S, L)} ${baseTag}`;
  }

  // --- SLスクエアの塗り（Hue変更時に更新） ---
  function paintSL(){
    const ctx = slCanvas.getContext("2d");
    // 横: saturation 0→100
    const gS = ctx.createLinearGradient(0, 0, slCanvas.width, 0);
    gS.addColorStop(0, `hsl(${H} 0% 50%)`);
    gS.addColorStop(1, `hsl(${H} 100% 50%)`);
    ctx.fillStyle = gS; ctx.fillRect(0, 0, slCanvas.width, slCanvas.height);

    // 縦: lightness 100→0（白→透明→黒）を重ねる
    const gL = ctx.createLinearGradient(0, 0, 0, slCanvas.height);
    gL.addColorStop(0, "rgba(255,255,255,1)");
    gL.addColorStop(0.5, "rgba(255,255,255,0)");
    gL.addColorStop(0.5, "rgba(0,0,0,0)");
    gL.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gL; ctx.fillRect(0, 0, slCanvas.width, slCanvas.height);
  }

  function moveSLThumb(){
    const x = (S/100) * slCanvas.width;
    const y = (1 - L/100) * slCanvas.height;
    slThumb.style.left = `${x}px`;
    slThumb.style.top  = `${y}px`;
  }

  // --- Hueリング（既存のドラッグを流用） ---
  const onHue = (h)=>{
    H = h; onHue.__lastHue = h;
    paintSL(); paintPreviewAndLabel();
  };
  onHue.__lastHue = H;
  addHueDrag(wheel, thumb, onHue);

  // --- SLドラッグ ---
  let dragging = false;
  const pickSL = (clientX, clientY)=>{
    const r = slCanvas.getBoundingClientRect();
    let x = Math.max(0, Math.min(r.width,  clientX - r.left));
    let y = Math.max(0, Math.min(r.height, clientY - r.top));
    S = Math.round((x / r.width) * 100);
    L = Math.round((1 - y / r.height) * 100);
    moveSLThumb(); paintPreviewAndLabel();
  };
  slCanvas.addEventListener("pointerdown", (e)=>{ dragging = true; slCanvas.setPointerCapture(e.pointerId); pickSL(e.clientX, e.clientY); });
  slCanvas.addEventListener("pointermove", (e)=>{ if (dragging) pickSL(e.clientX, e.clientY); });
  slCanvas.addEventListener("pointerup",   ()=>{ dragging = false; });

  // --- 初期描画（リングのつまみ位置も） ---
  requestAnimationFrame(()=>{
    paintSL(); moveSLThumb(); paintPreviewAndLabel();
    const rect = wheel.getBoundingClientRect();
    const rOuter = rect.width/2 - 7;
    const rad = (H - 90) * Math.PI/180;
    thumb.style.left = (rect.width/2  + rOuter*Math.cos(rad) - 7) + "px";
    thumb.style.top  = (rect.height/2 + rOuter*Math.sin(rad) - 7) + "px";
  });

  // 取得用：タグ文字列（例: "deep blue hair"）
  return ()=> tagEl.textContent;
}
*/

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
// 学習用ホワイトリスト（控えめ多様性版）
// ※ 文字列は SFW 辞書の tag と完全一致させてね
const SCOPE = {
  learning: {
    background: [
      "plain background", "white background", "solid background", "studio background",
      "bedroom"
      // もし辞書にあれば: "light gray background"
    ],
    // 動きは控えめ＋手の見せ方を少し
    pose: [
      "standing", "sitting",
      "pointing", "head tilt",
      "hands on hips", "crossed arms"
    ],
    // ★全身を必ず含める（視点タグはここに置いてOK）
    composition: [
      "full body", "waist up", "bust", "portrait",
      "profile view", "back view", "front view", "three-quarters view",
      "centered composition",
      // 角度系（強すぎないやつ）
      "from below", "looking down", "overhead view",
      // 目線系
      "facing viewer", "looking to the side", "looking up"
    ],
    // 表情は整合済みの正規タグ
    expressions: [
      "neutral expression",
      "smiling",
      "smiling open mouth",
      "serious",
      "determined",
      "slight blush",
      "surprised (mild)",
      "pouting (slight)",
      "crying"
    ],
    // ライティングは安定系のみ
    lighting: [
      "normal lighting", "even lighting", "soft lighting","studio lighting","dramatic lighting","backlighting",
      "window light", "overcast","natural lighting"
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

  // --- ポーズ/構図（分離対応）
  {
    const src = SFW.pose_composition || [];
    const { poseTags, compTags } = categorizePoseComp(src);

    // 学習タブ：ポーズ/構図にホワイトリストを適用
    const pose_learn = filterByScope(poseTags, SCOPE.learning.pose);
    const comp_learn = filterByScope(compTags, SCOPE.learning.composition);

    if (document.getElementById("comp")) {
      checkList($("#pose"), pose_learn, "pose");
      checkList($("#comp"), comp_learn, "comp");
    } else {
      // comp が無い旧HTMLでも、学習側は一応 pose に絞りを掛ける
      checkList($("#pose"), pose_learn, "pose");
    }

    // 量産タブ：フル辞書
    if (document.getElementById("p_comp")) {
      checkList($("#p_pose"), poseTags, "p_pose");
      checkList($("#p_comp"), compTags, "p_comp");
    } else {
      checkList($("#p_pose"), src, "p_pose");
    }
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
  radioList($("#bf_world"),    SFW.worldview,    "bf_world");
  radioList($("#bf_tone"),     SFW.speech_tone,  "bf_tone");

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
function initTabs(){
  $$(".tab").forEach(t=> t.addEventListener("click", ()=>{
    $$(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    const m=t.dataset.mode;
    $("#panelBasic").hidden      = (m !== "basic");
    $("#panelLearning").hidden   = (m!=="learning");
    $("#panelProduction").hidden = (m!=="production");
    $("#panelSettings").hidden   = (m!=="settings");
  }));
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
  // 文字列系
  setVal("#charName",   cfg.charName || cfg.characterName || "");
  setVal("#loraTag",    cfg.loraTag  || cfg.lora || "");
  setVal("#fixedManual",cfg.fixed    || cfg.fixedTags || "");
  setVal("#negGlobal",  cfg.negative || cfg.negativeTags || "");

  // 構図：新キー comp / 互換 composition のどちらでも受ける
{
  const arr = Array.isArray(cfg.comp) ? cfg.comp
            : Array.isArray(cfg.composition) ? cfg.composition
            : (cfg.comp ?? cfg.composition ? [cfg.comp ?? cfg.composition] : []);
  setChecks("comp", arr);
}

// ライティング：新キー lightLearn / 互換 lighting
{
  const arr = Array.isArray(cfg.lightLearn) ? cfg.lightLearn
            : Array.isArray(cfg.lighting) ? cfg.lighting
            : (cfg.lightLearn ?? cfg.lighting ? [cfg.lightLearn ?? cfg.lighting] : []);
  setChecks("lightLearn", arr);
}

  // 形状
  if (cfg.hairStyle) setRadio("hairStyle", String(cfg.hairStyle));
  if (cfg.eyeShape)  setRadio("eyeShape",  String(cfg.eyeShape));
  if (cfg.face)      setRadio("face",      String(cfg.face));
  if (cfg.skinBody)  setRadio("skinBody",  String(cfg.skinBody));
  if (cfg.artStyle)  setRadio("artStyle",  String(cfg.artStyle));

  // シーン（※ 構図とは分離して個別に反映）
  if (cfg.background)
    setChecks("bg", Array.isArray(cfg.background) ? cfg.background : [cfg.background]);

  if (cfg.pose)
    setChecks("pose", Array.isArray(cfg.pose) ? cfg.pose : [cfg.pose]);

  if (cfg.expressions)
    setChecks("expr", Array.isArray(cfg.expressions) ? cfg.expressions : [cfg.expressions]);

  // 色（髪/瞳/肌）
  if (cfg.hairColorTag) setColorTag("#tagH", String(cfg.hairColorTag));
  if (cfg.eyeColorTag)  setColorTag("#tagE", String(cfg.eyeColorTag));
  if (typeof cfg.skinTone === "number") setSkinTone(cfg.skinTone);

  // ★ 基本情報（bf_*）
  const bf = cfg.bf || {};
  if (bf.age)        setRadio("bf_age",    String(bf.age));
  if (bf.gender)     setRadio("bf_gender", String(bf.gender));
  if (bf.body)       setRadio("bf_body",   String(bf.body));
  if (bf.height)     setRadio("bf_height", String(bf.height));
  // if (bf.personality)setRadio("bf_person", String(bf.personality));
  if (bf.tone)       setRadio("bf_tone",   String(bf.tone));

  // dataset にも保持（必要なら）
  {
    const host = document.body || document.documentElement;
    if (host && host.dataset) {
      if (bf.age)        host.dataset.bfAge    = String(bf.age);
      if (bf.gender)     host.dataset.bfGender = String(bf.gender);
      if (bf.body)       host.dataset.bfBody   = String(bf.body);
      if (bf.height)     host.dataset.bfHeight = String(bf.height);
      // if (bf.personality)host.dataset.bfPerson = String(bf.personality);
      if (bf.tone)       host.dataset.bfTone   = String(bf.tone);
    }
  }
  // ★ outfit（分割&モード）
  const outf = cfg.outfit || cfg.outfitSel || cfg.outfits;
  if (typeof outf === "string") {
    // 互換: 旧フォーマットが1語だけのときの推測
    if (isOnePieceOutfitTag(outf)) {
      setRadio("outfitMode", "onepiece");
      setRadio("outfit_dress", outf);
    } else {
      setRadio("outfitMode", "separate");
      // ざっくり top 側へ入れる（必要なら KEYMAP で吸収）
      setRadio("outfit_top", outf);
    }
  } else if (outf && typeof outf === "object") {
    const mode = outf.mode || "separate";
    setRadio("outfitMode", mode);

    if (mode === "onepiece") {
      if (outf.dress) setRadio("outfit_dress", String(outf.dress));
    } else {
      if (outf.top) setRadio("outfit_top", String(outf.top));
      // bottom は pants / skirt を bottomCat で振り分け
      const cat = (outf.bottomCat || "pants").toLowerCase();
      if (cat === "skirt") {
        setRadio("outfit_skirt", String(outf.bottom||""));
        __bottomCat = "skirt";
      } else {
        setRadio("outfit_pants", String(outf.bottom||""));
        __bottomCat = "pants";
      }
    }
    // ラジオの有効/無効再適用
    if (typeof window.__applyBottomCatSwap === 'function') window.__applyBottomCatSwap();
  }

  // ★ 服カラー（学習タブ固定色）＋ON/OFF
  const wc = cfg.wearColors || {};
  const wu = cfg.wearColorUse || {};
  const applyWear = (idBase, text, useOn) => {
    const useEl = (idBase === "bottom") ? document.getElementById("useBottomColor") : document.getElementById("use_"+idBase);
    if (useEl) { useEl.checked = !!useOn; }
    if (text)  { setColorTag("#tag_"+idBase, String(text)); }
    updateWearPanelEnabled(idBase);
  };
  applyWear("top",    wc.top,    (wu.top    ?? !!wc.top));
  applyWear("bottom", wc.bottom, (wu.bottom ?? !!wc.bottom));
  applyWear("shoes",  wc.shoes,  (wu.shoes  ?? !!wc.shoes));

  // アクセ（学習）
  if(cfg.learnAccessory){
    applyLearnAccessoryPreset(cfg.learnAccessory);
  }

  // NSFW（学習）
  if(cfg.nsfwLearn) applyNSFWLearningPreset(cfg.nsfwLearn);

  // 最終：UI再描画の依存関係を軽く叩く
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
    pose:        getMany("pose"),
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
      personality:getOne("bf_person"),
      tone:       getOne("bf_tone"),
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

function csvFromLearn(fmtSelId = "#fmtLearnBatch") {
  const fmt = getFmt(fmtSelId);
  // 1ファイル内に全部（分割/結合/コマンド行）を入れる
  const header = [
    '"no"',
    '"seed"',
    '"prompt"',
    '"negative"',
    '"merged"',
    '"line"'
  ];

  const rows = Array.from($("#tblLearn tbody")?.querySelectorAll("tr") || []).map((tr, i) => {
    // 学習テーブルの列取りは既存実装に合わせる（seed=td[1], prompt=td[5], neg=td[6]）
    const tds = Array.from(tr.children).map(td => td.textContent || "");
    const no   = String(i + 1);
    const seed = tds[1] || "";
    const p    = tds[5] || "";
    const n    = tds[6] || "";

    const merged = buildMergedPrompt(p, n);
    const line   = fmt.line(p, n, seed); // フォーマッタの1行表現

    // CSVエスケープ
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
  const base = isDefaultNegOn() ? DEFAULT_NEG : "";
  const custom = ($("#negGlobal").value||"").split(",").map(s=>s.trim()).filter(Boolean);
  const parts = [
    ... (base ? base.split(",").map(s=>s.trim()) : []),
    ... custom
  ];
  return uniq(parts).join(", ");
}

// 置き換え: assembleFixedLearning
function assembleFixedLearning(){
  const out = [];

  // 0) LoRA / キャラ名
  out.push($("#loraTag").value.trim());
  out.push($("#charName").value.trim());

  // 修正後
  ["age","gender","body","height","person","tone"]
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

// 置き換え：服色と服名をペア化（top/bottom/shoes を実服名へマージ）
function pairWearColors(parts){
  const P = new Set((parts || []).filter(Boolean));
  const S = s => String(s || "");

  // 実服名の検出
  const TOP_RE = /\b(t-?shirt|shirt|blouse|hoodie|sweater|cardigan|jacket|coat|trench\ coat|tank\ top|camisole|turtleneck|off-shoulder\ top|crop\ top|sweatshirt|blazer)\b/i;
  const BOTTOM_RE = /\b(skirt|pleated\ skirt|long\ skirt|hakama|shorts|pants|jeans|trousers|leggings|overalls|bermuda\ shorts)\b/i;
  const DRESS_RE = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|lolita\s+dress|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape)\b/i;
  const SHOES_RE = /\b(shoes|boots|heels|sandals|sneakers|loafers|mary\ janes|geta|zori)\b/i;

  const find = re => [...P].find(t => re.test(S(t)));
  const noun = (hit, re) => { const m = S(hit).match(re); return m ? m[1].toLowerCase() : ""; };

  const topHit    = find(TOP_RE);
  const bottomHit = find(BOTTOM_RE);
  const dressHit  = find(DRESS_RE);
  const shoesHit  = find(SHOES_RE);

  const topWord    = noun(topHit, TOP_RE);
  const bottomWord = noun(bottomHit, BOTTOM_RE);
  const dressWord  = noun(dressHit, DRESS_RE);
  const shoesWord  = noun(shoesHit, SHOES_RE);

  // "xxx top" / "yyy bottom" / "zzz shoes" → 実服名へ合体
  const replaceGeneric = (generic, nounWord) => {
    if (!nounWord) return;
    const reColor = new RegExp(`^(.+?)\\s+${generic}$`, "i");   // 例: "orange top"
    const colorHit = [...P].find(t => reColor.test(S(t)));
    if (!colorHit) return;

    // 色だけ抽出
    const color = S(colorHit).replace(reColor, "$1");

    // 元の色タグとプレースホルダ、そして“素の名詞”を消す
    P.delete(colorHit);
    [...P].forEach(x => {
      if (new RegExp(`\\b${generic}\\b`, "i").test(S(x))) P.delete(x);
      if (new RegExp(`\\b${nounWord}\\b`, "i").test(S(x))) P.delete(x);
    });

    // 合体して追加（例: "orange t-shirt" / "sky blue skirt" / "gray sneakers"）
    P.add(`${color} ${nounWord}`);
  };

  // ワンピ系は元から「色 + dress名」で入るので、top/bottomの置換はスキップ
  if (!dressWord) {
    replaceGeneric("top", topWord);
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


function buildOneLearning(extraSeed = 0){
  // ===== 1) ベース構築 =====
  const fixed = assembleFixedLearning();
  const BG = getMany("bg");
  const PO = [...getMany("pose"), ...getMany("comp")];           // ← compも足す（無ければ空配列）
  const EX = getMany("expr");
  const LI = getMany("lightLearn");  const addon = getSelectedNSFW_Learn();
  const b = pick(BG), p = pick(PO), e = pick(EX), l = LI.length ? pick(LI) : "";

  // 学習は常に1人
  const partsSolo = ["solo"];
  const genderCount = getGenderCountTag(); // "1girl" / "1boy" / ""
  if (genderCount) partsSolo.push(genderCount);

  let parts = uniq([...partsSolo, ...fixed, b, p, e, l, ...addon]).filter(Boolean);

  // ===== 2) 服の整合、露出優先などの既存ルール =====
  parts = applyNudePriority(parts);
  // ▼ 追加：ワンピ優先の排他と色プレースホルダの置換（18禁でも効く）
  parts = enforceOnePieceExclusivity(parts);
  parts = pairWearColors(parts);

  // ===== 3) 学習に向かない“ノイズ”を除去 =====
  // 学習で常に除外する R-18G/暴力・流血系（UIで選ばれても落とす）
  const NSFW_HARD_BLOCK_RE = /\b(blood(_splatter)?|injur(y|ies)|wound(ed)?|gore|gory|violence|torture)\b/i;
  // 学習用ノイズ（強演出・小道具・群衆…）を一か所に集約
  const LEARN_NOISE_RE = /\b(crowd|group|multiple people|two people|three people|duo|trio|background people|lens flare|cinematic lighting|dramatic lighting|stage lighting|studio lighting|hdr|tilt-?shift|fisheye|wide-?angle|dutch angle|extreme close-?up|depth of field|strong bokeh|motion blur|watermark|signature|copyright|smartphone|phone|camera|microphone|mic|weapon|gun|sword|shield|staff|laptop|keyboard|headphones|backpack|bag|umbrella|drink|food|ice cream|skateboard)\b/i;
  // --- 学習に不要なタグの削除（順番はどちらが先でもOKだが両方実行）
  parts = parts.filter(t => !NSFW_HARD_BLOCK_RE.test(String(t)));
  parts = parts.filter(t => !LEARN_NOISE_RE.test(String(t)));

  // 複数人系のニュアンス語をさらに落とす → ソロ強制マーカーを足す
  parts = stripMultiHints(parts);
  parts = forceSoloPos(parts);

  // ===== 4) 学習アンカーを不足時だけ補完 =====
  const asSet = (arr)=> new Set((arr||[]).map(x=> typeof x==='string' ? x : x.tag));
  const S = {
    background: asSet(SFW.background),
    pose:       asSet(SFW.pose_composition),
    expr:       asSet(SFW.expressions),
    light:      asSet(SFW.lighting)
  };
  const hasAny = (poolSet)=> parts.some(t => poolSet.has(String(t)));

  // 背景：何も選んでなければフラットに
  if (!hasAny(S.background)) parts.push("plain background");

  // ポーズ・構図：無ければ“上半身”
  if (!hasAny(S.pose)) parts.push("upper body");

  // 表情：無ければニュートラル
  if (!hasAny(S.expr)) parts.push("neutral expression");

  // ライティング：無ければソフト
  if (!hasAny(S.light)) parts.push("soft lighting");

  // 構図の安定化（入ってなければ）
  if (!parts.some(t => /\b(center(ed)?\s?composition|centered)\b/i.test(String(t)))) {
    parts.push("centered composition");
  }

  // ===== 5) 最終整形・並び順・シード =====
  const pos  = ensurePromptOrder(uniq(parts).filter(Boolean));
  const seed = seedFromName($("#charName").value||"", extraSeed);

  // 学習向けの追加ネガを上乗せ（重複は withSoloNeg 側で実質吸収）
const EXTRA_NEG = [
  "props", "accessories",
  "smartphone", "phone", "camera"
].join(", ");

  const baseNeg = getNeg();                // 既存（グローバル）
  const neg = withSoloNeg([baseNeg, EXTRA_NEG].filter(Boolean).join(", ")); // 複数人抑止も混ぜる

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

// ① グループ内の既存タグを落として target を入れる（ensurePromptOrder まで面倒見） 
function replaceGroupTag(parts, groupTags, targetTag){
  const RE = new RegExp("\\b(" + groupTags.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")\\b","i");
  const out = [];
  for (const t of (parts||[])) { if (!RE.test(String(t))) out.push(t); }
  if (targetTag) out.push(targetTag);
  return ensurePromptOrder(out);
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
    rows[i].text = `${rows[i].pos.join(", ")} --neg ${rows[i].neg} seed:${rows[i].seed}`;
  }
}

// ③ 残りをデフォルトで埋める（“何も入ってない/他に置換された”ケースの保険）
function fillRemainder(rows, groupTags, fallbackTag){
  for (const r of rows){
    const hasAny = r.pos.some(t => groupTags.includes(String(t)));
    if (!hasAny){
      r.pos  = replaceGroupTag(r.pos, groupTags, fallbackTag);
      r.text = `${r.pos.join(", ")} --neg ${r.neg} seed:${r.seed}`;
    }
  }
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
      "plain background":[0.35,0.45],
      "white background":[0.20,0.30]
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

function buildBatchLearning(n){
  const used = new Set();
  const out = [];
  let guard = 0;

  // まずはユニークで頑張る
  while (out.length < n && guard < n * 300){
    guard++;
    const o = buildOneLearning(out.length + 1); // 行番号で seed 変化
    const key = o.pos.join("|");
    if (used.has(key)) continue;
    used.add(key);
    out.push(o);
  }
  // ユニークが尽きたら重複許容で埋め切る（seed は全部違う）
  while (out.length < n){
    out.push(buildOneLearning(out.length + 1));
  }
    // ★ 横顔を割合配分で注入// ★ 学習バッチ完成後に割合を適用する
{
  const rows = out;

  // VIEW
  applyPercentForTag(rows, MIX_RULES.view.group, "profile view", ...MIX_RULES.view.targets["profile view"]);
  applyPercentForTag(rows, MIX_RULES.view.group, "back view",    ...MIX_RULES.view.targets["back view"]);
  fillRemainder(rows, MIX_RULES.view.group, MIX_RULES.view.fallback);

  // COMPOSITION
  for (const [tag, rng] of Object.entries(MIX_RULES.comp.targets)) {
    applyPercentForTag(rows, MIX_RULES.comp.group, tag, rng[0], rng[1]);
  }
  fillRemainder(rows, MIX_RULES.comp.group, MIX_RULES.comp.fallback);

  // EXPRESSION（UIで選ばれているものだけを母集団に）
const selExpr = getMany("expr") || [];
const exprGroupBase = selExpr.length ? selExpr : MIX_RULES.expr.group;

// neutral を必ず含めつつ、全要素を重複排除
const exprGroup = Array.from(new Set([...exprGroupBase, "neutral expression"]));

for (const [tag, rng] of Object.entries(MIX_RULES.expr.targets)) {
  if (!exprGroup.includes(tag)) continue;
  applyPercentForTag(rows, exprGroup, tag, rng[0], rng[1]);
}
fillRemainder(rows, exprGroup, MIX_RULES.expr.fallback);

  // BACKGROUND
  for (const [tag, rng] of Object.entries(MIX_RULES.bg.targets)) {
    applyPercentForTag(rows, MIX_RULES.bg.group, tag, rng[0], rng[1]);
  }
  fillRemainder(rows, MIX_RULES.bg.group, MIX_RULES.bg.fallback);

  // LIGHTING
  for (const [tag, rng] of Object.entries(MIX_RULES.light.targets)) {
    applyPercentForTag(rows, MIX_RULES.light.group, tag, rng[0], rng[1]);
  }
  fillRemainder(rows, MIX_RULES.light.group, MIX_RULES.light.fallback);
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
    pose:       asSet(SFW.pose_composition),
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

   // ← ensurePromptOrder 内、buckets へ詰め終わった直後あたりに追加
   // 表情は常に1つに正規化
   if (buckets.expr.length > 1) {
     const nonNeutral = buckets.expr.filter(
       t => t.toLowerCase() !== "neutral expression"
     );
     buckets.expr = nonNeutral.length ? [nonNeutral[0]] : ["neutral expression"];
   }

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

  return [
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

// ② 置き換え版：buildBatchProduction（丸ごと差し替え）
function buildBatchProduction(n){
  const seedMode = document.querySelector('input[name="seedMode"]:checked')?.value || "fixed";
  const fixed = ($("#p_fixed").value||"").split(",").map(s=>s.trim()).filter(Boolean);

  const neg = getNegProd();
  const O = readProductionOutfits();  // {top, pants, skirt, dress, shoes}

  const bgs    = getMany("p_bg");
  const poses  = [...getMany("p_pose"), ...getMany("p_comp")];
  // 表情（生産モード）
  const exprs = getMany("p_expr");

  // neutral も含む表情グループ
  const exprGroup = Array.from(new Set([...MIX_RULES.expr.group, "neutral expression"]));

  if (exprs.length > 0) {
    // 複数選ばれていても先頭だけ採用
    const chosenExpr = exprs[0];
    replaceGroupTag(parts, exprGroup, chosenExpr);
  } else {
    // 何も選ばれていないなら neutral にする
    replaceGroupTag(parts, exprGroup, "neutral expression");
  }
  const lights = getMany("p_light");
  const acc    = readAccessorySlots();

  const nsfwOn = $("#nsfwProd").checked;
  const nsfwAdd = nsfwOn ? uniq([
    ...getMany("nsfwP_expr"),
    ...getMany("nsfwP_expo"),
    ...getMany("nsfwP_situ"),
    ...getMany("nsfwP_light")
  ]) : [];

  const PC = {
    top:    getProdWearColorTag("top"),
    bottom: getProdWearColorTag("bottom"),
    shoes:  getProdWearColorTag("shoes"),
  };

  const baseSeed = seedFromName($("#charName").value||"", 0);
  const out = [];
  const seen = new Set();
  let guard = 0;

  const makeOne = (i)=>{
    const parts = [];
    let usedDress = false;
    let chosenDress = "";

    // --- 服の選定（ワンピ優先の枝と上下の枝）
    if (O.dress.length && Math.random() < 0.35) {
      chosenDress = pick(O.dress);
      parts.push(chosenDress);
      usedDress = true;
    } else {
      if (O.top.length) parts.push(pick(O.top));
      let bottomPool = [];
      if (O.pants.length && O.skirt.length) bottomPool = (Math.random() < 0.5) ? O.pants : O.skirt;
      else if (O.pants.length) bottomPool = O.pants;
      else if (O.skirt.length) bottomPool = O.skirt;
      if (bottomPool.length) parts.push(pick(bottomPool));
    }

    if (O.shoes && O.shoes.length) parts.push(pick(O.shoes));

    // --- 色の適用
    if (usedDress) {
      // ① トップ色は “色 + ワンピ名” に直接乗せ替え
      if (PC.top && chosenDress) {
        // chosenDress の名詞抽出（enforceOnePieceExclusivity と同じ正規表現を再利用）
        const RE_ONE = /\b(dress|one[-\s]?piece|sundress|gown|kimono(?:\s+dress)?|yukata|cheongsam|qipao|hanbok|sari|lolita\ dress|kimono\ dress|swimsuit|bikini|leotard|(?:school|sailor|blazer|nurse|maid|waitress)\s+uniform|maid\s+outfit|tracksuit|sportswear|jersey|robe|poncho|cape|witch\s+outfit|idol\s+costume|stage\s+costume)\b/i;
        const noun = (chosenDress.match(RE_ONE)?.[1] || "").toLowerCase();
        if (noun) parts.push(`${PC.top} ${noun}`);
      }
      // ② ボトム色は破棄（下は存在しない）
    } else {
      if (PC.top)    parts.push(`${PC.top} top`);
      if (PC.bottom) parts.push(`${PC.bottom} bottom`);
    }
    if (PC.shoes)  parts.push(`${PC.shoes} shoes`);

    // --- アクセ/シーン
    if (acc.length)    parts.push(...acc);
    if (bgs.length)    parts.push(pick(bgs));
    if (poses.length)  parts.push(pick(poses));
    if (exprs.length)  parts.push(pick(exprs));
    if (lights.length) parts.push(pick(lights));
    if (nsfwAdd.length)parts.push(...nsfwAdd);

    // --- 服の整合
    let all = uniq([...fixed, ...parts]).filter(Boolean);
    all = applyNudePriority(all);               // ヌード系の優先処理
    all = enforceOnePieceExclusivity(all);      // ★ ワンピ選択時は上下排除＆色置換
    all = pairWearColors(all);                  // 名詞と色の最終ペアリング

    // --- SOLO ガード
    all = stripMultiHints(all);
    all = forceSoloPos(all);

    const prompt = ensurePromptOrder(all).join(", ");
    const seed = (seedMode === "fixed")
      ? baseSeed
      : seedFromName($("#charName").value||"", i);

    return { key: `${prompt}|${seed}`, seed, prompt, neg: withSoloNeg(neg) };
  };

  // ユニーク優先
  while (out.length < n && guard < n * 400) {
    guard++;
    const r = makeOne(out.length + 1);
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
  }
  // フォールバック
  while (out.length < n) out.push(makeOne(out.length + 1));
  return out;
}

function getNegProd(){
  const base = isDefaultNegOn() ? DEFAULT_NEG : "";
  const custom = ($("#p_neg").value||"").split(",").map(s=>s.trim()).filter(Boolean);
  const parts = [
    ... (base ? base.split(",").map(s=>s.trim()) : []),
    ... custom
  ];
  return uniq(parts).join(", ");
}

/* ========= レンダラ ========= */
function renderLearnTableTo(tbodySel, rows){
  const tb = document.querySelector(tbodySel); if (!tb) return;
  const frag = document.createDocumentFragment();
  rows.forEach((r,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i+1}</td><td>${r.seed}</td>
      <td>${r.pos.find(t=> normList(SFW.background).map(x=>x.tag).includes(t))||""}</td>
      <td>${r.pos.find(t=> normList(SFW.pose_composition).map(x=>x.tag).includes(t))||""}</td>
      <td>${r.pos.find(t=> normList(SFW.expressions).map(x=>x.tag).includes(t))||""}</td>
      <td>${r.pos.join(", ")}</td><td>${r.neg}</td>`;
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
function renderProdText(rows){
  const fmt = getFmt("#fmtProd");
  const lines = rows.map((r,i)=> {
    const p = r.prompt; const n = r.neg; const line = fmt.line(p, n, r.seed);
    return `[${String(i+1).padStart(2,"0")}] ${line}`;
  }).join("\n\n");
  $("#outProd").textContent = lines;
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

function bindLearnBatch(){
  $("#btnBatchLearn")?.addEventListener("click", ()=>{
    const cnt=parseInt($("#countLearn").value,10)||24;
    const rows = buildBatchLearning(cnt);
    if(rows.error){ toast(rows.error); return; }
    renderLearnTableTo("#tblLearn tbody", rows);
    renderLearnTextTo("#outLearn", rows, "fmtLearnBatch");
  });
  $("#btnCopyLearn")?.addEventListener("click", ()=>{
    const r=document.createRange(); r.selectNodeContents($("#outLearn")); const s=getSelection();
    s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); s.removeAllRanges(); toast("学習セットをコピーしました");
  });
  $("#btnCsvLearn")?.addEventListener("click", ()=>{
    const csv = csvFromLearn("#fmtLearnBatch");
    if(!csv || csv.split("\n").length<=1){ toast("学習テーブルが空です"); return; }
    const char = ($("#charName")?.value||"noname").replace(/[^\w\-]/g,"_");
    dl(`learning_${char}_${nowStamp()}.csv`, csv); toast("学習セットをローカル（CSV）に保存しました");
  });
  $("#btnCloudLearn")?.addEventListener("click", async ()=>{
    const csv = csvFromLearn("#fmtLearnBatch");
    if(!csv || csv.split("\n").length<=1){ toast("学習テーブルが空です"); return; }
    await postCSVtoGAS("learning", csv);
  });
}

function bindProduction(){
  $("#btnGenProd")?.addEventListener("click", ()=>{
    const cnt=parseInt($("#countProd").value,10)||50;
    const rows = buildBatchProduction(cnt);
    renderProdTable(rows); renderProdText(rows);
  });
  $("#btnCopyProd")?.addEventListener("click", ()=>{
    const r=document.createRange(); r.selectNodeContents($("#outProd")); const s=getSelection();
    s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); s.removeAllRanges(); toast("量産セットをコピーしました");
  });
  $("#btnCsvProd")?.addEventListener("click", ()=>{
    const csv = csvFromProd("#fmtProd");
    if(!csv || csv.split("\n").length<=1){ toast("量産テーブルが空です"); return; }
    const char = ($("#charName")?.value||"noname").replace(/[^\w\-]/g,"_");
    dl(`production_${char}_${nowStamp()}.csv`, csv); toast("量産セットをローカル（CSV）に保存しました");
  });
  $("#btnCloudProd")?.addEventListener("click", async ()=>{
    const csv = csvFromProd("#fmtProd");
    if(!csv || csv.split("\n").length<=1){ toast("量産テーブルが空です"); return; }
    await postCSVtoGAS("production", csv);
  });
}

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
  bindProduction();
  bindGASTools();

  bindBottomCategoryRadios();

   
  loadDefaultDicts().then(()=>{
    renderSFW();
    bindBottomCategoryGuess();
    fillAccessorySlots();
    renderNSFWLearning();
    renderNSFWProduction();initHairEyeAndAccWheels(); // ← 髪/瞳/アクセのピッカーとトグル連動をまとめて初期化

    // 色系
    // 基本情報タブの「服カラー（固定）」3つを初期化
     initColorWheel("top",    35, 80, 55);
     initColorWheel("bottom",210, 70, 50); 
     initColorWheel("shoes",   0,  0, 30);

     // 生産タブ（量産の基本色）
    initColorWheel("p_top",    35, 80, 55); // ← 追加
    initColorWheel("p_bottom",210, 70, 50); // ← 追加
    initColorWheel("p_shoes",   0,  0, 30); // ← 追加

    initSkinTone();
    initNSFWStatusBadge();
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
