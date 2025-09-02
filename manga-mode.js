/* 漫画モード用JavaScript（完全修正版） */

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
    populateRadioOptions('mangaCameraView', SFW.camera_view || SFW.view || []);
    populateCheckboxOptions('mangaPropsLight', SFW.props_light || []);
    populateCheckboxOptions('mangaEffectMangaFX', SFW.effect_manga_fx || SFW.effect_manga || []);
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
  
  // 「選択なし」ボタンを最初に追加
  const noneLabel = document.createElement('label');
  noneLabel.className = 'chip chip-none';
  
  const noneInput = document.createElement('input');
  noneInput.type = 'radio';
  noneInput.name = containerId;
  noneInput.value = '';
  noneInput.id = `${containerId}_none`;
  noneInput.checked = true; // デフォルトで選択
  
  const noneSpan = document.createElement('span');
  noneSpan.textContent = '選択なし';
  noneSpan.style.color = '#999';
  
  noneLabel.appendChild(noneInput);
  noneLabel.appendChild(noneSpan);
  container.appendChild(noneLabel);
  
  // 通常のアイテムを追加
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
