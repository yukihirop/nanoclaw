# NanoClaw アーキテクチャ概要

## 全体構造

NanoClaw は**パーソナル Claude アシスタント**で、メッセージングアプリ（WhatsApp, Telegram, Slack, Discord）からのメッセージを受信し、**コンテナ内の Claude Agent SDK** に処理させて応答を返すシステム。

## コアフロー

```
メッセージ受信 → DB保存 → メッセージループ検出 → GroupQueue → コンテナ起動 → Claude応答 → チャネル経由で返信
```

## 主要コンポーネント

### 1. `src/index.ts` (オーケストレータ)
- `main()` で全サブシステムを起動
- `startMessageLoop()`: 2秒ポーリングで新メッセージを検出、トリガーパターン(`@Andy`等)に一致するグループを処理キューに投入
- `processGroupMessages()`: グループのメッセージをフォーマットしてコンテナエージェントに渡し、結果をチャネル経由で返信
- カーソル管理: `lastTimestamp`(全体) と `lastAgentTimestamp`(グループ別) の2段階で重複処理を防止

### 2. `src/channels/registry.ts` (チャネルレジストリ)
- プラグイン方式: 各チャネルが `registerChannel(name, factory)` でファクトリ関数を自己登録
- `Channel` インターフェース: `connect()`, `sendMessage()`, `ownsJid()`, `setTyping?()`, `syncGroups?()`

### 3. `src/group-queue.ts` (並行制御)
- `GroupQueue` クラスがグループ単位でコンテナの同時実行を管理
- `MAX_CONCURRENT_CONTAINERS`（デフォルト5）で並行数を制限
- メッセージとスケジュールタスクの優先度管理（タスク優先）
- エラー時は指数バックオフでリトライ（最大5回）
- アクティブコンテナへの**パイプ送信**（`sendMessage()` で IPC ファイル経由）

### 4. `src/container-runner.ts` (コンテナ実行)
- Docker/Podman でエージェントコンテナを `spawn`
- ボリュームマウント構成:
  - **Main グループ**: プロジェクトルート(RO)、グループフォルダ(RW)、`.env`はシャドウ
  - **非Main**: 自グループフォルダのみ + グローバルメモリ(RO)
- `ANTHROPIC_BASE_URL` を credential proxy に向け、コンテナにはAPIキーを渡さない
- stdout のマーカー (`---NANOCLAW_OUTPUT_START/END---`) でストリーミングパース

### 5. `src/ipc.ts` (プロセス間通信)
- ファイルベース IPC: `data/ipc/{group}/messages/` と `data/ipc/{group}/tasks/`
- コンテナからホストへの操作リクエスト: メッセージ送信、タスクCRUD、グループ登録
- **権限分離**: Main グループは全グループに操作可、非Main は自グループのみ

### 6. `src/db.ts` (SQLite永続化)
- テーブル: `chats`, `messages`, `router_state`, `sessions`, `registered_groups`, `scheduled_tasks`, `task_run_logs`
- JSON ファイルからの自動マイグレーション機能あり
- `getNewMessages()`: ボットメッセージをフィルタし、最新N件を時系列順で返却

### 7. `src/router.ts` (メッセージフォーマット)
- 受信メッセージを XML 形式 (`<messages><message sender="..." time="...">...</message></messages>`) にフォーマットしてコンテナに渡す
- `<internal>...</internal>` タグをストリップして返信テキストのみ抽出

### 8. `src/config.ts` (設定)
- トリガーパターン: `@{ASSISTANT_NAME}` の正規表現
- 各種タイムアウト、パス、並行数の定義

## セキュリティ設計

- **Credential Proxy**: コンテナはAPIキーを直接持たず、プロキシ経由で認証
- **Mount Allowlist**: `~/.config/nanoclaw/mount-allowlist.json` にホワイトリスト（コンテナ外に保存で改ざん防止）
- **Sender Allowlist**: メッセージ送信者の許可リスト
- **IPC 権限分離**: 非Main グループは自グループの操作のみ許可
- **`.env` シャドウ**: Main コンテナでも `/dev/null` で `.env` をマスク
