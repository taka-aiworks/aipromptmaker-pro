// Nano-banana UI統合スクリプト - 修正版
// フォーマット選択に追加 + 注意書き表示 + container参照エラー修正

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
   * 適切なコンテナ要素を取得する関数
   * @param {HTMLElement|string} elementOrId - 要素またはID
   * @returns {HTMLElement|null} - コンテナ要素
   */
  function getContainer(elementOrId) {
    let element;
    
    if (typeof elementOrId === 'string') {
      element = document.getElementById(elementOrId);
    } else if (elementOrId && elementOrId.nodeType === Node.ELEMENT_NODE) {
      element = elementOrId;
    } else {
      console.warn('無効なコンテナ指定:', elementOrId);
      return null;
    }
    
    if (!element) {
      console.warn('コンテナ要素が見つかりません:', elementOrId);
      return null;
    }
    
    // select要素の場合は、その親要素を取得
    if (element.tagName === 'SELECT') {
      return element.parentElement || element;
    }
    
    return element;
  }

  /**
   * 注意書きを表示/非表示する関数
   * @param {boolean} show - 表示するかどうか
   * @param {HTMLElement|string} containerRef - 注意書きを表示するコンテナ（要素またはID）
   */
  function toggleNanoBananaNotice(show, containerRef) {
    const container = getContainer(containerRef);
    if (!container) {
      console.warn('注意書き表示用のコンテナが見つかりません');
      return;
    }
    
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
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      `;
      notice.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 16px;">🍌</span>
          <div>
            <strong>Nano-banana (Gemini 2.5) モード</strong><br>
            • <strong>画像編集特化</strong>：既存画像をアップロードして編集指示を入力<br>
            • <strong>SFW限定</strong>：成人向けコンテンツは非対応<br>
            • <strong>自動フィルタリング</strong>：基本キャラ情報は自動除外（髪色・目色・服装など）<br>
            • <strong>使用方法</strong>：Gemini 2.5に画像をアップロード → 生成された指示文を入力
          </div>
        </div>
      `;
      
      // 安全な挿入位置を見つける
      try {
        // select要素の直後に挿入
        const selectElement = container.querySelector('select') || 
                             (container.tagName === 'SELECT' ? container : null);
        
        if (selectElement) {
          // select要素の直後に挿入
          selectElement.parentNode.insertBefore(notice, selectElement.nextSibling);
        } else {
          // select要素が見つからない場合は、labelの直後を探す
          const formatLabel = container.querySelector('label');
          if (formatLabel) {
            formatLabel.parentNode.insertBefore(notice, formatLabel.nextSibling);
          } else {
            // 最終手段：コンテナの最後に追加
            container.appendChild(notice);
          }
        }
      } catch (e) {
        console.warn('注意書きの挿入に失敗:', e);
        // フォールバック：コンテナの最後に追加
        try {
          container.appendChild(notice);
        } catch (e2) {
          console.error('注意書きの挿入が完全に失敗:', e2);
        }
      }
      
    } else if (!show && notice) {
      // 注意書きを削除
      try {
        notice.remove();
      } catch (e) {
        console.warn('注意書きの削除に失敗:', e);
      }
    }
  }

  /**
   * フォーマット選択変更時のイベントハンドラ
   * @param {Event} event - 変更イベント
   */
  function handleFormatChange(event) {
    const select = event.target;
    const isNanoBanana = select.value === 'nano-banana';
    
    console.log(`🔄 フォーマット変更: ${select.id} → ${select.value}`);
    
    // 注意書きの表示/非表示を切り替え（select要素の親を渡す）
    toggleNanoBananaNotice(isNanoBanana, select.parentElement || select);
    
    if (isNanoBanana) {
      console.log(`🍌 Nano-bananaモードが選択されました (${select.id})`);
    }
  }

  /**
   * 特定のselect要素にイベントリスナーを設定
   * @param {string} selectorId - select要素のID
   */
  function setupEventListenerForSelect(selectorId) {
    const select = document.getElementById(selectorId);
    if (select) {
      // 既存のイベントリスナーを削除（重複防止）
      select.removeEventListener('change', handleFormatChange);
      // 新しいイベントリスナーを追加
      select.addEventListener('change', handleFormatChange);
      console.log(`✅ ${selectorId} にイベントリスナーを設定`);
      return true;
    } else {
      console.log(`⚠️ ${selectorId} が見つかりません`);
      return false;
    }
  }

  /**
   * 全モードのイベントリスナーを設定
   */
  function setupEventListeners() {
    const formatSelectors = ['fmtManga', 'fmtProd', 'fmtLearnBatch', 'fmtPlanner'];
    let successCount = 0;
    
    formatSelectors.forEach(selectorId => {
      if (setupEventListenerForSelect(selectorId)) {
        successCount++;
      }
    });
    
    console.log(`✅ ${successCount}/${formatSelectors.length} のフォーマット選択にイベントリスナーを設定`);
    return successCount;
  }

  /**
   * 既存の選択状態を確認して注意書きを表示
   */
  function checkExistingSelections() {
    const formatSelectors = ['fmtManga', 'fmtProd', 'fmtLearnBatch', 'fmtPlanner'];
    
    formatSelectors.forEach(selectorId => {
      const select = document.getElementById(selectorId);
      if (select && select.value === 'nano-banana') {
        console.log(`🍌 ${selectorId} で既にNano-bananaが選択されています`);
        toggleNanoBananaNotice(true, select.parentElement || select);
      }
    });
  }

  /**
   * 初期化関数
   */
  function initNanoBananaUI() {
    console.log('🍌 Nano-banana UI統合を開始...');
    
    try {
      // フォーマットオプション追加
      addNanoBananaOptions();
      
      // イベントリスナー設定
      const setupSuccess = setupEventListeners();
      
      // 既存選択状態確認
      checkExistingSelections();
      
      console.log('✅ Nano-banana UI統合完了');
      return setupSuccess > 0;
      
    } catch (error) {
      console.error('❌ Nano-banana UI統合でエラーが発生:', error);
      return false;
    }
  }

  /**
   * DOM読み込み完了後に初期化
   */
  function initialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initNanoBananaUI);
    } else {
      // 既にDOMが読み込まれている場合は少し遅延して実行
      setTimeout(initNanoBananaUI, 100);
    }
  }

  /**
   * 遅延初期化（他のスクリプトが要素を追加するのを待つ）
   */
  function delayedInitialization() {
    let attempts = 0;
    const maxAttempts = 10;
    
    const retryInit = () => {
      attempts++;
      const success = initNanoBananaUI();
      
      if (!success && attempts < maxAttempts) {
        console.log(`🔄 UI初期化をリトライ (${attempts}/${maxAttempts})`);
        setTimeout(retryInit, 1000);
      }
    };
    
    retryInit();
  }

  // グローバル関数として公開（デバッグ用）
  if (typeof window !== 'undefined') {
    window.NanoBananaUI = {
      addNanoBananaOptions,
      toggleNanoBananaNotice,
      handleFormatChange,
      setupEventListeners,
      setupEventListenerForSelect,
      checkExistingSelections,
      initNanoBananaUI,
      getContainer
    };
  }

  // 複数のタイミングで初期化実行
  initialize();
  
  // 追加の遅延初期化
  setTimeout(delayedInitialization, 2000);
  
  console.log('🍌 Nano-banana UI統合スクリプトが読み込まれました');
  
})();
