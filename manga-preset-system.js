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
