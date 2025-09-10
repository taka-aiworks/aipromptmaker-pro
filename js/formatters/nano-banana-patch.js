// Nano-banana パッチスクリプト - 改良版
// FORMATTERSオブジェクトが存在しない場合の緊急対応 + 改良版対応

(function() {
  'use strict';
  
  console.log('🍌 Nano-banana 改良版パッチスクリプト開始');
  
  /**
   * FORMATTERSオブジェクトの基本構造を作成
   */
  function createBasicFormatters() {
    if (!window.FORMATTERS) {
      console.log('⚠️ FORMATTERSオブジェクトが存在しません。作成します...');
      
      window.FORMATTERS = {
        a1111: { 
          label: "Web UI（汎用）",
          line: (p, n, seed) => `Prompt: ${p}\nNegative prompt: ${n}\nSeed: ${seed}`,
          csvHeader: ['"no"', '"seed"', '"prompt"', '"negative"'],
          csvRow: (i, seed, p, n) => [
            `"${i}"`, `"${seed}"`, 
            `"${p.replace(/"/g, '""')}"`, 
            `"${n.replace(/"/g, '""')}"`
          ].join(",")
        },
        invoke: { 
          label: "InvokeAI",
          line: (p, n, seed) => `invoke --prompt "${p}" --negative_prompt "${n}" --seed ${seed}`,
          csvHeader: ['"no"', '"command"'],
          csvRow: (i, seed, p, n) => [
            `"${i}"`,
            `"invoke --prompt \\"${p.replace(/"/g, '""')}\\" --negative_prompt \\"${n.replace(/"/g, '""')}\\" --seed ${seed}"`
          ].join(",")
        },
        comfy: { 
          label: "ComfyUI（テキスト）",
          line: (p, n, seed) => `positive="${p}"\nnegative="${n}"\nseed=${seed}`,
          csvHeader: ['"no"', '"seed"', '"positive"', '"negative"'],
          csvRow: (i, seed, p, n) => [
            `"${i}"`, `"${seed}"`, 
            `"${p.replace(/"/g, '""')}"`, 
            `"${n.replace(/"/g, '""')}"`
          ].join(",")
        },
        sdnext: { 
          label: "SD.Next（dream.py）",
          line: (p, n, seed) => `python dream.py -p "${p}" -n "${n}" -S ${seed}`,
          csvHeader: ['"no"', '"command"'],
          csvRow: (i, seed, p, n) => [
            `"${i}"`,
            `"python dream.py -p \\"${p.replace(/"/g, '""')}\\" -n \\"${n.replace(/"/g, '""')}\\" -S ${seed}"`
          ].join(",")
        },
        nai: { 
          label: "NovelAI",
          line: (p, n, seed) => `Prompt: ${p}\nUndesired: ${n}\nSeed: ${seed}`,
          csvHeader: ['"no"', '"seed"', '"prompt"', '"undesired"'],
          csvRow: (i, seed, p, n) => [
            `"${i}"`, `"${seed}"`, 
            `"${p.replace(/"/g, '""')}"`, 
            `"${n.replace(/"/g, '""')}"`
          ].join(",")
        }
      };
      
      console.log('✅ FORMATTERSオブジェクトを作成しました');
      return true;
    }
    return false;
  }

  /**
   * SFW辞書の存在確認と警告
   */
  function checkSFWDictionary() {
    if (!window.DEFAULT_SFW_DICT?.SFW) {
      console.warn('⚠️ SFW辞書が見つかりません。カテゴリベースフィルタリングが制限されます。');
      console.log('💡 dict/default_sfw.js が正しく読み込まれているか確認してください。');
      return false;
    }
    
    const categoryCount = Object.keys(window.DEFAULT_SFW_DICT.SFW).length;
    console.log(`✅ SFW辞書が見つかりました（${categoryCount}カテゴリ）`);
    return true;
  }

  /**
   * 改良版Nano-bananaフォーマッタを追加
   */
  function addImprovedNanoBananaFormatter() {
    // NanoBananaFormatterの存在確認
    if (!window.NanoBananaFormatter) {
      console.warn('⚠️ NanoBananaFormatterが見つかりません');
      return false;
    }

    // 改良版関数の存在確認
    const requiredFunctions = [
      'filterTagsByCategory',
      'generateAdvancedEditInstruction', 
      'formatNanobananaOutput'
    ];

    const missingFunctions = requiredFunctions.filter(fn => 
      typeof window.NanoBananaFormatter[fn] !== 'function'
    );

    if (missingFunctions.length > 0) {
      console.warn('⚠️ 改良版関数が不足:', missingFunctions);
      
      // フォールバック：従来版関数を使用
      if (typeof window.NanoBananaFormatter.formatNanobananaOutput === 'function') {
        console.log('🔄 従来版フォーマッタにフォールバック');
        addLegacyNanoBananaFormatter();
        return true;
      }
      return false;
    }

    // 改良版フォーマッタを追加
    window.FORMATTERS['nano-banana'] = {
      label: "Nano-banana (Gemini 2.5)",
      format: window.NanoBananaFormatter.formatNanobananaOutput,
      line: window.NanoBananaFormatter.formatNanobananaOutput,
      csvHeader: ['"no"', '"instruction"', '"filtered_tags"', '"excluded_count"', '"original"'],
      csvRow: function(i, seed, prompt, negativePrompt) {
        const filteredPrompt = window.NanoBananaFormatter.filterTagsByCategory(prompt);
        const editInstruction = window.NanoBananaFormatter.generateAdvancedEditInstruction(filteredPrompt);
        const originalCount = prompt.split(',').length;
        const filteredCount = filteredPrompt ? filteredPrompt.split(',').length : 0;
        const excludedCount = originalCount - filteredCount;
        
        const escapedInstruction = `"${editInstruction.replace(/"/g, '""')}"`;
        const escapedFiltered = `"${filteredPrompt.replace(/"/g, '""')}"`;
        const escapedOriginal = `"${prompt.replace(/"/g, '""')}"`;
        
        return [
          `"${i}"`,
          escapedInstruction, 
          escapedFiltered,
          `"${excludedCount}"`,
          escapedOriginal
        ].join(",");
      }
    };
    
    console.log('✅ Nano-banana 改良版フォーマッタをパッチで追加しました');
    return true;
  }

  /**
   * 従来版フォーマッタ（フォールバック用）
   */
  function addLegacyNanoBananaFormatter() {
    window.FORMATTERS['nano-banana'] = {
      label: "Nano-banana (Gemini 2.5) [Legacy]",
      format: window.NanoBananaFormatter.formatNanobananaOutput,
      line: window.NanoBananaFormatter.formatNanobananaOutput,
      csvHeader: ['"no"', '"instruction"', '"filtered_tags"', '"original"'],
      csvRow: function(i, seed, prompt, negativePrompt) {
        const filteredPrompt = window.NanoBananaFormatter.filterBasicInfo(prompt);
        const editInstruction = window.NanoBananaFormatter.generateEditInstruction(filteredPrompt);
        const escapedInstruction = `"${editInstruction.replace(/"/g, '""')}"`;
        const escapedFiltered = `"${filteredPrompt.replace(/"/g, '""')}"`;
        const escapedOriginal = `"${prompt.replace(/"/g, '""')}"`;
        return [
          `"${i}"`,
          escapedInstruction,
          escapedFiltered,
          escapedOriginal
        ].join(",");
      }
    };
    
    console.log('✅ Nano-banana 従来版フォーマッタをパッチで追加しました');
    return true;
  }

  /**
   * getFmt関数の作成
   */
  function createGetFmtFunction() {
    if (!window.getFmt) {
      window.getFmt = function(selId, fallback = "a1111") {
        const sel = document.querySelector(selId);
        const value = sel ? sel.value : fallback;
        return window.FORMATTERS[value] || window.FORMATTERS[fallback];
      };
      console.log('✅ getFmt関数を作成しました');
    }
  }

  /**
   * デバッグ情報表示
   */
  function showDebugInfo() {
    console.log('🔍 デバッグ情報:');
    console.log('  FORMATTERS:', !!window.FORMATTERS);
    console.log('  nano-banana formatter:', !!window.FORMATTERS?.['nano-banana']);
    console.log('  NanoBananaFormatter:', !!window.NanoBananaFormatter);
    console.log('  SFW Dictionary:', !!window.DEFAULT_SFW_DICT?.SFW);
    
    if (window.NanoBananaFormatter) {
      console.log('  Available functions:', Object.keys(window.NanoBananaFormatter));
    }
  }

  /**
   * メイン初期化処理
   */
  function initializePatch() {
    console.log('🔧 パッチ初期化開始...');
    
    // 1. 基本構造作成
    createBasicFormatters();
    
    // 2. SFW辞書確認
    const hasSFWDict = checkSFWDictionary();
    
    // 3. Nano-bananaフォーマッタ追加試行
    const nanoBananaAdded = addImprovedNanoBananaFormatter();
    
    // 4. getFmt関数作成
    createGetFmtFunction();
    
    // 5. デバッグ情報表示
    showDebugInfo();
    
    // 6. 結果レポート
    console.log('📊 パッチ適用結果:');
    console.log('  ✅ FORMATTERSオブジェクト: OK');
    console.log(`  ${hasSFWDict ? '✅' : '⚠️'} SFW辞書: ${hasSFWDict ? 'OK' : 'Missing'}`);
    console.log(`  ${nanoBananaAdded ? '✅' : '❌'} Nano-banana: ${nanoBananaAdded ? 'OK' : 'Failed'}`);
    
    return nanoBananaAdded;
  }

  /**
   * 遅延初期化（NanoBananaFormatterを待機）
   */
  function waitForNanoBananaFormatter() {
    if (initializePatch()) {
      return;
    }
    
    console.log('⏳ NanoBananaFormatterの読み込みを待機中...');
    let attempts = 0;
    const maxAttempts = 30; // 15秒間待機
    
    const interval = setInterval(() => {
      attempts++;
      
      if (initializePatch()) {
        clearInterval(interval);
        console.log('✅ Nano-banana フォーマッタを遅延初期化しました');
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('⚠️ NanoBananaFormatterの読み込みがタイムアウトしました');
        console.log('💡 nano-banana.js が正しく読み込まれているか確認してください');
      }
    }, 500);
  }

  /**
   * 複数タイミングでの初期化実行
   */
  function scheduleInitialization() {
    // 即座に実行
    waitForNanoBananaFormatter();
    
    // DOMContentLoaded時にも実行
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForNanoBananaFormatter);
    }
    
    // window.load時にも実行
    window.addEventListener('load', waitForNanoBananaFormatter);
    
    // 追加の遅延実行（他のスクリプトが読み込まれるのを待つ）
    setTimeout(waitForNanoBananaFormatter, 2000);
  }

  // グローバル関数として公開（デバッグ用）
  if (typeof window !== 'undefined') {
    window.NanoBananaPatch = {
      initializePatch,
      waitForNanoBananaFormatter,
      checkSFWDictionary,
      addImprovedNanoBananaFormatter,
      addLegacyNanoBananaFormatter,
      showDebugInfo
    };
  }

  // 初期化スケジュール実行
  scheduleInitialization();
  
  console.log('🍌 Nano-banana 改良版パッチスクリプト完了');
  
})();
