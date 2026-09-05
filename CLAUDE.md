# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Community Plugin using TypeScript. Entry point `src/main.ts` compiles to `main.js` which Obsidian loads.

## Toolchain Setup (mise + TAKUMI Guard)

Node.js / pnpm / direnv are pinned by `mise.toml`. Dependencies are fetched through the
TAKUMI Guard secure registry (`https://npm.flatt.tech/`).

```bash
# Install tools, allow direnv, install deps, set up Git hooks
mise run setup
```

**No token required.** `.npmrc` uses TAKUMI Guard's *anonymous mode* — setting the registry
URL alone enables malicious-package blocking, so forks and fresh clones install normally.
A personal (`tg_anon_`) or org (`tg_org_`) token only adds download tracking and breach
notifications; if you want that, put it in your user-level `~/.npmrc`, never in this repo.

CI uses `flatt-security/setup-takumi-guard-npm@v1`, which mints a short-lived token per job
via OIDC — no long-lived GitHub Secret. To link runs to an organization, add
`permissions: id-token: write` and pass `with: bot-id`.

TAKUMI Guard is a read-only proxy, so `npm publish` cannot go through it. This plugin ships
via GitHub Releases, so that limitation does not apply here.

If `pnpm` is missing from your shell, run `mise install`, or prefix commands with
`mise exec -- pnpm ...`.

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

**Vite+ (`vite-plus`) is the unified toolchain.** One dependency supplies the bundler,
test runner, linter, and formatter; `vite.config.ts` imports `defineConfig` from `vite-plus`.

- **Bundler**: Vite 8 + Rolldown, via Vite+ (`vp build`)
- **Testing**: Vitest, via Vite+ (`vp test`); tests import from `vite-plus/test`, not `vitest`
- **Linting**: Oxlint via Vite+ (`vp lint`) + ESLint (obsidianmd-specific rules only)
- **Formatting**: oxfmt via Vite+ (`vp fmt`; add `--write` to actually rewrite)

**Never call `oxlint` or `oxfmt` directly.** Vite+ replaces those bin names with shims that
print a redirect and exit 1. Use `vp lint` / `vp fmt` — this is why `lefthook.yml` calls
`pnpm exec vp lint` rather than `pnpm exec oxlint`.

`vp toolchain` prints the exact bundled tool versions. `vp check` runs format + lint + types
in one pass.

### Lint Configuration

**The Oxlint config lives in the `lint` block of `vite.config.ts`, and nowhere else.**
A root `oxlint.json` is *not* read — Oxlint looks for `.oxlintrc.json` — and Vite+ asks
for the `lint` block anyway so all toolchain config stays in one file. This repo carried
a dead `oxlint.json` for a while; `vp lint --print-config` is what proves which rules are
actually live, and is worth running after any change here.

Two things about that block are easy to get wrong:

- **Do not set `plugins`.** Naming plugins *replaces* the default set rather than adding
  to it, so `plugins: ["typescript"]` silently switches `unicorn` and `oxc` off.
- **`ignorePatterns` is for tracked files only.** Oxlint already skips anything in
  `.gitignore`, so `main.js` and `coverage/` need no entry.

**`options.typeAware` is on.** It enables the rules that need type information
(`no-floating-promises`, `no-unsafe-type-assertion`, `consistent-return`, …). The engine
is `oxlint-tsgolint`, bundled by Vite+ — that is the **TypeScript 7** native
implementation, and it ships its own copy, so it does not resolve either TypeScript in
`devDependencies`. Full runs take well under a second, so `lefthook.yml` pays nothing for it.

**`options.typeCheck` is on too**, which adds tsgo's own compiler diagnostics — the same
`TS2322`-style errors `tsc` reports. So `pnpm lint` alone would catch a type error even if
`pnpm typecheck` did not run; the separate step stays because `pnpm build` needs a gate that
does not depend on the linter.

This also means `tsconfig.json` must `include` every file Oxlint lints. `eslint.config.mts`
is in there for that reason; left out, tsgo checks it against defaults where `@types/node`'s
`ImportMeta` augmentation is missing and `import.meta.dirname` fails. Note the knock-on:
a file in `include` must *not* also appear in `allowDefaultProject` in `eslint.config.mts`,
or typescript-eslint's project service errors on the duplicate.

### pnpm Configuration

- `package.json` pins the package manager (`packageManager: pnpm@10.26.0`) and requires
  Node `>=20`, matching the CI matrix. `private: true` guards against accidental npm publish —
  this plugin ships via GitHub releases, never npm.
- `pnpm-workspace.yaml` holds pnpm settings (pnpm 10 reads settings from here, not `.npmrc`):
  - `onlyBuiltDependencies` — pnpm 10 blocks dependency build scripts by default.
    **lefthook must stay on this list**; its postinstall is what installs the Git hooks,
    so removing it silently disables `lefthook.yml`.
  - `minimumReleaseAge: 10080` — ignore package versions published within the last 7 days
    (value is in minutes). Applies at *resolution* time only, so `--frozen-lockfile`
    installs are unaffected. Layers with TAKUMI Guard for supply-chain defense.
  - `minimumReleaseAgeExclude` — added by `vp migrate`. Exempts the Vite+ toolchain packages
    from the 7-day hold, since their releases are pinned as an interlocking set.
  - `catalog:` / `overrides` — also from `vp migrate`. `vite` and `vitest` resolve to the
    versions Vite+ bundles, so the toolchain cannot drift out of sync. This is why those
    entries in `package.json` read `catalog:` instead of a version range.

## Obsidian Plugin Constraints

- Bundle everything into single `main.js` (no unbundled runtime deps)
- Use `this.register*` helpers for cleanup (DOM events, intervals, workspace events)
- Command IDs are stable API - never rename after release
- `manifest.json` `id` is immutable after release
- Default to offline operation; network requests require explicit user consent and documentation

## TypeScript Configuration

Strict mode with `noUncheckedIndexedAccess`, `strictNullChecks`, `noImplicitAny`. Source in `src/`.
`moduleResolution` is `bundler`, matching the Vite build.

**Type checking runs on TypeScript 7. `typescript` is still 5.9 for one consumer only.**

There are two TypeScript packages in `devDependencies`, and the split is deliberate:

| Package | Version | Who uses it |
| --- | --- | --- |
| `typescript7` (`npm:typescript@7.0.2`) | 7.x | `pnpm typecheck`, and `pnpm build` through it |
| `typescript` | 5.9.x | **typescript-eslint only** — nothing else resolves it |

This works because **TypeScript never emits here.** Every invocation is `--noEmit`; Rolldown
does the transpiling. So the version that type-checks and the version a lint plugin links
against have nothing to do with each other, and swapping the former changes no output.

Why not just put 7 in `typescript`: **typescript-eslint refuses to load under TS 7.** It
declares `typescript: >=4.8.4 <6.1.0`, and `eslint-plugin-obsidianmd` depends on it. This is
not a peer warning — `dist/index.js` throws on `versionMajor >= 7` before it exports
anything, so `pnpm lint:eslint` exits 2 with "typescript-eslint does not support TS 7.0".
Tracked in
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
for TS >= 7.1. **When that ships: delete the `typescript7` alias, move `typescript` to 7, and
point `typecheck` back at plain `tsc`.**

Two things to keep in mind while the alias is there:

- **Scripts must name the binary explicitly** (`node node_modules/typescript7/bin/tsc`).
  Both packages ship a `tsc` bin, so a bare `pnpm exec tsc` resolves by whichever won the
  `node_modules/.bin` collision — today that is 7, but it is not something to depend on.
  `lefthook.yml` calls `pnpm typecheck` rather than `tsc` for the same reason: the path
  is written down once.
- Do not add `typescript` to anything new. If a second consumer starts resolving it, the
  table above stops being true and the 5.9 pin turns into a real constraint.

**One TS 7 trap to know before you use `moment`.** TS 7 *removed* the option to turn
`esModuleInterop` off, so interop is always on. `obsidian.d.ts` does
`import * as Moment from 'moment'` and re-exports `export const moment: typeof Moment`;
with interop on, a namespace import of a CJS `export =` module has no call signatures, so
every `moment(...)` becomes `TS2349: This expression is not callable`. Property access such
as `moment.weekdaysShort()` is unaffected — only the call form needs a cast. The usual fix
is a single module that owns the cast and re-exports plain functions, so the workaround
lives in one place and can be deleted when upstream fixes the declaration.

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
