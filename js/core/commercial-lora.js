/* 商用LoRA機能の実装 */

// 商用LoRA管理クラス
class CommercialLoRAManager {
  constructor() {
    this.selectedLoRAs = new Map(); // LoRA ID -> weight のマップ
    this.currentCategory = 'all';
    this.initialized = false;
  }

  // 初期化
  init() {
    if (this.initialized) return;
    
    console.log('🎭 商用LoRAマネージャー初期化中...');
    
    // イベントリスナーの設定
    this.setupEventListeners();
    
    // LoRAアイテムの生成
    this.renderLoRAItems();
    
    // 初期状態の更新
    this.updateSelectedCount();
    
    this.initialized = true;
    console.log('✅ 商用LoRAマネージャー初期化完了');
  }

  // イベントリスナーの設定
  setupEventListeners() {
    // 有効化トグル
    const enableToggle = document.getElementById('mangaCommercialLoRAEnable');
    if (enableToggle) {
      enableToggle.addEventListener('change', () => {
        this.toggleCommercialLoRAPanel();
      });
    }

    // カテゴリタブ
    document.querySelectorAll('.lora-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchCategory(e.target.dataset.category);
      });
    });

    // 全解除ボタン
    const clearAllBtn = document.getElementById('clearAllCommercialLoRA');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearAllLoRAs();
      });
    }

    // 一括重み適用
    const bulkWeightSlider = document.getElementById('bulkLoRAWeight');
    const bulkWeightValue = document.getElementById('bulkLoRAWeightValue');
    const applyBulkBtn = document.getElementById('applyBulkWeight');

    if (bulkWeightSlider && bulkWeightValue) {
      bulkWeightSlider.addEventListener('input', () => {
        bulkWeightValue.textContent = bulkWeightSlider.value;
      });
    }

    if (applyBulkBtn) {
      applyBulkBtn.addEventListener('click', () => {
        this.applyBulkWeight();
      });
    }
  }

  // パネルの表示/非表示切り替え
  toggleCommercialLoRAPanel() {
    const enableToggle = document.getElementById('mangaCommercialLoRAEnable');
    const panel = document.getElementById('commercialLoRAPanel');
    
    if (enableToggle && panel) {
      const isEnabled = enableToggle.checked;
      panel.style.display = isEnabled ? 'block' : 'none';
      
      if (isEnabled && !this.initialized) {
        this.init();
      }
      
      // プロンプト更新
      setTimeout(() => {
        if (typeof updateMangaOutput === 'function') {
          updateMangaOutput();
        }
      }, 50);
    }
  }

  // カテゴリ切り替え
  switchCategory(category) {
    this.currentCategory = category;
    
    // タブボタンの状態更新
    document.querySelectorAll('.lora-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    // アイテム表示更新
    this.renderLoRAItems();
  }

  // LoRAアイテムの描画
  renderLoRAItems() {
    const container = document.getElementById('commercialLoRAItems');
    if (!container) return;

    const loraData = window.COMMERCIAL_LORA_DICT?.commercial_lora || [];
    
    // カテゴリフィルター
    const filteredData = this.currentCategory === 'all' 
      ? loraData 
      : loraData.filter(item => item.category === this.currentCategory);

    container.innerHTML = filteredData.map(item => this.createLoRAItemHTML(item)).join('');

    // イベントリスナーを再設定
    this.bindLoRAItemEvents(container);
  }

  // LoRAアイテムのHTML生成
  createLoRAItemHTML(item) {
    const isSelected = this.selectedLoRAs.has(item.tag);
    const currentWeight = isSelected ? this.selectedLoRAs.get(item.tag) : item.weight_default;
    const displayTag = this.formatLoRATag(item.tag, currentWeight);

    return `
      <div class="lora-item ${isSelected ? 'selected' : ''}" data-lora-tag="${item.tag}">
        <div class="lora-item-header">
          <input type="checkbox" class="lora-checkbox" ${isSelected ? 'checked' : ''}>
          <div class="lora-info">
            <h4 class="lora-title">
              ${item.label}
              <span class="lora-category-badge">${this.getCategoryLabel(item.category)}</span>
            </h4>
            <p class="lora-description">${item.description}</p>
          </div>
        </div>
        <div class="lora-controls">
          <div class="lora-weight-control">
            <span class="mini">重み:</span>
            <input type="range" 
                   class="lora-weight-slider" 
                   min="${item.weight_min}" 
                   max="${item.weight_max}" 
                   step="0.1" 
                   value="${currentWeight}"
                   ${!isSelected ? 'disabled' : ''}>
            <span class="weight-value">${currentWeight}</span>
          </div>
        </div>
        <div class="lora-tag-display">${displayTag}</div>
      </div>
    `;
  }

  // LoRAアイテムのイベント設定
  bindLoRAItemEvents(container) {
    container.querySelectorAll('.lora-item').forEach(item => {
      const tag = item.dataset.loraTag;
      const checkbox = item.querySelector('.lora-checkbox');
      const slider = item.querySelector('.lora-weight-slider');
      const valueDisplay = item.querySelector('.weight-value');
      const tagDisplay = item.querySelector('.lora-tag-display');

      // チェックボックス
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedLoRAs.set(tag, parseFloat(slider.value));
          slider.disabled = false;
          item.classList.add('selected');
        } else {
          this.selectedLoRAs.delete(tag);
          slider.disabled = true;
          item.classList.remove('selected');
        }
        this.updateSelectedCount();
        this.updateMangaOutput();
      });

      // 重みスライダー
      slider.addEventListener('input', () => {
        const weight = parseFloat(slider.value);
        valueDisplay.textContent = weight;
        
        if (checkbox.checked) {
          this.selectedLoRAs.set(tag, weight);
          tagDisplay.textContent = this.formatLoRATag(tag, weight);
          this.updateMangaOutput();
        }
      });
    });
  }

  // LoRAタグの重み調整
  formatLoRATag(tag, weight) {
    return tag.replace(/:[\d\.]+>/, `:${weight}>`);
  }

  // カテゴリラベル変換
  getCategoryLabel(category) {
    const labels = {
      style: '画風',
      quality: '品質',
      expression: '表現',
      pose: 'ポーズ',
      effect: '効果',
      background: '背景',
      lighting: '照明'
    };
    return labels[category] || category;
  }

  // 選択数の更新
  updateSelectedCount() {
    const countElement = document.getElementById('selectedLoRACount');
    if (countElement) {
      countElement.textContent = this.selectedLoRAs.size;
    }
  }

  // 全解除
  clearAllLoRAs() {
    this.selectedLoRAs.clear();
    
    // UI更新
    document.querySelectorAll('.lora-item').forEach(item => {
      const checkbox = item.querySelector('.lora-checkbox');
      const slider = item.querySelector('.lora-weight-slider');
      
      checkbox.checked = false;
      slider.disabled = true;
      item.classList.remove('selected');
    });
    
    this.updateSelectedCount();
    this.updateMangaOutput();
  }

  // 一括重み適用
  applyBulkWeight() {
    const bulkWeight = parseFloat(document.getElementById('bulkLoRAWeight').value);
    
    this.selectedLoRAs.forEach((_, tag) => {
      this.selectedLoRAs.set(tag, bulkWeight);
    });
    
    // UI更新
    document.querySelectorAll('.lora-item.selected').forEach(item => {
      const slider = item.querySelector('.lora-weight-slider');
      const valueDisplay = item.querySelector('.weight-value');
      const tagDisplay = item.querySelector('.lora-tag-display');
      const tag = item.dataset.loraTag;
      
      slider.value = bulkWeight;
      valueDisplay.textContent = bulkWeight;
      tagDisplay.textContent = this.formatLoRATag(tag, bulkWeight);
    });
    
    this.updateMangaOutput();
  }

  // 選択中のLoRAタグを取得
  getSelectedLoRATags() {
    const tags = [];
    this.selectedLoRAs.forEach((weight, tag) => {
      tags.push(this.formatLoRATag(tag, weight));
    });
    return tags;
  }

  // プロンプト更新
  updateMangaOutput() {
    setTimeout(() => {
      if (typeof updateMangaOutput === 'function') {
        updateMangaOutput();
      }
    }, 50);
  }
}

// グローバルインスタンス
window.commercialLoRAManager = new CommercialLoRAManager();

// 既存の漫画モード初期化に統合
const originalInitMangaMode = window.initMangaMode;
if (originalInitMangaMode) {
  window.initMangaMode = function() {
    originalInitMangaMode();
    
    // 商用LoRAマネージャーの準備
    setTimeout(() => {
      if (window.COMMERCIAL_LORA_DICT && document.getElementById('mangaCommercialLoRAEnable')) {
        window.commercialLoRAManager.setupEventListeners();
      }
    }, 500);
  };
}

console.log('✅ 商用LoRA機能が読み込まれました');
