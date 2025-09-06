// 修正版NSFW プリセット（実際のDOM値に基づく）
const MANGA_NSFW_PRESETS = {
  // 💕 ロマンチック・甘い系
  romantic_sweet: {
    name: "💕 ロマンチック",
    description: "甘いロマンチックなムード",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bashful_smile",
      mangaNSFWExpo: "mild_cleavage",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "softbox",
      mangaNSFWPose: "sitting",
      mangaComposition: "upper_body"
    }
  },

  romantic_intimate: {
    name: "💖 親密・密着",
    description: "親密で密着したシチュエーション",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bedroom_eyes",
      mangaNSFWExpo: "see_through",
      mangaNSFWSitu: "in_bed_sheets",
      mangaNSFWLight: "window_glow",
      mangaNSFWPose: "lying_down",
      mangaComposition: "upper_body"
    }
  },

  // 🛁 お風呂・水着系
  bath_shower: {
    name: "🛁 バスタイム",
    description: "入浴後の色っぽいシーン",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "flushed",
      mangaNSFWExpo: "wet_clothes",
      mangaNSFWSitu: "after_shower",
      mangaNSFWLight: "softbox",
      mangaNSFWPose: "standing",
      mangaNSFWUnderwear: "lingerie_white",
      mangaComposition: "upper_body"
    }
  },

  swimsuit_beach: {
    name: "🏖️ 水着・ビーチ",
    description: "水着でのビーチシーン",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "shy_smile",
      mangaNSFWExpo: "leggy",
      mangaNSFWSitu: "beach",
      mangaNSFWLight: "golden_hour",
      mangaNSFWPose: "standing",
      mangaNSFWOutfit: "bikini",
      mangaComposition: "upper_body"
    }
  },

  // 🌙 夜・ベッドルーム系
  bedroom_night: {
    name: "🌙 ベッドルーム",
    description: "夜のベッドルームシーン",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "seductive_smile",
      mangaNSFWExpo: "cleavage_window",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "moody_bedroom",
      mangaNSFWPose: "lying_down",
      mangaNSFWUnderwear: "lingerie_black",
      mangaComposition: "upper_body"
    }
  },

  sleepwear_night: {
    name: "🌃 ナイトウェア",
    description: "夜のパジャマ・ナイトウェア",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bashful_smile",
      mangaNSFWExpo: "see_through",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "candlelight",
      mangaNSFWPose: "sitting",
      mangaNSFWOutfit: "negligee",
      mangaComposition: "upper_body"
    }
  },

  // 💄 セクシー・グラマラス系
  glamorous_pose: {
    name: "💄 グラマラス",
    description: "セクシーでグラマラスなポーズ",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "smirk",
      mangaNSFWExpo: "cleavage_window",
      mangaNSFWSitu: "stage_performance",
      mangaNSFWLight: "spotlight",
      mangaNSFWPose: "arched_back",
      mangaNSFWOutfit: "stripper_outfit",
      mangaComposition: "upper_body"
    }
  },

  pinup_style: {
    name: "📸 ピンナップ",
    description: "ピンナップ風のポーズ",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "wink",
      mangaNSFWExpo: "leggy",
      mangaNSFWSitu: "mirror_selfie",
      mangaNSFWLight: "rim_light",
      mangaNSFWPose: "hand_on_hips",
      mangaNSFWOutfit: "bikini",
      mangaComposition: "upper_body"
    }
  },

  // 🎭 コスプレ・制服系
  school_after: {
    name: "🏫 放課後",
    description: "放課後の学校での色っぽいシーン",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "embarrassed",
      mangaNSFWExpo: "short_skirt",
      mangaNSFWSitu: "classroom",
      mangaNSFWLight: "window_glow",
      mangaNSFWPose: "sitting",
      mangaNSFWOutfit: "sailor_uniform_r18",
      mangaComposition: "upper_body"
    }
  },

  cosplay_maid: {
    name: "🎀 メイドコス",
    description: "メイドコスプレでの奉仕シーン",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bashful_smile",
      mangaNSFWExpo: "mild_cleavage",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "softbox",
      mangaNSFWPose: "kneeling",
      mangaNSFWOutfit: "maid_outfit",
      mangaComposition: "upper_body"
    }
  },

  // 🌸 ソフト・かわいい系
  cute_innocent: {
    name: "🌸 初心・純真",
    description: "初心でかわいいシチュエーション",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bashful_smile",
      mangaNSFWExpo: "mild_cleavage",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "softbox",
      mangaNSFWPose: "sitting",
      mangaNSFWUnderwear: "lingerie_white",
      mangaComposition: "upper_body"
    }
  }
};
// NSFWプリセット用HTML生成
function generateNSFWPresetHTML() {
  return `
<div class="manga-presets-nsfw">
  <h4>🔞 NSFWプリセット（シチュエーション別）</h4>
  
  <div class="preset-section">
    <h5>💕 ロマンス系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l1" data-preset="romantic_sweet">💕 ロマンチック</button>
      <button class="btn preset-btn nsfw-l2" data-preset="romantic_intimate">💖 親密・密着</button>
    </div>
  </div>
  
  <div class="preset-section">
    <h5>🛁 お風呂・水着系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l1" data-preset="bath_shower">🛁 バスタイム</button>
      <button class="btn preset-btn nsfw-l1" data-preset="swimsuit_beach">🏖️ 水着・ビーチ</button>
    </div>
  </div>
  
  <div class="preset-section">
    <h5>🌙 ナイト系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l2" data-preset="bedroom_night">🌙 ベッドルーム</button>
      <button class="btn preset-btn nsfw-l1" data-preset="sleepwear_night">🌃 ナイトウェア</button>
    </div>
  </div>
  
  <div class="preset-section">
    <h5>💄 グラマラス系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l2" data-preset="glamorous_pose">💄 グラマラス</button>
      <button class="btn preset-btn nsfw-l2" data-preset="pinup_style">📸 ピンナップ</button>
    </div>
  </div>
  
  <div class="preset-section">
    <h5>🎭 コスプレ・制服系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l1" data-preset="school_after">🏫 放課後</button>
      <button class="btn preset-btn nsfw-l2" data-preset="cosplay_maid">🎀 メイドコス</button>
    </div>
  </div>
  
  <div class="preset-section">
    <h5>🌸 ソフト・かわいい系</h5>
    <div class="preset-buttons">
      <button class="btn preset-btn nsfw-l1" data-preset="cute_innocent">🌸 初心・純真</button>
    </div>
  </div>
  
  <div class="preset-info">
    <p><strong>選択中:</strong> <span id="currentNSFWPreset">なし</span></p>
    <p class="preset-description" id="currentNSFWDescription">プリセットを選択してください</p>
    <p class="preset-level" id="currentNSFWLevel"></p>
  </div>
  
  <style>
    .nsfw-l1 { border-left: 3px solid #ffeb3b; }
    .nsfw-l2 { border-left: 3px solid #ff9800; }
    .nsfw-l3 { border-left: 3px solid #f44336; }
    .preset-level { font-size: 12px; color: #666; }
  </style>
</div>
  `;
}

// ========================================
// manga-nsfw-presets.js 修正版 - 既存コードを置き換え
// ========================================

// 🔥 修正: applyNSFWPreset関数を置き換え（約250行目付近）
function applyNSFWPreset(presetId) {
  const preset = MANGA_NSFW_PRESETS[presetId];
  if (!preset) {
    console.error(`NSFWプリセットが見つかりません: ${presetId}`);
    return false; // エラーハンドリング改善
  }
  
  console.log(`🔞 NSFWプリセット適用: ${preset.name} (${preset.level})`);
  
  // 既存の選択を全てクリア
  if (typeof clearAllMangaSelections === 'function') {
    clearAllMangaSelections();
  }
  
  // NSFWを有効化
  const nsfwToggle = document.getElementById('mangaNSFWEnable');
  if (nsfwToggle) {
    nsfwToggle.checked = true;
    if (typeof toggleMangaNSFWPanel === 'function') {
      toggleMangaNSFWPanel();
    }
  } else {
    console.warn('⚠️ mangaNSFWEnable要素が見つかりません');
  }
  
  // プリセット設定を適用
  let appliedCount = 0;
  Object.entries(preset.settings).forEach(([categoryId, value]) => {
    if (!value || categoryId === 'mangaNSFWEnable') return;
    
    const container = document.getElementById(categoryId);
    if (!container) {
      console.warn(`⚠️ NSFWカテゴリが見つかりません: ${categoryId}`);
      return;
    }
    
    const input = container.querySelector(`input[value="${value}"]`);
    if (input) {
      input.checked = true;
      appliedCount++;
      console.log(`✅ ${categoryId}: ${value}`);
    } else {
      console.warn(`⚠️ NSFW値が見つかりません: ${categoryId} = ${value}`);
    }
  });
  
  // UI更新（null チェック付き）
  const currentPresetElement = document.getElementById('currentNSFWPreset');
  const currentDescElement = document.getElementById('currentNSFWDescription');
  const currentLevelElement = document.getElementById('currentNSFWLevel');
  
  if (currentPresetElement) {
    currentPresetElement.textContent = preset.name;
  } else {
    console.warn('⚠️ currentNSFWPreset要素が見つかりません - HTMLに要素を追加してください');
  }
  
  if (currentDescElement) {
    currentDescElement.textContent = preset.description;
  } else {
    console.warn('⚠️ currentNSFWDescription要素が見つかりません - HTMLに要素を追加してください');
  }
  
  if (currentLevelElement) {
    currentLevelElement.textContent = `レベル: ${preset.level}`;
  } else {
    console.warn('⚠️ currentNSFWLevel要素が見つかりません - HTMLに要素を追加してください');
  }
  
  // プロンプト生成
  if (typeof updateMangaOutput === 'function') {
    updateMangaOutput();
  }
  
  if (typeof toast === 'function') {
    toast(`NSFWプリセット「${preset.name}」(${preset.level}) を適用しました (${appliedCount}項目)`);
  }
  
  return true; // 成功を示す
}

// NSFWイベントリスナー設定
function setupNSFWPresetListeners() {
  document.querySelectorAll('.preset-btn[data-preset]').forEach(button => {
    if (!button.classList.contains('nsfw-l1') && 
        !button.classList.contains('nsfw-l2') && 
        !button.classList.contains('nsfw-l3')) return;
        
    button.addEventListener('click', (e) => {
      const presetId = e.target.dataset.preset;
      applyNSFWPreset(presetId);
      
      // NSFWボタンの見た目更新
      document.querySelectorAll('.preset-btn[class*="nsfw-"]').forEach(btn => {
        btn.classList.remove('active');
      });
      e.target.classList.add('active');
    });
  });
}

// エクスポート
window.MANGA_NSFW_PRESETS = MANGA_NSFW_PRESETS;
window.applyNSFWPreset = applyNSFWPreset;
