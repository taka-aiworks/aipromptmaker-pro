/* =========================
   AI Prompt Maker – app.js (修正版)
   ========================= */

/* ========= ユーティリティ & 状態 ========= */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const toast = (msg) => {
  const t = $("#toast");
  if (!t) { 
   return;
  }
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


/* ===== 学習用配分ルール ===== */
// === LoRA学習最適化版・配分ルール（バランス調整・多様性向上） =======================
const MIX_RULES = {
  view: {
    group: ["front view","three-quarter view","side view","profile view","back view"],
    targets: {
      "three-quarter view":[0.45,0.50], // 顔が崩れにくい主軸（微減）
      "front view":[0.30,0.35],         // 維持
      "side view":[0.06,0.10],          // ←大幅底上げ（1-2回確保）
      "profile view":[0.08,0.12],       // ←大幅底上げ（2-3回確保）
      "back view":[0.01,0.02]           // ←極少だけ残す
    },
    fallback: "three-quarter view"
  },
  comp: {
    group: ["bust","waist up","portrait","upper body","close-up","full body","wide shot"],
    targets: {
      "bust":[0.30,0.36],               // 微減してバランス改善
      "waist up":[0.24,0.30],           // 微減
      "portrait":[0.10,0.14],           // 底上げ
      "upper body":[0.08,0.12],         // 底上げ  
      "close-up":[0.04,0.06],           // 底上げ
      "full body":[0.12,0.16],          // ←しっかり混ざる（増加）
      "wide shot":[0.02,0.04]           // ←底上げ維持
    },
    fallback: "bust"
  },
  expr: {
    group: [
      "neutral expression","smiling","smiling open mouth",
      "slight blush","serious","determined","pouting (slight)"
    ],
    targets: {
      "neutral expression":[0.50,0.58], // 大幅削減（バランス改善）
      "smiling":[0.25,0.30],            // ←大幅増加
      "smiling open mouth":[0.04,0.06], // ←底上げ維持
      "slight blush":[0.03,0.05],       // 底上げ維持
      "serious":[0.03,0.05],            // ←底上げ強化
      "determined":[0.02,0.04],         // ←底上げ強化  
      "pouting (slight)":[0.01,0.02]    // 維持
    },
    fallback: "neutral expression"
  },
  bg: {
    group: ["plain background","white background","studio background","solid background","white seamless","gray seamless"],
    targets: {
      "plain background":[0.35,0.42],   // ←大幅削減（偏り解消）
      "white background":[0.20,0.25],   // 微減
      "studio background":[0.15,0.20],  // ←大幅増加
      "solid background":[0.08,0.12],   // ←大幅増加
      "white seamless":[0.03,0.05],     // ←底上げ強化
      "gray seamless":[0.03,0.05]       // ←底上げ強化
    },
    fallback: "plain background"
  },
  light: {
    group: ["even lighting","soft lighting","normal lighting","window light","overcast"],
    targets: {
      "even lighting":[0.32,0.40],      // 微減（バランス改善）
      "soft lighting":[0.28,0.33],      // 微減
      "normal lighting":[0.18,0.23],    // ←増加
      "window light":[0.06,0.09],       // ←底上げ
      "overcast":[0.02,0.04]            // ←底上げ強化
    },
    fallback: "even lighting"
  },
  pose: {
    group: ["standing","sitting","arms at sides","hand on hip","arms crossed","looking at viewer"],
    targets: {
      "standing":[0.38,0.45],           // 微減（バランス改善）
      "sitting":[0.20,0.25],            // 維持
      "arms at sides":[0.15,0.20],      // 維持
      "hand on hip":[0.08,0.12],        // 維持
      "arms crossed":[0.04,0.06],       // ←底上げ
      "looking at viewer":[0.03,0.05]   // ←底上げ
    },
    fallback: "standing"
  }
};

window.MIX_RULES = MIX_RULES;
const EXPR_ALL = new Set([...Object.keys(MIX_RULES.expr.targets), MIX_RULES.expr.fallback]);


// === outfitの取り込み方針 =======================
const TRAINING_POLICY = {
  outfit: { mode: 'off', neutral_tag: 'casual outfit' }
};

// 配分ルールに基づいた選択関数
function pickByDistribution(category) {
  const rule = MIX_RULES[category];
  if (!rule) return null;
  
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [item, range] of Object.entries(rule.targets)) {
    const prob = range[0] + Math.random() * (range[1] - range[0]);
    cumulative += prob;
    if (rand <= cumulative) {
      return item;
    }
  }
  
  return rule.fallback;
}



/* ===== Tag Dictionary Bootstrap ===== */
window.TAGMAP = {
  en: new Map(),
  ja2tag: new Map(),
  label2tag: new Map(),
  id2tag: new Map()
};

// 置き換え版：辞書初期化（埋め込みJS → なければ fetch JSON）
async function initTagDictionaries() {
  // Map入れ物が無ければ初期化
  if (!window.TAGMAP) {
    window.TAGMAP = {
      en: new Map(),         // "red hair" -> "red hair"（小文字正規化）
      ja2tag: new Map(),     // "赤髪" -> "red hair"
      label2tag: new Map(),  // "ラベル文字列" -> "tag"
      id2tag: new Map(),     // 任意の id/key -> "tag"
    };
  }

  // 埋め込み（<script src="dict/default_*.js">）があればそれを使う
  const embeddedSFW  = window.DEFAULT_SFW_DICT  || null;
  const embeddedNSFW = window.DEFAULT_NSFW_DICT || null;

  // 無ければ fetch（HTTPサーバやPagesで動く時用）
  async function safeLoad(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  const [sfw, nsfw] = await Promise.all([
    embeddedSFW  ?? safeLoad('dict/default_sfw.json'),
    embeddedNSFW ?? safeLoad('dict/default_nsfw.json'),
  ]);

  // --- 重要：辞書の「ルート」をうまく拾う（categoriesが無いケース対応）---
  function normalizeRoot(obj, nsKey) {
    if (!obj || typeof obj !== 'object') return null;

    // 1) まず namespaced 直下
    if (nsKey && obj[nsKey]) {
      const n = obj[nsKey];
      if (n && typeof n === 'object') {
        if (n.categories && typeof n.categories === 'object') return n.categories;
        return n; // ← あなたのSFWのように直下に配列群がある構造
      }
    }

    // 2) 直下に categories
    if (obj.categories && typeof obj.categories === 'object') return obj.categories;

    // 3) それも無ければオブジェクト全体を走査対象にする
    return obj;
  }

  function addAll(obj, nsKey) {
    const root = normalizeRoot(obj, nsKey);
    if (!root) return;

    // 再帰的に配列を捜して item 追加
    const walk = (v) => {
      if (!v) return;
      if (Array.isArray(v)) {
        v.forEach(addItem);
        return;
      }
      if (typeof v === 'object') {
        // オブジェクトがそのまま {tag,label,...} の形なら addItem も試す
        if ('tag' in v || 'label' in v || 'ja' in v || 'id' in v || 'key' in v) addItem(v);
        // さらに子要素も探索
        Object.values(v).forEach(walk);
      }
    };

    function addItem(it) {
      if (!it || typeof it !== 'object') return;
      const tagRaw   = it.tag ?? '';
      const tag      = String(tagRaw).trim();
      if (!tag) return;

      const ja       = String(it.ja ?? it.label ?? '').trim();
      const id       = String(it.id ?? it.key ?? '').trim();
      const label    = String(it.label ?? '').trim();

      window.TAGMAP.en.set(tag.toLowerCase(), tag);
      if (ja)    window.TAGMAP.ja2tag.set(ja, tag);
      if (label) window.TAGMAP.label2tag.set(label, tag);
      if (id)    window.TAGMAP.id2tag.set(id, tag);
    }

    walk(root);
  }

  addAll(sfw,  'SFW');
  addAll(nsfw, 'NSFW');
}


/* ===== 基本値取得 ===== */
function getBFValue(name){
  const sel = document.querySelector(`input[name="bf_${name}"]:checked`);
  if (sel && sel.value) return sel.value;
  const host = document.body || document.documentElement;
  const key  = `bf${name[0].toUpperCase()}${name.slice(1)}`;
  return (host?.dataset?.[key] || "").trim();
}

function getGenderCountTag() {
  const g = document.querySelector('input[name="bf_gender"]:checked')?.value?.toLowerCase() || "";
  if (!g) return "";
  if (/\b(female|girl|woman|feminine|女子|女性)\b/.test(g)) return "1girl";
  if (/\b(male|boy|man|masculine|男子|男性)\b/.test(g))     return "1boy";
  return "";
}

/* ===== ネガティブ構築 ===== */
const NEG_TIGHT = [
  "multiple people","group","crowd","background people","bystanders","another person",
  "photobomb","reflection","mirror","poster","billboard","tv screen",
  "bad hands","bad anatomy","extra fingers","extra arms","extra legs",
  "fused fingers","malformed hands","long fingers",
  "lowres","blurry","low quality","worst quality","jpeg artifacts",
  "text","watermark","logo"
];

function buildNegative(baseText = "", useDefault = true) {
  const base = useDefault ? [...NEG_TIGHT] : [];
  const custom = baseText
    ? baseText.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...base, ...custom])).join(", ");
}

/* ===== 正規化 ===== */
window.normalizeTag = function(t){
  return String(t ?? "").trim();
};

function toTag(txt){
  return normalizeTag(txt);
}

/* ===== 辞書処理 ===== */
// ===== app.js の修正箇所2: SFW初期値に新しい配列を追加 =====
let SFW = {
  hair_style:[], 
  hair_length:[],     // ← 追加
  bangs_style:[],     // ← 追加
  eyes:[], 
  skin_features:[],   // ← 追加
  outfit:[], 
  face:[], 
  skin_body:[], 
  art_style:[], 
  background:[],
  pose:[], 
  composition:[], 
  view:[], 
  expressions:[], 
  accessories:[], 
  lighting:[],
  age:[], 
  gender:[], 
  body_type:[], 
  height:[], 
  personality:[], 
  colors:[]
};

let NSFW = {
  expression:[], exposure:[], situation:[], lighting:[], background:[],
  pose:[], accessory:[], outfit:[], body:[], nipples:[], underwear:[]
};

function normItem(x) {
  if (typeof x === "string") return { tag: x, label: x, level: "L1" };
  if (!x || typeof x !== "object") return null;
  const tag   = x.tag ?? x.en ?? x.keyword ?? x.value ?? x.name;
  const ja    = x.ja || x.jp || x["name_ja"] || x["label_ja"] || x.desc || x.label;
  const label = (ja && String(ja).trim()) ? String(ja).trim() : (tag || "");
  const level = (x.level || "L1").toUpperCase();
  if (tag === undefined || tag === null) return null;
  return { ...x, tag: String(tag), label, level };
}

function normList(arr){ return (arr || []).map(normItem).filter(Boolean); }

function dedupeByTag(list) {
  const seen = new Set(); const out=[];
  for (const it of normList(list)) { if (seen.has(it.tag)) continue; seen.add(it.tag); out.push(it); }
  return out;
}

function mergeIntoSFW(json) {
  const src  = json?.SFW || json || {};
  const next = { ...SFW };
   const KEYMAP = {
    "髪型":"hair_style", 
    "髪の長さ":"hair_length",     // ← 追加
    "前髪":"bangs_style",         // ← 追加
    "目の形":"eyes", 
    "肌の特徴":"skin_features",   // ← 追加
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
    "性格":"personality",
    "色":"colors",
    // === 英語キーも対応 ===
    "hair_length":"hair_length",   // ← 追加
    "bangs_style":"bangs_style",   // ← 追加
    "skin_features":"skin_features" // ← 追加
  };

  for (const [k, v] of Object.entries(src || {})) {
    const key = KEYMAP[k] || k;
    if (next[key] === undefined) continue;
    next[key] = dedupeByTag([...(next[key]||[]), ...normList(v)]);
  }
  SFW = next;
}

function normNSFW(ns) {
  const src = (ns && ns.categories) ? ns.categories : (ns || {});
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
    underwear:  ['underwear','lingerie','下着','インナー']
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
    underwear:  pickBy(ALIAS.underwear)
  };
}

function mergeIntoNSFW(json) {
  const src = json?.NSFW ? normNSFW(json.NSFW) : normNSFW(json);
  NSFW = NSFW || {};
  const ensure = (k)=> { if (!Array.isArray(NSFW[k])) NSFW[k] = []; };
  ['expression','exposure','situation','lighting','background','pose','accessory','outfit','body','nipples','underwear'].forEach(ensure);

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
    underwear:  dedupeByTag([...(NSFW.underwear||[]),  ...(src.underwear||[])])
  };
}

function radioList(el, list, name, {checkFirst = true} = {}) {
  if (!el) return;
  const items = normList(list);
  
  // 一旦クリア
  el.innerHTML = '';
  
  // 「未選択」オプションを最初に追加
  const noneOption = document.createElement('label');
  noneOption.className = 'chip';
  const noneRadioId = `${name}_none_${Date.now()}`;
  noneOption.setAttribute('for', noneRadioId);
  
  const noneInput = document.createElement('input');
  noneInput.type = 'radio';
  noneInput.id = noneRadioId;
  noneInput.name = name;
  noneInput.value = '';
  noneInput.checked = !checkFirst; // checkFirstがfalseの場合はデフォルト選択
  
  const noneSpan = document.createElement('span');
  noneSpan.textContent = '（未選択）';
  
  noneOption.appendChild(noneInput);
  noneOption.appendChild(noneSpan);
  el.appendChild(noneOption);
  
  // ★★★ 確実なクリックハンドラ（未選択用） ★★★
  noneOption.addEventListener('click', (e) => {
    e.preventDefault();
    if (!noneInput.checked) {
      // 同じname の他のラジオボタンをクリア
      const others = document.querySelectorAll(`input[name="${name}"]`);
      others.forEach(other => other.checked = false);
      
      // 自分をチェック
      noneInput.checked = true;
      noneInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  items.forEach((it, i) => {
    const showMini = it.tag && it.label && it.tag !== it.label;
    const checked = (checkFirst && i === 0);
    const radioId = `${name}_${i}_${Date.now()}`;
    
    // 個別に要素を作成
    const label = document.createElement('label');
    label.className = 'chip';
    label.setAttribute('for', radioId);
    
    const input = document.createElement('input');
    input.type = 'radio';
    input.id = radioId;
    input.name = name;
    input.value = it.tag;
    input.checked = checked;
    
    const span = document.createElement('span');
    span.textContent = it.label;
    
    if (showMini) {
      const miniSpan = document.createElement('span');
      miniSpan.className = 'mini';
      miniSpan.textContent = ` ${it.tag}`;
      span.appendChild(miniSpan);
    }
    
    label.appendChild(input);
    label.appendChild(span);
    el.appendChild(label);
    
    // ★★★ 確実なクリックハンドラ ★★★
    label.addEventListener('click', (e) => {
      e.preventDefault();
      if (!input.checked) {
        // 同じname の他のラジオボタンをクリア
        const others = document.querySelectorAll(`input[name="${name}"]`);
        others.forEach(other => other.checked = false);
        
        // 自分をチェック
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}


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

const getOne = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";

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
    return Array.from(nodes).map(el => {
      if (el.tagName === 'INPUT') return el.value;
      return el.dataset?.en || el.value || el.textContent?.trim() || "";
     }).filter(v => v && v.trim()); // 空文字や空白のみの値を除外
  }
  const els = document.querySelectorAll(`input[name="${idOrName}"]:checked`);
  if (els?.length) return Array.from(els).map(el => el.value);
  return [];
}

/* ===== カラーユーティリティ ===== */
function hslToRgb(h,s,l){
  s/=100; l/=100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){[r,g,b]=[c,x,0]} else if(h<120){[r,g,b]=[x,c,0]} else if(h<180){[r,g,b]=[0,c,x]}
  else if(h<240){[r,g,b]=[0,x,c]} else if(h<300){[r,g,b]=[x,0,c]} else {[r,g,b]=[c,0,x]}
  return [(r+m)*255,(g+m)*255,(b+m)*255].map(v=>Math.round(v));
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

function colorNameFromHSL(h, s, l) {
  if (l < 12) return "black";
  if (l > 92 && s < 20) return "white";
  if (s < 10) {
    if (l < 30) return "dark gray";
    if (l > 70) return "light gray";
    return "gray";
  }
  const table = [
    { h:   0, name: "red" }, { h:  12, name: "crimson" }, { h:  22, name: "vermilion" },
    { h:  32, name: "orange" }, { h:  45, name: "gold" }, { h:  60, name: "yellow" },
    { h:  75, name: "lime" }, { h:  90, name: "green" }, { h: 110, name: "emerald" },
    { h: 150, name: "teal" }, { h: 180, name: "cyan" }, { h: 200, name: "aqua" },
    { h: 210, name: "sky blue" }, { h: 225, name: "azure" }, { h: 240, name: "blue" },
    { h: 255, name: "indigo" }, { h: 270, name: "violet" }, { h: 285, name: "purple" },
    { h: 300, name: "magenta" }, { h: 320, name: "fuchsia" }, { h: 335, name: "rose" },
    { h: 350, name: "pink" }, { h: 360, name: "red" }
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

/* ===== 色ホイール ===== */
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
  const onDown = (e) => { e.preventDefault(); dragging = true; updateFromEvent(e); };
  const onMove = (e) => { if (dragging) updateFromEvent(e); };
  const onUp   = () => { dragging = false; };
  wheelEl.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  return setThumb;
}

// ===== 置き換え版：initWheel =====
function initWheel(wId, tId, sId, lId, swId, tagId, baseTag) {
  const wheel = $(wId), thumb = $(tId), sat = $(sId), lit = $(lId), sw = $(swId), tagEl = $(tagId);

  // 要素が欠けている場合でも、同じAPI形状（getterに onHue を持たせる）で返す
  if (!wheel || !thumb || !sat || !lit || !sw || !tagEl) {
    const getter = () => (document.querySelector(tagId)?.textContent || "").trim();
    getter.onHue = () => {};           // ダミー
    getter.onHue.__lastHue = 0;
    return getter;
  }

  let hue = 35;

  function paint() {
    const s = +sat.value, l = +lit.value;
    const [r, g, b] = hslToRgb(hue, s, l);
    sw.style.background = `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
    const cname = colorNameFromHSL(hue, s, l);
    tagEl.textContent = `${cname} ${baseTag}`;
  }

  const onHue = (h) => { hue = h; onHue.__lastHue = h; paint(); };
  onHue.__lastHue = hue;

  addHueDrag(wheel, thumb, onHue);
  sat.addEventListener("input", paint);
  lit.addEventListener("input", paint);

  requestAnimationFrame(() => {
    paint();
    const rect = wheel.getBoundingClientRect();
    const r = rect.width / 2 - 7;
    const rad = (hue - 90) * Math.PI / 180;
    thumb.style.left = (rect.width / 2 + r * Math.cos(rad) - 7) + "px";
    thumb.style.top  = (rect.height / 2 + r * Math.sin(rad) - 7) + "px";
  });

  // ← ここ、$(tagId) ではなくキャプチャ済みの tagEl を使う
  const getter = () => (tagEl.textContent || "").trim();
  getter.onHue = onHue;                // ★ 外部から色相をセットできるようにする
  return getter;
}

// ===== 置き換え版：initColorWheel =====
function initColorWheel(idBase, defaultHue = 0, defaultS = 80, defaultL = 50) {
  const wheel = document.getElementById("wheel_" + idBase);
  const thumb = document.getElementById("thumb_" + idBase);
  const sat   = document.getElementById("sat_" + idBase);
  const lit   = document.getElementById("lit_" + idBase);
  const sw    = document.getElementById("sw_" + idBase);
  const tag   = document.getElementById("tag_" + idBase);

  // 要素が欠けている場合でも同じAPIを返す
  if (!wheel || !thumb || !sat || !lit || !sw || !tag) {
    const getter = () => (document.getElementById("tag_" + idBase)?.textContent || "").trim();
    getter.onHue = () => {};
    getter.onHue.__lastHue = defaultHue;
    return getter;
  }

  let hue = defaultHue;
  sat.value = defaultS;
  lit.value = defaultL;

  function paint() {
    const s = +sat.value, l = +lit.value;
    const [r, g, b] = hslToRgb(hue, s, l);
    sw.style.background = `rgb(${r},${g},${b})`;

    let useCheckbox = null;
    if (idBase === 'bottom') {
      useCheckbox = document.getElementById("useBottomColor");
    } else if (idBase.startsWith('p_')) {
      useCheckbox = document.getElementById("p_use_" + idBase.substring(2));
    } else {
      useCheckbox = document.getElementById("use_" + idBase);
    }

    if (useCheckbox && !useCheckbox.checked) {
      tag.textContent = "—";
    } else {
      tag.textContent = colorNameFromHSL(hue, s, l);
    }
  }

  const onHue = (h) => { hue = h; onHue.__lastHue = h; paint(); };
  onHue.__lastHue = hue;

  addHueDrag(wheel, thumb, onHue);
  sat.addEventListener("input", paint);
  lit.addEventListener("input", paint);

  let useCheckbox = null;
  if (idBase === 'bottom') {
    useCheckbox = document.getElementById("useBottomColor");
  } else if (idBase.startsWith('p_')) {
    useCheckbox = document.getElementById("p_use_" + idBase.substring(2));
  } else {
    useCheckbox = document.getElementById("use_" + idBase);
  }
  if (useCheckbox) useCheckbox.addEventListener("change", paint);

  requestAnimationFrame(() => {
    paint();
    const rect = wheel.getBoundingClientRect();
    const radius  = rect.width / 2 - 7;
    const radians = (hue - 90) * Math.PI / 180;
    const cx = rect.width / 2, cy = rect.height / 2;
    thumb.style.left = (cx + radius * Math.cos(radians) - 7) + "px";
    thumb.style.top  = (cy + radius * Math.sin(radians) - 7) + "px";
  });

  const getter = () => tag.textContent.trim();
  getter.onHue = onHue;                // ★ 外部から色相をセットできるようにする
  return getter;
}


/* ===== 肌トーン ===== */
function paintSkin(){
  const v   = +($("#skinTone").value||0);
  const tag = toneToTag(v);
  $("#swSkin").style.background = `hsl(${30}, ${20}%, ${85-v*0.7}%)`;
  $("#tagSkin").textContent = tag;
}

/* ===== フォーマッタ & CSV ===== */
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
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"python dream.py -p \\\"${p.replace(/\"/g,'\"\"')}\\\" -n \\\"${n.replace(/\"/g,'\"\"')}\\\" -S ${seed}"`].join(",") },
  nai:{ label:"NovelAI",
    line:(p,n,seed)=>`Prompt: ${p}\nUndesired: ${n}\nSeed: ${seed}`,
    csvHeader:['"no"','"seed"','"prompt"','"undesired"'],
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"${seed}"`,`"${p.replace(/"/g,'""')}"`,`"${n.replace(/"/g,'""')}"`].join(",") },
   // ★★★ Nano-banana (Gemini 2.5) フォーマッタ参照 ★★★
  "nano-banana":{ 
    label:"Nano-banana (Gemini 2.5)",
    line:(p,n,seed)=> window.formatNanoBananaCorrect ? window.formatNanoBananaCorrect(p,n,seed) : "Error: Nano-banana not loaded",
    csvHeader:['"no"','"instruction"','"expression"','"pose_item"','"excluded_tags"','"original"'],
    csvRow:(i,seed,p,n)=>{
      if(!window.processNanoBananaCorrect) return `"${i}","Error: Nano-banana not loaded","","","",""`;
      const result = window.processNanoBananaCorrect(p);
      const esc = (s) => `"${String(s).replace(/"/g,'""')}"`;
      return [esc(i),esc(result.instruction),esc(result.expression),esc(result.poseItem),esc(result.excludedTags),esc(p)].join(",");
    }
  }
};

const getFmt = (selId, fallback="a1111") => FORMATTERS[$(selId)?.value || fallback] || FORMATTERS[fallback];

/* ===== カテゴリ分配 ===== */
function categorizeOutfit(list){
  const L = normList(list || []);
  const C = { top:[], pants:[], skirt:[], dress:[], shoes:[] };

  for (const t of L) {
    // 辞書の cat プロパティを最優先
    const dictCat = (t.cat || "").toLowerCase();
    if (dictCat) {
      if (dictCat === "top")      { C.top.push(t);   continue; }
      if (dictCat === "pants")    { C.pants.push(t); continue; }
      if (dictCat === "skirt")    { C.skirt.push(t); continue; }
      if (dictCat === "dress")    { C.dress.push(t); continue; }
      if (dictCat === "shoes")    { C.shoes.push(t); continue; }
    }

    // 辞書にcat情報がない場合のみ正規表現フォールバック
    const tag = (t.tag || "").toLowerCase();
    if (/(t-shirt|tank|blouse|shirt|hoodie|sweater|cardigan|jacket|coat|top)/.test(tag)) { 
      C.top.push(t); continue; 
    }
    if (/(jeans|pants|trousers|shorts|cargo|bermuda|leggings|overalls|hakama)/.test(tag)) { 
      C.pants.push(t); continue; 
    }
    if (/(skirt)/.test(tag)) { 
      C.skirt.push(t); continue; 
    }
    if (/(dress|gown|yukata|kimono|cheongsam|hanbok|sari|uniform)/.test(tag)) { 
      C.dress.push(t); continue; 
    }
    if (/(boots|sneakers|loafers|mary janes|heel|sandal|shoe)/.test(tag)) { 
      C.shoes.push(t); continue; 
    }
    
    // 分類不明な場合はtopに分類
    C.top.push(t);
  }
  return C;
}

/* ===== レンダラ ===== */
function renderSFW(){
  radioList($("#hairStyle"),   SFW.hair_style,      "hairStyle");
  // ★★★ 以下3行を追加 ★★★
  radioList($("#hairLength"),  SFW.hair_length,     "hairLength", {checkFirst:false});
  radioList($("#bangsStyle"),  SFW.bangs_style,     "bangsStyle", {checkFirst:false});
  radioList($("#skinFeatures"), SFW.skin_features,  "skinFeatures", {checkFirst:false});
   
  radioList($("#eyeShape"),    SFW.eyes,            "eyeShape");
  radioList($("#face"),        SFW.face,            "face");
  radioList($("#skinBody"),    SFW.skin_body,       "skinBody");
  radioList($("#artStyle"),    SFW.art_style,       "artStyle");

  checkList($("#bg"),         SFW.background,   "bg");
  checkList($("#expr"),       SFW.expressions,  "expr");
  checkList($("#lightLearn"), SFW.lighting,     "lightLearn");

  checkList($("#p_bg"),    SFW.background,   "p_bg");
  checkList($("#p_expr"),  SFW.expressions,  "p_expr");
  checkList($("#p_light"), SFW.lighting,     "p_light");

  checkList($("#pose"), SFW.pose, "pose");
  checkList($("#comp"), SFW.composition, "comp");
  checkList($("#view"), SFW.view, "view");
  checkList($("#p_pose"), SFW.pose, "p_pose");
  checkList($("#p_comp"), SFW.composition, "p_comp");
  checkList($("#p_view"), SFW.view, "p_view");

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

  radioList($("#bf_age"),      SFW.age,          "bf_age");
  radioList($("#bf_gender"),   SFW.gender,       "bf_gender");
  radioList($("#bf_body"),     SFW.body_type,    "bf_body");
  radioList($("#bf_height"),   SFW.height,       "bf_height");

  // ワンピース/セパレートの切り替えイベントを追加
  bindOutfitModeChange();
}

// ワンピース/セパレート切り替え処理（新規追加）
function bindOutfitModeChange() {
  const outfitModeRadios = document.querySelectorAll('input[name="outfitMode"]');
  outfitModeRadios.forEach(radio => {
    radio.addEventListener('change', applyOutfitMode);
  });
  
  // 初回適用
  applyOutfitMode();
}

window.applyOutfitMode = function() {
  const mode = getOne('outfitMode');
  const isOnepiece = (mode === 'onepiece');
  
  
  // ワンピース関連の表示切り替え
  const onepieceSection = document.getElementById('onepieceSection');
  const separateSection = document.getElementById('separateSection');
  const bottomCatSection = document.getElementById('bottomCatSection');
  
  if (onepieceSection) {
    onepieceSection.style.display = isOnepiece ? 'block' : 'none';
  }
  if (separateSection) {
    separateSection.style.display = isOnepiece ? 'none' : 'block';

  }
  if (bottomCatSection) {
    bottomCatSection.style.display = isOnepiece ? 'none' : 'block';
  }
  
  // 色設定の表示切り替え
  const topColorSection = document.getElementById('topColorSection');
  const bottomColorSection = document.getElementById('bottomColorSection');
  
  if (topColorSection) {
    const label = topColorSection.querySelector('label');
    if (label) label.textContent = isOnepiece ? 'ワンピース色' : 'トップス色';
  }
  if (bottomColorSection) {
    bottomColorSection.style.display = isOnepiece ? 'none' : 'block';
  }
  
  // 選択をリセット（モード切り替え時の不整合を防ぐ）
  if (isOnepiece) {
    // セパレート系の選択をクリア
    const topRadios = document.querySelectorAll('input[name="outfit_top"]');
    const pantsRadios = document.querySelectorAll('input[name="outfit_pants"]');
    const skirtRadios = document.querySelectorAll('input[name="outfit_skirt"]');
    
    topRadios.forEach(radio => radio.checked = false);
    pantsRadios.forEach(radio => radio.checked = false);
    skirtRadios.forEach(radio => radio.checked = false);
  } else {
    // ワンピースの選択をクリア
    const dressRadios = document.querySelectorAll('input[name="outfit_dress"]');
    dressRadios.forEach(radio => radio.checked = false);
  }
};




function renderNSFWLearning(){
  const cap = (document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value) || "L1";
  const allow = (lv)=> (lv||"L1") !== "L3";
  const lvl = (x)=>({L1:'R-15', L2:'R-18', L3:'R-18G'})[x||'L1'] || 'R-15';
  const chips = (arr,name)=> normList(arr).filter(o => allow(o.level)).map(o => 
    `<label class="chip">
      <input type="checkbox" name="nsfwL_${name}" value="${o.tag}">
      ${o.label}<span class="mini"> ${lvl(o.level)}</span>
    </label>`).join("");

  const targets = [
    ['nsfwL_expr',      'expression'],
    ['nsfwL_expo',      'exposure'],
    ['nsfwL_situ',      'situation'],
    ['nsfwL_light',     'lighting'],
    ['nsfwL_pose',      'pose'],
    ['nsfwL_acc',       'accessory'],
    ['nsfwL_outfit',    'outfit'],
    ['nsfwL_body',      'body'],
    ['nsfwL_nipple',    'nipples'],
    ['nsfwL_underwear', 'underwear']
  ];

  for (const [elId, nsKey] of targets){
    const el = document.getElementById(elId);
    if (!el) continue;
    el.innerHTML = chips(NSFW[nsKey] || [], nsKey);
  }
}

/* ===== 撮影モードの初期化 ===== */
function initPlannerMode() {
  let plannerInitialized = false;
  
  window.pmInitPlannerOnce = function() {
    if (plannerInitialized) return;
    plannerInitialized = true;

   　// ★★★ 撮影モードの色ホイールを赤（0度）に設定 ★★★
     window.getPlannerAccColor = initColorWheel("plAcc", 0, 75, 50);
    
    // 撮影モードのアクセサリーセレクト初期化
    const plAccSel = document.getElementById("pl_accSel");
    if (plAccSel && SFW.accessories) {
      const options = '<option value="">（未選択）</option>' + 
        SFW.accessories.map(acc => `<option value="${acc.tag}">${acc.label || acc.tag}</option>`).join('');
      plAccSel.innerHTML = options;
    }
    
    // 撮影モードの色ホイール初期化
    window.getPlannerAccColor = initColorWheel("plAcc", 0, 75, 50);
    
    // 撮影モード用のNSFWトグル
    const plNsfw = document.getElementById("pl_nsfw");
    const plNsfwPanel = document.getElementById("pl_nsfwPanel");
    if (plNsfw && plNsfwPanel) {
      plNsfw.addEventListener("change", (e) => {
        plNsfwPanel.style.display = e.target.checked ? "" : "none";
        if (e.target.checked) {
          renderPlannerNSFW();
        }
      });
    }
    
    // NSFWレベル変更
    const plNsfwLevelRadios = document.querySelectorAll('input[name="pl_nsfwLevel"]');
    plNsfwLevelRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (document.getElementById("pl_nsfw")?.checked) {
          renderPlannerNSFW();
        }
      });
    });
    
    // 撮影モード出力ボタン
    const btnPlanOne = document.getElementById("btnPlanOne");
    if (btnPlanOne) {
      btnPlanOne.addEventListener("click", () => {
        try {
          const result = buildOnePlanner();
          renderTextTriplet("outPlanner", [result], "fmtPlanner");
          toast("撮影モード生成完了");
        } catch (error) {
          toast("撮影モード生成に失敗しました");
        }
      });
    }
    
    // 撮影モードのコピーボタン
    bindCopyTripletExplicit([
      ["btnCopyPlannerAll", "outPlannerAll"],
      ["btnCopyPlannerPrompt", "outPlannerPrompt"],
      ["btnCopyPlannerNeg", "outPlannerNeg"]
    ]);
  };
  
// 撮影モードのレンダリング修正
window.initPlannerItems = function() {
  // ★★★ 辞書データの参照方法を統一 ★★★
  const SFW_DICT = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  
  if (!SFW_DICT) {
    return;
  }
  

  
  // 撮影モード用のラジオボタンリスト初期化
  radioList($("#pl_bg"), SFW_DICT.background, "pl_bg", {checkFirst: false});
  radioList($("#pl_pose"), SFW_DICT.pose, "pl_pose", {checkFirst: false});
  //radioList($("#pl_comp"), SFW_DICT.composition, "pl_comp", {checkFirst: false});
  //radioList($("#pl_view"), SFW_DICT.view, "pl_view", {checkFirst: false});
  radioList($("#pl_expr"), SFW_DICT.expressions, "pl_expr", {checkFirst: false});
  radioList($("#pl_light"), SFW_DICT.lighting, "pl_light", {checkFirst: false});
  
  // ★★★ 撮影モード専用要素（存在チェック付き） ★★★
  if (SFW_DICT.camera_angle) radioList($("#pl_cameraAngle"), SFW_DICT.camera_angle, "pl_cameraAngle", {checkFirst: false});
  if (SFW_DICT.focal_length) radioList($("#pl_focalLength"), SFW_DICT.focal_length, "pl_focalLength", {checkFirst: false});
  if (SFW_DICT.depth_of_field) radioList($("#pl_depthOfField"), SFW_DICT.depth_of_field, "pl_depthOfField", {checkFirst: false});
  if (SFW_DICT.photo_technique) radioList($("#pl_photoTechnique"), SFW_DICT.photo_technique, "pl_photoTechnique", {checkFirst: false});
  if (SFW_DICT.lighting_type) radioList($("#pl_lightingType"), SFW_DICT.lighting_type, "pl_lightingType", {checkFirst: false});
  if (SFW_DICT.light_direction) radioList($("#pl_lightDirection"), SFW_DICT.light_direction, "pl_lightDirection", {checkFirst: false});
  if (SFW_DICT.time_of_day) radioList($("#pl_timeOfDay"), SFW_DICT.time_of_day, "pl_timeOfDay", {checkFirst: false});

  // アクセサリーセレクト更新
  const plAccSel = document.getElementById("pl_accSel");
  if (plAccSel && SFW_DICT.accessories) {
    const options = '<option value="">（未選択）</option>' + 
      SFW_DICT.accessories.map(acc => `<option value="${acc.tag}">${acc.label || acc.tag}</option>`).join('');
    plAccSel.innerHTML = options;
  }
};

  // renderPlannerNSFW関数を修正
  function renderPlannerNSFW() {
  const level = document.querySelector('input[name="pl_nsfwLevel"]:checked')?.value || "L1";
  const order = { L1: 1, L2: 2, L3: 3 };
  const allowLevel = (lv) => (order[lv || "L1"] || 1) <= (order[level] || 1);
  const levelLabel = (x) => ({ L1: "R-15", L2: "R-18", L3: "R-18G" }[x || "L1"] || "R-15");
  
  const filterByLevel = (arr) => normList(arr).filter(x => allowLevel(x.level));
  
  const createRadio = (item, name) => 
    `<label class="chip">
      <input type="radio" name="${name}" value="${item.tag}">
      ${item.label}<span class="mini"> ${levelLabel(item.level)}</span>
    </label>`;

  // 各NSFW要素を描画（ラジオボタン、未選択オプション付き）
  const nsfwElements = [
    ['pl_nsfw_expo', 'exposure', NSFW.exposure],
    ['pl_nsfw_underwear', 'underwear', NSFW.underwear],
    ['pl_nsfw_outfit', 'outfit', NSFW.outfit],
    ['pl_nsfw_expr', 'expression', NSFW.expression],
    ['pl_nsfw_situ', 'situation', NSFW.situation],
    ['pl_nsfw_light', 'lighting', NSFW.lighting],
    ['pl_nsfw_pose', 'pose', NSFW.pose],
    ['pl_nsfw_acc', 'accessory', NSFW.accessory],
    ['pl_nsfw_body', 'body', NSFW.body],
    ['pl_nsfw_nipple', 'nipples', NSFW.nipples]
  ];

  nsfwElements.forEach(([elementId, category, items]) => {
    const element = document.getElementById(elementId);
    if (element && items) {
      const radioList = filterByLevel(items).map(item => createRadio(item, elementId)).join('');
      const noneOption = `<label class="chip">
        <input type="radio" name="${elementId}" value="" checked>
        <span>（未選択）</span>
      </label>`;
      element.innerHTML = noneOption + radioList;
    }
  });
}
  
  window.renderPlannerNSFW = renderPlannerNSFW;
}

/* ===== 基本情報の初期化とバインド ===== */
function bindBasicInfo() {
  // キャラ設定インポート
  const importChar = document.getElementById("importChar");
  if (importChar) {
    importChar.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // 基本情報を復元
        if (data.charName) {
          const charNameEl = document.getElementById("charName");
          if (charNameEl) charNameEl.value = data.charName;
        }
        
        if (data.loraTag) {
          const loraTagEl = document.getElementById("loraTag");
          if (loraTagEl) loraTagEl.value = data.loraTag;
        }
        
        // 服モード復元
        if (data.outfitMode) {
          const outfitModeRadio = document.querySelector(`input[name="outfitMode"][value="${data.outfitMode}"]`);
          if (outfitModeRadio) outfitModeRadio.checked = true;
        }
        
        // 下カテゴリ復元
        if (data.bottomCat) {
          const bottomCatRadio = document.querySelector(`input[name="bottomCat"][value="${data.bottomCat}"]`);
          if (bottomCatRadio) bottomCatRadio.checked = true;
        }
        
        // ラジオボタンの復元
        ['bf_age', 'bf_gender', 'bf_body', 'bf_height', 'hairStyle', 'hairLength', 'bangsStyle', 'skinFeatures', 'eyeShape'].forEach(name => {
          if (data[name]) {
            const radio = document.querySelector(`input[name="${name}"][value="${data[name]}"]`);
            if (radio) radio.checked = true;
          }
        });
        
        // 服の選択を復元
        ['outfit_top', 'outfit_pants', 'outfit_skirt', 'outfit_dress', 'outfit_shoes'].forEach(name => {
          if (data[name]) {
            const radio = document.querySelector(`input[name="${name}"][value="${data[name]}"]`);
            if (radio) radio.checked = true;
          }
        });
        
        // ★★★ アクセサリーの復元 ★★★
        if (data.characterAccessory) {
          const charAccSel = document.getElementById("characterAccessory");
          if (charAccSel) charAccSel.value = data.characterAccessory;
        }
        
        // 色の復元（髪・目・肌）
        if (data.hairColor) {
          const satH = document.getElementById("satH");
          const litH = document.getElementById("litH");
          if (satH && data.hairColor.s) satH.value = data.hairColor.s;
          if (litH && data.hairColor.l) litH.value = data.hairColor.l;
          if (data.hairColor.h !== undefined && window.getHairColorTag) {
            setTimeout(() => paintHairColor(data.hairColor.h), 100);
          }
        }
        
        if (data.eyeColor) {
          const satE = document.getElementById("satE");
          const litE = document.getElementById("litE");
          if (satE && data.eyeColor.s) satE.value = data.eyeColor.s;
          if (litE && data.eyeColor.l) litE.value = data.eyeColor.l;
          if (data.eyeColor.h !== undefined && window.getEyeColorTag) {
            setTimeout(() => paintEyeColor(data.eyeColor.h), 100);
          }
        }
        
        if (data.skinTone !== undefined) {
          const skinTone = document.getElementById("skinTone");
          if (skinTone) skinTone.value = data.skinTone;
        }
        
        // 服の色の復元
        ['top', 'bottom', 'shoes'].forEach(type => {
          if (data[`${type}Color`]) {
            const useCheckbox = document.getElementById(`use_${type}`);
            const sat = document.getElementById(`sat_${type}`);
            const lit = document.getElementById(`lit_${type}`);
            
            if (useCheckbox) useCheckbox.checked = data[`${type}Color`].use !== false;
            if (sat && data[`${type}Color`].s !== undefined) sat.value = data[`${type}Color`].s;
            if (lit && data[`${type}Color`].l !== undefined) lit.value = data[`${type}Color`].l;
            
            if (data[`${type}Color`].h !== undefined) {
              const colorFunc = window[`get${type.charAt(0).toUpperCase()}${type.slice(1)}Color`];
              if (colorFunc) {
                setTimeout(() => {
                  const wheel = document.getElementById(`wheel_${type}`);
                  const thumb = document.getElementById(`thumb_${type}`);
                  if (wheel && thumb) {
                    const rect = wheel.getBoundingClientRect();
                    const radius = rect.width / 2 - 7;
                    const radians = (data[`${type}Color`].h - 90) * Math.PI / 180;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    
                    thumb.style.left = (centerX + radius * Math.cos(radians) - 7) + "px";
                    thumb.style.top = (centerY + radius * Math.sin(radians) - 7) + "px";
                    
                    // 色相更新
                    if (colorFunc.onHue) colorFunc.onHue(data[`${type}Color`].h);
                  }
                }, 150);
              }
            }
          }
        });
        
        // ★★★ アクセサリー色の復元 ★★★
        if (data.charAccColor) {
          const satCharAcc = document.getElementById("sat_charAcc");
          const litCharAcc = document.getElementById("lit_charAcc");
          if (satCharAcc && data.charAccColor.s !== undefined) satCharAcc.value = data.charAccColor.s;
          if (litCharAcc && data.charAccColor.l !== undefined) litCharAcc.value = data.charAccColor.l;
          
          if (data.charAccColor.h !== undefined) {
            setTimeout(() => {
              const wheel = document.getElementById("wheel_charAcc");
              const thumb = document.getElementById("thumb_charAcc");
              if (wheel && thumb) {
                const rect = wheel.getBoundingClientRect();
                const radius = rect.width / 2 - 7;
                const radians = (data.charAccColor.h - 90) * Math.PI / 180;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                thumb.style.left = (centerX + radius * Math.cos(radians) - 7) + "px";
                thumb.style.top = (centerY + radius * Math.sin(radians) - 7) + "px";
                
                if (window.getCharAccColor?.onHue) {
                  window.getCharAccColor.onHue(data.charAccColor.h);
                }
              }
            }, 200);
          }
        }
        
        // UI更新
        setTimeout(() => {
          if (window.applyOutfitMode) window.applyOutfitMode();
          paintSkin();
          // ★★★ アクセサリー表示更新 ★★★
          if (window.updateCharAccDisplay) window.updateCharAccDisplay();
        }, 250);
        
        toast("キャラ設定を読み込みました");
      } catch (error) {
        toast("キャラ設定の読み込みに失敗しました");
      }
      
      e.target.value = "";
    });
  }
  
  // キャラ設定エクスポート
  const exportChar = document.getElementById("btnExportChar");
  if (exportChar) {
    exportChar.addEventListener("click", () => {
      const data = {
        charName: document.getElementById("charName")?.value || "",
        loraTag: document.getElementById("loraTag")?.value || "",
        // 服モード
        outfitMode: getOne('outfitMode'),
        bottomCat: getOne('bottomCat'),
        // 基本情報
        bf_age: getOne('bf_age'),
        bf_gender: getOne('bf_gender'),
        bf_body: getOne('bf_body'),
        bf_height: getOne('bf_height'),
        hairStyle: getOne('hairStyle'),
       // ★★★ 以下3行を追加 ★★★
        hairLength: getOne('hairLength'),
        bangsStyle: getOne('bangsStyle'),
        skinFeatures: getOne('skinFeatures'),
        eyeShape: getOne('eyeShape'),
        face: getOne('face'),
        skinBody: getOne('skinBody'),
        artStyle: getOne('artStyle'),
        // ★★★ アクセサリー追加 ★★★
        characterAccessory: document.getElementById("characterAccessory")?.value || "",
        // 服
        outfit_top: getOne('outfit_top'),
        outfit_pants: getOne('outfit_pants'),
        outfit_skirt: getOne('outfit_skirt'),
        outfit_dress: getOne('outfit_dress'),
        outfit_shoes: getOne('outfit_shoes'),
        // 色情報（髪・目・肌）
        hairColor: {
          h: window.getHairColorTag?.onHue?.__lastHue || 35,
          s: document.getElementById("satH")?.value || 70,
          l: document.getElementById("litH")?.value || 45
        },
        eyeColor: {
          h: window.getEyeColorTag?.onHue?.__lastHue || 240,
          s: document.getElementById("satE")?.value || 80,
          l: document.getElementById("litE")?.value || 55
        },
        skinTone: document.getElementById("skinTone")?.value || 30,
        // 服の色情報
        topColor: {
          use: document.getElementById("use_top")?.checked || false,
          h: window.getTopColor?.onHue?.__lastHue || 35,
          s: document.getElementById("sat_top")?.value || 80,
          l: document.getElementById("lit_top")?.value || 55
        },
        bottomColor: {
          use: document.getElementById("useBottomColor")?.checked || false,
          h: window.getBottomColor?.onHue?.__lastHue || 210,
          s: document.getElementById("sat_bottom")?.value || 70,
          l: document.getElementById("lit_bottom")?.value || 50
        },
        shoesColor: {
          use: document.getElementById("use_shoes")?.checked || false,
          h: window.getShoesColor?.onHue?.__lastHue || 0,
          s: document.getElementById("sat_shoes")?.value || 0,
          l: document.getElementById("lit_shoes")?.value || 30
        },
        // ★★★ アクセサリー色情報追加 ★★★
        charAccColor: {
          use: true, // 固定アクセは選択されていれば常に使用
          h: window.getCharAccColor?.onHue?.__lastHue || 0,
          s: document.getElementById("sat_charAcc")?.value || 75,
          l: document.getElementById("lit_charAcc")?.value || 50
        }
      };
      
      const filename = `character_${data.charName || 'unnamed'}_${nowStamp()}.json`;
      dl(filename, JSON.stringify(data, null, 2));
      toast("キャラ設定をエクスポートしました");
    });
  }
  
  // 1枚テストボタン
  const btnOneLearn = document.getElementById("btnOneLearn");
  if (btnOneLearn) {
    btnOneLearn.addEventListener("click", () => {
      try {
        const result = buildOneLearning(0);
        renderTextTriplet("outLearnTest", [result], "fmtLearn");
        toast("テスト生成完了");
      } catch (error) {
        toast("テスト生成に失敗しました");
      }
    });
  }
  
  // 1枚テストのコピーボタン
  bindCopyTripletExplicit([
    ["btnCopyLearnTestAll", "outLearnTestAll"],
    ["btnCopyLearnTestPrompt", "outLearnTestPrompt"],
    ["btnCopyLearnTestNeg", "outLearnTestNeg"]
  ]);
}

/* ===== 色ホイールの修正 ===== */
function paintHairColor(hue) {
  if (typeof hue === 'number') {
    // 髪色ホイールの色相を設定
    const satH = document.getElementById("satH");
    const litH = document.getElementById("litH");
    const swH = document.getElementById("swH");
    const tagH = document.getElementById("tagH");
    
    if (satH && litH && swH && tagH) {
      const s = +satH.value;
      const l = +litH.value;
      const [r, g, b] = hslToRgb(hue, s, l);
      swH.style.background = `rgb(${r},${g},${b})`;
      const cname = colorNameFromHSL(hue, s, l);
      tagH.textContent = `${cname} hair`;
    }
  }
}

function paintEyeColor(hue) {
  if (typeof hue === 'number') {
    // 目色ホイールの色相を設定
    const satE = document.getElementById("satE");
    const litE = document.getElementById("litE");
    const swE = document.getElementById("swE");
    const tagE = document.getElementById("tagE");
    
    if (satE && litE && swE && tagE) {
      const s = +satE.value;
      const l = +litE.value;
      const [r, g, b] = hslToRgb(hue, s, l);
      swE.style.background = `rgb(${r},${g},${b})`;
      const cname = colorNameFromHSL(hue, s, l);
      tagE.textContent = `${cname} eyes`;
    }
  }
}

/* ===== 服モード対応のヘルパー関数 ===== */
function getIsOnepiece() {
  const outfitMode = getOne('outfitMode');
  return outfitMode === 'onepiece';
}

/* ===== プロンプト生成関数群 ===== */

// キャプション用プロンプトを生成する関数（solo, 1girl/1boy, 服関連を除外）
function buildCaptionPrompt() {
  const textOf = id => (document.getElementById(id)?.textContent || "").trim();
  let p = [];
  
  // LoRAタグ
  const loraTag = (document.getElementById('loraTag')?.value || '').trim();
  if (loraTag) p.push(loraTag);
  
  // 基本情報（年齢・性別・体型・身長・髪型・目の形・髪色・目色・肌色のみ）
  [
    getBFValue('age'),
    getBFValue('gender'), 
    getBFValue('body'),
    getBFValue('height'),
    getOne('hairStyle'),
    // ★★★ 以下3行を追加 ★★★
    getOne('hairLength'),
    getOne('bangsStyle'),
    getOne('skinFeatures'),
     
    getOne('eyeShape'),
    textOf('tagH'),  // 髪色
    textOf('tagE'),  // 目色
    textOf('tagSkin') // 肌色
  ].filter(Boolean).forEach(v => p.push(v));
  
  // 固定タグ
  const fixed = (document.getElementById('fixedLearn')?.value || "").trim();
  if (fixed) {
    const f = fixed.split(/\s*,\s*/).filter(Boolean);
    p.push(...f);
  }
  
  return p.join(", ");
}


// buildOnePlanner関数を修正（NSFW優先で重複を1つに統一）
function buildOnePlanner() {
  const textOf = id => (document.getElementById(id)?.textContent || "").trim();
  const pushUnique = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
  let p = [];

  // ★★★ 修正：LoRAタグを最優先で先頭に追加 ★★★
  const loraTag = (document.getElementById('loraTag')?.value || '').trim();
  if (loraTag) p.push(loraTag);

  // NSFWチェック
  const isNSFW = !!document.getElementById("pl_nsfw")?.checked;
  if (isNSFW) pushUnique(p, "NSFW");

  // solo, 1girl/1boy は撮影モードでは追加しない

  // const g = getGenderCountTag() || "";
  // if (g) pushUnique(p, g);

  // 基本情報（SFW基礎）
  [
    getBFValue('age'),
    getBFValue('gender'),
    getBFValue('body'),
    getBFValue('height'),
    getOne('hairStyle'),
    getOne('hairLength'),    // ← 追加
    getOne('bangsStyle'),    // ← 追加
    getOne('skinFeatures'),  // ← 追加
    getOne('eyeShape'),
    textOf('tagH'),
    textOf('tagE'),
    textOf('tagSkin')
  ].filter(Boolean).forEach(v => pushUnique(p, v));

  // ===== 服：NSFW衣装・下着・露出が選ばれていれば基本服を除外 =====
  let hasNSFWClothing = false;
  if (isNSFW) {
    // NSFW衣装・下着・露出のチェック
    const nsfwOutfits = getMany("pl_nsfw_outfit");
    const nsfwUnderwear = getMany("pl_nsfw_underwear");
    const nsfwExposure = getMany("pl_nsfw_expo");
    
    if ((nsfwOutfits && nsfwOutfits.length > 0) || 
        (nsfwUnderwear && nsfwUnderwear.length > 0) || 
        (nsfwExposure && nsfwExposure.length > 0)) {
      hasNSFWClothing = true;
      
      // NSFW衣装・下着・露出を追加
      if (nsfwOutfits && nsfwOutfits.length > 0) {
        nsfwOutfits.forEach(v => pushUnique(p, v));
      }
      if (nsfwUnderwear && nsfwUnderwear.length > 0) {
        nsfwUnderwear.forEach(v => pushUnique(p, v));
      }
      if (nsfwExposure && nsfwExposure.length > 0) {
        nsfwExposure.forEach(v => pushUnique(p, v));
      }
    }
  }
  
  // NSFW衣装関連が選ばれていない場合のみ基本服を使用
  if (!hasNSFWClothing) {
    const isOnepiece = getIsOnepiece();
    const outfits = [];
    const colorTags = {
      top:   textOf('tag_top'),
      bottom:textOf('tag_bottom'),
      shoes: textOf('tag_shoes'),
    };
    if (isOnepiece) {
      const dress = getOne('outfit_dress');
      if (dress) outfits.push(dress);
    } else {
      const top = getOne('outfit_top');
      const bottomCat = getOne('bottomCat') || 'pants';
      const pants = getOne('outfit_pants');
      const skirt = getOne('outfit_skirt');
      const shoes = getOne('outfit_shoes');
      if (top) outfits.push(top);
      if (bottomCat === 'pants' && pants) outfits.push(pants);
      if (bottomCat === 'skirt' && skirt) outfits.push(skirt);
      if (shoes) outfits.push(shoes);
    }
    makeFinalOutfitTags(outfits, colorTags).forEach(v => pushUnique(p, v));
  }

  // 固定タグ（先頭に付与）
  const fixed = (document.getElementById('fixedPlanner')?.value || "").trim();
  if (fixed) {
    const fixedTags = fixed.split(/\s*,\s*/).filter(Boolean);
    p = [...fixedTags.filter(t => !p.includes(t)), ...p];
  }

  // ===== SFW/NSFW の競合カテゴリは「NSFW優先で1つだけ」採用（未選択対応） =====
  // 対応表：同じ"概念カテゴリ"でNSFWの方を優先
  const pairs = [
    { sfwId: 'pl_pose',  nsfwId: 'pl_nsfw_pose'  },
    { sfwId: 'pl_light', nsfwId: 'pl_nsfw_light' },
    { sfwId: 'pl_expr',  nsfwId: 'pl_nsfw_expr'  },
  ];
  pairs.forEach(({ sfwId, nsfwId }) => {
    let picked = null;
    if (isNSFW) {
      const ns = getMany(nsfwId);
      if (ns && ns.length > 0) picked = ns[0];
    }
    if (!picked) {
      picked = getOne(sfwId);
    }
    if (picked) pushUnique(p, picked);
  });

  // SFWのみの単独カテゴリはそのまま1つ採用（未選択対応）
   ['pl_bg'].forEach(id => {
     const v = getOne(id);
     if (v) pushUnique(p, v);
   });

  // ★★★ 撮影モード専用要素を追加 ★★★
  ['pl_cameraAngle', 'pl_focalLength', 'pl_depthOfField', 'pl_photoTechnique', 
   'pl_lightingType', 'pl_lightDirection', 'pl_timeOfDay'].forEach(id => {
    const v = getOne(id);
    if (v) pushUnique(p, v);
  });

  // ★★★ 修正：アクセ処理を基本情報のcharacterAccessoryに変更 ★★★
  (function handleAccessory() {
    let picked = null;
    if (isNSFW) {
      const ns = getMany('pl_nsfw_acc');
      if (ns && ns.length > 0) picked = ns[0];
    }
    if (!picked) {
      // 基本情報のcharacterAccessoryを使用
      const charAccSel = document.getElementById("characterAccessory");
      const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
      if (charAccSel && charAccSel.value) {
        if (charAccColor && charAccColor !== "—") {
          picked = `${charAccColor} ${charAccSel.value}`;
        } else {
          picked = charAccSel.value;
        }
      }
    }
    if (picked) pushUnique(p, picked);
  })();

  // ===== NSFW専用カテゴリ（SFWに相当なし）は各1つだけ（未選択対応） =====
  if (isNSFW) {
    ['pl_nsfw_situ', 'pl_nsfw_body', 'pl_nsfw_nipple']
      .forEach(id => {
        const list = getMany(id);
        if (list && list.length > 0) pushUnique(p, list[0]);
      });
  }

  // ネガティブプロンプト
  const useDefNeg = !!document.getElementById('pl_useDefaultNeg')?.checked;
  const addNeg = (document.getElementById('negPlanner')?.value || "").trim();
  const neg = buildNegative(addNeg, useDefNeg);

  const seed = seedFromName((document.getElementById('charName')?.value || ''), 0);
  const prompt = p.join(", ");
  // buildOnePlanner関数の最後のreturn文を以下に置き換え

  // ★★★ Nano-banana用プロンプトを作成（基本情報除外） ★★★
  const basicInfoTags = [
    getBFValue('age'),
    getBFValue('gender'), 
    getBFValue('body'),
    getBFValue('height'),
    getOne('hairStyle'),
    getOne('hairLength'),
    getOne('bangsStyle'),
    getOne('skinFeatures'),
    getOne('eyeShape'),
    textOf('tagH'),
    textOf('tagE'),
    textOf('tagSkin'),
    loraTag  // LoRAタグも除外
  ].filter(Boolean);

  console.log("🔍 基本情報タグ:", basicInfoTags);
  
  // 全プロンプトから基本情報を除外してNano-banana用プロンプトを作成
  const allTags = prompt.split(", ");
  console.log("🔍 全タグ:", allTags);
  
  const nanoBananaPrompt = allTags.filter(tag => !basicInfoTags.includes(tag)).join(", ");
  console.log("🔍 Nano-banana用プロンプト:", nanoBananaPrompt);

  const result = { 
    seed, 
    pos: p, 
    neg, 
    prompt, 
    nanoBananaPrompt,  // ← これを追加
    text: `${prompt}${neg ? ` --neg ${neg}` : ""} seed:${seed}` 
  };
  
  // デバッグ用
  window.lastPlannerResult = result;
  console.log("🔍 buildOnePlanner結果:", result);
  
  return result;
}




// buildOneLearning関数を修正（1枚テスト用）
function buildOneLearning(extraSeed = 0){
  const textOf = id => (document.getElementById(id)?.textContent || "").trim();
  let p = [];
  
  // NSFWチェック
  const isNSFW = document.getElementById("nsfwLearn")?.checked;
  if (isNSFW) {
    p.push("NSFW");
  }
  
  p.push("solo");
  
  const g = getGenderCountTag() || "";
  if (g) p.push(g);

  p.push(...[
    getBFValue('age'), getBFValue('gender'), getBFValue('body'), getBFValue('height'),
    getOne('hairStyle'), getOne('eyeShape'),
    // ★★★ 以下3行を追加 ★★★
     getOne('hairLength'),
     getOne('bangsStyle'), 
     getOne('skinFeatures'),
    textOf('tagH'), textOf('tagE'), textOf('tagSkin')
  ].filter(Boolean));

  // 服の処理（ワンピース対応、NSFW優先）
  const isOnepiece = getIsOnepiece();
  const wearMode = document.querySelector('input[name="learnWearMode"]:checked')?.value || 'basic';
  
  let hasNSFWClothing = false;
  if (isNSFW) {
    // NSFW衣装・下着・露出のチェック
    const nsfwOutfits = getMany("nsfwL_outfit");
    const nsfwUnderwear = getMany("nsfwL_underwear");
    const nsfwExposure = getMany("nsfwL_expo");
    
    if ((nsfwOutfits.length > 0) || (nsfwUnderwear.length > 0) || (nsfwExposure.length > 0)) {
      hasNSFWClothing = true;
      
      // NSFW衣装・下着・露出を追加（1つずつ）
      if (nsfwOutfits.length > 0) p.push(nsfwOutfits[0]);
      if (nsfwUnderwear.length > 0) p.push(nsfwUnderwear[0]);
      if (nsfwExposure.length > 0) p.push(nsfwExposure[0]);
    }
  }
  
  if (!hasNSFWClothing && wearMode === 'basic') {
    const outfits = [];
    // ★★★ 修正箇所：チェックボックス状態を確認して色タグを取得 ★★★
    const colorTags = {
      top: document.getElementById('use_top')?.checked ? 
           textOf('tag_top').replace(/^—$/, "") : "",
      bottom: document.getElementById('useBottomColor')?.checked ? 
              textOf('tag_bottom').replace(/^—$/, "") : "",
      shoes: document.getElementById('use_shoes')?.checked ? 
             textOf('tag_shoes').replace(/^—$/, "") : ""
    };

    if (isOnepiece) {
      const dress = getOne('outfit_dress');
      if (dress) outfits.push(dress);
    } else {
      const top = getOne('outfit_top');
      const bottomCat = getOne('bottomCat') || 'pants';
      const pants = getOne('outfit_pants');
      const skirt = getOne('outfit_skirt');
      const shoes = getOne('outfit_shoes');
      
      if (top) outfits.push(top);
      if (bottomCat === 'pants' && pants) outfits.push(pants);
      else if (bottomCat === 'skirt' && skirt) outfits.push(skirt);
      if (shoes) outfits.push(shoes);
    }

    const finalOutfits = makeFinalOutfitTags(outfits, colorTags);
    p.push(...finalOutfits);
  }

  // ★★★ 修正：基本情報のアクセサリー（characterAccessory）を使用 ★★★
  const charAccSel = document.getElementById("characterAccessory");
  const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
  if (charAccSel && charAccSel.value) {
    if (charAccColor && charAccColor !== "—") {
      p.push(`${charAccColor} ${charAccSel.value}`);
    } else {
      p.push(charAccSel.value);
    }
  }

  // NSFW体型（未選択対応）
  if (isNSFW) {
    const nsfwBody = getMany("nsfwL_body");
    if (nsfwBody.length > 0) p.push(nsfwBody[0]); // 1つだけ
  }
  
  // その他のNSFW要素（衣装・下着・露出以外）
  if (isNSFW) {
    ['nsfwL_situ', 'nsfwL_light', 'nsfwL_pose', 'nsfwL_acc', 'nsfwL_nipple'].forEach(categoryId => {
      const items = getMany(categoryId);
      if (items.length > 0) p.push(items[0]);
    });
  }

  // ★★★ 1枚テスト用：選択されたもののみ使用（配分ルールなし、未選択対応） ★★★
  const categories = [
    { sfw: 'bg', nsfw: null, key: 'bg' },
    { sfw: 'pose', nsfw: null, key: 'pose' },
    { sfw: 'comp', nsfw: null, key: 'comp' },
    { sfw: 'view', nsfw: null, key: 'view' },
    { sfw: 'expr', nsfw: 'nsfwL_expr', key: 'expr' }
  ];

  categories.forEach(({ sfw, nsfw, key }) => {
    let selected = null;
    
    // NSFW優先
    if (isNSFW && nsfw) {
      const nsfwSelected = getMany(nsfw);
      if (nsfwSelected.length > 0) {
        selected = nsfwSelected[0];
      }
    }
    
    // NSFWで選択されなかった場合はSFW
    if (!selected) {
      const sfwSelected = getOne(sfw);
      if (sfwSelected) selected = sfwSelected;
    }
    
    if (selected) p.push(selected);
  });

  const fixed = (document.getElementById('fixedLearn')?.value || "").trim();
  if (fixed){
    const f = fixed.split(/\s*,\s*/).filter(Boolean);
    p = [...f, ...p];
  }

  const useDefNeg = !!document.getElementById('useDefaultNeg')?.checked;
  const addNeg    = (document.getElementById('negLearn')?.value || "").trim();
  const neg = buildNegative(addNeg, useDefNeg);

  const seed = seedFromName((document.getElementById('charName')?.value || ''), extraSeed);
  const prompt = p.join(", ");
  const text = `${prompt}${neg?` --neg ${neg}`:""} seed:${seed}`;
  
  // ★★★ キャプション用プロンプトを生成（1枚テスト用） ★★★
  const caption = buildCaptionPrompt();
  
  return { 
    seed, 
    pos: p, 
    neg, 
    prompt, 
    text,
    caption  // ← 追加
  };
}

// ===== 学習用配分ルールに基づいたバッチ生成関数を追加 =====
function buildBatchLearning(n) {
  const want = Math.max(1, Number(n) || 1);
  const rows = [];
  
  // 共通のネガティブプロンプト
  const commonNeg = buildNegative((document.getElementById("negLearn")?.value || "").trim(), 
                                  !!document.getElementById('useDefaultNeg')?.checked);
  
  // ベースseed
  const name = (document.getElementById('charName')?.value || "");
  const baseSeed = seedFromName(name, 0);
  
  for (let i = 0; i < want; i++) {
    let p = [];
    
    // LoRAタグを最優先で先頭に追加
    const loraTag = (document.getElementById('loraTag')?.value || '').trim();
    if (loraTag) p.push(loraTag);
    
    // NSFWチェック
    const isNSFW = document.getElementById("nsfwLearn")?.checked;
    if (isNSFW) p.push("NSFW");
    
    // solo, 1girl/1boy
    p.push("solo");
    const g = getGenderCountTag() || "";
    if (g) p.push(g);
    
    // 基本情報
    const textOf = id => (document.getElementById(id)?.textContent || "").trim();
    p.push(...[
      getBFValue('age'), 
      getBFValue('gender'), 
      getBFValue('body'), 
      getBFValue('height'),
      getOne('hairStyle'), 
      getOne('hairLength'),    // ← 追加
      getOne('bangsStyle'),    // ← 追加
      getOne('skinFeatures'),  // ← 追加
      getOne('eyeShape'),
      textOf('tagH'), 
      textOf('tagE'), 
      textOf('tagSkin')
    ].filter(Boolean));
    
    // 学習モード用のNSFW要素処理（衣装・下着・露出優先、未選択対応）
    let hasNSFWClothing = false;
    
    if (isNSFW) {
      // NSFW衣装・下着・露出のチェック
      const nsfwOutfits = getMany("nsfwL_outfit");
      const nsfwUnderwear = getMany("nsfwL_underwear");
      const nsfwExposure = getMany("nsfwL_expo");
      
      if ((nsfwOutfits.length > 0) || (nsfwUnderwear.length > 0) || (nsfwExposure.length > 0)) {
        hasNSFWClothing = true;
        
        // NSFW衣装・下着・露出を追加
        if (nsfwOutfits.length > 0) p.push(pick(nsfwOutfits));
        if (nsfwUnderwear.length > 0) p.push(pick(nsfwUnderwear));
        if (nsfwExposure.length > 0) p.push(pick(nsfwExposure));
      }
    }
    
    if (!hasNSFWClothing) {
      const wearMode = document.querySelector('input[name="learnWearMode"]:checked')?.value || 'basic';
      
      if (wearMode === 'basic') {
        const isOnepiece = getIsOnepiece();
        const outfits = [];
        const colorTags = {
          top: document.getElementById('use_top')?.checked ? 
               textOf('tag_top').replace(/^—$/, "") : "",
          bottom: document.getElementById('useBottomColor')?.checked ? 
                  textOf('tag_bottom').replace(/^—$/, "") : "",
          shoes: document.getElementById('use_shoes')?.checked ? 
                 textOf('tag_shoes').replace(/^—$/, "") : ""
        };
        
        if (isOnepiece) {
          const dress = getOne('outfit_dress');
          if (dress) outfits.push(dress);
        } else {
          const top = getOne('outfit_top');
          const bottomCat = getOne('bottomCat') || 'pants';
          const pants = getOne('outfit_pants');
          const skirt = getOne('outfit_skirt');
          const shoes = getOne('outfit_shoes');
          
          if (top) outfits.push(top);
          if (bottomCat === 'pants' && pants) outfits.push(pants);
          else if (bottomCat === 'skirt' && skirt) outfits.push(skirt);
          if (shoes) outfits.push(shoes);
        }
        
        const finalOutfits = makeFinalOutfitTags(outfits, colorTags);
        p.push(...finalOutfits);
      }
    }
    
    // 固定アクセサリー
    // ★★★ 修正：基本情報のアクセサリー（characterAccessory）を使用 ★★★
    const charAccSel = document.getElementById("characterAccessory");
    const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
    if (charAccSel && charAccSel.value) {
      if (charAccColor && charAccColor !== "—") {
        p.push(`${charAccColor} ${charAccSel.value}`);
      } else {
        p.push(charAccSel.value);
      }
    }
    
    // NSFW体型（未選択対応）
    if (isNSFW) {
      const nsfwBody = getMany("nsfwL_body");
      if (nsfwBody.length > 0) p.push(pick(nsfwBody));
    }
    
    // 配分ルールに基づく要素選択（未選択対応）
    const categories = [
      { key: 'bg', sfw: null, nsfw: null },
      { key: 'pose', sfw: null, nsfw: null },
      { key: 'comp', sfw: null, nsfw: null },  
      { key: 'view', sfw: null, nsfw: null },
      { key: 'expr', sfw: null, nsfw: 'nsfwL_expr' },
      { key: 'light', sfw: null, nsfw: null }
    ];
    
    categories.forEach(({ key, sfw, nsfw }) => {
      let selected = null;
      
      // NSFW優先
      if (isNSFW && nsfw) {
        const nsfwItems = getMany(nsfw);
        if (nsfwItems.length > 0) {
          selected = pick(nsfwItems);
        }
      }
      
      // NSFWで選択されなかった場合は配分ルールで選択
      if (!selected) {
        selected = pickByDistribution(key);
      }
      
      if (selected) p.push(selected);
    });
    
    // その他のNSFW要素（衣装・下着・露出・体型・表情以外）
    if (isNSFW) {
      ['nsfwL_situ', 'nsfwL_light', 'nsfwL_pose', 'nsfwL_acc', 'nsfwL_nipple'].forEach(categoryId => {
        const items = getMany(categoryId);
        if (items.length > 0) p.push(pick(items));
      });
    }
    
    // 固定タグを先頭付近に配置
    const fixed = (document.getElementById('fixedLearn')?.value || "").trim();
    if (fixed) {
      const fixedTags = fixed.split(/\s*,\s*/).filter(Boolean);
      const insertIndex = loraTag ? 1 : 0;
      p.splice(insertIndex, 0, ...fixedTags);
    }
    
    const seed = seedFromName(name, i);
    const prompt = p.join(", ");
    const caption = buildCaptionPrompt(); // キャプション生成
    
    rows.push({
      seed,
      pos: p,
      prompt,
      neg: commonNeg,
      text: `${prompt}${commonNeg ? ` --neg ${commonNeg}` : ""} seed:${seed}`,
      caption
    });
  }
  
  return rows;
}



// ベースから微差を作る（+1ずつでもOK）
function microJitterSeed(baseSeed, index) {
  // 32bit に収める
  return (baseSeed + index) >>> 0;       // もっと散らしたければ index*9973 などに
}

function getSeedMode() {
  const r = document.querySelector('input[name="seedMode"]:checked');
  return r ? r.value : 'fixed'; // 'fixed' | 'vary'
}

// 量産モード服装出力修正コード

// buildBatchProduction関数を修正
function buildBatchProduction(n){
  const want = Math.max(1, Number(n) || 1);
  const rows = [];
  
  // 共通のネガティブプロンプト
  const commonNeg = buildNegative((document.getElementById("p_neg")?.value || "").trim(), true);

  // ベースseed
  const name = (document.getElementById('charName')?.value || "");
  const baseSeed = seedFromName(name, 0);
  const seedMode = getSeedMode(); // 'fixed' or 'vary'

  for(let i=0; i<want; i++){
    let p = [];
    
    // LoRAタグを最優先で先頭に追加
    const loraTag = (document.getElementById('loraTag')?.value || '').trim();
    if (loraTag) p.push(loraTag);
    
    const isNSFW = document.getElementById("nsfwProd")?.checked;
    if (isNSFW) p.push("NSFW");

    // 量産モードではsoloは入れない  
    // p.push("solo");
    // const g = getGenderCountTag() || "";
    // if (g) p.push(g);

    // 基本情報を追加
    const textOf = id => (document.getElementById(id)?.textContent || "").trim();
    const basics = [
      textOf('tagH'),      // 髪色
      textOf('tagE'),      // 目色
      textOf('tagSkin'),   // 肌色
      getBFValue('age'), 
      getBFValue('gender'), 
      getBFValue('body'), 
      getBFValue('height'),
      getOne('hairStyle'),
      getOne('hairLength'),    // 追加
      getOne('bangsStyle'),    // 追加
      getOne('skinFeatures'),  // 追加
      getOne('eyeShape')
    ].filter(Boolean);
    p.push(...basics);

    // 👕 服装処理の修正（基本情報を参照）
    let hasNSFWClothing = false;
    if (isNSFW) {
      // NSFW衣装・下着・露出のチェック
      const nsfwOutfits = getMany("nsfwP_outfit");
      const nsfwUnderwear = getMany("nsfwP_underwear");
      const nsfwExposure = getMany("nsfwP_expo");
      
      if ((nsfwOutfits.length > 0) || (nsfwUnderwear.length > 0) || (nsfwExposure.length > 0)) {
        hasNSFWClothing = true;
        
        // NSFW衣装・下着・露出を追加
        if (nsfwOutfits.length > 0) p.push(pick(nsfwOutfits));
        if (nsfwUnderwear.length > 0) p.push(pick(nsfwUnderwear));
        if (nsfwExposure.length > 0) p.push(pick(nsfwExposure));
      }
    }
    
    if (!hasNSFWClothing) {
      // 🆕 服装モードの確認
      const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value || 'fixed';
      
      if (clothingMode === 'fixed') {
        // 基本情報の服装を使用
        const isOnepiece = getIsOnepiece();
        const outfits = [];
        
        // 基本情報の色タグを取得
        const baseColorTags = {
          top: document.getElementById('use_top')?.checked ? textOf('tag_top').replace(/^—$/, "") : "",
          bottom: document.getElementById('useBottomColor')?.checked ? textOf('tag_bottom').replace(/^—$/, "") : "",
          shoes: document.getElementById('use_shoes')?.checked ? textOf('tag_shoes').replace(/^—$/, "") : ""
        };
        
        if (isOnepiece) {
          const dress = getOne('outfit_dress');
          if (dress) outfits.push(dress);
        } else {
          const top = getOne('outfit_top');
          const bottomCat = getOne('bottomCat') || 'pants';
          const pants = getOne('outfit_pants');
          const skirt = getOne('outfit_skirt');
          const shoes = getOne('outfit_shoes');
          
          if (top) outfits.push(top);
          if (bottomCat === 'pants' && pants) outfits.push(pants);
          else if (bottomCat === 'skirt' && skirt) outfits.push(skirt);
          if (shoes) outfits.push(shoes);
        }
        
        // 基本情報のアクセサリー
        const charAccSel = document.getElementById("characterAccessory");
        const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
        if (charAccSel && charAccSel.value) {
          if (charAccColor && charAccColor !== "—") {
            outfits.push(`${charAccColor} ${charAccSel.value}`);
          } else {
            outfits.push(charAccSel.value);
          }
        }
        
        const finalOutfits = makeFinalOutfitTags(outfits, baseColorTags);
        p.push(...finalOutfits);
        
      } else {
        // バリエーションモード（既存のロジック）
        const topOutfits    = getMany("p_outfit_top");
        const pantsOutfits  = getMany("p_outfit_pants");
        const skirtOutfits  = getMany("p_outfit_skirt");
        const dressOutfits  = getMany("p_outfit_dress");
        const shoesOutfits  = getMany("p_outfit_shoes");
        
        const selectedOutfits = [];
        
        if (dressOutfits.length > 0) {
          selectedOutfits.push(pick(dressOutfits));
          if (shoesOutfits.length > 0) selectedOutfits.push(pick(shoesOutfits));
        } else {
          if (topOutfits.length > 0) selectedOutfits.push(pick(topOutfits));
          
          const allowBottomSwap = document.getElementById("allowBottomSwap")?.checked;
          let hasBottom = false;
          
          if (pantsOutfits.length > 0) {
            selectedOutfits.push(pick(pantsOutfits));
            hasBottom = true;
          } else if (allowBottomSwap && skirtOutfits.length > 0) {
            selectedOutfits.push(pick(skirtOutfits));
            hasBottom = true;
          }
          
          if (!hasBottom && skirtOutfits.length > 0) {
            selectedOutfits.push(pick(skirtOutfits));
          } else if (!hasBottom && allowBottomSwap && pantsOutfits.length > 0) {
            selectedOutfits.push(pick(pantsOutfits));
          }
          
          if (shoesOutfits.length > 0) {
            selectedOutfits.push(pick(shoesOutfits));
          }
        }

        // 量産モードの色タグを取得（— を除外）
        const norm = s => (s || "").replace(/^—$/, "");
        const prodColorTags = {
          top:    document.getElementById("p_use_top")?.checked    ? norm(document.getElementById("tag_p_top")?.textContent)    : "",
          bottom: document.getElementById("p_use_bottom")?.checked ? norm(document.getElementById("tag_p_bottom")?.textContent) : "",
          shoes:  document.getElementById("p_use_shoes")?.checked  ? norm(document.getElementById("tag_p_shoes")?.textContent)  : ""
        };

        const finalOutfits = makeFinalOutfitTags(selectedOutfits, prodColorTags);
        p.push(...finalOutfits);
      }
    }

    // アクセサリー（A/B/C）（バリエーションモード時のみ）
    const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value || 'fixed';
    if (clothingMode === 'vary') {
      ['p_accA', 'p_accB', 'p_accC'].forEach(accId => {
        const accSel = document.getElementById(accId);
        const accColorFunc = window[accId === 'p_accA' ? 'getAccAColor' : 
                                   accId === 'p_accB' ? 'getAccBColor' : 'getAccCColor'];
        const accColor = accColorFunc ? accColorFunc() : "";
        if (accSel && accSel.value && accColor && accColor !== "—") {
          p.push(`${accColor} ${accSel.value}`);
        } else if (accSel && accSel.value) {
          p.push(accSel.value);
        }
      });
    }

    // 背景/ポーズ/構図/表情：NSFW優先の1つ取り（未選択対応）
    const categories = [
      { sfw: 'p_bg',   nsfw: 'nsfwP_background' },
      { sfw: 'p_pose', nsfw: 'nsfwP_pose' },
      { sfw: 'p_comp', nsfw: null },
      { sfw: 'p_expr', nsfw: 'nsfwP_expr' }
    ];
    categories.forEach(({ sfw, nsfw }) => {
      let selected = null;
      if (isNSFW && nsfw) {
        const nsfwItems = getMany(nsfw);
        if (nsfwItems.length > 0) selected = pick(nsfwItems);
      }
      if (!selected) {
        const sfwItems = getMany(sfw);
        if (sfwItems.length > 0) selected = pick(sfwItems);
      }
      if (selected) p.push(selected);
    });

    // その他のNSFW要素（各カテゴリ1つまで、未選択対応）
    if (isNSFW) {
      const otherNSFWCats = ["nsfwP_situ", "nsfwP_light", "nsfwP_acc", "nsfwP_body", "nsfwP_nipple"];
      otherNSFWCats.forEach(cat => {
        const items = getMany(cat);
        if (items.length > 0) p.push(pick(items));
      });
    }

    // 固定タグをLoRAタグの次に配置
    const fixedProd = (document.getElementById('fixedProd')?.value || "").trim();
    if (fixedProd) {
      const fixedTags = fixedProd.split(/\s*,\s*/).filter(Boolean);
      // LoRAタグがある場合はその後に、ない場合は先頭近くに挿入
      const insertIndex = loraTag ? 1 : 0;
      p.splice(insertIndex, 0, ...fixedTags);
    }

    // seed の決定
    const seed = (seedMode === 'fixed')
      ? baseSeed
      : microJitterSeed(baseSeed, i); // 行ごとに +i（微差）

    const prompt = p.join(", ");
    rows.push({
      seed,
      pos: p,
      prompt,
      neg: commonNeg,
      text: `${prompt}${commonNeg ? ` --neg ${commonNeg}` : ""} seed:${seed}`
    });
  }
  return rows;
}

// プリセット適用時の服装モード設定を確実にする関数
function ensureClothingModeDisplay() {
  const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value || 'fixed';
  const varySettings = document.getElementById('clothing-vary-settings');
  
  if (varySettings) {
    if (clothingMode === 'vary') {
      varySettings.style.display = 'block';
    } else {
      varySettings.style.display = 'none';
    }
  }
}

// プリセット適用関数も修正
function applyProductionPreset(presetName) {
  const preset = PRODUCTION_PRESETS[presetName];
  if (!preset) {
    return;
  }
  
  window.productionCurrentPreset = presetName;
  
  // 服装モード設定
  const clothingRadio = document.querySelector(`#panelProduction input[name="clothingMode"][value="${preset.clothing}"]`);
  if (clothingRadio) {
    clothingRadio.checked = true;
    ensureClothingModeDisplay();
  }
  
  // 表情モード設定
  const expressionRadio = document.querySelector(`#panelProduction input[name="expressionMode"][value="${preset.expression}"]`);
  if (expressionRadio) {
    expressionRadio.checked = true;
    toggleExpressionMode();
  }
  
  // 状況表示更新
  updateProductionStatus();
  
  if (typeof toast === 'function') {
    toast(`${preset.name}プリセットを適用しました`);
  }

}





/* ===== テーブル描画 ===== */
function renderLearnTableTo(tbodySel, rows){
  const tb = document.querySelector(tbodySel);
  if (!tb) return;
  const frag = document.createDocumentFragment();
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    const prompt = Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.seed}</td>
      <td>${prompt}</td>
      <td>${r.neg || ""}</td>
    `;
    frag.appendChild(tr);
  });
  tb.innerHTML = "";
  tb.appendChild(frag);
}

// まとめ出力（学習/量産）に使っているユーティリティ
// renderTextTriplet関数の完全修正版
function renderTextTriplet(baseId, rows, fmtSelId){
  const fmt = getFmt(`#${fmtSelId}`);
  const isNanoBanana = fmt.label && fmt.label.includes('Nano-banana');

  if (rows.length > 1) {
    // 複数行の場合
    let allPrompts;
    
    if (isNanoBanana) {
      allPrompts = rows.map(r => {
        const inputPrompt = r.nanoBananaPrompt || (Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || ""));
        console.log("🍌 Nano-banana入力:", inputPrompt);
        
        if (fmt.line && typeof fmt.line === 'function') {
          const nanoOutput = fmt.line(inputPrompt, r.neg || "", r.seed || 0);
          // ★★★ 正しい編集指示文抽出 ★★★
          const editMatch = nanoOutput.match(/Edit the image\.\s*(.*?)\s*\[Important\]/s);
          
          if (editMatch && editMatch[1].trim()) {
            const instructions = editMatch[1].trim().split('\n').map(line => line.trim()).filter(Boolean);
            return instructions.join(', ');
          }
          return inputPrompt;
        }
        return inputPrompt;
      }).join("\n\n");
    } else {
      allPrompts = rows.map(r => Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "")).join("\n\n");
    }
    
    const allTexts = rows.map((r,i) => {
      const p = Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "");
      return fmt.line(p, r.neg || "", r.seed || 0);
    }).join("\n\n");

    const negUnion = (() => {
      const negList = rows.map(r => (r.neg || "").trim()).filter(Boolean);
      const allSame = negList.every(n => n === negList[0]);
      if (negList.length === 0) return "";
      if (allSame) return negList[0];
      const tokens = new Set();
      negList.forEach(n => n.split(",").map(s=>s.trim()).filter(Boolean).forEach(t => tokens.add(t)));
      return Array.from(tokens).join(", ");
    })();

    const allCaptions = rows.map(r => r.caption || "").filter(Boolean).join("\n\n");

    const outAll = document.getElementById(`${baseId}All`);
    if (outAll) outAll.textContent = allTexts;

    const outPrompt = document.getElementById(`${baseId}Prompt`);
    if (outPrompt) outPrompt.textContent = allPrompts;

    const outNeg = document.getElementById(`${baseId}Neg`);
    if (outNeg) outNeg.textContent = negUnion;

    const outCaption = document.getElementById(`${baseId}Caption`);
    if (outCaption) outCaption.textContent = allCaptions;

  } else {
    // 1件のみの場合
    const r = rows[0];
    let prompt = Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "");
    const neg = r.neg || "";
    const caption = r.caption || "";

    let allText;
    
    if (isNanoBanana && fmt.line && typeof fmt.line === 'function') {
      const inputPrompt = r.nanoBananaPrompt || prompt;
      console.log("🍌 Nano-banana入力:", inputPrompt);
      
      const nanoOutput = fmt.line(inputPrompt, neg, r.seed || 0);
      console.log("🍌 nanoOutput:", nanoOutput);
      
      // ★★★ 正しい編集指示文抽出 ★★★
      const editMatch = nanoOutput.match(/Edit the image\.\s*(.*?)\s*\[Important\]/s);
      
      if (editMatch && editMatch[1].trim()) {
        const instructions = editMatch[1].trim().split('\n').map(line => line.trim()).filter(Boolean);
        prompt = instructions.join(', ');
        console.log("🍌 抽出された編集指示文:", prompt);
      } else {
        console.warn("🍌 編集指示文の抽出に失敗");
        prompt = inputPrompt;
      }
      
      allText = nanoOutput;
    } else {
      allText = fmt.line(prompt, neg, r.seed || 0);
    }

    const outAll = document.getElementById(`${baseId}All`);
    if (outAll) outAll.textContent = allText;

    const outPrompt = document.getElementById(`${baseId}Prompt`);
    if (outPrompt) outPrompt.textContent = prompt;

    const outNeg = document.getElementById(`${baseId}Neg`);
    if (outNeg) outNeg.textContent = neg;

    const outCaption = document.getElementById(`${baseId}Caption`);
    if (outCaption) outCaption.textContent = caption;
  }
}


function bindCopyTripletExplicit(pairs){
  if (!Array.isArray(pairs)) return;
  pairs.forEach(pair => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const [btnId, outId] = pair;
    const btn = document.getElementById(btnId);
    const out = document.getElementById(outId);
    if (!btn || !out) return;

    btn.addEventListener('click', () => {
      const text = (out.textContent || '').trim();
      if (!text) { toast('コピーする内容がありません'); return; }
      navigator.clipboard?.writeText(text)
        .then(()=> toast('コピーしました'))
        .catch(()=> {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove(); toast('コピーしました');
        });
    });
  });
}

/* ===== CSV出力 ===== */
function csvFromLearn(fmtSelId = "#fmtLearnBatch") {
  const fmt = getFmt(fmtSelId);
  const header = ['"no"','"seed"','"prompt"','"negative"','"merged"','"line"'];
  const rows = Array.from($("#tblLearn tbody")?.querySelectorAll("tr") || []).map((tr, i) => {
    const tds = Array.from(tr.children).map(td => td.textContent || "");
    const no = tds[0] || (i+1);
    const seed = tds[1] || "";
    const p = tds[2] || "";
    const n = tds[3] || "";
    const merged = `${p}\nNegative prompt: ${n}`;
    const line = fmt.line(p, n, seed);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [esc(no), esc(seed), esc(p), esc(n), esc(merged), esc(line)].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

// ===== CSV関数の修正 =====
function csvFromProd(fmtSelId = "#fmtProd") {
  const fmt = getFmt(fmtSelId);
  const header = ['"no"','"seed"','"prompt"','"negative"','"merged"','"line"'];
  const rows = Array.from($("#tblProd tbody")?.querySelectorAll("tr") || []).map((tr, i) => {
    const tds = Array.from(tr.children).map(td => td.textContent || "");
    const no = tds[0] || (i+1);
    const seed = tds[1] || "";
    const p = tds[2] || "";
    const n = tds[3] || "";
    const merged = `${p}\nNegative prompt: ${n}`;
    const line = fmt.line(p, n, seed);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [esc(no), esc(seed), esc(p), esc(n), esc(merged), esc(line)].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

// csvFromProd関数をNano-banana対応に強化
const originalCsvFromProd = csvFromProd;

function csvFromProd(fmtSelId = "#fmtProd") {
  const fmt = getFmt(fmtSelId);
  const isNanoBanana = fmt.label && fmt.label.includes('Nano-banana');
  
  if (isNanoBanana) {
    // Nano-banana用のCSVヘッダー
    const header = ['"no"','"instruction"','"expression"','"pose_item"','"excluded_tags"','"original"'];
    
    const rows = Array.from($("#tblProd tbody")?.querySelectorAll("tr") || []).map((tr, i) => {
      const tds = Array.from(tr.children).map(td => td.textContent || "");
      const no = tds[0] || (i+1);
      const seed = tds[1] || "";
      const p = tds[2] || "";
      const n = tds[3] || "";
      
      // Nano-banana処理
      if (typeof window.processNanoBananaCorrect === 'function') {
        const result = window.processNanoBananaCorrect(p);
        const esc = (s) => `"${String(s).replace(/"/g,'""')}"`;
        return [
          esc(no),
          esc(result.instruction),
          esc(result.expression),
          esc(result.poseItem),
          esc(result.excludedTags),
          esc(p)
        ].join(",");
      } else {
        // フォールバック
        const esc = (s) => `"${String(s).replace(/"/g,'""')}"`;
        return [esc(no), esc(p), esc(""), esc(""), esc(""), esc(p)].join(",");
      }
    });
    
    return [header.join(","), ...rows].join("\n");
  } else {
    // 通常のCSV出力（既存の処理を呼び出し）
    return originalCsvFromProd(fmtSelId);
  }
}



/* ===== 初期化関数群（置き換え） ===== */
async function loadDefaultDicts() {
  // 一度だけレンダー・トーストを出すためのフラグ
  let didSFW = false;
  let didNSFW = false;

  // 埋め込み（<script src="dict/default_*.js">）をまず試す
  if (window.DEFAULT_SFW_DICT) {
    mergeIntoSFW(window.DEFAULT_SFW_DICT);
    didSFW = true;
  }
  if (window.DEFAULT_NSFW_DICT) {
    mergeIntoNSFW(window.DEFAULT_NSFW_DICT);
    didNSFW = true;
  }

  // 埋め込みが無いときだけ fetch（HTTPサーバやPagesで動く時の保険）
  async function tryFetch(path) {
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (!r.ok) throw new Error(`bad status: ${r.status}`);
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  if (!didSFW) {
    const sfw = await tryFetch("dict/default_sfw.json");
    if (sfw) {
      mergeIntoSFW(sfw);
      didSFW = true;
    }
  }

  if (!didNSFW) {
    const nsfw = await tryFetch("dict/default_nsfw.json");
    if (nsfw) {
      mergeIntoNSFW(nsfw);
      didNSFW = true;
    }
  }

  // レンダリングは「読めた側だけ」実行（重複防止）
  if (didSFW) {
    // これらが存在しない環境でも落ちないようにガード
    try { renderSFW && renderSFW(); } catch(_) {}
    try { fillAccessorySlots && fillAccessorySlots(); } catch(_) {}
    try { toast && toast("SFW辞書を読み込みました"); } catch(_) {}
  }

  if (didNSFW) {
    try { renderNSFWProduction && renderNSFWProduction(); } catch(_) {}
    try { renderNSFWLearning && renderNSFWLearning(); } catch(_) {}
    try { toast && toast("NSFW辞書を読み込みました"); } catch(_) {}
  }

  // 何も読めなかった場合のフォールバック（任意）
  if (!didSFW && typeof getFallbackSFW === "function") {
    mergeIntoSFW(getFallbackSFW());
    try { renderSFW && renderSFW(); } catch(_) {}
    try { fillAccessorySlots && fillAccessorySlots(); } catch(_) {}
    try { toast && toast("SFWフォールバック辞書を使用しました"); } catch(_) {}
  }
  if (!didNSFW && typeof getFallbackNSFW === "function") {
    mergeIntoNSFW(getFallbackNSFW());
    try { renderNSFWProduction && renderNSFWProduction(); } catch(_) {}
    try { renderNSFWLearning && renderNSFWLearning(); } catch(_) {}
    try { toast && toast("NSFWフォールバック辞書を使用しました"); } catch(_) {}
  }
}

// ===== bindLearnBatch関数の修正 =====
function bindLearnBatch(){
  document.getElementById("btnBatchLearn")?.addEventListener("click", ()=>{
    const cnt = parseInt(document.getElementById("countLearn")?.value, 10) || 24;
    const rows = buildBatchLearning(cnt); // 修正された関数を使用
    renderLearnTableTo("#tblLearn tbody", rows);
    renderTextTriplet("outLearn", rows, "fmtLearnBatch");
    toast("学習セット生成完了"); // トースト追加
  });

  bindCopyTripletExplicit([
    ["btnCopyLearnAll", "outLearnAll"],
    ["btnCopyLearnPrompt", "outLearnPrompt"], 
    ["btnCopyLearnNeg", "outLearnNeg"],
    ["btnCopyLearnTestAll", "outLearnTestAll"],
    ["btnCopyLearnTestPrompt", "outLearnTestPrompt"],
    ["btnCopyLearnTestNeg", "outLearnTestNeg"],
    ["btnCopyLearnTestCaption", "outLearnTestCaption"]
  ]);

  document.getElementById("btnCsvLearn")?.addEventListener("click", ()=>{
    const csv = csvFromLearn(); // 学習用のCSV生成関数を使用
    const char = (document.getElementById("charName")?.value || "noname").replace(/[^\w\-]/g,"_");
    dl(`learning_${char}_${nowStamp()}.csv`, csv);
    toast("学習CSVを保存しました");
  });

  document.getElementById("btnCloudLearn")?.addEventListener("click", async ()=>{
    const csv = csvFromLearn(); // 学習用のCSV生成関数を使用 
    //await postCSVtoGAS("learning", csv);
  });
}


// ===== bindProduction関数の修正 =====
function bindProduction(){
  document.getElementById("btnGenProd")?.addEventListener("click", ()=>{
    const cnt = parseInt(document.getElementById("countProd").value,10) || 50;
    const rows = buildBatchProduction(cnt);
    renderLearnTableTo("#tblProd tbody", rows);
    renderTextTriplet('outProd', rows, 'fmtProd');
    toast("量産セット生成完了"); // トースト追加
  });

  bindCopyTripletExplicit([
    ['btnCopyProdAll', 'outProdAll'],
    ['btnCopyProdPrompt', 'outProdPrompt'],
    ['btnCopyProdNeg', 'outProdNeg']
  ]);

  document.getElementById("btnCsvProd")?.addEventListener("click", ()=>{
    const csv = csvFromProd(); // 量産用のCSV生成関数を使用
    const char = (document.getElementById("charName")?.value || "noname").replace(/[^\w\-]/g,"_");
    dl(`production_${char}_${nowStamp()}.csv`, csv);
    toast("量産CSVを保存しました"); // 量産用のメッセージ
  });

  document.getElementById("btnCloudProd")?.addEventListener("click", async ()=>{
    const csv = csvFromProd(); // 量産用のCSV生成関数を使用
    //await postCSVtoGAS("production", csv);
  });
}


function initHairEyeAndAccWheels(){
  // 基本情報タブ（常に表示）の色ピッカーのみ初期化
  window.getHairColorTag = initWheel("#wheelH", "#thumbH", "#satH", "#litH", "#swH", "#tagH", "hair");
  window.getEyeColorTag  = initWheel("#wheelE", "#thumbE", "#satE", "#litE", "#swE", "#tagE", "eyes");
  
  // 基本情報タブ内の服カラー
  window.getTopColor    = initColorWheel("top",    35,  80, 55);
  window.getBottomColor = initColorWheel("bottom", 210, 70, 50);
  window.getShoesColor  = initColorWheel("shoes",  0,   0,  30);

  // ★★★ 基本情報のアクセサリー色ホイールを追加 ★★★
  window.getCharAccColor = initColorWheel("charAcc", 0, 75, 50);
}

// 学習モード専用の初期化関数を追加
function initLearningColorWheels() {
  if (window.learningColorsInitialized) return;
  window.learningColorsInitialized = true;
  
  // ★★★ 学習モードの固定アクセを赤（0度）に設定 ★★★
  window.getLearnAccColor = initColorWheel("learnAcc", 0, 75, 50);
}

// 量産モード専用の初期化関数を追加  
function initProductionColorWheels() {
  if (window.productionColorsInitialized) return;
  window.productionColorsInitialized = true;
  
  // ★★★ 量産モードの色ピッカーをすべて赤（0度）に設定 ★★★
  window.getPTopColor    = initColorWheel("p_top",    0, 80, 55);    // 赤に変更
  window.getPBottomColor = initColorWheel("p_bottom", 0, 70, 50);    // 赤に変更
  window.getPShoesColor  = initColorWheel("p_shoes",  0, 0,  30);    // 赤（元から0）
  
  // アクセサリー色ピッカー
  window.getAccAColor = initColorWheel("accA", 0, 80, 50);    // 赤
  window.getAccBColor = initColorWheel("accB", 200, 80, 50);  // 青（既存）
  window.getAccCColor = initColorWheel("accC", 120, 80, 50);  // 緑（既存）
}

function initSkinTone(){
  const s = document.getElementById('skinTone');
  if (s) {
    s.addEventListener('input', paintSkin);
    paintSkin();
  }
}

/* ===== 服の完成タグをUIで直接生成 ===== */
function makeFinalOutfitTags(selectedOutfits, colorTags) {
  const sel = Array.isArray(selectedOutfits) ? selectedOutfits.filter(Boolean) : [];
  // 「—」を空文字に変換し、空文字は色なしとして扱う
  const colors = {
    top: (colorTags?.top || "").replace(/^—$/, "").trim(),
    bottom: (colorTags?.bottom || "").replace(/^—$/, "").trim(),
    shoes: (colorTags?.shoes || "").replace(/^—$/, "").trim()
  };


  const catMap = new Map();
  try {
    const dict = (window.SFW && Array.isArray(SFW.outfit)) ? SFW.outfit : [];
    for (const e of dict) if (e && e.tag && e.cat) catMap.set(String(e.tag).toLowerCase(), String(e.cat).toLowerCase());
  } catch {}

  const getCat = (tag) => {
    const k = String(tag||"").toLowerCase();
    if (catMap.has(k)) return catMap.get(k);
    if (/(dress|kimono|yukata|cheongsam|hanbok|sari|uniform|gown)$/i.test(k)) return "dress";
    if (/(skirt)$/i.test(k)) return "skirt";
    if (/(jeans|pants|trousers|shorts|overalls|hakama)$/i.test(k)) return "pants";
    if (/(boots|sneakers|loafers|mary janes|socks)$/i.test(k)) return "shoes";
    return "top";
  };

  const hasDress = sel.some(t => getCat(t) === "dress");

  const colorPool = new Set([
    "white","black","red","blue","green","yellow","pink","purple","orange","brown","gray","silver","gold","beige","navy",
    "light blue","sky blue","teal","turquoise","lavender","violet","magenta","crimson","scarlet","emerald","olive",
    "khaki","ivory","peach","mint"
  ].map(s=>String(s).toLowerCase()));
  
  const startsWithColor = (s)=>{
    const t = String(s||"").toLowerCase();
    return Array.from(colorPool).some(c => t.startsWith(c+" "));
  };

  const out = [];
  if (hasDress) {
    for (const t of sel) {
      const cat = getCat(t);
      if (cat === "dress") {
        // ★★★ 修正：色が空文字でない場合のみ色を前置 ★★★
        const tagged = startsWithColor(t) ? t : (colors.top && colors.top.length > 0 ? `${colors.top} ${t}` : t);
        out.push(tagged);
      } else if (cat === "shoes") {
        const tagged = startsWithColor(t) ? t : (colors.shoes && colors.shoes.length > 0 ? `${colors.shoes} ${t}` : t);
        out.push(tagged);
      }
    }
  } else {
    for (const t of sel) {
      const cat = getCat(t);
      if (cat === "top") {
        const tagged = startsWithColor(t) ? t : (colors.top && colors.top.length > 0 ? `${colors.top} ${t}` : t);
        out.push(tagged);
      } else if (cat === "pants" || cat === "skirt") {
        // ★★★ 修正：色が空文字でない場合のみ色を前置 ★★★
        const tagged = startsWithColor(t) ? t : (colors.bottom && colors.bottom.length > 0 ? `${colors.bottom} ${t}` : t);
        out.push(tagged);
      } else if (cat === "shoes") {
        const tagged = startsWithColor(t) ? t : (colors.shoes && colors.shoes.length > 0 ? `${colors.shoes} ${t}` : t);
        out.push(tagged);
      } else if (cat === "dress") {
        const tagged = startsWithColor(t) ? t : (colors.top && colors.top.length > 0 ? `${colors.top} ${t}` : t);
        out.push(tagged);
      } else {
        out.push(t);
      }
    }
  }
  
  return out;
}

/* ===== 統合：最終トークンを組み立てる =====
   base = 髪色・目色・体型など（服以外）のトークン配列
   outfits = 服の選択結果（タグ配列）
   colorTags = { top, bottom, shoes } ピッカーの文字タグ
*/
function buildFinalTokens(base, outfits, colorTags) {
  const a = Array.isArray(base) ? base.filter(Boolean) : [];
  const b = makeFinalOutfitTags(outfits, colorTags);
  return a.concat(b);
}

/* ===== メイン初期化関数 ===== */
function initAll(){
  if (window.__LPM_INITED) return;
  window.__LPM_INITED = true;

  bindDictIO();
  bindNSFWToggles();
  bindLearnBatch();
  bindProduction();
  initTagDictionaries();
  
  // 基本情報の初期化バインド
  bindBasicInfo();
  
  // 単語モードの初期化
  initWordMode();
  
  // 撮影モードの初期化
  initPlannerMode();

  loadDefaultDicts().then(()=>{
    renderSFW();
    renderNSFWLearning();
    renderNSFWProduction();
    fillAccessorySlots();
    initHairEyeAndAccWheels();
    initSkinTone();
    
    // 辞書ロード後に単語モードを再初期化
    if (window.initWordModeItems) window.initWordModeItems();
    if (window.initPlannerItems) window.initPlannerItems();
  });

  // ★★★ Nano-banana対応の初期化を追加 ★★★
  setTimeout(() => {
    console.log("🍌 Nano-banana対応初期化中...");
    
    // フォーマット変更時の自動更新対応
    const fmtPlanner = document.getElementById("fmtPlanner");
    if (fmtPlanner && !fmtPlanner.dataset.nanoBananaInit) {
      fmtPlanner.addEventListener("change", () => {
        const outPlannerAll = document.getElementById("outPlannerAll");
        if (outPlannerAll && outPlannerAll.textContent.trim()) {
          setTimeout(() => {
            const btnPlanOne = document.getElementById("btnPlanOne");
            if (btnPlanOne) btnPlanOne.click();
          }, 100);
        }
      });
      fmtPlanner.dataset.nanoBananaInit = "true";
    }
    
    const fmtProd = document.getElementById("fmtProd");
    if (fmtProd && !fmtProd.dataset.nanoBananaInit) {
      fmtProd.addEventListener("change", () => {
        const outProdAll = document.getElementById("outProdAll");
        if (outProdAll && outProdAll.textContent.trim()) {
          const tableRows = document.querySelectorAll("#tblProd tbody tr");
          if (tableRows.length > 0) {
            setTimeout(() => {
              const btnGenProd = document.getElementById("btnGenProd");
              if (btnGenProd) btnGenProd.click();
            }, 100);
          }
        }
      });
      fmtProd.dataset.nanoBananaInit = "true";
    }
    
    console.log("✅ Nano-banana対応初期化完了");
  }, 3000);
}

document.addEventListener('DOMContentLoaded', initAll);

function renderNSFWProduction(){
  const cap = document.querySelector('input[name="nsfwLevelProd"]:checked')?.value || "L1";
  const order = {L1:1,L2:2,L3:3};
  const allow = (lv)=> (order[(lv||"L1")]||1) <= (order[cap]||1);
  const lvl = (x)=>({L1:"R-15",L2:"R-18",L3:"R-18G"}[(x||"L1")] || "R-15");
  const filt = (arr)=> normList(arr).filter(x=> allow(x.level));
  const chips = (o,name)=> `<label class="chip"><input type="checkbox" name="${name}" value="${o.tag}">${o.label}<span class="mini"> ${lvl(o.level)}</span></label>`;

  $("#nsfwP_expr")  && ($("#nsfwP_expr").innerHTML  = filt(NSFW.expression).map(o=>chips(o,"nsfwP_expr")).join(""));
  $("#nsfwP_expo")  && ($("#nsfwP_expo").innerHTML  = filt(NSFW.exposure).map(o=>chips(o,"nsfwP_expo")).join(""));
  $("#nsfwP_situ")  && ($("#nsfwP_situ").innerHTML  = filt(NSFW.situation).map(o=>chips(o,"nsfwP_situ")).join(""));
  $("#nsfwP_light") && ($("#nsfwP_light").innerHTML = filt(NSFW.lighting).map(o=>chips(o,"nsfwP_light")).join(""));
  $("#nsfwP_pose")     && ($("#nsfwP_pose").innerHTML     = filt(NSFW.pose).map(o=>chips(o,"nsfwP_pose")).join(""));
  $("#nsfwP_acc")      && ($("#nsfwP_acc").innerHTML      = filt(NSFW.accessory).map(o=>chips(o,"nsfwP_acc")).join(""));
  $("#nsfwP_outfit")   && ($("#nsfwP_outfit").innerHTML   = filt(NSFW.outfit).map(o=>chips(o,"nsfwP_outfit")).join(""));
  $("#nsfwP_body")     && ($("#nsfwP_body").innerHTML     = filt(NSFW.body).map(o=>chips(o,"nsfwP_body")).join(""));
  $("#nsfwP_nipple")   && ($("#nsfwP_nipple").innerHTML   = filt(NSFW.nipples).map(o=>chips(o,"nsfwP_nipple")).join(""));
  $("#nsfwP_underwear")&& ($("#nsfwP_underwear").innerHTML= filt(NSFW.underwear).map(o=>chips(o,"nsfwP_underwear")).join(""));
}

/* ===== NSFW切替 ===== */
function bindNSFWToggles(){
  $("#nsfwLearn")?.addEventListener("change", e=>{
    $("#nsfwLearnPanel").style.display = e.target.checked ? "" : "none";
    if(e.target.checked) renderNSFWLearning();
  });
  
  const nsfwLevelLearnRadios = document.querySelectorAll('input[name="nsfwLevelLearn"]');
  nsfwLevelLearnRadios.forEach(x => x.addEventListener('change', () => {
    if ($("#nsfwLearn")?.checked) renderNSFWLearning();
  }));

  const nsfwLevelProdRadios = document.querySelectorAll('input[name="nsfwLevelProd"]');
  nsfwLevelProdRadios.forEach(x => x.addEventListener('change', renderNSFWProduction));
  
  $("#nsfwProd")?.addEventListener("change", e=>{
    $("#nsfwProdPanel").style.display = e.target.checked ? "" : "none";
    if (e.target.checked) renderNSFWProduction();
  });
}

/* ===== 辞書I/O ===== */
function isNSFWDict(json){
  const j = json?.NSFW || json || {};
  const cat = j.categories || {};
  const KEYS = ['expression','exposure','situation','lighting','background','pose','accessory','outfit','body','nipples','underwear','表情','露出','シチュ'];
  const hasArr = (o, k) => Array.isArray(o?.[k]) && o[k].length > 0;
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
      }
    } catch {
      toast("辞書の読み込みに失敗（JSONを確認）");
    } finally {
      e.target.value = "";
    }
  });

  $("#btnExport")?.addEventListener("click", ()=>{
    const save = { sfw:SFW, nsfw:NSFW, settings:Settings };
    dl("lora_prompt_maker_settings.json", JSON.stringify(save,null,2));
  });
}

/* ===== アクセサリー初期化の修正 ===== */
function fillAccessorySlots(){
  const accs = normList(SFW.accessories || []);
  const options = `<option value="">（未選択）</option>` + accs.map(a=>`<option value="${a.tag}">${a.label || a.tag}</option>`).join("");
  
  // 全てのアクセサリーセレクトボックスを更新
  ["p_accA","p_accB","p_accC","learn_acc","pl_accSel","characterAccessory"].forEach(id=>{
    const sel = document.getElementById(id); 
    if (sel) {
      sel.innerHTML = options;
      
      // characterAccessoryの場合は色ホイールも初期化
      if (id === "characterAccessory") {
        setTimeout(() => {
          initCharacterAccessory();
        }, 100);
      }
    }
  });
}



/* ===== 基本情報のアクセサリー設定（固定アクセ） ===== */
function initCharacterAccessory() {
  // アクセサリーセレクトボックスの初期化
  const charAccSel = document.getElementById("characterAccessory");
  if (charAccSel && SFW.accessories) {
    const options = '<option value="">（未選択）</option>' + 
      SFW.accessories.map(acc => `<option value="${acc.tag}">${acc.label || acc.tag}</option>`).join('');
    charAccSel.innerHTML = options;
  }
  
  // 色ホイールの初期化（黒色で開始）
  window.getCharAccColor = initColorWheel("charAcc", 0, 75, 50);
  
  // セレクトボックス変更時の処理
  if (charAccSel) {
    charAccSel.addEventListener('change', function() {
      updateCharAccDisplay();
    });
  }
  
  // 色変更時の処理
  const satCharAcc = document.getElementById("sat_charAcc");
  const litCharAcc = document.getElementById("lit_charAcc");
  
  if (satCharAcc) satCharAcc.addEventListener('input', updateCharAccDisplay);
  if (litCharAcc) litCharAcc.addEventListener('input', updateCharAccDisplay);
}

function updateCharAccDisplay() {
  // 学習モードの現在設定表示を更新
  const accSel = document.getElementById("characterAccessory");
  const accColor = window.getCharAccColor ? window.getCharAccColor() : "";
  const currentAccDisplay = document.getElementById("currentAccDisplay");
  
  if (currentAccDisplay) {
    if (accSel && accSel.value && accColor && accColor !== "—") {
      currentAccDisplay.textContent = `${accColor} ${accSel.value}`;
    } else if (accSel && accSel.value) {
      currentAccDisplay.textContent = accSel.value;
    } else {
      currentAccDisplay.textContent = "未設定";
    }
  }
}









/* ===== 単語モード 完全動作版（エラー修正済み） ===== */

// 1. toast関数を定義（存在しない場合）
if (typeof window.toast !== 'function') {
  window.toast = function(message) {
    // 簡易的な通知表示
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  };
}

// 2. 正確なマッピングテーブル
// app.js内のMAPPING_TABLE（3255行目付近）を以下に置き換え
const MAPPING_TABLE = {
  SFW: {
    'age': 'age',
    'gender': 'gender',
    'body_type': 'body-type',
    'height': 'height',
    'worldview': 'worldview',
    'speech_tone': 'speech-tone',
    'hair_style': 'hair-style',
    'hair_length': 'hair-length',
    'bangs_style': 'bangs-style',
    'eyes': 'eyes',
    'face': 'face',
    'skin_features': 'skin-features',
    'skin_body': 'skin-body',
    'outfit': 'outfit-sfw',
    'accessories': 'accessories',
    'pose': 'pose',
    'composition': 'composition',
    'view': 'view',
    'expressions': 'expression-sfw',
    'emotion_primary': 'emotion-primary',
    'emotion_detail': 'emotion-detail',
    'mouth_state': 'mouth-state',
    'eye_state': 'eye-state',
    'gaze': 'gaze',
    'background': 'background',
    'lighting': 'lighting-sfw',
    'art_style': 'art-style',
    'pose_manga': 'pose-manga',
    'hand_gesture': 'hand-gesture',
    'movement_action': 'movement-action',
    'props_light': 'props-light',
    'effect_manga': 'effect-manga',
    'colors': 'color',
    // 撮影モード専用要素
    'camera_angle': 'camera-angle',
    'focal_length': 'focal-length',
    'depth_of_field': 'depth-of-field',
    'photo_technique': 'photo-technique',
    'lighting_type': 'lighting-type',
    'light_direction': 'light-direction',
    'time_of_day': 'time-of-day',
    
    // 🆕 新規追加項目
    'occupation': 'occupation',
    'relationship': 'relationship',
    'physical_state': 'physical-state',
    'season_weather': 'season-weather'
  },
  NSFW: {
    'expression': 'expression-nsfw',
    'exposure': 'exposure',
    'situation': 'situation',
    'lighting': 'lighting-nsfw',
    'pose': 'pose-nsfw',
    'accessories': 'accessory-nsfw',
    'outfit': 'outfit-nsfw',
    'underwear': 'underwear-nsfw',
    'body': 'body-nsfw',
    'nipple': 'nipple-nsfw',
    'action': 'action-nsfw',
    'action2': 'action2-nsfw',
    'participants': 'participants',
    
    // 🆕 新規追加項目
    'interaction_nsfw': 'interaction-nsfw',
    'background_nsfw': 'background-nsfw',
    'emotion_nsfw': 'emotion-nsfw',
    'timing_nsfw': 'timing-nsfw',
    'occupation_nsfw': 'occupation-nsfw'
  }
};

// 3. テーブル操作機能
window.addToOutputTable = function(en, jp) {
  
  const tbody = document.getElementById('wm-table-body');
  if (!tbody) {
    return;
  }
  
  if (tbody.children.length >= 20) {
    window.toast('テーブルの最大件数（20件）に達しています');
    return;
  }
  
  if (tbody.querySelector(`tr[data-en="${en}"]`)) {
    window.toast('重複するアイテムです');
    return;
  }
  
  const row = document.createElement('tr');
  row.dataset.en = en;
  row.innerHTML = `
    <td class="wm-row-jp">${jp}</td>
    <td class="wm-row-en">${en}</td>
    <td>
      <button type="button" class="wm-row-copy-en" style="margin-right: 4px; padding: 2px 6px; font-size: 12px;">EN</button>
      <button type="button" class="wm-row-copy-both" style="margin-right: 4px; padding: 2px 6px; font-size: 12px;">両方</button>
      <button type="button" class="wm-row-remove" style="padding: 2px 6px; font-size: 12px; color: #f44336;">削除</button>
    </td>
  `;
  
  tbody.appendChild(row);
  window.toast(`「${jp}」をテーブルに追加しました`);
  
};

// 4. アイテム作成関数（シンプル版）
function createWordItem(item, category) {
  if (!item) return '';
  
  let tag, label, level;
  
  if (typeof item === 'string') {
    tag = label = item.trim();
    level = '';
  } else if (typeof item === 'object') {
    tag = (item.tag || '').toString().trim();
    label = (item.label || item.ja || item.tag || '').toString().trim();
    level = (item.level || '').toString().trim();
  } else {
    return '';
  }
  
  if (!tag && !label) return '';
  if (!tag) tag = label;
  if (!label) label = tag;
  
  const showMini = (tag !== label && tag.length > 0 && label.length > 0);
  const levelText = level ? ` [${level}]` : '';
  
  // エスケープ処理
  const escapedTag = tag.replace(/'/g, "\\'");
  const escapedLabel = label.replace(/'/g, "\\'");
  
  return `
    <button type="button" class="wm-item" 
            data-en="${tag}" 
            data-jp="${label}" 
            data-cat="${category}"
            title="${tag}${levelText}"
            onclick="window.addToOutputTable('${escapedTag}', '${escapedLabel}')"
            style="display: block; width: 100%; padding: 8px; margin: 2px 0; background: var(--bg-secondary, #363c4a); border: 1px solid #555; border-radius: 4px; color: white; cursor: pointer; text-align: left;">
      <span class="wm-jp" style="font-weight: 500;">${label}${levelText}</span>
      ${showMini ? `<span class="wm-en" style="color: #aaa; font-size: 12px; margin-left: 8px;">${tag}</span>` : ''}
    </button>
  `;
}

// 5. 検索機能（結果を下に表示）
window.performWordModeSearch = function(searchTerm) {
  
  searchTerm = (searchTerm || '').trim();
  
  let searchResultsArea = document.getElementById('wm-search-results');
  
  if (!searchResultsArea) {
    const searchInput = document.getElementById('wm-search-input');
    if (!searchInput) return;
    
    searchResultsArea = document.createElement('div');
    searchResultsArea.id = 'wm-search-results';
    searchResultsArea.style.cssText = `
      display: none;
      width: 100%;
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #444;
      border-radius: 6px;
      margin: 15px 0;
      padding: 10px;
      background: var(--bg-card, #2a2f3a);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      position: relative;
      z-index: 100;
    `;
    
    // 検索ボックスの親コンテナを取得
    const searchContainer = searchInput.parentElement || searchInput.parentNode;
    
    // 検索結果を検索ボックスコンテナの後に配置
    if (searchContainer.nextSibling) {
      searchContainer.parentNode.insertBefore(searchResultsArea, searchContainer.nextSibling);
    } else {
      searchContainer.parentNode.appendChild(searchResultsArea);
    }
  }
  
  const allItems = document.querySelectorAll('#panelWordMode .wm-item');
  
  if (!searchTerm) {
    searchResultsArea.style.display = 'none';
    searchResultsArea.innerHTML = '';
    return;
  }
  
  const matchedItems = [];
  const searchLower = searchTerm.toLowerCase();
  
  allItems.forEach(item => {
    const jp = (item.dataset.jp || '').toLowerCase();
    const en = (item.dataset.en || '').toLowerCase();
    
    if (jp.includes(searchLower) || en.includes(searchLower)) {
      matchedItems.push({
        en: item.dataset.en,
        jp: item.dataset.jp,
        cat: item.dataset.cat
      });
    }
  });
  
  
  if (matchedItems.length === 0) {
    searchResultsArea.innerHTML = `
      <div style="text-align: center; color: #888; padding: 20px; font-size: 14px;">
        「${searchTerm}」の検索結果がありません
      </div>
    `;
    searchResultsArea.style.display = 'block';
    return;
  }
  
  // 検索結果のヘッダーを追加
  const headerHTML = `
    <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #555; color: #ccc; font-size: 14px; font-weight: 500;">
      検索結果: ${matchedItems.length}件
    </div>
  `;
  
  const resultsHTML = matchedItems.map(item => {
    const showEn = item.en !== item.jp;
    const escapedEn = item.en.replace(/'/g, "\\'");
    const escapedJp = item.jp.replace(/'/g, "\\'");
    
    return `
      <button type="button" class="wm-search-result-item" 
              style="display: block; width: 100%; padding: 10px; margin: 3px 0; background: var(--bg-secondary, #363c4a); border: 1px solid #555; border-radius: 4px; color: white; cursor: pointer; text-align: left; transition: background-color 0.2s ease;"
              onmouseover="this.style.backgroundColor='var(--bg-hover, #404652)'"
              onmouseout="this.style.backgroundColor='var(--bg-secondary, #363c4a)'"
              onclick="window.addToOutputTable('${escapedEn}', '${escapedJp}'); document.getElementById('wm-search-input').value=''; window.clearWordModeSearch();">
        <span style="font-weight: 500; display: block;">${item.jp}</span>
        ${showEn ? `<span style="color: #aaa; font-size: 12px; margin-top: 2px; display: block;">${item.en}</span>` : ''}
      </button>
    `;
  }).join('');
  
  searchResultsArea.innerHTML = headerHTML + resultsHTML;
  searchResultsArea.style.display = 'block';
  
  // 検索結果エリアにスムーズスクロール
  setTimeout(() => {
    searchResultsArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
};

window.clearWordModeSearch = function() {
  const searchInput = document.getElementById('wm-search-input');
  const resultsArea = document.getElementById('wm-search-results');
  
  if (searchInput) searchInput.value = '';
  if (resultsArea) {
    resultsArea.style.display = 'none';
    resultsArea.innerHTML = '';
  }
};

// 6. カテゴリ完全折りたたみ機能（強化版）
window.moveCategoriesToBottom = function() {
  
  const wordModePanel = document.getElementById('panelWordMode');
  if (!wordModePanel) {
    return;
  }
  
  // テーブルコンテナを特定
  const tableContainer = document.getElementById('wm-table-container') || 
                        document.querySelector('.wm-table-wrapper') ||
                        document.querySelector('[id*="table"]') ||
                        wordModePanel.querySelector('table')?.parentElement;
  
  if (!tableContainer) {

    return;
  }
  
  
  // 既存のボタンとコンテナをチェック
  let existingToggle = document.getElementById('wm-categories-toggle');
  let existingContainer = document.getElementById('wm-categories-container');
  
  if (existingToggle && existingContainer) {
    return;
  }
  
  // 現在のwordModePanelの全子要素を取得
  const allChildren = Array.from(wordModePanel.children);
  
  // 検索・テーブル関連要素を除外
  const excludeElements = [];
  
  // ID/class/data属性での除外
  allChildren.forEach(element => {
    const id = element.id || '';
    const className = element.className || '';
    const tagName = element.tagName.toLowerCase();
    
    // 除外対象の判定
    const isSearchOrTable = 
      id.includes('search') || id.includes('table') ||
      className.includes('search') || className.includes('table') ||
      id.includes('wm-search') || id.includes('wm-table') ||
      element === tableContainer ||
      element.querySelector('#wm-search-input, #wm-table-container, [id*="search"], [id*="table"]');
    
    if (isSearchOrTable) {
      excludeElements.push(element);
    }
  });
  
  excludeElements.forEach(el => {
  });
  
  // 移動対象要素を特定
  const elementsToMove = allChildren.filter(element => !excludeElements.includes(element));
  
  elementsToMove.forEach(el => {
  });
  
  if (elementsToMove.length === 0) {
    return;
  }
  
  // 折りたたみコンテナを作成
  const categoriesContainer = document.createElement('div');
  categoriesContainer.id = 'wm-categories-container';
  categoriesContainer.style.cssText = `
    display: none;
    margin-top: 20px;
    padding: 15px;
    background: var(--bg-card, #2a2f3a);
    border: 1px solid #444;
    border-radius: 8px;
    max-height: 500px;
    overflow-y: auto;
  `;
  
  // トグルボタンを作成
  const toggleButton = document.createElement('button');
  toggleButton.id = 'wm-categories-toggle';
  toggleButton.type = 'button';
  toggleButton.textContent = '▼ カテゴリ一覧を表示';
  toggleButton.style.cssText = `
    width: 100%;
    padding: 12px;
    margin-top: 20px;
    background: var(--bg-secondary, #363c4a);
    color: var(--text-primary, #ffffff);
    border: 1px solid #555;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  
  let isVisible = false;
  toggleButton.addEventListener('click', () => {
    isVisible = !isVisible;
    categoriesContainer.style.display = isVisible ? 'block' : 'none';
    const icon = isVisible ? '▲' : '▼';
    const text = isVisible ? 'カテゴリ一覧を隠す' : 'カテゴリ一覧を表示';
    toggleButton.textContent = `${icon} ${text}`;

  });
  
  // ホバー効果
  toggleButton.addEventListener('mouseenter', () => {
    toggleButton.style.backgroundColor = 'var(--bg-hover, #404652)';
  });
  
  toggleButton.addEventListener('mouseleave', () => {
    toggleButton.style.backgroundColor = 'var(--bg-secondary, #363c4a)';
  });
  
  // 要素をコンテナに移動
  let movedCount = 0;
  elementsToMove.forEach(element => {
    try {
      categoriesContainer.appendChild(element);
      movedCount++;
  //    console.log('移動完了:', element.id || element.className || element.tagName);
    } catch (e) {
  //    console.warn('要素の移動に失敗:', element, e);
    }
  });
  
  // DOMに配置
  try {
    // テーブルの後ろに挿入
    if (tableContainer.nextSibling) {
      tableContainer.parentNode.insertBefore(toggleButton, tableContainer.nextSibling);
    } else {
      tableContainer.parentNode.appendChild(toggleButton);
    }
    
    if (toggleButton.nextSibling) {
      toggleButton.parentNode.insertBefore(categoriesContainer, toggleButton.nextSibling);
    } else {
      toggleButton.parentNode.appendChild(categoriesContainer);
    }
    
  } catch (e) {
    return;
  }
  
  // 既存のdetails要素を強制的に閉じる
  const detailsElements = categoriesContainer.querySelectorAll('details');
  detailsElements.forEach(details => {
    details.open = false;
  });
  
  
  // 成功確認
  setTimeout(() => {
    const finalToggle = document.getElementById('wm-categories-toggle');
    const finalContainer = document.getElementById('wm-categories-container');
    
    if (finalToggle && finalContainer) {
    } else {
      //console.error('❌ カテゴリ折りたたみ機能の設置に失敗');
    }
  }, 100);
};

// 7. メイン初期化関数
window.initWordModeFixed = function() {
  
  // 辞書データの取得
  let sfwDict = null;
  let nsfwDict = null;
  
  if (window.DEFAULT_SFW_DICT) {
    sfwDict = window.DEFAULT_SFW_DICT.SFW || window.DEFAULT_SFW_DICT;
  } else if (window.SFW) {
    sfwDict = window.SFW;
  }
  
  if (window.DEFAULT_NSFW_DICT) {
    nsfwDict = window.DEFAULT_NSFW_DICT.NSFW || window.DEFAULT_NSFW_DICT;
  } else if (window.NSFW) {
    nsfwDict = window.NSFW;
  }
  
  if (!sfwDict || !nsfwDict) {
    return 0;
  }
  
  // 既存コンテナをクリア
  const containers = document.querySelectorAll('#panelWordMode .wm-items');
  containers.forEach(container => container.innerHTML = '');
  
  let totalItems = 0;
  
  // SFW辞書の処理部分を修正
Object.entries(sfwDict).forEach(([dictKey, items]) => {
  if (!Array.isArray(items) || items.length === 0) return;
  
  const htmlId = MAPPING_TABLE.SFW[dictKey];
  if (!htmlId) {
    // ★★★ 単語モードで使用しない要素は警告を出さない ★★★
    const ignoreKeys = [
      'speech_tone', 'skin_body', 'negative_presets', 'negative_categories', 
      'negative_quick_presets', 'camera_angle', 'focal_length', 'depth_of_field', 
      'photo_technique', 'lighting_type', 'light_direction', 'time_of_day'
    ];
    if (!ignoreKeys.includes(dictKey)) {
     // console.warn(`SFWマッピング未定義: ${dictKey}`);
    }
    return;
  }
  
  const container = document.getElementById(`wm-items-${htmlId}`);
  if (!container) {
    // ★★★ 単語モードで使用しない要素は警告を出さない ★★★
    const ignoreHtmlIds = [
      'speech-tone', 'skin-body', 'camera-angle', 'focal-length', 
      'depth-of-field', 'photo-technique', 'lighting-type', 
      'light-direction', 'time-of-day'
    ];
    if (!ignoreHtmlIds.includes(htmlId)) {
    //  console.warn(`コンテナ未発見: wm-items-${htmlId}`);
    }
    return;
  }

    const validItems = items.filter(item => {
      if (!item) return false;
      if (typeof item === 'string') return item.trim() !== '';
      const tag = (item.tag || '').toString().trim();
      const label = (item.label || item.ja || item.tag || '').toString().trim();
      return tag !== '' || label !== '';
    });
    
    const html = validItems.map(item => createWordItem(item, dictKey)).join('');
    container.innerHTML = html;
    
    const count = validItems.length;
    totalItems += count;
    
 //   console.log(`SFW: ${count}件 (${dictKey} → ${htmlId})`);
    
    const counter = document.getElementById(`wm-count-${htmlId}`);
    if (counter) counter.textContent = count;
  });
  
  // NSFW辞書の処理
  Object.entries(nsfwDict).forEach(([dictKey, items]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    
    const htmlId = MAPPING_TABLE.NSFW[dictKey];
    if (!htmlId) {
    //  console.warn(`NSFWマッピング未定義: ${dictKey}`);
      return;
    }
    
    const container = document.getElementById(`wm-items-${htmlId}`);
    if (!container) {
     // console.warn(`コンテナ未発見: wm-items-${htmlId}`);
      return;
    }
    
    const validItems = items.filter(item => {
      if (!item) return false;
      if (typeof item === 'string') return item.trim() !== '';
      const tag = (item.tag || '').toString().trim();
      const label = (item.label || item.ja || item.tag || '').toString().trim();
      return tag !== '' || label !== '';
    });
    
    const html = validItems.map(item => createWordItem(item, dictKey)).join('');
    container.innerHTML = html;
    
    const count = validItems.length;
    totalItems += count;
    
   // console.log(`NSFW: ${count}件 (${dictKey} → ${htmlId})`);
    
    const counter = document.getElementById(`wm-count-${htmlId}`);
    if (counter) counter.textContent = count;
  });
  
 // console.log(`初期化完了: 総計 ${totalItems} 件のタグを読み込み`);
  
  const totalCountEl = document.getElementById('wm-total-count');
  if (totalCountEl) totalCountEl.textContent = totalItems;
  
  return totalItems;
};

// 8. イベント処理の初期化
window.initAllEvents = function() {
  // テーブルイベント
  const outputTable = document.getElementById('wm-table-body');
  if (outputTable) {
    outputTable.addEventListener('click', (e) => {
      if (e.target.classList.contains('wm-row-copy-en')) {
        const row = e.target.closest('tr');
        const en = row?.dataset.en;
        if (en && navigator.clipboard) {
          navigator.clipboard.writeText(en);
          window.toast('英語タグをコピーしました');
        }
      } else if (e.target.classList.contains('wm-row-copy-both')) {
        const row = e.target.closest('tr');
        const jp = row?.querySelector('.wm-row-jp')?.textContent;
        const en = row?.dataset.en;
        const text = jp && en ? `${jp}(${en})` : (en || jp);
        if (text && navigator.clipboard) {
          navigator.clipboard.writeText(text);
          window.toast('日英タグをコピーしました');
        }
      } else if (e.target.classList.contains('wm-row-remove')) {
        const row = e.target.closest('tr');
        if (row) row.remove();
      }
    });
  }
  
  // 検索イベント
  const searchInput = document.getElementById('wm-search-input');
  const clearBtn = document.getElementById('wm-search-clear');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      window.performWordModeSearch(e.target.value);
    });
    
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.performWordModeSearch(e.target.value);
      }
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      window.clearWordModeSearch();
    });
  }
  
  // 一括ボタン
  const copyAllBtn = document.getElementById('wm-copy-all');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', () => {
      const tbody = document.getElementById('wm-table-body');
      if (!tbody || !tbody.children.length) {
        window.toast('コピーするアイテムがありません');
        return;
      }
      
      const tags = Array.from(tbody.children).map(row => row.dataset.en || '').filter(Boolean);
      
      if (tags.length > 0 && navigator.clipboard) {
        navigator.clipboard.writeText(tags.join(', '));
        window.toast(`${tags.length}件の英語タグをコピーしました`);
      }
    });
  }
  
  const clearAllBtn = document.getElementById('wm-clear-all');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const tbody = document.getElementById('wm-table-body');
      if (tbody) {
        tbody.innerHTML = '';
        window.toast('テーブルをクリアしました');
      }
    });
  }
};

// 9. メインのinitWordMode関数
window.initWordMode = function() {
  
  // 初期化実行
  const result = window.initWordModeFixed();
  
  // イベント処理の初期化
  window.initAllEvents();
  
  // カテゴリをテーブル下に移動（少し遅延）
  setTimeout(() => {
    window.moveCategoriesToBottom();
  }, 1000);
  
  
  return result;
};

// 10. 即座に実行

if ((window.SFW || window.DEFAULT_SFW_DICT) && (window.NSFW || window.DEFAULT_NSFW_DICT)) {
  setTimeout(() => {
    window.initWordMode();
  }, 500);
} else {
  let attempts = 0;
  const maxAttempts = 15;
  
  const waitForDicts = () => {
    attempts++;
    
    if ((window.SFW || window.DEFAULT_SFW_DICT) && (window.NSFW || window.DEFAULT_NSFW_DICT)) {
      window.initWordMode();
      return;
    }
    
    if (attempts < maxAttempts) {
      setTimeout(waitForDicts, 800);
    } else {
     // console.error('辞書読み込みタイムアウト');
    }
  };
  
  setTimeout(waitForDicts, 1000);
}




// 量産モードプリセット修正版
(function() {
  'use strict';
  
  
  // 量産モード専用の変数（競合回避）
  window.productionCurrentPreset = null;
  
  // プリセット設定
  const PRODUCTION_PRESETS = {
    clothing: {
      name: '👕 服装バリエーション',
      clothing: 'vary',
      expression: 'fixed',
      description: '服装だけ変更、表情・ポーズは固定'
    },
    expression: {
      name: '🎭 表情バリエーション', 
      clothing: 'fixed',
      expression: 'vary',
      description: '表情・ポーズ変更、服装は固定'
    },
    mixed: {
      name: '🎨 ミックス',
      clothing: 'vary',
      expression: 'vary',
      description: '服装・表情両方変更'
    },
    custom: {
      name: '⚙️ カスタム',
      clothing: 'fixed',
      expression: 'fixed',
      description: '自分で詳細設定'
    }
  };
  
  // 初期化関数
  function initProductionPresets() {
    
    // プリセットボタンのイベント設定
    const presetButtons = document.querySelectorAll('#panelProduction .preset-btn');
    
    presetButtons.forEach((btn, index) => {
      const preset = btn.dataset.preset;
      
      // 既存のイベントリスナーを削除
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        applyProductionPreset(preset);
        
        // ボタンの見た目を更新
        document.querySelectorAll('#panelProduction .preset-btn').forEach(b => {
          b.classList.remove('active');
          b.style.backgroundColor = '';
          b.style.borderColor = '';
        });
        newBtn.classList.add('active');
        newBtn.style.backgroundColor = '#3b82f6';
        newBtn.style.borderColor = '#2563eb';
        newBtn.style.color = 'white';
        
        // 詳細設定を表示
        const details = document.getElementById('production-details');
        if (details) {
          details.style.display = 'block';
        }
      });
    });
    
    // モード切り替えイベント
    setupModeToggles();
    
    // リアルタイム更新
    setupRealtimeUpdates();

  }
  
  // プリセット適用
  function applyProductionPreset(presetName) {
    const preset = PRODUCTION_PRESETS[presetName];
    if (!preset) {
    //  console.error(`❌ 不明なプリセット: ${presetName}`);
      return;
    }
    
    window.productionCurrentPreset = presetName;
    
    // 服装モード設定
    const clothingRadio = document.querySelector(`#panelProduction input[name="clothingMode"][value="${preset.clothing}"]`);
    if (clothingRadio) {
      clothingRadio.checked = true;
      toggleClothingMode();
    } else {
      //console.warn('❌ 服装モードラジオが見つかりません');
    }
    
    // 表情モード設定
    const expressionRadio = document.querySelector(`#panelProduction input[name="expressionMode"][value="${preset.expression}"]`);
    if (expressionRadio) {
      expressionRadio.checked = true;
      toggleExpressionMode();
    } else {
      //console.warn('❌ 表情モードラジオが見つかりません');
    }
    
    // 状況表示更新
    updateProductionStatus();
    
    if (typeof toast === 'function') {
      toast(`${preset.name}プリセットを適用しました`);
    }

  }
  
  // モード切り替え設定
  function setupModeToggles() {
    // 服装モード
    document.querySelectorAll('#panelProduction input[name="clothingMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        toggleClothingMode();
      });
    });
    
    // 表情モード
    document.querySelectorAll('#panelProduction input[name="expressionMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        toggleExpressionMode();
      });
    });
  }
  
  // 服装モード切り替え
  function toggleClothingMode() {
    const isVary = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value === 'vary';
    const varySettings = document.getElementById('clothing-vary-settings');
    
    if (varySettings) {
      varySettings.style.display = isVary ? 'block' : 'none';
    }
    
    updateProductionStatus();
  }
  
  // 表情モード切り替え
  function toggleExpressionMode() {
    const isVary = document.querySelector('#panelProduction input[name="expressionMode"]:checked')?.value === 'vary';
    const varySettings = document.getElementById('expression-vary-settings');
    
    if (varySettings) {
      varySettings.style.display = isVary ? 'block' : 'none';
    }
    
    updateProductionStatus();
  }
  
  // リアルタイム更新設定
  function setupRealtimeUpdates() {
    const productionPanel = document.getElementById('panelProduction');
    if (!productionPanel) {
    //  console.warn('❌ 量産モードパネルが見つかりません');
      return;
    }
    
    productionPanel.addEventListener('change', updateProductionStatus);
    productionPanel.addEventListener('input', updateProductionStatus);
  }
  
  // 状況表示更新
  function updateProductionStatus() {
    updateVaryElements();
    updateFixedElements();
    updateComboCount();
  }
  
  // 変更要素の表示更新
  function updateVaryElements() {
    const varyList = [];
    
    // 服装
    const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value;
    if (clothingMode === 'vary') {
      const clothingCount = getSelectedCount(['p_outfit_top', 'p_outfit_pants', 'p_outfit_skirt', 'p_outfit_dress', 'p_outfit_shoes']);
      if (clothingCount > 0) {
        varyList.push(`服装(${clothingCount}種類)`);
      }
    }
    
    // 表情・ポーズ
    const expressionMode = document.querySelector('#panelProduction input[name="expressionMode"]:checked')?.value;
    if (expressionMode === 'vary') {
      const exprCount = getSelectedCount(['p_expr']);
      const poseCount = getSelectedCount(['p_pose']);
      if (exprCount > 0) varyList.push(`表情(${exprCount}種類)`);
      if (poseCount > 0) varyList.push(`ポーズ(${poseCount}種類)`);
    }
    
    // 背景・構図
    const bgCount = getSelectedCount(['p_bg']);
    const compCount = getSelectedCount(['p_comp']);
    if (bgCount > 1) varyList.push(`背景(${bgCount}種類)`);
    if (compCount > 1) varyList.push(`構図(${compCount}種類)`);
    
    const varyElement = document.getElementById('vary-elements');
    if (varyElement) {
      varyElement.textContent = varyList.length > 0 ? varyList.join(' × ') : '変更なし（基本情報のみ）';
      varyElement.style.color = varyList.length > 0 ? '#f59e0b' : '#6b7280';
    }
  }
  
  // 固定要素の表示更新
  function updateFixedElements() {
    const fixedList = [];
    
    const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value;
    if (clothingMode === 'fixed') {
      fixedList.push('服装（基本情報）');
    }
    
    const expressionMode = document.querySelector('#panelProduction input[name="expressionMode"]:checked')?.value;
    if (expressionMode === 'fixed') {
      fixedList.push('表情・ポーズ');
    }
    
    const fixedElement = document.getElementById('fixed-elements');
    if (fixedElement) {
      fixedElement.textContent = fixedList.length > 0 ? fixedList.join(' + ') : '固定なし';
      fixedElement.style.color = fixedList.length > 0 ? '#10b981' : '#6b7280';
    }
  }
  
  // 組み合わせ数計算
  function updateComboCount() {
    let totalCombos = 1;
    const factors = [];
    
    const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value;
    if (clothingMode === 'vary') {
      const clothingCount = getSelectedCount(['p_outfit_top', 'p_outfit_pants', 'p_outfit_skirt', 'p_outfit_dress', 'p_outfit_shoes']);
      if (clothingCount > 0) {
        totalCombos *= clothingCount;
        factors.push(`服装×${clothingCount}`);
      }
    }
    
    const expressionMode = document.querySelector('#panelProduction input[name="expressionMode"]:checked')?.value;
    if (expressionMode === 'vary') {
      const exprCount = getSelectedCount(['p_expr']);
      const poseCount = getSelectedCount(['p_pose']);
      if (exprCount > 0) {
        totalCombos *= exprCount;
        factors.push(`表情×${exprCount}`);
      }
      if (poseCount > 0) {
        totalCombos *= poseCount;
        factors.push(`ポーズ×${poseCount}`);
      }
    }
    
    const comboElement = document.getElementById('combo-count');
    if (comboElement) {
      let displayText = `${totalCombos}通り`;
      if (factors.length > 0) {
        displayText += ` (${factors.join(' × ')})`;
      }
      
      comboElement.textContent = displayText;
      
      if (totalCombos <= 20) {
        comboElement.style.color = '#10b981';
      } else if (totalCombos <= 50) {
        comboElement.style.color = '#f59e0b';
      } else {
        comboElement.style.color = '#ef4444';
      }
    }
  }
  
  // 選択数カウント
  function getSelectedCount(containerIds) {
    let total = 0;
    containerIds.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        const checked = container.querySelectorAll('input:checked');
        total += checked.length;
      }
    });
    return total;
  }
  
  // グローバル関数として公開
  window.initProductionPresets = initProductionPresets;
  window.applyProductionPreset = applyProductionPreset;
  
  // 量産モードタブクリック時の初期化
  function setupTabInitialization() {
    const productionTab = document.querySelector('.tab[data-mode="production"]');
    if (productionTab) {
      productionTab.addEventListener('click', () => {
        setTimeout(() => {
          initProductionPresets();
        }, 200);
      });
    }
  }
  
  // DOM読み込み完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        setupTabInitialization();
        // 既に量産モードが表示されていれば初期化
        if (!document.getElementById('panelProduction')?.hidden) {
          initProductionPresets();
        }
      }, 500);
    });
  } else {
    setTimeout(() => {
      setupTabInitialization();
      if (!document.getElementById('panelProduction')?.hidden) {
        initProductionPresets();
      }
    }, 500);
  }
  
})();

// 修正版：enhancedBuildBatchProduction関数
function enhancedBuildBatchProduction(n) {
  const clothingMode = document.querySelector('#panelProduction input[name="clothingMode"]:checked')?.value || 'fixed';
  const expressionMode = document.querySelector('#panelProduction input[name="expressionMode"]:checked')?.value || 'fixed';
  
  //console.log('🚀 Enhanced Production:', {
  //  clothingMode,
  //  expressionMode,
  //  preset: window.productionCurrentPreset,
  //  count: n
  //});
  
  // 既存のbuildBatchProduction関数を呼び出し
  if (typeof buildBatchProduction === 'function') {
    return buildBatchProduction(n);
  } else {
   // console.warn('❌ buildBatchProduction関数が見つかりません');
    return [];
  }
}
// 生成ボタンのイベントリスナー修正
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btnGenProd = document.getElementById('btnGenProd');
    if (btnGenProd) {
      
      // 既存のイベントリスナーを削除
      const newBtn = btnGenProd.cloneNode(true);
      btnGenProd.parentNode.replaceChild(newBtn, btnGenProd);
      
      newBtn.addEventListener('click', () => {
        const cnt = parseInt(document.getElementById('countProd')?.value, 10) || 50;
        const rows = enhancedBuildBatchProduction(cnt);
        
        if (typeof renderLearnTableTo === 'function') {
          renderLearnTableTo("#tblProd tbody", rows);
        }
        if (typeof renderTextTriplet === 'function') {
          renderTextTriplet('outProd', rows, 'fmtProd');
        }
        if (typeof toast === 'function') {
          toast('✅ 量産セット生成完了');
        }

      });
    }
  }, 1500);
});
















// グローバル辞書変数修正コード

// 1. 辞書データの正しい設定
function fixGlobalDictionaries() {
  
  // DEFAULT_SFW_DICT から window.SFW に設定
  if (window.DEFAULT_SFW_DICT) {
    
    // SFWネストを確認
    if (window.DEFAULT_SFW_DICT.SFW) {
      window.SFW = window.DEFAULT_SFW_DICT.SFW;
    } else {
      window.SFW = window.DEFAULT_SFW_DICT;
    }
    
    Object.entries(window.SFW).forEach(([key, value]) => {
      if (Array.isArray(value)) {
      }
    });
  }
  
  // DEFAULT_NSFW_DICT から window.NSFW に設定
  if (window.DEFAULT_NSFW_DICT) {
    
    // NSFWネストを確認
    if (window.DEFAULT_NSFW_DICT.NSFW) {
      window.NSFW = window.DEFAULT_NSFW_DICT.NSFW;
    } else {
      window.NSFW = window.DEFAULT_NSFW_DICT;
    }
    
    Object.entries(window.NSFW).forEach(([key, value]) => {
      if (Array.isArray(value)) {

      }
    });
  }
  
}

// 2. 量産モード用データ再構築
function rebuildProductionData() {

  
  if (!window.SFW || !window.NSFW) {
 //   console.error('❌ グローバル辞書が設定されていません');
    return false;
  }
  
  // SFW要素の確認と設定
  const sfwRequired = ['expressions', 'pose', 'background', 'composition', 'outfit'];
  const sfwMissing = [];
  
  sfwRequired.forEach(key => {
    if (!window.SFW[key] || !Array.isArray(window.SFW[key]) || window.SFW[key].length === 0) {
      sfwMissing.push(key);
    } else {
     // console.log(`✅ SFW.${key}: ${window.SFW[key].length}件`);
    }
  });
  
  // NSFW要素の確認と設定
  const nsfwRequired = ['expression', 'pose', 'exposure', 'outfit', 'situation'];
  const nsfwMissing = [];
  
  nsfwRequired.forEach(key => {
    if (!window.NSFW[key] || !Array.isArray(window.NSFW[key]) || window.NSFW[key].length === 0) {
      nsfwMissing.push(key);
    } else {
     // console.log(`✅ NSFW.${key}: ${window.NSFW[key].length}件`);
    }
  });
  
  if (sfwMissing.length > 0) {
    //console.warn('⚠️ SFW不足要素:', sfwMissing);
  }
  
  if (nsfwMissing.length > 0) {
    //console.warn('⚠️ NSFW不足要素:', nsfwMissing);
  }
  
  return { sfwMissing, nsfwMissing };
}

// 3. レンダリング強制実行
function forceRenderAll() {
  
  try {
    // SFWレンダリング
    if (typeof renderSFW === 'function') {
      renderSFW();
    } else {
    //  console.warn('❌ renderSFW関数が見つかりません');
    }
    
    // NSFW量産レンダリング
    if (typeof renderNSFWProduction === 'function') {
      renderNSFWProduction();
    } else {
      // console.warn('❌ renderNSFWProduction関数が見つかりません');
    }
    
    // NSFW学習レンダリング
    if (typeof renderNSFWLearning === 'function') {
      renderNSFWLearning();
    } else {
      //console.warn('❌ renderNSFWLearning関数が見つかりません');
    }
    
    // アクセサリー設定
    if (typeof fillAccessorySlots === 'function') {
      fillAccessorySlots();
      //console.log('✅ fillAccessorySlots() 実行完了');
    }
    
  } catch (error) {
    //console.error('❌ レンダリングエラー:', error);
  }
}

// 4. 量産モード完全復旧
function fullProductionRecovery() {
  
  // Step 1: グローバル辞書設定
  fixGlobalDictionaries();
  
  // Step 2: データ再構築
  const dataCheck = rebuildProductionData();
  
  // Step 3: レンダリング実行
  forceRenderAll();
  
  // Step 4: 量産モード初期化
  setTimeout(() => {
    if (typeof completeProductionInit === 'function') {
      completeProductionInit();
    }
  }, 500);
  
  // Step 5: 最終確認
  setTimeout(() => {

    
    // 量産モードの選択肢確認
    const productionItems = {
      expressions: document.querySelectorAll('#p_expr input').length,
      poses: document.querySelectorAll('#p_pose input').length,
      backgrounds: document.querySelectorAll('#p_bg input').length,
      outfitTops: document.querySelectorAll('#p_outfit_top input').length
    };
    
    
    if (Object.values(productionItems).some(count => count > 0)) {
     // console.log('🎉 量産モード復旧成功！');
      if (typeof toast === 'function') {
        toast('✅ 量産モード復旧完了！プリセットを試してください');
      }
    } else {
    //  console.warn('⚠️ まだ選択肢が表示されていません');
    }
    
  }, 1500);
  
  return dataCheck;
}

// 5. デバッグ情報表示


// グローバル関数として公開
window.fixGlobalDictionaries = fixGlobalDictionaries;
window.rebuildProductionData = rebuildProductionData;
window.forceRenderAll = forceRenderAll;
window.fullProductionRecovery = fullProductionRecovery;







// 🔥 最優先改善項目

// 見える改善：UIボタンとパネルを追加

/* =========================================================
   完全なプリセット機能システム（修正版）
   ========================================================= */



// 1. PresetManager定義（必須）
const PresetManager = {
  save: function(mode, name, data) {
    try {
      const key = `LPM_PRESET_${mode}_${name}`;
      const preset = {
        name,
        mode,
        data,
        created: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(preset));
      if (typeof toast === 'function') {
        toast(`プリセット「${name}」を保存しました`);
      }
      return true;
    } catch (error) {
      return false;
    }
  },
  
  load: function(mode, name) {
    try {
      const key = `LPM_PRESET_${mode}_${name}`;
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      const preset = JSON.parse(stored);
      return preset;
    } catch (error) {
      return null;
    }
  },
  
  list: function(mode) {
    try {
      const presets = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`LPM_PRESET_${mode}_`)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const preset = JSON.parse(stored);
            presets.push(preset);
          }
        }
      }
      return presets.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      return [];
    }
  },
  
  delete: function(mode, name) {
    try {
      const key = `LPM_PRESET_${mode}_${name}`;
      localStorage.removeItem(key);
      if (typeof toast === 'function') {
        toast(`プリセット「${name}」を削除しました`);
      }
      return true;
    } catch (error) {
      return false;
    }
  }
};

// 2. HistoryManager定義
const HistoryManager = {
  add: function(mode, prompt, settings) {
    try {
      const history = this.get();
      const entry = {
        id: Date.now(),
        mode,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        settings,
        timestamp: new Date().toISOString()
      };
      
      history.unshift(entry);
      
      if (history.length > 100) {
        history.splice(100);
      }
      
      localStorage.setItem('LPM_HISTORY', JSON.stringify(history));
      return true;
    } catch (error) {
      return false;
    }
  },
  
  get: function() {
    try {
      const history = localStorage.getItem('LPM_HISTORY');
      return history ? JSON.parse(history) : [];
    } catch (error) {
      return [];
    }
  },
  
  clear: function() {
    try {
      localStorage.removeItem('LPM_HISTORY');
      if (typeof toast === 'function') {
        toast('履歴をクリアしました');
      }
      return true;
    } catch (error) {
      return false;
    }
  }
};

// 3. BackupManager定義
const BackupManager = {
  export: function() {
    try {
      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: {},
        history: HistoryManager.get()
      };
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('LPM_')) {
          backup.settings[key] = localStorage.getItem(key);
        }
      }
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LPM_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      if (typeof toast === 'function') {
        toast('バックアップをダウンロードしました');
      }
      return true;
    } catch (error) {
      return false;
    }
  },
  
  import: function(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        
        if (backup.settings) {
          Object.entries(backup.settings).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
        }
        
        if (typeof toast === 'function') {
          toast('バックアップを復元しました。ページを再読み込みしてください。');
        }
      } catch (error) {
        if (typeof toast === 'function') {
          toast('バックアップファイルの読み込みに失敗しました');
        }
      }
    };
    reader.readAsText(file);
  }
};

// 4. プリセットボタン追加（修正版）
function addPresetButtons() {
  
  const modes = [
    { id: 'panelProduction', name: 'production', title: '📦 量産モード' },
    { id: 'panelManga', name: 'manga', title: '🎨 漫画モード' },
    { id: 'panelPlanner', name: 'planner', title: '📷 撮影モード' },
    { id: 'panelLearning', name: 'learning', title: '🧠 学習モード' }
  ];
  
  modes.forEach(mode => {
    const panel = document.getElementById(mode.id);
    if (!panel) {
      return;
    }
    
    const header = panel.querySelector('h2');
    if (!header) {
      return;
    }
    
    if (header.querySelector('.preset-controls')) {
      return;
    }
    
    const presetControls = document.createElement('div');
    presetControls.className = 'preset-controls';
    presetControls.style.cssText = `
      display: inline-flex;
      gap: 8px;
      margin-left: 16px;
      align-items: center;
    `;
    
    presetControls.innerHTML = `
      <button type="button" class="btn ghost small preset-save-btn" data-mode="${mode.name}">
        💾 保存
      </button>
      <button type="button" class="btn ghost small preset-load-btn" data-mode="${mode.name}">
        📁 読込
      </button>
      <select class="preset-select" data-mode="${mode.name}" style="padding: 4px 8px; font-size: 12px; max-width: 150px;">
        <option value="">プリセット選択...</option>
      </select>
      <button type="button" class="btn bad small preset-delete-btn" data-mode="${mode.name}" style="font-size: 10px; padding: 2px 6px;">
        🗑️
      </button>
    `;
    
    header.appendChild(presetControls);
    
    const saveBtn = presetControls.querySelector('.preset-save-btn');
    const loadBtn = presetControls.querySelector('.preset-load-btn');
    const deleteBtn = presetControls.querySelector('.preset-delete-btn');
    const select = presetControls.querySelector('.preset-select');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => openPresetSaveDialog(mode.name));
    }
    
    if (loadBtn) {
      loadBtn.addEventListener('click', () => loadSelectedPreset(mode.name));
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteSelectedPreset(mode.name));
    }
    
    if (select) {
      select.addEventListener('change', () => {
        updateDeleteButtonState(mode.name);
      });
    }
    
    updatePresetList(mode.name);

  });
}

// 5. プリセット保存ダイアログ
function openPresetSaveDialog(mode) {
  const name = prompt(`${mode}モードのプリセット名を入力してください：`);
  if (!name || name.trim() === '') return;
  
  const settings = collectCurrentSettings(mode);
  
  const success = PresetManager.save(mode, name.trim(), settings);
  if (success) {
    updatePresetList(mode);
  }
}

// 6. 設定収集関数（拡張版）
function collectCurrentSettings(mode) {
  const settings = {};
  
  try {
    switch(mode) {
      case 'production':
        settings.clothingMode = document.querySelector('input[name="clothingMode"]:checked')?.value || 'fixed';
        settings.expressionMode = document.querySelector('input[name="expressionMode"]:checked')?.value || 'fixed';
        settings.seedMode = document.querySelector('input[name="seedMode"]:checked')?.value || 'fixed';
        settings.count = document.getElementById('countProd')?.value || '50';
        settings.fixedProd = document.getElementById('fixedProd')?.value || '';
        settings.negProd = document.getElementById('p_neg')?.value || '';
        
        if (typeof getMany === 'function') {
          settings.selectedOutfits = getMany('p_outfit_top').concat(getMany('p_outfit_pants'));
          settings.selectedExpressions = getMany('p_expr');
          settings.selectedPoses = getMany('p_pose');
          settings.selectedBackgrounds = getMany('p_bg');
        }
        break;
        
      case 'manga':
        settings.charBase = document.querySelector('input[name="mangaCharBase"]:checked')?.value || 'B';
        settings.useLoRA = document.getElementById('mangaUseLoRA')?.checked || false;
        settings.loraTag = document.getElementById('mangaLoRATag')?.value || '';
        settings.loraWeight = document.getElementById('mangaLoRAWeight')?.value || '0.8';
        settings.nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked || false;
        settings.secondCharEnabled = document.getElementById('mangaSecondCharEnable')?.checked || false;
        settings.fixedManga = document.getElementById('fixedManga')?.value || '';
        
        // 選択された要素も保存
        const mangaSelections = {};
        ['mangaEmotionPrimary', 'mangaExpressions', 'mangaEffectManga', 'mangaPose'].forEach(id => {
          const selected = document.querySelector(`input[name="${id}"]:checked`)?.value;
          if (selected) mangaSelections[id] = selected;
        });
        settings.selections = mangaSelections;
        break;
        
      case 'planner':
        if (typeof getOne === 'function') {
          settings.cameraAngle = getOne('pl_cameraAngle');
          settings.lighting = getOne('pl_lightingType');
          settings.background = getOne('pl_bg');
          settings.pose = getOne('pl_pose');
          settings.expression = getOne('pl_expr');
        }
        settings.fixedPlanner = document.getElementById('fixedPlanner')?.value || '';
        settings.negPlanner = document.getElementById('negPlanner')?.value || '';
        settings.useDefaultNeg = document.getElementById('pl_useDefaultNeg')?.checked || true;
        break;
        
      case 'learning':
        settings.wearMode = document.querySelector('input[name="learnWearMode"]:checked')?.value || 'basic';
        settings.count = document.getElementById('countLearn')?.value || '24';
        settings.nsfwEnabled = document.getElementById('nsfwLearn')?.checked || false;
        settings.nsfwLevel = document.querySelector('input[name="nsfwLevelLearn"]:checked')?.value || 'L1';
        settings.fixedLearn = document.getElementById('fixedLearn')?.value || '';
        settings.negLearn = document.getElementById('negLearn')?.value || '';
        settings.useDefaultNeg = document.getElementById('useDefaultNeg')?.checked || true;
        break;
    }
  } catch (error) {
    //console.error('❌ 設定収集エラー:', error);
  }
  
  return settings;
}

// 7. プリセット読み込み（修正版）
function loadSelectedPreset(mode) {
  
  const select = document.querySelector(`.preset-select[data-mode="${mode}"]`);
  if (!select) {
    if (typeof toast === 'function') {
      toast('プリセット選択ボックスが見つかりません');
    }
    return;
  }
  
  const presetName = select.value;
  
  if (!presetName || presetName.trim() === '') {
    if (typeof toast === 'function') {
      toast('プリセットを選択してください');
    }
    select.style.border = '2px solid #f59e0b';
    setTimeout(() => {
      select.style.border = '';
    }, 1000);
    return;
  }
  
  const preset = PresetManager.load(mode, presetName);
  if (!preset) {
    if (typeof toast === 'function') {
      toast(`プリセット「${presetName}」の読み込みに失敗しました`);
    }
    return;
  }

  
  try {
    applySettingsAdvanced(mode, preset.data);
    
    if (typeof toast === 'function') {
      toast(`✅ プリセット「${presetName}」を読み込みました`);
    }
    
    const loadBtn = document.querySelector(`.preset-load-btn[data-mode="${mode}"]`);
    if (loadBtn) {
      const originalText = loadBtn.textContent;
      loadBtn.textContent = '✅ 完了';
      loadBtn.style.background = '#10b981';
      setTimeout(() => {
        loadBtn.textContent = originalText;
        loadBtn.style.background = '';
      }, 1500);
    }
    
  } catch (error) {
    if (typeof toast === 'function') {
      toast('設定の適用に失敗しました');
    }
  }
}

// 8. 設定適用関数（高度版）
function applySettingsAdvanced(mode, settings) {
  
  try {
    switch(mode) {
      case 'production':
        
        if (settings.clothingMode) {
          const radio = document.querySelector(`input[name="clothingMode"][value="${settings.clothingMode}"]`);
          if (radio) {
            radio.checked = true;
            
            if (typeof toggleClothingMode === 'function') {
              toggleClothingMode();
            }
          }
        }
        
        if (settings.expressionMode) {
          const radio = document.querySelector(`input[name="expressionMode"][value="${settings.expressionMode}"]`);
          if (radio) {
            radio.checked = true;
            
            if (typeof toggleExpressionMode === 'function') {
              toggleExpressionMode();
            }
          }
        }
        
        if (settings.seedMode) {
          const radio = document.querySelector(`input[name="seedMode"][value="${settings.seedMode}"]`);
          if (radio) radio.checked = true;
        }
        
        if (settings.count) {
          const countSelect = document.getElementById('countProd');
          if (countSelect) countSelect.value = settings.count;
        }
        
        if (settings.fixedProd) {
          const fixedInput = document.getElementById('fixedProd');
          if (fixedInput) fixedInput.value = settings.fixedProd;
        }
        
        if (settings.negProd) {
          const negInput = document.getElementById('p_neg');
          if (negInput) negInput.value = settings.negProd;
        }
        
        if (typeof updateProductionStatus === 'function') {
          updateProductionStatus();
        }
        break;
        
      case 'manga':
        
        if (settings.charBase) {
          const radio = document.querySelector(`input[name="mangaCharBase"][value="${settings.charBase}"]`);
          if (radio) {
            radio.checked = true;
          }
        }
        
        if (settings.useLoRA !== undefined) {
          const checkbox = document.getElementById('mangaUseLoRA');
          if (checkbox) {
            checkbox.checked = settings.useLoRA;
            
            if (typeof toggleLoRASettings === 'function') {
              toggleLoRASettings();
            }
          }
        }
        
        if (settings.loraTag) {
          const input = document.getElementById('mangaLoRATag');
          if (input) {
            input.value = settings.loraTag;
          }
        }
        
        if (settings.loraWeight) {
          const slider = document.getElementById('mangaLoRAWeight');
          const display = document.getElementById('mangaLoRAWeightValue');
          if (slider) slider.value = settings.loraWeight;
          if (display) display.textContent = settings.loraWeight;
        }
        
        if (settings.nsfwEnabled !== undefined) {
          const checkbox = document.getElementById('mangaNSFWEnable');
          if (checkbox) {
            checkbox.checked = settings.nsfwEnabled;
            if (typeof toggleMangaNSFWPanel === 'function') {
              toggleMangaNSFWPanel();
            }
          }
        }
        
        if (settings.secondCharEnabled !== undefined) {
          const checkbox = document.getElementById('mangaSecondCharEnable');
          if (checkbox) {
            checkbox.checked = settings.secondCharEnabled;
            if (typeof toggleSecondCharSettings === 'function') {
              toggleSecondCharSettings();
            }
          }
        }
        
        if (settings.fixedManga) {
          const textarea = document.getElementById('fixedManga');
          if (textarea) textarea.value = settings.fixedManga;
        }
        
        // 選択状態の復元
        if (settings.selections) {
          Object.entries(settings.selections).forEach(([elementName, value]) => {
            const radio = document.querySelector(`input[name="${elementName}"][value="${value}"]`);
            if (radio) radio.checked = true;
          });
        }
        
        if (typeof updateMangaOutput === 'function') {
          setTimeout(updateMangaOutput, 100);
        }
        break;
        
      case 'planner':
        
        const plannerSettings = ['cameraAngle', 'lighting', 'background', 'pose', 'expression'];
        plannerSettings.forEach(setting => {
          if (settings[setting]) {
            const radio = document.querySelector(`input[name="pl_${setting}"][value="${settings[setting]}"]`);
            if (radio) {
              radio.checked = true;
            }
          }
        });
        
        if (settings.fixedPlanner) {
          const textarea = document.getElementById('fixedPlanner');
          if (textarea) textarea.value = settings.fixedPlanner;
        }
        
        if (settings.negPlanner) {
          const textarea = document.getElementById('negPlanner');
          if (textarea) textarea.value = settings.negPlanner;
        }
        
        if (settings.useDefaultNeg !== undefined) {
          const checkbox = document.getElementById('pl_useDefaultNeg');
          if (checkbox) checkbox.checked = settings.useDefaultNeg;
        }
        break;
        
      case 'learning':
        
        if (settings.wearMode) {
          const radio = document.querySelector(`input[name="learnWearMode"][value="${settings.wearMode}"]`);
          if (radio) {
            radio.checked = true;
          }
        }
        
        if (settings.count) {
          const select = document.getElementById('countLearn');
          if (select) {
            select.value = settings.count;
          }
        }
        
        if (settings.nsfwEnabled !== undefined) {
          const checkbox = document.getElementById('nsfwLearn');
          if (checkbox) {
            checkbox.checked = settings.nsfwEnabled;
            const panel = document.getElementById('nsfwLearnPanel');
            if (panel) panel.style.display = settings.nsfwEnabled ? '' : 'none';
          }
        }
        
        if (settings.nsfwLevel) {
          const radio = document.querySelector(`input[name="nsfwLevelLearn"][value="${settings.nsfwLevel}"]`);
          if (radio) radio.checked = true;
        }
        
        if (settings.fixedLearn) {
          const textarea = document.getElementById('fixedLearn');
          if (textarea) textarea.value = settings.fixedLearn;
        }
        
        if (settings.negLearn) {
          const textarea = document.getElementById('negLearn');
          if (textarea) textarea.value = settings.negLearn;
        }
        
        if (settings.useDefaultNeg !== undefined) {
          const checkbox = document.getElementById('useDefaultNeg');
          if (checkbox) checkbox.checked = settings.useDefaultNeg;
        }
        break;
        
      default:
    }
    
    
  } catch (error) {
    throw error;
  }
}

// 9. プリセット削除
function deleteSelectedPreset(mode) {
  const select = document.querySelector(`.preset-select[data-mode="${mode}"]`);
  const presetName = select?.value;
  
  if (!presetName) {
    toast('削除するプリセットを選択してください');
    return;
  }
  
  if (confirm(`プリセット「${presetName}」を削除しますか？`)) {
    const success = PresetManager.delete(mode, presetName);
    if (success) {
      updatePresetList(mode);
    }
  }
}

// 10. 削除ボタンの状態更新
function updateDeleteButtonState(mode) {
  const select = document.querySelector(`.preset-select[data-mode="${mode}"]`);
  const deleteBtn = document.querySelector(`.preset-delete-btn[data-mode="${mode}"]`);
  
  if (select && deleteBtn) {
    deleteBtn.disabled = !select.value;
    deleteBtn.style.opacity = select.value ? '1' : '0.5';
  }
}

// 11. プリセット一覧更新
function updatePresetList(mode) {
  const select = document.querySelector(`.preset-select[data-mode="${mode}"]`);
  if (!select) return;
  
  const presets = PresetManager.list(mode);
  
  select.innerHTML = '<option value="">プリセット選択...</option>';
  
  presets.forEach(preset => {
    const option = document.createElement('option');
    option.value = preset.name;
    option.textContent = `${preset.name} (${new Date(preset.created).toLocaleDateString()})`;
    select.appendChild(option);
  });
  
  updateDeleteButtonState(mode);
  
}

// 12. バックアップUI追加
function addBackupUI() {
  const settingsPanel = document.getElementById('panelSettings');
  if (!settingsPanel) return;
  
  const backupPanel = document.createElement('div');
  backupPanel.className = 'panel';
  backupPanel.innerHTML = `
    <h3>💾 バックアップ・復元</h3>
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button id="backup-export" class="btn ok small">📤 バックアップエクスポート</button>
      <label for="backup-import" class="btn ghost small">📥 バックアップインポート</label>
      <input type="file" id="backup-import" accept=".json" style="display: none;">
    </div>
    <div class="note mini">
      すべての設定、プリセット、履歴をバックアップできます
    </div>
  `;
  
  settingsPanel.insertBefore(backupPanel, settingsPanel.firstChild.nextSibling);
  
  document.getElementById('backup-export')?.addEventListener('click', () => {
    BackupManager.export();
  });
  
  document.getElementById('backup-import')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      BackupManager.import(file);
    }
  });
  
}

// 13. 履歴UI追加
function addHistoryUI() {
  const settingsPanel = document.getElementById('panelSettings');
  if (!settingsPanel) return;
  
  const historyPanel = document.createElement('div');
  historyPanel.className = 'panel';
  historyPanel.innerHTML = `
    <h3>📜 使用履歴</h3>
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button id="history-view" class="btn ghost small">📋 履歴表示</button>
      <button id="history-clear" class="btn bad small">🗑️ 履歴クリア</button>
    </div>
    <div id="history-content" style="max-height: 200px; overflow-y: auto; display: none;">
      <div class="note mini">履歴を読み込み中...</div>
    </div>
  `;
  
  settingsPanel.insertBefore(historyPanel, settingsPanel.children[1]);
  
  document.getElementById('history-view')?.addEventListener('click', () => {
    toggleHistoryView();
  });
  
  document.getElementById('history-clear')?.addEventListener('click', () => {
    if (confirm('使用履歴をすべて削除しますか？')) {
      HistoryManager.clear();
      updateHistoryView();
    }
  });
  
}

// 14. 履歴表示切り替え
function toggleHistoryView() {
  const content = document.getElementById('history-content');
  const btn = document.getElementById('history-view');
  
  if (content && btn) {
    if (content.style.display === 'none') {
      content.style.display = 'block';
      btn.textContent = '📋 履歴非表示';
      updateHistoryView();
    } else {
      content.style.display = 'none';
      btn.textContent = '📋 履歴表示';
    }
  }
}

// 15. 履歴表示更新
function updateHistoryView() {
  const content = document.getElementById('history-content');
  if (!content) return;
  
  const history = HistoryManager.get();
  
  if (history.length === 0) {
content.innerHTML = '<div class="note mini">履歴がありません</div>';
   return;
 }
 
 content.innerHTML = history.slice(0, 20).map(entry => `
   <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px;">
     <div style="color: #3b82f6; font-weight: 500;">${entry.mode}モード</div>
     <div style="color: #ccc; margin: 4px 0;">${entry.prompt}</div>
     <div style="color: #888; font-size: 11px;">${new Date(entry.timestamp).toLocaleString()}</div>
   </div>
 `).join('');
}


// 17. 初期化関数
function initCompletePresetSystem() {
 
 if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', () => {
     setTimeout(() => {
       addPresetButtons();
       addBackupUI();
       addHistoryUI();
     }, 1500);
   });
 } else {
   setTimeout(() => {
     addPresetButtons();
     addBackupUI();
     addHistoryUI();
   }, 1500);
 }
 
}

// 18. クイックアクセス機能
function addQuickAccessShortcuts() {
 document.addEventListener('keydown', (e) => {
   // Ctrl+S でプリセット保存
   if (e.ctrlKey && e.key === 's') {
     e.preventDefault();
     const activeTab = document.querySelector('.tab.active');
     if (activeTab) {
       const mode = activeTab.dataset.mode;
       if (['production', 'manga', 'planner', 'learning'].includes(mode)) {
         openPresetSaveDialog(mode);
       }
     }
   }
   
   // Ctrl+L でプリセット読み込み
   if (e.ctrlKey && e.key === 'l') {
     e.preventDefault();
     const activeTab = document.querySelector('.tab.active');
     if (activeTab) {
       const mode = activeTab.dataset.mode;
       if (['production', 'manga', 'planner', 'learning'].includes(mode)) {
         const select = document.querySelector(`.preset-select[data-mode="${mode}"]`);
         if (select && select.value) {
           loadSelectedPreset(mode);
         } else {
           toast('プリセットを選択してください');
         }
       }
     }
   }
 });

}

// 19. プリセット管理UI（詳細）
function addAdvancedPresetManager() {
 const settingsPanel = document.getElementById('panelSettings');
 if (!settingsPanel) return;
 
 const presetManagerPanel = document.createElement('div');
 presetManagerPanel.className = 'panel';
 presetManagerPanel.innerHTML = `
   <h3>🎛️ プリセット管理</h3>
   <div style="display: flex; gap: 8px; margin-bottom: 12px;">
     <button id="preset-manager-view" class="btn ghost small">📋 全プリセット表示</button>
     <button id="preset-manager-export" class="btn ok small">📤 プリセットエクスポート</button>
     <label for="preset-manager-import" class="btn ghost small">📥 プリセットインポート</label>
     <input type="file" id="preset-manager-import" accept=".json" style="display: none;">
   </div>
   <div id="preset-manager-content" style="max-height: 300px; overflow-y: auto; display: none;">
     <div class="note mini">プリセットを読み込み中...</div>
   </div>
 `;
 
 settingsPanel.insertBefore(presetManagerPanel, settingsPanel.children[2]);
 
 document.getElementById('preset-manager-view')?.addEventListener('click', () => {
   togglePresetManagerView();
 });
 
 document.getElementById('preset-manager-export')?.addEventListener('click', () => {
   exportAllPresets();
 });
 
 document.getElementById('preset-manager-import')?.addEventListener('change', (e) => {
   const file = e.target.files[0];
   if (file) {
     importPresets(file);
   }
 });

}

// 20. プリセット管理表示切り替え
function togglePresetManagerView() {
 const content = document.getElementById('preset-manager-content');
 const btn = document.getElementById('preset-manager-view');
 
 if (content && btn) {
   if (content.style.display === 'none') {
     content.style.display = 'block';
     btn.textContent = '📋 プリセット非表示';
     updatePresetManagerView();
   } else {
     content.style.display = 'none';
     btn.textContent = '📋 全プリセット表示';
   }
 }
}

// 21. プリセット管理表示更新
function updatePresetManagerView() {
 const content = document.getElementById('preset-manager-content');
 if (!content) return;
 
 const modes = ['production', 'manga', 'planner', 'learning'];
 let html = '';
 let totalPresets = 0;
 
 modes.forEach(mode => {
   const presets = PresetManager.list(mode);
   totalPresets += presets.length;
   
   if (presets.length > 0) {
     html += `<div style="margin-bottom: 16px;">
       <h4 style="margin: 0 0 8px 0; color: #3b82f6;">${mode}モード (${presets.length}件)</h4>`;
     
     presets.forEach(preset => {
       html += `
         <div style="padding: 8px; border: 1px solid #444; border-radius: 4px; margin-bottom: 4px; background: rgba(0,0,0,0.2);">
           <div style="display: flex; justify-content: space-between; align-items: center;">
             <div>
               <div style="font-weight: 500;">${preset.name}</div>
               <div style="font-size: 11px; color: #888;">${new Date(preset.created).toLocaleString()}</div>
             </div>
             <div style="display: flex; gap: 4px;">
               <button onclick="loadPresetById('${mode}', '${preset.name}')" class="btn ghost small" style="padding: 2px 6px; font-size: 10px;">読込</button>
               <button onclick="deletePresetById('${mode}', '${preset.name}')" class="btn bad small" style="padding: 2px 6px; font-size: 10px;">削除</button>
             </div>
           </div>
         </div>`;
     });
     
     html += '</div>';
   }
 });
 
 if (totalPresets === 0) {
   content.innerHTML = '<div class="note mini">保存されたプリセットがありません</div>';
 } else {
   content.innerHTML = `<div style="margin-bottom: 12px; font-size: 12px; color: #888;">総計: ${totalPresets}件のプリセット</div>` + html;
 }
}

// 22. プリセットID指定読み込み
window.loadPresetById = function(mode, name) {
 const preset = PresetManager.load(mode, name);
 if (preset) {
   // 該当タブに切り替え
   const tab = document.querySelector(`.tab[data-mode="${mode}"]`);
   if (tab) tab.click();
   
   setTimeout(() => {
     applySettingsAdvanced(mode, preset.data);
     toast(`✅ ${mode}モードのプリセット「${name}」を読み込みました`);
   }, 200);
 }
};

// 23. プリセットID指定削除
window.deletePresetById = function(mode, name) {
 if (confirm(`プリセット「${name}」(${mode}モード)を削除しますか？`)) {
   const success = PresetManager.delete(mode, name);
   if (success) {
     updatePresetManagerView();
     updatePresetList(mode);
   }
 }
};

// 24. 全プリセットエクスポート
function exportAllPresets() {
 const allPresets = {};
 const modes = ['production', 'manga', 'planner', 'learning'];
 
 modes.forEach(mode => {
   allPresets[mode] = PresetManager.list(mode);
 });
 
 const exportData = {
   version: '1.0',
   timestamp: new Date().toISOString(),
   presets: allPresets
 };
 
 const blob = new Blob([JSON.stringify(exportData, null, 2)], {
   type: 'application/json'
 });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `LPM_presets_${new Date().toISOString().split('T')[0]}.json`;
 a.click();
 URL.revokeObjectURL(url);
 
 toast('全プリセットをエクスポートしました');
}

// 25. プリセットインポート
function importPresets(file) {
 const reader = new FileReader();
 reader.onload = (e) => {
   try {
     const data = JSON.parse(e.target.result);
     
     if (data.presets) {
       let importCount = 0;
       Object.entries(data.presets).forEach(([mode, presets]) => {
         presets.forEach(preset => {
           PresetManager.save(mode, preset.name, preset.data);
           importCount++;
         });
       });
       
       // 全てのプリセット一覧を更新
       ['production', 'manga', 'planner', 'learning'].forEach(mode => {
         updatePresetList(mode);
       });
       
       updatePresetManagerView();
       toast(`${importCount}件のプリセットをインポートしました`);
     }
   } catch (error) {
     toast('プリセットファイルの読み込みに失敗しました');
   }
 };
 reader.readAsText(file);
}

// グローバル関数として公開
window.PresetManager = PresetManager;
window.HistoryManager = HistoryManager;
window.BackupManager = BackupManager;
window.addPresetButtons = addPresetButtons;
window.openPresetSaveDialog = openPresetSaveDialog;
window.loadSelectedPreset = loadSelectedPreset;
window.deleteSelectedPreset = deleteSelectedPreset;
window.updatePresetList = updatePresetList;
window.collectCurrentSettings = collectCurrentSettings;
window.applySettingsAdvanced = applySettingsAdvanced;

// 自動初期化
initCompletePresetSystem();
addQuickAccessShortcuts();

setTimeout(() => {
 addAdvancedPresetManager();
}, 2000);


// デバッグ用関数
window.testPresetSystem = function() {
 
 const testResult = PresetManager.save('production', 'test_preset', {test: 'data'});
 
 const list = PresetManager.list('production');
 
 const loaded = PresetManager.load('production', 'test_preset');
};


// プリセットコントロールのレイアウト調整
function adjustPresetControlsLayout() {
  const style = document.createElement('style');
  style.textContent = `
    .preset-controls {
      display: inline-flex !important;
      gap: 6px !important;
      margin-left: 12px !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
    }
    
    .preset-controls .btn {
      padding: 3px 6px !important;
      font-size: 11px !important;
      white-space: nowrap !important;
      min-width: auto !important;
    }
    
    .preset-controls .preset-select {
      padding: 3px 6px !important;
      font-size: 11px !important;
      min-width: 120px !important;
      max-width: 140px !important;
    }
    
    .preset-controls .preset-delete-btn {
      padding: 2px 4px !important;
      font-size: 10px !important;
      min-width: 20px !important;
    }
    
    /* ヘッダー全体の調整 */
    .card h2 {
      display: flex !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      gap: 8px !important;
    }
    
    /* 露出控えめ推奨バッジなどの調整 */
    .badge {
      margin-left: 8px !important;
      font-size: 10px !important;
      padding: 2px 6px !important;
    }
  `;
  document.head.appendChild(style);
  
}

// プリセットボタン追加時にレイアウト調整も実行
const originalAddPresetButtons = window.addPresetButtons;
window.addPresetButtons = function() {
  if (originalAddPresetButtons) {
    originalAddPresetButtons();
  }
  
  // レイアウト調整を追加
  setTimeout(adjustPresetControlsLayout, 100);
};

// 既に実行済みの場合は即座に調整
setTimeout(adjustPresetControlsLayout, 500);

/* ===================================================
   GAS連携 UI修正完全版 - ダークテーマ対応
   =================================================== */

// 1. 設定管理
const GAS_SETTINGS_KEY = "LPM_GAS_SETTINGS_V2";

const GASSettings = {
  gasUrl: "",
  gasToken: "",
  autoBackup: false,
  backupInterval: 24,
  lastBackup: null
};

// 2. GASConnector（完全版）
class GASConnector {
  constructor() {
    this.isConnected = false;
    this.lastError = null;
    this.maxUrlLength = 8000;
  }
  
  checkDataSize(data) {
    const dataString = JSON.stringify(data);
    const estimatedUrlLength = GASSettings.gasUrl.length + dataString.length + 200;
    return {
      size: dataString.length,
      estimatedUrl: estimatedUrlLength,
      isTooLarge: estimatedUrlLength > this.maxUrlLength,
      dataString
    };
  }
  
  async sendViaJSONP(action, data) {
    const sizeCheck = this.checkDataSize(data);
    
    if (sizeCheck.isTooLarge) {
      throw new Error(`データが大きすぎます (${sizeCheck.size}文字)`);
    }
    
    return new Promise((resolve, reject) => {
      const callbackName = `gasCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeoutDuration = 30000;
      let isResolved = false;
      
      window[callbackName] = function(response) {
        if (isResolved) return; // 重複実行を防ぐ
        isResolved = true;
        
        clearTimeout(timeoutId);
        delete window[callbackName];
        
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        
        
        if (response && response.status === "success") {
          resolve(response);
        } else if (response && response.status === "error") {
          reject(new Error(response.message || "認証エラー"));
        } else {
          reject(new Error("無効なレスポンス"));
        }
      };
      
      const timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        
        delete window[callbackName];
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("タイムアウト: GASからの応答がありません（30秒）"));
      }, timeoutDuration);
      
      const params = new URLSearchParams({
        action,
        data: JSON.stringify(data),
        callback: callbackName,
        timestamp: new Date().toISOString(),
        token: GASSettings.gasToken || ""
      });
      
      const script = document.createElement("script");
      script.src = `${GASSettings.gasUrl}?${params.toString()}`;
      script.onerror = () => {
        if (isResolved) return;
        isResolved = true;
        
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("スクリプトの読み込みに失敗しました"));
      };
      
      document.head.appendChild(script);
    });
  }
  
  async sendViaForm(action, data) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.name = `gasFrame_${Date.now()}`;
      
      const form = document.createElement("form");
      form.method = "POST";
      form.action = GASSettings.gasUrl;
      form.target = iframe.name;
      form.enctype = "application/x-www-form-urlencoded";
      
      const formData = {
        action,
        data: JSON.stringify(data),
        timestamp: new Date().toISOString(),
        token: GASSettings.gasToken || ""
      };
      
      Object.entries(formData).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      
      let resolved = false;
      
      iframe.onload = () => {
        if (resolved) return;
        resolved = true;
        
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
            document.body.removeChild(form);
          } catch (e) {
          //  console.warn("クリーンアップエラー:", e);
          }
          
          resolve({ 
            status: "success", 
            message: "データ送信完了（フォーム方式）",
            method: "form"
          });
        }, 1000);
      };
      
      iframe.onerror = () => {
        if (resolved) return;
        resolved = true;
        
        try {
          document.body.removeChild(iframe);
          document.body.removeChild(form);
        } catch (e) {
        //  console.warn("クリーンアップエラー:", e);
        }
        
        reject(new Error("フォーム送信に失敗しました"));
      };
      
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        
        try {
          document.body.removeChild(iframe);
          document.body.removeChild(form);
        } catch (e) {
        //  console.warn("クリーンアップエラー:", e);
        }
        
        reject(new Error("フォーム送信がタイムアウトしました"));
      }, 45000);
      
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    });
  }
  
  async sendData(action, data) {
    if (!GASSettings.gasUrl) {
      throw new Error("GAS URLが設定されていません");
    }
    
    try {
      const sizeCheck = this.checkDataSize(data);
      
      if (action === 'ping') {
        return await this.sendViaJSONP(action, data);
      }
      
      if (sizeCheck.size < 2000) {
        return await this.sendViaJSONP(action, data);
      } else {
        return await this.sendViaForm(action, data);
      }
      
    } catch (error) {
      
      if (error.message.includes("スクリプトの読み込みに失敗") || 
          error.message.includes("データが大きすぎます")) {
        try {
          return await this.sendViaForm(action, data);
        } catch (formError) {
          throw new Error(`両方の送信方式が失敗: JSONP(${error.message}), Form(${formError.message})`);
        }
      }
      
      throw error;
    }
  }
  
  async testConnection() {
    if (!GASSettings.gasUrl) {
      throw new Error("GAS URLが設定されていません");
    }
    
    try {
      const result = await this.sendViaJSONP("ping", {});
      this.isConnected = true;
      this.lastError = null;
      return { 
        success: true, 
        message: result.message || "接続成功",
        data: result.data
      };
    } catch (error) {
      this.isConnected = false;
      this.lastError = error.message;
      throw error;
    }
  }
  
  async sendCSV(type, csvData, metadata = {}) {
    const charName = document.getElementById("charName")?.value || "unnamed";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${type}_${charName}_${timestamp}.csv`;
    
    const sizeCheck = this.checkDataSize({
      type,
      filename,
      csv: csvData,
      metadata
    });
    
    
    return await this.sendData("save_csv", {
      type,
      filename,
      csv: csvData,
      metadata: {
        characterName: charName,
        generatedAt: new Date().toISOString(),
        rowCount: csvData.split('\n').length - 1,
        dataSize: sizeCheck.size,
        ...metadata
      }
    });
  }
  
  async sendBackup(backupData) {
    const optimizedBackup = {
      version: backupData.version,
      timestamp: backupData.timestamp,
      settings: {}
    };
    
    for (const [key, value] of Object.entries(backupData.settings || {})) {
      if (key.startsWith("LPM_") && !key.includes("_TEMP_") && !key.includes("_CACHE_")) {
        optimizedBackup.settings[key] = value;
      }
    }
    
    const sizeCheck = this.checkDataSize(optimizedBackup);
    
    // バックアップは常にフォーム方式を使用（データが大きいため）
    return await this.sendViaForm("save_backup", {
      backup: optimizedBackup,
      metadata: {
        backupAt: new Date().toISOString(),
        originalSize: JSON.stringify(backupData).length,
        optimizedSize: sizeCheck.size,
        compression: "optimized"
      }
    });
  }
}

// 3. 設定管理関数
function loadGASSettings() {
  try {
    const stored = localStorage.getItem(GAS_SETTINGS_KEY);
    if (stored) {
      Object.assign(GASSettings, JSON.parse(stored));
    }
  } catch (error) {
    // console.warn("GAS設定の読み込みに失敗:", error);
  }
  
  const urlInput = document.getElementById("set_gasUrl");
  const tokenInput = document.getElementById("set_gasToken");
  const autoBackupCheck = document.getElementById("set_autoBackup");
  const intervalInput = document.getElementById("set_backupInterval");
  
  if (urlInput) urlInput.value = GASSettings.gasUrl;
  if (tokenInput) tokenInput.value = GASSettings.gasToken;
  if (autoBackupCheck) autoBackupCheck.checked = GASSettings.autoBackup;
  if (intervalInput) intervalInput.value = GASSettings.backupInterval;
}

function saveGASSettings() {
  const urlInput = document.getElementById("set_gasUrl");
  const tokenInput = document.getElementById("set_gasToken");
  const autoBackupCheck = document.getElementById("set_autoBackup");
  const intervalInput = document.getElementById("set_backupInterval");
  
  GASSettings.gasUrl = urlInput?.value.trim() || "";
  GASSettings.gasToken = tokenInput?.value.trim() || "";
  GASSettings.autoBackup = autoBackupCheck?.checked || false;
  GASSettings.backupInterval = parseInt(intervalInput?.value) || 24;
  
  try {
    localStorage.setItem(GAS_SETTINGS_KEY, JSON.stringify(GASSettings));
    if (typeof toast === 'function') {
      toast("GAS設定を保存しました");
    } else {
    }
    return true;
  } catch (error) {
    if (typeof toast === 'function') {
      toast("GAS設定の保存に失敗しました");
    } else {
    }
    return false;
  }
}

// 4. 安全なUI構築（ダークテーマ対応）
function setupGASUI() {
  try {
    // 設定パネルを安全に取得
    let settingsPanel = document.getElementById("panelSettings");
    
    // 設定パネルが見つからない場合、代替場所を探す
    if (!settingsPanel) {
      settingsPanel = document.querySelector('.panel:last-child') || document.body;
    }
    
    // 既存のGAS設定セクションをチェック
    let gasSection = document.getElementById("gas-settings-section");
    if (gasSection) {
      // console.log("既存のGAS設定セクションを更新します");
    } else {
      gasSection = document.createElement("div");
      gasSection.id = "gas-settings-section";
      gasSection.className = "panel";
      settingsPanel.appendChild(gasSection);
    }
    
    gasSection.innerHTML = `
      <h3 style="margin-top: 0; color: var(--ink);">☁️ Google Apps Script連携</h3>
      
      <div style="margin: 15px 0;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold; color: var(--ink);">GAS WebアプリURL:</label>
        <input type="url" id="set_gasUrl" placeholder="https://script.google.com/macros/s/...../exec" 
               style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: #0f141d; color: var(--ink);">
        <div style="font-size: 12px; color: var(--muted); margin-top: 5px;">GASでデプロイしたWebアプリのURLを入力</div>
      </div>
      
      <div style="margin: 15px 0;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold; color: var(--ink);">認証トークン（オプション）:</label>
        <input type="password" id="set_gasToken" placeholder="セキュリティ用トークン" 
               style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: #0f141d; color: var(--ink);">
        <div style="font-size: 12px; color: var(--muted); margin-top: 5px;">GAS側で認証を設定している場合のみ</div>
      </div>
      
      <div style="margin: 15px 0;">
        <label style="display: flex; align-items: center; color: var(--ink);">
          <input type="checkbox" id="set_autoBackup" style="margin-right: 8px;"> 自動バックアップを有効化
        </label>
        <div style="margin-left: 20px; margin-top: 8px;">
          <label style="color: var(--ink);">間隔: 
            <select id="set_backupInterval" style="padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: #0f141d; color: var(--ink);">
              <option value="1">1時間</option>
              <option value="6">6時間</option>
              <option value="24" selected>24時間</option>
              <option value="168">1週間</option>
            </select>
          </label>
        </div>
      </div>
      
      <div style="margin: 20px 0; display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="btnSaveGASSettings" style="padding: 8px 16px; background: #5fd39a; color: #0b0f16; border: none; border-radius: 10px; cursor: pointer; font-weight: 700;">💾 設定保存</button>
        <button id="btnTestGAS" style="padding: 8px 16px; background: #6aa1ff; color: #0b0f16; border: none; border-radius: 10px; cursor: pointer; font-weight: 700;">🔌 接続テスト</button>
        <button id="btnManualBackup" style="padding: 8px 16px; background: #1d2432; color: #e6eeff; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; font-weight: 600;">☁️ 手動バックアップ</button>
        <button id="btnResetGAS" style="padding: 8px 16px; background: #ff6b6b; color: #0b0f16; border: none; border-radius: 10px; cursor: pointer; font-weight: 700;">🗑️ リセット</button>
      </div>
      
      <div id="gasStatus" style="margin-top: 12px; padding: 8px; border-radius: 10px; display: none; color: #fff;">
        ステータス表示エリア
      </div>
    `;
    
    // イベントリスナーを安全に設定
    setupEventListeners();
    
    // 設定を読み込み
    loadGASSettings();
    
    
  } catch (error) {
   // console.error("❌ GAS UI設定エラー:", error);
  }
}

// 5. イベントリスナー設定
function setupEventListeners() {
  // 設定保存ボタン
  const saveBtn = document.getElementById("btnSaveGASSettings");
  if (saveBtn) {
    saveBtn.onclick = saveGASSettings;
  }
  
  // 接続テストボタン
  const testBtn = document.getElementById("btnTestGAS");
  if (testBtn) {
    testBtn.onclick = testGASConnection;
  }
  
  // 手動バックアップボタン
  const backupBtn = document.getElementById("btnManualBackup");
  if (backupBtn) {
    backupBtn.onclick = performManualBackup;
  }
  
  // リセットボタン
  const resetBtn = document.getElementById("btnResetGAS");
  if (resetBtn) {
    resetBtn.onclick = resetGASSettings;
  }
}

// 6. 主要機能関数
async function testGASConnection() {
  const statusDiv = document.getElementById("gasStatus");
  const testBtn = document.getElementById("btnTestGAS");
  
  if (!statusDiv || !testBtn) {
    return;
  }
  
  statusDiv.style.display = "block";
  statusDiv.style.backgroundColor = "#fbbf24";
  statusDiv.style.color = "#92400e";
  statusDiv.textContent = "🔄 接続テスト中...";
  testBtn.disabled = true;
  testBtn.textContent = "テスト中...";
  
  try {
    const result = await gasConnector.testConnection();
    
    statusDiv.style.backgroundColor = "#10b981";
    statusDiv.style.color = "#ffffff";
    statusDiv.innerHTML = `
      ✅ 接続成功!<br>
      📡 ${result.message}<br>
      ⏰ ${new Date().toLocaleString('ja-JP')}
    `;
    
    if (typeof toast === 'function') {
      toast("GAS接続テストに成功しました");
    }
    
  } catch (error) {
    statusDiv.style.backgroundColor = "#ef4444";
    statusDiv.style.color = "#ffffff";
    statusDiv.innerHTML = `
      ❌ 接続失敗<br>
      🔍 ${error.message}<br>
      💡 GAS URLとデプロイ設定を確認してください
    `;
    
    if (typeof toast === 'function') {
      toast("GAS接続テストに失敗しました");
    }
    
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = "🔌 接続テスト";
    
    setTimeout(() => {
      if (statusDiv) statusDiv.style.display = "none";
    }, 7000);
  }
}

async function performManualBackup() {
  const backupBtn = document.getElementById("btnManualBackup");
  if (!backupBtn) return;
  
  const originalText = backupBtn.textContent;
  backupBtn.disabled = true;
  backupBtn.textContent = "バックアップ中...";
  
  try {
    const backupData = {
      version: "2.1",
      timestamp: new Date().toISOString(),
      settings: {},
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("LPM_")) {
        try {
          backupData.settings[key] = JSON.parse(localStorage.getItem(key));
        } catch {
          backupData.settings[key] = localStorage.getItem(key);
        }
      }
    }
    
    const result = await gasConnector.sendBackup(backupData);
    
    GASSettings.lastBackup = new Date().toISOString();
    localStorage.setItem(GAS_SETTINGS_KEY, JSON.stringify(GASSettings));
    
    if (typeof toast === 'function') {
      toast(`バックアップ完了! ファイルID: ${result.data?.fileId?.substring(0, 8)}...`);
    } else {
    }
    
  } catch (error) {
    if (typeof toast === 'function') {
      toast(`バックアップ失敗: ${error.message}`);
    }
    
  } finally {
    backupBtn.disabled = false;
    backupBtn.textContent = originalText;
  }
}

function resetGASSettings() {
  if (!confirm("GAS設定をリセットしますか？\n（保存されたデータは削除されません）")) return;
  
  Object.assign(GASSettings, {
    gasUrl: "",
    gasToken: "",
    autoBackup: false,
    backupInterval: 24,
    lastBackup: null
  });
  
  localStorage.removeItem(GAS_SETTINGS_KEY);
  loadGASSettings();
  
  if (typeof toast === 'function') {
    toast("GAS設定をリセットしました");
  } else {
  }
}

// 7. 既存ボタンの強化（安全版）
function enhanceExistingGASFunctions() {
  try {
    // 学習データボタンの強化
    const btnCloudLearn = document.getElementById("btnCloudLearn");
    if (btnCloudLearn && typeof csvFromLearn === 'function') {
      // 既存のイベントリスナーを残して、新しい機能を追加
      btnCloudLearn.addEventListener("click", async (event) => {
        // 元の処理を停止
        event.preventDefault();
        event.stopPropagation();
        
        const originalText = btnCloudLearn.textContent;
        btnCloudLearn.disabled = true;
        btnCloudLearn.textContent = "送信中...";
        
        try {
          const csvData = csvFromLearn();
          if (!csvData || csvData.trim() === '') {
            throw new Error("学習データが生成されていません");
          }
          
          const result = await gasConnector.sendCSV("learning", csvData, {
            mode: "learning",
            generatedRows: csvData.split('\n').length - 1
          });
          
          if (typeof toast === 'function') {
            toast(`学習データを送信完了! ${result.data?.csvFileId ? 'ID: ' + result.data.csvFileId.substring(0, 8) + '...' : ''}`);
          } else {
          }
          
        } catch (error) {
          if (typeof toast === 'function') {
            toast(`送信失敗: ${error.message}`);
          }
          
        } finally {
          btnCloudLearn.disabled = false;
          btnCloudLearn.textContent = originalText;
        }
      });
    }
    
    // 量産データボタンの強化
    const btnCloudProd = document.getElementById("btnCloudProd");
    if (btnCloudProd && typeof csvFromProd === 'function') {
      btnCloudProd.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const originalText = btnCloudProd.textContent;
        btnCloudProd.disabled = true;
        btnCloudProd.textContent = "送信中...";
        
        try {
          const csvData = csvFromProd();
          if (!csvData || csvData.trim() === '') {
            throw new Error("量産データが生成されていません");
          }
          
          const result = await gasConnector.sendCSV("production", csvData, {
            mode: "production",
            generatedRows: csvData.split('\n').length - 1
          });
          
          if (typeof toast === 'function') {
            toast(`量産データを送信完了! ${result.data?.csvFileId ? 'ID: ' + result.data.csvFileId.substring(0, 8) + '...' : ''}`);
          } else {
          }
          
        } catch (error) {
          if (typeof toast === 'function') {
            toast(`送信失敗: ${error.message}`);
          }
          
        } finally {
          btnCloudProd.disabled = false;
          btnCloudProd.textContent = originalText;
        }
      });
    }
    
  } catch (error) {
  }
}

// 8. 初期化（安全版）
function initGASIntegration() {
  function initialize() {
    try {
      
      // UI設定
      setupGASUI();
      
      // 少し待ってから既存機能を強化
      setTimeout(() => {
        enhanceExistingGASFunctions();
      }, 2000);
      
      
    } catch (error) {
    }
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(initialize, 1000);
    });
  } else {
    setTimeout(initialize, 1000);
  }
}

// 9. インスタンス作成と公開
const gasConnector = new GASConnector();

// グローバルに公開
window.GASSettings = GASSettings;
window.gasConnector = gasConnector;
window.loadGASSettings = loadGASSettings;
window.saveGASSettings = saveGASSettings;
window.testGASConnection = testGASConnection;
window.performManualBackup = performManualBackup;
window.resetGASSettings = resetGASSettings;

// 10. トースト関数（フォールバック）
if (typeof window.toast === 'undefined') {
  window.toast = function(message, duration = 3000) {
    
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 400px;
      word-wrap: break-word;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, duration);
  };
}

// 11. 自動初期化実行
initGASIntegration();



/* =========================================================
   「⚙️ 設定」ヘッダーを設定パネルの最上位に移動
   ========================================================= */


function moveSettingsHeaderToTop() {
  const settingsPanel = document.getElementById("panelSettings");
  if (!settingsPanel) {
    return;
  }
  
  // 設定パネル内のh2要素（⚙️ 設定）を取得
  const settingsHeader = settingsPanel.querySelector("h2");
  if (!settingsHeader) {
    return;
  }
  
  
  // 現在の位置から一旦削除
  settingsHeader.remove();
  
  // 設定パネルの最初に挿入
  settingsPanel.insertBefore(settingsHeader, settingsPanel.firstChild);
  
  
  // 他の追加された要素も整理
  organizeSettingsOrder();
}

function organizeSettingsOrder() {
  const settingsPanel = document.getElementById("panelSettings");
  if (!settingsPanel) return;
  
  // 理想的な順序を定義
  const desiredOrder = [
    'h2',                        // ⚙️ 設定 ヘッダー
    '.grid',                     // 辞書I/O部分
    '#simple-settings-section',  // Simple版（もしあれば下に）
    '#gas-settings-section',     // GAS設定
    '[class*="backup"]',         // バックアップ関連
    '[class*="history"]',        // 履歴関連
    '[class*="preset"]'          // プリセット管理
  ];

  
  // 各要素を適切な位置に移動
  let currentPosition = settingsPanel.firstChild;
  
  desiredOrder.forEach((selector, index) => {
    let element = null;
    
    if (selector === 'h2') {
      element = settingsPanel.querySelector('h2');
    } else if (selector === '.grid') {
      // 辞書I/O部分のgrid要素を探す
      const grids = settingsPanel.querySelectorAll('.grid');
      for (let grid of grids) {
        if (grid.textContent.includes('辞書') || grid.textContent.includes('SFW') || grid.textContent.includes('NSFW')) {
          element = grid;
          break;
        }
      }
    } else {
      element = settingsPanel.querySelector(selector);
    }
    
    if (element && element !== currentPosition) {
      // 要素を現在位置の次に移動
      if (currentPosition && currentPosition.nextSibling) {
        settingsPanel.insertBefore(element, currentPosition.nextSibling);
      } else {
        settingsPanel.appendChild(element);
      }
      currentPosition = element;
    } else if (element) {
      currentPosition = element;
    }
  });
  
}

// Simple版要素を削除する関数（必要に応じて）
function removeSimpleElements() {
  // Simple版設定管理セクションを削除
  const simpleSettingsSection = document.getElementById("simple-settings-section");
  if (simpleSettingsSection) {
    simpleSettingsSection.remove();
  }
  
  // Simple版プリセットコントロールを削除
  const simplePresetControls = document.querySelectorAll(".simple-preset-controls");
  simplePresetControls.forEach(control => {
    control.remove();
  });
  
  // Simple版関連のグローバル関数を無効化
  const simpleFunctions = [
    'saveSimplePreset',
    'loadSimplePreset', 
    'deleteSimplePreset',
    'updateSimplePresetList',
    'updateSimpleDeleteButton',
    'showSimpleStatus'
  ];
  
  simpleFunctions.forEach(funcName => {
    if (window[funcName]) {
      window[funcName] = function() {
      };
    }
  });
  
}

// 初期化関数
function initSettingsReorder() {
  
  // DOM読み込み完了後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        removeSimpleElements();  // Simple版を削除
        moveSettingsHeaderToTop(); // ヘッダーを最上位に
      }, 3000); // 他の初期化より後に実行
    });
  } else {
    setTimeout(() => {
      removeSimpleElements();
      moveSettingsHeaderToTop();
    }, 3000);
  }
}

// グローバル関数として公開
window.moveSettingsHeaderToTop = moveSettingsHeaderToTop;
window.removeSimpleElements = removeSimpleElements;
window.organizeSettingsOrder = organizeSettingsOrder;

// 自動初期化実行
initSettingsReorder();

