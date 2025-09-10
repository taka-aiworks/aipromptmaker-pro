// Nano-banana UI統合スクリプト
// フォーマット選択に追加 + 注意書き表示

(function() {
  'use strict';
  
  /**
   * フォーマット選択にNano-bananaオプションを追加
   */
  function addNanoBananaOptions() {
    // 漫画モードのフォーマット選択
    const fmtManga = document.getElementById('fmtManga');
    if (fmtManga) {
      const option = document.createElement('option');
      option.value = 'nano-banana';
      option.textContent = 'Nano-banana (Gemini 2.5)';
      fmtManga.appendChild(option);
      console.log('✅ 漫画モードにNano-bananaオプションを追加');
    }
    
    // 量産モードのフォーマット選択
    const fmtProd = document.getElementById('fmtProd');
    if (fmtProd) {
      const option = document.createElement('option');
      option.value = 'nano-banana';
      option.textContent = 'Nano-banana (Gemini 2.5)';
      fmtProd.appendChild(option);
      console.log('✅ 量産モードにNano-bananaオプションを追加');
    }
    
    // 学習モードのフォーマット選択（あれば）
    const fmtLearn = document.getElementById('fmtLearnBatch');
    if (fmtLearn) {
      const option = document.createElement('option');
      option.value = 'nano-banana';
      option.textContent = 'Nano-banana (Gemini 2.5)';
      fmtLearn.appendChild(option);
      console.log('✅ 学習モードにNano-bananaオプションを追加');
    }
    
    // 撮影モードのフォーマット選択（あれば）
    const fmtPlanner = document.getElementById('fmtPlanner');
    if (fmtPlanner) {
      const option = document.createElement('option');
      option.value = 'nano-banana';
      option.textContent = 'Nano-banana (Gemini 2.5)';
      fmtPlanner.appendChild(option);
      console.log('✅ 撮影モードにNano-bananaオプションを追加');
    }
  }
  
  /**
   * 注意書きを表示/非表示する関数
   * @param {boolean} show - 表示するかどうか
   * @param {HTMLElement} container - 注意書きを表示するコンテナ
   */
  function toggleNanoBananaNotice(show, container) {
    let notice = container.querySelector('.nano-banana-notice');
    
    if (show && !notice) {
      // 注意書きを作成
      notice = document.createElement('div');
      notice.className = 'nano-banana-notice';
      notice.style.cssText = `
        margin: 10px 0;
        padding: 12px;
        background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
        border: 1px solid #ffeaa7;
        border-radius: 8px;
        color: #856404;
        font-size: 13px;
        line-height: 1.4;
      `;
      notice.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 16px;">🍌</span>
          <div>
            <strong>Nano-banana (Gemini 2.5) モード</strong><br>
            • 画像編集特化：既存画像をアップロードして編集指示を入力<br>
            • SFW限定：成人向けコンテンツは非対応<br>
            • 基本キャラ情報は自動除外（髪色・目色・服装など）<br>
            • <strong>使用方法：</strong>Geminiに画像をアップロード → 生成された指示文を入力
          </div>
        </div>
      `;
      
      // 安全な挿入位置を見つける
      try {
        const formatLabel = container.querySelector('label');
        if (formatLabel) {
          // formatLabelの親要素に挿入
          const parent = formatLabel.parentElement;
          if (parent && parent.contains(formatLabel)) {
            parent.insertBefore(notice, formatLabel.nextSibling);
          } else {
            container.appendChild(notice);
          }
        } else {
          // フォーマット選択が見つからない場合はコンテナの最後に追加
          container.appendChild(notice);
        }
      } catch (e) {
        console.warn('注意書きの挿入に失敗:', e);
        // フォールバック：コンテナの最後に追加
        container.appendChild(notice);
      }
      
    } else if (!show && notice) {
      // 注意書きを削除
      notice.remove();
    }
  }
  
  /**
   * フォーマット選択変更時のイベントハンドラ
   * @param {Event} event - 変更イベント
   */
  function handleFormatChange(event) {
    const select = event.target;
    const isNanoBanana = select.value === 'nano-banana';
    const container = select.closest('.panel') || select.closest('.card') || select.parentElement;
    
    // 注意書きの表示/非表示を切り替え
    toggleNanoBananaNotice(isNanoBanana, container);
    
    if (isNanoBanana) {
      console.log(`🍌 Nano-bananaモードが選択されました (${select.id})`);
    }
  }
  
  /**
   * イベントリスナーを設定
   */
  function setupEventListeners() {
    // 各モードのフォーマット選択にイベントリスナーを追加
    const formatSelectors = ['fmtManga', 'fmtProd', 'fmtLearnBatch', 'fmtPlanner'];
    
    formatSelectors.forEach(selectorId => {
      const select = document.getElementById(selectorId);
      if (select) {
        select.addEventListener('change', handleFormatChange);
        console.log(`✅ ${selectorId} にイベントリスナーを設定`);
      }
    });
  }
  
  /**
   * 初期化関数
   */
  function initNanoBananaUI() {
    console.log('🍌 Nano-banana UI統合を開始...');
    
    // フォーマットオプション追加
    addNanoBananaOptions();
    
    // イベントリスナー設定
    setupEventListeners();
    
    console.log('✅ Nano-banana UI統合完了');
  }
  
  /**
   * DOM読み込み完了後に初期化
   */
  function initialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initNanoBananaUI);
    } else {
      // 既にDOMが読み込まれている場合は即座に実行
      setTimeout(initNanoBananaUI, 100);
    }
  }
  
  // グローバル関数として公開（デバッグ用）
  if (typeof window !== 'undefined') {
    window.NanoBananaUI = {
      addNanoBananaOptions,
      toggleNanoBananaNotice,
      handleFormatChange,
      setupEventListeners,
      initNanoBananaUI
    };
  }
  
  // 初期化実行
  initialize();
  
})();
