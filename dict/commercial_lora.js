/* 商用利用可能なLoRA辞書 */
window.COMMERCIAL_LORA_DICT = {
  commercial_lora: [
    // 画風・スタイル系
    {
      tag: "<lora:anime_style_v1:0.8>",
      label: "アニメ風",
      category: "style",
      description: "アニメ調の画風に調整",
      weight_default: 0.8,
      weight_min: 0.3,
      weight_max: 1.2,
      commercial: true
    },
    {
      tag: "<lora:manga_ink_v2:0.9>",
      label: "漫画インク風",
      category: "style",
      description: "漫画のペン画風の線画スタイル",
      weight_default: 0.9,
      weight_min: 0.4,
      weight_max: 1.5,
      commercial: true
    },
    {
      tag: "<lora:watercolor_v1:0.7>",
      label: "水彩風",
      category: "style",
      description: "水彩画のような柔らかなタッチ",
      weight_default: 0.7,
      weight_min: 0.3,
      weight_max: 1.0,
      commercial: true
    },
    {
      tag: "<lora:cel_shading_v3:0.8>",
      label: "セルシェーディング",
      category: "style", 
      description: "アニメ的なセルシェーディング",
      weight_default: 0.8,
      weight_min: 0.5,
      weight_max: 1.2,
      commercial: true
    },

    // 品質向上系
    {
      tag: "<lora:detail_enhance_v2:0.6>",
      label: "ディテール強化",
      category: "quality",
      description: "細部の描写を向上させる",
      weight_default: 0.6,
      weight_min: 0.3,
      weight_max: 1.0,
      commercial: true
    },
    {
      tag: "<lora:face_fix_v1:0.5>",
      label: "顔修正",
      category: "quality",
      description: "顔の崩れを軽減",
      weight_default: 0.5,
      weight_min: 0.2,
      weight_max: 0.8,
      commercial: true
    },
    {
      tag: "<lora:hand_fix_v2:0.4>",
      label: "手修正",
      category: "quality", 
      description: "手の描写を改善",
      weight_default: 0.4,
      weight_min: 0.2,
      weight_max: 0.7,
      commercial: true
    },

    // 表現・効果系
    {
      tag: "<lora:emotion_boost_v1:0.7>",
      label: "感情表現強化",
      category: "expression",
      description: "感情表現をより豊かに",
      weight_default: 0.7,
      weight_min: 0.3,
      weight_max: 1.1,
      commercial: true
    },
    {
      tag: "<lora:dynamic_pose_v2:0.8>",
      label: "ダイナミックポーズ",
      category: "pose",
      description: "躍動感のあるポーズを生成",
      weight_default: 0.8,
      weight_min: 0.4,
      weight_max: 1.3,
      commercial: true
    },
    {
      tag: "<lora:manga_fx_v1:0.6>",
      label: "漫画効果線",
      category: "effect",
      description: "漫画的な効果線・集中線",
      weight_default: 0.6,
      weight_min: 0.3,
      weight_max: 1.0,
      commercial: true
    },

    // 背景・環境系
    {
      tag: "<lora:school_bg_v1:0.7>",
      label: "学校背景",
      category: "background",
      description: "学校・教室の背景",
      weight_default: 0.7,
      weight_min: 0.4,
      weight_max: 1.1,
      commercial: true
    },
    {
      tag: "<lora:nature_bg_v2:0.8>",
      label: "自然背景",
      category: "background",
      description: "自然・風景の背景",
      weight_default: 0.8,
      weight_min: 0.5,
      weight_max: 1.2,
      commercial: true
    },

    // 照明・雰囲気系
    {
      tag: "<lora:soft_light_v1:0.6>",
      label: "ソフトライト",
      category: "lighting",
      description: "柔らかな照明効果",
      weight_default: 0.6,
      weight_min: 0.3,
      weight_max: 0.9,
      commercial: true
    },
    {
      tag: "<lora:dramatic_light_v2:0.7>",
      label: "ドラマチック照明",
      category: "lighting",
      description: "劇的な光と影",
      weight_default: 0.7,
      weight_min: 0.4,
      weight_max: 1.1,
      commercial: true
    }
  ]
};

console.log('商用LoRA辞書が読み込まれました:', window.COMMERCIAL_LORA_DICT.commercial_lora.length + '件');
