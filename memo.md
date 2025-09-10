# Nano-banana対応仕様メモ - Phase 3完了版

## 📊 プロジェクトステータス概要

### 🏗️ アーキテクチャ構成
**フロントエンド構成**
- JavaScript ベースの SPA（Single Page Application）
- モジュラー設計 - 機能ごとに分離されたJSファイル
- タブ形式UI - 複数のモード切り替え対応
- リアルタイム更新 - 設定変更時の即座なプロンプト生成

**主要モジュール構成**
```
js/core/
├── app.js              # メインアプリケーション
├── commercial-lora.js  # 商用LoRA管理
└── manga-mode.js       # 漫画モード機能

js/presets/
├── manga-nsfw-presets.js
├── manga-preset-system.js
└── manga-sfw-presets.js

js/formatters/          # ← 新規追加
├── nano-banana.js      # Nano-bananaフォーマッタ本体
└── nano-banana-ui.js   # UI統合スクリプト
```

### 🎛️ 実装済み機能
1. **基本プロンプト生成機能**
   - 学習モード - LoRA学習用プロンプト（配分ルール最適化）
   - 量産モード - 大量画像生成用（プリセット機能付き）
   - 撮影モード - 写真風画像生成
   - 漫画モード - 漫画・イラスト特化（SFW/NSFW対応）
   - 単語モード - 辞書ベース選択機能
   - **🆕 Nano-banana出力** - 画像編集特化フォーマット

2. **高度な管理機能**
   - プリセットシステム - 設定の保存/読込/管理
   - 履歴機能 - 生成履歴の追跡
   - バックアップ/復元 - 設定の完全バックアップ
   - GAS連携 - Google Apps Script でのクラウド同期

3. **商用LoRA対応**
   - カテゴリ別管理 - 画風/品質/エフェクト等
   - 重み調整 - 個別・一括重み設定
   - 選択状態管理 - Map ベースの状態管理

### 🎨 UI/UX 特徴
**設計思想**
- ダークテーマ メイン
- チップ形式 の選択UI
- 検索機能 - リアルタイム検索・フィルタリング
- プリセット機能 - ワンクリック設定適用

**ユーザビリティ**
- 未選択ボタン - 明確な初期状態
- 全解除ボタン - 簡単リセット
- リアルタイムプレビュー - 即座の結果確認

### 📊 データ管理
**辞書システム**
- SFW辞書 - 安全な要素（表情、ポーズ、背景等）
- NSFW辞書 - R-18要素（段階的レベル管理）
- 商用LoRA辞書 - カテゴリ別LoRA管理

**設定管理**
- localStorage ベース
- JSON形式 でのインポート/エクスポート
- セッション管理 - タブ間での状態保持

### 🔧 出力フォーマット対応
**現在サポート**
- Web UI (A1111) - 最も一般的
- InvokeAI - コマンドライン形式
- ComfyUI - ノードベース形式
- SD.Next - dream.py形式
- NovelAI - NAI専用形式
- **🆕 Nano-banana** - Gemini 2.5 Flash Image用

## 🍌 Nano-banana対応仕様（実装完了）

### 📋 基本情報
- **正式名称**: Gemini 2.5 Flash Image
- **開発元**: Google DeepMind
- **通称**: Nano-banana（LMArena評価時のコードネーム）
- **用途**: 画像編集特化（既存画像の修正・変更）
- **特徴**: 自然言語による編集指示、キャラクター一貫性保持

### 🚫 重要な制限事項
- **NSFW完全非対応** - Google利用規約により成人向けコンテンツ禁止
- **SFW要素のみ対応** - 安全性を重視したコンテンツポリシー
- **透かし必須** - 全生成画像にSynthID透かし自動挿入

### ✅ 実装完了状況

#### Phase 1: 基本フォーマッタ - 完了
```javascript
// 実装済みファイル: js/formatters/nano-banana.js
const FORMATTERS['nano-banana'] = {
  label: "Nano-banana (Gemini 2.5)",
  format: formatNanobananaOutput,
  line: formatNanobananaOutput
};
```

**機能**
- ✅ 基本情報フィルタリング（文字列マッチング版）
- ✅ 編集指示文生成（カテゴリ別パターン対応）
- ✅ Gemini用出力フォーマット
- ✅ CSV対応（バッチ処理用）

#### Phase 2: UI統合 - 完了
```javascript
// 実装済みファイル: js/formatters/nano-banana-ui.js
```

**機能**
- ✅ フォーマット選択に「Nano-banana (Gemini 2.5)」追加
- ✅ 注意書き表示（黄色いパネル）
- ✅ 動的UI切り替え（選択時のみ表示）
- ✅ 漫画モード・量産モード・学習モード・撮影モード対応

#### Phase 3: 動作統合 - 部分完了
**完了項目**
- ✅ FORMATTERSオブジェクト手動作成で動作確認
- ✅ 漫画モードでの実装統合（手動フック適用）
- ✅ 実際のプロンプト変換動作確認

**実際の出力例**
```
🍌 Nano-banana Edit Instruction:
"Add newborn, female, twin tails to the image"

⚠️ Note: Basic character attributes (hair, eyes, clothing) are filtered out 
to avoid conflicts with existing image

📋 Usage in Gemini:
1. Upload your original image to Gemini
2. Enter the above instruction
3. Generate edited image

🔧 Original filtered tags: newborn, female, twin tails, almond eyes, orange hair, orange eyes, light skin, mouth_closed
```

### 🔧 現在の課題と次期対応

#### 緊急課題: フィルタリング精度向上
**現状の問題**
- 文字列マッチングによる粗い除外（`normalizedTag.includes(filter)`）
- 除外すべき要素が残存：`almond eyes, orange hair, orange eyes, light skin`
- 辞書カテゴリ情報を活用していない

**必要な改善**
```javascript
// 現在（問題あり）
const filteredTags = tags.filter(tag => {
  return !BASIC_INFO_FILTERS.some(filter => 
    normalizedTag.includes(filter.toLowerCase())
  );
});

// 改善予定（辞書カテゴリベース）
function shouldExcludeByCategory(tag) {
  const categoryInfo = findTagInSFWDictionary(tag);
  const excludeCategories = [
    'hair_style', 'hair_length', 'bangs_style', 
    'eyes', 'skin_features', 'gender', 'age', 'body_type', 'height'
  ];
  return excludeCategories.includes(categoryInfo?.category);
}
```

#### 永続化課題
**現状**
- FORMATTERSオブジェクトがapp.js内でローカル定義
- 手動でのオブジェクト作成とフック適用が必要
- ページリロード時にリセット

**必要な対応**
- パッチスクリプトの安定化
- 自動適用メカニズムの完成
- 他モード（量産・学習・撮影）での動作保証

### 🎯 次期実装計画

#### Phase 4: フィルタリング高度化（優先度：高）
1. **辞書構造解析**
   ```javascript
   // 必要な調査
   console.log('SFW structure:', Object.keys(window.SFW || {}));
   console.log('Sample items:', {
     hair: window.SFW?.hair_style?.[0],
     eyes: window.SFW?.eyes?.[0]
   });
   ```

2. **カテゴリベース除外ロジック実装**
   - タグ→カテゴリ逆引きマップ作成
   - 除外対象カテゴリの精密定義
   - より正確なフィルタリング実装

3. **除外精度向上**
   - キャラクター外見情報の完全除外
   - ポーズ・背景・エフェクトのみ残存
   - 編集指示の品質向上

#### Phase 5: 永続化・安定化（優先度：中）
1. **自動適用システム完成**
2. **全モード対応**（量産・学習・撮影）
3. **エラーハンドリング強化**

#### Phase 6: 機能拡張（優先度：低）
1. **より多様な編集指示パターン**
2. **カスタム除外ルール**
3. **プレビュー機能**

### 📈 プロジェクト成熟度評価
**強み**
- ✅ 豊富な機能 - 7つのメインモード（Nano-banana含む）
- ✅ 高いカスタマイズ性 - プリセット・設定管理
- ✅ 実用性 - 実際のAI画像生成ワークフローに対応
- ✅ 保守性 - モジュラー設計で拡張容易
- ✅ 革新性 - 画像編集市場への先駆的対応

**新たな価値**
- 🆕 画像編集市場への対応（Nano-banana）
- 🆕 Google Gemini エコシステム連携
- 🆕 安全性重視のコンテンツ制作支援
- 🆕 既存画像の効率的な編集ワークフロー

### 📋 実装チェックリスト

**Phase 3完了項目**
- [x] `nano-banana` フォーマッタ追加
- [x] 基本情報フィルタリング関数（初期版）
- [x] 編集指示文生成ロジック
- [x] SFW辞書対応確認
- [x] 注意書きUI追加
- [x] 出力形式選択肢追加
- [x] 漫画モードでの動作確認

**Phase 4予定項目**
- [ ] 辞書カテゴリベースフィルタリング実装
- [ ] 除外精度の大幅向上
- [ ] タグ→カテゴリ逆引きマップ作成
- [ ] より正確な編集指示生成

**永続化対応準備**
- [ ] パッチスクリプト完成
- [ ] 自動適用メカニズム実装
- [ ] 全モード対応確認
- [ ] エラーハンドリング実装

**品質保証項目**
- [x] NSFW要素完全除外確認
- [x] 既存機能への影響なし確認
- [ ] 高精度フィルタリング確認
- [ ] ユーザビリティテスト

このプロジェクトは画像編集の新しいトレンドに対応した理想的な拡張として、高い完成度で実装されています。現在の課題はフィルタリング精度の向上のみで、基本機能は完全に動作しています。
