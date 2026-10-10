/**
 * 龍來刮：接收網站訂單，寫入這份 Google 試算表
 *
 * 使用方式（詳見 google-apps-script/說明.md）：
 *   1. 試算表 →「擴充功能」→「Apps Script」，把這個檔案的內容整個貼上
 *   2. 上方函式選單選 setup → 執行（第一次會要求授權）
 *   3. 「部署」→「新增部署作業」→ 類型「網頁應用程式」
 *      執行身分：我　／　誰可以存取：所有人
 *   4. 把「網頁應用程式網址」貼到網站 app.js 最上方的 ORDER_API_URL
 *
 * 安全重點：網頁傳來的金額一律不採用，由這裡依「商品」工作表的價格重新計算。
 */

const ORDER_SHEET = '訂單';
const PRODUCT_SHEET = '商品';
const TIME_ZONE = 'Asia/Taipei';

// 運費規則：要跟網站 app.js 的 SHIPPING_FEE、FREE_SHIPPING_THRESHOLD 一致
const SHIPPING_FEE = 80;
const FREE_SHIPPING_THRESHOLD = 1000;

// 7-11 取貨付款代收金額上下限（以 7-11 最新公告為準）
const COD_MIN = 50;
const COD_MAX = 20000;

const ORDER_HEADERS = [
  '訂單編號', '下單時間', '收件人姓名', '收件人手機', '門市店號', '門市名稱',
  '商品內容', '商品小計', '運費', '代收金額', '備註', '狀態',
];

// setup() 第一次建立「商品」工作表時填入的資料，之後直接在試算表改價格即可
const DEFAULT_PRODUCTS = [
  ['p1', '幸運刮刮卡（單張）', 50],
  ['p2', '刮刮卡 10 張組', 450],
  ['p3', '黃金刮刮卡', 200],
  ['p4', '鑽石刮刮卡', 500],
  ['p5', '節慶限定卡', 100],
  ['p6', '週年慶禮盒', 990],
  ['p7', '新春開運禮盒', 1280],
  ['p8', '好友分享組', 680],
  ['p9', '企業贈禮組', 2400],
  ['p10', '開運刮板', 30],
  ['p11', '收藏卡冊', 280],
  ['p12', '幸運鑰匙圈', 150],
  ['p13', '帆布托特包', 450],
];

/** 建立「訂單」「商品」工作表（重複執行不會覆蓋既有資料） */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let orders = ss.getSheetByName(ORDER_SHEET);
  if (!orders) {
    orders = ss.insertSheet(ORDER_SHEET);
    orders.appendRow(ORDER_HEADERS);
    orders.setFrozenRows(1);
    orders.getRange(1, 1, 1, ORDER_HEADERS.length).setFontWeight('bold');
  }

  let products = ss.getSheetByName(PRODUCT_SHEET);
  if (!products) {
    products = ss.insertSheet(PRODUCT_SHEET);
    products.appendRow(['商品ID', '名稱', '價格', '上架']);
    products.setFrozenRows(1);
    products.getRange(1, 1, 1, 4).setFontWeight('bold');
    const rows = DEFAULT_PRODUCTS.map(([id, name, price]) => [id, name, price, true]);
    products.getRange(2, 1, rows.length, 4).setValues(rows);
    products.getRange(2, 4, rows.length, 1).insertCheckboxes();
  }
}

/** 用瀏覽器打開網址可以確認部署成功 */
function doGet() {
  return json({ ok: true, message: '龍來刮訂單服務運作中' });
}

/** 網站「送出訂單」會呼叫這裡 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: '資料格式錯誤，請重新整理頁面' });
  }

  let order;
  try {
    order = buildOrder(data);
  } catch (err) {
    return json({ ok: false, error: err.message });
  }

  // 同時有多筆訂單進來時排隊寫入，避免訂單編號重複
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json({ ok: false, error: '目前下單人數較多，請稍後再試' });
  }
  try {
    order.id = newOrderId();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDER_SHEET).appendRow([
      order.id,
      Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy/MM/dd HH:mm:ss'),
      asText(order.name),
      asText(order.phone),
      asText(order.storeCode),
      asText(order.storeName),
      asText(order.productText),
      order.subtotal,
      order.shipping,
      order.total,
      asText(order.note),
      '待出貨',
    ]);
  } finally {
    lock.releaseLock();
  }

  return json({
    ok: true,
    id: order.id,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
  });
}

/** 檢查欄位（規則參考快速建單），並依試算表價格計算金額；有問題就丟出給客人看的錯誤訊息 */
function buildOrder(data) {
  const name = clean(data.name);
  const phone = clean(data.phone);
  const storeCode = clean(data.storeCode);
  const storeName = clean(data.storeName);
  const note = clean(data.note);

  if (name.length < 2 || name.length > 10) throw new Error('收件人姓名須為 2～10 個字');
  if (!/^09\d{8}$/.test(phone)) throw new Error('手機須為 09 開頭的 10 碼數字');
  if (!/^\d{6}$/.test(storeCode)) throw new Error('門市店號須為 6 碼數字');
  if (!storeName || storeName.length > 20) throw new Error('請填寫門市名稱（20 字以內）');
  if (note.length > 60) throw new Error('備註請在 60 字以內');

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || items.length > 50) throw new Error('購物車內容有誤');

  const products = loadProducts();
  let subtotal = 0;
  const parts = [];
  items.forEach((item) => {
    const product = products[String(item.id)];
    const qty = Number(item.qty);
    if (!product) throw new Error('有商品已下架或不存在，請重新整理頁面');
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('商品數量有誤');
    subtotal += product.price * qty;
    parts.push(`${product.name}×${qty}`);
  });

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  if (total < COD_MIN || total > COD_MAX) {
    throw new Error(`7-11 取貨付款金額須在 NT$${COD_MIN}～NT$${COD_MAX} 之間`);
  }

  // 快速建單的商品欄位上限 40 字，超過就截短
  let productText = parts.join('、');
  if (productText.length > 40) productText = productText.slice(0, 39) + '…';

  return { name, phone, storeCode, storeName, note, productText, subtotal, shipping, total };
}

/** 讀「商品」工作表：{ 商品ID: { name, price } }，只收已勾選上架的商品 */
function loadProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCT_SHEET);
  const rows = sheet.getDataRange().getValues().slice(1);
  const products = {};
  rows.forEach(([id, name, price, listed]) => {
    if (id && listed === true && Number(price) > 0) {
      products[String(id)] = { name: String(name), price: Number(price) };
    }
  });
  return products;
}

/** 訂單編號：LL + 年月日時分秒 + 2 碼亂數，例如 LL26101014302507 */
function newOrderId() {
  const stamp = Utilities.formatDate(new Date(), TIME_ZONE, 'yyMMddHHmmss');
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return 'LL' + stamp + rand;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * 前面加 ' 讓試算表當成純文字：
 * 手機、店號開頭的 0 不會被吃掉，客人輸入 = 開頭的內容也不會被當成公式執行
 */
function asText(value) {
  return value ? "'" + value : '';
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
