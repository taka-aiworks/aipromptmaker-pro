// Nano-banana (Gemini 2.5 Flash Image) フォーマッタ - SFW辞書ベース完全実装版
// ChatGPT正式フォーマット + SFW辞書カテゴリ判定

(function() {
  'use strict';
  
  console.log('🍌 Nano-banana SFW辞書ベース版を読み込み中...');
  
  /**
   * SFW辞書カテゴリ分類設定
   */
  const SFW_CATEGORY_CONFIG = {
    // 完全除外カテゴリ（キャラクター基本属性）
    EXCLUDE_CATEGORIES: [
      'age', 'gender', 'body_type', 'height', 
      'hair_style', 'hair_length', 'bangs_style', 
      'eyes', 'face', 'skin_features', 'skin_body', 
      'colors', 'personality'
    ],

    // 編集指示に有用（保持対象）
    KEEP_CATEGORIES: [
      'expressions', 'pose', 'background', 'lighting', 
      'composition', 'view', 'art_style', 'accessories'
    ],

    // 条件付き保持（内容により判定）
    CONDITIONAL_CATEGORIES: [
      'outfit' // 基本服装は除外、特殊衣装は保持
    ]
  };

  /**
   * カテゴリ別自然言語パターン（英語指示文）
   */
  const CATEGORY_PATTERNS = {
    // 表情カテゴリ
    expressions: {
      "smiling": "Make the character smile",
      "serious": "Change expression to serious", 
      "happy": "Make the character look happy",
      "sad": "Change expression to sad",
      "angry": "Make the character look angry",
      "surprised": "Change expression to surprised",
      "confused": "Make the character look confused",
      "embarrassed": "Change expression to embarrassed",
      "worried": "Make the character look worried",
      "determined": "Change expression to determined",
      "neutral": "Change expression to neutral",
      "excited": "Make the character look excited",
      "sleepy": "Change expression to sleepy",
      "crying": "Make the character cry",
      "laughing": "Make the character laugh",
      "winking": "Make the character wink",
      "blushing": "Add a blush to the character's face"
    },

    // ポーズカテゴリ
    pose: {
      "standing": "Pose the character standing upright",
      "sitting": "Change pose to sitting position", 
      "lying": "Pose the character lying down",
      "running": "Change pose to running motion",
      "walking": "Pose the character walking",
      "jumping": "Change pose to jumping",
      "kneeling": "Pose the character kneeling",
      "dancing": "Change pose to dancing",
      "stretching": "Pose the character stretching",
      "arms crossed": "Pose the character with arms crossed",
      "hands on hips": "Pose the character with hands on hips",
      "waving": "Make the character wave",
      "pointing": "Pose the character pointing",
      "peace sign": "Make the character show peace sign",
      "thumbs up": "Pose the character giving thumbs up",
      "saluting": "Change pose to saluting",
      "praying": "Pose the character with hands in prayer",
      "reaching out": "Pose the character reaching out"
    },

    // 背景カテゴリ
    background: {
      "school": "Change background to school setting",
      "classroom": "Set background to classroom scene",
      "park": "Change background to park scene",
      "beach": "Set background to beach scene", 
      "city": "Change background to city scene",
      "forest": "Set background to forest scene",
      "mountain": "Change background to mountain scene",
      "room": "Set background to indoor room",
      "bedroom": "Change background to bedroom setting",
      "kitchen": "Set background to kitchen scene",
      "cafe": "Change background to cafe setting",
      "library": "Set background to library scene",
      "office": "Change background to office setting",
      "hospital": "Set background to hospital scene",
      "castle": "Change background to castle scene",
      "garden": "Set background to garden scene",
      "street": "Change background to street scene",
      "train": "Set background to train scene",
      "plain": "Use plain background",
      "white": "Set background to white"
    },

    // ライティングカテゴリ
    lighting: {
      "soft": "Add soft lighting",
      "natural": "Use natural lighting",
      "warm": "Add warm lighting",
      "bright": "Increase lighting brightness",
      "dim": "Make lighting dimmer",
      "dramatic": "Add dramatic lighting",
      "studio": "Use studio lighting",
      "sunset": "Add sunset lighting",
      "golden hour": "Add golden hour lighting",
      "moonlight": "Add moonlight",
      "candlelight": "Add candlelight",
      "neon": "Add neon lighting",
      "backlight": "Add backlighting",
      "rim light": "Add rim lighting"
    },

    // 構図カテゴリ
    composition: {
      "close up": "Change to close-up composition",
      "medium shot": "Use medium shot composition",
      "full body": "Show full body in composition",
      "upper body": "Focus on upper body",
      "portrait": "Use portrait composition",
      "wide shot": "Change to wide shot composition",
      "from above": "Change camera angle from above",
      "from below": "Change camera angle from below",
      "side view": "Change to side view",
      "back view": "Change to back view"
    },

    // 視点カテゴリ  
    view: {
      "front view": "Change to front view",
      "side view": "Change to side view", 
      "back view": "Change to back view",
      "three-quarter view": "Use three-quarter view",
      "profile view": "Change to profile view",
      "from above": "Change viewpoint from above",
      "from below": "Change viewpoint from below",
      "bird's eye": "Use bird's eye view",
      "worm's eye": "Use worm's eye view"
    },

    // アクセサリーカテゴリ
    accessories: {
      "glasses": "Add glasses to the character",
      "hat": "Put a hat on the character",
      "headband": "Add headband to the character",
      "earrings": "Add earrings to the character",
      "necklace": "Add necklace to the character",
      "bracelet": "Add bracelet to the character",
      "watch": "Add watch to the character",
      "ring": "Add ring to the character",
      "bag": "Give the character a bag",
      "backpack": "Add backpack to the character",
      "book": "Give the character a book",
      "phone": "Give the character a phone",
      "sword": "Add sword to the character",
      "staff": "Give the character a staff",
      "wand": "Add wand to the character",
      "flower": "Give the character a flower",
      "umbrella": "Add umbrella to the character"
    }
  };

  /**
   * 補助的な正規表現パターン（辞書にないタグ用）
   */
  const FALLBACK_EXCLUDE_PATTERNS = [
    // 人数・性別
    /^(1|2|3|4|5|6|multiple|solo|duo|trio|group)?(girl|boy|man|woman|male|female|person|people|character)s?$/i,
    
    // 髪色・目色（具体的な色名）
    /^(blonde?|black|brown|red|white|silver|gray|grey|pink|blue|green|purple|orange|yellow|aqua|cyan|magenta)[\s-]?(hair|haired|eyes?|eyed)$/i,
    
    // 体型・年齢
    /^(young|old|teen|teenage|adult|mature|elderly|child|kid|tall|short|slim|thin|fat|petite|curvy|muscular)$/i,
    
    // 品質タグ
    /^(masterpiece|best[\s-]?quality|high[\s-]?quality|detailed|8k|4k|hd|realistic|anime|illustration)$/i,
    
    // アーティスト・評価
    /^(by\s+|artist:|rating:|score_\d+).*$/i
  ];

  /**
   * SFW辞書からタグのカテゴリを取得
   */
  function getSFWTagCategory(tag) {
    // SFW辞書の参照
    const sfwDict = window.DEFAULT_SFW_DICT?.SFW || window.SFW;
    if (!sfwDict) {
      console.warn('⚠️ SFW辞書が見つかりません');
      return null;
    }

    const normalizedTag = tag.toLowerCase().trim();
    
    // 全カテゴリを検索
    for (const [category, items] of Object.entries(sfwDict)) {
      if (Array.isArray(items)) {
        const found = items.find(item => {
          if (typeof item === 'object' && item !== null) {
            // オブジェクト形式 {tag: "xxx", label: "yyy"}
            const itemTag = (item.tag || '').toLowerCase();
            const itemLabel = (item.label || item.ja || '').toLowerCase();
            return itemTag === normalizedTag || itemLabel === normalizedTag;
          } else if (typeof item === 'string') {
            // 文字列形式
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
   * 条件付きカテゴリの保持判定
   */
  function shouldKeepConditionalTag(tag, category) {
    if (category === 'outfit') {
      const normalizedTag = tag.toLowerCase();
      
      // 特殊・ファンタジー衣装は保持
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
   * カテゴリからの自然言語指示文生成
   */
  function generateInstructionFromCategory(tag, category) {
    const patterns = CATEGORY_PATTERNS[category];
    if (!patterns) return null;

    const normalizedTag = tag.toLowerCase();
    
    // 完全一致を優先
    if (patterns[normalizedTag]) {
      return patterns[normalizedTag];
    }
    
    // 部分一致で検索
    const partialMatch = Object.keys(patterns).find(key => 
      normalizedTag.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedTag)
    );
    
    if (partialMatch) {
      return patterns[partialMatch];
    }
    
    // 汎用パターン
    switch (category) {
      case 'expressions':
        return `Change expression to ${tag}`;
      case 'pose':
        return `Pose the character ${tag}`;
      case 'background':
        return `Set background to ${tag}`;
      case 'lighting':
        return `Add ${tag} lighting`;
      case 'accessories':
        return `Add ${tag} to the character`;
      default:
        return `Add ${tag} to the image`;
    }
  }

  /**
   * メインのプロンプト処理関数（SFW辞書ベース）
   */
  function processNanoBananaCorrect(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return {
        instruction: "Keep the same person.",
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

    console.log('🔍 Nano-banana SFW辞書ベース処理開始');
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
          
          // 自然言語指示文生成
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
          console.log(`✅ パターン保持: ${tag}`);
        }
      }
    });

    // ChatGPT正式フォーマットで指示文構築
    let finalInstruction = "Keep the same person.";
    
    if (instructions.length > 0) {
      // 重複除去
      const uniqueInstructions = [...new Set(instructions)];
      finalInstruction += "\n" + uniqueInstructions.join("\n");
    }
    
    finalInstruction += "\nDo not change hairstyle or outfit unless specified.";

    console.log('📊 処理結果:');
    console.log('  保持:', preservedTags.length, '個');
    console.log('  除外:', excludedTags.length, '個');
    console.log('  指示文:', instructions.length, '個');

    return {
      instruction: finalInstruction,
      expression: "processed by category",
      poseItem: "processed by category",
      excludedTags: excludedTags.join(', '),
      preservedTags: preservedTags.join(', ')
    };
  }

  /**
   * 最終出力フォーマット
   */
  function formatNanoBananaCorrect(prompt, negativePrompt, seed) {
    const result = processNanoBananaCorrect(prompt);
    return result.instruction;
  }

  /**
   * デバッグ・テスト用関数
   */
  function testSFWDictBasedProcessing() {
    console.log('🧪 SFW辞書ベース処理テスト開始');
    
    const testCases = [
      "1girl, smiling, standing, long hair, blue eyes, school uniform, masterpiece",
      "1girl, serious, holding book, brown hair, classroom, soft lighting",
      "1girl, happy, waving, blonde hair, park, cherry blossoms, sunset",
      "solo, portrait, sitting, library, dramatic lighting, looking at viewer"
    ];
    
    testCases.forEach((testPrompt, index) => {
      console.log(`\n--- SFWテストケース ${index + 1} ---`);
      console.log('入力:', testPrompt);
      
      const result = processNanoBananaCorrect(testPrompt);
      console.log('保持タグ:', result.preservedTags);
      console.log('除外タグ:', result.excludedTags);
      
      const output = formatNanoBananaCorrect(testPrompt, "", 123);
      console.log('最終出力:');
      console.log(output);
    });
    
    console.log('\n✅ SFW辞書ベース処理テスト完了');
  }

  /**
   * 初期化とグローバル公開
   */
  function initialize() {
    // グローバル関数として公開
    window.processNanoBananaCorrect = processNanoBananaCorrect;
    window.formatNanoBananaCorrect = formatNanoBananaCorrect;
    window.getSFWTagCategory = getSFWTagCategory;
    window.testSFWDictBasedProcessing = testSFWDictBasedProcessing;
    
    // 設定オブジェクトも公開
    window.SFW_CATEGORY_CONFIG = SFW_CATEGORY_CONFIG;
    window.CATEGORY_PATTERNS = CATEGORY_PATTERNS;
    
    console.log('✅ Nano-banana SFW辞書ベース版の関数をグローバルに公開');
    
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
    
    console.log('🍌 Nano-banana SFW辞書ベース版の初期化完了');
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
// getSFWTagCategory("smiling");
// processNanoBananaCorrect("1girl, happy, standing, school, soft lighting");
// formatNanoBananaCorrect("1girl, serious, sitting, library, dramatic lighting");
