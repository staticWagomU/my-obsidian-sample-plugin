# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Community Plugin using TypeScript. Entry point `src/main.ts` compiles to `main.js` which Obsidian loads.

## Commands

```bash
# Install dependencies
pnpm install

# Development (watch mode)
pnpm dev

# Production build
pnpm build

# Run all tests
pnpm test

# Run tests once (no watch)
pnpm test:run

# Run single test file
pnpm test src/example.test.ts

# Linting (Oxlint + ESLint with obsidianmd plugin)
pnpm lint
pnpm lint:fix

# Type checking
pnpm typecheck

# Full validation (lint + typecheck + test + build)
pnpm validate
```

## Development Setup for Vault Testing

Create `.env` file to output directly to your Obsidian vault during development:

```bash
OBSIDIAN_PLUGIN_DIR=/path/to/YourVault/.obsidian/plugins/sample-plugin
```

When set, `pnpm dev` outputs `main.js` directly to the vault. Production build (`pnpm build`) always outputs to project root.

## Architecture

```
src/
  main.ts      # Plugin entry point - keep minimal, lifecycle only
  settings.ts  # Settings interface, defaults, and SettingTab
  *.test.ts    # Vitest tests (pure logic only, no Obsidian deps)
```

**Key pattern**: `main.ts` should only handle plugin lifecycle (`onload`, `onunload`). Delegate feature logic to separate modules.

## Build System

- **Bundler**: Vite + Rolldown (`vite.config.ts`)
- **Linting**: Oxlint (fast, general rules) + ESLint (obsidianmd-specific rules only)
- **Testing**: Vitest
- **Formatting**: oxfmt

## Obsidian Plugin Constraints

- Bundle everything into single `main.js` (no unbundled runtime deps)
- Use `this.register*` helpers for cleanup (DOM events, intervals, workspace events)
- Command IDs are stable API - never rename after release
- `manifest.json` `id` is immutable after release
- Default to offline operation; network requests require explicit user consent and documentation

## TypeScript Configuration

Strict mode with `noUncheckedIndexedAccess`, `strictNullChecks`, `noImplicitAny`. Source in `src/`, base URL is `src`.

## Skills

### `obsidian-plugin` Skill

Obsidianプラグイン開発のベストプラクティスを提供するSkill。以下の場面で**自動的に適用**される：

- プラグインコードの新規作成・修正
- コマンド、設定タブ、ビューの追加
- ファイル・フォルダ操作の実装
- UIコンポーネント（Modal、SettingTab等）の構築
- プラグインコードのレビュー

#### Skillが提供する知識

| ファイル | 内容 |
|---------|------|
| `api-patterns.md` | Workspace、Vault、Editor、MetadataCacheのAPIパターン |
| `ui-components.md` | SettingTab、Modal、View、CSSスタイリングのパターン |
| `security.md` | **必須**: DOM操作のセキュリティルール（`innerHTML`禁止等） |

#### 重要なルール

1. **`innerHTML`/`outerHTML`は使用禁止** → `createEl()`, `createDiv()`, `setText()` を使用
2. **グローバル`app`禁止** → `this.app` を使用
3. **`registerEvent()`でイベント登録** → アンロード時の自動クリーンアップのため
4. **ユーザーパスは`normalizePath()`で正規化**
