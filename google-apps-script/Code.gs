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

// 固定使用指定試算表，網頁應用程式執行時也不會寫到其他檔案。
const SPREADSHEET_ID = '1gyDE1yfwX66Z3BvwrcM6QOAFf32unaTqAeVeB0iTeGE';
// 「商品」工作表：前 4 欄是收款用，後面是網站顯示用（2026-10-13 起網站直接讀這張表）
const PRODUCT_HEADERS = ['商品ID', '名稱', '價格', '上架', '分類', '角標', '熱銷', '圖示', '照片網址', '說明'];
const PRODUCT_CATEGORIES = ['刮刮卡', '禮盒組合', '周邊小物']; // 要和網站 app.js 的 CATEGORIES 名稱一致
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
  '商品內容', '商品小計', '運費', '代收金額', '備註', '狀態', '會員編號',
];
const MY_ORDERS_LIMIT = 50; // 會員中心最多顯示最近幾筆

// 每月消費排名（2026-10-16）
const SHIPMENT_SHEET = '出貨檔';     // 從雲端硬碟匯入的 Excel「客戶名單」放這裡（也可手動貼上）
const SHIPMENT_FOLDER = '龍來刮出貨檔'; // 雲端硬碟資料夾：每月把最新的出貨檔 Excel 上傳到這裡
const SHIPMENT_SOURCE_SHEET = '客戶名單'; // 要讀取的 Excel 工作表名稱
const RANK_SHEET = '每月排行';
const RANK_DETAIL_SHEET = '排行明細';
const RANK_HEADERS = ['月份', '名次', '會員編號', '姓名', '消費合計', '網站', '蝦皮', '賣貨便', '訂單數', '公布'];
const RANK_DETAIL_HEADERS = ['月份', '來源', '訂單編號', '下單日', '售價合計', '買家識別', '對應結果', '會員編號'];
const RANK_PUBLIC_TOP = 10;          // 網站中獎頁每月顯示前幾名
const RANK_PUBLIC_MONTHS = 12;       // 網站中獎頁最多顯示幾個月
const RANK_EXCLUDED_STATUS = /取消|退貨|退款|測試/; // 網站訂單狀態含這些字就不計入
// 出貨檔要讀的欄位（依第 1 列欄名找，欄位順序變了也沒關係）
const SHIPMENT_COLUMNS = { date: '日期', name: '姓名', id: 'ID', orderNo: '訂單編號', price: '售價', shop: '賣場' };
const DAILY_ORDER_LIMIT = 5; // 防止惡意下單：同一位會員每天最多幾筆訂單

// LINE 會員登入：Channel ID 可公開；Channel secret 放在「專案設定 → 指令碼屬性」的 LINE_CHANNEL_SECRET
const LINE_CHANNEL_ID = '2011980723';
const LINE_REDIRECT_URI = 'https://minihorsewang.github.io/longlaigua/';
const MEMBER_SHEET = '會員';
const SESSION_SHEET = '登入憑證';
const MEMBER_HEADERS = ['LINE ID', 'LINE 名稱', '姓名', '手機', 'Email', '點數', '加入時間', '最後登入時間', '會員編號', '蝦皮帳號', '所在縣市'];
const MEMBER_COUNTIES = ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const SHOPEE_COL = 10; // 「會員」工作表第 10 欄（J）：會員自填的蝦皮帳號，用來對應出貨檔的蝦皮訂單
const MEMBER_CODE_PREFIX = 'LM'; // 會員編號：LM + 加入年月(yyMM) + '-' + 當月流水號 4 碼，例如 LM2610-0001
const SESSION_HEADERS = ['憑證雜湊', 'LINE ID', '到期時間'];
const SESSION_DAYS = 30;
const SIGNUP_TICKET_SECONDS = 1800; // LINE 驗證通過後，30 分鐘內要填完註冊資料

// setup() 第一次建立「商品」工作表時填入的資料，之後直接在試算表改價格即可
const DEFAULT_PRODUCTS = [
  // [商品ID, 名稱, 價格, 分類, 角標, 熱銷, 圖示]
  ['p1', '幸運刮刮卡（單張）', 50, '刮刮卡', '熱銷', true, '🎫'],
  ['p2', '刮刮卡 10 張組', 450, '刮刮卡', '9 折', true, '🎟️'],
  ['p3', '黃金刮刮卡', 200, '刮刮卡', '', true, '🥇'],
  ['p4', '鑽石刮刮卡', 500, '刮刮卡', '新品', true, '💎'],
  ['p5', '節慶限定卡', 100, '刮刮卡', '', false, '🏮'],
  ['p6', '週年慶禮盒', 990, '禮盒組合', '限量', true, '🎁'],
  ['p7', '新春開運禮盒', 1280, '禮盒組合', '', true, '🧧'],
  ['p8', '好友分享組', 680, '禮盒組合', '', false, '🤝'],
  ['p9', '企業贈禮組', 2400, '禮盒組合', '', false, '🏢'],
  ['p10', '開運刮板', 30, '周邊小物', '', true, '🪙'],
  ['p11', '收藏卡冊', 280, '周邊小物', '', true, '📒'],
  ['p12', '幸運鑰匙圈', 150, '周邊小物', '', false, '🔑'],
  ['p13', '帆布托特包', 450, '周邊小物', '新品', false, '👜'],
];

/** 建立「訂單」「商品」「會員」「登入憑證」工作表（重複執行不會覆蓋既有資料） */
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tables = [
    [ORDER_SHEET, ORDER_HEADERS], [PRODUCT_SHEET, PRODUCT_HEADERS],
    [MEMBER_SHEET, MEMBER_HEADERS], [SESSION_SHEET, SESSION_HEADERS],
  ];

  // 舊版「會員」表沒有「會員編號」欄：補上欄名，並依加入時間幫既有會員編號
  const oldMembers = ss.getSheetByName(MEMBER_SHEET);
  if (oldMembers) {
    addLastHeader(oldMembers, MEMBER_HEADERS);
    backfillMemberCodes(oldMembers);
  }
  // 舊版「訂單」表沒有「會員編號」欄：補上欄名；以前的訂單留空
  const oldOrders = ss.getSheetByName(ORDER_SHEET);
  if (oldOrders) addLastHeader(oldOrders, ORDER_HEADERS);
  // 舊版「商品」表只有前 4 欄：補上網站顯示用的欄位，並幫範例商品填好分類、圖示
  const oldProducts = ss.getSheetByName(PRODUCT_SHEET);
  if (oldProducts) upgradeProductSheet(oldProducts);

  // 先檢查既有表，欄位不符時停止，不覆蓋原資料。
  for (const [name, headers] of tables) {
    const existing = ss.getSheetByName(name);
    if (existing) checkHeaders(existing, headers);
  }

  // 每月排名用：出貨檔（空白，等店家貼上）、每月排行、排行明細
  if (!ss.getSheetByName(SHIPMENT_SHEET)) ss.insertSheet(SHIPMENT_SHEET);
  shipmentFolder(); // 建立雲端硬碟「龍來刮出貨檔」資料夾（已有就沿用）
  for (const [name, headers] of [[RANK_SHEET, RANK_HEADERS], [RANK_DETAIL_SHEET, RANK_DETAIL_HEADERS]]) {
    const existing = ss.getSheetByName(name);
    if (existing) { checkHeaders(existing, headers); continue; }
    const sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  for (const [name, headers] of [[MEMBER_SHEET, MEMBER_HEADERS], [SESSION_SHEET, SESSION_HEADERS]]) {
    if (ss.getSheetByName(name)) continue;
    const sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
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
    products.appendRow(PRODUCT_HEADERS);
    products.setFrozenRows(1);
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length).setFontWeight('bold');
    const rows = DEFAULT_PRODUCTS.map(([id, name, price, cat, tag, hot, emoji]) => [id, name, price, true, cat, tag, hot, emoji, '', '']);
    products.getRange(2, 1, rows.length, PRODUCT_HEADERS.length).setValues(rows);
    formatProductSheet(products);
  }
}

/** 舊「商品」表補欄位；既有商品若新欄位是空的，依範例資料補上（已有內容的格子不會改） */
function upgradeProductSheet(sheet) {
  checkHeaders(sheet, PRODUCT_HEADERS.slice(0, 4));
  const width = PRODUCT_HEADERS.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (current[width - 1] === '') {
    sheet.getRange(1, 5, 1, width - 4).setValues([PRODUCT_HEADERS.slice(4)]).setFontWeight('bold');
  }
  checkHeaders(sheet, PRODUCT_HEADERS);

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const range = sheet.getRange(2, 1, lastRow - 1, width);
    const values = range.getValues();
    const defaults = {};
    DEFAULT_PRODUCTS.forEach(([id, , , cat, tag, hot, emoji]) => { defaults[id] = { cat, tag, hot, emoji }; });
    values.forEach((row) => {
      const d = defaults[String(row[0])];
      if (!d) return;
      if (row[4] === '') row[4] = d.cat;
      if (row[5] === '') row[5] = d.tag;
      if (row[6] === '') row[6] = d.hot;
      if (row[7] === '') row[7] = d.emoji;
    });
    range.setValues(values);
  }
  formatProductSheet(sheet);
}

/** 「上架」「熱銷」打勾框、「分類」下拉選單 */
function formatProductSheet(sheet) {
  // 只格式化到「現有商品 + 200 列」；以「商品ID」欄判斷有幾個商品（空白打勾框也算有值，不能用 getLastRow）
  const ids = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  let productCount = 0;
  ids.forEach(([id], i) => { if (i > 0 && id !== '') productCount = i; });
  const rows = Math.min(productCount + 200, sheet.getMaxRows() - 1);
  sheet.getRange(2, 4, rows, 1).insertCheckboxes();
  sheet.getRange(2, 7, rows, 1).insertCheckboxes();
  sheet.getRange(2, 5, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PRODUCT_CATEGORIES, true).setAllowInvalid(false).build()
  );
}

/** GET：?action=products 給網站讀商品、?action=ranking 讀已公布的每月排名；不帶參數可確認部署成功 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'ranking') {
    try {
      return json({ ok: true, months: publicRanking() });
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: '排名暫時無法讀取' });
    }
  }
  if (e && e.parameter && e.parameter.action === 'products') {
    try {
      return json({ ok: true, products: listProducts() });
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: '商品暫時無法讀取' });
    }
  }
  return json({ ok: true, message: '龍來刮訂單服務運作中' });
}

/** 網站顯示用的商品清單：只給已勾選上架、價格大於 0 的商品，依表上順序 */
function listProducts() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRODUCT_SHEET);
  checkHeaders(sheet, PRODUCT_HEADERS);
  return sheet.getDataRange().getValues().slice(1)
    .filter(([id, name, price, listed]) => id && name && listed === true && Number(price) > 0)
    .map(([id, name, price, , category, tag, hot, emoji, image, desc]) => ({
      id: String(id),
      name: String(name),
      price: Number(price),
      category: String(category),
      tag: String(tag),
      hot: hot === true,
      emoji: String(emoji),
      image: toImageUrl(image),
      desc: String(desc),
    }));
}

/** 照片網址：Google 雲端硬碟分享連結轉成可直接顯示的圖片網址；只接受 https */
function toImageUrl(value) {
  const url = clean(value);
  if (!url) return '';
  const driveId = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
  if (driveId) return 'https://drive.google.com/thumbnail?id=' + driveId[1] + '&sz=w800';
  return /^https:\/\//.test(url) ? url : '';
}

/** 網站「送出訂單」與會員登入都會呼叫這裡；有 action 的是會員功能 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: '資料格式錯誤，請重新整理頁面' });
  }
  if (data.action) return handleMember(data);

  let order;
  try {
    order = buildOrder(data);
  } catch (err) {
    return json({ ok: false, error: err.message });
  }

  // 限會員下單：由這裡驗證登入憑證再查會員編號，不採用網頁傳來的編號
  let memberCode = '';
  try {
    const lineId = data.token ? findSession(clean(data.token)) : null;
    const member = lineId && findMember(lineId);
    if (member) memberCode = String(member.row[8] || '');
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: '會員服務暫時無法使用，請稍後再試' });
  }
  if (!memberCode) {
    return json({ ok: false, error: '請先登入會員再下單', needLogin: true });
  }

  // 同時有多筆訂單進來時排隊寫入，避免訂單編號重複
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json({ ok: false, error: '目前下單人數較多，請稍後再試' });
  }
  try {
    const orderSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ORDER_SHEET);
    checkHeaders(orderSheet, ORDER_HEADERS);

    // 同一位會員今天已經下了幾筆（在鎖裡面算，避免同時送出多筆繞過上限）
    const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy/MM/dd');
    const todayCount = orderSheet.getDataRange().getValues().slice(1).filter((row) => {
      if (String(row[12]) !== memberCode) return false;
      const placed = row[1] instanceof Date ? Utilities.formatDate(row[1], TIME_ZONE, 'yyyy/MM/dd') : String(row[1]).slice(0, 10);
      return placed === today;
    }).length;
    if (todayCount >= DAILY_ORDER_LIMIT) {
      return json({ ok: false, error: `每位會員每天最多 ${DAILY_ORDER_LIMIT} 筆訂單，如需大量訂購請聯絡客服` });
    }

    order.id = newOrderId();
    orderSheet.appendRow([
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
      memberCode,
    ]);
  } catch (err) {
    return json({ ok: false, error: '訂單無法儲存，請聯絡店家確認試算表設定' });
  } finally {
    lock.releaseLock();
  }

  return json({
    ok: true,
    id: order.id,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    memberCode,
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

/* =========================================================
   會員：LINE 登入
   流程：網站轉到 LINE 同意頁 → LINE 帶著授權碼回到網站 → 網站把授權碼送來這裡
        → 這裡用 Channel secret 向 LINE 換身分證明並驗證 → 查「會員」工作表
   Channel secret 只存在指令碼屬性，不會出現在網站或 GitHub。
   ========================================================= */

const MEMBER_ACTIONS = { lineLogin, liffLogin, signup, updateMember, me, logout, myOrders, setShopee, shipmentPrize };

function handleMember(data) {
  const action = Object.prototype.hasOwnProperty.call(MEMBER_ACTIONS, data.action) ? MEMBER_ACTIONS[data.action] : null;
  if (!action) return json({ ok: false, error: '不支援的操作' });
  try {
    return json(Object.assign({ ok: true }, action(data)));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: err.userMessage || '會員服務暫時無法使用，請稍後再試', expired: !!err.expired });
  }
}

/** 給客人看的錯誤訊息；其他未預期的錯誤只顯示通用訊息 */
function fail(message, extra) {
  const err = new Error(message);
  err.userMessage = message;
  Object.assign(err, extra);
  throw err;
}

/** { code, nonce } → 老會員回傳 { token, member }；新朋友回傳 { needSignup, ticket, lineName } */
function lineLogin(data) {
  const code = clean(data.code);
  const nonce = clean(data.nonce);
  if (!code || !nonce) fail('登入資料不完整，請重新登入');
  const secret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  if (!secret) throw new Error('缺少指令碼屬性 LINE_CHANNEL_SECRET');

  const tokenRes = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'post',
    payload: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: LINE_REDIRECT_URI,
      client_id: LINE_CHANNEL_ID,
      client_secret: secret,
    },
    muteHttpExceptions: true,
  });
  if (tokenRes.getResponseCode() !== 200) {
    console.warn('LINE token', tokenRes.getResponseCode(), tokenRes.getContentText());
    fail('LINE 登入已逾時，請重新登入');
  }
  const idToken = JSON.parse(tokenRes.getContentText()).id_token;

  // 由 LINE 驗證身分證明的簽章、對象（本頻道）、有效期限與 nonce
  const verifyRes = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: LINE_CHANNEL_ID, nonce },
    muteHttpExceptions: true,
  });
  if (verifyRes.getResponseCode() !== 200) {
    console.warn('LINE verify', verifyRes.getResponseCode(), verifyRes.getContentText());
    fail('LINE 身分驗證失敗，請重新登入');
  }
  const profile = JSON.parse(verifyRes.getContentText());
  return finishLineLogin(profile);
}

/** LIFF SDK 傳來的 ID token 必須交由 LINE 驗證，不信任前台傳來的姓名或 LINE ID。 */
function liffLogin(data) {
  const idToken = clean(data.idToken);
  if (!idToken || idToken.length > 12000) fail('LINE 登入資料不完整，請重新開啟會員頁');
  const response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: LINE_CHANNEL_ID },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) fail('LINE 登入已失效，請重新開啟會員頁');
  const profile = JSON.parse(response.getContentText());
  // 除了 LINE 官方驗證，再確認頻道、發行者及到期時間。
  if (String(profile.aud) !== String(LINE_CHANNEL_ID) || profile.iss !== 'https://access.line.me' ||
      !Number.isFinite(Number(profile.exp)) || Number(profile.exp) <= Date.now() / 1000 ||
      typeof profile.sub !== 'string' || !profile.sub) fail('LINE 身分驗證失敗');
  return finishLineLogin(profile);
}

// OAuth 與 LIFF 使用同一個 channel，沿用原會員與註冊流程，不另建一套帳號。
function finishLineLogin(profile) {
  const lineId = String(profile.sub);
  const lineName = clean(profile.name).slice(0, 50);

  const found = findMember(lineId);
  if (!found) {
    const ticket = Utilities.getUuid();
    CacheService.getScriptCache().put('signup:' + ticket, JSON.stringify({ lineId, lineName }), SIGNUP_TICKET_SECONDS);
    return { needSignup: true, ticket, lineName };
  }
  found.sheet.getRange(found.rowNumber, 8).setValue(new Date());
  return { token: createSession(lineId), member: toMember(found.row) };
}

/** { ticket, name, phone, email, shopee? } → 寫入「會員」工作表 → { token, member } */
function signup(data) {
  const county = clean(data.county);
  if (!MEMBER_COUNTIES.includes(county)) fail('請先選擇所在縣市，再完成註冊');
  const name = clean(data.name);
  const phone = clean(data.phone);
  const email = clean(data.email);
  const shopee = normalizeShopee(data.shopee);
  if (name.length < 1 || name.length > 20) fail('姓名請填 1～20 個字');
  if (!/^09\d{8}$/.test(phone)) fail('手機須為 09 開頭的 10 碼數字');
  if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Email 格式不正確');
  if (shopee) checkShopeeFormat(shopee);

  const cache = CacheService.getScriptCache();
  const cacheKey = 'signup:' + clean(data.ticket);
  const pending = cache.get(cacheKey);
  if (!pending) fail('註冊時間已逾時，請重新用 LINE 登入', { expired: true });
  const { lineId, lineName } = JSON.parse(pending);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  try {
    const found = findMember(lineId);
    if (found) {
      row = found.row; // 同一個人重複送出：直接登入，不重複建立
    } else {
      const now = new Date();
      const sheet = memberSheet();
      if (shopee && findMemberByShopee(sheet, shopee)) fail('這個蝦皮帳號已被其他會員綁定，如有疑問請聯絡客服');
      const code = nextMemberCode(sheet, now);
      row = [lineId, lineName, name, phone, email, 0, now, now, code, shopee, county];
      sheet.appendRow([asText(lineId), asText(lineName), asText(name), asText(phone), asText(email), 0, now, now, code, asText(shopee), asText(county)]);
    }
  } finally {
    lock.releaseLock();
  }
  cache.remove(cacheKey);
  return { token: createSession(lineId), member: toMember(row) };
}

/** 只允許憑證所屬會員修改 C～E 欄，不動 LINE ID、點數、編號及訂單。 */
function updateMember(data) {
  const lineId = findSession(clean(data.token));
  if (!lineId) fail('登入已過期，請重新登入', { expired: true });
  const name = clean(data.name);
  const phone = clean(data.phone);
  const email = clean(data.email);
  if (name.length < 1 || name.length > 20) fail('姓名請填 1～20 個字');
  if (!/^09\d{8}$/.test(phone)) fail('手機須為 09 開頭的 10 碼數字');
  if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Email 格式不正確');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findMember(lineId);
    if (!found) fail('登入已過期，請重新登入', { expired: true });
    found.sheet.getRange(found.rowNumber, 3, 1, 3).setValues([[asText(name), asText(phone), asText(email)]]);
    found.row[2] = name;
    found.row[3] = phone;
    found.row[4] = email;
    return { member: toMember(found.row) };
  } finally { lock.releaseLock(); }
}

/** { token } → { member }：網站開啟時用來確認登入狀態、更新點數 */
function me(data) {
  const lineId = findSession(clean(data.token));
  const found = lineId && findMember(lineId);
  if (!found) fail('登入已過期，請重新登入', { expired: true });
  return { member: toMember(found.row) };
}

/** { token } → { orders }：這位會員自己的訂單（依會員編號），新的在前 */
function myOrders(data) {
  const lineId = findSession(clean(data.token));
  const found = lineId && findMember(lineId);
  if (!found) fail('登入已過期，請重新登入', { expired: true });
  const code = String(found.row[8] || '');
  if (!code) return { orders: [] };

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ORDER_SHEET);
  checkHeaders(sheet, ORDER_HEADERS);
  const orders = sheet.getDataRange().getValues().slice(1)
    .filter((row) => String(row[12]) === code)
    .reverse()
    .slice(0, MY_ORDERS_LIMIT)
    .map((row) => ({
      id: String(row[0]),
      date: row[1] instanceof Date ? Utilities.formatDate(row[1], TIME_ZONE, 'yyyy-MM-dd') : String(row[1]).slice(0, 10),
      store: String(row[5]),
      product: String(row[6]),
      total: Number(row[9]) || 0,
      status: String(row[11]),
    }));
  return { orders };
}

/** { token, shopee } → 會員補填蝦皮帳號（只能填一次；要修改請聯絡客服，由店家直接改試算表） */
function setShopee(data) {
  const shopee = normalizeShopee(data.shopee);
  if (!shopee) fail('請輸入蝦皮帳號');
  checkShopeeFormat(shopee);

  const lineId = findSession(clean(data.token));
  if (!lineId) fail('登入已過期，請重新登入', { expired: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findMember(lineId);
    if (!found) fail('登入已過期，請重新登入', { expired: true });
    if (String(found.row[SHOPEE_COL - 1] || '')) fail('已綁定蝦皮帳號，如需修改請聯絡客服');
    const owner = findMemberByShopee(found.sheet, shopee);
    if (owner) fail('這個蝦皮帳號已被其他會員綁定，如有疑問請聯絡客服');
    found.sheet.getRange(found.rowNumber, SHOPEE_COL).setValue(asText(shopee));
    found.row[SHOPEE_COL - 1] = shopee;
    return { member: toMember(found.row) };
  } finally {
    lock.releaseLock();
  }
}

/** 蝦皮帳號：去掉空白與開頭的 @，統一小寫（蝦皮帳號不分大小寫） */
function normalizeShopee(value) {
  return clean(value).replace(/^@/, '').toLowerCase();
}

function checkShopeeFormat(shopee) {
  if (!/^[a-z0-9._]{3,30}$/.test(shopee)) fail('蝦皮帳號格式不正確（只能有英文、數字、底線、句點，3～30 個字）');
}

function findMemberByShopee(sheet, shopee) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][SHOPEE_COL - 1] || '').toLowerCase() === shopee) return { row: values[i], rowNumber: i + 1 };
  }
  return null;
}

/** { token } → 刪除這組登入憑證 */
function logout(data) {
  const hash = sha256(clean(data.token));
  const sheet = sessionSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === hash) sheet.deleteRow(i + 1);
  }
  return {};
}

function memberSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBER_SHEET);
  if (!sheet) throw new Error('缺少會員工作表，請店家先執行 setup');
  if (sheet.getMaxColumns() < 11) sheet.insertColumnsAfter(sheet.getMaxColumns(), 11 - sheet.getMaxColumns());
  // 僅在原有 A～J 欄完全符合時追加 K 欄，避免移動或覆寫既有會員資料。
  const headers = sheet.getRange(1, 1, 1, 11).getValues()[0];
  if (!headers[10] && MEMBER_HEADERS.slice(0, 10).every((header, index) => headers[index] === header)) {
    sheet.getRange(1, 11).setValue('所在縣市');
  }
  checkHeaders(sheet, MEMBER_HEADERS);
  return sheet;
}

function sessionSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SESSION_SHEET);
  checkHeaders(sheet, SESSION_HEADERS);
  return sheet;
}

function findMember(lineId) {
  const sheet = memberSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === lineId) return { sheet, row: values[i], rowNumber: i + 1 };
  }
  return null;
}

function toMember(row) {
  const joined = row[6] instanceof Date ? Utilities.formatDate(row[6], TIME_ZONE, 'yyyy-MM-dd') : String(row[6]);
  return {
    provider: 'line',
    lineName: String(row[1]),
    name: String(row[2]),
    phone: String(row[3]),
    email: String(row[4]),
    points: Number(row[5]) || 0,
    joined,
    memberCode: String(row[8] || ''),
    shopee: String(row[SHOPEE_COL - 1] || ''),
    county: String(row[10] || ''),
    prizes: [],
  };
}

/** 依加入月份取下一個會員編號；呼叫端要先拿到 LockService 鎖，避免同時註冊拿到同一號 */
function nextMemberCode(sheet, joinedAt) {
  const prefix = MEMBER_CODE_PREFIX + Utilities.formatDate(joinedAt, TIME_ZONE, 'yyMM') + '-';
  const codes = sheet.getRange(2, 9, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  let max = 0;
  codes.forEach(([code]) => {
    const text = String(code);
    if (text.startsWith(prefix)) max = Math.max(max, Number(text.slice(prefix.length)) || 0);
  });
  return prefix + String(max + 1).padStart(4, '0');
}

/** 幫還沒有會員編號的會員補編號（依加入時間先後），已有編號的不會變動 */
function backfillMemberCodes(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, MEMBER_HEADERS.length).getValues();
  const missing = values
    .map((row, i) => ({ rowNumber: i + 2, joinedAt: row[6] instanceof Date ? row[6] : new Date(), code: row[8] }))
    .filter((m) => !m.code)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  missing.forEach((m) => {
    sheet.getRange(m.rowNumber, 9).setValue(nextMemberCode(sheet, m.joinedAt));
  });
}

/** 登入憑證：網站只拿到原始亂數，試算表只存雜湊值，表被看到也無法冒用 */
function createSession(lineId) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  sessionSheet().appendRow([sha256(token), asText(lineId), expires]);
  return token;
}

function findSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const values = sessionSheet().getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === hash && values[i][2] instanceof Date && values[i][2] > now) return String(values[i][1]);
  }
  return null;
}

function sha256(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}

/** 讀「商品」工作表：{ 商品ID: { name, price } }，只收已勾選上架的商品 */
function loadProducts() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRODUCT_SHEET);
  checkHeaders(sheet, PRODUCT_HEADERS);
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

/** 舊表少了最後一欄時補上欄名（前面的欄位必須完全相同才會補，否則停止） */
function addLastHeader(sheet, headers) {
  const lastCol = headers.length;
  if (sheet.getRange(1, lastCol).getValue() !== '') return;
  checkHeaders(sheet, headers.slice(0, lastCol - 1));
  sheet.getRange(1, lastCol).setValue(headers[lastCol - 1]).setFontWeight('bold');
}

/** 第 1 列是欄位名稱、第 2 列起是資料；欄位不符時停止，保留原表。 */
function checkHeaders(sheet, expected) {
  if (!sheet) throw new Error('缺少必要工作表，請店家先執行 setup');
  const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (expected.some((header, index) => actual[index] !== header)) {
    throw new Error('工作表「' + sheet.getName() + '」欄位不符，請店家確認第 1 列欄位與順序');
  }
}

/* =========================================================
   每月消費排名
   規則：只有網站會員參加；網站、蝦皮、賣貨便的消費合併計算，金額用售價（不含運費、優惠券折抵前）
   - 網站：「訂單」的會員編號；金額用商品小計；狀態含 取消／退貨／退款／測試 的不算
   - 蝦皮：出貨檔的 ID（蝦皮買家帳號）＝會員綁定的蝦皮帳號
   - 賣貨便：出貨檔的 ID（遮罩手機 0913***353）＝會員手機的前 4 碼＋末 3 碼，且姓氏相同
   - 出貨檔 ID 欄不是帳號／手機（例如「龍蛋*10張」）的訂單略過
   使用：Excel 上傳到雲端硬碟「龍來刮出貨檔」→ 試算表選單「龍來刮」→ 匯入並計算 → 檢查「每月排行」「排行明細」→ 勾選「公布」
   需要在 Apps Script「服務」加入 Drive API（把 Excel 轉成試算表來讀取）
   ========================================================= */

/** 打開試算表時加上「龍來刮」選單 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('龍來刮')
    .addItem('匯入出貨檔並計算上個月排名', 'rankLastMonth')
    .addItem('匯入出貨檔並計算指定月份排名…', 'rankChosenMonth')
    .addSeparator()
    .addItem('只匯入出貨檔（不計算）', 'importShipmentOnly')
    .addItem('使用說明', 'showRankingHelp')
    .addSeparator()
    .addItem('初始化出貨抽獎工作表', 'setupShipmentPrize')
    .addItem('產生或重印出貨抽獎連結', 'issueShipmentPrizeLink')
    .addToUi();
}

function rankLastMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  runRanking(Utilities.formatDate(last, TIME_ZONE, 'yyyy-MM'));
}

function rankChosenMonth() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('計算指定月份排名', '請輸入月份，例如 2026-07', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const ym = res.getResponseText().trim().replace(/\//g, '-').replace(/^(\d{4})-(\d)$/, '$1-0$2');
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ui.alert('月份格式不正確，請輸入像 2026-07 這樣的格式');
    return;
  }
  runRanking(ym);
}

function importShipmentOnly() {
  const ui = SpreadsheetApp.getUi();
  try {
    const info = importShipmentFile();
    ui.alert('出貨檔匯入完成', importSummary(info), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('出貨檔匯入失敗', err.message, ui.ButtonSet.OK);
  }
}

function importSummary(info) {
  return `檔案：${info.fileName}（${info.updated} 上傳／修改）
匯入 ${info.rows} 列到「${SHIPMENT_SHEET}」工作表`;
}

function runRanking(ym) {
  const ui = SpreadsheetApp.getUi();
  try {
    const info = importShipmentFile();
    const r = computeRanking(ym);
    const top = r.ranked[0];
    ui.alert(`${ym} 排名計算完成`, [
      importSummary(info),
      '',
      `參加排名的會員：${r.ranked.length} 位`,
      top ? `第 1 名：${top.code} ${top.name}，消費 ${top.total} 元` : '這個月沒有會員的消費紀錄',
      r.tied ? '⚠️ 第 1 名有同分，請到「每月排行」確認' : '',
      '',
      `當月訂單：網站 ${r.count.website} 筆、出貨檔 ${r.count.shipment} 筆`,
      `已對應到會員：${r.count.matched} 筆`,
      `未對應（不是會員或沒綁蝦皮帳號）：${r.count.unmatched} 筆`,
      r.count.ambiguous ? `⚠️ 無法確定是哪位會員：${r.count.ambiguous} 筆（請看「排行明細」）` : '',
      r.count.skipped ? `略過：${r.count.skipped} 筆` : '',
      '',
      '請檢查「每月排行」與「排行明細」，確認無誤後勾選「公布」，網站中獎頁就會顯示。',
    ].filter((line) => line !== null && line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n'), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('排名計算失敗', err.message, ui.ButtonSet.OK);
  }
}

function showRankingHelp() {
  SpreadsheetApp.getUi().alert('每月排名使用說明', [
    `1. 把最新的出貨檔 Excel 上傳到 Google 雲端硬碟「${SHIPMENT_FOLDER}」資料夾（可以覆蓋舊檔，或直接放新檔）`,
    '2. 上方選單「龍來刮」→「匯入出貨檔並計算上個月排名」（或指定月份）',
    `3. 程式會讀資料夾裡最新的檔案的「${SHIPMENT_SOURCE_SHEET}」工作表，放到「${SHIPMENT_SHEET}」後計算`,
    '4. 檢查「每月排行」名次，以及「排行明細」每筆訂單的對應結果',
    '5. 確認無誤後，在「每月排行」把要公布的列勾選「公布」，網站中獎頁就會顯示',
    '',
    '已公布的月份不能重算；要重算請先取消勾選「公布」。',
  ].join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/** 雲端硬碟「龍來刮出貨檔」資料夾（沒有就建立） */
function shipmentFolder() {
  const folders = DriveApp.getFoldersByName(SHIPMENT_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(SHIPMENT_FOLDER);
}

/** 讀資料夾裡最新的 Excel（或 Google 試算表）的「客戶名單」，整張覆蓋到「出貨檔」工作表 */
function importShipmentFile() {
  const folder = shipmentFolder();
  let latest = null;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const isExcel = /\.xls[xm]?$/i.test(file.getName());
    const isSheet = file.getMimeType() === MimeType.GOOGLE_SHEETS && !file.getName().startsWith('（暫存）');
    if (!isExcel && !isSheet) continue;
    if (!latest || file.getLastUpdated() > latest.getLastUpdated()) latest = file;
  }
  if (!latest) throw new Error(`雲端硬碟「${SHIPMENT_FOLDER}」資料夾裡沒有 Excel 檔，請先上傳出貨檔`);

  // Excel 要先轉成 Google 試算表才能讀；轉出來的暫存檔用完就丟到垃圾桶
  let tempId = null;
  let sourceId = latest.getId();
  if (latest.getMimeType() !== MimeType.GOOGLE_SHEETS) {
    const converted = Drive.Files.create(
      { name: '（暫存）' + latest.getName(), mimeType: MimeType.GOOGLE_SHEETS, parents: [folder.getId()] },
      latest.getBlob());
    tempId = sourceId = converted.id;
  }
  try {
    const source = SpreadsheetApp.openById(sourceId).getSheetByName(SHIPMENT_SOURCE_SHEET);
    if (!source) throw new Error(`「${latest.getName()}」裡找不到「${SHIPMENT_SOURCE_SHEET}」工作表`);
    // 文字前面加 ' 保持原樣（避免 045、長數字訂單編號被試算表轉成數字）；日期、數字照原值
    const values = source.getDataRange().getValues()
      .map((row) => row.map((v) => (typeof v === 'string' && v !== '' ? "'" + v : v)));
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const target = ss.getSheetByName(SHIPMENT_SHEET) || ss.insertSheet(SHIPMENT_SHEET);
    target.clearContents();
    target.getRange(1, 1, values.length, values[0].length).setValues(values);
    SpreadsheetApp.flush();
    return {
      fileName: latest.getName(),
      updated: Utilities.formatDate(latest.getLastUpdated(), TIME_ZONE, 'yyyy/MM/dd HH:mm'),
      rows: values.length - 1,
    };
  } finally {
    if (tempId) DriveApp.getFileById(tempId).setTrashed(true);
  }
}

/** 計算某個月份（yyyy-MM）的排名，寫入「每月排行」「排行明細」 */
function computeRanking(ym) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rankSheet = ss.getSheetByName(RANK_SHEET);
  const detailSheet = ss.getSheetByName(RANK_DETAIL_SHEET);
  checkHeaders(rankSheet, RANK_HEADERS);
  checkHeaders(detailSheet, RANK_DETAIL_HEADERS);

  const rankValues = rankSheet.getDataRange().getValues();
  if (rankValues.slice(1).some((row) => String(row[0]) === ym && row[9] === true)) {
    throw new Error(`${ym} 已有勾選「公布」的名次，請先取消勾選再重新計算`);
  }

  // 會員：依會員編號、蝦皮帳號、手機前 4＋末 3 碼建立對照
  const members = memberSheet().getDataRange().getValues().slice(1)
    .filter((row) => row[8])
    .map((row) => ({ code: String(row[8]), name: String(row[2]), phone: String(row[3]), shopee: String(row[SHOPEE_COL - 1] || '').toLowerCase() }));
  const byCode = {}, byShopee = {}, byMaskedPhone = {};
  members.forEach((m) => {
    byCode[m.code] = m;
    if (m.shopee) byShopee[m.shopee] = m;
    if (/^09\d{8}$/.test(m.phone)) {
      const key = m.phone.slice(0, 4) + m.phone.slice(-3);
      (byMaskedPhone[key] = byMaskedPhone[key] || []).push(m);
    }
  });

  const details = []; // [來源, 訂單編號, 下單日, 金額, 買家識別, 對應結果, 會員]
  const count = { website: 0, shipment: 0, matched: 0, unmatched: 0, ambiguous: 0, skipped: 0 };
  const totals = {}; // 會員編號 → { 網站, 蝦皮, 賣貨便, orders }
  const add = (member, source, amount) => {
    const t = totals[member.code] = totals[member.code] || { member, 網站: 0, 蝦皮: 0, 賣貨便: 0, orders: 0 };
    t[source] += amount;
    t.orders++;
  };

  // 1) 網站訂單
  const orderRows = ss.getSheetByName(ORDER_SHEET).getDataRange().getValues().slice(1);
  orderRows.forEach((row) => {
    const day = toDay(row[1]);
    if (!day || day.slice(0, 7) !== ym) return;
    count.website++;
    const code = String(row[12] || '');
    const status = String(row[11] || '');
    const amount = Number(row[7]) || 0;
    let result;
    if (!code) { result = '未對應（下單時未登入會員）'; count.unmatched++; }
    else if (RANK_EXCLUDED_STATUS.test(status)) { result = `略過（狀態：${status}）`; count.skipped++; }
    else if (!byCode[code]) { result = '未對應（找不到這個會員編號）'; count.unmatched++; }
    else { result = '已對應（網站會員）'; count.matched++; add(byCode[code], '網站', amount); }
    details.push(['網站', String(row[0]), day, amount, code || '—', result, code]);
  });

  // 2) 出貨檔（蝦皮、賣貨便）
  readShipmentOrders(ss).forEach((o) => {
    if (!o.day || o.day.slice(0, 7) !== ym) return;
    count.shipment++;
    let result, member = null, source = '';
    if (o.duplicate) {
      result = '略過（訂單編號重複，只計第一筆）'; count.skipped++;
    } else if (/蝦皮/.test(o.shop)) {
      source = '蝦皮';
      const account = o.id.toLowerCase();
      if (!/^[a-z0-9._]+$/.test(account)) { result = '略過（ID 不是蝦皮帳號）'; count.skipped++; }
      else if (byShopee[account]) { member = byShopee[account]; result = '已對應（蝦皮帳號）'; }
      else { result = '未對應（沒有會員綁定這個蝦皮帳號）'; count.unmatched++; }
    } else if (/賣貨便/.test(o.shop)) {
      source = '賣貨便';
      const m = o.id.match(/^(09\d{2})\*+(\d{3})$/);
      if (!m) { result = '略過（ID 不是遮罩手機）'; count.skipped++; }
      else {
        const surname = o.name && o.name[0] !== '*' ? o.name[0] : '';
        const candidates = (byMaskedPhone[m[1] + m[2]] || []).filter((c) => !surname || c.name[0] === surname);
        if (candidates.length === 1) { member = candidates[0]; result = '已對應（遮罩手機＋姓氏）'; }
        else if (candidates.length > 1) { result = `無法確定（${candidates.map((c) => c.code).join('、')} 都符合）`; count.ambiguous++; }
        else { result = '未對應（沒有符合的會員手機）'; count.unmatched++; }
      }
    } else {
      result = `略過（未知賣場：${o.shop || '空白'}）`; count.skipped++;
    }
    if (member) { count.matched++; add(member, source, o.total); }
    details.push([source || o.shop || '出貨檔', o.orderNo, o.day, o.total, o.id || '—', result, member ? member.code : '']);
  });

  // 3) 排名（同分同名次）
  const ranked = Object.values(totals)
    .map((t) => ({ code: t.member.code, name: t.member.name, total: t.網站 + t.蝦皮 + t.賣貨便, t }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
  let lastTotal = null, lastRank = 0;
  ranked.forEach((r, i) => {
    r.rank = r.total === lastTotal ? lastRank : i + 1;
    lastTotal = r.total;
    lastRank = r.rank;
  });
  const tied = ranked.length > 1 && ranked[1].rank === 1;

  // 4) 寫入：先移除這個月份的舊結果，再加上新結果
  replaceMonthRows(rankSheet, ym, ranked.map((r) => [
    ym, r.rank, r.code, maskName(r.name), r.total, r.t.網站, r.t.蝦皮, r.t.賣貨便, r.t.orders, false,
  ]), RANK_HEADERS.length, 10);
  replaceMonthRows(detailSheet, ym, details.map((d) => [ym].concat(d.map((v, i) => (i === 3 ? v : String(v))))),
    RANK_DETAIL_HEADERS.length, 0);

  return { ranked, tied, count };
}

/** 讀「出貨檔」工作表：一筆訂單可能有好幾列（只有第一列有訂單編號），售價加總 */
function readShipmentOrders(ss) {
  const sheet = ss.getSheetByName(SHIPMENT_SHEET);
  if (!sheet) throw new Error('找不到「出貨檔」工作表，請先執行 setup');
  const values = sheet.getDataRange().getValues();
  const headerRow = values.findIndex((row, i) => i < 5 && row.some((c) => String(c).trim() === SHIPMENT_COLUMNS.orderNo));
  if (headerRow < 0) throw new Error('「出貨檔」是空的，或第 1 列沒有「訂單編號」等欄名。請把 Excel「客戶名單」整張（含第 1 列欄名）貼到 A1');
  const header = values[headerRow].map((c) => String(c).trim());
  const col = {};
  for (const [key, label] of Object.entries(SHIPMENT_COLUMNS)) {
    col[key] = header.indexOf(label);
    if (col[key] < 0) throw new Error(`「出貨檔」找不到「${label}」欄，請確認貼上的是 Excel 的「客戶名單」工作表`);
  }

  const orders = [];
  const seen = {};
  let current = null;
  values.slice(headerRow + 1).forEach((row) => {
    const orderNo = String(row[col.orderNo]).trim();
    if (orderNo) {
      current = {
        orderNo, day: toDay(row[col.date]), name: String(row[col.name]).trim(),
        id: String(row[col.id]).trim(), shop: String(row[col.shop]).trim(), total: 0, duplicate: !!seen[orderNo],
      };
      seen[orderNo] = true;
      orders.push(current);
    }
    if (current) current.total += Number(row[col.price]) || 0;
  });
  return orders;
}

/** 日期轉成 yyyy-MM-dd：支援試算表日期、Excel 日期序號、文字 2026/7/1 或 2026-07-01 */
function toDay(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, TIME_ZONE, 'yyyy-MM-dd');
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return Utilities.formatDate(new Date(Math.round((value - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  const m = String(value).trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

/** 王小明 → 王*明；王明 → 王* */
function maskName(name) {
  const n = String(name).trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

/** 刪掉某月份的舊列、加上新列；checkboxCol（1 起算）有值時加上打勾框 */
function replaceMonthRows(sheet, ym, newRows, width, checkboxCol) {
  const values = sheet.getDataRange().getValues();
  const kept = values.slice(1).filter((row) => row[0] !== '' && String(row[0]) !== ym).map((row) => row.slice(0, width));
  // 文字一律加 ' 存成純文字，避免月份、訂單編號被試算表自動轉成日期或數字
  const all = kept.concat(newRows).map((row) => row.map((v) => (typeof v === 'string' && v !== '' ? "'" + v : v)));
  if (values.length > 1) sheet.getRange(2, 1, values.length - 1, Math.max(width, sheet.getLastColumn())).clearContent().removeCheckboxes();
  if (!all.length) return;
  sheet.getRange(2, 1, all.length, width).setValues(all);
  if (checkboxCol) sheet.getRange(2, checkboxCol, all.length, 1).insertCheckboxes();
}

/** 網站中獎頁：已勾選「公布」的名次（前 RANK_PUBLIC_TOP 名，只給遮罩姓名，不給金額與會員編號） */
function publicRanking() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RANK_SHEET);
  if (!sheet) return [];
  const byMonth = {};
  sheet.getDataRange().getValues().slice(1).forEach((row) => {
    if (row[9] !== true) return;
    const month = String(row[0]);
    const rank = Number(row[1]);
    if (!/^\d{4}-\d{2}$/.test(month) || !(rank >= 1) || rank > RANK_PUBLIC_TOP) return;
    (byMonth[month] = byMonth[month] || []).push({ rank, name: String(row[3]) });
  });
  return Object.keys(byMonth).sort().reverse().slice(0, RANK_PUBLIC_MONTHS)
    .map((month) => ({ month, entries: byMonth[month].sort((a, b) => a.rank - b.rank) }));
}

/* 出貨抽獎：每張出貨單一列；抽獎與領獎各只寫一次。 */
const SHIPMENT_PRIZE_SHEET = '出貨抽獎與領獎';
const SHIPMENT_PRIZE_POOL = '出貨獎項';
const SHIPMENT_PRIZE_HEADERS = ['出貨單號', '抽獎碼', '發行時間', '抽獎時間', 'LINE ID', '獎品', '領獎單號', '會員編號', '領獎時間', '處理狀態'];
const SHIPMENT_POOL_HEADERS = ['獎品名稱', '權重', '啟用'];
const SHIPMENT_DRAW_LINK = 'https://liff.line.me/2011980723-3dySl95Q?draw=';

function setupShipmentPrize() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  for (const [name, headers] of [[SHIPMENT_PRIZE_SHEET, SHIPMENT_PRIZE_HEADERS], [SHIPMENT_PRIZE_POOL, SHIPMENT_POOL_HEADERS]]) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
    checkHeaders(sheet, headers);
  }
}

function issueShipmentPrizeLink() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('產生出貨抽獎連結', '請輸入唯一出貨單號，例如 WEB-12345 或 SHOPEE-12345。相同單號會取回原連結。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const reference = clean(response.getResponseText()).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(reference)) {
    ui.alert('請使用 1 至 80 個英數、底線或連字號，並以英數開頭。');
    return;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let code;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHIPMENT_PRIZE_SHEET);
    checkHeaders(sheet, SHIPMENT_PRIZE_HEADERS);
    const existing = sheet.getDataRange().getValues().slice(1).find(row => String(row[0]) === reference);
    if (existing) {
      code = String(existing[1]);
    } else {
      code = Utilities.getUuid().replace(/-/g, '');
      sheet.appendRow([asText(reference), asText(code), new Date()]);
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('抽獎碼欄位不正確，請檢查原工作表');
  const template = HtmlService.createTemplateFromFile('ShipmentQr');
  template.link = SHIPMENT_DRAW_LINK + code;
  template.reference = reference;
  ui.showModalDialog(template.evaluate().setWidth(450).setHeight(540), '出貨抽獎 QR Code');
}

function shipmentPrize(data) {
  const code = clean(data.code);
  const operation = data.operation;
  if (!/^[a-f0-9]{32}$/.test(code) || !['status', 'draw', 'claim'].includes(operation)) fail('請掃描包裹內的有效抽獎碼');
  // 新客用現有 LINE 驗證後發的註冊憑證，會員用既有登入憑證。
  const ticket = data.ticket && CacheService.getScriptCache().get('signup:' + clean(data.ticket));
  const lineId = data.token ? findSession(clean(data.token)) : ticket && JSON.parse(ticket).lineId;
  if (!lineId) fail('LINE 驗證已逾時，請重新掃描包裹上的抽獎碼', { expired: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHIPMENT_PRIZE_SHEET);
    if (!sheet) fail('出貨抽獎尚未開放，請聯絡店家');
    checkHeaders(sheet, SHIPMENT_PRIZE_HEADERS);
    const rows = sheet.getDataRange().getValues().slice(1);
    const index = rows.findIndex(row => String(row[1]) === code);
    if (index < 0) fail('查不到此抽獎碼，請確認包裹上的連結');
    const row = rows[index];
    if (row[4] && row[4] !== lineId) fail('此抽獎碼已由其他 LINE 帳號使用');
    if (operation === 'draw' && !row[4]) {
      const prize = chooseShipmentPrize(ss);
      sheet.getRange(index + 2, 4, 1, 3).setValues([[new Date(), asText(lineId), asText(prize)]]);
      SpreadsheetApp.flush();
      row[4] = lineId;
      row[5] = prize;
    }
    if (operation === 'claim' && !row[6]) {
      if (!row[5]) fail('請先完成抽獎');
      const member = data.token && findMember(lineId);
      if (!member || !member.row[8]) fail('請先完成會員註冊，再確認領獎');
      row[6] = 'PR-' + Utilities.getUuid().toUpperCase();
      row[9] = '待處理';
      sheet.getRange(index + 2, 7, 1, 4).setValues([[row[6], asText(String(member.row[8])), new Date(), row[9]]]);
      SpreadsheetApp.flush();
    }
    return { prize: String(row[5] || ''), claimId: String(row[6] || ''), status: String(row[9] || '') };
  } finally {
    lock.releaseLock();
  }
}

function chooseShipmentPrize(ss) {
  const pool = ss.getSheetByName(SHIPMENT_PRIZE_POOL);
  if (!pool) fail('店家尚未設定抽獎獎項');
  checkHeaders(pool, SHIPMENT_POOL_HEADERS);
  const prizes = pool.getDataRange().getValues().slice(1)
    .map(([name, weight, enabled]) => ({ name: clean(name), weight: Number(weight), enabled }))
    .filter(prize => prize.name && prize.name.length <= 100 && Number.isInteger(prize.weight) &&
      prize.weight > 0 && prize.weight <= 1000000 && (prize.enabled === true || prize.enabled === '是'));
  const total = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  if (!total) fail('店家尚未啟用抽獎獎項');
  let pick = Math.floor(Math.random() * total);
  for (const prize of prizes) {
    pick -= prize.weight;
    if (pick < 0) return prize.name;
  }
}
