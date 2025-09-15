/* 漫画モード用JavaScript（修正版） */

// グローバル変数
let mangaInitialized = false;
let secondCharColorWheels = {};

// 漫画モードの初期化
function initMangaMode() {
  if (mangaInitialized) return;
  mangaInitialized = true;
  
  
  // HTMLの漫画モード要素が存在するかチェック
  const mangaPanel = document.getElementById('panelManga');
  if (!mangaPanel) {
    return;
  }
  
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
    } else {
      missingElements.push(id);
    }
  });
  
  if (missingElements.length > 0) {
    //console.error('❌ 必要なHTML要素が不足しています:', missingElements);
    //console.log('💡 HTMLファイルの漫画モード部分を確認してください');
  }
  
  // イベントリスナーの設定
  setupMangaEventListeners();
  
  // 2人目用色ホイールの初期化
  initSecondCharColorWheels();
  
  // 辞書データがある場合は項目を設定
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  const NSFW = window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW;
  
  if (SFW && NSFW) {
    //console.log('✅ 辞書データ確認OK - populateMangaOptions()を実行');
    populateMangaOptions();
  } else {
  }
}

// イベントリスナーの設定（デバッグ強化版） - 既存のsetupMangaEventListeners関数を置き換え
function setupMangaEventListeners() {
  //console.log('🎬 setupMangaEventListeners 開始');
  
  // LoRA使用切り替え
  const loraToggle = document.getElementById('mangaUseLoRA');
  if (loraToggle) {
    loraToggle.addEventListener('change', toggleLoRASettings);
    //console.log('✅ mangaUseLoRA イベントリスナー設定完了');
  } else {
    //console.warn('⚠️ mangaUseLoRA 要素が見つかりません');
  }
  
  // SFWパラメータ表示切り替え（追加）
  const sfwParamsToggle = document.getElementById('mangaSFWParamsToggle');
  if (sfwParamsToggle) {
    sfwParamsToggle.addEventListener('change', toggleMangaSFWParams);
    // 初期状態を設定
    toggleMangaSFWParams();
    //console.log('✅ mangaSFWParamsToggle イベントリスナー設定完了');
  } else {
    //console.warn('⚠️ mangaSFWParamsToggle 要素が見つかりません');
  }
  
  // 任意項目表示切り替え（追加）
  const optionalToggle = document.getElementById('mangaOptionalToggle');
  if (optionalToggle) {
    optionalToggle.addEventListener('change', toggleMangaOptionalContent);
    // 初期状態を設定
    toggleMangaOptionalContent();
   // console.log('✅ mangaOptionalToggle イベントリスナー設定完了');
  } else {
    //console.warn('⚠️ mangaOptionalToggle 要素が見つかりません');
  }
  
  // SFW有効化切り替え
  const sfwToggle = document.getElementById('mangaSFWEnable');
  if (sfwToggle) {
    sfwToggle.addEventListener('change', () => {
      //console.log('🔄 SFW切り替え:', sfwToggle.checked);
      toggleMangaSFWPanel();
    });
    //console.log('✅ mangaSFWEnable イベントリスナー設定完了, 現在の状態:', sfwToggle.checked);
  } else {
    //console.warn('⚠️ mangaSFWEnable 要素が見つかりません');
  }
  
  // NSFW有効化切り替え
  const nsfwToggle = document.getElementById('mangaNSFWEnable');
  if (nsfwToggle) {
    nsfwToggle.addEventListener('change', () => {
      //console.log('🔄 NSFW切り替え:', nsfwToggle.checked);
      toggleMangaNSFWPanel();
    });
    //console.log('✅ mangaNSFWEnable イベントリスナー設定完了, 現在の状態:', nsfwToggle.checked);
  } else {
    //console.warn('⚠️ mangaNSFWEnable 要素が見つかりません');
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
  
  // 【重要修正】リアルタイム更新システムを呼び出し
  setupMangaRealTimeUpdate();
  
  // 🆕 漫画モード検索機能の初期化
  setTimeout(() => {
    initMangaSearchSystem();
  }, 500);
  
  // 初期出力生成
  setTimeout(() => {
    //console.log('⏰ 初期出力生成実行');
    updateMangaOutput();
  }, 500);
  
  //console.log('🎬 setupMangaEventListeners 完了');
}


// 【新規関数】漫画モード要素のデバッグ - setupMangaEventListeners の後に追加
function debugMangaElements() {
  //console.log('🔍 漫画モード要素デバッグ開始');
  
  // 重要な要素の存在確認
  const criticalElements = [
    'panelManga',
    'mangaSFWEnable', 
    'mangaNSFWEnable',
    'mangaEmotionPrimary',
    'mangaExpressions',
    'mangaNSFWExpr',
    'mangaNSFWExpo'
  ];
  
  criticalElements.forEach(id => {
    const element = document.getElementById(id);
   // console.log(`🔸 ${id}:`,{
   //   exists: !!element,
   //   type: element?.tagName,
   //   children: element?.children?.length || 0,
   //   has_inputs: element?.querySelectorAll('input')?.length || 0
  //  });
    
    if (element && id.startsWith('manga') && !id.includes('Enable')) {
      const inputs = element.querySelectorAll('input');
     // console.log(`  📄 ${id} 内の入力要素:`, [...inputs].map(inp => ({
     //   type: inp.type,
     //   value: inp.value,
     //   checked: inp.checked,
     //   name: inp.name
     // })));
    }
  });
  
  // 漫画パネル全体の統計
  const mangaPanel = document.getElementById('panelManga');
  if (mangaPanel) {
    const allInputs = mangaPanel.querySelectorAll('input');
    const checkedInputs = mangaPanel.querySelectorAll('input:checked');
    
 //   console.log('📊 漫画パネル全体統計:', {
 //   total_inputs: allInputs.length,
 //     checked_inputs: checkedInputs.length,
 //     input_types: [...new Set([...allInputs].map(inp => inp.type))],
 //    checked_values: [...checkedInputs].map(inp => inp.value)
 //   });
  }
}

// 初期化時にデバッグを実行
function initMangaModeWithDebug() {
  if (mangaInitialized) return;
  
  // 元の初期化処理
  initMangaMode();
  
  // デバッグ情報出力
  setTimeout(() => {
    debugMangaElements();
  }, 1000);
}

// デバッグ実行用のグローバル関数
window.debugMangaElements = debugMangaElements;


// 【新規関数】リアルタイム更新システム - setupMangaEventListeners の後に追加
function setupMangaRealTimeUpdate() {
  // 漫画パネル内のすべての入力要素を監視
  const mangaPanel = document.getElementById('panelManga');
  if (!mangaPanel) {
  //  console.error('❌ #panelManga が見つかりません');
    return;
  }
  
  // イベント委譲を使用して動的に追加される要素も監視
  mangaPanel.addEventListener('change', (e) => {
    if (e.target.matches('input, select, textarea')) {
    //  console.log('🔄 漫画モード要素変更検知:', e.target.name || e.target.id, '値:', e.target.value);
      setTimeout(updateMangaOutput, 50); // 少し遅延させて確実に実行
    }
  });
  
  mangaPanel.addEventListener('input', (e) => {
    if (e.target.matches('input[type="range"], textarea')) {
    //  console.log('🔄 漫画モード入力変更:', e.target.name || e.target.id, '値:', e.target.value);
      setTimeout(updateMangaOutput, 50);
    }
  });
  
  // 特定の要素の直接監視も追加（二重保険）
  const criticalElements = [
    'mangaEmotionPrimary', 'mangaExpressions', 'mangaNSFWExpr', 'mangaNSFWExpo',
    'mangaSFWEnable', 'mangaNSFWEnable', 'mangaSecondCharEnable',
    // 🆕 追加
    'mangaNSFWParticipants', 'mangaNSFWAction2'
  ];
  
  criticalElements.forEach(id => {
    const container = document.getElementById(id);
    if (container) {
      container.addEventListener('change', () => {
       // console.log(`🔄 ${id} 変更検知`);
        setTimeout(updateMangaOutput, 50);
      });
    }
  });
  
 // console.log('✅ リアルタイム更新システム設定完了');
}



// SFWパラメータ表示切り替え（新規関数）
function toggleMangaSFWParams() {
  const toggle = document.getElementById('mangaSFWParamsToggle');
  const content = document.getElementById('mangaSFWParamsContent');
  
  if (!toggle || !content) return;
  
  const isVisible = toggle.checked;
  content.style.display = isVisible ? 'block' : 'none';
  
 // console.log('SFWパラメータ表示:', isVisible ? '表示' : '非表示');
}

// 任意項目表示切り替え（新規関数）
function toggleMangaOptionalContent() {
  const toggle = document.getElementById('mangaOptionalToggle');
  const content = document.getElementById('mangaOptionalContent');
  
  if (!toggle || !content) return;
  
  const isVisible = toggle.checked;
  content.style.display = isVisible ? 'block' : 'none';
  
 // console.log('任意項目表示:', isVisible ? '表示' : '非表示');
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
          // ★★★ 以下3項目を追加 ★★★
        'secondCharHairLength', 'secondCharBangsStyle', 'secondCharSkinFeatures',
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
     // console.error('2人目キャラ設定読み込みエラー:', error);
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
    // ★★★ 以下3行を追加 ★★★
    secondCharHairLength: getSelectedValue('secondCharHairLength'),
    secondCharBangsStyle: getSelectedValue('secondCharBangsStyle'),  
    secondCharSkinFeatures: getSelectedValue('secondCharSkinFeatures'),
    
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

// 辞書データから選択肢を設定（ネガティブプロンプト対応版）
function populateMangaOptions() {
  // 既存の辞書データ形式に合わせて参照を修正
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  const NSFW = window.DEFAULT_NSFW_DICT?.NSFW || window.NSFW;
  
  // SFWオプションの設定（エラーハンドリング付き）
  try {
    populateRadioOptions('mangaEmotionPrimary', SFW.emotion_primary || []);
    populateRadioOptions('mangaEmotionDetail', SFW.emotion_detail || []);
    populateRadioOptions('mangaExpressions', SFW.expressions || []);

  　// ★★★ 以下3行を追加 ★★★
    populateRadioOptions('mangaHairLength', SFW.hair_length || []);
    populateRadioOptions('mangaBangsStyle', SFW.bangs_style || []);
    populateRadioOptions('mangaSkinFeatures', SFW.skin_features || []);
    
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

    // 🆕 新規追加項目
    populateCheckboxOptions('mangaRelationship', SFW.relationship || []);
    populateCheckboxOptions('mangaPhysicalState', SFW.physical_state || []);
    populateRadioOptions('mangaOccupation', SFW.occupation || []);
    populateRadioOptions('mangaSeasonWeather', SFW.season_weather || []);
    
  //  console.log('SFW選択肢設定完了');
  } catch (error) {
  //  console.error('SFW選択肢設定エラー:', error);
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
    populateRadioOptions('mangaNSFWParticipants', NSFW.participants || []);
    // 🆕 射精・体液系アクション
    populateCheckboxOptions('mangaNSFWAction2', NSFW.action2 || []);

    // 🆕 新規追加項目
    populateRadioOptions('mangaNSFWInteraction', NSFW.interaction_nsfw || []);
    populateRadioOptions('mangaNSFWBackground', NSFW.background_nsfw || []);
    populateRadioOptions('mangaNSFWEmotion', NSFW.emotion_nsfw || []);
    
  //  console.log('NSFW選択肢設定完了');
  } catch (error) {
  //  console.error('NSFW選択肢設定エラー:', error);
  }
  
  // 2人目キャラ用（詳細設定）- 存在する要素のみ設定
  try {
    populateOptionsIfExists('secondCharGender', SFW.gender || [], 'radio');
    populateOptionsIfExists('secondCharAge', SFW.age || [], 'radio');
    populateOptionsIfExists('secondCharHairstyle', SFW.hair_style || [], 'radio');
        // ★★★ 以下3行を追加 ★★★
    populateOptionsIfExists('secondCharHairLength', SFW.hair_length || [], 'radio');
    populateOptionsIfExists('secondCharBangsStyle', SFW.bangs_style || [], 'radio');
    populateOptionsIfExists('secondCharSkinFeatures', SFW.skin_features || [], 'radio');
    populateOptionsIfExists('secondCharHairColor', generateColorOptions(), 'radio');
    populateOptionsIfExists('secondCharEyeColor', generateColorOptions(), 'radio');
    populateOptionsIfExists('secondCharSkinTone', generateSkinToneOptions(), 'radio');
    populateOptionsIfExists('secondCharTop', getCategoryItems('top', SFW), 'radio');
    populateOptionsIfExists('secondCharBottom', getCategoryItems('pants', SFW).concat(getCategoryItems('skirt', SFW)), 'radio');
    populateOptionsIfExists('secondCharDress', getCategoryItems('dress', SFW), 'radio');
    populateOptionsIfExists('secondCharShoes', getCategoryItems('shoes', SFW), 'radio');
    
  //  console.log('2人目キャラ選択肢設定完了');
  } catch (error) {
  //  console.error('2人目キャラ選択肢設定エラー:', error);
  }
  
  // インタラクション
  try {
    populateInteractionOptions();
  //  console.log('インタラクション選択肢設定完了');
  } catch (error) {
  //  console.error('インタラクション選択肢設定エラー:', error);
  }
  
  // ========== ネガティブプロンプト（新システム対応）==========
  try {
    // 新しいカテゴリ別UIが存在する場合は新システムを使用
    if (document.getElementById('mangaNegEssential')) {
      // 新しいネガティブプロンプトシステムの初期化は
      // initMangaNegativeSystem() で行うため、ここでは何もしない
   //   console.log('新ネガティブシステム検出 - initMangaNegativeSystem()で初期化');
    } else {
      // 既存システム（下位互換）
      populateCheckboxOptions('mangaNegativePreset', generateNegativePresets());
   //   console.log('旧ネガティブプリセット設定完了');
    }
  } catch (error) {
   // console.error('ネガティブプロンプト設定エラー:', error);
  }
  
  // ========== 新ネガティブシステムの初期化（遅延実行）==========
  setTimeout(() => {
    if (document.getElementById('mangaNegEssential') && typeof initMangaNegativeSystem === 'function') {
      try {
        initMangaNegativeSystem();
      } catch (error) {
      }
    }
  }, 300);
  
//  console.log('漫画モード選択肢設定完了');
  
  // 🆕 検索統計の更新
  setTimeout(() => {
    updateMangaSearchStats();
  }, 100);
}

// インタラクション選択肢の設定
function populateInteractionOptions() {
  const sfwInteractions = generateSFWInteractionOptions();
  const nsfwInteractions = generateNSFWInteractionOptions();
  
  populateRadioOptions('secondCharInteractionSFW', sfwInteractions);
  populateRadioOptions('secondCharInteractionNSFW', nsfwInteractions);
}

// ヘルパー関数群（修正版 - 未選択ボタン付き）
function populateRadioOptions(containerId, items) {
  const container = document.getElementById(containerId);
  
  if (!container) {
 //   console.error(`❌ HTML要素が見つかりません: #${containerId}`);
    return;
  }
  
  if (!Array.isArray(items)) {
  //  console.error(`❌ データが配列ではありません: ${containerId}`, items);
    return;
  }
  
  if (items.length === 0) {
  //  console.warn(`⚠️ 空の配列です: ${containerId}`);
    return;
  }
  
 // console.log(`✅ ${containerId}: ${items.length}個のアイテムを設定中...`);
  
  container.innerHTML = '';
  
  // 「未選択」ボタンを先頭に追加
  const clearLabel = document.createElement('label');
  clearLabel.className = 'chip';
  clearLabel.style.background = 'rgba(255, 100, 100, 0.1)';
  clearLabel.style.borderColor = 'rgba(255, 100, 100, 0.3)';
  clearLabel.style.color = 'rgba(255, 150, 150, 1)';
  
  const clearInput = document.createElement('input');
  clearInput.type = 'radio';
  clearInput.name = containerId;
  clearInput.value = '';
  clearInput.id = `${containerId}_clear`;
  clearInput.checked = true; // デフォルトで未選択状態
  
  const clearSpan = document.createElement('span');
  clearSpan.textContent = '未選択';
  
  clearLabel.appendChild(clearInput);
  clearLabel.appendChild(clearSpan);
  container.appendChild(clearLabel);
  
  // 通常の選択肢を追加
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
  
//  console.log(`✅ ${containerId}: 設定完了 (${container.children.length}個の要素、未選択ボタン含む)`);
}

function populateCheckboxOptions(containerId, items) {
  const container = document.getElementById(containerId);
  
  if (!container) {
  //  console.error(`❌ HTML要素が見つかりません: #${containerId}`);
    return;
  }
  
  if (!Array.isArray(items)) {
  //  console.error(`❌ データが配列ではありません: ${containerId}`, items);
    return;
  }
  
  if (items.length === 0) {
  //  console.warn(`⚠️ 空の配列です: ${containerId}`);
    return;
  }
  
//  console.log(`✅ ${containerId}: ${items.length}個のアイテム（チェックボックス）を設定中...`);
  
  container.innerHTML = '';
  
  // 「全解除」ボタンを先頭に追加
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'btn ghost small';
  clearButton.textContent = '全解除';
  clearButton.style.cssText = `
    margin-right: 8px;
    margin-bottom: 8px;
    background: rgba(255, 100, 100, 0.1);
    border-color: rgba(255, 100, 100, 0.3);
    color: rgba(255, 150, 150, 1);
    padding: 4px 8px;
    font-size: 12px;
  `;
  
  clearButton.addEventListener('click', () => {
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = false;
    });
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    }
  });
  
  container.appendChild(clearButton);
  
  // 通常の選択肢を追加
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
  
//  console.log(`✅ ${containerId}: 設定完了 (${container.children.length}個の要素、全解除ボタン含む)`);
}

// 存在する要素にのみ設定するヘルパー関数
function populateOptionsIfExists(containerId, items, type = 'radio') {
  const container = document.getElementById(containerId);
  if (!container) {
  //  console.warn(`⚠️ 要素が存在しません: #${containerId} - スキップ`);
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

// プロンプト生成と出力更新（修正版） - 既存のupdateMangaOutput関数を置き換え
function updateMangaOutput() {
 // console.log('🔄 updateMangaOutput実行開始');
  
  const prompt = generateMangaPrompt();
  const negative = generateMangaNegative();
  
//  console.log('📝 生成されたプロンプト:', prompt);
//  console.log('🚫 生成されたネガティブ:', negative);
  
  // フォーマット選択（修正：getFmt関数の存在チェック付き）
  let fmt;
  if (typeof getFmt === 'function') {
    fmt = getFmt('#fmtManga', 'a1111');
  } else {
    // フォールバック: デフォルトのフォーマッタ
    fmt = {
      line: (p, n, seed) => `Prompt: ${p}\nNegative prompt: ${n}\nSeed: ${seed}`
    };
  }
  
  // seed生成（修正：seedFromName関数の存在チェック付き）
  const charName = document.getElementById('charName')?.value || 'manga_char';
  let seed;
  if (typeof seedFromName === 'function') {
    seed = seedFromName(charName, 0);
  } else {
    // フォールバック: 簡易seed生成
    let h = 2166136261 >>> 0;
    for (let i = 0; i < charName.length; i++) { 
      h ^= charName.charCodeAt(i); 
      h = (h >>> 0) * 16777619 >>> 0; 
    }
    seed = h >>> 0;
  }
  
  // 出力テキスト生成
  const allText = fmt.line(prompt, negative, seed);
  
  // 出力エリアに設定
  const outAll = document.getElementById('outMangaAll');
  const outPrompt = document.getElementById('outMangaPrompt');
  const outNeg = document.getElementById('outMangaNeg');
  
  if (outAll) {
    outAll.textContent = allText;
 //   console.log('✅ outMangaAll更新完了');
  } else {
 //   console.error('❌ outMangaAll要素が見つかりません');
  }

// manga-mode.js の updateMangaOutput関数内の修正
// 約1700行目付近の outPrompt 処理部分を以下に置き換え

if (outPrompt) {
  // Nano-banana選択時は編集指示文のみを表示（ネガティブプロンプト除外）
  if (fmt.label && fmt.label.includes('Nano-banana')) {
    // ネガティブプロンプト部分を除外して編集指示文のみを抽出
    const instructionOnly = allText.split('\n\nNegative:')[0];
    outPrompt.textContent = instructionOnly;
  } else {
    // 他のフォーマットの場合は通常のプロンプトを表示
    outPrompt.textContent = prompt;
  }
}
  
  if (outNeg) {
    outNeg.textContent = negative;
 //   console.log('✅ outMangaNeg更新完了');
  } else {
 //   console.error('❌ outMangaNeg要素が見つかりません');
  }
  
  // seed表示更新
  const seedElement = document.getElementById('mangaSeedValue');
  if (seedElement) seedElement.textContent = seed;
  
  // 競合チェック
  checkMangaConflicts();
  
//  console.log('✅ updateMangaOutput実行完了');
}






// ========================================
// manga-mode.js 商用LoRA統合部分の修正
// 1530行目付近を以下に置き換え
// ========================================

// 🔥 修正版: 商用LoRAマネージャーとの統合強化
function initCommercialLoRAIntegration() {
  
  // 商用LoRAマネージャーの存在確認
  if (!window.commercialLoRAManager) {
    
    // 遅延再試行（最大5回）
    let retryCount = 0;
    const maxRetries = 5;
    
    const retryInit = () => {
      retryCount++;
      
      if (window.commercialLoRAManager) {
        setupCommercialLoRAHooks();
        return;
      }
      
      if (retryCount < maxRetries) {

        setTimeout(retryInit, 500);
      } else {
      }
    };
    
    setTimeout(retryInit, 1000);
    return;
  }
  
  // 即座に統合セットアップ
  setupCommercialLoRAHooks();
}

// 商用LoRAフックのセットアップ
function setupCommercialLoRAHooks() {
  if (!window.commercialLoRAManager) {

    return;
  }
  
  
  // 元のupdateMangaOutputメソッドをバックアップ
  const originalUpdateMethod = window.commercialLoRAManager.updateMangaOutput;
  
  // 改良版updateMangaOutputメソッドを設定
  window.commercialLoRAManager.updateMangaOutput = function() {
    
    try {
      // 循環参照防止フラグ
      if (window.commercialLoRAManager._updating) {
        return;
      }
      
      window.commercialLoRAManager._updating = true;
      
      // メインのupdateMangaOutput関数を呼び出し
      if (typeof updateMangaOutput === 'function') {
        updateMangaOutput();
      } else {
        
        // フォールバック: 最小限のプロンプト生成
        if (typeof generateMangaPrompt === 'function') {
          const prompt = generateMangaPrompt();
        }
      }
      
    } catch (error) {
    } finally {
      // フラグをリセット
      window.commercialLoRAManager._updating = false;
    }
  };
  
  // 商用LoRAの選択変更を監視
  setupCommercialLoRAChangeListener();
  
}

// 商用LoRA選択変更の監視
function setupCommercialLoRAChangeListener() {
  // 商用LoRAトグルの監視
  const commercialLoRAToggle = document.getElementById('mangaCommercialLoRAEnable');
  if (commercialLoRAToggle) {
    commercialLoRAToggle.addEventListener('change', () => {
      
      // 少し遅延してプロンプト更新
      setTimeout(() => {
        if (typeof updateMangaOutput === 'function') {
          updateMangaOutput();
        }
      }, 100);
    });
  }
  
  // 商用LoRAパネル内の変更を監視
  const commercialLoRAPanel = document.getElementById('commercialLoRAPanel');
  if (commercialLoRAPanel) {
    commercialLoRAPanel.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"], input[type="range"]')) {
        
        // 遅延してプロンプト更新
        setTimeout(() => {
          if (typeof updateMangaOutput === 'function') {
            updateMangaOutput();
          }
        }, 50);
      }
    });
  }
}

// 商用LoRAのデバッグ関数
function debugCommercialLoRA() {
  
  const info = {
    managerExists: !!window.commercialLoRAManager,
    toggleExists: !!document.getElementById('mangaCommercialLoRAEnable'),
    panelExists: !!document.getElementById('commercialLoRAPanel'),
    dictExists: !!window.COMMERCIAL_LORA_DICT,
    isEnabled: document.getElementById('mangaCommercialLoRAEnable')?.checked || false,
    selectedCount: window.commercialLoRAManager?.selectedLoRAs?.size || 0,
    selectedTags: window.commercialLoRAManager?.getSelectedLoRATags?.() || []
  };
  
  
  // プロンプト生成テスト
  if (info.managerExists && info.selectedCount > 0) {
    try {
      const prompt = generateMangaPrompt();
      const hasLoRAAtStart = info.selectedTags.some(tag => prompt.startsWith(tag.substring(0, 10)));
    } catch (error) {

    }
  }
  
  return info;
}

// 既存のコメント付きコードブロックを置き換え
// ========================================
// 【削除対象】以下のコードブロックを削除してください
// ========================================
/*
// 商用LoRAマネージャーの更新処理を即座実行に変更
if (window.commercialLoRAManager) {
  // 既存のupdateMangaOutputメソッドを上書き
  window.commercialLoRAManager.updateMangaOutput = function() {
    // setTimeoutを削除し、即座に実行
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    } else {
    }
  };
}
*/

// ========================================
// 【追加】初期化関数の最後にこれを追加
// ========================================

// 商用LoRA統合の初期化を実行
setTimeout(() => {
  initCommercialLoRAIntegration();
}, 1500);

// グローバル関数として公開
window.initCommercialLoRAIntegration = initCommercialLoRAIntegration;
window.setupCommercialLoRAHooks = setupCommercialLoRAHooks;
window.debugCommercialLoRA = debugCommercialLoRA;



// ========================================
// デバッグ・確認用関数
// ========================================

// プロンプト生成テスト
window.testMangaPromptWithLoRA = function() {
  
  // 現在の商用LoRA状態確認
  const toggle = document.getElementById('mangaCommercialLoRAEnable');
  const loraCount = window.commercialLoRAManager?.selectedLoRAs?.size || 0;
  
  //console.log('📋 テスト前状態確認:', {
  //  'LoRA有効': toggle?.checked || false,
  //  '選択LoRA数': loraCount,
  //  '選択LoRAタグ': window.commercialLoRAManager?.getSelectedLoRATags() || []
  //});
  
  // プロンプト生成実行
  const result = generateMangaPrompt();
  
  
  // LoRAタグの位置確認
  const loraMatch = result.match(/<lora:[^>]+>/g);
  if (loraMatch) {
    const firstLoRAIndex = result.indexOf(loraMatch[0]);
   // console.log('✅ LoRAタグが先頭に配置:', {
   //   'LoRAタグ': loraMatch,
   //   '最初のLoRA位置': firstLoRAIndex,
   //   '先頭配置': firstLoRAIndex < 20
   // });
  } else {
  }
  
  return result;
};

// 完全な出力テスト
window.testFullMangaOutputWithLoRA = function() {
  
  updateMangaOutput();
  
  const outPrompt = document.getElementById('outMangaPrompt');
  const result = outPrompt ? outPrompt.textContent : 'null';
  
  
  return result;
};




// 🔥 修正2: addSelectedValuesSafe関数を改善（約1350行目付近）
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
  
  if (added.length > 0) {
  }
  
  return added;
}


// 既存のaddSelectedValues関数も置き換える
function addSelectedValues(tags, name) {
  return addSelectedValuesSafe(tags, name);
}


// 🔥 修正1: addBasicInfoTagsSafe関数を置き換え（NSFW服装除外対応版）
function addBasicInfoTagsSafe(tags) {
  try {
    // ===== 🚨 NSFW服装除外チェック（新規追加） =====
    const shouldExcludeOutfit = checkNSFWOutfitExclusion();
    
    // 既存の基本情報取得関数が利用可能な場合のみ実行
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
    
    if (typeof getOne === 'function') {
      const hairStyle = getOne('hairStyle');
      const eyeShape = getOne('eyeShape');
      const hairLength = getOne('hairLength');
      const bangsStyle = getOne('bangsStyle');
      const skinFeatures = getOne('skinFeatures');
      if (hairStyle) tags.push(hairStyle);
      if (eyeShape) tags.push(eyeShape);
      if (hairLength) tags.push(hairLength);
      if (bangsStyle) tags.push(bangsStyle);
      if (skinFeatures) tags.push(skinFeatures);
    }
    
    // 色タグ（基本情報タブの色ピッカーから）
    const textOf = id => {
      const element = document.getElementById(id);
      return element ? (element.textContent || "").trim() : "";
    };
    
    const hairColor = textOf('tagH');
    const eyeColor = textOf('tagE');
    const skinColor = textOf('tagSkin');
    if (hairColor) tags.push(hairColor);
    if (eyeColor) tags.push(eyeColor);
    if (skinColor) tags.push(skinColor);
    
    // ★★★ 【修正】基本情報のアクセサリー処理 ★★★
    const charAccSel = document.getElementById("characterAccessory");
    const charAccColor = window.getCharAccColor ? window.getCharAccColor() : "";
    if (charAccSel && charAccSel.value) {
      if (charAccColor && charAccColor !== "—") {
        tags.push(`${charAccColor} ${charAccSel.value}`);
      } else {
        tags.push(charAccSel.value);
      }
    }
    
    // ★★★ 【条件分岐】服装タグの追加 ★★★
    if (shouldExcludeOutfit) {
      //console.log('🚫 NSFW設定により基本情報の服装をスキップ');
    } else {
      // 服装（基本情報タブの設定から）
      addSelectedValuesSafe(tags, 'mangaExpressions'); 
    }
    
  } catch (error) {
    //console.error('基本情報タグ追加エラー:', error);
  }
}


// 🆕 新規関数: NSFW服装除外チェック
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
         // console.log(`🔍 ${categoryId} で選択項目を検出 - 基本情報服装を除外`);
          return true;
        }
      }
    }
  }
  
  return false;
}


// 既存関数との互換性のため
function addBasicInfoTags(tags) {
  return addBasicInfoTagsSafe(tags);
}


// 🔥 修正2: addBasicOutfitTagsSafe関数（デバッグログ追加版）
function addBasicOutfitTagsSafe(tags) {
  try {
    // 既存の関数が利用可能な場合のみ実行
    if (typeof getIsOnepiece !== 'function' || typeof getOne !== 'function') {
      //console.log('⚠️ 基本情報取得関数が利用不可 - 服装タグスキップ');
      return;
    }
    
    //console.log('👔 基本情報の服装タグを追加中...');
    
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
          tags.push(`${topColor} ${dress}`);
         // console.log(`✅ ワンピース追加: ${topColor} ${dress}`);
        } else {
          tags.push(dress);
         // console.log(`✅ ワンピース追加: ${dress}`);
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
          tags.push(`${topColor} ${top}`);
         // console.log(`✅ トップス追加: ${topColor} ${top}`);
        } else {
          tags.push(top);
         // console.log(`✅ トップス追加: ${top}`);
        }
      }
      
      if (bottomCat === 'pants' && pants) {
        const bottomColor = textOf('tag_bottom');
        if (bottomColor) {
          tags.push(`${bottomColor} ${pants}`);
         // console.log(`✅ パンツ追加: ${bottomColor} ${pants}`);
        } else {
          tags.push(pants);
        //  console.log(`✅ パンツ追加: ${pants}`);
        }
      } else if (bottomCat === 'skirt' && skirt) {
        const bottomColor = textOf('tag_bottom');
        if (bottomColor) {
          tags.push(`${bottomColor} ${skirt}`);
        //  console.log(`✅ スカート追加: ${bottomColor} ${skirt}`);
        } else {
          tags.push(skirt);
        //  console.log(`✅ スカート追加: ${skirt}`);
        }
      }
      
      if (shoes) {
        const shoeColor = textOf('tag_shoes');
        if (shoeColor) {
          tags.push(`${shoeColor} ${shoes}`);
       //   console.log(`✅ 靴追加: ${shoeColor} ${shoes}`);
        } else {
          tags.push(shoes);
         // console.log(`✅ 靴追加: ${shoes}`);
        }
      }
    }
    
  } catch (error) {
   // console.error('基本服装タグ追加エラー:', error);
  }
}

// 🆕 デバッグ用グローバル関数
window.debugNSFWOutfitExclusion = function() {
//  console.log('=== NSFW服装除外デバッグ ===');
  
  const nsfwEnabled = document.getElementById('mangaNSFWEnable')?.checked;
//  console.log('NSFW有効:', nsfwEnabled);
  
  const categories = [
    'mangaNSFWExpo',
    'mangaNSFWOutfit', 
    'mangaNSFWUnderwear'
  ];
  
  categories.forEach(categoryId => {
    const container = document.getElementById(categoryId);
    if (container) {
      const selected = container.querySelectorAll('input:checked');
      const values = Array.from(selected).map(inp => inp.value).filter(Boolean);
   //   console.log(`${categoryId}:`, values);
    } else {
    //  console.log(`${categoryId}: 要素なし`);
    }
  });
  
  const shouldExclude = checkNSFWOutfitExclusion();
 // console.log('除外判定:', shouldExclude);
  
  return shouldExclude;
};

// 🆕 テスト用関数
window.testMangaOutfitExclusion = function() {
//  console.log('=== 服装除外テスト実行 ===');
  
  // テスト前の状態
  const beforePrompt = generateMangaPrompt();
//  console.log('修正前プロンプト:', beforePrompt);
  
  // 除外判定
  const isExcluded = checkNSFWOutfitExclusion();
//  console.log('服装除外:', isExcluded);
  
  return {
    prompt: beforePrompt,
    excluded: isExcluded,
    hasOutfitTags: beforePrompt.includes('shirt') || beforePrompt.includes('dress') || beforePrompt.includes('pants')
  };
};

// 既存関数との互換性のため
function addBasicOutfitTags(tags) {
  return addBasicOutfitTagsSafe(tags);
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
    // ★★★ 以下3行を追加 ★★★
    addSelectedValues(tags, 'secondCharHairLength');
    addSelectedValues(tags, 'secondCharBangsStyle');
    addSelectedValues(tags, 'secondCharSkinFeatures');
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
  
  // 新しいカテゴリ別UI（改良版）が存在するかチェック
  const hasNewUI = document.getElementById('mangaNegEssential');
  
  if (hasNewUI) {
    // ========== 新しいカテゴリ別UI ========== 
    const containers = [
      'mangaNegEssential', 'mangaNegQuality', 'mangaNegUnwanted',
      'mangaNegFace', 'mangaNegBody', 'mangaNegStyle',
      'mangaNegComposition', 'mangaNegClothing'
    ];
    
    containers.forEach(containerId => {
      const container = document.getElementById(containerId);
      if (container) {
        const checkedInputs = container.querySelectorAll('input[type="checkbox"]:checked');
        checkedInputs.forEach(input => {
          if (input.value && input.value.trim()) {
            negatives.push(input.value.trim());
          }
        });
      }
    });
    
    // カスタム追記
    const custom = document.getElementById('mangaNegativeCustom')?.value?.trim();
    if (custom) {
      const customTags = custom.split(',').map(tag => tag.trim()).filter(Boolean);
      negatives.push(...customTags);
    }
    
  } else {
    // ========== 既存のUI（下位互換） ========== 
    // プリセット（既存のmangaNegativePreset）
    const presets = document.querySelectorAll('input[name="mangaNegativePreset"]:checked');
    presets.forEach(preset => {
      negatives.push(preset.value);
    });
    
    // カスタム（既存のmangaNegativeCustom）
    const custom = document.getElementById('mangaNegativeCustom')?.value?.trim();
    if (custom) {
      custom.split(',').forEach(tag => {
        const trimmed = tag.trim();
        if (trimmed) negatives.push(trimmed);
      });
    }
  }
  
  // 重複除去して返す
  const uniqueNegatives = [...new Set(negatives)];
  return uniqueNegatives.join(', ');
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
      //console.log('辞書データ確認:', {
      //  DEFAULT_SFW_DICT: !!window.DEFAULT_SFW_DICT,
      //  DEFAULT_NSFW_DICT: !!window.DEFAULT_NSFW_DICT,
      //  SFW: !!window.SFW,
      //  NSFW: !!window.NSFW
      //});
      initMangaMode();
    } else {
     // console.log('辞書データ待機中...', {
     //  DEFAULT_SFW_DICT: !!window.DEFAULT_SFW_DICT,
     //   DEFAULT_NSFW_DICT: !!window.DEFAULT_NSFW_DICT,
     //   SFW: !!window.SFW,
     //   NSFW: !!window.NSFW
     // });
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

// ========================================
// 新しいネガティブプロンプト機能追加
// ========================================

// ネガティブプロンプト関連の初期化
function initMangaNegativeSystem() {
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  if (!SFW) {
    populateDefaultNegativeOptions();
    setupNegativePresetListeners();
    setupNegativePreviewUpdate();
    return;
  }
  
  // カテゴリ別にネガティブプロンプトを設定
  populateNegativeByCategory();
  
  // クイックプリセットのイベントリスナー
  setupNegativePresetListeners();
  
  // リアルタイムプレビュー
  setupNegativePreviewUpdate();

}

// カテゴリ別のネガティブプロンプト設定
function populateNegativeByCategory() {
  const SFW = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
  if (!SFW?.negative_presets) {
    populateDefaultNegativeOptions();
    return;
  }
  
  const presets = SFW.negative_presets;
  
  // 必須カテゴリ（基本的な品質問題）
  const essentialItems = presets.filter(item => 
    ['bad hands', 'bad anatomy', 'blurry', 'low quality'].includes(item.tag)
  );
  populateCheckboxOptions('mangaNegEssential', essentialItems);
  
  // その他のカテゴリ
  const categoryMap = {
    'mangaNegQuality': 'image_quality',
    'mangaNegUnwanted': 'unwanted', 
    'mangaNegFace': 'face',
    'mangaNegBody': 'body',
    'mangaNegStyle': 'style',
    'mangaNegComposition': 'composition',
    'mangaNegClothing': 'clothing'
  };
  
  Object.entries(categoryMap).forEach(([elementId, category]) => {
    const items = presets.filter(item => item.category === category);
    populateCheckboxOptions(elementId, items);
  });
}

// デフォルトのネガティブオプション（辞書がない場合）
function populateDefaultNegativeOptions() {
  const defaultOptions = {
    mangaNegEssential: [
      { tag: "bad hands", label: "手の崩れ防止" },
      { tag: "bad anatomy", label: "解剖学的不正防止" },
      { tag: "blurry", label: "ぼやけ防止" },
      { tag: "low quality", label: "低品質防止" }
    ],
    mangaNegQuality: [
      { tag: "worst quality", label: "最低品質防止" },
      { tag: "jpeg artifacts", label: "JPEG劣化防止" },
      { tag: "pixelated", label: "ピクセル化防止" }
    ],
    mangaNegUnwanted: [
      { tag: "text", label: "テキスト除去" },
      { tag: "watermark", label: "透かし除去" },
      { tag: "signature", label: "署名除去" }
    ],
    mangaNegStyle: [
      { tag: "3D", label: "3D風防止" },
      { tag: "realistic", label: "リアル風防止" },
      { tag: "photorealistic", label: "写実的防止" }
    ]
  };
  
  Object.entries(defaultOptions).forEach(([elementId, items]) => {
    populateCheckboxOptions(elementId, items);
  });
}

// クイックプリセットのイベントリスナー設定
function setupNegativePresetListeners() {
  const presets = {
    light: ['bad hands', 'bad anatomy', 'blurry', 'low quality', 'text'],
    standard: ['bad hands', 'bad anatomy', 'extra fingers', 'deformed', 'blurry', 'low quality', 'worst quality', 'text', 'watermark'],
    high: ['bad hands', 'bad anatomy', 'extra fingers', 'deformed', 'mutated', 'blurry', 'low quality', 'worst quality', 'jpeg artifacts', 'text', 'watermark', 'bad face', 'bad eyes', 'extra limbs'],
    manga: ['bad hands', 'bad anatomy', 'blurry', 'low quality', 'text', '3D', 'realistic', 'photorealistic', 'bad composition']
  };
  
  // ボタンイベントの設定
  ['Light', 'Standard', 'High', 'Manga'].forEach(type => {
    const btn = document.getElementById(`negQuick${type}`);
    if (btn) {
      btn.addEventListener('click', () => {
        setNegativePreset(presets[type.toLowerCase()]);
        if (typeof toast === 'function') {
          toast(`${type === 'Light' ? '軽量' : type === 'Standard' ? '標準' : type === 'High' ? '高品質' : '漫画特化'}セットを適用`);
        }
      });
    }
  });
  
  // 全解除ボタン
  const clearBtn = document.getElementById('negClearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAllNegativeSelections();
      if (typeof toast === 'function') toast('すべての選択を解除');
    });
  }
}

// ネガティブプリセットの適用
function setNegativePreset(tags) {
  clearAllNegativeSelections();
  
  tags.forEach(tag => {
    // 漫画モード内のチェックボックスを対象に検索
    const checkbox = document.querySelector(`#panelManga input[type="checkbox"][value="${tag}"]`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
  
  updateNegativePreview();
  if (typeof updateMangaOutput === 'function') {
    updateMangaOutput();
  }
}

// すべてのネガティブ選択を解除
function clearAllNegativeSelections() {
  const containers = [
    'mangaNegEssential', 'mangaNegQuality', 'mangaNegUnwanted',
    'mangaNegFace', 'mangaNegBody', 'mangaNegStyle', 
    'mangaNegComposition', 'mangaNegClothing'
  ];
  
  containers.forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
    }
  });
  
  // カスタムテキストもクリア
  const customTextarea = document.getElementById('mangaNegativeCustom');
  if (customTextarea) customTextarea.value = '';
  
  updateNegativePreview();
}

// リアルタイムプレビューの設定
function setupNegativePreviewUpdate() {
  const containers = [
    'mangaNegEssential', 'mangaNegQuality', 'mangaNegUnwanted',
    'mangaNegFace', 'mangaNegBody', 'mangaNegStyle',
    'mangaNegComposition', 'mangaNegClothing'
  ];
  
  // 各コンテナの変更を監視
  containers.forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
      container.addEventListener('change', () => {
        updateNegativePreview();
        if (typeof updateMangaOutput === 'function') updateMangaOutput();
      });
    }
  });
  
  // カスタムテキストエリアも監視
  const customTextarea = document.getElementById('mangaNegativeCustom');
  if (customTextarea) {
    customTextarea.addEventListener('input', () => {
      updateNegativePreview();
      if (typeof updateMangaOutput === 'function') updateMangaOutput();
    });
  }
  
  // 初期プレビュー
  setTimeout(updateNegativePreview, 100);
}

// ネガティブプレビューの更新
function updateNegativePreview() {
  const negativeText = generateMangaNegative(); // 置き換えた関数を使用
  const previewElement = document.getElementById('negativePreview');
  
  if (previewElement) {
    if (negativeText.trim()) {
      previewElement.textContent = negativeText;
      previewElement.style.opacity = '1';
    } else {
      previewElement.textContent = '未選択';
      previewElement.style.opacity = '0.6';
    }
  }
}

// 既存の初期化システムに統合
const originalSetupMangaEventListeners = window.setupMangaEventListeners;
window.setupMangaEventListeners = function() {
  // 既存の処理を実行
  if (originalSetupMangaEventListeners) {
    originalSetupMangaEventListeners();
  }
  
  // ネガティブプロンプト機能を追加
  setTimeout(() => {
    if (document.getElementById('mangaNegEssential')) {
      initMangaNegativeSystem();
    }
  }, 200);
};

// フォールバック初期化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('mangaNegEssential') && !window.mangaNegativeInitialized) {
      window.mangaNegativeInitialized = true;
      initMangaNegativeSystem();
    }
  }, 1500);
});


<!-- ================================ -->
<!-- JavaScript追加コード -->
<!-- ================================ -->
// manga-mode.jsに追加する関数群

// カテゴリ名のマッピング（日本語表示用）
const MANGA_CATEGORY_NAMES = {
  'mangaEmotionPrimary': '基本感情',
  'mangaEmotionDetail': '詳細感情',
  'mangaExpressions': '表情（SFW）',
  'mangaEffectManga': '補助表情',
  'mangaEyeState': '目の状態',
  'mangaGaze': '視線方向',
  'mangaMouthState': '口の状態',
  'mangaPose': 'ポーズ',
  'mangaHandGesture': '手のジェスチャー',
  'mangaMovementAction': '動作',
  'mangaComposition': '構図',
  'mangaView': '体の向き',
  'mangaCameraView': 'カメラワーク',
  'mangaPropsLight': '小物',
  'mangaEffectMangaFX': '効果演出',
  'mangaBackground': '背景',
  'mangaLighting': 'ライティング',
  'mangaArtStyle': '画風',
  'mangaNSFWExpr': 'NSFW表情',
  'mangaNSFWExpo': '露出度',
  'mangaNSFWSitu': 'シチュエーション',
  'mangaNSFWLight': 'NSFWライティング',
  'mangaNSFWPose': 'NSFWポーズ',
  'mangaNSFWAction': 'NSFWアクション',
  'mangaNSFWAction2': '射精・体液系',
  'mangaNSFWAcc': 'NSFWアクセサリー',
  'mangaNSFWOutfit': 'NSFW衣装',
  'mangaNSFWBody': '身体特徴',
  'mangaNSFWNipples': '乳首表現',
  'mangaNSFWUnderwear': '下着状態',
  'mangaNSFWParticipants': '人数・構成',
  // 🆕 新規追加項目
  'mangaRelationship': '関係性・相互作用',
  'mangaPhysicalState': '身体状態・体調',
  'mangaOccupation': '職業・役職',
  'mangaSeasonWeather': '季節・天候',
  'mangaNSFWInteraction': 'NSFWインタラクション',
  'mangaNSFWBackground': 'NSFW背景',
  'mangaNSFWEmotion': 'NSFW感情'
};



<!-- ================================ -->
<!-- JavaScript追加コード -->
<!-- ================================ -->
// manga-mode.jsに追加する関数群

// 漫画モード検索機能の初期化
function initMangaSearchSystem() {
  const searchInput = document.getElementById('manga-search-input');
  const clearBtn = document.getElementById('manga-search-clear');
  const resultsArea = document.getElementById('manga-search-results');
  const resultsClose = document.getElementById('manga-results-close');
  
  if (!searchInput || !clearBtn || !resultsArea) {
    return;
  }
  
  // 検索イベントのバインド
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim();
    if (searchTerm) {
      performMangaSearch(searchTerm);
      showMangaSearchResults();
    } else {
      hideMangaSearchResults();
    }
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const searchTerm = e.target.value.trim();
      if (searchTerm) {
        performMangaSearch(searchTerm);
        showMangaSearchResults();
      }
    }
  });
  
  clearBtn.addEventListener('click', clearMangaSearch);
  resultsClose.addEventListener('click', hideMangaSearchResults);
  
  // 初期統計表示
  setTimeout(updateMangaSearchStats, 100);

}


// 検索結果表示
function showMangaSearchResults() {
  const resultsArea = document.getElementById('manga-search-results');
  if (resultsArea) {
    resultsArea.style.display = 'block';
  }
}


// 検索結果非表示
function hideMangaSearchResults() {
  const resultsArea = document.getElementById('manga-search-results');
  if (resultsArea) {
    resultsArea.style.display = 'none';
  }
}



// 漫画モード検索実行（結果表示版）
function performMangaSearch(searchTerm) {
  const mangaPanel = document.getElementById('panelManga');
  if (!mangaPanel) return;
  
  const results = [];
  const search = searchTerm.toLowerCase();
  
  // 全ての選択肢を検索
  const allContainers = mangaPanel.querySelectorAll('[id^="manga"], [id^="secondChar"]');
  
  allContainers.forEach(container => {
    const containerId = container.id;
    const categoryName = MANGA_CATEGORY_NAMES[containerId] || containerId;
    
    const chips = container.querySelectorAll('.chip');
    chips.forEach(chip => {
      const input = chip.querySelector('input');
      const text = (chip.textContent || '').toLowerCase();
      
      if (text.includes(search) && input) {
        const labelText = chip.textContent.replace(/\s+/g, ' ').trim();
        const inputValue = input.value;
        
        results.push({
          containerId,
          categoryName,
          labelText,
          inputValue,
          inputType: input.type,
          inputName: input.name,
          element: input,
          chip: chip
        });
      }
    });
  });
  
  displayMangaSearchResults(results, searchTerm);
  updateMangaSearchStats(results.length, null);
  
}

// 検索結果の表示
function displayMangaSearchResults(results, searchTerm) {
  const resultsContent = document.getElementById('manga-search-results-content');
  const resultsCount = document.getElementById('manga-results-count');
  
  if (!resultsContent || !resultsCount) return;
  
  resultsCount.textContent = results.length;
  
  if (results.length === 0) {
    resultsContent.innerHTML = '<div class="manga-no-results">検索結果がありません</div>';
    return;
  }
  
  // 検索結果をカテゴリごとにグループ化
  const groupedResults = {};
  results.forEach(result => {
    if (!groupedResults[result.categoryName]) {
      groupedResults[result.categoryName] = [];
    }
    groupedResults[result.categoryName].push(result);
  });
  
  let html = '';
  Object.entries(groupedResults).forEach(([categoryName, categoryResults]) => {
    html += `<div class="manga-result-category">
      <div class="manga-result-category-title">${categoryName} (${categoryResults.length}件)</div>`;
    
    categoryResults.forEach(result => {
      const isChecked = result.element.checked ? 'selected' : '';
      const highlightedText = highlightSearchTerm(result.labelText, searchTerm);
      
      html += `
        <div class="manga-result-item ${isChecked}" data-container-id="${result.containerId}" data-input-value="${result.inputValue}">
          <input type="${result.inputType}" ${result.element.checked ? 'checked' : ''} data-original-element="true">
          <div class="manga-result-item-label">
            <div class="manga-result-item-main">${highlightedText}</div>
            <div class="manga-result-item-tag">${result.inputValue}</div>
          </div>
        </div>`;
    });
    
    html += '</div>';
  });
  
  resultsContent.innerHTML = html;
  
  // 検索結果のクリックイベントをバインド
  bindMangaSearchResultEvents();
}

// 検索結果のイベントバインド（修正版）
function bindMangaSearchResultEvents() {
  const resultsContent = document.getElementById('manga-search-results-content');
  if (!resultsContent) return;
  
  resultsContent.addEventListener('click', (e) => {
    const resultItem = e.target.closest('.manga-result-item');
    if (!resultItem) return;
    
    // クリックが検索結果の入力要素自体の場合は処理をスキップ
    if (e.target.tagName === 'INPUT') return;
    
    const containerId = resultItem.dataset.containerId;
    const inputValue = resultItem.dataset.inputValue;
    const container = document.getElementById(containerId);
    
    if (!container) return;
    
    // 元の入力要素を見つけて操作
    const originalInput = container.querySelector(`input[value="${inputValue}"]`);
    if (!originalInput) return;
    
    // ラジオボタンの場合は他を未選択に
    if (originalInput.type === 'radio') {
      const radioGroup = container.querySelectorAll(`input[name="${originalInput.name}"]`);
      radioGroup.forEach(radio => {
        radio.checked = false;
        radio.closest('.chip')?.classList.remove('selected');
      });
      
      // 選択状態に設定
      originalInput.checked = true;
      originalInput.closest('.chip')?.classList.add('selected');
      
      // 検索結果の表示も更新（ラジオボタンの場合は同じname全てを更新）
      const allResultRadios = resultsContent.querySelectorAll(`input[type="radio"]`);
      allResultRadios.forEach(radio => {
        const parentItem = radio.closest('.manga-result-item');
        if (parentItem && parentItem.dataset.containerId === containerId) {
          const isSelected = (parentItem.dataset.inputValue === inputValue);
          radio.checked = isSelected;
          parentItem.classList.toggle('selected', isSelected);
        }
      });
      
    } else if (originalInput.type === 'checkbox') {
      // チェックボックスの場合は切り替え
      originalInput.checked = !originalInput.checked;
      originalInput.closest('.chip')?.classList.toggle('selected', originalInput.checked);
      
      // 検索結果の表示も更新
      resultItem.classList.toggle('selected', originalInput.checked);
      const resultInput = resultItem.querySelector('input[type="checkbox"]');
      if (resultInput) resultInput.checked = originalInput.checked;
    }
    
    // changeイベントを手動で発火（リアルタイム更新のため）
    originalInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      setTimeout(updateMangaOutput, 10);
    }
    
  });
  
  // 検索結果内の入力要素への直接クリックも処理
  resultsContent.addEventListener('change', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    
    const resultItem = e.target.closest('.manga-result-item');
    if (!resultItem) return;
    
    const containerId = resultItem.dataset.containerId;
    const inputValue = resultItem.dataset.inputValue;
    const container = document.getElementById(containerId);
    
    if (!container) return;
    
    const originalInput = container.querySelector(`input[value="${inputValue}"]`);
    if (!originalInput) return;
    
    // 検索結果の入力状態を元の入力に反映
    if (originalInput.type === 'radio' && e.target.checked) {
      // ラジオボタンの場合は他を未選択に
      const radioGroup = container.querySelectorAll(`input[name="${originalInput.name}"]`);
      radioGroup.forEach(radio => {
        radio.checked = false;
        radio.closest('.chip')?.classList.remove('selected');
      });
      
      originalInput.checked = true;
      originalInput.closest('.chip')?.classList.add('selected');
      
      // 検索結果内の同じグループも更新
      const allResultRadios = resultsContent.querySelectorAll(`input[type="radio"]`);
      allResultRadios.forEach(radio => {
        const parentItem = radio.closest('.manga-result-item');
        if (parentItem && parentItem.dataset.containerId === containerId) {
          const isSelected = (parentItem.dataset.inputValue === inputValue);
          radio.checked = isSelected;
          parentItem.classList.toggle('selected', isSelected);
        }
      });
      
    } else if (originalInput.type === 'checkbox') {
      originalInput.checked = e.target.checked;
      originalInput.closest('.chip')?.classList.toggle('selected', originalInput.checked);
      resultItem.classList.toggle('selected', originalInput.checked);
    }
    
    // changeイベントを手動で発火
    originalInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      setTimeout(updateMangaOutput, 10);
    }
    
  });
}

// 漫画モード検索クリア
function clearMangaSearch() {
  const searchInput = document.getElementById('manga-search-input');
  if (searchInput) {
    searchInput.value = '';
    hideMangaSearchResults();
    updateMangaSearchStats();
  }
}


// 検索語をハイライト
function highlightSearchTerm(text, searchTerm) {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<span class="manga-search-highlight">$1</span>');
}



// カテゴリセクションの状態更新
function updateMangaCategorySections() {
  const mangaPanel = document.getElementById('panelManga');
  if (!mangaPanel) return;
  
  // 各カテゴリセクションをチェック
  const sections = mangaPanel.querySelectorAll('.manga-params-section');
  sections.forEach(section => {
    const visibleItems = section.querySelectorAll('.chip:not(.manga-hidden)');
    section.classList.toggle('manga-section-empty', visibleItems.length === 0);
  });
}

// 漫画モード検索統計更新
function updateMangaSearchStats(visible = null, total = null) {
  const statsElement = document.getElementById('manga-search-stats');
  const totalCountElement = document.getElementById('manga-total-count');
  
  if (!statsElement || !totalCountElement) return;
  
  if (total === null) {
    const mangaPanel = document.getElementById('panelManga');
    if (mangaPanel) {
      const allItems = mangaPanel.querySelectorAll('.chip');
      total = allItems.length;
    } else {
      total = 0;
    }
  }
  
  totalCountElement.textContent = total;
  
  if (visible !== null) {
    statsElement.innerHTML = `検索: ${visible}件 / 全 ${total}件`;
    if (visible < total) {
      statsElement.style.color = 'var(--accent-warn)';
    } else {
      statsElement.style.color = 'var(--text-muted)';
    }
  } else {
    statsElement.innerHTML = `全 ${total}件`;
    statsElement.style.color = 'var(--text-muted)';
  }
}

// 漫画モード検索機能をグローバルに公開
window.performMangaSearch = performMangaSearch;
window.clearMangaSearch = clearMangaSearch;
