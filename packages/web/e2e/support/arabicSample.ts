// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { CatalogueText } from "./pseudoLocale";

/**
 * A small Arabic sample, for browser tests only: the chrome's names and one
 * count-bearing key of each kind, drafted by a machine and not reviewed by a
 * person who speaks Arabic, so it is test data and not a shipped language.
 * Arabic is the hardest case for the layout: right-to-left, joined letters,
 * six plural categories and Arabic-Indic digits from `Intl`. Every key it
 * leaves out falls back to English.
 *
 * The drawing status key is left out on purpose: the page object reads it by
 * splitting on `|`, and that key is covered by the English forms.
 */
export const ARABIC_SAMPLE: Readonly<Partial<CatalogueText>> = {
  "app.sheetTitle.directions": "الاتجاهات",
  "app.sheetTitle.mapOptions": "خيارات الخريطة",
  "app.sheetTitle.settings": "الإعدادات والمساعدة",
  "chrome.attribution.label": "حقوق الخريطة",
  "chrome.endStack.controls": "عناصر التحكم في الخريطة",
  "chrome.endStack.directions": "الاتجاهات",
  "chrome.endStack.draw": "رسم الأشكال",
  "chrome.endStack.locate": "حدّد موقعي",
  "chrome.endStack.mapOptions": "خيارات الخريطة",
  "chrome.endStack.measure": "قياس المسافة والمساحة",
  "chrome.endStack.resetBearing": "إعادة الاتجاه نحو الشمال",
  "chrome.endStack.settings": "الإعدادات",
  "chrome.endStack.zoomControls": "عناصر التكبير",
  "chrome.endStack.zoomIn": "تكبير",
  "chrome.endStack.zoomOut": "تصغير",
  "chrome.sheet.close": "إغلاق",
  "chrome.sheet.resize": "تغيير حجم اللوحة",
  "draw.shapeLabel.polygon": "مضلّع {serial}",
  "host.map.label": "الخريطة",
  "layers.key.title": "مفتاح الخريطة",
  "layers.key.toggle":
    "zero{المفتاح، {count} طبقة} one{المفتاح، {count} طبقة} two{المفتاح، {count} طبقتان} few{المفتاح، {count} طبقات} many{المفتاح، {count} طبقة} other{المفتاح، {count} طبقة}",
  "layers.title": "الطبقات",
  "layers.turnOff.all": "إيقاف كل الطبقات",
  "layers.turnOff.undo": "تراجع",
  "panels.basemap.groupLabel": "الخريطة الأساسية",
  "panels.pin.drop": "ضع دبوسًا في وسط الخريطة",
  "tools.addPointAtCentre": "أضف نقطة في وسط الخريطة",
  "tools.directions.addAtCentre": "أضف محطة في وسط الخريطة",
  "tools.directions.remove": "إزالة المحطة {letter}",
  "tools.done": "تم",
  "tools.draw.redo": "إعادة",
  "tools.draw.shapesAndExport": "الأشكال والتصدير",
  "tools.draw.toolbar": "رسم",
  "tools.draw.undo": "تراجع",
  "tools.measure.clear": "مسح النقاط",
  "tools.measure.label": "قياس",
  "tools.measure.undo": "تراجع عن آخر نقطة",
  "tools.pin.clear": "مسح الدبوس",
  "tools.pin.copy": "نسخ الإحداثيات",
  "tools.pin.heading": "الدبوس المُسقَط",
  "tools.pin.lookUp": "البحث عن العنوان",
  "tools.search.clear": "مسح البحث",
  "tools.search.label": "بحث",
  "tools.search.places": "البحث عن أماكن",
  "tools.search.results": "نتائج البحث",
  "tools.tryAgain": "حاول مرة أخرى",
  "ui.skipToMap": "انتقل إلى الخريطة",
  "units.metre":
    "zero{{count} متر} one{{count} متر} two{{count} مترين} few{{count} أمتار} many{{count} مترًا} other{{count} متر}",
  "units.kilometre":
    "zero{{count} كيلومتر} one{{count} كيلومتر} two{{count} كيلومترين} few{{count} كيلومترات} many{{count} كيلومترًا} other{{count} كيلومتر}",
};
