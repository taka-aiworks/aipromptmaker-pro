// 漫画モードプリセット統合システム
class MangaPresetSystem {
  constructor() {
    this.currentSFWPreset = null;
    this.currentNSFWPreset = null;
    this.initialized = false;
  }

  // プリセットシステム初期化
  init() {
    if (this.initialized) return;
    
    console.log('🎛️ 漫画プリセットシステム初期化中...');
    
    this.createPresetUI();
    this.setupEventListeners();
    this.initialized = true;
    
    console.log('✅ 漫画プリセットシステム初期化完了');
  }

  // プリセットUI作成
  createPresetUI() {
    const mangaPanel = document.getElementById('panelManga');
    if (!mangaPanel) {
      console.error('❌ #panelManga が見つかりません');
      return;
    }

    // プリセットセクションを最上部に挿入
    const presetSection = document.createElement('div');
    presetSection.className = 'manga-presets-section';
    presetSection.innerHTML = this.generatePresetHTML();
    
    // パネルの最初に挿入
    mangaPanel.insertBefore(presetSection, mangaPanel.firstChild);
    
    console.log('✅ プリセットUI作成完了');
  }

  // プリセットHTML生成
  generatePresetHTML() {
    return `
<div class="manga-presets-container">
  <h3>🎭 漫画モードプリセット</h3>
  
  <div class="preset-tabs">
    <button class="preset-tab active" data-tab="sfw">😊 SFW感情別</button>
    <button class="preset-tab" data-tab="nsfw">🔞 NSFWシチュ別</button>
    <button class="preset-clear-btn">🗑️ 全クリア</button>
  </div>

  <div id="preset-tab-sfw" class="preset-tab-content active">
    ${this.generateSFWPresetHTML()}
  </div>

  <div id="preset-tab-nsfw" class="preset-tab-content">
    ${this.generateNSFWPresetHTML()}
  </div>
  
  <div class="preset-status">
    <div id="currentPresetInfo">
      <span class="preset-current">現在のプリセット: <strong id="currentPresetName">なし</strong></span>
      <p class="preset-desc" id="currentPresetDesc">プリセットを選択してください</p>
    </div>
  </div>
</div>

<style>
.manga-presets-container {
  background: rgba(0,0,0,0.05);
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid rgba(255,255,255,0.1);
}

.preset-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  align-items: center;
}

.preset-tab {
  padding: 8px 16px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.1);
  border-radius: 20px;
  cursor: pointer;
  color: rgba(255,255,255,0.8);
  transition: all 0.3s ease;
}

.preset-tab.active {
  background: rgba(100,150,255,0.3);
  border-color: rgba(100,150,255,0.5);
  color: white;
}

.preset-tab:hover {
  background: rgba(255,255,255,0.2);
}

.preset-clear-btn {
  padding: 6px 12px;
  background: rgba(255,100,100,0.2);
  border: 1px solid rgba(255,100,100,0.4);
  border-radius: 15px;
  color: rgba(255,150,150,1);
  cursor: pointer;
  font-size: 12px;
  margin-left: auto;
}

.preset-clear-btn:hover {
  background: rgba(255,100,100,0.3);
}

.preset-tab-content {
  display: none;
}

.preset-tab-content.active {
  display: block;
}

.preset-section {
  margin-bottom: 15px;
}

.preset-section h5 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: rgba(255,255,255,0.9);
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  cursor: pointer;
  color: rgba(255,255,255,0.8);
  font-size: 12px;
  transition: all 0.3s ease;
}

.preset-btn:hover {
  background: rgba(255,255,255,0.2);
  transform: translateY(-1px);
}

.preset-btn.active {
  background: rgba(100,200,100,0.3);
  border-color: rgba(100,200,100,0.6);
  color: white;
  box-shadow: 0 2px 8px rgba(100,200,100,0.3);
}

.nsfw-l1 { border-left: 3px solid #ffeb3b; }
.nsfw-l2 { border-left: 3px solid #ff9800; }
.nsfw-l3 { border-left: 3px solid #f44336; }

.preset-status {
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.preset-current {
  color: rgba(255,255,255,0.9);
  font-size: 14px;
}

.preset-desc {
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  margin: 5px 0 0 0;
}
</style>
    `;
  }

  // SFWプリセットHTML
  generateSFWPresetHTML() {
    return `
<div class="preset-section">
  <h5>😊 ポジティブ感情</h5>
  <div class="preset-buttons">
    <button class="preset-btn" data-preset="joy_happy" data-type="sfw">😊 喜び・幸せ</button>
    <button class="preset-btn" data-preset="joy_cheerful" data-type="sfw">🌟 陽気・元気</button>
    <button class="preset-btn" data-preset="calm_peaceful" data-type="sfw">😌 穏やか</button>
  </div>
</div>

<div class="preset-section">
  <h5>😢 ネガティブ感情</h5>
  <div class="preset-buttons">
    <button class="preset-btn" data-preset="sad_gentle" data-type="sfw">😢 悲しみ</button>
    <button class="preset-btn" data-preset="sad_crying" data-type="sfw">😭 泣き顔</button>
    <button class="preset-btn" data-preset="anger_mild" data-type="sfw">😤 むすっ</button>
    <button class="preset-btn" data-preset="anger_fury" data-type="sfw">😡 激怒</button>
  </div>
</div>

<div class="preset-section">
  <h5>😳 特殊感情</h5>
  <div class="preset-buttons">
    <button class="preset-btn" data-preset="embarrassed_shy" data-type="sfw">😊 恥ずかしがり</button>
    <button class="preset-btn" data-preset="embarrassed_blush" data-type="sfw">😳 赤面</button>
    <button class="preset-btn" data-preset="surprised_shock" data-type="sfw">😲 驚き</button>
    <button class="preset-btn" data-preset="sleepy_tired" data-type="sfw">😴 眠気</button>
  </div>
</div>
    `;
  }

  // NSFWプリセットHTML  
  generateNSFWPresetHTML() {
    return `
<div class="preset-section">
  <h5>💕 ロマンス系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l1" data-preset="romantic_sweet" data-type="nsfw">💕 ロマンチック</button>
    <button class="preset-btn nsfw-l2" data-preset="romantic_intimate" data-type="nsfw">💖 親密・密着</button>
  </div>
</div>

<div class="preset-section">
  <h5>🛁 お風呂・水着系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l1" data-preset="bath_shower" data-type="nsfw">🛁 バスタイム</button>
    <button class="preset-btn nsfw-l1" data-preset="swimsuit_beach" data-type="nsfw">🏖️ 水着・ビーチ</button>
  </div>
</div>

<div class="preset-section">
  <h5>🌙 ナイト系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l2" data-preset="bedroom_night" data-type="nsfw">🌙 ベッドルーム</button>
    <button class="preset-btn nsfw-l1" data-preset="sleepwear_night" data-type="nsfw">🌃 ナイトウェア</button>
  </div>
</div>

<div class="preset-section">
  <h5>💄 グラマラス系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l2" data-preset="glamorous_pose" data-type="nsfw">💄 グラマラス</button>
    <button class="preset-btn nsfw-l2" data-preset="pinup_style" data-type="nsfw">📸 ピンナップ</button>
  </div>
</div>

<div class="preset-section">
  <h5>🎭 コスプレ・制服系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l1" data-preset="school_after" data-type="nsfw">🏫 放課後</button>
    <button class="preset-btn nsfw-l2" data-preset="cosplay_maid" data-type="nsfw">🎀 メイドコス</button>
  </div>
</div>

<div class="preset-section">
  <h5>🌸 ソフト系</h5>
  <div class="preset-buttons">
    <button class="preset-btn nsfw-l1" data-preset="cute_innocent" data-type="nsfw">🌸 初心・純真</button>
  </div>
</div>
    `;
  }

  // イベントリスナー設定
  setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.preset-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabType = e.target.dataset.tab;
        this.switchTab(tabType);
      });
    });

    // プリセット選択
    document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const presetId = e.target.dataset.preset;
        const presetType = e.target.dataset.type;
        this.applyPreset(presetId, presetType);
        
        // ボタンアクティブ状態更新
        this.updateActiveButton(e.target);
      });
    });

    // 全クリアボタン
    document.querySelector('.preset-clear-btn').addEventListener('click', () => {
      this.clearAllPresets();
    });
  }

  // タブ切り替え
  switchTab(tabType) {
    // タブボタンの状態更新
    document.querySelectorAll('.preset-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabType}"]`).classList.add('active');

    // コンテンツの表示切り替え
    document.querySelectorAll('.preset-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`preset-tab-${tabType}`).classList.add('active');
  }

  // プリセット適用
  applyPreset(presetId, type) {
    console.log(`🎭 プリセット適用: ${presetId} (${type})`);
    
    if (type === 'sfw') {
      this.applySFWPreset(presetId);
    } else if (type === 'nsfw') {
      this.applyNSFWPreset(presetId);
    }
  }

  // SFWプリセット適用
  applySFWPreset(presetId) {
    const preset = MANGA_SFW_PRESETS[presetId];
    if (!preset) {
      console.error(`SFWプリセットが見つかりません: ${presetId}`);
      return;
    }

    // 既存選択をクリア
    this.clearAllSelections();
    
    // NSFWを無効化
    const nsfwToggle = document.getElementById('mangaNSFWEnable');
    if (nsfwToggle) {
      nsfwToggle.checked = false;
      if (typeof toggleMangaNSFWPanel === 'function') {
        toggleMangaNSFWPanel();
      }
    }

    // プリセット設定適用
    Object.entries(preset.settings).forEach(([categoryId, value]) => {
      this.setSelectionValue(categoryId, value);
    });

    // 状態更新
    this.currentSFWPreset = presetId;
    this.currentNSFWPreset = null;
    this.updatePresetStatus(preset.name, preset.description);
    
    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    }

    if (typeof toast === 'function') {
      toast(`SFWプリセット「${preset.name}」を適用`);
    }
  }

  // NSFWプリセット適用
  applyNSFWPreset(presetId) {
    const preset = MANGA_NSFW_PRESETS[presetId];
    if (!preset) {
      console.error(`NSFWプリセットが見つかりません: ${presetId}`);
      return;
    }

    // 既存選択をクリア
    this.clearAllSelections();
    
    // NSFWを有効化
    const nsfwToggle = document.getElementById('mangaNSFWEnable');
    if (nsfwToggle) {
      nsfwToggle.checked = true;
      if (typeof toggleMangaNSFWPanel === 'function') {
        toggleMangaNSFWPanel();
      }
    }

    // プリセット設定適用
    Object.entries(preset.settings).forEach(([categoryId, value]) => {
      if (categoryId !== 'mangaNSFWEnable') {
        this.setSelectionValue(categoryId, value);
      }
    });

    // 状態更新
    this.currentNSFWPreset = presetId;
    this.currentSFWPreset = null;
    this.updatePresetStatus(preset.name, `${preset.description} (${preset.level})`);
    
    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    }

    if (typeof toast === 'function') {
      toast(`NSFWプリセット「${preset.name}」(${preset.level})を適用`);
    }
  }

  // 選択値設定
  setSelectionValue(categoryId, value) {
    if (!value) return;
    
    const container = document.getElementById(categoryId);
    if (!container) {
      console.warn(`⚠️ カテゴリが見つかりません: ${categoryId}`);
      return;
    }

    const input = container.querySelector(`input[value="${value}"]`);
    if (input) {
      input.checked = true;
      console.log(`✅ ${categoryId}: ${value}`);
    } else {
      console.warn(`⚠️ 値が見つかりません: ${categoryId} = ${value}`);
    }
  }

  // 全選択クリア
  clearAllSelections() {
    const categoryIds = [
      'mangaEmotionPrimary', 'mangaEmotionDetail', 'mangaExpressions',
      'mangaEyeState', 'mangaGaze', 'mangaMouthState', 'mangaPose',
      'mangaHandGesture', 'mangaMovementAction', 'mangaComposition',
      'mangaView', 'mangaCameraView', 'mangaPropsLight', 'mangaEffectManga',
      'mangaBackground', 'mangaLighting', 'mangaArtStyle',
      'mangaNSFWExpr', 'mangaNSFWExpo', 'mangaNSFWSitu', 'mangaNSFWLight',
      'mangaNSFWPose', 'mangaNSFWAction', 'mangaNSFWAcc', 'mangaNSFWOutfit',
      'mangaNSFWBody', 'mangaNSFWNipples', 'mangaNSFWUnderwear'
    ];

    categoryIds.forEach(categoryId => {
      const container = document.getElementById(categoryId);
      if (container) {
        container.querySelectorAll('input').forEach(input => {
          input.checked = false;
        });
      }
    });
  }

  // 全プリセットクリア
  clearAllPresets() {
    this.clearAllSelections();
    
    // NSFWも無効化
    const nsfwToggle = document.getElementById('mangaNSFWEnable');
    if (nsfwToggle) {
      nsfwToggle.checked = false;
      if (typeof toggleMangaNSFWPanel === 'function') {
        toggleMangaNSFWPanel();
      }
    }

    // 状態リセット
    this.currentSFWPreset = null;
    this.currentNSFWPreset = null;
    this.updatePresetStatus('なし', 'プリセットを選択してください');

    // ボタン状態リセット
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    }

    if (typeof toast === 'function') {
      toast('全てのプリセットをクリアしました');
    }
  }

  // アクティブボタン更新
  updateActiveButton(activeBtn) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
  }

  // プリセット状態表示更新
  updatePresetStatus(name, description) {
    document.getElementById('currentPresetName').textContent = name;
    document.getElementById('currentPresetDesc').textContent = description;
  }
}

// プリセットシステムのグローバルインスタンス
const mangaPresetSystem = new MangaPresetSystem();

// 既存の初期化関数に統合
const originalInitMangaMode = window.initMangaMode;
window.initMangaMode = function() {
  if (originalInitMangaMode) {
    originalInitMangaMode();
  }
  
  // プリセットシステム初期化
  setTimeout(() => {
    mangaPresetSystem.init();
  }, 1000);
};

// エクスポート
window.mangaPresetSystem = mangaPresetSystem;


// プリセット微調整機能の強化
class MangaPresetEnhancement {
  constructor() {
    this.basePreset = null; // 元になったプリセット
    this.customizations = {}; // ユーザーがカスタマイズした項目
    this.isCustomizing = false;
  }

  // 微調整モード開始
  startCustomization(presetId, presetType) {
    this.basePreset = { id: presetId, type: presetType };
    this.customizations = {};
    this.isCustomizing = true;
    
    // 微調整状態の表示を更新
    this.updateCustomizationStatus();
    
    console.log(`🔧 微調整モード開始: ${presetId} (${presetType})`);
  }

  // 微調整項目を記録
  recordCustomization(categoryId, oldValue, newValue) {
    if (!this.isCustomizing) return;
    
    this.customizations[categoryId] = {
      original: oldValue,
      custom: newValue,
      timestamp: Date.now()
    };
    
    console.log(`📝 微調整記録: ${categoryId} ${oldValue} → ${newValue}`);
    this.updateCustomizationStatus();
  }

  // 微調整状態の表示更新
  updateCustomizationStatus() {
    let statusHtml = '';
    
    if (this.basePreset && Object.keys(this.customizations).length > 0) {
      const presetData = this.basePreset.type === 'sfw' 
        ? MANGA_SFW_PRESETS[this.basePreset.id]
        : MANGA_NSFW_PRESETS[this.basePreset.id];
      
      statusHtml = `
        <div class="customization-status">
          <div class="base-preset">
            <span class="preset-icon">🎭</span>
            <strong>ベース:</strong> ${presetData.name}
          </div>
          <div class="customizations">
            <span class="custom-icon">🔧</span>
            <strong>微調整:</strong> ${Object.keys(this.customizations).length}項目
            <button class="btn-reset-customs" onclick="resetCustomizations()">🔄 元に戻す</button>
            <button class="btn-save-custom" onclick="saveAsCustomPreset()">💾 保存</button>
          </div>
        </div>
      `;
    }
    
    // 既存の状態表示エリアに追加
    const statusArea = document.getElementById('currentPresetInfo');
    if (statusArea) {
      const existingCustomStatus = statusArea.querySelector('.customization-status');
      if (existingCustomStatus) {
        existingCustomStatus.remove();
      }
      if (statusHtml) {
        statusArea.insertAdjacentHTML('beforeend', statusHtml);
      }
    }
  }

  // 微調整をリセット（元のプリセットに戻す）
  resetCustomizations() {
    if (!this.basePreset) return;
    
    console.log('🔄 微調整をリセット中...');
    
    // 元のプリセットを再適用
    if (this.basePreset.type === 'sfw') {
      mangaPresetSystem.applySFWPreset(this.basePreset.id);
    } else {
      mangaPresetSystem.applyNSFWPreset(this.basePreset.id);
    }
    
    // カスタマイズ状態をクリア
    this.customizations = {};
    this.updateCustomizationStatus();
    
    if (typeof toast === 'function') {
      toast('🔄 元のプリセットに戻しました');
    }
  }

  // カスタマイズをカスタムプリセットとして保存
  saveAsCustomPreset() {
    if (!this.basePreset || Object.keys(this.customizations).length === 0) return;
    
    const baseName = this.basePreset.type === 'sfw' 
      ? MANGA_SFW_PRESETS[this.basePreset.id].name
      : MANGA_NSFW_PRESETS[this.basePreset.id].name;
    
    const customName = prompt(`カスタムプリセット名を入力してください:`, `${baseName}_カスタム`);
    if (!customName) return;
    
    // 現在の設定を取得
    const currentSettings = this.getCurrentSettings();
    
    // カスタムプリセットデータ作成
    const customPreset = {
      name: customName,
      description: `${baseName}をベースにしたカスタムプリセット`,
      basePreset: this.basePreset,
      customizations: this.customizations,
      settings: currentSettings,
      createdAt: new Date().toISOString()
    };
    
    // localStorage に保存
    this.saveCustomPresetToStorage(customPreset);
    
    if (typeof toast === 'function') {
      toast(`💾 「${customName}」として保存しました`);
    }
  }

  // 現在の全設定を取得
  getCurrentSettings() {
    const settings = {};
    const categoryIds = [
      'mangaEmotionPrimary', 'mangaEmotionDetail', 'mangaExpressions',
      'mangaEyeState', 'mangaGaze', 'mangaMouthState', 'mangaPose',
      'mangaHandGesture', 'mangaMovementAction', 'mangaComposition',
      'mangaView', 'mangaCameraView', 'mangaPropsLight', 'mangaEffectManga',
      'mangaBackground', 'mangaLighting', 'mangaArtStyle',
      'mangaNSFWExpr', 'mangaNSFWExpo', 'mangaNSFWSitu', 'mangaNSFWLight',
      'mangaNSFWPose', 'mangaNSFWAction', 'mangaNSFWAcc', 'mangaNSFWOutfit',
      'mangaNSFWBody', 'mangaNSFWNipples', 'mangaNSFWUnderwear'
    ];
    
    categoryIds.forEach(categoryId => {
      const container = document.getElementById(categoryId);
      if (container) {
        const checkedInput = container.querySelector('input:checked');
        if (checkedInput && checkedInput.value) {
          settings[categoryId] = checkedInput.value;
        }
      }
    });
    
    return settings;
  }

  // カスタムプリセットをStorageに保存
  saveCustomPresetToStorage(customPreset) {
    const customPresets = JSON.parse(localStorage.getItem('mangaCustomPresets') || '[]');
    customPresets.push(customPreset);
    localStorage.setItem('mangaCustomPresets', JSON.stringify(customPresets));
    
    // UIに追加
    this.addCustomPresetToUI(customPreset);
  }

  // カスタムプリセットをUIに追加
  addCustomPresetToUI(customPreset) {
    // カスタムタブがなければ作成
    let customTab = document.querySelector('[data-tab="custom"]');
    if (!customTab) {
      const tabsContainer = document.querySelector('.preset-tabs');
      customTab = document.createElement('button');
      customTab.className = 'preset-tab';
      customTab.setAttribute('data-tab', 'custom');
      customTab.textContent = '💾 マイプリセット';
      tabsContainer.insertBefore(customTab, tabsContainer.querySelector('.preset-clear-btn'));
      
      // カスタムタブコンテンツ作成
      const tabContent = document.createElement('div');
      tabContent.id = 'preset-tab-custom';
      tabContent.className = 'preset-tab-content';
      tabContent.innerHTML = '<div class="preset-section"><h5>💾 保存されたカスタムプリセット</h5><div class="preset-buttons custom-presets-container"></div></div>';
      document.querySelector('.manga-presets-container').appendChild(tabContent);
      
      // タブクリックイベント
      customTab.addEventListener('click', () => {
        mangaPresetSystem.switchTab('custom');
      });
    }
    
    // カスタムプリセットボタンを追加
    const customContainer = document.querySelector('.custom-presets-container');
    const customBtn = document.createElement('button');
    customBtn.className = 'preset-btn custom-preset';
    customBtn.textContent = `💾 ${customPreset.name}`;
    customBtn.setAttribute('data-custom-preset', JSON.stringify(customPreset));
    
    // クリックイベント
    customBtn.addEventListener('click', () => {
      this.applyCustomPreset(customPreset);
    });
    
    customContainer.appendChild(customBtn);
  }

  // カスタムプリセット適用
  applyCustomPreset(customPreset) {
    console.log(`💾 カスタムプリセット適用: ${customPreset.name}`);
    
    // 全選択クリア
    mangaPresetSystem.clearAllSelections();
    
    // 設定を適用
    Object.entries(customPreset.settings).forEach(([categoryId, value]) => {
      mangaPresetSystem.setSelectionValue(categoryId, value);
    });
    
    // NSFW設定があるかチェック
    const hasNSFW = Object.keys(customPreset.settings).some(key => key.startsWith('mangaNSFW'));
    const nsfwToggle = document.getElementById('mangaNSFWEnable');
    if (nsfwToggle) {
      nsfwToggle.checked = hasNSFW;
      if (typeof toggleMangaNSFWPanel === 'function') {
        toggleMangaNSFWPanel();
      }
    }
    
    // ベースプリセット情報を設定
    this.basePreset = customPreset.basePreset;
    this.customizations = customPreset.customizations || {};
    this.isCustomizing = true;
    
    // 状態更新
    mangaPresetSystem.updatePresetStatus(customPreset.name, customPreset.description);
    this.updateCustomizationStatus();
    
    // プロンプト更新
    if (typeof updateMangaOutput === 'function') {
      updateMangaOutput();
    }
    
    if (typeof toast === 'function') {
      toast(`💾 カスタムプリセット「${customPreset.name}」を適用`);
    }
  }

  // 保存されたカスタムプリセットを読み込み
  loadCustomPresets() {
    const customPresets = JSON.parse(localStorage.getItem('mangaCustomPresets') || '[]');
    customPresets.forEach(preset => {
      this.addCustomPresetToUI(preset);
    });
  }
}

// プリセット微調整システムのインスタンス
const mangaPresetEnhancement = new MangaPresetEnhancement();

// 既存のプリセットシステムに統合
const originalApplySFWPreset = mangaPresetSystem.applySFWPreset;
mangaPresetSystem.applySFWPreset = function(presetId) {
  originalApplySFWPreset.call(this, presetId);
  mangaPresetEnhancement.startCustomization(presetId, 'sfw');
};

const originalApplyNSFWPreset = mangaPresetSystem.applyNSFWPreset; 
mangaPresetSystem.applyNSFWPreset = function(presetId) {
  originalApplyNSFWPreset.call(this, presetId);
  mangaPresetEnhancement.startCustomization(presetId, 'nsfw');
};

// 選択変更を監視して微調整を記録
document.addEventListener('change', (e) => {
  if (e.target.matches('#panelManga input[type="radio"], #panelManga input[type="checkbox"]')) {
    if (mangaPresetEnhancement.isCustomizing) {
      const categoryId = e.target.name;
      const newValue = e.target.value;
      const oldValue = mangaPresetEnhancement.customizations[categoryId]?.original || '';
      
      mangaPresetEnhancement.recordCustomization(categoryId, oldValue, newValue);
    }
  }
});

// グローバル関数として公開
window.resetCustomizations = () => mangaPresetEnhancement.resetCustomizations();
window.saveAsCustomPreset = () => mangaPresetEnhancement.saveAsCustomPreset();

// 初期化時にカスタムプリセットを読み込み
setTimeout(() => {
  mangaPresetEnhancement.loadCustomPresets();
}, 1500);

// エクスポート
window.mangaPresetEnhancement = mangaPresetEnhancement;


// ========================================
// プリセット詳細表示システム完全版（既存システムに追加）
// ========================================

// 1. プリセット詳細データを定義
const PRESET_DETAILS_DATA = {
  // SFWプリセット詳細
  sfw: {
    'joy_happy': {
      tags: ['joy expression', 'delighted mood', 'bright smile', 'sparkling eyes', 'peace sign gesture', 'upper body composition'],
      settingsMap: {
        'mangaEmotionPrimary': 'joy',
        'mangaEmotionDetail': 'delighted', 
        'mangaExpressions': 'bright_smile',
        'mangaEyeState': 'sparkling_eyes',
        'mangaGaze': 'at_viewer',
        'mangaMouthState': 'grin',
        'mangaPose': 'standing',
        'mangaHandGesture': 'peace_sign',
        'mangaComposition': 'upper_body'
      }
    },
    'joy_cheerful': {
      tags: ['cheerful energy', 'smiling open mouth', 'raised fist', 'jumping pose', 'arm swing motion', 'full body view'],
      settingsMap: {
        'mangaEmotionPrimary': 'joy',
        'mangaEmotionDetail': 'cheerful',
        'mangaExpressions': 'smiling_open_mouth',
        'mangaEyeState': 'eyes_open', 
        'mangaGaze': 'at_viewer',
        'mangaMouthState': 'wide_open_mouth',
        'mangaPose': 'jumping',
        'mangaHandGesture': 'raised_fist',
        'mangaMovementAction': 'arm_swing',
        'mangaComposition': 'full_body'
      }
    },
    'calm_peaceful': {
      tags: ['calm expression', 'soft smile', 'half closed eyes', 'gentle gaze', 'sitting pose', 'hands together'],
      settingsMap: {
        'mangaEmotionPrimary': 'calm',
        'mangaEmotionDetail': 'relieved',
        'mangaExpressions': 'soft_smile',
        'mangaEyeState': 'eyes_half_closed',
        'mangaGaze': 'gentle_down',
        'mangaMouthState': 'slight_smile',
        'mangaPose': 'sitting',
        'mangaHandGesture': 'hands_together_chest',
        'mangaComposition': 'bust'
      }
    },
    'sad_gentle': {
      tags: ['tearful sadness', 'teary eyes', 'downcast gaze', 'sitting pose', 'wiping tears', 'bust composition'],
      settingsMap: {
        'mangaEmotionPrimary': 'sadness',
        'mangaEmotionDetail': 'tearful',
        'mangaExpressions': 'teary_eyes',
        'mangaEyeState': 'teary',
        'mangaGaze': 'down',
        'mangaMouthState': 'slight_open_mouth',
        'mangaPose': 'sitting',
        'mangaHandGesture': 'wiping_tears',
        'mangaComposition': 'bust'
      }
    },
    'sad_crying': {
      tags: ['sobbing expression', 'crying face', 'teary filled eyes', 'kneeling pose', 'covering eyes', 'teardrops effect'],
      settingsMap: {
        'mangaEmotionPrimary': 'sadness', 
        'mangaEmotionDetail': 'sobbing',
        'mangaExpressions': 'crying',
        'mangaEyeState': 'teary_filled_eyes',
        'mangaGaze': 'downcast_glance',
        'mangaMouthState': 'open_mouth',
        'mangaPose': 'kneeling',
        'mangaHandGesture': 'covering_eyes',
        'mangaEffectManga': 'teardrops',
        'mangaComposition': 'upper_body'
      }
    },
    'anger_mild': {
      tags: ['annoyed mood', 'pouting face', 'narrowed eyes', 'averted gaze', 'arms crossed', 'upper body'],
      settingsMap: {
        'mangaEmotionPrimary': 'anger',
        'mangaEmotionDetail': 'annoyed', 
        'mangaExpressions': 'pouting',
        'mangaEyeState': 'narrowed_eyes',
        'mangaGaze': 'away',
        'mangaMouthState': 'pouting_mouth',
        'mangaPose': 'standing',
        'mangaHandGesture': 'arms_crossed',
        'mangaComposition': 'upper_body'
      }
    },
    'anger_fury': {
      tags: ['furious anger', 'angry vein eyes', 'glaring look', 'clenched fist', 'teeth grit', 'anger mark effect'],
      settingsMap: {
        'mangaEmotionPrimary': 'anger',
        'mangaEmotionDetail': 'furious',
        'mangaExpressions': 'furious', 
        'mangaEyeState': 'angry_vein_eyes',
        'mangaGaze': 'glaring',
        'mangaMouthState': 'teeth_grit',
        'mangaPose': 'standing',
        'mangaHandGesture': 'clenched_fist',
        'mangaEffectManga': 'anger_mark',
        'mangaComposition': 'upper_body'
      }
    },
    'embarrassed_shy': {
      tags: ['bashful emotion', 'embarrassed face', 'shy hidden eyes', 'hands on cheeks', 'blush effect', 'bust view'],
      settingsMap: {
        'mangaEmotionPrimary': 'embarrassment',
        'mangaEmotionDetail': 'bashful',
        'mangaExpressions': 'embarrassed_face',
        'mangaEyeState': 'shy_hidden_eyes',
        'mangaGaze': 'averted_quick', 
        'mangaMouthState': 'slight_smile',
        'mangaPose': 'standing',
        'mangaHandGesture': 'hands_on_cheeks',
        'mangaEffectManga': 'blush',
        'mangaComposition': 'bust'
      }
    },
    'embarrassed_blush': {
      tags: ['blushing face', 'half closed eyes', 'shy side glance', 'covering face', 'blush effect', 'portrait view'],
      settingsMap: {
        'mangaEmotionPrimary': 'embarrassment',
        'mangaEmotionDetail': 'bashful',
        'mangaExpressions': 'blushing',
        'mangaEyeState': 'eyes_half_closed',
        'mangaGaze': 'side_glance_shy',
        'mangaMouthState': 'mouth_closed',
        'mangaPose': 'standing', 
        'mangaHandGesture': 'covering_face',
        'mangaEffectManga': 'blush',
        'mangaComposition': 'portrait'
      }
    },
    'surprised_shock': {
      tags: ['shocked expression', 'widened eyes', 'surprised mouth', 'hands on head', 'surprise mark', 'upper body'],
      settingsMap: {
        'mangaEmotionPrimary': 'surprise',
        'mangaEmotionDetail': 'shocked',
        'mangaExpressions': 'surprised',
        'mangaEyeState': 'widened_eyes',
        'mangaGaze': 'at_viewer',
        'mangaMouthState': 'surprised_o',
        'mangaPose': 'stumbling',
        'mangaHandGesture': 'hands_on_head',
        'mangaEffectManga': 'surprise_mark',
        'mangaComposition': 'upper_body'
      }
    },
    'sleepy_tired': {
      tags: ['sleepy eyes', 'drowsy mood', 'yawning mouth', 'stretching pose', 'hands on head', 'zzz sleep effect'],
      settingsMap: {
        'mangaEmotionPrimary': 'sleepiness',
        'mangaEmotionDetail': '',
        'mangaExpressions': 'sleepy_eyes',
        'mangaEyeState': 'sleepy_drowsy_eyes',
        'mangaGaze': 'half_closed_down',
        'mangaMouthState': 'yawning',
        'mangaPose': 'stretching',
        'mangaHandGesture': 'hands_on_head',
        'mangaEffectManga': 'zzz_sleep',
        'mangaComposition': 'upper_body'
      }
    }
  },
  
  // NSFWプリセット詳細
  nsfw: {
    'romantic_sweet': {
      tags: ['loving emotion', 'romantic expression', 'soft romantic lighting', 'intimate close pose', 'romantic date situation'],
      level: 'R-15',
      settingsMap: {
        'mangaEmotionPrimary': 'loving',
        'mangaNSFWExpr': 'romantic',
        'mangaNSFWSitu': 'romantic_date',
        'mangaNSFWLight': 'soft_romantic',
        'mangaNSFWPose': 'intimate_close'
      }
    },
    'romantic_intimate': {
      tags: ['intimate emotion', 'passionate expression', 'embracing pose', 'kissing action', 'intimate moment'],
      level: 'R-18',
      settingsMap: {
        'mangaEmotionPrimary': 'intimate',
        'mangaNSFWExpr': 'passionate',
        'mangaNSFWSitu': 'intimate_moment',
        'mangaNSFWPose': 'embracing',
        'mangaNSFWAction': 'kissing'
      }
    },
    'bath_shower': {
      tags: ['bathroom setting', 'bathing exposure', 'steam lighting', 'towel outfit', 'bathing pose'],
      level: 'R-15',
      settingsMap: {
        'mangaNSFWSitu': 'bathroom',
        'mangaNSFWExpo': 'bathing',
        'mangaNSFWLight': 'steam',
        'mangaNSFWOutfit': 'towel',
        'mangaNSFWPose': 'bathing_pose'
      }
    },
    'swimsuit_beach': {
      tags: ['bikini outfit', 'beach background', 'sunny lighting', 'beach pose', 'summer fun situation'],
      level: 'R-15',
      settingsMap: {
        'mangaNSFWOutfit': 'bikini',
        'mangaBackground': 'beach',
        'mangaNSFWLight': 'sunny',
        'mangaNSFWPose': 'beach_pose',
        'mangaNSFWSitu': 'summer_fun'
      }
    },
    'bedroom_night': {
      tags: ['bedroom setting', 'dim romantic lighting', 'lingerie outfit', 'lying bed pose', 'seductive expression'],
      level: 'R-18',
      settingsMap: {
        'mangaNSFWSitu': 'bedroom',
        'mangaNSFWLight': 'dim_romantic',
        'mangaNSFWOutfit': 'lingerie',
        'mangaNSFWPose': 'lying_bed',
        'mangaNSFWExpr': 'seductive'
      }
    },
    'sleepwear_night': {
      tags: ['pajamas outfit', 'bedroom casual setting', 'soft night lighting', 'relaxed emotion', 'casual sitting'],
      level: 'R-15',
      settingsMap: {
        'mangaNSFWOutfit': 'pajamas',
        'mangaNSFWSitu': 'bedroom_casual',
        'mangaNSFWLight': 'soft_night',
        'mangaEmotionPrimary': 'relaxed',
        'mangaNSFWPose': 'casual_sitting'
      }
    },
    'glamorous_pose': {
      tags: ['glamorous pose', 'confident sexy expression', 'elegant dress', 'dramatic lighting', 'dynamic angle'],
      level: 'R-18',
      settingsMap: {
        'mangaNSFWPose': 'glamorous',
        'mangaNSFWExpr': 'confident_sexy',
        'mangaNSFWOutfit': 'elegant_dress',
        'mangaNSFWLight': 'dramatic',
        'mangaComposition': 'dynamic_angle'
      }
    },
    'pinup_style': {
      tags: ['pinup classic pose', 'retro sexy outfit', 'playful wink', 'portrait composition', 'retro art style'],
      level: 'R-18',
      settingsMap: {
        'mangaNSFWPose': 'pinup_classic',
        'mangaNSFWOutfit': 'retro_sexy',
        'mangaNSFWExpr': 'playful_wink',
        'mangaComposition': 'portrait',
        'mangaArtStyle': 'retro'
      }
    },
    'school_after': {
      tags: ['school uniform', 'classroom background', 'after school situation', 'youthful emotion', 'innocent cute'],
      level: 'R-15',
      settingsMap: {
        'mangaNSFWOutfit': 'school_uniform',
        'mangaBackground': 'classroom',
        'mangaNSFWSitu': 'after_school',
        'mangaEmotionPrimary': 'youthful',
        'mangaNSFWExpr': 'innocent_cute'
      }
    },
    'cosplay_maid': {
      tags: ['maid costume', 'serving pose', 'cute submissive expression', 'maid accessories', 'maid service'],
      level: 'R-18',
      settingsMap: {
        'mangaNSFWOutfit': 'maid_costume',
        'mangaNSFWPose': 'serving_pose',
        'mangaNSFWExpr': 'cute_submissive',
        'mangaNSFWAcc': 'maid_accessories',
        'mangaNSFWSitu': 'maid_service'
      }
    },
    'cute_innocent': {
      tags: ['innocent emotion', 'pure innocent expression', 'white dress', 'soft pure lighting', 'innocent pose'],
      level: 'R-15',
      settingsMap: {
        'mangaEmotionPrimary': 'innocent',
        'mangaNSFWExpr': 'pure_innocent',
        'mangaNSFWOutfit': 'white_dress',
        'mangaNSFWLight': 'soft_pure',
        'mangaNSFWPose': 'innocent_pose'
      }
    }
  }
};

// 2. カテゴリ名の日本語マッピング
const CATEGORY_NAMES_JP = {
  'mangaEmotionPrimary': '基本感情',
  'mangaEmotionDetail': '詳細感情',
  'mangaExpressions': '表情',
  'mangaEyeState': '目の状態',
  'mangaGaze': '視線',
  'mangaMouthState': '口の状態',
  'mangaPose': 'ポーズ',
  'mangaHandGesture': '手の動作',
  'mangaMovementAction': '動き',
  'mangaComposition': '構図',
  'mangaEffectManga': 'エフェクト',
  'mangaBackground': '背景',
  'mangaLighting': 'ライティング',
  'mangaArtStyle': 'アートスタイル',
  'mangaNSFWExpr': 'NSFW表情',
  'mangaNSFWExpo': 'NSFW露出',
  'mangaNSFWSitu': 'NSFWシチュ',
  'mangaNSFWLight': 'NSFWライト',
  'mangaNSFWPose': 'NSFWポーズ',
  'mangaNSFWAction': 'NSFWアクション',
  'mangaNSFWOutfit': 'NSFW衣装',
  'mangaNSFWAcc': 'NSFWアクセ',
  'mangaNSFWUnderwear': 'NSFW下着'
};

// 3. プリセット詳細表示機能を既存システムに追加
function showPresetDetails(presetId, type) {
  console.log(`📋 プリセット詳細表示開始: ${presetId} (${type})`);
  
  const detailsElement = document.getElementById('presetDetails');
  const detailsContent = document.getElementById('presetDetailsContent');
  
  if (!detailsElement || !detailsContent) {
    console.warn('❌ 詳細表示エリアが見つかりません');
    console.log('💡 HTMLに #presetDetails と #presetDetailsContent が必要です');
    return;
  }
  
  const detailsData = PRESET_DETAILS_DATA[type]?.[presetId];
  if (!detailsData) {
    console.warn(`❌ 詳細データが見つかりません: ${presetId} (${type})`);
    detailsElement.style.display = 'none';
    return;
  }
  
  // プリセット名を取得
  let presetName = presetId;
  if (type === 'sfw' && window.MANGA_SFW_PRESETS && window.MANGA_SFW_PRESETS[presetId]) {
    presetName = window.MANGA_SFW_PRESETS[presetId].name;
  } else if (type === 'nsfw' && window.MANGA_NSFW_PRESETS && window.MANGA_NSFW_PRESETS[presetId]) {
    presetName = window.MANGA_NSFW_PRESETS[presetId].name;
  }
  
  // タグを見やすく表示
  const tagsHtml = detailsData.tags.map(tag => 
    `<span class="preset-tag" style="
      display: inline-block;
      background: rgba(100,150,255,0.2);
      color: rgba(255,255,255,0.9);
      padding: 2px 6px;
      margin: 1px 2px;
      border-radius: 10px;
      font-size: 10px;
      border: 1px solid rgba(100,150,255,0.3);
    ">${tag}</span>`
  ).join('');
  
  // 設定値の詳細表示
  const settingsHtml = Object.entries(detailsData.settingsMap)
    .filter(([key, value]) => value && value.trim() !== '')
    .map(([key, value]) => {
      const categoryName = CATEGORY_NAMES_JP[key] || key;
      const displayValue = value.replace(/_/g, ' ');
      return `<div style="margin: 1px 0; font-size: 10px;">
        <span style="color: rgba(100,200,100,1); font-weight: bold;">${categoryName}:</span> 
        <span style="color: rgba(255,255,255,0.8);">${displayValue}</span>
      </div>`;
    }).join('');
  
  const settingsSection = settingsHtml ? `
    <div style="margin-top: 8px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 4px;">
      <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">📋 設定内容:</div>
      ${settingsHtml}
    </div>
  ` : '';
  
  // レベル表示（NSFWの場合）
  const levelBadge = detailsData.level && detailsData.level !== 'SFW' ? 
    `<span style="
      background: rgba(255,100,100,0.3);
      color: white;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      margin-left: 8px;
    ">${detailsData.level}</span>` : '';
  
  detailsContent.innerHTML = `
    <div style="margin-bottom: 6px; font-weight: bold;">
      ${presetName}${levelBadge}
    </div>
    <div style="margin-bottom: 6px;">
      <div style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">🏷️ 含まれるタグ (${detailsData.tags.length}個):</div>
      ${tagsHtml}
    </div>
    ${settingsSection}
  `;
  
  detailsElement.style.display = 'block';
  
  console.log(`✅ プリセット詳細表示完了: ${presetName} - ${detailsData.tags.length}個のタグ`);
}

// 4. 詳細表示を隠す機能
function hidePresetDetails() {
  const detailsElement = document.getElementById('presetDetails');
  if (detailsElement) {
    detailsElement.style.display = 'none';
  }
}

// 5. 既存のプリセット適用関数に詳細表示を追加
function enhancePresetButtons() {
  console.log('🔧 プリセットボタンに詳細表示機能を追加中...');
  
  // SFWプリセットボタンに詳細表示を追加
  document.querySelectorAll('.preset-btn[data-preset][data-type="sfw"]').forEach(button => {
    button.addEventListener('click', (e) => {
      const presetId = e.target.dataset.preset;
      setTimeout(() => showPresetDetails(presetId, 'sfw'), 100);
    });
  });
  
  // NSFWプリセットボタンに詳細表示を追加
  document.querySelectorAll('.preset-btn[data-preset][data-type="nsfw"]').forEach(button => {
    button.addEventListener('click', (e) => {
      const presetId = e.target.dataset.preset;
      setTimeout(() => showPresetDetails(presetId, 'nsfw'), 100);
    });
  });
  
  // 全クリアボタンに詳細非表示を追加
  document.querySelectorAll('.preset-clear-btn').forEach(button => {
    button.addEventListener('click', hidePresetDetails);
  });
  
  console.log('✅ プリセットボタンの拡張完了');
}

// 6. 初期化関数
function initPresetDetailsSystem() {
  console.log('🚀 プリセット詳細表示システム初期化中...');
  
  // ボタンの拡張を実行
  setTimeout(() => {
    enhancePresetButtons();
  }, 500);
  
  console.log('✅ プリセット詳細表示システム初期化完了');
}

// 7. グローバル関数として公開
window.showPresetDetails = showPresetDetails;
window.hidePresetDetails = hidePresetDetails;
window.initPresetDetailsSystem = initPresetDetailsSystem;
window.PRESET_DETAILS_DATA = PRESET_DETAILS_DATA;

// 8. 自動初期化（DOMが読み込まれた後）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPresetDetailsSystem);
} else {
  initPresetDetailsSystem();
}

console.log('✅ プリセット詳細表示システム全量ロード完了');
console.log('📋 使用方法: showPresetDetails("joy_happy", "sfw") でテスト可能');
