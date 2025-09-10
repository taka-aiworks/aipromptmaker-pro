// Nano-banana (Gemini 2.5 Flash Image) フォーマッタ - 改良版
// 画像編集特化の出力形式 - SFW辞書カテゴリベースフィルタリング対応

(function() {
  'use strict';
  
  /**
   * カテゴリベースフィルタリング設定
   */
  const CATEGORY_CONFIG = {
    // キャラクター基本属性（完全除外）
    EXCLUDE_BASIC: [
      'age',           // 年齢
      'gender',        // 性別  
      'body_type',     // 体型
      'height',        // 身長
      'hair_style',    // 髪型
      'hair_length',   // 髪の長さ
      'bangs_style',   // 前髪スタイル
      'eyes',          // 目
      'face',          // 顔
      'skin_features', // 肌の特徴
      'skin_body',     // 肌・身体特徴
      'colors'         // 髪色・目色などの色情報
    ],

    // 編集指示に有用（保持）
    KEEP_EDITING: [
      'pose',             // ポーズ
      'pose_manga',       // 漫画ポーズ
      'expressions',      // 表情
      'background',       // 背景
      'lighting',         // 照明
      'composition',      // 構図
      'view',            // 視点
      'hand_gesture',    // ジェスチャー
      'props_light',     // 小道具
      'effect_manga',    // エフェクト
      'movement_action', // 動作
      'gaze',           // 視線
      'mouth_state',    // 口の状態
      'eye_state',      // 目の状態
      'emotion_primary',// 感情（基本）
      'emotion_detail', // 感情（詳細）
      'camera_angle',   // カメラアングル
      'focal_length',   // 焦点距離
      'depth_of_field', // 被写界深度
      'photo_technique',// 撮影技法
      'lighting_type',  // 照明タイプ
      'light_direction',// 光の方向
      'time_of_day',    // 時間帯
      'season_weather', // 季節・天候
      'physical_state', // 身体状態
      'art_style'       // 画風
    ],

    // 条件付き保持（スマート判定）
    CONDITIONAL: [
      'worldview',      // 世界観（背景系のみ保持）
      'speech_tone',    // 口調（表情系のみ保持）
      'outfit',         // 服装（特殊衣装のみ保持）
      'accessories',    // アクセサリー（特殊道具のみ保持）
      'occupation',     // 職業（背景・設定系のみ保持）
      'relationship'    // 関係性（複数人の場合のみ保持）
    ],

    // 技術的要素（除外）
    EXCLUDE_TECH: [
      'negative_presets',
      'negative_categories', 
      'negative_quick_presets'
    ]
  };

  /**
   * 条件付きカテゴリの保持判定ルール
   */
  const CONDITIONAL_RULES = {
    worldview: [
      'fantasy', 'sci-fi', 'steampunk', 'cyberpunk', 'medieval', 
      'historical', 'modern', 'urban', 'rural', 'space', 'underwater'
    ],
    speech_tone: [
      'cheerful', 'serious', 'mysterious', 'playful', 'gentle', 'rough'
    ],
    outfit: [
      'armor', 'costume', 'uniform', 'traditional', 'fantasy', 'futuristic',
      'magical', 'warrior', 'maid', 'witch', 'knight', 'princess'
    ],
    accessories: [
      'weapon', 'staff', 'wand', 'shield', 'crown', 'mask', 'wings',
      'magical', 'fantasy', 'special'
    ],
    occupation: [
      'warrior', 'mage', 'knight', 'princess', 'witch', 'assassin',
      'hero', 'villain', 'pirate', 'ninja', 'samurai'
    ],
    relationship: [
      'couple', 'friends', 'family', 'group', 'team', 'party'
    ]
  };

  /**
   * 編集指示パターン（改良版）
   */
  const EDIT_INSTRUCTIONS = {
    pose: {
      "standing": "change pose to standing",
      "sitting": "change pose to sitting", 
      "running": "change pose to running",
      "walking": "change pose to walking",
      "lying": "change pose to lying down",
      "arms crossed": "change pose to arms crossed",
      "hands on hips": "change pose to hands on hips",
      "waving": "make the character waving",
      "jumping": "change pose to jumping",
      "kneeling": "change pose to kneeling"
    },
    expressions: {
      "smiling": "change expression to smiling",
      "serious": "change expression to serious", 
      "surprised": "change expression to surprised",
      "angry": "change expression to angry",
      "sad": "change expression to sad",
      "happy": "change expression to happy",
      "confused": "change expression to confused",
      "embarrassed": "change expression to embarrassed",
      "determined": "change expression to determined",
      "worried": "change expression to worried"
    },
    background: {
      "school": "change background to school setting",
      "park": "set background to park scene",
      "beach": "change background to beach scene", 
      "city": "set background to city scene",
      "forest": "change background to forest scene",
      "room": "set background to indoor room",
      "cafe": "change background to cafe setting",
      "library": "set background to library",
      "castle": "change background to castle",
      "mountain": "set background to mountain scene"
    },
    lighting: {
      "soft": "add soft lighting",
      "dramatic": "add dramatic lighting",
      "golden hour": "add golden hour lighting",
      "sunset": "add sunset lighting",
      "moonlight": "add moonlight",
      "studio": "add studio lighting",
      "natural": "add natural lighting",
      "warm": "add warm lighting"
    },
    effect_manga: {
      "sparkles": "add sparkle effects",
      "speed lines": "add speed lines",
      "impact": "add impact effects",
      "wind": "add wind effect",
      "cherry blossoms": "add cherry blossom petals",
      "bubbles": "add soap bubbles",
      "stars": "add starry effect",
      "flowers": "add flower petals"
    }
  };

  /**
   * SFW辞書からタグのカテゴリを取得する関数
   */
  function getTagCategory(tag) {
    const sfwDict = window.DEFAULT_SFW_DICT?.SFW;
    if (!sfwDict) {
      console.warn('SFW辞書が見つかりません');
      return null;
    }

    const normalizedTag = tag.toLowerCase().trim();
    
    // 全カテゴリを検索
    for (const [category, items] of Object.entries(sfwDict)) {
      if (Array.isArray(items)) {
        const found = items.find(item => {
          if (typeof item === 'object' && item.tag) {
            return item.tag.toLowerCase() === normalizedTag;
          }
          return false;
        });
        
        if (found) {
          return category;
        }
      }
    }
    
    return null; // 辞書にないタグ
  }

  /**
   * タグが条件付きカテゴリで保持すべきかを判定
   */
  function shouldKeepConditionalTag(tag, category) {
    const rules = CONDITIONAL_RULES[category];
    if (!rules) return false;
    
    const normalizedTag = tag.toLowerCase();
    return rules.some(rule => normalizedTag.includes(rule.toLowerCase()));
  }

  /**
   * カテゴリベースでタグをフィルタリング（改良版）
   */
  function filterTagsByCategory(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return '';
    }

    const tags = prompt.split(',').map(tag => tag.trim()).filter(Boolean);
    const filteredTags = [];
    const excludedInfo = {
      basic: [],
      tech: [],
      conditional: []
    };

    tags.forEach(tag => {
      const category = getTagCategory(tag);
      
      if (!category) {
        // 辞書にないタグは保持（カスタムタグの可能性）
        filteredTags.push(tag);
        return;
      }

      if (CATEGORY_CONFIG.EXCLUDE_BASIC.includes(category)) {
        // 基本属性は除外
        excludedInfo.basic.push(tag);
      } else if (CATEGORY_CONFIG.EXCLUDE_TECH.includes(category)) {
        // 技術的要素は除外
        excludedInfo.tech.push(tag);
      } else if (CATEGORY_CONFIG.CONDITIONAL.includes(category)) {
        // 条件付きカテゴリは判定
        if (shouldKeepConditionalTag(tag, category)) {
          filteredTags.push(tag);
        } else {
          excludedInfo.conditional.push(tag);
        }
      } else if (CATEGORY_CONFIG.KEEP_EDITING.includes(category)) {
        // 編集有用カテゴリは保持
        filteredTags.push(tag);
      } else {
        // 未分類カテゴリは保持（安全側に倒す）
        filteredTags.push(tag);
      }
    });

    // デバッグ情報
    console.log('🍌 Nano-banana フィルタリング結果:');
    console.log('  保持:', filteredTags.length, '個');
    console.log('  除外（基本）:', excludedInfo.basic.length, '個');
    console.log('  除外（条件付き）:', excludedInfo.conditional.length, '個');
    console.log('  除外（技術）:', excludedInfo.tech.length, '個');

    return filteredTags.join(', ');
  }

  /**
   * 高度な編集指示文生成
   */
  function generateAdvancedEditInstruction(filteredPrompt) {
    if (!filteredPrompt || filteredPrompt.trim() === '') {
      return "Make small adjustments to improve the image";
    }

    const instructions = [];
    const tags = filteredPrompt.split(',').map(tag => tag.trim()).filter(Boolean);

    // カテゴリ別の指示生成
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

    // より柔軟なマッチング
    if (instructions.length === 0) {
      // カテゴリベースの汎用指示生成
      const categorizedTags = {};
      
      tags.forEach(tag => {
        const category = getTagCategory(tag);
        if (category && CATEGORY_CONFIG.KEEP_EDITING.includes(category)) {
          if (!categorizedTags[category]) {
            categorizedTags[category] = [];
          }
          categorizedTags[category].push(tag);
        }
      });

      // カテゴリごとに指示を生成
      Object.entries(categorizedTags).forEach(([category, categoryTags]) => {
        if (categoryTags.length > 0) {
          switch (category) {
            case 'pose':
            case 'pose_manga':
              instructions.push(`Change pose to ${categoryTags[0]}`);
              break;
            case 'expressions':
              instructions.push(`Change expression to ${categoryTags[0]}`);
              break;
            case 'background':
              instructions.push(`Set background to ${categoryTags[0]}`);
              break;
            case 'lighting':
            case 'lighting_type':
              instructions.push(`Add ${categoryTags[0]} lighting`);
              break;
            case 'effect_manga':
              instructions.push(`Add ${categoryTags.join(' and ')} effects`);
              break;
            case 'gaze':
              instructions.push(`Change gaze to ${categoryTags[0]}`);
              break;
            case 'hand_gesture':
              instructions.push(`Change hand gesture to ${categoryTags[0]}`);
              break;
            default:
              instructions.push(`Add ${categoryTags.join(', ')} to the image`);
          }
        }
      });
    }

    // 指示がない場合の最終フォールバック
    if (instructions.length === 0 && tags.length > 0) {
      const firstFewTags = tags.slice(0, 3);
      instructions.push(`Incorporate ${firstFewTags.join(', ')} into the image`);
    }

    // 重複除去と結合
    const uniqueInstructions = [...new Set(instructions)];
    return uniqueInstructions.join(', ');
  }

  /**
   * Nano-banana用出力フォーマット関数（改良版）
   */
  function formatNanobananaOutput(prompt, negativePrompt, seed) {
    // Step 1: カテゴリベースフィルタリング
    const filteredPrompt = filterTagsByCategory(prompt);
    
    // Step 2: 高度な編集指示文生成
    const editInstruction = generateAdvancedEditInstruction(filteredPrompt);
    
    // Step 3: 出力フォーマット構築
    const output = `🍌 Nano-banana Edit Instruction:
"${editInstruction}"

⚠️ Note: Character attributes filtered using SFW dictionary categories
- Excluded: age, gender, body type, hair, eyes, face, skin features
- Kept: pose, expression, background, lighting, effects, composition

📋 Usage in Gemini 2.5 Flash Image:
1. Upload your original image to Gemini
2. Enter the above instruction text
3. Generate the edited image

🔧 Filtered tags: ${filteredPrompt || 'None (all were character attributes)'}

🎯 Original prompt contained: ${prompt.split(',').length} tags
🔄 After filtering: ${filteredPrompt ? filteredPrompt.split(',').length : 0} tags preserved`;

    return output;
  }

  /**
   * 従来版との互換性関数
   */
  function filterBasicInfo(prompt) {
    console.warn('⚠️ filterBasicInfo() is deprecated. Use filterTagsByCategory() instead.');
    return filterTagsByCategory(prompt);
  }

  function generateEditInstruction(filteredPrompt) {
    console.warn('⚠️ generateEditInstruction() is deprecated. Use generateAdvancedEditInstruction() instead.');
    return generateAdvancedEditInstruction(filteredPrompt);
  }

  /**
   * FORMATTERSオブジェクトに追加
   */
  function addFormatterToGlobal() {
    if (typeof window !== 'undefined' && window.FORMATTERS) {
      window.FORMATTERS['nano-banana'] = {
        label: "Nano-banana (Gemini 2.5)",
        format: formatNanobananaOutput,
        line: formatNanobananaOutput,
        csvHeader: ['"no"', '"instruction"', '"filtered_tags"', '"excluded_count"', '"original"'],
        csvRow: function(i, seed, prompt, negativePrompt) {
          const filteredPrompt = filterTagsByCategory(prompt);
          const editInstruction = generateAdvancedEditInstruction(filteredPrompt);
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
      
      console.log('✅ Nano-banana 改良版フォーマッタが追加されました');
      return true;
    }
    return false;
  }

  /**
   * 初期化とフォーマッタ登録
   */
  function waitForFORMATTERS() {
    if (addFormatterToGlobal()) {
      return;
    }
    
    let attempts = 0;
    const maxAttempts = 50;
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      if (addFormatterToGlobal()) {
        clearInterval(checkInterval);
        console.log('✅ Nano-banana 改良版フォーマッタを遅延追加しました');
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.warn('⚠️ FORMATTERS オブジェクトが見つかりません（タイムアウト）');
      }
    }, 500);
  }

  // 複数のタイミングで実行を試行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForFORMATTERS);
  } else {
    waitForFORMATTERS();
  }
  
  window.addEventListener('load', waitForFORMATTERS);

  // グローバル関数として公開（デバッグ・互換性用）
  if (typeof window !== 'undefined') {
    window.NanoBananaFormatter = {
      // 新しい関数
      filterTagsByCategory,
      generateAdvancedEditInstruction,
      formatNanobananaOutput,
      getTagCategory,
      shouldKeepConditionalTag,
      
      // 従来版互換性
      filterBasicInfo,
      generateEditInstruction,
      
      // 設定オブジェクト
      CATEGORY_CONFIG,
      CONDITIONAL_RULES,
      EDIT_INSTRUCTIONS
    };
    
    console.log('🍌 Nano-banana 改良版フォーマッタが読み込まれました');
    console.log('📊 カテゴリ設定:', CATEGORY_CONFIG);
  }
  
})();
