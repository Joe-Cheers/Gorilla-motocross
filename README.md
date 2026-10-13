# GORILLA MOTOCROSS — Phase 1〜6

GitHub Pages でそのまま動く、外部ライブラリ不要のスマホ向け横スクロール・モトクロスゲームです。

## 実装済み

- Phase 1: Canvas、ゲームループ、タイトル、ポーズ、カメラ
- Phase 2: オリジナルの8bit風ゴリラ＋モトクロスバイク
- Phase 3: 横スクロール、地形、山・建物のパララックス
- Phase 4: 加速、減速、速度表示
- Phase 5: ジャンプ台、通常ジャンプ、MEGA JUMP
- Phase 6: 空中姿勢制御、左右回転、着地判定
- スマホ横画面タッチ操作
- PCキーボード操作
- 最大ジャンプ付近に昭和風の少しボロいアパートを配置

## PC操作

- A / ↑ / ACCEL: 加速
- ← / →: 空中でバイクを回転
- ↓: ノーズを下げる方向
- B: ブレーキ
- P / ESC: ポーズ
- Enter / Space: 開始・リスタート

## スマホ操作

横画面にすると画面下部に操作ボタンが表示されます。

- ◀ / ▶: 空中姿勢
- ACCEL: 加速
- B: ブレーキ
- ▼: ノーズ操作

## GitHub Pages

1. GitHubで `gorilla-motocross` などの公開リポジトリを作る
2. `index.html`, `style.css`, `game.js`, `README.md` をアップロード
3. Settings → Pages
4. Source を `Deploy from a branch`
5. Branch を `main` / `(root)` に設定
6. 保存
7. 数分待って公開URLを開く

## 次の開発

Phase 7以降では、以下を追加すると「完全版」に近づきます。

- 2輪接地判定
- Perfect / Good / Bad Landing
- ウィリー時間ボーナス
- ターボと温度
- 泥・クールゾーン
- クラッシュ、復帰
- CPUライダー
- 10コースのJSONデータ化
- コース選択
- ゴール・リザルト
- Web Audio
- localStorage
- PWA / Service Worker
- オプション画面
