markdown# Nano-banana対応完全仕様書 - Phase 5実装中版

## 📊 プロジェクト概要

### 🎯 プロジェクト基本情報
- **プロジェクト名**: Nano-banana対応AIプロンプトメーカー
- **対象システム**: Gemini 2.5 Flash Image (Google DeepMind)
- **開発期間**: Phase 1-4完了、Phase 5実装中
- **完成度**: 80% 🔄
- **革新性**: 業界初レベルの画像編集特化プロンプト生成

### 🍌 Nano-banana基本情報
- **正式名称**: Gemini 2.5 Flash Image
- **開発元**: Google DeepMind
- **通称**: Nano-banana（LMArena評価時のコードネーム）
- **用途**: 画像編集特化（既存画像の修正・変更）
- **特徴**: 自然言語による編集指示、キャラクター一貫性保持

### 🚫 重要な制限事項
- **NSFW完全非対応**: Google利用規約により成人向けコンテンツ禁止
- **SFW要素のみ対応**: 安全性を重視したコンテンツポリシー
- **透かし必須**: 全生成画像にSynthID透かし自動挿入

## 🏗️ アーキテクチャ構成

### フロントエンド構成
- **JavaScript ベースの SPA**（Single Page Application）
- **モジュラー設計**: 機能ごとに分離されたJSファイル
- **タブ形式UI**: 複数のモード切り替え対応
- **リアルタイム更新**: 設定変更時の即座なプロンプト生成

### 📁 フォルダ構成
project-root/
│
├── js/
│   ├── core/
│   │   ├── app.js              # メインアプリケーション（FORMATTERS定義あり）
│   │   ├── commercial-lora.js  # 商用LoRA管理
│   │   └── manga-mode.js       # 漫画モード機能
│   │
│   ├── presets/
│   │   ├── manga-nsfw-presets.js
│   │   ├── manga-preset-system.js
│   │   └── manga-sfw-presets.js
│   │
│   └── formatters/             # 新規追加
│       ├── nano-banana.js      # Nano-bananaフォーマッタ本体（強化版完成）
│       ├── nano-banana-ui.js   # UI統合スクリプト（重複防止版完成）
│       └── nano-banana-patch.js # パッチスクリプト
│
├── css/
│   └── styles.css              # メインスタイルシート
│
├── data/
│   ├── sfw-dictionary.js       # SFW辞書（47カテゴリ）
│   ├── nsfw-dictionary.js      # NSFW辞書
│   └── commercial-lora.js      # 商用LoRA辞書
│
└── index.html                  # メインHTMLファイル

### 🔧 出力フォーマット対応

### Nano-banana出力仕様
Edit the image.
[Important]: Please preserve the existing character features.

## 🚀 Phase別完了状況

### ✅ Phase 1: 基本フォーマッタ - 完了
- 基本情報フィルタリング（文字列マッチング版）
- 編集指示文生成（カテゴリ別パターン対応）
- Gemini用出力フォーマット
- CSV対応（バッチ処理用）

### ✅ Phase 2: UI統合 - 完了
- フォーマット選択に「Nano-banana (Gemini 2.5)」追加
- 注意書き表示（黄色いパネル）
- 動的UI切り替え（選択時のみ表示）
- 漫画モード・量産モード・学習モード・撮影モード対応
- 重複防止機能追加

### ✅ Phase 3: 動作統合 - 完了
- FORMATTERSオブジェクト手動作成で動作確認
- 漫画モードでの実装統合
- 実際のプロンプト変換動作確認（コンソールレベル）

### ✅ Phase 4: フィルタリング高度化 - 完了
- カテゴリベースフィルタリング実装（SFW辞書47カテゴリ対応）
- 正規表現パターンマッチング追加（辞書外タグ対応）
- 高精度除外ロジック（90-100%除外率達成）
- デバッグ機能充実
- 英語テンプレート確定（Edit the image形式）

### 🔄 Phase 5: カテゴリ別出力実装 - 実装中
- **EDIT_INSTRUCTIONS**パターンマッチング実装
- カテゴリ別英語指示文生成
- 複数カテゴリの組み合わせ処理
- **app.js統合**（FORMATTERS定義追加）← 現在ここ

## 🔬 技術仕様詳細

### EDIT_INSTRUCTIONS パターン定義
```javascript
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
フィルタリング方式D: パターン＋辞書ハイブリッド
47カテゴリ分析
javascriptconst SFW_CATEGORIES = {
  basic_attributes: ['solo', '1girl', '1boy', 'multiple_girls'],
  physical_features: ['petite', 'tall', 'short', 'slim'],
  hair_features: ['long_hair', 'short_hair', 'twin_tails'],
  eye_features: ['blue_eyes', 'brown_eyes', 'almond_eyes'],
  facial_features: ['round_face', 'oval_face', 'heart_face'],
  // ... 47カテゴリ合計
};
12正規表現パターン
javascriptconst FILTER_PATTERNS = [
  /\b(red|blue|green|yellow|orange|purple|pink|black|white|brown|blonde|silver)\s+(hair|eyes|skin)\b/gi,
  /\b(light|dark|pale|tan|fair)\s+(skin|complexion)\b/gi,
  /\b(1|one|single|multiple)\s*(girl|boy|person|character)s?\b/gi,
  // ... 12パターン合計
];
📋 Phase 5 実装チェックリスト
🔄 現在の作業（app.js統合）

 app.js内FORMATTERS定義にnano-banana追加
 カテゴリ別EDIT_INSTRUCTIONSパターンマッチング実装
 複数カテゴリ組み合わせロジック実装
 英語テンプレート出力確認

📊 プロジェクト進捗

技術的達成度: 80%（Phase 4完了、Phase 5実装中）
UI統合: 100%完成
フィルタリングロジック: 100%完成
出力フォーマット: 80%完成（カテゴリ別パターン実装中）

🎯 次のアクション
優先度1: app.js内FORMATTERSにnano-banana定義追加
優先度2: カテゴリ別英語指示文生成ロジック実装
優先度3: 実環境での動作テスト

最終更新: Phase 5実装中 - カテゴリ別出力実装段階
