/* v3.21.0 (#69 R2, строка 13) — Recharts вынесен из vendored-react.chunk.js в отдельный ленивый
   чанк widgets/main/recharts.chunk.js (build:recharts): 38 % вендор-чанка парсились при каждом
   старте виджета ради отчётности. Грузится по первому монтированию панели отчётности
   (reporting-view.jsx loadRecharts, паттерн pdfmake/XLSX). React/ReactDOM — через шимы из
   SSP_VENDORED (тот же инстанс, что у вендор-чанка). Мутируем объект, НЕ переприсваиваем. */
import * as Recharts from 'recharts';
if (globalThis.SSP_VENDORED) globalThis.SSP_VENDORED.Recharts = Recharts;
