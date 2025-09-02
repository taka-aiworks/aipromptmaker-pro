/* 漫画モード用JavaScript（修正版） */

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
  // LoRA使用切り替え
  const loraToggle = document.getElementById('mangaUseLoRA');
  if (loraToggle) {
    loraToggle.addEventListener('change', toggleLoRASettings);
  }
  
  // SFW有効化切り替え
  const sfwToggle = document.getElementById('mangaSFWEnable');
  if (sfwToggle) {
    sfwToggle.addEventListener('change', toggleMangaSFWPanel);
  }
  
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
  
  // 2人目のLoRA使用切り替え
  const secondLoraToggle = document.getElementById('secondCharUseLoRA');
  if (secondLoraToggle) {
    secondLoraToggle.addEventListener('change', toggleSecondCharLoRASettings);
  }
  
  // インタラクション SFW/NSFW切り替え
  document.querySelectorAll('input[name="interactionMode"]').forEach(radio => {
    radio.addEventListener('change', toggleInteractionMode);
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
  
  // 2人目キャラのインポート/エクスポート
  const importSecondChar = document.getElementById('importSecondChar');
  if (importSecondChar) {
    importSecondChar.addEventListener('change', importSecondCharSettings);
  }
  
  const btnExportSecondChar = document.getElementById('btnExportSecondChar');
  if (btnExportSecondChar) {
    btnExportSecondChar.addEventListener('click', exportSecondCharSettings);
  }
  
  // プロンプト生成ボタン
  const btnMangaGenerate = document.getElementById('btnMangaGenerate');
  if (btnMangaGenerate) {
    btnMangaGenerate.addEventListener('click', () => {
      updateMangaOutput();
      toast('漫画モードプロンプト生成完了');
    });
  }
  
  // コピーボタン
  bindCopyTripletExplicit([
    ['btnCopyMangaAll', 'outMangaAll'],
    ['btnCopyMangaPrompt', 'outMangaPrompt'],
    ['btnCopyMangaNeg', 'outMangaNeg']
  ]);
  
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

// LoRA設定の切り替え
function toggleLoRASettings() {
  const enabled = document.getElementById('mangaUseLoRA')?.checked;
  const content = document.getElementById('loraContent');
  if (content) {
    content.style.display = enabled ? 'block' : 'none';
  }
  updateMangaOutput();
}

// SFWパネルの切り替え
function toggleMangaSFWPanel() {
  const enabled = document.getElementById('mangaSFWEnable')?.checked;
  const panel = document.getElementById('mangaSFWPanel');
  if (panel) {
    panel.style.display = enabled ? 'block' : 'none';
  }
  updateMangaOutput();
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
  const content = document.getElementById('secondCharContent');
  if (content) {
    content.style.display = enabled ? 'block' : 'none';
  }
  updateMangaOutput();
}

// 2人目キャラのコアパネル切り替え
function toggleSecondCharCorePanel() {
  const useCore = document.querySelector('input[name="secondCharBase"]:checked')?.value === 'B';
  const panel = document.getElementById('secondCharCorePanel');
  if (panel) {
    panel.style.display = useCore ? 'block' : 'none';
  }
}

// 2人目のLoRA設定切り替え
function toggleSecondCharLoRASettings() {
  const enabled = document.getElementById('secondCharUseLoRA')?.checked;
  const panel = document.getElementById('secondCharLoRAPanel');
  if (panel) {
    panel.style.display = enabled ? 'block' : 'none';
  }
}

// インタラクションモード切り替え
function toggleInteractionMode() {
  const mode = document.querySelector('input[name="interactionMode"]:checked')?.value || 'sfw';
  const sfwPanel = document.getElementById('sfwInteractionPanel');
  const nsfwPanel = document.getElementById('nsfwInteractionPanel');
  
  if (sfwPanel && nsfwPanel) {
    sfwPanel.style.display = mode === 'sfw' ? 'block' : 'none';
    nsfwPanel.style.display = mode === 'nsfw' ? 'block' : 'none';
  }
  
  populateInteractionOptions();
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

// 2人目用色ホイールの初期化
function initSecondCharColorWheels() {
  if (typeof initColorWheel === 'function') {
    secondCharColorWheels.top = initColorWheel("secondTop", 0, 0, 90);       // white
    secondCharColorWheels.bottom = initColorWheel("secondBottom", 240, 80, 50); // blue
    secondCharColorWheels.shoes = initColorWheel("secondShoes", 0, 0, 50);    // gray
  }
}

// 2人目キャラ設定のインポート
function importSecondCharSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // LoRA設定
      if (data.useLoRA) {
        const useLoRACheckbox = document.getElementById('secondCharUseLoRA');
        if (useLoRACheckbox) useLoRACheckbox.checked = true;
        toggleSecondCharLoRASettings();
      }
      
      if (data.loraTag) {
        const loraTagInput = document.getElementById('secondCharLoRATag');
        if (loraTagInput) loraTagInput.value = data.loraTag;
      }
      
      if (data.loraWeight) {
        const loraWeightSlider = document.getElementById('secondCharLoRAWeight');
        const loraWeightDisplay = document.getElementById('secondCharLoRAWeightValue');
        if (loraWeightSlider) loraWeightSlider.value = data.loraWeight;
        if (loraWeightDisplay) loraWeightDisplay.textContent = data.loraWeight;
      }
      
      // キャラ基礎設定
      if (data.charBase) {
        const charBaseRadio = document.querySelector(`input[name="secondCharBase"][value="${data.charBase}"]`);
        if (charBaseRadio) {
          charBaseRadio.checked = true;
          toggleSecondCharCorePanel();
        }
      }
      
      // 各種設定項目
      const settingIds = [
        'secondCharGender', 'secondCharAge', 'secondCharHairstyle',
        'secondCharHairColor', 'secondCharEyeColor', 'secondCharSkinTone',
        'secondCharTop', 'secondCharBottom', 'secondCharDress', 'secondCharShoes'
      ];
      
      settingIds.forEach(id => {
        if (data[id]) {
          const radio = document.querySelector(`input[name="${id}"][value="${data[id]}"]`);
          if (radio) radio.checked = true;
        }
      });
      
      // 色設定
      if (data.colors) {
        ['top', 'bottom', 'shoes'].forEach(type => {
          if (data.colors[type]) {
            const satSlider = document.getElementById(`sat_second${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const litSlider = document.getElementById(`lit_second${type.charAt(0).toUpperCase() + type.slice(1)}`);
            if (satSlider) satSlider.value = data.colors[type].s || 80;
            if (litSlider) litSlider.value = data.colors[type].l || 50;
            
            // 色相も復元する場合（色ホイールの更新が必要）
            if (data.colors[type].h !== undefined && secondCharColorWheels[type]) {
              setTimeout(() => {
                if (secondCharColorWheels[type].onHue) {
                  secondCharColorWheels[type].onHue(data.colors[type].h);
                }
              }, 100);
            }
          }
        });
      }
      
      toast('2人目キャラ設定を読み込みました');
    } catch (error) {
      console.error('2人目キャラ設定読み込みエラー:', error);
      toast('設定の読み込みに失敗しました');
    }
    
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

// 2人目キャラ設定のエクスポート
function exportSecondCharSettings() {
  const data = {
    // LoRA設定
    useLoRA: document.getElementById('secondCharUseLoRA')?.checked || false,
    loraTag: document.getElementById('secondCharLoRATag')?.value || '',
    loraWeight: document.getElementById('secondCharLoRAWeight')?.value || '0.8',
    
    // キャラ基礎設定
    charBase: document.querySelector('input[name="secondCharBase"]:checked')?.value || 'C',
    
    // 各種設定
    secondCharGender: getSelectedValue('secondCharGender'),
    secondCharAge: getSelectedValue('secondCharAge'),
    secondCharHairstyle: getSelectedValue('secondCharHairstyle'),
    secondCharHairColor: getSelectedValue('secondCharHairColor'),
    secondCharEyeColor: getSelectedValue('secondCharEyeColor'),
    secondCharSkinTone: getSelectedValue('secondCharSkinTone'),
    secondCharTop: getSelectedValue('secondCharTop'),
    secondCharBottom: getSelectedValue('secondCharBottom'),
    secondCharDress: getSelectedValue('secondCharDress'),
    secondCharShoes: getSelectedValue('secondCharShoes'),
    
    // 色設定
    colors: {
      top: {
        h: secondCharColorWheels.top?.onHue?.__lastHue || 0,
        s: document.getElementById('sat_secondTop')?.value || 0,
        l: document.getElementById('lit_secondTop')?.value || 90
      },
      bottom: {
        h: secondCharColorWheels.bottom?.onHue?.__lastHue || 240,
        s: document.getElementById('sat_secondBottom')?.value || 80,
        l: document.getElementById('lit_secondBottom')?.value || 50
      },
      shoes: {
        h: secondCharColorWheels.shoes?.onHue?.__lastHue || 0,
        s: document.getElementById('sat_secondShoes')?.value || 0,
        l: document.getElementById('lit_secondShoes')?.value || 50
      }
    }
  };
  
  const filename = `second_char_${nowStamp()}.json`;
  const jsonString = JSON.stringify(data, null, 2);
  
  if (typeof dl === 'function') {
    dl(filename, jsonString);
  } else {
    // フォールバック
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  toast('2人目キャラ設定をエクスポートしました');
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
    populateCheckboxOptions('mangaNSFWAcc', NSFW.accessories || NSFW.accessory || []);
    populateRadioOptions('mangaNSFWOutfit', NSFW.outfit || []);
    populateCheckboxOptions('mangaNSFWBody', NSFW.body || []);
    // 辞書のキー名を確認：nipples または nipple
    populateRadioOptions('mangaNSFWNipples', NSFW.nipples || NSFW.nipple || []);
    populateRadioOptions('mangaNSFWUnderwear', NSFW.underwear || []);
    
    console.log('NSFW選択肢設定完了');
  } catch (error) {
    console.error('NSFW選択肢設定エラー:', error);
  }
  
  // 2人目キャラ用（詳細設定）- 存在する要素のみ設定
  try {
    populateOptionsIfExists('secondCharGender', SFW.gender || [], 'radio');
    populateOptionsIfExists('secondCharAge', SFW.age || [], 'radio');
    populateOptionsIfExists('secondCharHairstyle', SFW.hair_style || [], 'radio');
    populateOptionsIfExists('secondCharHairColor', generateColorOptions(), 'radio');
    populateOptionsIfExists('secondCharEyeColor', generateColorOptions(), 'radio');
    populateOptionsIfExists('secondCharSkinTone', generateSkinToneOptions(), 'radio');
    populateOptionsIfExists('secondCharTop', getCategoryItems('top', SFW), 'radio');
    populateOptionsIfExists('secondCharBottom', getCategoryItems('pants', SFW).concat(getCategoryItems('skirt', SFW)), 'radio');
    populateOptionsIfExists('secondCharDress', getCategoryItems('dress', SFW), 'radio');
    populateOptionsIfExists('secondCharShoes', getCategoryItems('shoes', SFW), 'radio');
    
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
  const sfwInteractions = generateSFWInteractionOptions();
  const nsfwInteractions = generateNSFWInteractionOptions();
  
  populateRadioOptions('secondCharInteractionSFW', sfwInteractions);
  populateRadioOptions('secondCharInteractionNSFW', nsfwInteractions);
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

// 存在する要素にのみ設定するヘルパー関数
function populateOptionsIfExists(containerId, items, type = 'radio') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`⚠️ 要素が存在しません: #${containerId} - スキップ`);
    return;
  }
  
  if (type === 'radio') {
    populateRadioOptions(containerId, items);
  } else if (type === 'checkbox') {
    populateCheckboxOptions(containerId, items);
  }
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

function generateSFWInteractionOptions() {
  return [
    { tag: "handholding", label: "手をつなぐ" },
    { tag: "hugging", label: "抱きしめる" },
    { tag: "supporting", label: "支える" },
    { tag: "handshake", label: "握手" },
    { tag: "high_five", label: "ハイタッチ" },
    { tag: "patting_head", label: "頭を撫でる" },
    { tag: "shoulder_lean", label: "肩に寄りかかる" },
    { tag: "back_to_back", label: "背中合わせ" }
  ];
}

function generateNSFWInteractionOptions() {
  return [
    { tag: "kissing", label: "キス" },
    { tag: "intimate_embrace", label: "密着抱き合い" },
    { tag: "undressing", label: "服を脱がす" },
    { tag: "pushing_down", label: "押し倒す" },
    { tag: "sexual_act", label: "性的行為" },
    { tag: "caressing", label: "愛撫" },
    { tag: "french_kiss", label: "ディープキス" },
    { tag: "groping", label: "身体を触る" }
  ];
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
  
  // フォーマット選択
  const fmt = getFmt('#fmtManga', 'a1111');
  
  // seed生成
  const charName = document.getElementById('charName')?.value || 'manga_char';
  const seed = typeof seedFromName === 'function' ? seedFromName(charName, 0) : Math.floor(Math.random() * 1000000);
  
  // 出力テキスト生成
  const allText = fmt.line(prompt, negative, seed);
  
  // 出力エリアに設定
  const outAll = document.getElementById('outMangaAll');
  const outPrompt = document.getElementById('outMangaPrompt');
  const outNeg = document.getElementById('outMangaNeg');
  
  if (outAll) outAll.textContent = allText;
  if (outPrompt) outPrompt.textContent = prompt;
  if (outNeg) outNeg.textContent = negative;
  
  // seed表示更新
  const seedElement = document.getElementById('mangaSeedValue');
  if (seedElement) seedElement.textContent = seed;
  
  // 競合チェック
  checkMangaConflicts();
}

function generateMangaPrompt() {
  const tags = [];
  
  // 固定タグ（先頭に付与）
  const fixed = document.getElementById('fixedManga')?.value?.trim();
  if (fixed) {
    const fixedTags = fixed.split(/\s*,\s*/).filter(Boolean);
    tags.push(...fixedTags);
  }
  
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
  // SFWパラメータは有効化時のみ適用
  const sfwEnabled = document.getElementById('mangaSFWEnable')?.checked;
  if (sfwEnabled) {
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
  }
  
  // NSFW専用項目
  if (document.getElementById('mangaNSFWEnable')?.checked) {
    addSelectedValues(tags, 'mangaNSFWExpo');
    addSelectedValues(tags, 'mangaNSFWSitu');
    addSelectedValues(tags, 'mangaNSFWLight');
    addSelectedValues(tags, 'mangaNSFWAction');
    addSelectedValues(tags, 'mangaNSFWAcc');
    addSelectedValues(tags, 'mangaNSFWOutfit');
    addSelectedValues(tags, 'mangaNSFWBody');
    addSelectedValues(tags, 'mangaNSFWNipples'); // 辞書のキーに合わせて調整済み
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
      const topColor = getSecondCharColor('top') || 'white';
      tags.push(`${topColor} ${dress}`);
    } else {
      const top = getSelectedValue('secondCharTop');
      const bottom = getSelectedValue('secondCharBottom');
      const shoes = getSelectedValue('secondCharShoes');
      
      if (top) {
        const topColor = getSecondCharColor('top') || 'white';
        tags.push(`${topColor} ${top}`);
      }
      if (bottom) {
        const bottomColor = getSecondCharColor('bottom') || 'blue';
        tags.push(`${bottomColor} ${bottom}`);
      }
      if (shoes) {
        const shoeColor = getSecondCharColor('shoes') || 'gray';
        tags.push(`${shoeColor} ${shoes}`);
      }
    }
  }
  
  // インタラクション（最優先）
  const interactionMode = document.querySelector('input[name="interactionMode"]:checked')?.value || 'sfw';
  if (interactionMode === 'sfw') {
    addSelectedValues(tags, 'secondCharInteractionSFW');
  } else {
    addSelectedValues(tags, 'secondCharInteractionNSFW');
  }
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
      text = document.getElementById('outMangaAll')?.textContent || '';
      break;
    case 'prompt':
      text = document.getElementById('outMangaPrompt')?.textContent || '';
      break;
    case 'negative':
      text = document.getElementById('outMangaNeg')?.textContent || '';
      break;
    default:
      return;
  }
  
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof toast === 'function') {
        toast(`${type.toUpperCase()}をコピーしました`);
      } else {
        showToast(`${type.toUpperCase()}をクリップボードにコピーしました`);
      }
    }).catch(err => {
      console.error('コピーに失敗しました:', err);
      if (typeof toast === 'function') {
        toast('コピーに失敗しました');
      } else {
        showToast('コピーに失敗しました', 'error');
      }
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

// 他のモードとの連携用ヘルパー関数
function bindCopyTripletExplicit(pairs) {
  if (!Array.isArray(pairs)) return;
  pairs.forEach(pair => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const [btnId, outId] = pair;
    const btn = document.getElementById(btnId);
    const out = document.getElementById(outId);
    if (!btn || !out) return;

    btn.addEventListener('click', () => {
      const text = (out.textContent || '').trim();
      if (!text) { 
        if (typeof toast === 'function') {
          toast('コピーする内容がありません');
        }
        return; 
      }
      navigator.clipboard?.writeText(text)
        .then(() => {
          if (typeof toast === 'function') {
            toast('コピーしました');
          }
        })
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text; 
          document.body.appendChild(ta); 
          ta.select();
          document.execCommand('copy'); 
          ta.remove(); 
          if (typeof toast === 'function') {
            toast('コピーしました');
          }
        });
    });
  });
}

// 既存のapp.jsの関数を使用するため、重複定義を削除

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
  window.copyMangaOutput = copyMangaOutput;
  window.updateMangaOutput = updateMangaOutput;
  window.toggleLoRASettings = toggleLoRASettings;
  window.toggleMangaSFWPanel = toggleMangaSFWPanel;
  window.toggleSecondCharSettings = toggleSecondCharSettings;
  window.toggleInteractionMode = toggleInteractionMode;
}
