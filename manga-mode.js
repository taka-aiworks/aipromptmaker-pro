/* 漫画モード用JavaScript（完成版） */

// グローバル変数
let mangaInitialized = false;
let secondCharColorWheels = {};

// 漫画モードの初期化
function initMangaMode() {
  if (mangaInitialized) return;
  mangaInitialized = true;
  
  console.log('漫画モード初期化中...');
  
  // HTMLの漫画モード要素が存在するかチェック
  const mangaPanel = document.getElementById('panelManga');
  if (!mangaPanel) {
    console.error('❌ #panelManga要素が見つかりません');
    return;
  }
  console.log('✅ #panelManga要素確認OK');
  
  // 主要な要素の存在チェック
  const requiredElements = [
    'mangaEmotionPrimary',
    'mangaExpressions', 
    'mangaNSFWExpr',
    'mangaNSFWExpo'
  ];
  
  const missingElements = [];
  requiredElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      console.log(`✅ #${id} 要素確認OK`);
    } else {
      console.error(`❌ #${id} 要素が見つかりません`);
      missingElements.push(id);
    }
  });
  
  if (missingElements.length > 0) {
    console.error('❌ 必要なHTML要素が不足しています:', missingElements);
    console.log('💡 HTMLファイルの漫画モード部分を確認してください');
  }
  
  // イベントリスナーの設定
  setupMangaEventListeners();
  
  // 2人目用色ホイールの初期化
  initSecondCharColorWheels();
  
  // 辞書データがある場合は項目を設定
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  const NSFW = window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW;
  
  if (SFW && NSFW) {
    console.log('✅ 辞書データ確認OK - populateMangaOptions()を実行');
    populateMangaOptions();
  } else {
    console.error('❌ 辞書データが取得できません');
  }
  
  console.log('漫画モード初期化完了');
}

// イベントリスナーの設定
function setupMangaEventListeners() {
  // NSFW有効化切り替え
  const nsfwToggle = document.getElementById('mangaNSFWEnable');
  if (nsfwToggle) {
    nsfwToggle.addEventListener('change', toggleMangaNSFWPanel);
  }
  
  // 2人目キャラ有効化切り替え
  const secondCharToggle = document.getElementById('mangaSecondCharEnable');
  if (secondCharToggle) {
    secondCharToggle.addEventListener('change', toggleSecondCharSettings);
  }
  
  // 2人目のキャラ基礎使用方式切り替え
  document.querySelectorAll('input[name="secondCharBase"]').forEach(radio => {
    radio.addEventListener('change', toggleSecondCharCorePanel);
  });
  
  // LoRA重みスライダー
  const loraWeight = document.getElementById('mangaLoRAWeight');
  if (loraWeight) {
    loraWeight.addEventListener('input', updateLoRAWeightDisplay);
  }
  
  const secondLoraWeight = document.getElementById('secondCharLoRAWeight');
  if (secondLoraWeight) {
    secondLoraWeight.addEventListener('input', updateSecondLoRAWeightDisplay);
  }
  
  // リアルタイム更新
  document.addEventListener('change', (e) => {
    if (e.target.closest('#panelManga')) {
      updateMangaOutput();
    }
  });
  
  // 初期出力生成
  setTimeout(() => {
    updateMangaOutput();
  }, 500);
}

// NSFWパネルの切り替え
function toggleMangaNSFWPanel() {
  const enabled = document.getElementById('mangaNSFWEnable')?.checked;
  const panel = document.getElementById('mangaNSFWPanel');
  if (panel) {
    panel.style.display = enabled ? 'block' : 'none';
  }
  
  // インタラクション選択肢の更新（NSFW項目の表示/非表示）
  populateInteractionOptions();
  updateMangaOutput();
}

// 2人目キャラ設定の切り替え
function toggleSecondCharSettings() {
  const enabled = document.getElementById('mangaSecondCharEnable')?.checked;
  const settings = document.getElementById('secondCharSettings');
  if (settings) {
    settings.classList.toggle('active', enabled);
  }
  updateMangaOutput();
}

// 2人目キャラのコアパネル切り替え
function toggleSecondCharCorePanel() {
  const useCore = document.querySelector('input[name="secondCharBase"]:checked')?.value === 'B';
  const panel = document.getElementById('secondCharCorePanel');
  if (panel) {
    panel.classList.toggle('active', useCore);
  }
}

// LoRA重み表示の更新
function updateLoRAWeightDisplay() {
  const slider = document.getElementById('mangaLoRAWeight');
  const display = document.getElementById('mangaLoRAWeightValue');
  if (slider && display) {
    display.textContent = slider.value;
  }
}

function updateSecondLoRAWeightDisplay() {
  const slider = document.getElementById('secondCharLoRAWeight');
  const display = document.getElementById('secondCharLoRAWeightValue');
  if (slider && display) {
    display.textContent = slider.value;
  }
}

// LoRA折りたたみの切り替え
function toggleLoraSection() {
  const content = document.getElementById('loraContent');
  const caret = document.querySelector('.lora-toggle .caret');
  if (content && caret) {
    const isOpen = content.classList.contains('active');
    content.classList.toggle('active', !isOpen);
    caret.textContent = isOpen ? '▶' : '▼';
  }
}

// 2人目キャラ折りたたみの切り替え
function toggleSecondChar() {
  const content = document.getElementById('secondCharContent');
  const caret = document.querySelector('.second-char-toggle .caret');
  if (content && caret) {
    const isOpen = content.classList.contains('active');
    content.classList.toggle('active', !isOpen);
    caret.textContent = isOpen ? '▶' : '▼';
  }
}

// グローバルNSFW切り替え
function toggleNSFWGlobal() {
  const state = document.getElementById('nsfwState');
  if (state) {
    const isOn = state.textContent === 'ON';
    state.textContent = isOn ? 'OFF' : 'ON';
    state.style.color = isOn ? '#ff6b6b' : '#4ade80';
    
    // 漫画モードのNSFWパネルにも反映
    const mangaNSFW = document.getElementById('mangaNSFWEnable');
    if (mangaNSFW && !isOn) {
      mangaNSFW.checked = false;
      toggleMangaNSFWPanel();
    }
  }
}

// 2人目用色ホイールの初期化
function initSecondCharColorWheels() {
  if (typeof initColorWheel === 'function') {
    secondCharColorWheels.top = initColorWheel("secondTop", 120, 80, 55);    // 緑系
    secondCharColorWheels.bottom = initColorWheel("secondBottom", 280, 70, 50); // 紫系
    secondCharColorWheels.shoes = initColorWheel("secondShoes", 30, 60, 30);    // 茶系
  }
}

// 辞書データから選択肢を設定
function populateMangaOptions() {
  // 既存の辞書データ形式に合わせて参照を修正
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  const NSFW = window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW;
  
  console.log('辞書データの詳細確認:', {
    'window.DEFAULT_SFW_DICT': window.DEFAULT_SFW_DICT,
    'window.DEFAULT_NSFW_DICT': window.DEFAULT_NSFW_DICT,
    'SFW取得結果': SFW,
    'NSFW取得結果': NSFW,
    'SFW存在': !!SFW,
    'NSFW存在': !!NSFW
  });
  
  if (!SFW || !NSFW) {
    console.error('辞書データが取得できません:', {
      'DEFAULT_SFW_DICT構造': window.DEFAULT_SFW_DICT,
      'DEFAULT_NSFW_DICT構造': window.DEFAULT_NSFW_DICT,
      'SFW_keys': SFW ? Object.keys(SFW) : 'null',
      'NSFW_keys': NSFW ? Object.keys(NSFW) : 'null'
    });
    return;
  }
  
  console.log('漫画モード選択肢を設定中...', {
    SFW_keys: Object.keys(SFW),
    NSFW_keys: Object.keys(NSFW),
    'emotion_primary_sample': SFW.emotion_primary?.slice(0, 3),
    'expression_sample': NSFW.expression?.slice(0, 3)
  });
  
  // SFWオプションの設定（エラーハンドリング付き）
  try {
    populateRadioOptions('mangaEmotionPrimary', SFW.emotion_primary || []);
    populateRadioOptions('mangaEmotionDetail', SFW.emotion_detail || []);
    populateRadioOptions('mangaExpressions', SFW.expressions || []);
    populateCheckboxOptions('mangaEffectManga', SFW.effect_manga || []);
    populateRadioOptions('mangaEyeState', SFW.eye_state || []);
    populateRadioOptions('mangaGaze', SFW.gaze || []);
    populateRadioOptions('mangaMouthState', SFW.mouth_state || []);
    populateRadioOptions('mangaPose', SFW.pose || []);
    populateCheckboxOptions('mangaHandGesture', SFW.hand_gesture || []);
    populateCheckboxOptions('mangaMovementAction', SFW.movement_action || []);
    populateRadioOptions('mangaComposition', SFW.composition || []);
    populateRadioOptions('mangaView', SFW.view || []);
    populateRadioOptions('mangaCameraView', SFW.view || []);
    populateCheckboxOptions('mangaPropsLight', SFW.props_light || []);
    populateCheckboxOptions('mangaEffectMangaFX', SFW.effect_manga || []);
    populateRadioOptions('mangaBackground', SFW.background || []);
    populateRadioOptions('mangaLighting', SFW.lighting || []);
    populateRadioOptions('mangaArtStyle', SFW.art_style || []);
    
    console.log('SFW選択肢設定完了');
  } catch (error) {
    console.error('SFW選択肢設定エラー:', error);
  }
  
  // NSFWオプションの設定（エラーハンドリング付き）
  try {
    populateRadioOptions('mangaNSFWExpr', NSFW.expression || []);
    populateRadioOptions('mangaNSFWExpo', NSFW.exposure || []);
    populateRadioOptions('mangaNSFWSitu', NSFW.situation || []);
    populateRadioOptions('mangaNSFWLight', NSFW.lighting || []);
    populateRadioOptions('mangaNSFWPose', NSFW.pose || []);
    populateCheckboxOptions('mangaNSFWAction', NSFW.action || []);
    populateCheckboxOptions('mangaNSFWAcc', NSFW.accessories || []);
    populateRadioOptions('mangaNSFWOutfit', NSFW.outfit || []);
    populateCheckboxOptions('mangaNSFWBody', NSFW.body || []);
    populateRadioOptions('mangaNSFWNipples', NSFW.nipples || []);
    populateRadioOptions('mangaNSFWUnderwear', NSFW.underwear || []);
    
    console.log('NSFW選択肢設定完了');
  } catch (error) {
    console.error('NSFW選択肢設定エラー:', error);
  }
  
  // 2人目キャラ用（詳細設定）
  try {
    populateRadioOptions('secondCharGender', SFW.gender || []);
    populateRadioOptions('secondCharAge', SFW.age || []);
    populateRadioOptions('secondCharHairstyle', SFW.hair_style || []);
    populateRadioOptions('secondCharHairColor', generateColorOptions());
    populateRadioOptions('secondCharEyeColor', generateColorOptions());
    populateRadioOptions('secondCharSkinTone', generateSkinToneOptions());
    populateRadioOptions('secondCharTop', getCategoryItems('top', SFW));
    populateRadioOptions('secondCharBottom', getCategoryItems('pants', SFW).concat(getCategoryItems('skirt', SFW)));
    populateRadioOptions('secondCharDress', getCategoryItems('dress', SFW));
    populateRadioOptions('secondCharShoes', getCategoryItems('shoes', SFW));
    populateRadioOptions('secondCharEmotion', SFW.emotion_primary || []);
    populateRadioOptions('secondCharExpressions', SFW.expressions || []);
    populateRadioOptions('secondCharEyeState', SFW.eye_state || []);
    populateRadioOptions('secondCharMouthState', SFW.mouth_state || []);
    populateRadioOptions('secondCharPose', SFW.pose || []);
    populateCheckboxOptions('secondCharAction', SFW.hand_gesture || []);
    
    console.log('2人目キャラ選択肢設定完了');
  } catch (error) {
    console.error('2人目キャラ選択肢設定エラー:', error);
  }
  
  // インタラクション
  try {
    populateInteractionOptions();
    console.log('インタラクション選択肢設定完了');
  } catch (error) {
    console.error('インタラクション選択肢設定エラー:', error);
  }
  
  // ネガティブプリセット
  try {
    populateCheckboxOptions('mangaNegativePreset', generateNegativePresets());
    console.log('ネガティブプリセット設定完了');
  } catch (error) {
    console.error('ネガティブプリセット設定エラー:', error);
  }
}

// インタラクション選択肢の設定
function populateInteractionOptions() {
  const interactions = generateInteractionOptions();
  populateRadioOptions('secondCharInteraction', interactions);
}

// ヘルパー関数群（デバッグ強化版）
function populateRadioOptions(containerId, items) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`❌ HTML要素が見つかりません: #${containerId}`);
    return;
  }
  
  if (!Array.isArray(items)) {
    console.error(`❌ データが配列ではありません: ${containerId}`, items);
    return;
  }
  
  if (items.length === 0) {
    console.warn(`⚠️ 空の配列です: ${containerId}`);
    return;
  }
  
  console.log(`✅ ${containerId}: ${items.length}個のアイテムを設定中...`);
  
  container.innerHTML = '';
  items.forEach((item, index) => {
    const label = document.createElement('label');
    label.className = 'chip';
    
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = containerId;
    input.value = item.tag || item;
    input.id = `${containerId}_${index}`;
    
    const span = document.createElement('span');
    span.textContent = item.label || item.ja || item.tag || item;
    
    if (item.tag && item.tag !== (item.label || item.ja)) {
      const miniSpan = document.createElement('span');
      miniSpan.className = 'mini';
      miniSpan.textContent = ` ${item.tag}`;
      span.appendChild(miniSpan);
    }
    
    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });
  
  console.log(`✅ ${containerId}: 設定完了 (${container.children.length}個の要素)`);
}

function populateCheckboxOptions(containerId, items) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`❌ HTML要素が見つかりません: #${containerId}`);
    return;
  }
  
  if (!Array.isArray(items)) {
    console.error(`❌ データが配列ではありません: ${containerId}`, items);
    return;
  }
  
  if (items.length === 0) {
    console.warn(`⚠️ 空の配列です: ${containerId}`);
    return;
  }
  
  console.log(`✅ ${containerId}: ${items.length}個のアイテム（チェックボックス）を設定中...`);
  
  container.innerHTML = '';
  items.forEach((item, index) => {
    const label = document.createElement('label');
    label.className = 'chip';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = containerId;
    input.value = item.tag || item;
    input.id = `${containerId}_${index}`;
    
    const span = document.createElement('span');
    span.textContent = item.label || item.ja || item.tag || item;
    
    if (item.tag && item.tag !== (item.label || item.ja)) {
      const miniSpan = document.createElement('span');
      miniSpan.className = 'mini';
      miniSpan.textContent = ` ${item.tag}`;
      span.appendChild(miniSpan);
    }
    
    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });
  
  console.log(`✅ ${containerId}: 設定完了 (${container.children.length}個の要素)`);
}

function generateColorOptions() {
  return [
    { tag: "black hair", label: "黒" },
    { tag: "brown hair", label: "茶" },
    { tag: "blonde hair", label: "金髪" },
    { tag: "red hair", label: "赤" },
    { tag: "blue hair", label: "青" },
    { tag: "green hair", label: "緑" },
    { tag: "purple hair", label: "紫" },
    { tag: "pink hair", label: "ピンク" },
    { tag: "white hair", label: "白" },
    { tag: "silver hair", label: "銀" }
  ];
}

function generateSkinToneOptions() {
  return [
    { tag: "fair skin", label: "白い肌" },
    { tag: "light skin", label: "明るい肌" },
    { tag: "medium skin", label: "普通の肌" },
    { tag: "tan skin", label: "日焼け肌" },
    { tag: "dark skin", label: "暗い肌" }
  ];
}

function getCategoryItems(category, SFW_dict = null) {
  const SFW = SFW_dict || window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  if (!SFW?.outfit) return [];
  return SFW.outfit.filter(item => item.cat === category);
}

function generateInteractionOptions() {
  const sfw = [
    { tag: "handholding", label: "手をつなぐ" },
    { tag: "hugging", label: "抱きしめる" },
    { tag: "supporting", label: "支える" },
    { tag: "handshake", label: "握手" },
    { tag: "high_five", label: "ハイタッチ" }
  ];
  
  const nsfw = [
    { tag: "kissing", label: "キス" },
    { tag: "intimate_embrace", label: "密着抱き合い" },
    { tag: "undressing", label: "服を脱がす" },
    { tag: "pushing_down", label: "押し倒す" },
    { tag: "sexual_act", label: "性的行為" }
  ];
  
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
  return nsfwEnabled ? [...sfw, ...nsfw] : sfw;
}

function generateNegativePresets() {
  return [
    { tag: "bad hands", label: "手の崩れ" },
    { tag: "bad anatomy", label: "解剖学的不正" },
    { tag: "extra fingers", label: "指の数異常" },
    { tag: "deformed", label: "変形" },
    { tag: "blurry", label: "ぼやけ" },
    { tag: "low quality", label: "低品質" },
    { tag: "worst quality", label: "最低品質" },
    { tag: "jpeg artifacts", label: "JPEG劣化" },
    { tag: "text", label: "テキスト除去" },
    { tag: "watermark", label: "透かし除去" }
  ];
}

// プロンプト生成と出力更新
function updateMangaOutput() {
  const prompt = generateMangaPrompt();
  const negative = generateMangaNegative();
  
  const promptOutput = document.getElementById('mangaPromptOutput');
  const negativeOutput = document.getElementById('mangaNegativeOutput');
  
  if (promptOutput) promptOutput.textContent = prompt;
  if (negativeOutput) negativeOutput.textContent = negative;
  
  // seed更新
  const charName = document.getElementById('charName')?.value || 'manga_char';
  if (typeof seedFromName === 'function') {
    const seed = seedFromName(charName, 0);
    const seedElement = document.getElementById('mangaSeedValue');
    if (seedElement) seedElement.textContent = seed;
  }
  
  // 競合チェック
  checkMangaConflicts();
}

function generateMangaPrompt() {
  const tags = [];
  
  // LoRAタグ（最優先）
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
  
  // キャラ基礎設定（1人目）
  const useCharBase = document.querySelector('input[name="mangaCharBase"]:checked')?.value === 'B';
  if (useCharBase) {
    // 基本情報タブの値を参照
    tags.push('solo'); // 2人目がいる場合は後で修正
    
    if (typeof getGenderCountTag === 'function') {
      const genderCountTag = getGenderCountTag();
      if (genderCountTag) tags.push(genderCountTag);
    }
    
    // 基本情報タブから取得する想定のタグ
    addBasicInfoTags(tags);
  }
  
  // 2人目キャラ
  if (document.getElementById('mangaSecondCharEnable')?.checked) {
    // soloを削除して2peopleに変更
    const soloIndex = tags.indexOf('solo');
    if (soloIndex !== -1) {
      tags.splice(soloIndex, 1);
    }
    tags.push('2people');
    
    // 2人目の設定を追加
    addSecondCharTags(tags);
  }
  
  // 漫画パラメータ（優先順位順）
  addSelectedValues(tags, 'mangaEmotionPrimary');
  addSelectedValues(tags, 'mangaEmotionDetail');
  
  // NSFW vs SFW の競合解決
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    addSelectedValues(tags, 'mangaNSFWExpr') || addSelectedValues(tags, 'mangaExpressions');
  } else {
    addSelectedValues(tags, 'mangaExpressions');
  }
  
  addSelectedValues(tags, 'mangaEffectManga');
  addSelectedValues(tags, 'mangaEyeState');
  addSelectedValues(tags, 'mangaGaze');
  addSelectedValues(tags, 'mangaMouthState');
  
  // ポーズ（NSFW優先）
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    addSelectedValues(tags, 'mangaNSFWPose') || addSelectedValues(tags, 'mangaPose');
  } else {
    addSelectedValues(tags, 'mangaPose');
  }
  
  addSelectedValues(tags, 'mangaHandGesture');
  addSelectedValues(tags, 'mangaMovementAction');
  addSelectedValues(tags, 'mangaComposition');
  addSelectedValues(tags, 'mangaView');
  addSelectedValues(tags, 'mangaCameraView');
  addSelectedValues(tags, 'mangaPropsLight');
  addSelectedValues(tags, 'mangaEffectMangaFX');
  addSelectedValues(tags, 'mangaBackground');
  addSelectedValues(tags, 'mangaLighting');
  addSelectedValues(tags, 'mangaArtStyle');
  
  // NSFW専用項目
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    addSelectedValues(tags, 'mangaNSFWExpo');
    addSelectedValues(tags, 'mangaNSFWSitu');
    addSelectedValues(tags, 'mangaNSFWLight');
    addSelectedValues(tags, 'mangaNSFWAction');
    addSelectedValues(tags, 'mangaNSFWAcc');
    addSelectedValues(tags, 'mangaNSFWOutfit');
    addSelectedValues(tags, 'mangaNSFWBody');
    addSelectedValues(tags, 'mangaNSFWNipples');
    addSelectedValues(tags, 'mangaNSFWUnderwear');
  }
  
  return tags.filter(Boolean).join(', ');
}

// 基本情報タブから値を取得してタグに追加
function addBasicInfoTags(tags) {
  // 既存の基本情報取得関数を利用
  if (typeof getBFValue === 'function') {
    const age = getBFValue('age');
    const gender = getBFValue('gender');
    const body = getBFValue('body');
    const height = getBFValue('height');
    if (age) tags.push(age);
    if (gender) tags.push(gender);
    if (body) tags.push(body);
    if (height) tags.push(height);
  }
  
  // 髪型・目の形
  if (typeof getOne === 'function') {
    const hairStyle = getOne('hairStyle');
    const eyeShape = getOne('eyeShape');
    if (hairStyle) tags.push(hairStyle);
    if (eyeShape) tags.push(eyeShape);
  }
  
  // 色タグ（基本情報タブの色ピッカーから）
  const textOf = id => (document.getElementById(id)?.textContent || "").trim();
  const hairColor = textOf('tagH');
  const eyeColor = textOf('tagE');
  const skinColor = textOf('tagSkin');
  if (hairColor) tags.push(hairColor);
  if (eyeColor) tags.push(eyeColor);
  if (skinColor) tags.push(skinColor);
  
  // 服装（基本情報タブの設定から）
  addBasicOutfitTags(tags);
}

// 基本情報の服装タグを追加
function addBasicOutfitTags(tags) {
  if (typeof getIsOnepiece === 'function' && typeof getOne === 'function') {
    const isOnepiece = getIsOnepiece();
    const textOf = id => (document.getElementById(id)?.textContent || "").trim();
    
    if (isOnepiece) {
      const dress = getOne('outfit_dress');
      if (dress) {
        const topColor = textOf('tag_top').replace(/^—$/, "");
        if (topColor) {
          tags.push(`${topColor} ${dress}`);
        } else {
          tags.push(dress);
        }
      }
    } else {
      const top = getOne('outfit_top');
      const bottomCat = getOne('bottomCat') || 'pants';
      const pants = getOne('outfit_pants');
      const skirt = getOne('outfit_skirt');
      const shoes = getOne('outfit_shoes');
      
      if (top) {
        const topColor = textOf('tag_top').replace(/^—$/, "");
        if (topColor) {
          tags.push(`${topColor} ${top}`);
        } else {
          tags.push(top);
        }
      }
      
      if (bottomCat === 'pants' && pants) {
        const bottomColor = textOf('tag_bottom').replace(/^—$/, "");
        if (bottomColor) {
          tags.push(`${bottomColor} ${pants}`);
        } else {
          tags.push(pants);
        }
      } else if (bottomCat === 'skirt' && skirt) {
        const bottomColor = textOf('tag_bottom').replace(/^—$/, "");
        if (bottomColor) {
          tags.push(`${bottomColor} ${skirt}`);
        } else {
          tags.push(skirt);
        }
      }
      
      if (shoes) {
        const shoeColor = textOf('tag_shoes').replace(/^—$/, "");
        if (shoeColor) {
          tags.push(`${shoeColor} ${shoes}`);
        } else {
          tags.push(shoes);
        }
      }
    }
  }
}

// 2人目キャラのタグを追加
function addSecondCharTags(tags) {
  // 2人目のLoRA
  if (document.getElementById('secondCharUseLoRA')?.checked) {
    const loraTag = document.getElementById('secondCharLoRATag')?.value?.trim();
    if (loraTag) {
      const weight = document.getElementById('secondCharLoRAWeight')?.value || '0.8';
      tags.push(loraTag.replace(':0.8>', `:${weight}>`));
    }
  }
  
  // 2人目のキャラ基礎設定
  const useSecondCharBase = document.querySelector('input[name="secondCharBase"]:checked')?.value === 'B';
  if (useSecondCharBase) {
    // コア設定
    addSelectedValues(tags, 'secondCharGender');
    addSelectedValues(tags, 'secondCharAge');
    addSelectedValues(tags, 'secondCharHairstyle');
    addSelectedValues(tags, 'secondCharHairColor');
    addSelectedValues(tags, 'secondCharEyeColor');
    addSelectedValues(tags, 'secondCharSkinTone');
    
    // 2人目の服装（色付き）
    const dress = getSelectedValue('secondCharDress');
    if (dress) {
      const topColor = getSecondCharColor('top') || 'green';
      tags.push(`${topColor} ${dress}`);
    } else {
      const top = getSelectedValue('secondCharTop');
      const bottom = getSelectedValue('secondCharBottom');
      const shoes = getSelectedValue('secondCharShoes');
      
      if (top) {
        const topColor = getSecondCharColor('top') || 'green';
        tags.push(`${topColor} ${top}`);
      }
      if (bottom) {
        const bottomColor = getSecondCharColor('bottom') || 'purple';
        tags.push(`${bottomColor} ${bottom}`);
      }
      if (shoes) {
        const shoeColor = getSecondCharColor('shoes') || 'brown';
        tags.push(`${shoeColor} ${shoes}`);
      }
    }
  }
  
  // 2人目のパラメータ
  addSelectedValues(tags, 'secondCharEmotion');
  addSelectedValues(tags, 'secondCharExpressions');
  addSelectedValues(tags, 'secondCharEyeState');
  addSelectedValues(tags, 'secondCharMouthState');
  addSelectedValues(tags, 'secondCharPose');
  addSelectedValues(tags, 'secondCharAction');
  
  // インタラクション（最優先）
  addSelectedValues(tags, 'secondCharInteraction');
}

// 2人目キャラの色取得
function getSecondCharColor(type) {
  const colorElement = document.getElementById(`tag_second${type.charAt(0).toUpperCase() + type.slice(1)}`);
  return colorElement?.textContent?.trim() || null;
}

function generateMangaNegative() {
  const negatives = [];
  
  // プリセット
  const presets = document.querySelectorAll('input[name="mangaNegativePreset"]:checked');
  presets.forEach(preset => {
    negatives.push(preset.value);
  });
  
  // カスタム
  const custom = document.getElementById('mangaNegativeCustom')?.value?.trim();
  if (custom) {
    custom.split(',').forEach(tag => {
      const trimmed = tag.trim();
      if (trimmed) negatives.push(trimmed);
    });
  }
  
  return negatives.join(', ');
}

// ヘルパー関数
function getSelectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function addSelectedValues(tags, name) {
  const values = document.querySelectorAll(`input[name="${name}"]:checked`);
  const added = [];
  values.forEach(input => {
    if (input.value) {
      tags.push(input.value);
      added.push(input.value);
    }
  });
  return added.length > 0 ? added : null;
}

function checkMangaConflicts() {
  const warning = document.getElementById('conflictWarning');
  if (!warning) return;
  
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
  const hasConflicts = nsfwEnabled && (
    getSelectedValue('mangaExpressions') ||
    getSelectedValue('mangaPose')
  );
  
  warning.style.display = hasConflicts ? 'block' : 'none';
}

// コピー機能
function copyMangaOutput(type) {
  let text = '';
  
  switch (type) {
    case 'all':
      const prompt = document.getElementById('mangaPromptOutput')?.textContent || '';
      const negative = document.getElementById('mangaNegativeOutput')?.textContent || '';
      const seed = document.getElementById('mangaSeedValue')?.textContent || '';
      text = `${prompt}\nNegative prompt: ${negative}\nSeed: ${seed}`;
      break;
    case 'prompt':
      text = document.getElementById('mangaPromptOutput')?.textContent || '';
      break;
    case 'negative':
      text = document.getElementById('mangaNegativeOutput')?.textContent || '';
      break;
    default:
      return;
  }
  
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${type.toUpperCase()}をクリップボードにコピーしました`);
    }).catch(err => {
      console.error('コピーに失敗しました:', err);
      showToast('コピーに失敗しました', 'error');
    });
  }
}

// トースト表示
function showToast(message, type = 'success') {
  // 既存のトーストがあれば削除
  const existingToast = document.querySelector('.manga-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // トースト要素を作成
  const toast = document.createElement('div');
  toast.className = `manga-toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff6b6b' : '#4ade80'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 9999;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  // 3秒後に自動削除
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 漫画モードの初期化を自動実行
document.addEventListener('DOMContentLoaded', () => {
  // 辞書ファイルの読み込み完了を待つ
  const checkDictionaries = () => {
    const hasSFW = !!(window.DEFAULT_SFW_DICT?.SFW || window.SFW);
    const hasNSFW = !!(window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW);
    
    if (hasSFW && hasNSFW) {
      console.log('辞書データ確認:', {
        DEFAULT_SFW_DICT: !!window.DEFAULT_SFW_DICT,
        DEFAULT_NSFW_DICT: !!window.DEFAULT_NSFW_DICT,
        SFW: !!window.SFW,
        NSFW: !!window.NSFW
      });
      initMangaMode();
    } else {
      console.log('辞書データ待機中...', {
        DEFAULT_SFW_DICT: !!window.DEFAULT_SFW_DICT,
        DEFAULT_NSFW_DICT: !!window.DEFAULT_NSFW_DICT,
        SFW: !!window.SFW,
        NSFW: !!window.NSFW
      });
      setTimeout(checkDictionaries, 100);
    }
  };
  
  setTimeout(checkDictionaries, 500);
});

// タブ切り替え時の初期化
document.addEventListener('click', (e) => {
  if (e.target.matches('.tab[data-mode="manga"]')) {
    setTimeout(() => {
      const hasSFW = !!(window.DEFAULT_SFW_DICT?.SFW || window.SFW);
      const hasNSFW = !!(window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW);
      
      if (!mangaInitialized && hasSFW && hasNSFW) {
        console.log('タブクリック時の初期化実行');
        initMangaMode();
      }
    }, 100);
  }
});

// より確実な初期化のための追加チェック
window.addEventListener('load', () => {
  setTimeout(() => {
    const hasSFW = !!(window.DEFAULT_SFW_DICT?.SFW || window.SFW);
    const hasNSFW = !!(window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW);
    
    if (!mangaInitialized && hasSFW && hasNSFW) {
      console.log('window.load時の初期化実行');
      initMangaMode();
    }
  }, 1000);
});

// エクスポート（他のスクリプトから使用可能にする）
if (typeof window !== 'undefined') {
  window.initMangaMode = initMangaMode;
  window.toggleLoraSection = toggleLoraSection;
  window.toggleSecondChar = toggleSecondChar;
  window.copyMangaOutput = copyMangaOutput;
  window.updateMangaOutput = updateMangaOutput;
}
