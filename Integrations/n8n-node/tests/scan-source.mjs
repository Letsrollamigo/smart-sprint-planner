#!/usr/bin/env node
// Ручной прогон проверки исходников сканером n8n (та же, что при верификации пакета) — перед подачей на верификацию.
// Сканер в зависимости пакета не входит. Подготовка во временной папке:
//   npm i --prefix <папка> --ignore-scripts @n8n/scan-community-package typescript@5.9.2 n8n-workflow
// (typescript закрепляется: с 7.x падает @typescript-eslint/parser). Запуск:
//   SCANNER_DIR=<папка> node tests/scan-source.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = process.env.SCANNER_DIR;
if (!dir) {
	console.error('scan-source: set SCANNER_DIR to the folder with @n8n/scan-community-package installed');
	process.exit(2);
}
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanner = pathToFileURL(path.join(path.resolve(dir), 'node_modules/@n8n/scan-community-package/scanner/scanner.mjs')).href;
const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(scanner);
const res = await analyzePackage(PKG, SOURCE_FILE_PATTERNS);
if (!res.passed) {
	console.error('scan-source: ' + res.message + '\n' + (res.details ?? ''));
	process.exit(1);
}
console.log('scan-source: passed (' + SOURCE_FILE_PATTERNS.join(', ') + ')');
