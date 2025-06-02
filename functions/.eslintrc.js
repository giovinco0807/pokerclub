// functions/.eslintrc.js
module.exports = {
  root: true,
  env: {
    es6: true, // または es2020, es2021 など
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google", // Googleのスタイルガイドを使用している場合
  ],
  rules: {
    "quotes": ["error", "double"],
    // 必要に応じてGoogleスタイルガイドのルールを上書き・無効化
    "object-curly-spacing": ["error", "always"], // 例: GoogleスタイルとPrettierの競合回避
    "require-jsdoc": "off", // JSDocを必須にしない
    "max-len": ["warn", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }], // 1行の最大長を緩和
    "indent": ["error", 2], // インデントをスペース2つに (Googleスタイルはスペース2つ)
    // 他にプロジェクトで使いたいルールがあれば追加
  },
  parserOptions: {
    // ↓↓↓ この部分が重要 ↓↓↓
    ecmaVersion: 2020, // または 2021, 12 (ECMAScript 2021), "latest" など
    // sourceType: "script", // CommonJS (require/exports) を使っているので "script" (デフォルト)
    // もし ES Modules (import/export) を使いたい場合は "module" にし、
    // package.json に "type": "module" を追加する必要がある
  },
};
