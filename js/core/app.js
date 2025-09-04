/* =========================
   AI Prompt Maker – app.js (修正版)
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
    csvRow:(i,seed,p,n)=>[`"${i}"`,`"${seed}"`,`"${p.replace(/"/g,'""')}"`,`"${n.replace(/"/g,'""')}"`].join(",") }
};

const getFmt = (selId, fallback="a1111") => FORMATTERS[$(selId)?.value || fallback] || FORMATTERS[fallback];

/* ===== 設定 ===== */
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
          console.error("撮影モード生成エラー:", error);
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
    // 撮影モード用のラジオボタンリスト初期化
    radioList($("#pl_bg"), SFW.background, "pl_bg", {checkFirst: false});
    radioList($("#pl_pose"), SFW.pose, "pl_pose", {checkFirst: false});
    radioList($("#pl_comp"), SFW.composition, "pl_comp", {checkFirst: false});
    radioList($("#pl_view"), SFW.view, "pl_view", {checkFirst: false});
    radioList($("#pl_expr"), SFW.expressions, "pl_expr", {checkFirst: false});
    radioList($("#pl_light"), SFW.lighting, "pl_light", {checkFirst: false});
    
    // アクセサリーセレクト更新
    const plAccSel = document.getElementById("pl_accSel");
    if (plAccSel && SFW.accessories) {
      const options = '<option value="">（未選択）</option>' + 
        SFW.accessories.map(acc => `<option value="${acc.tag}">${acc.label || acc.tag}</option>`).join('');
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
        
        // UI更新
        setTimeout(() => {
          if (window.applyOutfitMode) window.applyOutfitMode();
          paintSkin();
        }, 200);
        
        toast("キャラ設定を読み込みました");
      } catch (error) {
        console.error("キャラ設定読み込みエラー:", error);
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
        console.error("テスト生成エラー:", error);
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
  ['pl_bg', 'pl_comp', 'pl_view'].forEach(id => {
    const v = getOne(id);
    if (v) pushUnique(p, v);
  });

  // アクセ：NSFW優先。なければ固定アクセ＋色（SFW）
  (function handleAccessory() {
    let picked = null;
    if (isNSFW) {
      const ns = getMany('pl_nsfw_acc');
      if (ns && ns.length > 0) picked = ns[0];
    }
    if (!picked) {
      const accSel = document.getElementById("pl_accSel");
      const accTag = window.getPlannerAccColor ? window.getPlannerAccColor() : (document.getElementById('tag_plAcc')?.textContent || '').trim();
      if (accSel && accSel.value) {
        picked = accTag ? `${accTag} ${accSel.value}` : accSel.value;
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
  return { seed, pos: p, neg, prompt, text: `${prompt}${neg ? ` --neg ${neg}` : ""} seed:${seed}` };
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

  // 固定アクセサリー
  const accSel = document.getElementById("learn_acc");
  const accColor = window.getLearnAccColor ? window.getLearnAccColor() : "";
  if (accSel && accSel.value && accColor) {
    p.push(`${accColor} ${accSel.value}`);
  } else if (accSel && accSel.value) {
    p.push(accSel.value);
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
    const accSel = document.getElementById("learn_acc");
    const accColor = window.getLearnAccColor ? window.getLearnAccColor() : "";
    if (accSel && accSel.value) {
      if (accColor && accColor !== "—") {
        p.push(`${accColor} ${accSel.value}`);
      } else {
        p.push(accSel.value);
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

// buildBatchProduction関数を修正
function buildBatchProduction(n){
  const want = Math.max(1, Number(n) || 1);
  const rows = [];
  
  // ★ 共通のネガティブプロンプトを1回だけ生成（そのままでOK）
  const commonNeg = buildNegative((document.getElementById("p_neg")?.value || "").trim(), true);

  // ★ ベースseedを一度だけ作る
  const name = (document.getElementById('charName')?.value || "");
  const baseSeed = seedFromName(name, 0);
  const seedMode = getSeedMode(); // 'fixed' or 'vary'

 for(let i=0; i<want; i++){
  let p = [];
  
  // ★★★ 修正：LoRAタグを最優先で先頭に追加 ★★★
  const loraTag = (document.getElementById('loraTag')?.value || '').trim();
  if (loraTag) p.push(loraTag);
  
  const isNSFW = document.getElementById("nsfwProd")?.checked;
  if (isNSFW) p.push("NSFW");

  // 量産モードではsoloは入れない  
  // p.push("solo");
  //    const g = getGenderCountTag() || "";
  //  if (g) p.push(g);

    const basics = [
      document.getElementById('tagH')?.textContent,
      document.getElementById('tagE')?.textContent,
      document.getElementById('tagSkin')?.textContent,
      getOne("bf_age"), getOne("bf_gender"), getOne("bf_body"), getOne("bf_height"),
      // ★★★ 以下3行を追加 ★★★
     getOne("hairLength"),
     getOne("bangsStyle"),
     getOne("skinFeatures"), 
      getOne("hairStyle"), getOne("eyeShape")
    ].filter(Boolean);
    p.push(...basics);

    // 量産モードでの服の処理（NSFW優先、未選択対応）
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

    // アクセサリー（A/B/C） —— 元のまま
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

    // ★★★ 修正：固定タグをLoRAタグの次に配置 ★★★
  const fixedProd = (document.getElementById('fixedProd')?.value || "").trim();
  if (fixedProd) {
    const fixedTags = fixedProd.split(/\s*,\s*/).filter(Boolean);
    // LoRAタグがある場合はその後に、ない場合は先頭近くに挿入
    const insertIndex = loraTag ? 1 : 0;
    p.splice(insertIndex, 0, ...fixedTags);
  }

    // ★ seed の決定（ここが肝）
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
// renderTextTriplet関数を拡張してキャプション出力にも対応
function renderTextTriplet(baseId, rows, fmtSelId){
  const fmt = getFmt(`#${fmtSelId}`);

  if (rows.length > 1) {
    // 既存の処理
    const allPrompts = rows.map(r => Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "")).join("\n\n");
    const allTexts   = rows.map((r,i) => {
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

    // ★★★ 新規追加：キャプション処理 ★★★
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
    const prompt = Array.isArray(r.pos) ? r.pos.join(", ") : (r.prompt || "");
    const neg = r.neg || "";
    const caption = r.caption || "";

    const allText = fmt.line(prompt, neg, r.seed || 0);

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


/* ===== クラウド送信 ===== */
async function postCSVtoGAS(kind, csv, meta = {}) {
  const url = (Settings.gasUrl || '').trim();
  if (!url) { toast("クラウド保存URLを設定してください"); throw new Error("missing GAS url"); }

  const nameChar = ($("#charName")?.value || "").replace(/[^\w\-]/g, "_") || "noname";
  const body = {
    kind, filename: `${kind}_${nameChar}_${nowStamp()}.csv`, csv,
    meta: { charName: $("#charName")?.value || "", ...meta }, ts: Date.now()
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: JSON.stringify(body)
  });

  const txt = await r.text().catch(()=>"(no text)");
  if (!r.ok) throw new Error("bad status: " + r.status + " " + txt);
  toast("クラウド（GAS）へ保存しました");
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
    await postCSVtoGAS("learning", csv);
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
    await postCSVtoGAS("production", csv);
  });
}

function bindGASTools(){
  document.getElementById("btnSaveSettings")?.addEventListener("click", saveSettings);
  document.getElementById("btnResetSettings")?.addEventListener("click", resetSettings);

  $("#btnTestGAS")?.addEventListener("click", async ()=>{
    saveSettings();
    const url = (Settings.gasUrl || '').trim();
    const out = $("#gasTestResult");
    if (!url) { if(out) out.textContent = "URL未設定"; return; }

    if(out) out.textContent = "テスト中…";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: JSON.stringify({ kind: "ping", ts: Date.now() })
      });
      const txt = await r.text().catch(()=>"(no text)");
      if(out) out.textContent = r.ok ? (txt ? `OK: ${txt}` : "OK") : `NG (${r.status})`;
    } catch (e) {
      if(out) out.textContent = "送信完了（応答確認不可）";
    }
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

  loadSettings();
  bindDictIO();
  bindNSFWToggles();
  bindLearnBatch();
  bindProduction();
  bindGASTools();
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

/* ===== アクセサリー ===== */
function fillAccessorySlots(){
  const accs = normList(SFW.accessories || []);
  const options = `<option value="">（未選択）</option>` + accs.map(a=>`<option value="${a.tag}">${a.label || a.tag}</option>`).join("");
  ["p_accA","p_accB","p_accC","learn_acc","pl_accSel"].forEach(id=>{
    const sel = document.getElementById(id); if (sel) sel.innerHTML = options;
  });
}



/* ===== 単語モード タグ読み込み修正（簡潔版） ===== */
/* ===== 単語モード タグ読み込み修正（簡潔版） ===== */

// 1. 既存の問題のある関数を無効化
window.createFallbackDictionaries = () => console.log('フォールバック無効化済み');
window.waitForDictionaries = () => console.log('待機関数無効化済み');

// 2. 正確なマッピングテーブル（辞書キー → HTMLコンテナID）
const MAPPING_TABLE = {
  // === SFW辞書マッピング ===
  SFW: {
    'age': 'age',
    'gender': 'gender',
    'body_type': 'body-type',
    'height': 'height',
    'worldview': 'worldview',
    
    // 髪関連
    'hair_style': 'hair-style',
    'hair_length': 'hair-length',
    'bangs_style': 'bangs-style',
    
    // 顔・肌
    'eyes': 'eyes',
    'face': 'face',
    'skin_features': 'skin-features',
    
    // 服装・アクセサリー
    'outfit': 'outfit-sfw',
    'accessories': 'accessories',
    
    // ポーズ・構図
    'pose': 'pose',
    'composition': 'composition',
    'view': 'view',
    
    // 表情・感情
    'expressions': 'expression-sfw',
    'emotion_primary': 'emotion-primary',
    'emotion_detail': 'emotion-detail',
    'mouth_state': 'mouth-state',
    'eye_state': 'eye-state',
    'gaze': 'gaze',
    
    // 環境・背景
    'background': 'background',
    'lighting': 'lighting-sfw',
    'art_style': 'art-style',
    
    // アクション
    'pose_manga': 'pose-manga',
    'hand_gesture': 'hand-gesture',
    'movement_action': 'movement-action',
    'props_light': 'props-light',
    'effect_manga': 'effect-manga',
    
    // その他
    'colors': 'color'
  },
  
  // === NSFW辞書マッピング ===
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
    'participants': 'participants'
  }
};

// 3. アイテム作成関数
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
  
  return `
    <button type="button" class="wm-item" 
            data-en="${tag}" 
            data-jp="${label}" 
            data-cat="${category}"
            title="${tag}${levelText}">
      <span class="wm-jp">${label}${levelText}</span>
      ${showMini ? `<span class="wm-en">${tag}</span>` : ''}
      <span class="wm-actions">
        <button class="wm-copy-en" type="button">EN</button>
        <button class="wm-copy-both" type="button">BOTH</button>
      </span>
    </button>
  `;
}

// 4. メイン初期化関数
window.initWordModeFixed = function() {
  console.log('=== 単語モード修正版 初期化開始 ===');
  
  // 辞書データの取得
  let sfwDict = null;
  let nsfwDict = null;
  
  // 複数のソースから辞書データを取得
  if (window.DEFAULT_SFW_DICT) {
    sfwDict = window.DEFAULT_SFW_DICT.SFW || window.DEFAULT_SFW_DICT;
    console.log('✅ DEFAULT_SFW_DICT から取得');
  } else if (window.SFW) {
    sfwDict = window.SFW;
    console.log('✅ window.SFW から取得');
  }
  
  if (window.DEFAULT_NSFW_DICT) {
    nsfwDict = window.DEFAULT_NSFW_DICT.NSFW || window.DEFAULT_NSFW_DICT;
    console.log('✅ DEFAULT_NSFW_DICT から取得');
  } else if (window.NSFW) {
    nsfwDict = window.NSFW;
    console.log('✅ window.NSFW から取得');
  }
  
  if (!sfwDict || !nsfwDict) {
    console.error('❌ 辞書データが見つかりません');
    console.log('SFW:', !!sfwDict, 'NSFW:', !!nsfwDict);
    return;
  }
  
  // 既存コンテナをクリア
  const containers = document.querySelectorAll('#panelWordMode .wm-items');
  console.log(`🧹 ${containers.length}個のコンテナをクリア`);
  containers.forEach(container => container.innerHTML = '');
  
  let totalItems = 0;
  
  // SFW辞書の処理
  console.log('--- SFW辞書処理開始 ---');
  Object.entries(sfwDict).forEach(([dictKey, items]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    
    const htmlId = MAPPING_TABLE.SFW[dictKey];
    if (!htmlId) {
      console.warn(`⚠️ SFWマッピング未定義: ${dictKey}`);
      return;
    }
    
    const container = document.getElementById(`wm-items-${htmlId}`);
    if (!container) {
      console.warn(`❌ コンテナ未発見: wm-items-${htmlId}`);
      return;
    }
    
    // 有効なアイテムのみフィルタ
    const validItems = items.filter(item => {
      if (!item) return false;
      if (typeof item === 'string') return item.trim() !== '';
      const tag = (item.tag || '').toString().trim();
      const label = (item.label || item.ja || item.tag || '').toString().trim();
      return tag !== '' || label !== '';
    });
    
    // HTMLを生成
    const html = validItems.map(item => createWordItem(item, dictKey)).join('');
    container.innerHTML = html;
    
    const count = validItems.length;
    totalItems += count;
    
    console.log(`✅ SFW: ${count}件 (${dictKey} → ${htmlId})`);
    
    // カウンター更新
    const counter = document.getElementById(`wm-count-${htmlId}`);
    if (counter) counter.textContent = count;
  });
  
  // NSFW辞書の処理
  console.log('--- NSFW辞書処理開始 ---');
  Object.entries(nsfwDict).forEach(([dictKey, items]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    
    const htmlId = MAPPING_TABLE.NSFW[dictKey];
    if (!htmlId) {
      console.warn(`⚠️ NSFWマッピング未定義: ${dictKey}`);
      return;
    }
    
    const container = document.getElementById(`wm-items-${htmlId}`);
    if (!container) {
      console.warn(`❌ コンテナ未発見: wm-items-${htmlId}`);
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
    
    console.log(`✅ NSFW: ${count}件 (${dictKey} → ${htmlId})`);
    
    const counter = document.getElementById(`wm-count-${htmlId}`);
    if (counter) counter.textContent = count;
  });
  
  console.log(`🎉 初期化完了: 総計 ${totalItems} 件のタグを読み込み`);
  
  // 統計の更新
  const totalCountEl = document.getElementById('wm-total-count');
  if (totalCountEl) totalCountEl.textContent = totalItems;
  
  if (window.updateSearchStats) {
    window.updateSearchStats(totalItems, totalItems);
  }
  
  return totalItems;
};

// 5. 元の関数を置き換え
window.initWordModeItems = window.initWordModeFixed;

// 6. デバッグ用関数
window.debugWordMode = function() {
  console.log('=== 単語モード デバッグ情報 ===');
  
  // 辞書の状態確認
  console.log('辞書データ状況:');
  console.log('- window.SFW:', window.SFW ? Object.keys(window.SFW).length + ' keys' : 'undefined');
  console.log('- window.NSFW:', window.NSFW ? Object.keys(window.NSFW).length + ' keys' : 'undefined');
  console.log('- window.DEFAULT_SFW_DICT:', !!window.DEFAULT_SFW_DICT);
  console.log('- window.DEFAULT_NSFW_DICT:', !!window.DEFAULT_NSFW_DICT);
  
  // HTMLコンテナの確認
  const containers = document.querySelectorAll('[id^="wm-items-"]');
  console.log(`HTMLコンテナ: ${containers.length}個`);
  
  let totalInContainers = 0;
  containers.forEach(container => {
    const count = container.querySelectorAll('.wm-item').length;
    totalInContainers += count;
    if (count === 0) {
      console.log(`❌ 空のコンテナ: ${container.id}`);
    }
  });
  
  console.log(`コンテナ内のアイテム総数: ${totalInContainers}`);
  
  // 不一致の検出
  const existingIds = Array.from(containers).map(el => el.id.replace('wm-items-', ''));
  const expectedSfwIds = Object.values(MAPPING_TABLE.SFW);
  const expectedNsfwIds = Object.values(MAPPING_TABLE.NSFW);
  
  console.log('HTMLにあるが期待されていないID:');
  existingIds.forEach(id => {
    if (!expectedSfwIds.includes(id) && !expectedNsfwIds.includes(id)) {
      console.log(`  - ${id}`);
    }
  });
};

// 7. 自動修復機能
window.autoFixWordMode = function() {
  console.log('🔧 自動修復開始');
  
  // 辞書データが不完全な場合の復旧
  if (!window.SFW && window.DEFAULT_SFW_DICT) {
    window.SFW = window.DEFAULT_SFW_DICT.SFW || window.DEFAULT_SFW_DICT;
    console.log('✅ SFW辞書復旧');
  }
  
  if (!window.NSFW && window.DEFAULT_NSFW_DICT) {
    window.NSFW = window.DEFAULT_NSFW_DICT.NSFW || window.DEFAULT_NSFW_DICT;
    console.log('✅ NSFW辞書復旧');
  }
  
  // 初期化実行
  const result = window.initWordModeFixed();
  
  if (result > 0) {
    console.log(`✅ 修復成功: ${result}件のタグを読み込み`);
  } else {
    console.log('❌ 修復失敗: 辞書データを確認してください');
    window.debugWordMode();
  }
  
  return result;
};

// 8. 元のinitWordMode関数を定義（app.jsのエラー修正）
window.initWordMode = function() {
  console.log('=== initWordMode呼び出し（修正版） ===');
  
  // 検索機能の初期化
  bindSearchEvents();
  
  // カテゴリ折りたたみの初期化
  initCollapsibleCategories();
  
  // イベントバインドの初期化
  bindWordModeEvents();
  
  // アイテムの初期化（修正版を使用）
  window.autoFixWordMode();
};

// 9. イベントバインド関数群の定義
function bindSearchEvents() {
  const searchInput = document.getElementById('wm-search-input');
  const clearBtn = document.getElementById('wm-search-clear');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      if (window.performWordModeSearch) {
        window.performWordModeSearch(e.target.value);
      }
    });
    
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (window.performWordModeSearch) {
          window.performWordModeSearch(e.target.value);
        }
      }
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (window.clearWordModeSearch) {
        window.clearWordModeSearch();
      }
    });
  }
}

function initCollapsibleCategories() {
  const wordModePanel = document.getElementById('panelWordMode');
  if (!wordModePanel) return;
  
  const tableContainer = document.getElementById('wm-table-container') || 
                        document.querySelector('.wm-table-wrapper');
  
  if (!tableContainer) return;
  
  let toggleButton = document.getElementById('wm-categories-toggle');
  if (!toggleButton) {
    toggleButton = document.createElement('button');
    toggleButton.id = 'wm-categories-toggle';
    toggleButton.type = 'button';
    toggleButton.textContent = '▼ カテゴリ一覧を表示';
    toggleButton.style.cssText = `
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      background: var(--bg-secondary, #363c4a);
      color: var(--text-primary, #ffffff);
      border: 1px solid #555;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    `;
    
    tableContainer.parentNode.insertBefore(toggleButton, tableContainer.nextSibling);
  }
}

function bindWordModeEvents() {
  const root = document.getElementById('panelWordMode');
  if (!root) return;
  
  // 既存のイベントリスナーを削除
  const newRoot = root.cloneNode(true);
  root.parentNode.replaceChild(newRoot, root);
  
  newRoot.addEventListener('click', (e) => {
    if (e.target.closest('summary')) return;
    
    if (e.target.classList.contains('wm-copy-en')) {
      e.preventDefault();
      const item = e.target.closest('.wm-item');
      const en = item?.dataset.en || '';
      if (en && navigator.clipboard) {
        navigator.clipboard.writeText(en);
        if (window.toast) window.toast('英語タグをコピーしました');
      }
      return;
    }
    
    if (e.target.classList.contains('wm-copy-both')) {
      e.preventDefault();
      const item = e.target.closest('.wm-item');
      const jp = item?.dataset.jp || '';
      const en = item?.dataset.en || '';
      const text = jp && en ? `${jp}(${en})` : (en || jp);
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        if (window.toast) window.toast('日英タグをコピーしました');
      }
      return;
    }
    
    const itemBtn = e.target.closest('.wm-item');
    if (itemBtn) {
      const en = itemBtn.dataset.en || '';
      const jp = itemBtn.dataset.jp || '';
      if (en && jp && window.addToOutputTable) {
        window.addToOutputTable(en, jp);
      }
    }
  });
}

// 10. 検索機能の実装
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
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid #444;
      border-radius: 6px;
      margin: 8px 0;
      padding: 8px;
      background: var(--bg-card, #2a2f3a);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    searchInput.parentNode.insertBefore(searchResultsArea, searchInput.nextSibling);
  }
  
  const allItems = document.querySelectorAll('#panelWordMode .wm-item');
  
  if (!searchTerm) {
    searchResultsArea.style.display = 'none';
    searchResultsArea.innerHTML = '';
    if (window.updateSearchStats) {
      window.updateSearchStats(allItems.length, allItems.length);
    }
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
    searchResultsArea.innerHTML = '<div style="text-align: center; color: #888; padding: 16px;">検索結果がありません</div>';
    searchResultsArea.style.display = 'block';
    if (window.updateSearchStats) {
      window.updateSearchStats(0, allItems.length);
    }
    return;
  }
  
  const resultsHTML = matchedItems.map(item => {
    const showEn = item.en !== item.jp;
    return `
      <button type="button" class="wm-search-result-item" 
              data-en="${item.en}" 
              data-jp="${item.jp}">
        <span style="font-weight: 500;">${item.jp}</span>
        ${showEn ? `<span style="color: #aaa; font-size: 12px; margin-left: 8px;">${item.en}</span>` : ''}
      </button>
    `;
  }).join('');
  
  searchResultsArea.innerHTML = resultsHTML;
  searchResultsArea.style.display = 'block';
  
  searchResultsArea.querySelectorAll('.wm-search-result-item').forEach(resultItem => {
    resultItem.addEventListener('click', () => {
      const en = resultItem.dataset.en;
      const jp = resultItem.dataset.jp;
      
      if (en && jp && window.addToOutputTable) {
        window.addToOutputTable(en, jp);
      }
      
      const searchInput = document.getElementById('wm-search-input');
      if (searchInput) searchInput.value = '';
      window.clearWordModeSearch();
    });
  });
  
  if (window.updateSearchStats) {
    window.updateSearchStats(matchedItems.length, allItems.length);
  }
};

window.clearWordModeSearch = function() {
  const searchInput = document.getElementById('wm-search-input');
  const resultsArea = document.getElementById('wm-search-results');
  
  if (searchInput) searchInput.value = '';
  if (resultsArea) {
    resultsArea.style.display = 'none';
    resultsArea.innerHTML = '';
  }
  
  const allItems = document.querySelectorAll('#panelWordMode .wm-item');
  if (window.updateSearchStats) {
    window.updateSearchStats(allItems.length, allItems.length);
  }
};

// 11. 即座に実行
console.log('initWordMode関数定義完了');

// 辞書が既に利用可能な場合は即座に実行
if ((window.SFW || window.DEFAULT_SFW_DICT) && (window.NSFW || window.DEFAULT_NSFW_DICT)) {
  setTimeout(() => {
    console.log('修正版で即座に初期化');
    window.autoFixWordMode();
  }, 100);
} else {
  // 辞書の読み込みを待機
  let attempts = 0;
  const maxAttempts = 20;
  
  const waitForDicts = () => {
    attempts++;
    console.log(`辞書待機中... (${attempts}/${maxAttempts})`);
    
    if ((window.SFW || window.DEFAULT_SFW_DICT) && (window.NSFW || window.DEFAULT_NSFW_DICT)) {
      console.log('辞書確認完了、初期化開始');
      window.autoFixWordMode();
      return;
    }
    
    if (attempts < maxAttempts) {
      setTimeout(waitForDicts, 500);
    } else {
      console.error('辞書読み込みタイムアウト');
      window.debugWordMode();
    }
  };
  
  setTimeout(waitForDicts, 1000);
}
