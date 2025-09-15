/**
 * 漫画モード用プロンプト生成システム（SD最適化版 - BREAK形式対応）
 * ファイル名: manga-prompt-generator.js
 * 
 * 主な機能:
 * - 1人/2人キャラの自動判定と適切なプロンプト生成
 * - SD系最適化: シンプルなBREAK形式による2人キャラ対応
 * - 個人特徴と共通要素の適切な分離
 * - NSFW/SFWの切り替え対応
 * - 服装除外機能との連携
 */

// ★★★ メイン関数: SD最適化版generateMangaPrompt ★★★
function generateMangaPrompt() {
  // ===== 🚀 2人キャラ判定 =====
  const secondCharEnabled = document.getElementById('mangaSecondCharEnable')?.checked;
  
  if (secondCharEnabled) {
    // === SD最適化: 2人キャラモード（BREAK形式） ===
    return generate2PersonMangaPromptSD();
  } else {
    // === 1人キャラモード（従来形式維持） ===
    return generate1PersonMangaPrompt();
  }
}

// ★★★ SD最適化: 2人キャラ専用プロンプト生成（BREAK形式） ★★★
function generate2PersonMangaPromptSD() {
  const baseTags = [];
  const interactions = [];
  const personalFeatures1 = []; // 1人目
  const personalFeatures2 = []; // 2人目
  const commonFeatures = [];    // 共通要素
  
  // 1. 最優先: 商用LoRA
  addCommercialLoRAIfEnabled(baseTags);
  
  // 2. 固定プロンプト
  addFixedPromptIfExists(baseTags);
  
  // 3. 従来LoRA（任意入力）
  addPrimaryLoRAIfEnabled(baseTags);
  
  // 4. NSFW判定
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    baseTags.push('NSFW');
  }
  
  // 5. インタラクションの収集
  const interactionMode = document.querySelector('input[name="interactionMode"]:checked')?.value || 'sfw';
  if (interactionMode === 'sfw') {
    addSelectedValuesSafe(interactions, 'secondCharInteractionSFW');
  } else {
    addSelectedValuesSafe(interactions, 'secondCharInteractionNSFW');
  }
  
  // 6. インタラクションをbaseTagsに追加（two peopleと分離）
  if (interactions.length > 0) {
    baseTags.push(...interactions);
  }
  
  // 7. 1人目の個人特徴収集（2人目LoRAは含めない）
  collect1stPersonFeaturesSD(personalFeatures1);
  
  // 8. 2人目の個人特徴収集（2人目LoRAを含む）  
  collect2ndPersonFeaturesSD(personalFeatures2);
  
  // 9. 共通要素の収集
  collectCommonFeaturesSD(commonFeatures);
  
  // 10. ★★★ SD最適化出力: シンプルなBREAK形式 ★★★
  const result = [];
  
  // 基本タグ（商用LoRA + 固定 + 従来LoRA + NSFW + インタラクション）
  if (baseTags.length > 0) {
    result.push(baseTags.join(', '));
  }
  
  // two people（独立）
  result.push('two people');
  
  // 1人目: 性別判定してラベル付け
  if (personalFeatures1.length > 0) {
    const gender1 = determineGenderFromFeatures(personalFeatures1);
    result.push(`${gender1}, ${personalFeatures1.join(', ')}`);
  }
  
  // BREAK区切り
  result.push('BREAK');
  
  // 2人目: 性別判定してラベル付け
  if (personalFeatures2.length > 0) {
    const gender2 = determineGenderFromFeatures(personalFeatures2);
    result.push(`${gender2}, ${personalFeatures2.join(', ')}`);
  }
  
  // 共通要素（背景・環境等）
  if (commonFeatures.length > 0) {
    result.push(commonFeatures.join(', '));
  }
  
  // 改行で連結して返す
  return result.join('\n');
}

// ★★★ 1人モード（従来形式維持） ★★★
function generate1PersonMangaPrompt() {
  const tags = [];
  
  // ===== 🎭 商用LoRAタグを最優先で先頭に追加 =====
  addCommercialLoRAIfEnabled(tags);
  
  // 固定タグ（商用LoRA後の2番目）
  addFixedPromptIfExists(tags);
  
  // 従来のLoRAタグ（商用LoRAの後）
  addPrimaryLoRAIfEnabled(tags);
  
  // NSFW
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    tags.push('NSFW');
  }
  
  // 性別・人数タグ
  if (typeof getGenderCountTag === 'function') {
    const genderTag = getGenderCountTag();
    if (genderTag) tags.push(genderTag);
  }
  
  // === 🔧 基本情報の処理 ===
  const useCharBase = document.querySelector('input[name="mangaCharBase"]:checked')?.value === 'B';
  if (useCharBase) {
    // 基本情報（体型・髪型・色）を追加
    addBasicCharacterInfo(tags);
    
    // 服装の処理を分離（NSFW除外チェック付き）
    const shouldExcludeOutfit = checkNSFWOutfitExclusion();
    if (!shouldExcludeOutfit) {
      add1stCharacterOutfitToTags(tags);
    }
  }
  
  // 個人要素（表情・ポーズ）
  addPersonalTags(tags);
  
  // 共通要素
  addCommonTags(tags);
  
  const finalPrompt = tags.filter(Boolean).join(', ');
  return finalPrompt;
}

// ========================================
// SD最適化: 特徴収集システム
// ========================================

// ★★★ 1人目の特徴収集（完全版） ★★★
function collect1stPersonFeaturesSD(features) {
  // 基本情報（1人目）
  if (typeof getBFValue === 'function') {
    const age = getBFValue('age');
    const gender = getBFValue('gender');
    const body = getBFValue('body');
    const height = getBFValue('height');
    
    if (age) features.push(age);
    if (gender) features.push(gender);
    if (body) features.push(body);
    if (height) features.push(height);
  }
  
  // 髪型・外見
  if (typeof getOne === 'function') {
    const hairStyle = getOne('hairStyle');
    const eyeShape = getOne('eyeShape');
    const hairLength = getOne('hairLength');
    const bangsStyle = getOne('bangsStyle');
    const skinFeatures = getOne('skinFeatures');
    
    if (hairStyle) features.push(hairStyle);
    if (eyeShape) features.push(eyeShape);
    if (hairLength) features.push(hairLength);
    if (bangsStyle) features.push(bangsStyle);
    if (skinFeatures) features.push(skinFeatures);
  }
  
  // 色（髪・目・肌）
  const textOf = id => {
    const element = document.getElementById(id);
    return element ? (element.textContent || "").trim() : "";
  };
  
  const hairColor = textOf('tagH');
  const eyeColor = textOf('tagE');
  const skinColor = textOf('tagSkin');
  if (hairColor) features.push(hairColor);
  if (eyeColor) features.push(eyeColor);
  if (skinColor) features.push(skinColor);
  
  // アクセサリー
  const charAccSel = document.getElementById("characterAccessory");
  const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
  if (charAccSel && charAccSel.value) {
    if (charAccColor && charAccColor !== "—") {
      features.push(`${charAccColor} ${charAccSel.value}`);
    } else {
      features.push(charAccSel.value);
    }
  }
  
  // 服装（NSFW除外チェック付き）
  const shouldExcludeOutfit = checkNSFWOutfitExclusion();
  if (!shouldExcludeOutfit) {
    add1stPersonOutfitFeaturesSD(features);
  }
  
  // 表情・感情（詳細）
  addSelectedValuesSafe(features, 'mangaEmotionPrimary');   // joy, anger等
  addSelectedValuesSafe(features, 'mangaEmotionDetail');    // delighted, furious等
  addSelectedValuesSafe(features, 'mangaExpressions');      // bright_smile等
  addSelectedValuesSafe(features, 'mangaEyeState');         // sparkling_eyes等
  addSelectedValuesSafe(features, 'mangaGaze');             // at_viewer等
  addSelectedValuesSafe(features, 'mangaMouthState');       // grin等
  
  // ポーズ・動作
  addSelectedValuesSafe(features, 'mangaPose');             // standing等
  addSelectedValuesSafe(features, 'mangaHandGesture');      // peace_sign等
  addSelectedValuesSafe(features, 'mangaMovementAction');   // stretching等
  
  // NSFW個人特徴（1人目）
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
  if (nsfwEnabled) {
    addSelectedValuesSafe(features, 'mangaNSFWExpr');
    addSelectedValuesSafe(features, 'mangaNSFWExpo');
    addSelectedValuesSafe(features, 'mangaNSFWPose');
    addSelectedValuesSafe(features, 'mangaNSFWBody');
    addSelectedValuesSafe(features, 'mangaNSFWNipples');
    addSelectedValuesSafe(features, 'mangaNSFWUnderwear');
  }
}

// ★★★ 2人目の特徴収集（完全版） ★★★  
function collect2ndPersonFeaturesSD(features) {
  // 2人目のLoRA（最初に追加）
  if (document.getElementById('secondCharUseLoRA')?.checked) {
    const loraTag = document.getElementById('secondCharLoRATag')?.value?.trim();
    if (loraTag) {
      const weight = document.getElementById('secondCharLoRAWeight')?.value || '0.8';
      features.push(loraTag.replace(':0.8>', `:${weight}>`));
    }
  }
  
  // 2人目のキャラ基礎設定
  const useSecondCharBase = document.querySelector('input[name="secondCharBase"]:checked')?.value === 'B';
  if (useSecondCharBase) {
    // 基本設定
    addSelectedValuesSafe(features, 'secondCharGender');
    addSelectedValuesSafe(features, 'secondCharAge');
    addSelectedValuesSafe(features, 'secondCharHairstyle');
    addSelectedValuesSafe(features, 'secondCharHairLength');
    addSelectedValuesSafe(features, 'secondCharBangsStyle');
    addSelectedValuesSafe(features, 'secondCharSkinFeatures');
    addSelectedValuesSafe(features, 'secondCharHairColor');
    addSelectedValuesSafe(features, 'secondCharEyeColor');
    addSelectedValuesSafe(features, 'secondCharSkinTone');
    
    // 2人目の服装（色付き）
    add2ndPersonOutfitFeaturesSD(features);
  }
}

// ★★★ 共通要素の収集（個人動作除外版） ★★★
function collectCommonFeaturesSD(features) {
  // 環境・背景・演出（個人に依存しない要素のみ）
  addSelectedValuesSafe(features, 'mangaBackground');
  addSelectedValuesSafe(features, 'mangaLighting');
  addSelectedValuesSafe(features, 'mangaArtStyle');
  addSelectedValuesSafe(features, 'mangaComposition');
  addSelectedValuesSafe(features, 'mangaView');
  addSelectedValuesSafe(features, 'mangaCameraView');
  
  // 効果・演出（環境系のみ）
  addSelectedValuesSafe(features, 'mangaEffectManga');
  addSelectedValuesSafe(features, 'mangaPropsLight');
  addSelectedValuesSafe(features, 'mangaEffectMangaFX');
  
  // 関係性・状況（個人動作は除外）
  addSelectedValuesSafe(features, 'mangaRelationship');
  addSelectedValuesSafe(features, 'mangaPhysicalState');
  addSelectedValuesSafe(features, 'mangaOccupation');
  addSelectedValuesSafe(features, 'mangaSeasonWeather');
  
  // NSFW共通要素（環境系のみ）
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
  if (nsfwEnabled) {
    addSelectedValuesSafe(features, 'mangaNSFWSitu');
    addSelectedValuesSafe(features, 'mangaNSFWLight');
    addSelectedValuesSafe(features, 'mangaNSFWAction');        // 共通アクション
    addSelectedValuesSafe(features, 'mangaNSFWAction2');       // 射精・体液系
    addSelectedValuesSafe(features, 'mangaNSFWAcc');           // 共通アクセサリー
    addSelectedValuesSafe(features, 'mangaNSFWOutfit');        // 共通衣装
    addSelectedValuesSafe(features, 'mangaNSFWParticipants');  // 人数・構成
    addSelectedValuesSafe(features, 'mangaNSFWInteraction');   // 共通インタラクション
    addSelectedValuesSafe(features, 'mangaNSFWBackground');    // NSFW背景
    addSelectedValuesSafe(features, 'mangaNSFWEmotion');       // 共通感情
  }
  
  // 注意: 個人動作は除外
  // - mangaHandGesture (個人の手のジェスチャー)
  // - mangaMovementAction (個人の動作)
  // これらは各キャラの個人特徴に含める
}

// ========================================
// SD最適化: 服装処理システム
// ========================================

// ★★★ 1人目の服装特徴追加 ★★★
function add1stPersonOutfitFeaturesSD(features) {
  if (typeof getIsOnepiece !== 'function' || typeof getOne !== 'function') {
    return;
  }
  
  const isOnepiece = getIsOnepiece();
  const textOf = id => {
    const element = document.getElementById(id);
    return element ? (element.textContent || "").trim().replace(/^—$/, "") : "";
  };
  
  if (isOnepiece) {
    const dress = getOne('outfit_dress');
    if (dress) {
      const topColor = textOf('tag_top');
      if (topColor) {
        features.push(`${topColor} ${dress}`);
      } else {
        features.push(dress);
      }
    }
  } else {
    const top = getOne('outfit_top');
    const bottomCat = getOne('bottomCat') || 'pants';
    const pants = getOne('outfit_pants');
    const skirt = getOne('outfit_skirt');
    const shoes = getOne('outfit_shoes');
    
    if (top) {
      const topColor = textOf('tag_top');
      if (topColor) {
        features.push(`${topColor} ${top}`);
      } else {
        features.push(top);
      }
    }
    
    if (bottomCat === 'pants' && pants) {
      const bottomColor = textOf('tag_bottom');
      if (bottomColor) {
        features.push(`${bottomColor} ${pants}`);
      } else {
        features.push(pants);
      }
    } else if (bottomCat === 'skirt' && skirt) {
      const bottomColor = textOf('tag_bottom');
      if (bottomColor) {
        features.push(`${bottomColor} ${skirt}`);
      } else {
        features.push(skirt);
      }
    }
    
    if (shoes) {
      const shoeColor = textOf('tag_shoes');
      if (shoeColor) {
        features.push(`${shoeColor} ${shoes}`);
      } else {
        features.push(shoes);
      }
    }
  }
}

// ★★★ 2人目の服装特徴追加 ★★★
function add2ndPersonOutfitFeaturesSD(features) {
  const dress = getSelectedValue('secondCharDress');
  if (dress) {
    const topColor = getSecondCharColor('top') || 'white';
    features.push(`${topColor} ${dress}`);
  } else {
    const top = getSelectedValue('secondCharTop');
    const bottom = getSelectedValue('secondCharBottom');
    const shoes = getSelectedValue('secondCharShoes');
    
    if (top) {
      const topColor = getSecondCharColor('top') || 'white';
      features.push(`${topColor} ${top}`);
    }
    if (bottom) {
      const bottomColor = getSecondCharColor('bottom') || 'blue';
      features.push(`${bottomColor} ${bottom}`);
    }
    if (shoes) {
      const shoeColor = getSecondCharColor('shoes') || 'gray';
      features.push(`${shoeColor} ${shoes}`);
    }
  }
}

// ========================================
// SD最適化: 性別判定システム
// ========================================

// ★★★ 性別判定関数（SD形式用） ★★★
function determineGenderFromFeatures(personalFeatures) {
  const featuresText = personalFeatures.join(' ').toLowerCase();
  
  // 女性的特徴をチェック
  const femalePatterns = [
    /\b(girl|female|woman|lady|feminine|女子|女性)\b/,
    /\b(dress|skirt|bra|panties)\b/,
    /\b(voluptuous|busty|large breasts)\b/
  ];
  
  // 男性的特徴をチェック  
  const malePatterns = [
    /\b(boy|male|man|guy|masculine|男子|男性)\b/,
    /\b(muscular|beard|masculine|pants|shirt)\b/
  ];
  
  const hasFemale = femalePatterns.some(pattern => pattern.test(featuresText));
  const hasMale = malePatterns.some(pattern => pattern.test(featuresText));
  
  if (hasFemale && !hasMale) return 'girl';
  if (hasMale && !hasFemale) return 'boy';
  if (hasFemale && hasMale) return 'person'; // 両方の特徴がある場合
  
  // デフォルト: 基本情報から推定
  return 'person';
}

// ========================================
// 共通ヘルパー関数（1人モード用・既存互換）
// ========================================

// 商用LoRA追加
function addCommercialLoRAIfEnabled(tags) {
  const commercialLoRAToggle = document.getElementById('mangaCommercialLoRAEnable');
  if (commercialLoRAToggle && commercialLoRAToggle.checked && window.commercialLoRAManager) {
    const loraBaseTags = window.commercialLoRAManager.getSelectedLoRATags();
    if (loraBaseTags.length > 0) {
      tags.push(...loraBaseTags);
    }
  }
}

// 固定プロンプト追加
function addFixedPromptIfExists(tags) {
  const fixed = document.getElementById('fixedManga')?.value?.trim();
  if (fixed) {
    const fixedTags = fixed.split(/\s*,\s*/).filter(Boolean);
    tags.push(...fixedTags);
  }
}

// 従来LoRA追加
function addPrimaryLoRAIfEnabled(tags) {
  if (document.getElementById('mangaUseLoRA')?.checked) {
    const loraTag = document.getElementById('mangaLoRATag')?.value?.trim();
    if (loraTag) {
      const weight = document.getElementById('mangaLoRAWeight')?.value || '0.8';
      tags.push(loraTag.replace(':0.8>', `:${weight}>`));
    }
  }
}

// 1人目の服装を直接タグに追加
function add1stCharacterOutfitToTags(tags) {
  if (typeof getIsOnepiece !== 'function' || typeof getOne !== 'function') {
    return;
  }
  
  const getColor = id => (document.getElementById(id)?.textContent || "").trim().replace(/^—$/, "");
  const isOnepiece = getIsOnepiece();
  
  if (isOnepiece) {
    const dress = getOne('outfit_dress');
    if (dress) {
      const color = getColor('tag_top');
      const outfitTag = color ? `${color} ${dress}` : dress;
      tags.push(outfitTag);
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
      }
    });
  }
}

// 基本キャラ情報のみ追加（服装除く）
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

// 2人目の色取得
function getSecondCharColor(type) {
  const colorElement = document.getElementById(`tag_second${type.charAt(0).toUpperCase() + type.slice(1)}`);
  return colorElement?.textContent?.trim() || null;
}

// 選択値取得
function getSelectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

// 配列に選択値を安全に追加
function addSelectedValuesSafe(tags, containerId) {
  const container = document.getElementById(containerId);
  const added = [];
  
  if (!container) {
    return added;
  }
  
  const selectedInputs = container.querySelectorAll('input:checked');
  
  selectedInputs.forEach(input => {
    if (input.value && input.value.trim() && input.value !== '') {
      tags.push(input.value.trim());
      added.push(input.value.trim());
    }
  });
  
  return added;
}

// NSFW服装除外チェック（既存関数への依存）
function checkNSFWOutfitExclusion() {
  // NSFWが無効な場合は除外しない
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
  if (!nsfwEnabled) {
    return false;
  }
  
  // 対象の3カテゴリをチェック
  const exclusionCategories = [
    'mangaNSFWExpo',      // 露出度
    'mangaNSFWOutfit',    // NSFW衣装
    'mangaNSFWUnderwear'  // 下着状態
  ];
  
  for (const categoryId of exclusionCategories) {
    const container = document.getElementById(categoryId);
    if (container) {
      // 選択されている項目があるかチェック
      const selectedInputs = container.querySelectorAll('input:checked');
      if (selectedInputs.length > 0) {
        // 「未選択」以外が選択されているかチェック
        const hasValidSelection = Array.from(selectedInputs).some(input => 
          input.value && input.value.trim() !== ''
        );
        
        if (hasValidSelection) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// ========================================
// 初期化・統合
// ========================================

// グローバル関数として公開
if (typeof window !== 'undefined') {
  window.generateMangaPrompt = generateMangaPrompt;
  window.generate2PersonMangaPromptSD = generate2PersonMangaPromptSD;
  window.generate1PersonMangaPrompt = generate1PersonMangaPrompt;
  window.collect1stPersonFeaturesSD = collect1stPersonFeaturesSD;
  window.collect2ndPersonFeaturesSD = collect2ndPersonFeaturesSD;
  window.collectCommonFeaturesSD = collectCommonFeaturesSD;
  window.determineGenderFromFeatures = determineGenderFromFeatures;
}

//console.log('✅ manga-prompt-generator.js (SD最適化版) 読み込み完了');
