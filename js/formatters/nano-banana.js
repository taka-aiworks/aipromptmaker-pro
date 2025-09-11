// nano-banana.js - Nano-banana完全版フォーマッタ（上書き用）
// Google Gemini 2.5 Flash Image 専用プロンプトフォーマッタ
// テンプレート方式による効率的実装 - SFW辞書完全対応

(function() {
  'use strict';
  
  console.log('🍌 Nano-banana SFW辞書完全対応版を読み込み中...');

  /**
   * SFWカテゴリテンプレート設定
   * 20個のテンプレートで全カテゴリをカバー
   */
  const CATEGORY_TEMPLATES = {
    // === 表情系 ===
    expressions: "change expression to {tag}",
    emotion_primary: "change expression to {tag}",
    emotion_detail: "make the character look {tag}",
    mouth_state: "change the character's mouth to {tag}",
    eye_state: "change the character's eyes to {tag}",
    gaze: "make the character look {tag}",

    // === ポーズ系 ===
    pose: "pose the character {tag}",
    pose_manga: "pose the character {tag}",
    hand_gesture: "make the character {tag}",
    movement_action: "make the character {tag}",

    // === 背景・環境系 ===
    background: "set background to {tag}",
    worldview: "set setting to {tag}",
    season_weather: "set to {tag}",

    // === 照明系 ===
    lighting: "add {tag} lighting",
    lighting_type: "add {tag}",
    light_direction: "add {tag}",
    time_of_day: "set to {tag} time",

    // === 構図・撮影系 ===
    composition: "use {tag} composition",
    view: "change to {tag}",
    camera_angle: "use {tag} camera angle",
    focal_length: "use {tag}",
    depth_of_field: "use {tag}",
    photo_technique: "apply {tag} technique",

    // === 演出・エフェクト系 ===
    effect_manga: "add {tag} effect",
    
    // === アクセサリ・小道具系 ===
    accessories: "add {tag} to character",
    props_light: "give character a {tag}",

    // === スタイル系 ===
    art_style: "use {tag}",
    speech_tone: "make character speak {tag}"
  };

  /**
   * 特殊ケース用オーバーライド
   * 自然な英語表現が必要な少数のケースのみ
   */
  const SPECIAL_OVERRIDES = {
    gaze: {
      "at_viewer": "make the character look at viewer",
      "away": "make the character look away",
      "down": "make the character look down",
      "up": "make the character look up"
    },
    hand_gesture: {
      "peace_sign": "make the character show peace sign",
      "thumbs_up": "make the character give thumbs up",
      "ok_sign": "make the character show OK sign",
      "waving": "make the character wave"
    },
    background: {
      "plain_background": "use plain background",
      "white_background": "use white background"
    },
    emotion_primary: {
      "joy": "change expression to joyful",
      "anger": "change expression to angry",
      "sadness": "change expression to sad"
    },
    pose: {
      "arms_crossed": "pose the character with arms crossed",
      "hands_on_hips": "pose the character with hands on hips"
    }
  };

  /**
   * SFWカテゴリ分類設定（完全版）
   * 全47カテゴリを適切に分類
   */
  const SFW_CATEGORY_CONFIG = {
    // キャラクター基本属性（除外対象）
    EXCLUDE_CATEGORIES: [
      'age', 'gender', 'body_type', 'height', 
      'hair_style', 'hair_length', 'bangs_style', 
      'eyes', 'face', 'skin_features', 'skin_body', 'colors',
      'occupation', 'relationship', 'physical_state',
      'negative_presets', 'negative_categories', 'negative_quick_presets'
    ],
    
    // 編集指示に有用（保持対象）
    KEEP_CATEGORIES: [
      'expressions', 'pose', 'background', 'lighting', 'composition', 'view', 'art_style', 'accessories',
      'worldview', 'emotion_primary', 'emotion_detail', 'mouth_state', 'eye_state', 'gaze',
      'pose_manga', 'hand_gesture', 'props_light', 'effect_manga', 'movement_action',
      'camera_angle', 'focal_length', 'depth_of_field', 'photo_technique',
      'lighting_type', 'light_direction', 'time_of_day', 'season_weather', 'speech_tone'
    ],
    
    // 条件付き保持
    CONDITIONAL_CATEGORIES: ['outfit']
  };

  /**
   * パターン除外用正規表現（辞書外タグ用）
   */
  const FALLBACK_EXCLUDE_PATTERNS = [
    /^(1|2|3|4|5|6|multiple|solo|duo|trio|group)?(girl|boy|man|woman|male|female|person|people|character)s?$/i,
    /^(blonde?|black|brown|red|white|silver|gray|grey|pink|blue|green|purple|orange|yellow|aqua|cyan|magenta)[\s-]?(hair|haired|eyes?|eyed)$/i,
    /^(young|old|teen|teenage|adult|mature|elderly|child|kid|tall|short|slim|thin|fat|petite|curvy|muscular)$/i,
    /^(masterpiece|best[\s-]?quality|high[\s-]?quality|detailed|8k|4k|hd|realistic|anime|illustration)$/i,
    /^(by\s+|artist:|rating:|score_\d+).*$/i
  ];

  /**
   * SFW辞書からタグのカテゴリを取得
   */
  function getSFWTagCategory(tag) {
    const sfwDict = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
    if (!sfwDict) {
      console.warn('⚠️ SFW辞書が見つかりません');
      return null;
    }

    const normalizedTag = tag.toLowerCase().trim();
    
    for (const [category, items] of Object.entries(sfwDict)) {
      if (Array.isArray(items)) {
        const found = items.find(item => {
          if (typeof item === 'object' && item !== null) {
            const itemTag = (item.tag || '').toLowerCase();
            const itemLabel = (item.label || item.ja || '').toLowerCase();
            return itemTag === normalizedTag || itemLabel === normalizedTag;
          } else if (typeof item === 'string') {
            return item.toLowerCase() === normalizedTag;
          }
          return false;
        });
        
        if (found) {
          console.log(`📂 タグ "${tag}" → カテゴリ: ${category}`);
          return category;
        }
      }
    }
    
    console.log(`❓ タグ "${tag}" → 辞書にありません`);
    return null;
  }

  /**
   * 指示文生成（テンプレート方式）
   */
  function generateInstructionFromCategory(tag, category) {
    const normalizedTag = tag.toLowerCase();
    
    // Step 1: 特殊ケースチェック
    if (SPECIAL_OVERRIDES[category] && SPECIAL_OVERRIDES[category][normalizedTag]) {
      return SPECIAL_OVERRIDES[category][normalizedTag];
    }

    // Step 2: テンプレート適用
    const template = CATEGORY_TEMPLATES[category];
    if (!template) {
      console.warn(`⚠️ カテゴリ "${category}" のテンプレートが見つかりません`);
      return `modify ${tag}`;
    }

    // Step 3: タグ前処理
    let processedTag = processTagForInstruction(tag, category);
    
    // Step 4: テンプレート展開
    return template.replace('{tag}', processedTag);
  }

  /**
   * タグ前処理（カテゴリ別調整）
   */
  function processTagForInstruction(tag, category) {
    let processed = tag.toLowerCase().replace(/_/g, ' ');
    
    // カテゴリ別特殊処理
    switch (category) {
      case 'emotion_primary':
        if (processed === 'joy') processed = 'joyful';
        if (processed === 'anger') processed = 'angry';
        if (processed === 'sadness') processed = 'sad';
        break;
        
      case 'time_of_day':
        processed = processed.replace(/\s*time$/, '');
        break;
        
      case 'lighting':
      case 'lighting_type':
        processed = processed.replace(/\s*light(ing)?$/, '');
        break;
        
      case 'photo_technique':
        processed = processed.replace(/\s*technique$/, '');
        break;
    }
    
    return processed;
  }

  /**
   * 条件付きカテゴリの保持判定
   */
  function shouldKeepConditionalTag(tag, category) {
    if (category === 'outfit') {
      const normalizedTag = tag.toLowerCase();
      const specialOutfits = [
        'armor', 'costume', 'uniform', 'traditional', 'kimono',
        'dress', 'wedding', 'formal', 'fantasy', 'magical',
        'warrior', 'knight', 'princess', 'witch', 'maid',
        'nun', 'nurse', 'police', 'military', 'sailor'
      ];
      return specialOutfits.some(special => normalizedTag.includes(special));
    }
    return false;
  }

  /**
   * 正規表現による補助チェック（辞書にないタグ用）
   */
  function shouldExcludeByPattern(tag) {
    return FALLBACK_EXCLUDE_PATTERNS.some(pattern => pattern.test(tag.trim()));
  }

  /**
   * メインのプロンプト処理関数（SFW辞書ベース完全版）
   */
  function processNanoBananaCorrect(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return {
        instruction: "Edit the image.\n[Important]: Please preserve the existing character features.",
        expression: "not specified",
        poseItem: "not specified",
        excludedTags: "",
        preservedTags: ""
      };
    }

    const tags = prompt.split(',').map(tag => tag.trim()).filter(Boolean);
    const excludedTags = [];
    const preservedTags = [];
    const instructions = [];

    console.log('🔍 Nano-banana SFW辞書完全対応処理開始');
    console.log('入力タグ数:', tags.length);

    // タグ分類処理
    tags.forEach(tag => {
      // Step 1: SFW辞書でカテゴリ判定
      const category = getSFWTagCategory(tag);
      
      if (category) {
        // カテゴリベース判定
        if (SFW_CATEGORY_CONFIG.EXCLUDE_CATEGORIES.includes(category)) {
          excludedTags.push(tag);
          console.log(`🚫 除外（${category}）: ${tag}`);
        } else if (SFW_CATEGORY_CONFIG.KEEP_CATEGORIES.includes(category)) {
          preservedTags.push(tag);
          
          // テンプレート方式で指示文生成
          const instruction = generateInstructionFromCategory(tag, category);
          if (instruction) {
            instructions.push(instruction);
            console.log(`✅ 保持+指示（${category}）: ${tag} → ${instruction}`);
          } else {
            console.log(`✅ 保持（${category}）: ${tag}`);
          }
        } else if (SFW_CATEGORY_CONFIG.CONDITIONAL_CATEGORIES.includes(category)) {
          if (shouldKeepConditionalTag(tag, category)) {
            preservedTags.push(tag);
            console.log(`✅ 条件付き保持（${category}）: ${tag}`);
          } else {
            excludedTags.push(tag);
            console.log(`🚫 条件付き除外（${category}）: ${tag}`);
          }
        } else {
          // 未分類カテゴリは保持（安全側）
          preservedTags.push(tag);
          console.log(`✅ 未分類保持（${category}）: ${tag}`);
        }
      } else {
        // Step 2: 辞書にない場合は正規表現チェック
        if (shouldExcludeByPattern(tag)) {
          excludedTags.push(tag);
          console.log(`🚫 パターン除外: ${tag}`);
        } else {
          preservedTags.push(tag);
          instructions.push(`add ${tag.replace(/_/g, ' ')}`);
          console.log(`✅ パターン保持: ${tag}`);
        }
      }
    });

    // 最終指示文構築
    let finalInstruction = "Edit the image.";
    
    if (instructions.length > 0) {
      // 重複除去
      const uniqueInstructions = [...new Set(instructions)];
      finalInstruction += "\n" + uniqueInstructions.join("\n");
    }
    
    finalInstruction += "\n[Important]: Please preserve the existing character features.";

    console.log('📊 処理結果:');
    console.log('  保持:', preservedTags.length, '個');
    console.log('  除外:', excludedTags.length, '個');
    console.log('  指示文:', instructions.length, '個');

    return {
      instruction: finalInstruction,
      expression: "processed by template",
      poseItem: "processed by template",
      excludedTags: excludedTags.join(', '),
      preservedTags: preservedTags.join(', ')
    };
  }

/**
 * 最終出力フォーマット（ネガティブプロンプト対応版）
 */
function formatNanoBananaCorrect(prompt, negativePrompt, seed) {
  const result = processNanoBananaCorrect(prompt);
  
  // 基本の編集指示
  let output = result.instruction;
  
  // ネガティブプロンプトがある場合は追加
  if (negativePrompt && negativePrompt.trim() !== '') {
    output += `\n\nNegative: ${negativePrompt.trim()}`;
  }
  
  return output;
}

  /**
   * デバッグ・テスト用関数
   */
  function testSFWDictBasedProcessing() {
    console.log('🧪 SFW辞書完全対応処理テスト開始');
    
    const testCases = [
      "joy, delighted, sparkling_eyes, at_viewer, grin, peace_sign",
      "1girl, smiling, standing, long hair, blue eyes, school uniform, masterpiece",
      "serious, arms crossed, office, dramatic lighting",
      "happy, waving, park, sunset, casual outfit"
    ];
    
    testCases.forEach((testPrompt, index) => {
      console.log(`\n--- テストケース ${index + 1} ---`);
      console.log('入力:', testPrompt);
      
      const result = processNanoBananaCorrect(testPrompt);
      console.log('保持タグ:', result.preservedTags);
      console.log('除外タグ:', result.excludedTags);
      
      const output = formatNanoBananaCorrect(testPrompt, "", 123);
      console.log('最終出力:');
      console.log(output);
    });
    
    console.log('\n✅ SFW辞書完全対応処理テスト完了');
  }

  /**
   * 統計情報表示
   */
  function showNanoBananaStats() {
    console.log('📊 Nano-banana統計情報:');
    console.log(`  カテゴリテンプレート: ${Object.keys(CATEGORY_TEMPLATES).length}個`);
    console.log(`  特殊オーバーライド: ${Object.values(SPECIAL_OVERRIDES).reduce((sum, cat) => sum + Object.keys(cat).length, 0)}個`);
    console.log(`  除外カテゴリ: ${SFW_CATEGORY_CONFIG.EXCLUDE_CATEGORIES.length}個`);
    console.log(`  保持カテゴリ: ${SFW_CATEGORY_CONFIG.KEEP_CATEGORIES.length}個`);
    console.log(`  条件付きカテゴリ: ${SFW_CATEGORY_CONFIG.CONDITIONAL_CATEGORIES.length}個`);
    console.log(`  除外パターン: ${FALLBACK_EXCLUDE_PATTERNS.length}個`);
    
    // SFW辞書の存在確認
    const sfwDict = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
    if (sfwDict) {
      const categoryCount = Object.keys(sfwDict).length;
      console.log(`  SFW辞書: ${categoryCount}カテゴリ検出`);
    } else {
      console.warn('⚠️ SFW辞書が見つかりません');
    }
  }

  /**
   * 初期化とグローバル公開
   */
  function initialize() {
    // グローバル関数として公開（後方互換性）
    window.processNanoBananaCorrect = processNanoBananaCorrect;
    window.formatNanoBananaCorrect = formatNanoBananaCorrect;
    window.getSFWTagCategory = getSFWTagCategory;
    window.testSFWDictBasedProcessing = testSFWDictBasedProcessing;
    window.showNanoBananaStats = showNanoBananaStats;
    
    // 新機能も公開
    window.generateInstructionFromCategory = generateInstructionFromCategory;
    window.shouldKeepConditionalTag = shouldKeepConditionalTag;
    
    // 設定オブジェクトも公開
    window.SFW_CATEGORY_CONFIG = SFW_CATEGORY_CONFIG;
    window.CATEGORY_TEMPLATES = CATEGORY_TEMPLATES;
    window.SPECIAL_OVERRIDES = SPECIAL_OVERRIDES;

    // FORMATTERS定義（app.js統合用）
    const NANO_BANANA_FORMATTER = {
      name: "Nano-banana (Gemini 2.5)",
      description: "Google Gemini 2.5 Flash Image用の画像編集フォーマッタ",
      format: formatNanoBananaCorrect,
      supportsNegative: true,  // ネガティブプロンプト対応
      supportsSeed: false,
      notes: "⚠️ 画像編集専用。NSFW非対応。キャラクター基本属性は自動除外されます。"
    };
    window.NANO_BANANA_FORMATTER = NANO_BANANA_FORMATTER;
    
    console.log('✅ Nano-banana完全版の関数をグローバルに公開');
    
    // SFW辞書の存在確認
    setTimeout(() => {
      const sfwDict = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
      if (sfwDict) {
        const categoryCount = Object.keys(sfwDict).length;
        console.log(`✅ SFW辞書検出: ${categoryCount}カテゴリ`);
      } else {
        console.warn('⚠️ SFW辞書が見つかりません');
      }
    }, 1000);
    
    console.log('🍌 Nano-banana SFW辞書完全対応版の初期化完了');
  }

  /**
   * DOM読み込み完了後に初期化
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();

// ブラウザコンソールでテスト可能:
// testSFWDictBasedProcessing();
// getSFWTagCategory("joy");
// processNanoBananaCorrect("joy, delighted, sparkling_eyes, at_viewer, grin, peace_sign");
// formatNanoBananaCorrect("serious, arms crossed, office, dramatic lighting");
// showNanoBananaStats();
