// Nano-banana UI統合スクリプト - 重複防止版
// フォーマット選択に追加 + 注意書き表示 + 重複防止

(function() {
  'use strict';
  
  // 初期化フラグ（重複実行防止）
  if (window.nanoBananaUIInitialized) {
    console.log('🍌 Nano-banana UI は既に初期化済みです');
    return;
  }

  /**
   * 重複チェック - 既にオプションが存在するか確認
   * @param {HTMLSelectElement} selectElement - チェック対象のselect要素
   * @returns {boolean} - 既に存在する場合はtrue
   */
  function hasNanoBananaOption(selectElement) {
    if (!selectElement) return false;
    
    const existingOptions = Array.from(selectElement.options);
    return existingOptions.some(option => option.value === 'nano-banana');
  }

  /**
   * 重複するNano-bananaオプションを削除
   * @param {HTMLSelectElement} selectElement - 対象のselect要素
   */
  function removeDuplicateOptions(selectElement) {
    if (!selectElement) return;
    
    const nanoBananaOptions = Array.from(selectElement.options).filter(
      option => option.value === 'nano-banana'
    );
    
    if (nanoBananaOptions.length > 1) {
      console.log(`🔧 ${selectElement.id}: ${nanoBananaOptions.length}個の重複を削除`);
      
      // 最初の1つを残して削除
      for (let i = 1; i < nanoBananaOptions.length; i++) {
        nanoBananaOptions[i].remove();
      }
    }
  }

  /**
   * フォーマット選択にNano-bananaオプションを追加（重複防止版）
   */
  function addNanoBananaOptions() {
    const selectors = [
      { id: 'fmtManga', name: '漫画モード' },
      { id: 'fmtProd', name: '量産モード' },
      { id: 'fmtLearnBatch', name: '学習モード' },
      { id: 'fmtPlanner', name: '撮影モード' }
    ];

    selectors.forEach(({ id, name }) => {
      const selectElement = document.getElementById(id);
      if (!selectElement) {
        console.log(`⚠️ ${name} (${id}) が見つかりません`);
        return;
      }

      // 重複チェック
      if (hasNanoBananaOption(selectElement)) {
        console.log(`ℹ️ ${name} に既にNano-bananaオプションが存在します`);
        removeDuplicateOptions(selectElement); // 重複削除
        return;
      }

      // 新しいオプションを追加
      const option = document.createElement('option');
      option.value = 'nano-banana';
      option.textContent = 'Nano-banana (Gemini 2.5)';
      selectElement.appendChild(option);
      
      console.log(`✅ ${name} にNano-bananaオプションを追加`);
    });
  }

  /**
   * 適切なコンテナ要素を取得する関数
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
      
      // 安全な挿入
      try {
        const selectElement = container.querySelector('select') || 
                             (container.tagName === 'SELECT' ? container : null);
        
        if (selectElement) {
          selectElement.parentNode.insertBefore(notice, selectElement.nextSibling);
        } else {
          const formatLabel = container.querySelector('label');
          if (formatLabel) {
            formatLabel.parentNode.insertBefore(notice, formatLabel.nextSibling);
          } else {
            container.appendChild(notice);
          }
        }
      } catch (e) {
        console.warn('注意書きの挿入に失敗:', e);
        try {
          container.appendChild(notice);
        } catch (e2) {
          console.error('注意書きの挿入が完全に失敗:', e2);
        }
      }
      
    } else if (!show && notice) {
      try {
        notice.remove();
      } catch (e) {
        console.warn('注意書きの削除に失敗:', e);
      }
    }
  }

  /**
   * フォーマット選択変更時のイベントハンドラ
   */
  function handleFormatChange(event) {
    const select = event.target;
    const isNanoBanana = select.value === 'nano-banana';
    
    console.log(`🔄 フォーマット変更: ${select.id} → ${select.value}`);
    
    // 注意書きの表示/非表示を切り替え
    toggleNanoBananaNotice(isNanoBanana, select.parentElement || select);
    
    if (isNanoBanana) {
      console.log(`🍌 Nano-bananaモードが選択されました (${select.id})`);
    }
  }

  /**
   * イベントリスナー設定（重複防止版）
   */
  function setupEventListeners() {
    const formatSelectors = ['fmtManga', 'fmtProd', 'fmtLearnBatch', 'fmtPlanner'];
    let successCount = 0;
    
    formatSelectors.forEach(selectorId => {
      const select = document.getElementById(selectorId);
      if (select) {
        // 既存のイベントリスナーを削除（重複防止）
        select.removeEventListener('change', handleFormatChange);
        // 新しいイベントリスナーを追加
        select.addEventListener('change', handleFormatChange);
        console.log(`✅ ${selectorId} にイベントリスナーを設定`);
        successCount++;
      } else {
        console.log(`⚠️ ${selectorId} が見つかりません`);
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
   * 全体の重複チェックと削除
   */
  function globalDuplicateCheck() {
    console.log('🔍 重複チェック開始...');
    
    const formatSelectors = ['fmtManga', 'fmtProd', 'fmtLearnBatch', 'fmtPlanner'];
    
    formatSelectors.forEach(selectorId => {
      const select = document.getElementById(selectorId);
      if (select) {
        removeDuplicateOptions(select);
      }
    });
    
    console.log('✅ 重複チェック完了');
  }

  /**
   * 初期化関数（重複防止版）
   */
  function initNanoBananaUI() {
    if (window.nanoBananaUIInitialized) {
      console.log('🍌 Nano-banana UI は既に初期化済みです');
      return true;
    }

    console.log('🍌 Nano-banana UI統合を開始...');
    
    try {
      // 1. 既存の重複を削除
      globalDuplicateCheck();
      
      // 2. フォーマットオプション追加
      addNanoBananaOptions();
      
      // 3. イベントリスナー設定
      const setupSuccess = setupEventListeners();
      
      // 4. 既存選択状態確認
      checkExistingSelections();
      
      // 5. 初期化完了フラグ
      window.nanoBananaUIInitialized = true;
      
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
      setTimeout(initNanoBananaUI, 100);
    }
  }

  // グローバル関数として公開
  if (typeof window !== 'undefined') {
    window.NanoBananaUI = {
      addNanoBananaOptions,
      toggleNanoBananaNotice,
      handleFormatChange,
      setupEventListeners,
      checkExistingSelections,
      initNanoBananaUI,
      getContainer,
      hasNanoBananaOption,
      removeDuplicateOptions,
      globalDuplicateCheck
    };
  }

  // 初期化実行
  initialize();
  
  console.log('🍌 Nano-banana UI統合スクリプト（重複防止版）が読み込まれました');
  
})();
