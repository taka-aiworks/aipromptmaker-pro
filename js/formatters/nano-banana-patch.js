// Nano-banana パッチスクリプト
// FORMATTERSオブジェクトが存在しない場合の緊急対応

(function() {
  'use strict';
  
  console.log('🍌 Nano-banana パッチスクリプト開始');
  
  // FORMATTERSオブジェクトが存在しない場合は作成
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
  }
  
  // Nano-bananaフォーマッタを追加
  function addNanoBananaFormatter() {
    if (window.NanoBananaFormatter && typeof window.NanoBananaFormatter.formatNanobananaOutput === 'function') {
      
      window.FORMATTERS['nano-banana'] = {
        label: "Nano-banana (Gemini 2.5)",
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
      
      console.log('✅ Nano-banana フォーマッタをパッチで追加しました');
      return true;
    }
    return false;
  }
  
  // 即座に試行
  if (!addNanoBananaFormatter()) {
    // NanoBananaFormatterが読み込まれるまで待機
    let attempts = 0;
    const maxAttempts = 20;
    
    const interval = setInterval(() => {
      attempts++;
      
      if (addNanoBananaFormatter()) {
        clearInterval(interval);
        console.log('✅ Nano-banana フォーマッタをパッチで遅延追加しました');
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('⚠️ NanoBananaFormatterが見つかりません');
      }
    }, 500);
  }
  
  // getFmt関数も作成（必要に応じて）
  if (!window.getFmt) {
    window.getFmt = function(selId, fallback = "a1111") {
      const sel = document.querySelector(selId);
      const value = sel ? sel.value : fallback;
      return window.FORMATTERS[value] || window.FORMATTERS[fallback];
    };
    console.log('✅ getFmt関数を作成しました');
  }
  
  console.log('🍌 Nano-banana パッチスクリプト完了');
  
})();
