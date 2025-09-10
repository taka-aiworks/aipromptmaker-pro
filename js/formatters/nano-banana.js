// Nano-banana (Gemini 2.5 Flash Image) フォーマッタ - 分離版
// ChatGPT正式フォーマット対応版

(function() {
  'use strict';
  
  console.log('🍌 Nano-banana 分離版フォーマッタを読み込み中...');
  
  /**
   * 表情マッピング（日本語・英語タグ → 英語表情）
   */
  const EXPRESSION_MAP = {
    // 基本表情（英語）
    "smiling": "smiling",
    "smile": "smiling", 
    "happy": "happy",
    "serious": "serious", 
    "angry": "angry",
    "sad": "sad",
    "surprised": "surprised",
    "confused": "confused",
    "embarrassed": "embarrassed",
    "worried": "worried",
    "determined": "determined", 
    "neutral": "neutral",
    "crying": "crying",
    "laughing": "laughing",
    "excited": "excited",
    "sleepy": "sleepy",
    "scared": "scared",
    "shy": "shy",
    "confident": "confident",
    "annoyed": "annoyed",
    
    // 日本語表情
    "笑顔": "smiling",
    "微笑み": "smiling", 
    "真剣": "serious",
    "怒り": "angry",
    "悲しい": "sad",
    "驚き": "surprised",
    "困惑": "confused",
    "恥ずかしい": "embarrassed",
    "心配": "worried",
    "決意": "determined",
    "無表情": "neutral",
    "泣く": "crying",
    "笑う": "laughing",
    "興奮": "excited",
    "眠い": "sleepy",
    "怖い": "scared",
    "恥ずかしがり": "shy",
    "自信": "confident",
    "イライラ": "annoyed",
    
    // 口・目の状態
    "open mouth": "open mouth",
    "closed mouth": "closed mouth", 
    "smiling open mouth": "smiling with open mouth",
    "winking": "winking",
    "closed eyes": "with closed eyes",
    "half-closed eyes": "with half-closed eyes"
  };

  /**
   * ポーズ・小物マッピング（日本語・英語タグ → 英語指示）
   */
  const POSE_ITEM_MAP = {
    // 基本ポーズ（英語）
    "standing": "standing upright",
    "sitting": "sitting down", 
    "running": "running",
    "walking": "walking",
    "lying": "lying down",
    "kneeling": "kneeling",
    "jumping": "jumping",
    "dancing": "dancing",
    "sleeping": "sleeping",
    "stretching": "stretching",
    
    // 腕・手のポーズ
    "arms crossed": "with arms crossed",
    "hands on hips": "with hands on hips",
    "waving": "waving",
    "pointing": "pointing",
    "peace sign": "making peace sign",
    "thumbs up": "giving thumbs up",
    "saluting": "saluting",
    "praying": "with hands in prayer",
    "clapping": "clapping hands",
    "reaching out": "reaching out",
    
    // 日本語ポーズ
    "立っている": "standing upright",
    "座っている": "sitting down",
    "走っている": "running", 
    "歩いている": "walking",
    "寝ている": "lying down",
    "跪く": "kneeling",
    "ジャンプ": "jumping",
    "踊る": "dancing",
    "眠る": "sleeping",
    "伸び": "stretching",
    "腕組み": "with arms crossed",
    "腰に手": "with hands on hips",
    "手を振る": "waving",
    "指差し": "pointing",
    "ピース": "making peace sign",
    
    // 小物・アクセサリー（英語）
    "holding book": "holding a book",
    "holding phone": "holding a phone", 
    "holding bag": "holding a bag",
    "holding flower": "holding a flower",
    "holding cup": "holding a cup",
    "holding sword": "holding a sword",
    "holding staff": "holding a staff",
    "wearing glasses": "wearing glasses",
    "wearing hat": "wearing a hat",
    "wearing headphones": "wearing headphones",
    "wearing mask": "wearing a mask",
    "carrying backpack": "carrying a backpack",
    
    // 小物・アクセサリー（日本語）
    "本を持つ": "holding a book",
    "電話を持つ": "holding a phone",
    "バッグ": "holding a bag",
    "花": "holding a flower",
    "カップ": "holding a cup",
    "剣": "holding a sword",
    "杖": "holding a staff",
    "メガネ": "wearing glasses",
    "帽子": "wearing a hat",
    "ヘッドホン": "wearing headphones",
    "マスク": "wearing a mask",
    "リュック": "carrying a backpack"
  };

  /**
   * 除外パターン（キャラクター基本属性）
   */
  const EXCLUDE_PATTERNS = [
    // 人数・性別
    /^(1|2|3|4|5|6|multiple|solo|duo|trio|group)?(girl|boy|man|woman|male|female|person|people|character)s?$/i,
    
    // 髪関連（色・長さ・スタイル）
    /^(blonde?|black|brown|red|white|silver|gray|grey|pink|blue|green|purple|orange|yellow)[\s-]?(hair|haired)$/i,
    /^(long|short|medium|shoulder|waist|hip)[\s-]?length[\s-]?hair$/i,
    /^(long|short|medium)[\s-]?hair$/i,
    /^(straight|curly|wavy|braided|tied|loose|messy|neat|spiky|fluffy|twintails|ponytail|twin[\s-]?tails)[\s-]?hair$/i,
    /^(bangs|side[\s-]?swept|swept[\s-]?bangs|blunt[\s-]?bangs)$/i,
    
    // 目関連（色・形）
    /^(blue|brown|green|red|purple|pink|yellow|amber|hazel|gray|grey|heterochromia)[\s-]?(eyes?|eyed)$/i,
    /^(large|small|round|almond|narrow)[\s-]?eyes?$/i,
    
    // 肌色
    /^(pale|fair|light|dark|tan|tanned|olive|brown|black|white)[\s-]?(skin|skinned|complexion)$/i,
    
    // 体型・年齢
    /^(young|old|teen|teenage|adult|mature|elderly|child|kid|loli|shota)$/i,
    /^(slim|thin|skinny|fat|chubby|thick|curvy|muscular|athletic|petite|tall|short|small|large|huge|tiny)$/i,
    
    // 服装基本（「髪型・服装は変更しない」方針）
    /^(school[\s-]?uniform|uniform|dress|shirt|skirt|pants|jeans|jacket|coat)$/i,
    
    // 品質・技術タグ
    /^(masterpiece|best[\s-]?quality|high[\s-]?quality|ultra[\s-]?detailed|extremely[\s-]?detailed|detailed|8k|4k|hd|uhd)$/i,
    /^(photorealistic|realistic|anime|manga|illustration|cg|3d)$/i,
    
    // アーティスト・著作権
    /^(by\s+|artist:|\(artist\)|style\s+of|in\s+the\s+style\s+of)/i,
    
    // 評価・投票
    /^(rating:|score_\d+|upvotes|downvotes|favorites)$/i
  ];

  /**
   * プロンプト処理メイン関数
   * @param {string} prompt - 元のプロンプト
   * @returns {object} 処理結果オブジェクト
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
    let expression = "";
    let poseItem = "";

    // タグ分類処理
    tags.forEach(tag => {
      const normalizedTag = tag.toLowerCase();
      
      // Step 1: 除外パターンチェック
      const shouldExclude = EXCLUDE_PATTERNS.some(pattern => pattern.test(tag));
      if (shouldExclude) {
        excludedTags.push(tag);
        return;
      }
      
      // Step 2: 表情チェック（未設定の場合のみ）
      if (!expression) {
        const foundExpression = Object.keys(EXPRESSION_MAP).find(key => 
          normalizedTag.includes(key.toLowerCase())
        );
        if (foundExpression) {
          expression = EXPRESSION_MAP[foundExpression];
          preservedTags.push(tag);
          return;
        }
      }
      
      // Step 3: ポーズ・小物チェック（未設定の場合のみ）
      if (!poseItem) {
        const foundPose = Object.keys(POSE_ITEM_MAP).find(key => 
          normalizedTag.includes(key.toLowerCase())
        );
        if (foundPose) {
          poseItem = POSE_ITEM_MAP[foundPose];
          preservedTags.push(tag);
          return;
        }
      }
      
      // Step 4: その他保持タグ（背景・ライティングなど）
      preservedTags.push(tag);
    });

    // ChatGPTが教えてくれた正確なフォーマットで指示文構築
    let instruction = "Keep the same person.";
    
    if (expression) {
      instruction += `\nChange the expression to ${expression}.`;
    }
    
    if (poseItem) {
      instruction += `\nPose the character ${poseItem}.`;
    }
    
    instruction += "\nDo not change hairstyle or outfit unless specified.";

    return {
      instruction,
      expression: expression || "not specified",
      poseItem: poseItem || "not specified",
      excludedTags: excludedTags.join(', '),
      preservedTags: preservedTags.join(', ')
    };
  }

  /**
   * Nano-banana最終出力フォーマット関数
   * @param {string} prompt - プロンプト
   * @param {string} negativePrompt - ネガティブプロンプト（未使用）
   * @param {number} seed - シード値（未使用）
   * @returns {string} フォーマット済み出力
   */
  function formatNanoBananaCorrect(prompt, negativePrompt, seed) {
    const result = processNanoBananaCorrect(prompt);
    return result.instruction;
  }

  /**
   * デバッグ・テスト用関数
   */
  function testNanoBananaFormatting() {
    console.log('🧪 Nano-banana フォーマッタテスト開始');
    
    const testCases = [
      "1girl, smiling, standing, long hair, blue eyes, school uniform, masterpiece",
      "1girl, serious, holding book, brown hair, classroom",
      "1girl, happy, waving, blonde hair, park, soft lighting",
      "1girl, long hair, blue eyes, school uniform, best quality"
    ];
    
    testCases.forEach((testPrompt, index) => {
      console.log(`\n--- テストケース ${index + 1} ---`);
      console.log('入力:', testPrompt);
      
      const result = processNanoBananaCorrect(testPrompt);
      console.log('処理結果:', result);
      
      const output = formatNanoBananaCorrect(testPrompt, "", 123);
      console.log('最終出力:');
      console.log(output);
    });
    
    console.log('\n✅ Nano-banana フォーマッタテスト完了');
  }

  /**
   * app.jsとの統合確認
   */
  function checkAppIntegration() {
    if (window.FORMATTERS && window.FORMATTERS['nano-banana']) {
      console.log('✅ app.jsでNano-bananaフォーマッタが認識されています');
      
      // 実際にフォーマッタ経由でテスト
      try {
        const testPrompt = "1girl, smiling, standing";
        const output = window.FORMATTERS['nano-banana'].line(testPrompt, "", 123);
        console.log('app.js経由テスト成功:', output.substring(0, 50) + '...');
        return true;
      } catch (error) {
        console.error('❌ app.js経由テスト失敗:', error);
        return false;
      }
    } else {
      console.warn('⚠️ app.jsでNano-bananaフォーマッタが見つかりません');
      return false;
    }
  }

  /**
   * 初期化とグローバル公開
   */
  function initialize() {
    // グローバル関数として公開
    window.processNanoBananaCorrect = processNanoBananaCorrect;
    window.formatNanoBananaCorrect = formatNanoBananaCorrect;
    window.EXPRESSION_MAP = EXPRESSION_MAP;
    window.POSE_ITEM_MAP = POSE_ITEM_MAP;
    window.EXCLUDE_PATTERNS = EXCLUDE_PATTERNS;
    
    // デバッグ用関数も公開
    window.testNanoBananaFormatting = testNanoBananaFormatting;
    window.checkNanoBananaAppIntegration = checkAppIntegration;
    
    console.log('✅ Nano-banana 分離版フォーマッタ関数をグローバルに公開しました');
    
    // app.js統合確認（少し遅延して実行）
    setTimeout(() => {
      checkAppIntegration();
    }, 1000);
    
    console.log('🍌 Nano-banana 分離版フォーマッタの初期化完了');
  }

  /**
   * DOM読み込み完了後に初期化
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // window.load後にも再確認
  window.addEventListener('load', () => {
    setTimeout(checkAppIntegration, 500);
  });

})();

// ブラウザコンソールでテスト可能:
// testNanoBananaFormatting();
// checkNanoBananaAppIntegration();
// processNanoBananaCorrect("1girl, smiling, standing, long hair");
// formatNanoBananaCorrect("1girl, happy, waving, school uniform");
