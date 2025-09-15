/**
 * 漫画モード用プロンプト生成システム（2人キャラ対応版）
 * ファイル名: manga-prompt-generator.js
 * 
 * 主な機能:
 * - 1人/2人キャラの自動判定と適切なプロンプト生成
 * - 個人特徴と共通要素の適切な分離
 * - NSFW/SFWの切り替え対応
 * - 服装除外機能との連携
 */

// 🔥 修正版: generateMangaPrompt関数（2人キャラ完全対応）
function generateMangaPrompt() {
  const tags = [];
  
  // ===== 🎭 商用LoRAタグを最優先で先頭に追加 =====
  const commercialLoRAToggle = document.getElementById('mangaCommercialLoRAEnable');
  if (commercialLoRAToggle && commercialLoRAToggle.checked && window.commercialLoRAManager) {
    const loraBaseTags = window.commercialLoRAManager.getSelectedLoRATags();
    if (loraBaseTags.length > 0) {
      tags.push(...loraBaseTags);
    }
  }
  
  // 固定タグ（商用LoRA後の2番目）
  const fixed = document.getElementById('fixedManga')?.value?.trim();
  if (fixed) {
    const fixedTags = fixed.split(/\s*,\s*/).filter(Boolean);
    tags.push(...fixedTags);
  }
  
  // 従来のLoRAタグ（商用LoRAの後）
  if (document.getElementById('mangaUseLoRA')?.checked) {
    const loraTag = document.getElementById('mangaLoRATag')?.value?.trim();
    if (loraTag) {
      const weight = document.getElementById('mangaLoRAWeight')?.value || '0.8';
      tags.push(loraTag.replace(':0.8>', `:${weight}>`));
    }
  }
  
  // NSFW
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    tags.push('NSFW');
  }
  
  // ===== 🚀 2人キャラ判定 =====
  const secondCharEnabled = document.getElementById('mangaSecondCharEnable')?.checked;
  
  if (secondCharEnabled) {
    // === 2人キャラモード ===
    generate2CharacterTags(tags);
  } else {
    // === 1人キャラモード（従来） ===
    generate1CharacterTags(tags);
  }
  
  const finalPrompt = tags.filter(Boolean).join(', ');
  return finalPrompt;
}

// 🆕 2人キャラ用タグ生成
function generate2CharacterTags(tags) {
  // インタラクションを最優先
  const interactionMode = document.querySelector('input[name="interactionMode"]:checked')?.value || 'sfw';
  if (interactionMode === 'sfw') {
    addSelectedValuesSafe(tags, 'secondCharInteractionSFW');
  } else {
    addSelectedValuesSafe(tags, 'secondCharInteractionNSFW');
  }
  
  // 人数・性別タグ
  const genderTag = determine2CharGender();
  if (genderTag) tags.push(genderTag);
  
  // 1人目の特徴収集
  const firstFeatures = collect1stCharFeatures();
  const secondFeatures = collect2ndCharFeatures();
  
  // ラベル決定
  const labels = getCharacterLabels(genderTag);
  
  // 括弧付きで追加
  if (firstFeatures.length > 0) {
    tags.push(`(${labels.first}: ${firstFeatures.join(', ')})`);
  }
  if (secondFeatures.length > 0) {
    tags.push(`(${labels.second}: ${secondFeatures.join(', ')})`);
  }
  
  // 共通要素
  addCommonTags(tags);
}

// manga-prompt-generator.js の generate1CharacterTags 関数を修正

function generate1CharacterTags(tags) {
  // 性別・人数タグ
  if (typeof getGenderCountTag === 'function') {
    const genderTag = getGenderCountTag();
    if (genderTag) tags.push(genderTag);
  }
  
  // === 🔧 基本情報の処理を修正 ===
  const useCharBase = document.querySelector('input[name="mangaCharBase"]:checked')?.value === 'B';
  if (useCharBase) {
    // 基本情報（体型・髪型・色）を追加
    addBasicCharacterInfo(tags);
    
    // 服装の処理を分離（NSFW除外チェック付き）
    const shouldExcludeOutfit = checkNSFWOutfitExclusion();
    if (!shouldExcludeOutfit) {
      add1stCharacterOutfitToTags(tags); // 🆕 新関数で服装を追加
    }
  }
  
  // 個人要素（表情・ポーズ）
  addPersonalTags(tags);
  
  // 共通要素
  addCommonTags(tags);
}

// 🆕 1人目の服装を直接タグに追加
function add1stCharacterOutfitToTags(tags) {
  console.log('👔 1人モード: 服装追加開始');
  
  if (typeof getIsOnepiece !== 'function' || typeof getOne !== 'function') {
    console.warn('⚠️ 基本情報関数が利用できません');
    return;
  }
  
  const getColor = id => (document.getElementById(id)?.textContent || "").trim().replace(/^—$/, "");
  const isOnepiece = getIsOnepiece();
  
  console.log('👗 ワンピース判定:', isOnepiece);
  
  if (isOnepiece) {
    const dress = getOne('outfit_dress');
    if (dress) {
      const color = getColor('tag_top');
      const outfitTag = color ? `${color} ${dress}` : dress;
      tags.push(outfitTag);
      console.log('✅ ドレス追加:', outfitTag);
    }
  } else {
    // 分離服装
    const outfits = [
      { name: 'トップス', item: getOne('outfit_top'), colorId: 'tag_top' },
      { 
        name: 'ボトムス', 
        item: getOne('bottomCat') === 'pants' ? getOne('outfit_pants') : getOne('outfit_skirt'), 
        colorId: 'tag_bottom' 
      },
      { name: '靴', item: getOne('outfit_shoes'), colorId: 'tag_shoes' }
    ];
    
    outfits.forEach(({name, item, colorId}) => {
      if (item) {
        const color = getColor(colorId);
        const outfitTag = color ? `${color} ${item}` : item;
        tags.push(outfitTag);
        console.log(`✅ ${name}追加:`, outfitTag);
      } else {
        console.log(`⚠️ ${name}未選択`);
      }
    });
  }
  
  console.log('👔 1人モード: 服装追加完了');
}




// 🆕 基本キャラ情報のみ追加（服装除く）
function addBasicCharacterInfo(tags) {
  // 体型・年齢・性別
  if (typeof getBFValue === 'function') {
    ['age', 'gender', 'body', 'height'].forEach(key => {
      const value = getBFValue(key);
      if (value) tags.push(value);
    });
  }
  
  // 髪型・目の形・肌特徴
  if (typeof getOne === 'function') {
    ['hairStyle', 'eyeShape', 'hairLength', 'bangsStyle', 'skinFeatures'].forEach(key => {
      const value = getOne(key);
      if (value) tags.push(value);
    });
  }

  
  
  // 色（髪・目・肌）
  const getColor = id => (document.getElementById(id)?.textContent || "").trim();
  ['tagH', 'tagE', 'tagSkin'].forEach(id => {
    const value = getColor(id);
    if (value) tags.push(value);
  });
  
  // アクセサリー
  const acc = document.getElementById("characterAccessory");
  const accColor = window.getCharAccColor ? window.getCharAccColor() : "";
  if (acc?.value) {
    tags.push((accColor && accColor !== "—") ? `${accColor} ${acc.value}` : acc.value);
  }
}

// ========================================
// 性別・ラベル判定システム
// ========================================

// 性別判定
function determine2CharGender() {
  const first = (typeof getBFValue === 'function' ? getBFValue('gender') : '')?.toLowerCase() || '';
  const second = (getSelectedValue('secondCharGender') || '')?.toLowerCase();
  
  const isGirl = (gender) => /\b(female|girl|woman|feminine|女子|女性)\b/.test(gender);
  const isBoy = (gender) => /\b(male|boy|man|masculine|男子|男性)\b/.test(gender);
  
  const firstGirl = isGirl(first), firstBoy = isBoy(first);
  const secondGirl = isGirl(second), secondBoy = isBoy(second);
  
  if (firstGirl && secondGirl) return '2girls';
  if (firstBoy && secondBoy) return '2boys';
  if ((firstGirl && secondBoy) || (firstBoy && secondGirl)) return '1girl, 1boy';
  if (firstGirl || secondGirl) return '1girl, 1other';
  if (firstBoy || secondBoy) return '1boy, 1other';
  return '2others';
}

// ラベル決定
function getCharacterLabels(genderTag) {
  if (genderTag === '2girls') return { first: 'girl1', second: 'girl2' };
  if (genderTag === '2boys') return { first: 'boy1', second: 'boy2' };
  if (genderTag?.includes('1girl') && genderTag?.includes('1boy')) {
    const firstGender = (typeof getBFValue === 'function' ? getBFValue('gender') : '')?.toLowerCase() || '';
    const firstIsGirl = /\b(female|girl|woman|feminine|女子|女性)\b/.test(firstGender);
    return firstIsGirl ? { first: 'girl', second: 'boy' } : { first: 'boy', second: 'girl' };
  }
  return { first: 'char1', second: 'char2' };
}

// ========================================
// キャラクター特徴収集システム
// ========================================

// 1人目特徴収集
function collect1stCharFeatures() {
  const features = [];
  
  // 基本情報
  if (typeof getBFValue === 'function') {
    ['age', 'gender', 'body', 'height'].forEach(key => {
      const value = getBFValue(key);
      if (value) features.push(value);
    });
  }
  
  if (typeof getOne === 'function') {
    ['hairStyle', 'eyeShape', 'hairLength', 'bangsStyle', 'skinFeatures'].forEach(key => {
      const value = getOne(key);
      if (value) features.push(value);
    });
  }
  
  // 色
  const getColor = id => (document.getElementById(id)?.textContent || "").trim();
  ['tagH', 'tagE', 'tagSkin'].forEach(id => {
    const value = getColor(id);
    if (value) features.push(value);
  });
  
  // 服装
  if (!checkNSFWOutfitExclusion()) {
    add1stOutfit(features);
  }
  
  // 表情・ポーズ
  const nsfw = document.getElementById('mangaNSFWEnable')?.checked;
  addToFeatures(features, nsfw ? 'mangaNSFWExpr' : 'mangaExpressions');
  addToFeatures(features, 'mangaEmotionPrimary');
  addToFeatures(features, 'mangaEmotionDetail');
  addToFeatures(features, 'mangaEyeState');
  addToFeatures(features, 'mangaGaze');
  addToFeatures(features, 'mangaMouthState');
  addToFeatures(features, nsfw ? 'mangaNSFWPose' : 'mangaPose');
  addToFeatures(features, 'mangaHandGesture');
  addToFeatures(features, 'mangaMovementAction');
  
  if (nsfw) {
    addToFeatures(features, 'mangaNSFWExpo');
    addToFeatures(features, 'mangaNSFWBody');
    addToFeatures(features, 'mangaNSFWNipples');
    addToFeatures(features, 'mangaNSFWUnderwear');
  }
  
  return features;
}

// 2人目特徴収集
function collect2ndCharFeatures() {
  const features = [];
  
  // 2人目LoRA
  if (document.getElementById('secondCharUseLoRA')?.checked) {
    const lora = document.getElementById('secondCharLoRATag')?.value?.trim();
    if (lora) {
      const weight = document.getElementById('secondCharLoRAWeight')?.value || '0.8';
      features.push(lora.replace(':0.8>', `:${weight}>`));
    }
  }
  
  // 基本特徴
  if (document.querySelector('input[name="secondCharBase"]:checked')?.value === 'B') {
    [
      'secondCharGender', 'secondCharAge', 'secondCharHairstyle',
      'secondCharHairLength', 'secondCharBangsStyle', 'secondCharSkinFeatures',
      'secondCharHairColor', 'secondCharEyeColor', 'secondCharSkinTone'
    ].forEach(name => {
      const value = getSelectedValue(name);
      if (value) features.push(value);
    });
    
    // 2人目服装
    add2ndOutfit(features);
  }
  
  return features;
}

// ========================================
// 服装処理システム
// ========================================

// 1人目服装
function add1stOutfit(features) {
  if (typeof getIsOnepiece !== 'function' || typeof getOne !== 'function') return;
  
  const getColor = id => (document.getElementById(id)?.textContent || "").trim().replace(/^—$/, "");
  const isOnepiece = getIsOnepiece();
  
  if (isOnepiece) {
    const dress = getOne('outfit_dress');
    if (dress) {
      const color = getColor('tag_top');
      features.push(color ? `${color} ${dress}` : dress);
    }
  } else {
    const items = [
      { item: getOne('outfit_top'), color: getColor('tag_top') },
      { item: getOne('bottomCat') === 'pants' ? getOne('outfit_pants') : getOne('outfit_skirt'), 
        color: getColor('tag_bottom') },
      { item: getOne('outfit_shoes'), color: getColor('tag_shoes') }
    ];
    
    items.forEach(({item, color}) => {
      if (item) features.push(color ? `${color} ${item}` : item);
    });
  }
  
  // アクセサリー
  const acc = document.getElementById("characterAccessory");
  const accColor = window.getCharAccColor ? window.getCharAccColor() : "";
  if (acc?.value) {
    features.push((accColor && accColor !== "—") ? `${accColor} ${acc.value}` : acc.value);
  }
}

// 2人目服装
function add2ndOutfit(features) {
  const getColor = (type) => {
    const el = document.getElementById(`tag_second${type.charAt(0).toUpperCase() + type.slice(1)}`);
    return el?.textContent?.trim() || null;
  };
  
  const dress = getSelectedValue('secondCharDress');
  if (dress) {
    const color = getColor('top') || 'white';
    features.push(`${color} ${dress}`);
  } else {
    const items = [
      { item: getSelectedValue('secondCharTop'), color: getColor('top') || 'white' },
      { item: getSelectedValue('secondCharBottom'), color: getColor('bottom') || 'blue' },
      { item: getSelectedValue('secondCharShoes'), color: getColor('shoes') || 'gray' }
    ];
    
    items.forEach(({item, color}) => {
      if (item) features.push(`${color} ${item}`);
    });
  }
}

// ========================================
// タグ追加システム
// ========================================

// 個人要素（1人用）
function addPersonalTags(tags) {
  const nsfw = document.getElementById('mangaNSFWEnable')?.checked;
  
  addSelectedValuesSafe(tags, nsfw ? 'mangaNSFWExpr' : 'mangaExpressions');
  addSelectedValuesSafe(tags, 'mangaEmotionPrimary');
  addSelectedValuesSafe(tags, 'mangaEmotionDetail');
  addSelectedValuesSafe(tags, 'mangaEyeState');
  addSelectedValuesSafe(tags, 'mangaGaze');
  addSelectedValuesSafe(tags, 'mangaMouthState');
  addSelectedValuesSafe(tags, nsfw ? 'mangaNSFWPose' : 'mangaPose');
  addSelectedValuesSafe(tags, 'mangaHandGesture');
  addSelectedValuesSafe(tags, 'mangaMovementAction');
  
  if (nsfw) {
    addSelectedValuesSafe(tags, 'mangaNSFWExpo');
    addSelectedValuesSafe(tags, 'mangaNSFWBody');
    addSelectedValuesSafe(tags, 'mangaNSFWNipples');
    addSelectedValuesSafe(tags, 'mangaNSFWUnderwear');
  }
}

// 共通要素
function addCommonTags(tags) {
  const sfw = document.getElementById('mangaSFWEnable')?.checked !== false;
  const nsfw = document.getElementById('mangaNSFWEnable')?.checked;
  
  if (sfw) {
    ['mangaComposition', 'mangaView', 'mangaCameraView', 'mangaBackground', 
     'mangaLighting', 'mangaArtStyle', 'mangaSeasonWeather', 'mangaEffectManga',
     'mangaEffectMangaFX', 'mangaPropsLight', 'mangaRelationship', 
     'mangaPhysicalState', 'mangaOccupation'].forEach(id => {
      addSelectedValuesSafe(tags, id);
    });
  }
  
  if (nsfw) {
    ['mangaNSFWSitu', 'mangaNSFWLight', 'mangaNSFWBackground', 'mangaNSFWParticipants',
     'mangaNSFWAction', 'mangaNSFWAction2', 'mangaNSFWInteraction', 'mangaNSFWEmotion',
     'mangaNSFWAcc', 'mangaNSFWOutfit'].forEach(id => {
      addSelectedValuesSafe(tags, id);
    });
  }
}

// ========================================
// ヘルパー関数
// ========================================

// 配列に選択値を追加
function addToFeatures(features, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('input:checked').forEach(input => {
    if (input.value?.trim()) features.push(input.value.trim());
  });
}

// 基本情報（服装なし）
function addBasicInfoWithoutOutfit(tags) {
  if (typeof getBFValue === 'function') {
    ['age', 'gender', 'body', 'height'].forEach(key => {
      const value = getBFValue(key);
      if (value) tags.push(value);
    });
  }
  
  if (typeof getOne === 'function') {
    ['hairStyle', 'eyeShape', 'hairLength', 'bangsStyle', 'skinFeatures'].forEach(key => {
      const value = getOne(key);
      if (value) tags.push(value);
    });
  }
  
  const getColor = id => (document.getElementById(id)?.textContent || "").trim();
  ['tagH', 'tagE', 'tagSkin'].forEach(id => {
    const value = getColor(id);
    if (value) tags.push(value);
  });
  
  const acc = document.getElementById("characterAccessory");
  const accColor = window.getCharAccColor ? window.getCharAccColor() : "";
  if (acc?.value) {
    tags.push((accColor && accColor !== "—") ? `${accColor} ${acc.value}` : acc.value);
  }
}

// ========================================
// 初期化・統合
// ========================================

// グローバル関数として公開
if (typeof window !== 'undefined') {
  window.generateMangaPrompt = generateMangaPrompt;
  window.generate2CharacterTags = generate2CharacterTags;
  window.generate1CharacterTags = generate1CharacterTags;
  window.collect1stCharFeatures = collect1stCharFeatures;
  window.collect2ndCharFeatures = collect2ndCharFeatures;
}

console.log('✅ manga-prompt-generator.js 読み込み完了');
