// Nano-banana (Gemini 2.5 Flash Image) フォーマッタ - 強化版
// 画像編集特化の出力形式 - 辞書外タグ対応版

(function() {
  'use strict';
  
  /**
   * カテゴリベースフィルタリング設定
   */
  const CATEGORY_CONFIG = {
    // キャラクター基本属性（完全除外）
    EXCLUDE_BASIC: [
      'age', 'gender', 'body_type', 'height', 'hair_style', 
      'hair_length', 'bangs_style', 'eyes', 'face', 
      'skin_features', 'skin_body', 'colors'
    ],

    // 編集指示に有用（保持）
    KEEP_EDITING: [
      'pose', 'pose_manga', 'expressions', 'background', 'lighting', 
      'composition', 'view', 'hand_gesture', 'props_light', 'effect_manga',
      'movement_action', 'gaze', 'mouth_state', 'eye_state', 'emotion_primary',
      'emotion_detail', 'camera_angle', 'focal_length', 'depth_of_field',
      'photo_technique', 'lighting_type', 'light_direction', 'time_of_day',
      'season_weather', 'physical_state', 'art_style'
    ],

    // 条件付き保持（スマート判定）
    CONDITIONAL: [
      'worldview', 'speech_tone', 'outfit', 'accessories', 'occupation', 'relationship'
    ],

    // 技術的要素（除外）
    EXCLUDE_TECH: [
      'negative_presets', 'negative_categories', 'negative_quick_presets'
    ]
  };

  /**
   * 辞書に存在しないが除外すべきタグのパターン（正規表現ベース）
   */
  const EXCLUDE_PATTERNS = {
    // 人数・性別
    gender_count: /^(1|2|3|4|5|6|multiple|solo|duo|trio|group|many|several)?(girl|boy|man|woman|male|female|person|people|character|characters)s?$/i,
    
    // 髪色
    hair_color: /^(blonde?|black|brown|red|white|silver|gray|grey|pink|blue|green|purple|orange|yellow)[\s-]?(hair|haired)$/i,
    
    // 目色
    eye_color: /^(blue|brown|green|red|purple|pink|yellow|amber|hazel|gray|grey|heterochromia)[\s-]?(eyes?|eyed)$/i,
    
    // 肌色
    skin_color: /^(pale|fair|light|dark|tan|tanned|olive|brown|black|white)[\s-]?(skin|skinned|complexion)$/i,
    
    // 髪の長さ・スタイル（より詳細）
    hair_length: /^(very\s+)?(long|short|medium|shoulder[\s-]?length|waist[\s-]?length|hip[\s-]?length|floor[\s-]?length)[\s-]?hair$/i,
    hair_style: /^(straight|curly|wavy|braided|tied|loose|messy|neat|spiky|fluffy)[\s-]?hair$/i,
    
    // 年齢
    age: /^(young|old|teen|teenage|adult|mature|elderly|child|kid|loli|shota|milf|dilf)$/i,
    
    // 体型
    body_type: /^(slim|thin|skinny|fat|chubby|thick|curvy|muscular|athletic|petite|tall|short|small|large|huge|tiny)$/i,
    
    // 基本服装
    basic_clothing: /^(naked|nude|topless|bottomless|underwear|bra|panties|lingerie)$/i,
    
    // 品質タグ（技術的）
    quality: /^(masterpiece|best[\s-]?quality|high[\s-]?quality|ultra[\s-]?detailed|extremely[\s-]?detailed|detailed|8k|4k|hd|uhd|photorealistic|realistic|anime|manga|illustration)$/i,
    
    // アーティスト・著作権
    artist: /^(by\s+|artist:|\(artist\)|style\s+of|in\s+the\s+style\s+of)/i,
    
    // 評価・投票
    rating: /^(rating:|score_\d+|upvotes|downvotes|favorites)$/i
  };

  /**
   * 条件付きカテゴリの保持判定ルール
   */
  const CONDITIONAL_RULES = {
    worldview: ['fantasy', 'sci-fi', 'steampunk', 'cyberpunk', 'medieval', 'historical', 'modern', 'urban', 'rural', 'space', 'underwater'],
    speech_tone: ['cheerful', 'serious', 'mysterious', 'playful', 'gentle', 'rough'],
    outfit: ['armor', 'costume', 'uniform', 'traditional', 'fantasy', 'futuristic', 'magical', 'warrior', 'maid', 'witch', 'knight', 'princess'],
    accessories: ['weapon', 'staff', 'wand', 'shield', 'crown', 'mask', 'wings', 'magical', 'fantasy', 'special'],
    occupation: ['warrior', 'mage', 'knight', 'princess', 'witch', 'assassin', 'hero', 'villain', 'pirate', 'ninja', 'samurai'],
    relationship: ['couple', 'friends', 'family', 'group', 'team', 'party']
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
      "mountain": "set background to mountain scene",
      "classroom": "change background to classroom setting"
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
   * 正規表現パターンマッチングで除外すべきタグかチェック
   */
  function shouldExcludeByPattern(tag) {
    const normalizedTag = tag.trim();
    
    for (const [patternName, pattern] of Object.entries(EXCLUDE_PATTERNS)) {
      if (pattern.test(normalizedTag)) {
        return { shouldExclude: true, reason: patternName, pattern: pattern.source };
      }
    }
    
    return { shouldExclude: false, reason: null, pattern: null };
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
   * 強化版カテゴリベースフィルタリング（辞書外タグ対応）
   */
  function filterTagsByCategory(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return '';
    }

    const tags = prompt.split(',').map(tag => tag.trim()).filter(Boolean);
    const filteredTags = [];
    const excludedInfo = {
      basic: [],
      pattern: [],
      tech: [],
      conditional: []
    };

    tags.forEach(tag => {
      // Step 1: 正規表現パターンチェック（辞書外タグ対応）
      const patternResult = shouldExcludeByPattern(tag);
      if (patternResult.shouldExclude) {
        excludedInfo.pattern.push({ tag, reason: patternResult.reason });
        console.log(`🚫 Pattern exclude: "${tag}" (${patternResult.reason})`);
        return;
      }

      // Step 2: SFW辞書カテゴリチェック
      const category = getTagCategory(tag);
      
      if (!category) {
        // 辞書にないタグで、パターンにも引っかからない場合は保持
        filteredTags.push(tag);
        console.log(`✅ Keep: "${tag}" (not in dictionary, passed pattern check)`);
        return;
      }

      // Step 3: カテゴリベース判定
      if (CATEGORY_CONFIG.EXCLUDE_BASIC.includes(category)) {
        excludedInfo.basic.push(tag);
        console.log(`🚫 Exclude basic: "${tag}" (${category})`);
      } else if (CATEGORY_CONFIG.EXCLUDE_TECH.includes(category)) {
        excludedInfo.tech.push(tag);
        console.log(`🚫 Exclude tech: "${tag}" (${category})`);
      } else if (CATEGORY_CONFIG.CONDITIONAL.includes(category)) {
        if (shouldKeepConditionalTag(tag, category)) {
          filteredTags.push(tag);
          console.log(`✅ Keep conditional: "${tag}" (${category})`);
        } else {
          excludedInfo.conditional.push(tag);
          console.log(`🚫 Exclude conditional: "${tag}" (${category})`);
        }
      } else if (CATEGORY_CONFIG.KEEP_EDITING.includes(category)) {
        filteredTags.push(tag);
        console.log(`✅ Keep editing: "${tag}" (${category})`);
      } else {
        // 未分類カテゴリは保持（安全側に倒す）
        filteredTags.push(tag);
        console.log(`✅ Keep unknown: "${tag}" (${category})`);
      }
    });

    // デバッグ情報
    console.log('🍌 Nano-banana 強化版フィルタリング結果:');
    console.log('  保持:', filteredTags.length, '個');
    console.log('  除外（基本）:', excludedInfo.basic.length, '個');
    console.log('  除外（パターン）:', excludedInfo.pattern.length, '個');
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
   * Nano-banana用出力フォーマット関数（強化版）
   */
  function formatNanobananaOutput(prompt, negativePrompt, seed) {
    // Step 1: 強化版フィルタリング
    const filteredPrompt = filterTagsByCategory(prompt);
    
    // Step 2: 高度な編集指示文生成
    const editInstruction = generateAdvancedEditInstruction(filteredPrompt);
    
    // Step 3: 出力フォーマット構築
    const output = `🍌 Nano-banana Edit Instruction:
"${editInstruction}"

⚠️ Note: Character attributes filtered using enhanced pattern matching
- Dictionary-based: hair, eyes, face, skin features by category
- Pattern-based: 1girl, 2boys, blue eyes, blonde hair, etc.
- Quality tags: masterpiece, best quality, detailed, etc.

📋 Usage in Gemini 2.5 Flash Image:
1. Upload your original image to Gemini
2. Enter the above instruction text
3. Generate the edited image

🔧 Filtered tags: ${filteredPrompt || 'None (all were character attributes)'}

🎯 Original prompt: ${prompt.split(',').length} tags
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
  // この関数定義は残す
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
        console.log('✅ Nano-banana 強化版フォーマッタを遅延追加しました');
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
      shouldExcludeByPattern,
      
      // 従来版互換性
      filterBasicInfo,
      generateEditInstruction,
      
      // 設定オブジェクト
      CATEGORY_CONFIG,
      CONDITIONAL_RULES,
      EDIT_INSTRUCTIONS,
      EXCLUDE_PATTERNS
    };
    
    console.log('🍌 Nano-banana 強化版フォーマッタが読み込まれました');
    console.log('📊 除外パターン数:', Object.keys(EXCLUDE_PATTERNS).length);
  }
  
})();
