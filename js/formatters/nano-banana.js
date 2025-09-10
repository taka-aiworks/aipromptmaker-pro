// Nano-banana (Gemini 2.5 Flash Image) フォーマッタ
// 画像編集特化の出力形式

(function() {
  'use strict';
  
  // 基本情報フィルタリング（除外対象）
  const BASIC_INFO_FILTERS = [
    // 人数・性別
    '1girl', '1boy', 'solo', 'multiple girls', 'multiple boys',
    // 髪関連
    'long hair', 'short hair', 'medium hair', 'blonde hair', 'brown hair', 'black hair', 
    'red hair', 'white hair', 'silver hair', 'gray hair', 'twintails', 'ponytail',
    // 目関連  
    'blue eyes', 'brown eyes', 'green eyes', 'red eyes', 'purple eyes', 'yellow eyes', 
    'pink eyes', 'gray eyes', 'heterochromia',
    // 基本的な身体特徴
    'tall', 'short', 'slim', 'curvy', 'muscular', 'petite', 'mature',
    // 基本服装
    'school uniform', 'casual clothes', 'formal wear', 'dress', 'shirt', 'pants',
    // 年齢・体型
    'child', 'teenager', 'adult', 'elderly', 'young', 'old'
  ];
  
  // 編集指示パターン（漫画モード準拠）
  const EDIT_INSTRUCTIONS = {
    pose: {
      "standing": "make the character standing",
      "sitting": "change pose to sitting",
      "running": "change pose to running",
      "walking": "change pose to walking",
      "lying": "change pose to lying down",
      "arms crossed": "change pose to arms crossed",
      "hands on hips": "change pose to hands on hips",
      "waving": "make the character waving"
    },
    background: {
      "school": "change background to school setting",
      "park": "set background to park scene",
      "beach": "change background to beach scene",
      "city": "set background to city scene",
      "forest": "change background to forest scene",
      "room": "set background to indoor room",
      "cafe": "change background to cafe setting",
      "library": "set background to library"
    },
    effects: {
      "rain": "add rain effect",
      "snow": "add falling snow",
      "sunlight": "add warm sunlight",
      "sparkles": "add sparkle effects",
      "wind": "add wind effect",
      "cherry blossoms": "add cherry blossom petals",
      "bubbles": "add soap bubbles",
      "stars": "add starry effect"
    },
    expression: {
      "smiling": "change expression to smiling",
      "serious": "change expression to serious",
      "surprised": "change expression to surprised",
      "angry": "change expression to angry",
      "sad": "change expression to sad",
      "happy": "change expression to happy",
      "confused": "change expression to confused",
      "embarrassed": "change expression to embarrassed"
    },
    composition: {
      "close-up": "change to close-up shot",
      "full body": "change to full body shot",
      "upper body": "change to upper body shot",
      "portrait": "change to portrait view",
      "wide shot": "change to wide shot"
    }
  };
  
  /**
   * 基本情報をフィルタリング（除外）する関数
   * @param {string} prompt - 元のプロンプト
   * @returns {string} - フィルタリング後のプロンプト
   */
  function filterBasicInfo(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return '';
    }
    
    // プロンプトをタグ単位に分割
    const tags = prompt.split(',').map(tag => tag.trim()).filter(Boolean);
    
    // 除外対象でないタグのみを残す
    const filteredTags = tags.filter(tag => {
      const normalizedTag = tag.toLowerCase();
      return !BASIC_INFO_FILTERS.some(filter => 
        normalizedTag.includes(filter.toLowerCase())
      );
    });
    
    return filteredTags.join(', ');
  }
  
  /**
   * 編集指示文を生成する関数
   * @param {string} filteredPrompt - フィルタリング済みプロンプト
   * @returns {string} - 編集指示文
   */
  function generateEditInstruction(filteredPrompt) {
    if (!filteredPrompt || filteredPrompt.trim() === '') {
      return "Make small adjustments to improve the image";
    }
    
    const instructions = [];
    const tags = filteredPrompt.split(',').map(tag => tag.trim()).filter(Boolean);
    
    // 各カテゴリごとに編集指示を生成
    Object.entries(EDIT_INSTRUCTIONS).forEach(([category, patterns]) => {
      tags.forEach(tag => {
        const normalizedTag = tag.toLowerCase();
        Object.entries(patterns).forEach(([key, instruction]) => {
          if (normalizedTag.includes(key.toLowerCase())) {
            instructions.push(instruction);
          }
        });
      });
    });
    
    // 指示がない場合は汎用的な指示を生成
    if (instructions.length === 0) {
      const remainingTags = tags.slice(0, 3); // 最初の3つのタグを使用
      if (remainingTags.length > 0) {
        instructions.push(`Add ${remainingTags.join(', ')} to the image`);
      }
    }
    
    // 重複を除去して結合
    const uniqueInstructions = [...new Set(instructions)];
    return uniqueInstructions.join(', ');
  }
  
  /**
   * Nano-banana用出力フォーマット関数
   * @param {string} prompt - 元のプロンプト
   * @param {string} negativePrompt - ネガティブプロンプト（未使用）
   * @param {number} seed - シード値（未使用）
   * @returns {string} - フォーマット済み出力
   */
  function formatNanobananaOutput(prompt, negativePrompt, seed) {
    // Step 1: 基本情報をフィルタリング
    const filteredPrompt = filterBasicInfo(prompt);
    
    // Step 2: 編集指示文を生成
    const editInstruction = generateEditInstruction(filteredPrompt);
    
    // Step 3: 出力フォーマットを構築
    const output = `🍌 Nano-banana Edit Instruction:
"${editInstruction}"

⚠️ Note: Basic character attributes (hair, eyes, clothing) are filtered out 
to avoid conflicts with existing image

📋 Usage in Gemini:
1. Upload your original image to Gemini
2. Enter the above instruction
3. Generate edited image

🔧 Original filtered tags: ${filteredPrompt || 'None'}`;
    
    return output;
  }
  
  // FORMATTERSオブジェクトにNano-bananaフォーマッタを追加
  if (typeof window !== 'undefined' && window.FORMATTERS) {
    window.FORMATTERS['nano-banana'] = {
      label: "Nano-banana (Gemini 2.5)",
      format: formatNanobananaOutput,
      line: formatNanobananaOutput,
      csvHeader: ['"no"', '"instruction"', '"filtered_tags"', '"original"'],
      csvRow: function(i, seed, prompt, negativePrompt) {
        const filteredPrompt = filterBasicInfo(prompt);
        const editInstruction = generateEditInstruction(filteredPrompt);
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
    
    console.log('✅ Nano-banana フォーマッタが追加されました');
  } else {
    console.warn('⚠️ FORMATTERS オブジェクトが見つかりません');
  }
  
  // デバッグ用関数をグローバルに公開
  if (typeof window !== 'undefined') {
    window.NanoBananaFormatter = {
      filterBasicInfo,
      generateEditInstruction,
      formatNanobananaOutput,
      BASIC_INFO_FILTERS,
      EDIT_INSTRUCTIONS
    };
  }
  
})();
