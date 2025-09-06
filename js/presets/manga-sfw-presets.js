// 漫画モードSFWプリセット（感情別）
const MANGA_SFW_PRESETS = {
  // 😊 喜び・幸せ系
  joy_happy: {
    name: "😊 喜び・幸せ",
    description: "明るく楽しい表情とポーズ",
    settings: {
      mangaEmotionPrimary: "joy",
      mangaEmotionDetail: "delighted", 
      mangaExpressions: "bright_smile",
      mangaEyeState: "sparkling_eyes",
      mangaGaze: "at_viewer",
      mangaMouthState: "grin",
      mangaPose: "standing",
      mangaHandGesture: "peace_sign",
      mangaComposition: "upper_body"
    }
  },

  joy_cheerful: {
    name: "🌟 陽気・元気",
    description: "エネルギッシュで活発な印象",
    settings: {
      mangaEmotionPrimary: "joy",
      mangaEmotionDetail: "cheerful",
      mangaExpressions: "smiling_open_mouth",
      mangaEyeState: "eyes_open", 
      mangaGaze: "at_viewer",
      mangaMouthState: "wide_open_mouth",
      mangaPose: "jumping",
      mangaHandGesture: "raised_fist",
      mangaMovementAction: "arm_swing",
      mangaComposition: "full_body"
    }
  },

  // 😢 悲しみ系
  sad_gentle: {
    name: "😢 悲しみ・憂い",
    description: "しっとりとした悲しい表情",
    settings: {
      mangaEmotionPrimary: "sadness",
      mangaEmotionDetail: "tearful",
      mangaExpressions: "teary_eyes",
      mangaEyeState: "teary",
      mangaGaze: "down",
      mangaMouthState: "slight_open_mouth",
      mangaPose: "sitting",
      mangaHandGesture: "wiping_tears",
      mangaComposition: "bust"
    }
  },

  sad_crying: {
    name: "😭 泣き顔",
    description: "涙を流している表情",
    settings: {
      mangaEmotionPrimary: "sadness", 
      mangaEmotionDetail: "sobbing",
      mangaExpressions: "crying",
      mangaEyeState: "teary_filled_eyes",
      mangaGaze: "downcast_glance",
      mangaMouthState: "open_mouth",
      mangaPose: "kneeling",
      mangaHandGesture: "covering_eyes",
      mangaEffectManga: "teardrops",
      mangaComposition: "upper_body"
    }
  },

  // 😠 怒り系
  anger_mild: {
    name: "😤 むすっ・不機嫌",
    description: "軽い怒りやむくれた表情",
    settings: {
      mangaEmotionPrimary: "anger",
      mangaEmotionDetail: "annoyed", 
      mangaExpressions: "pouting",
      mangaEyeState: "narrowed_eyes",
      mangaGaze: "away",
      mangaMouthState: "pouting_mouth",
      mangaPose: "standing",
      mangaHandGesture: "arms_crossed",
      mangaComposition: "upper_body"
    }
  },

  anger_fury: {
    name: "😡 激怒・怒り",
    description: "激しい怒りの表情とポーズ",
    settings: {
      mangaEmotionPrimary: "anger",
      mangaEmotionDetail: "furious",
      mangaExpressions: "furious", 
      mangaEyeState: "angry_vein_eyes",
      mangaGaze: "glaring",
      mangaMouthState: "teeth_grit",
      mangaPose: "standing",
      mangaHandGesture: "clenched_fist",
      mangaEffectManga: "anger_mark",
      mangaComposition: "upper_body"
    }
  },

  // 😳 恥ずかしがり系
  embarrassed_shy: {
    name: "😊 恥ずかしがり",
    description: "はにかみながら照れている",
    settings: {
      mangaEmotionPrimary: "embarrassment",
      mangaEmotionDetail: "bashful",
      mangaExpressions: "embarrassed_face",
      mangaEyeState: "shy_hidden_eyes",
      mangaGaze: "averted_quick", 
      mangaMouthState: "slight_smile",
      mangaPose: "standing",
      mangaHandGesture: "hands_on_cheeks",
      mangaEffectManga: "blush",
      mangaComposition: "bust"
    }
  },

  embarrassed_blush: {
    name: "😳 赤面・照れ",
    description: "顔を真っ赤にして照れる",
    settings: {
      mangaEmotionPrimary: "embarrassment",
      mangaEmotionDetail: "bashful",
      mangaExpressions: "blushing",
      mangaEyeState: "eyes_half_closed",
      mangaGaze: "side_glance_shy",
      mangaMouthState: "mouth_closed",
      mangaPose: "standing", 
      mangaHandGesture: "hands_on_cheeks",
      mangaEffectManga: "blush",
      mangaComposition: "portrait"
    }
  },

  // 😴 眠気・のんびり系
  sleepy_tired: {
    name: "😴 眠気・のんびり",
    description: "眠そうでのんびりした雰囲気",
    settings: {
      mangaEmotionPrimary: "sleepiness",
      mangaEmotionDetail: "",
      mangaExpressions: "sleepy_eyes",
      mangaEyeState: "sleepy_drowsy_eyes",
      mangaGaze: "half_closed_down",
      mangaMouthState: "yawning",
      mangaPose: "stretching",
      mangaHandGesture: "hands_on_head",
      mangaEffectManga: "zzz_sleep",
      mangaComposition: "upper_body"
    }
  },

  // 😲 驚き系
  surprised_shock: {
    name: "😲 驚き・ショック",
    description: "大きく驚いた表情",
    settings: {
      mangaEmotionPrimary: "surprise",
      mangaEmotionDetail: "shocked",
      mangaExpressions: "surprised",
      mangaEyeState: "widened_eyes",
      mangaGaze: "at_viewer",
      mangaMouthState: "surprised_o",
      mangaPose: "stumbling",
      mangaHandGesture: "hands_on_head",
      mangaEffectManga: "surprise_mark",
      mangaComposition: "upper_body"
    }
  },

  // 😌 穏やか・安らぎ系
  calm_peaceful: {
    name: "😌 穏やか・安らぎ",
    description: "落ち着いた穏やかな表情",
    settings: {
      mangaEmotionPrimary: "calm",
      mangaEmotionDetail: "relieved",
      mangaExpressions: "soft_smile",
      mangaEyeState: "eyes_half_closed",
      mangaGaze: "gentle_down",
      mangaMouthState: "slight_smile",
      mangaPose: "sitting",
      mangaHandGesture: "hands_together_chest",
      mangaComposition: "bust"
    }
  }
};

// SFWプリセット用HTML生成
function generateSFWPresetHTML() {
  return `
<div class="manga-presets-sfw">
  <h4>🎭 SFWプリセット（感情別）</h4>
  <div class="preset-buttons">
    <button class="btn preset-btn" data-preset="joy_happy">😊 喜び・幸せ</button>
    <button class="btn preset-btn" data-preset="joy_cheerful">🌟 陽気・元気</button>
    <button class="btn preset-btn" data-preset="sad_gentle">😢 悲しみ・憂い</button>
    <button class="btn preset-btn" data-preset="sad_crying">😭 泣き顔</button>
    <button class="btn preset-btn" data-preset="anger_mild">😤 むすっ・不機嫌</button>
    <button class="btn preset-btn" data-preset="anger_fury">😡 激怒・怒り</button>
    <button class="btn preset-btn" data-preset="embarrassed_shy">😊 恥ずかしがり</button>
    <button class="btn preset-btn" data-preset="embarrassed_blush">😳 赤面・照れ</button>
    <button class="btn preset-btn" data-preset="sleepy_tired">😴 眠気・のんびり</button>
    <button class="btn preset-btn" data-preset="surprised_shock">😲 驚き・ショック</button>
    <button class="btn preset-btn" data-preset="calm_peaceful">😌 穏やか・安らぎ</button>
  </div>
  
  <div class="preset-info">
    <p><strong>選択中:</strong> <span id="currentSFWPreset">なし</span></p>
    <p class="preset-description" id="currentSFWDescription">プリセットを選択してください</p>
  </div>
</div>
  `;
}

// ========================================
// manga-sfw-presets.js 修正版 - 既存コードを置き換え
// ========================================

// 🔥 修正: applySFWPreset関数を置き換え（約220行目付近）
function applySFWPreset(presetId) {
  const preset = MANGA_SFW_PRESETS[presetId];
  if (!preset) {
    console.error(`SFWプリセットが見つかりません: ${presetId}`);
    return false; // エラーハンドリング改善
  }
  
  console.log(`🎭 SFWプリセット適用: ${preset.name}`);
  
  // 既存の選択を全てクリア
  clearAllMangaSelections();
  
  // プリセット設定を適用
  let appliedCount = 0;
  Object.entries(preset.settings).forEach(([categoryId, value]) => {
    if (!value) return;
    
    const container = document.getElementById(categoryId);
    if (!container) {
      console.warn(`⚠️ カテゴリが見つかりません: ${categoryId}`);
      return;
    }
    
    const input = container.querySelector(`input[value="${value}"]`);
    if (input) {
      input.checked = true;
      appliedCount++;
      console.log(`✅ ${categoryId}: ${value}`);
    } else {
      console.warn(`⚠️ 値が見つかりません: ${categoryId} = ${value}`);
    }
  });
  
  // UI更新（null チェック付き）
  const currentPresetElement = document.getElementById('currentSFWPreset');
  const currentDescElement = document.getElementById('currentSFWDescription');
  
  if (currentPresetElement) {
    currentPresetElement.textContent = preset.name;
  } else {
    console.warn('⚠️ currentSFWPreset要素が見つかりません - HTMLに要素を追加してください');
  }
  
  if (currentDescElement) {
    currentDescElement.textContent = preset.description;
  } else {
    console.warn('⚠️ currentSFWDescription要素が見つかりません - HTMLに要素を追加してください');
  }
  
  // プロンプト生成
  if (typeof updateMangaOutput === 'function') {
    updateMangaOutput();
  }
  
  if (typeof toast === 'function') {
    toast(`SFWプリセット「${preset.name}」を適用しました (${appliedCount}項目)`);
  }
  
  return true; // 成功を示す
}

// 🔥 修正: clearAllMangaSelections関数を改善（約260行目付近）
function clearAllMangaSelections() {
  const categoryIds = [
    'mangaEmotionPrimary', 'mangaEmotionDetail', 'mangaExpressions',
    'mangaEyeState', 'mangaGaze', 'mangaMouthState', 'mangaPose',
    'mangaHandGesture', 'mangaMovementAction', 'mangaComposition',
    'mangaView', 'mangaCameraView', 'mangaPropsLight', 'mangaEffectManga',
    'mangaBackground', 'mangaLighting', 'mangaArtStyle',
    // NSFW要素も含める
    'mangaNSFWExpr', 'mangaNSFWExpo', 'mangaNSFWSitu', 'mangaNSFWLight',
    'mangaNSFWPose', 'mangaNSFWAction', 'mangaNSFWAcc', 'mangaNSFWOutfit',
    'mangaNSFWBody', 'mangaNSFWNipples', 'mangaNSFWUnderwear',
    'mangaNSFWParticipants', 'mangaNSFWAction2'
  ];
  
  let clearedCount = 0;
  categoryIds.forEach(categoryId => {
    const container = document.getElementById(categoryId);
    if (container) {
      container.querySelectorAll('input[type="radio"]').forEach(input => {
        if (input.checked) clearedCount++;
        input.checked = false;
      });
      container.querySelectorAll('input[type="checkbox"]').forEach(input => {
        if (input.checked) clearedCount++;
        input.checked = false;
      });
    } else {
      // 存在しない要素は警告を出さない（オプション要素の可能性）
      console.debug(`🔍 ${categoryId} 要素が見つかりません（オプション要素の可能性）`);
    }
  });
  
  console.log(`🗑️ ${clearedCount}個の選択をクリアしました`);
  return clearedCount;
}

// イベントリスナー設定
function setupSFWPresetListeners() {
  document.querySelectorAll('.preset-btn[data-preset]').forEach(button => {
    button.addEventListener('click', (e) => {
      const presetId = e.target.dataset.preset;
      applySFWPreset(presetId);
      
      // ボタンの見た目更新
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      e.target.classList.add('active');
    });
  });
}

// エクスポート
window.MANGA_SFW_PRESETS = MANGA_SFW_PRESETS;
window.applySFWPreset = applySFWPreset;
