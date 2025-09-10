# Nano-banana対応仕様メモ - 更新版

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
```

### 🎛️ 実装済み機能
1. **基本プロンプト生成機能**
   - 学習モード - LoRA学習用プロンプト（配分ルール最適化）
   - 量産モード - 大量画像生成用（プリセット機能付き）
   - 撮影モード - 写真風画像生成
   - 漫画モード - 漫画・イラスト特化（SFW/NSFW対応）
   - 単語モード - 辞書ベース選択機能

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

## 🍌 Nano-banana対応仕様（新規追加）

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

### 🎯 実装方針
**基本設計**
- 既存フォーマッタシステムの拡張
- 出力形式選択に「Nano-banana」追加
- プロンプト出力のみ（現段階ではAPI連携なし）

**技術実装**
```javascript
// フォーマッタ追加
FORMATTERS['nano-banana'] = {
    format: function(prompt, negativePrompt, settings) {
        const filteredPrompt = filterBasicInfo(prompt);  // 基本情報除外
        const editInstruction = generateEditInstruction(filteredPrompt);
        return formatNanobananaOutput(editInstruction);
    }
};
```

### 🔧 機能仕様詳細

#### 1. 基本情報フィルタリング
**除外対象タグ**
- 人物属性: `1girl`, `1boy`, `long hair`, `short hair`
- 顔の特徴: `brown eyes`, `blue eyes`, `blonde hair`
- 基本服装: `school uniform`, `casual clothes`

**理由**: 既存画像の属性と競合回避

#### 2. 編集指示文生成
**カテゴリ別指示パターン**
```javascript
const EDIT_INSTRUCTIONS = {
    pose: {
        "standing": "make the character standing",
        "sitting": "change pose to sitting",
        "running": "change pose to running"
    },
    background: {
        "school": "change background to school setting",
        "park": "set background to park scene",
        "beach": "change background to beach scene"
    },
    effects: {
        "rain": "add rain effect",
        "snow": "add falling snow",
        "sunlight": "add warm sunlight"
    }
};
```

#### 3. 出力フォーマット
**標準出力例**
```
🍌 Nano-banana Edit Instruction:
"Change pose to running, set background to night city, add rain effect"

⚠️ Note: Basic character attributes (hair, eyes, clothing) are filtered out 
to avoid conflicts with existing image

📋 Usage in Gemini:
1. Upload your original image to Gemini
2. Enter the above instruction
3. Generate edited image
```

#### 4. UI拡張要件
**フォーマット選択追加**
```html
<select id="outputFormat">
  <!-- 既存オプション -->
  <option value="nano-banana">Nano-banana (Gemini 2.5)</option>
</select>
```

**注意書き表示**
```html
<div id="nano-banana-notice" class="alert alert-info">
  ⚠️ Nano-banana is SFW-only. Basic character info will be filtered out 
  to avoid conflicts with existing images.
</div>
```

#### 5. 段階的実装計画
**Phase 1: 基本対応（優先）**
- フォーマッタ追加
- 基本情報フィルタリング
- 編集指示文生成
- SFW辞書のみ対応

**Phase 2: UI改善**
- 専用設定パネル
- カテゴリ別選択UI
- プレビュー機能

**Phase 3: 将来拡張**
- API連携準備
- より詳細な編集制御
- プリセット対応

### 🚀 技術的特徴
**既存システムとの統合**
- モジュラー設計活用
- 既存辞書システム流用
- プリセット機能継承
- 設定管理共通化

**拡張性**
- 将来のAPI連携対応
- 新編集機能追加容易
- 他フォーマットとの共存

### 📈 プロジェクト成熟度評価
**強み**
- ✅ 豊富な機能 - 6つのメインモード（Nano-banana含む）
- ✅ 高いカスタマイズ性 - プリセット・設定管理
- ✅ 実用性 - 実際のAI画像生成ワークフローに対応
- ✅ 保守性 - モジュラー設計で拡張容易

**新たな価値**
- 🆕 画像編集市場への対応
- 🆕 Google Gemini エコシステム連携
- 🆕 安全性重視のコンテンツ制作支援

### 📋 実装チェックリスト
**必須実装項目**
- [ ] `nano-banana` フォーマッタ追加
- [ ] 基本情報フィルタリング関数
- [ ] 編集指示文生成ロジック
- [ ] SFW辞書対応確認
- [ ] 注意書きUI追加
- [ ] 出力形式選択肢追加

**品質保証項目**
- [ ] NSFW要素完全除外確認
- [ ] 既存機能への影響なし
- [ ] エラーハンドリング実装
- [ ] ユーザビリティテスト

**将来対応準備**
- [ ] API連携モジュール設計
- [ ] 設定の後方互換性確保
- [ ] 拡張可能なアーキテクチャ維持

このプロジェクトは高い完成度を保ちながら、新しい画像編集トレンドに対応する理想的な拡張が可能な状況です。
