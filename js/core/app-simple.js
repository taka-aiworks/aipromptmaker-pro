/* =========================================================
   app-simple.js - 既存機能を上書きする軽量版
   既存のapp.jsの後に読み込んで、複雑な機能をシンプル版で上書き
   ========================================================= */

console.log("🚀 Simple Management Override 開始");

// 1. 既存の複雑な機能を無効化
(function disableComplexFeatures() {
  // 複雑なプリセット関連の初期化を無効化
  if (window.initCompletePresetSystem) {
    window.initCompletePresetSystem = function() {
      console.log("❌ 複雑なプリセットシステムは無効化されました");
    };
  }
  
  // 履歴管理を無効化
  if (window.HistoryManager) {
    window.HistoryManager = {
      add: () => false,
      get: () => [],
      clear: () => false
    };
  }
  
  // 自動バックアップを無効化
  if (window.GASSettings) {
    window.GASSettings.autoBackup = false;
  }
  
  console.log("✅ 複雑な機能を無効化完了");
})();

// 2. シンプルなプリセット管理（上書き版）
window.SimplePresetManager = {
  save: function(mode, name, data) {
    try {
      const key = `LPM_SIMPLE_PRESET_${mode}_${name}`;
      const preset = {
        name,
        mode,
        data,
        created: new Date().toISOString(),
        simple: true
      };
      localStorage.setItem(key, JSON.stringify(preset));
      
      if (typeof toast === 'function') {
        toast(`プリセット「${name}」を保存しました`);
      }
      return true;
    } catch (error) {
      console.error('プリセット保存エラー:', error);
      if (typeof toast === 'function') {
        toast(`保存に失敗しました: ${error.message}`);
      }
      return false;
    }
  },
  
  load: function(mode, name) {
    try {
      const key = `LPM_SIMPLE_PRESET_${mode}_${name}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('プリセット読み込みエラー:', error);
      return null;
    }
  },
  
  list: function(mode) {
    try {
      const presets = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`LPM_SIMPLE_PRESET_${mode}_`)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const preset = JSON.parse(stored);
            presets.push(preset);
          }
        }
      }
      return presets.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      console.error('プリセット一覧取得エラー:', error);
      return [];
    }
  },
  
  delete: function(mode, name) {
    try {
      const key = `LPM_SIMPLE_PRESET_${mode}_${name}`;
      localStorage.removeItem(key);
      if (typeof toast === 'function') {
        toast(`プリセット「${name}」を削除しました`);
      }
      return true;
    } catch (error) {
      console.error('プリセット削除エラー:', error);
      return false;
    }
  }
};

// 3. 既存のPresetManagerを上書き
window.PresetManager = window.SimplePresetManager;

// 4. シンプルな設定管理
window.SimpleSettingsManager = {
  export: function() {
    try {
      const settings = {
        version: '2.0-simple',
        timestamp: new Date().toISOString(),
        presets: {},
        gasSettings: this.getGASSettings()
      };
      
      // プリセットをエクスポート
      const modes = ['production', 'manga', 'planner', 'learning'];
      modes.forEach(mode => {
        settings.presets[mode] = window.SimplePresetManager.list(mode);
      });
      
      // ファイルダウンロード
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LPM_simple_settings_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      if (typeof toast === 'function') {
        toast('設定をエクスポートしました');
      }
      return true;
    } catch (error) {
      console.error('エクスポートエラー:', error);
      if (typeof toast === 'function') {
        toast(`エクスポートに失敗しました: ${error.message}`);
      }
      return false;
    }
  },
  
  import: function(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        
        // プリセットをインポート
        if (settings.presets) {
          let importCount = 0;
          Object.entries(settings.presets).forEach(([mode, presets]) => {
            presets.forEach(preset => {
              window.SimplePresetManager.save(mode, preset.name, preset.data);
              importCount++;
            });
          });
          
          // プリセット一覧を更新
          ['production', 'manga', 'planner', 'learning'].forEach(mode => {
            if (typeof updatePresetList === 'function') {
              updatePresetList(mode);
            }
          });
          
          if (typeof toast === 'function') {
            toast(`${importCount}件のプリセットをインポートしました`);
          }
        }
        
        // GAS設定をインポート
        if (settings.gasSettings) {
          this.setGASSettings(settings.gasSettings);
          if (typeof toast === 'function') {
            toast('GAS設定もインポートしました');
          }
        }
        
      } catch (error) {
        console.error('インポートエラー:', error);
        if (typeof toast === 'function') {
          toast(`インポートに失敗しました: ${error.message}`);
        }
      }
    };
    reader.readAsText(file);
  },
  
  getGASSettings: function() {
    try {
      const stored = localStorage.getItem('LPM_GAS_SETTINGS_V2');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  },
  
  setGASSettings: function(settings) {
    try {
      localStorage.setItem('LPM_GAS_SETTINGS_V2', JSON.stringify(settings));
      if (typeof loadGASSettings === 'function') {
        loadGASSettings();
      }
    } catch (error) {
      console.error('GAS設定の復元に失敗:', error);
    }
  }
};

// 5. シンプルなUI追加（既存UIを上書きしない）
function addSimplePresetControls() {
  const modes = [
    { id: 'panelProduction', name: 'production', title: '📦 量産モード' },
    { id: 'panelManga', name: 'manga', title: '🎨 漫画モード' },
    { id: 'panelPlanner', name: 'planner', title: '📷 撮影モード' },
    { id: 'panelLearning', name: 'learning', title: '🧠 学習モード' }
  ];
  
  modes.forEach(mode => {
    const panel = document.getElementById(mode.id);
    if (!panel) return;
    
    const header = panel.querySelector('h2');
    if (!header) return;
    
    // 既存のプリセットコントロールがあれば削除
    const existingControls = header.querySelector('.simple-preset-controls');
    if (existingControls) {
      existingControls.remove();
    }
    
    const presetControls = document.createElement('div');
    presetControls.className = 'simple-preset-controls';
    presetControls.style.cssText = `
      display: inline-flex;
      gap: 6px;
      margin-left: 12px;
      align-items: center;
      background: rgba(59, 130, 246, 0.1);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid rgba(59, 130, 246, 0.3);
    `;
    
    presetControls.innerHTML = `
      <span style="font-size: 10px; color: #3b82f6; font-weight: 500;">Simple</span>
      <button type="button" class="btn ghost small" onclick="saveSimplePreset('${mode.name}')" 
              style="padding: 2px 6px; font-size: 11px;">💾</button>
      <select class="simple-preset-select" data-mode="${mode.name}" 
              onchange="updateSimpleDeleteButton('${mode.name}')" 
              style="padding: 2px 4px; font-size: 11px; min-width: 100px;">
        <option value="">選択...</option>
      </select>
      <button type="button" class="btn ok small" onclick="loadSimplePreset('${mode.name}')" 
              style="padding: 2px 6px; font-size: 11px;">📁</button>
      <button type="button" class="btn bad small" onclick="deleteSimplePreset('${mode.name}')" 
              style="padding: 2px 4px; font-size: 10px;">🗑️</button>
    `;
    
    header.appendChild(presetControls);
    updateSimplePresetList(mode.name);
  });
  
  console.log("✅ シンプルプリセットコントロールを追加完了");
}

// 6. シンプル設定管理UIを追加
function addSimpleSettingsUI() {
  const settingsPanel = document.getElementById("panelSettings");
  if (!settingsPanel) return;
  
  // 既存のシンプル設定セクションがあれば削除
  const existingSection = document.getElementById("simple-settings-section");
  if (existingSection) {
    existingSection.remove();
  }
  
  const settingsSection = document.createElement("div");
  settingsSection.id = "simple-settings-section";
  settingsSection.className = "panel";
  settingsSection.style.cssText = `
    background: rgba(16, 185, 129, 0.05);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 8px;
    margin: 15px 0;
    padding: 15px;
  `;
  
  settingsSection.innerHTML = `
    <h3 style="margin-top: 0; color: #10b981;">⚙️ 設定管理（Simple版）</h3>
    <div style="display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap;">
      <button id="btnSimpleExportSettings" class="btn ok small" style="background: #10b981;">
        📤 設定エクスポート
      </button>
      <label for="simpleImportSettings" class="btn ghost small">
        📥 設定インポート
      </label>
      <input type="file" id="simpleImportSettings" accept=".json" style="display: none;">
      <button onclick="showSimpleStatus()" class="btn ghost small">
        📊 ステータス
      </button>
    </div>
    <div class="note mini" style="color: #059669;">
      💡 軽量版：プリセットとGAS設定のみを管理します
    </div>
    <div id="simpleStatus" style="display: none; margin-top: 10px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 12px;">
    </div>
  `;
  
  // 既存の設定パネルの先頭に挿入
  settingsPanel.insertBefore(settingsSection, settingsPanel.firstChild);
  
  // イベントリスナー
  document.getElementById('btnSimpleExportSettings').onclick = () => window.SimpleSettingsManager.export();
  document.getElementById('simpleImportSettings').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      window.SimpleSettingsManager.import(file);
      e.target.value = "";
    }
  };
  
  console.log("✅ シンプル設定管理UIを追加完了");
}

// 7. グローバル関数（シンプル版）
window.saveSimplePreset = function(mode) {
  const name = prompt(`${mode}モードのプリセット名を入力してください：`);
  if (!name || name.trim() === '') return;
  
  let settings = {};
  if (typeof collectCurrentSettings === 'function') {
    settings = collectCurrentSettings(mode);
  }
  
  const success = window.SimplePresetManager.save(mode, name.trim(), settings);
  if (success) {
    updateSimplePresetList(mode);
  }
};

window.loadSimplePreset = function(mode) {
  const select = document.querySelector(`.simple-preset-select[data-mode="${mode}"]`);
  const presetName = select?.value;
  
  if (!presetName) {
    if (typeof toast === 'function') {
      toast('プリセットを選択してください');
    }
    return;
  }
  
  const preset = window.SimplePresetManager.load(mode, presetName);
  if (preset && typeof applySettingsAdvanced === 'function') {
    applySettingsAdvanced(mode, preset.data);
    if (typeof toast === 'function') {
      toast(`✅ プリセット「${presetName}」を読み込みました`);
    }
  }
};

window.deleteSimplePreset = function(mode) {
  const select = document.querySelector(`.simple-preset-select[data-mode="${mode}"]`);
  const presetName = select?.value;
  
  if (!presetName) {
    if (typeof toast === 'function') {
      toast('削除するプリセットを選択してください');
    }
    return;
  }
  
  if (confirm(`プリセット「${presetName}」を削除しますか？`)) {
    const success = window.SimplePresetManager.delete(mode, presetName);
    if (success) {
      updateSimplePresetList(mode);
    }
  }
};

window.updateSimplePresetList = function(mode) {
  const select = document.querySelector(`.simple-preset-select[data-mode="${mode}"]`);
  if (!select) return;
  
  const presets = window.SimplePresetManager.list(mode);
  select.innerHTML = '<option value="">選択...</option>';
  
  presets.forEach(preset => {
    const option = document.createElement('option');
    option.value = preset.name;
    option.textContent = `${preset.name} (${new Date(preset.created).toLocaleDateString()})`;
    select.appendChild(option);
  });
  
  updateSimpleDeleteButton(mode);
};

window.updateSimpleDeleteButton = function(mode) {
  const select = document.querySelector(`.simple-preset-select[data-mode="${mode}"]`);
  const deleteBtn = select?.parentNode?.querySelector('.btn.bad');
  
  if (deleteBtn) {
    deleteBtn.disabled = !select?.value;
    deleteBtn.style.opacity = select?.value ? '1' : '0.5';
  }
};

window.showSimpleStatus = function() {
  const statusDiv = document.getElementById('simpleStatus');
  if (!statusDiv) return;
  
  const modes = ['production', 'manga', 'planner', 'learning'];
  let totalPresets = 0;
  let statusHTML = '';
  
  modes.forEach(mode => {
    const presets = window.SimplePresetManager.list(mode);
    totalPresets += presets.length;
    statusHTML += `${mode}: ${presets.length}件<br>`;
  });
  
  statusHTML = `📊 プリセット合計: ${totalPresets}件<br>` + statusHTML;
  statusHTML += `💾 ストレージ使用量: ${Object.keys(localStorage).filter(k => k.startsWith('LPM_')).length}項目`;
  
  statusDiv.innerHTML = statusHTML;
  statusDiv.style.display = statusDiv.style.display === 'none' ? 'block' : 'none';
};

// 8. 初期化
function initSimpleOverride() {
  console.log("🚀 Simple Override 初期化開始");
  
  // DOM読み込み完了後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        addSimplePresetControls();
        addSimpleSettingsUI();
        console.log("✅ Simple Override 初期化完了");
      }, 2500); // 既存初期化より後に実行
    });
  } else {
    setTimeout(() => {
      addSimplePresetControls();
      addSimpleSettingsUI();
      console.log("✅ Simple Override 初期化完了");
    }, 2500);
  }
}

// 9. 自動初期化実行
initSimpleOverride();

console.log("✅ Simple Management Override 完了");
