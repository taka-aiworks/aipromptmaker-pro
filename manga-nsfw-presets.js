// 漫画モードNSFWプリセット（シチュエーション別）
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
      mangaNSFWPose: "lying_side",
      mangaComposition: "full_body"
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
      mangaNSFWExpo: "towel_wrap",
      mangaNSFWSitu: "after_shower",
      mangaNSFWLight: "soft_lighting",
      mangaNSFWPose: "standing",
      mangaNSFWUnderwear: "towel_only",
      mangaComposition: "full_body"
    }
  },

  swimsuit_beach: {
    name: "🏖️ 水着・ビーチ",
    description: "水着でのビーチシーン",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bright_smile",
      mangaNSFWExpo: "bikini_style",
      mangaNSFWSitu: "beach",
      mangaNSFWLight: "golden_hour",
      mangaNSFWPose: "standing",
      mangaNSFWOutfit: "bikini",
      mangaComposition: "full_body"
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
      mangaNSFWExpo: "lingerie_peek",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "moody_bedroom",
      mangaNSFWPose: "lying_supine",
      mangaNSFWUnderwear: "lingerie_black",
      mangaComposition: "full_body"
    }
  },

  sleepwear_night: {
    name: "🌃 ナイトウェア",
    description: "夜のパジャマ・ナイトウェア",
    level: "L1",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "sleepy_seductive",
      mangaNSFWExpo: "see_through_nightgown",
      mangaNSFWSitu: "bedroom",
      mangaNSFWLight: "moonlight",
      mangaNSFWPose: "sitting_edge",
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
      mangaNSFWOutfit: "glamour_dress",
      mangaComposition: "full_body"
    }
  },

  pinup_style: {
    name: "📸 ピンナップ",
    description: "ピンナップ風のポーズ",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "wink_smile",
      mangaNSFWExpo: "retro_style",
      mangaNSFWSitu: "photoshoot",
      mangaNSFWLight: "classic_studio",
      mangaNSFWPose: "pin_up_pose",
      mangaNSFWOutfit: "retro_lingerie",
      mangaComposition: "full_body"
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
      mangaNSFWExpo: "school_uniform_loose",
      mangaNSFWSitu: "classroom_after_school",
      mangaNSFWLight: "sunset_window",
      mangaNSFWPose: "sitting_desk",
      mangaNSFWOutfit: "school_uniform_disheveled",
      mangaComposition: "upper_body"
    }
  },

  cosplay_maid: {
    name: "🎀 メイドコス",
    description: "メイドコスプレでの奉仕シーン",
    level: "L2",
    settings: {
      mangaNSFWEnable: true,
      mangaNSFWExpr: "bashful_service",
      mangaNSFWExpo: "maid_outfit_revealing",
      mangaNSFWSitu: "private_room",
      mangaNSFWLight: "soft_lighting",
      mangaNSFWPose: "bowing_service",
      mangaNSFWOutfit: "sexy_maid",
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
      mangaNSFWExpr: "innocent_blush",
      mangaNSFWExpo: "modest_exposure",
      mangaNSFWSitu: "private_room",
      mangaNSFWLight: "soft_pink",
      mangaNSFWPose: "shy_sitting",
      mangaNSFWUnderwear: "white_cotton",
      mangaComposition: "bust"
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

// NSFWプリセット適用関数
function applyNSFWPreset(presetId) {
  const preset = MANGA_NSFW_PRESETS[presetId];
  if (!preset) {
    console.error(`NSFWプリセットが見つかりません: ${presetId}`);
    return;
  }
  
  console.log(`🔞 NSFWプリセット適用: ${preset.name} (${preset.level})`);
  
  // 既存の選択を全てクリア
  clearAllMangaSelections();
  
  // NSFWを有効化
  const nsfwToggle = document.getElementById('mangaNSFWEnable');
  if (nsfwToggle) {
    nsfwToggle.checked = true;
    toggleMangaNSFWPanel();
  }
  
  // プリセット設定を適用
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
      console.log(`✅ ${categoryId}: ${value}`);
    } else {
      console.warn(`⚠️ NSFW値が見つかりません: ${categoryId} = ${value}`);
    }
  });
  
  // UI更新
  document.getElementById('currentNSFWPreset').textContent = preset.name;
  document.getElementById('currentNSFWDescription').textContent = preset.description;
  document.getElementById('currentNSFWLevel').textContent = `レベル: ${preset.level}`;
  
  // プロンプト生成
  updateMangaOutput();
  
  if (typeof toast === 'function') {
    toast(`NSFWプリセット「${preset.name}」(${preset.level}) を適用しました`);
  }
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
