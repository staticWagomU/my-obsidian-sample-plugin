import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

// eslint-plugin-obsidianmd のみを有効化
// 一般的なルール（no-unused-vars等）は Oxlint で実行
export default defineConfig(
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					// このファイル自身は tsconfig.json の include に入っているので
					// ここには挙げない。両方に載ると projectService が衝突する。
					allowDefaultProject: ['manifest.json']
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Oxlint に任せるルールを無効化（obsidianmd.configs.recommended の後に適用）
		rules: {
			"no-undef": "off",
			"no-console": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		// `pnpm test:coverage` の出力。gitignore 済みだが ESLint は自前で走査する。
		"coverage",
		"vite.config.ts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
