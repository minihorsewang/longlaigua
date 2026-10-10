'use strict';

/* =========================================================
   設定：訂單寫入 Google 試算表
   部署 google-apps-script/Code.gs 後，把「網頁應用程式網址」貼在這裡。
   留空 = 示範模式，訂單只存在這台瀏覽器。
   ========================================================= */

const ORDER_API_URL = 'https://script.google.com/macros/s/AKfycbxTGhvRYtE21u79IUoljpcIFvCSotKu40DmX0e-W9wVP6CQqk69MMWXo3AuL2wFN1zilw/exec';

/* =========================================================
   資料區：目前都是範例內容，之後接後端時改成從 API 取得即可
   ※ 商品價格若有更動，Google 試算表的「商品」工作表也要一起改，
     因為訂單金額是由試算表那邊重新計算的。
   ========================================================= */

const ANNOUNCEMENTS = [
  '週年慶刮刮樂開跑！消費滿 500 元送刮刮卡一張',
  '加入會員，線上刮刮卡中獎點數自動入帳',
  '全館滿 NT$1,000 免運費',
];

const EVENTS = [
  { id: 'e1', title: '週年慶刮刮樂', emoji: '🎉', c1: '#d9875a', c2: '#8a4a2b',
    desc: '活動期間消費滿 500 元送刮刮卡一張，頭獎 NT$10,000 現金！', start: '2026-10-01', end: '2026-10-31' },
  { id: 'e2', title: '會員日點數 2 倍送', emoji: '💎', c1: '#3f86c6', c2: '#174a7c',
    desc: '每月 8 號會員日，線上刮刮卡中獎點數加倍。', start: '2026-10-01', end: '2026-12-31' },
  { id: 'e3', title: '雙 11 加碼刮', emoji: '🛒', c1: '#d9434b', c2: '#7f1d24',
    desc: '11/1–11/11 下單即贈加碼刮刮卡，最高再送 1,111 點。', start: '2026-11-01', end: '2026-11-11' },
  { id: 'e4', title: '中秋限定刮刮卡', emoji: '🥮', c1: '#c99a6b', c2: '#6b4a2e',
    desc: '中秋節限定款刮刮卡已圓滿落幕，感謝大家熱情參與！', start: '2026-09-15', end: '2026-10-06' },
];

// 左側「產品選單」的分類
const CATEGORIES = [
  { id: 'cards', name: '刮刮卡', en: 'Scratch Cards', emoji: '🎫',
    desc: '從單張到 10 張組，金卡、鑽石卡、節慶限定款，刮開就有機會中大獎。' },
  { id: 'gifts', name: '禮盒組合', en: 'Gift Sets', emoji: '🎁',
    desc: '精美包裝的刮刮卡禮盒，送禮自用兩相宜，企業團購也適合。' },
  { id: 'goods', name: '周邊小物', en: 'Accessories', emoji: '🪙',
    desc: '開運刮板、收藏卡冊、鑰匙圈，讓刮刮樂更有儀式感。' },
];

const PRODUCTS = [
  { id: 'p1', category: 'cards', name: '幸運刮刮卡（單張）', emoji: '🎫', price: 50, tag: '熱銷', hot: true },
  { id: 'p2', category: 'cards', name: '刮刮卡 10 張組', emoji: '🎟️', price: 450, tag: '9 折', hot: true },
  { id: 'p3', category: 'cards', name: '黃金刮刮卡', emoji: '🥇', price: 200, hot: true },
  { id: 'p4', category: 'cards', name: '鑽石刮刮卡', emoji: '💎', price: 500, tag: '新品', hot: true },
  { id: 'p5', category: 'cards', name: '節慶限定卡', emoji: '🏮', price: 100 },
  { id: 'p6', category: 'gifts', name: '週年慶禮盒', emoji: '🎁', price: 990, tag: '限量', hot: true },
  { id: 'p7', category: 'gifts', name: '新春開運禮盒', emoji: '🧧', price: 1280, hot: true },
  { id: 'p8', category: 'gifts', name: '好友分享組', emoji: '🤝', price: 680 },
  { id: 'p9', category: 'gifts', name: '企業贈禮組', emoji: '🏢', price: 2400 },
  { id: 'p10', category: 'goods', name: '開運刮板', emoji: '🪙', price: 30, hot: true },
  { id: 'p11', category: 'goods', name: '收藏卡冊', emoji: '📒', price: 280, hot: true },
  { id: 'p12', category: 'goods', name: '幸運鑰匙圈', emoji: '🔑', price: 150 },
  { id: 'p13', category: 'goods', name: '帆布托特包', emoji: '👜', price: 450, tag: '新品' },
];

const WINNERS = [
  { name: '王*明', prize: '頭獎 NT$10,000', event: 'e1', date: '2026-10-06' },
  { name: '陳*華', prize: '二獎 NT$1,000', event: 'e1', date: '2026-10-05' },
  { name: '林*君', prize: '500 點', event: 'e2', date: '2026-10-05' },
  { name: '張*豪', prize: '三獎 NT$500', event: 'e1', date: '2026-10-04' },
  { name: '黃*婷', prize: '1,000 點', event: 'e2', date: '2026-10-03' },
  { name: '李*傑', prize: '頭獎 NT$8,888', event: 'e4', date: '2026-10-01' },
  { name: '吳*芳', prize: '月餅禮盒', event: 'e4', date: '2026-09-28' },
  { name: '劉*宏', prize: '二獎 NT$1,000', event: 'e4', date: '2026-09-22' },
  { name: '蔡*玲', prize: '三獎 NT$500', event: 'e4', date: '2026-09-18' },
];

const MINI_APPS = [
  { id: 'scratch', name: '線上刮刮卡', emoji: '🎫', ready: true },
  { id: 'profit', name: '效益試算', emoji: '📊', ready: true, href: '#mini/profit' },
  { id: 'wheel', name: '幸運轉盤', emoji: '🎡' },
  { id: 'checkin', name: '每日簽到', emoji: '📅' },
  { id: 'redeem', name: '序號兌獎', emoji: '🔑' },
];

// 效益試算的預設值（依「刮刮卡娃娃機獲利試算_基礎計算邏輯」測試案例 1）
const PROFIT_DEFAULTS = {
  cards: 80,
  customCards: false,
  spend: '',
  itemCost: '5',
  major: [{ name: 'A 獎', cost: '100', qty: '2' }],
  minor: [{ name: 'B 獎', cost: '5', qty: '20' }],
  fullName: '',
  fullCost: '',
  clearName: '',
  clearCost: '',
  rent: '6000',
  target: '300',
  runs: '30',
};
const CARD_PRESETS = [40, 80, 120, 160, 240];

// 線上刮刮卡獎項：weight 越大越容易抽中
const PRIZES = [
  { label: '銘謝惠顧', weight: 50 },
  { label: '10 點', points: 10, weight: 30 },
  { label: '50 點', points: 50, weight: 14 },
  { label: '200 點', points: 200, weight: 5 },
  { label: '1,000 點', points: 1000, weight: 1 },
];

/* =========================================================
   狀態：示範版存在瀏覽器 localStorage
   ========================================================= */

const STORAGE_PREFIX = 'lucky-scratch:';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state[key]));
  } catch {
    // 無痕模式等情況存不了，就只保留在記憶體中
  }
}

const state = {
  cart: load('cart', []),         // [{ id, qty }]
  orders: load('orders', []),     // [{ id, date, items, total, name, phone, delivery, address, note }]
  lastPickup: load('lastPickup', null), // 上次填的 7-11 取貨資料，下次自動帶入
  profit: load('profit', structuredClone(PROFIT_DEFAULTS)), // 效益試算上次輸入的內容
  members: load('members', {}),               // { 'line:xxx': { provider, name, phone, email, points, prizes, joined } }
  memberSession: load('memberSession', null), // 目前登入的會員 key
  demoUids: load('demoUids', {}),             // 示範模式用的假 LINE / Google 帳號 ID
  pendingSignup: null,                        // 第三方登入成功、但還沒填完註冊資料的人
};

const currentMember = () => state.members[state.memberSession] ?? null;

/* =========================================================
   工具
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const money = (n) => 'NT$' + n.toLocaleString('zh-TW');
const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
const productById = (id) => PRODUCTS.find((p) => p.id === id);
const productsIn = (categoryId) => PRODUCTS.filter((p) => p.category === categoryId);
const categoryById = (id) => CATEGORIES.find((c) => c.id === id);
const maskPhone = (phone) => phone.slice(0, 4) + '***' + phone.slice(-3);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const pageHead = (title, sub) => `<h1 class="page-title">${title}</h1><p class="page-sub">${sub}</p>`;

const sectionTitle = (en, zh) => `<div class="section-title"><em>${en}</em><h2>${zh}</h2></div>`;

const emptyBox = (icon, text, extra = '') => `
  <div class="empty">
    <div class="empty-icon" aria-hidden="true">${icon}</div>
    <p>${text}</p>
    ${extra}
  </div>`;

function eventStatus(ev) {
  const today = todayStr();
  if (today < ev.start) return { key: 'soon', label: '即將開始' };
  if (today > ev.end) return { key: 'ended', label: '已結束' };
  return { key: 'live', label: '進行中' };
}

function statusTag(ev) {
  const s = eventStatus(ev);
  return `<span class="tag tag-${s.key}">${s.label}</span>`;
}

function memberLevel(points) {
  if (points >= 1000) return '金卡會員';
  if (points >= 300) return '銀卡會員';
  return '一般會員';
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* =========================================================
   頁首：跑馬燈公告、左側產品選單
   ========================================================= */

function renderAnnounce() {
  const items = [
    ...ANNOUNCEMENTS.map((text) => `<span>${text}</span>`),
    ...WINNERS.slice(0, 4).map((w) => `<span>🎉 恭喜 ${w.name} 抽中 <b>${w.prize}</b></span>`),
  ].join('');
  $('#announce').innerHTML = `
    <div class="announce-group">${items}</div>
    <div class="announce-group" aria-hidden="true">${items}</div>`;
}

// 選單上方的分類頁籤：「全部商品」+ 各分類
const DRAWER_TABS = [
  { id: 'all', name: '全部商品', en: 'All Items', emoji: '🛍️',
    desc: '本季熱銷精選，一次逛完所有好物。', href: '#products' },
  ...CATEGORIES.map((c) => ({ ...c, href: `#products/${c.id}` })),
];

const QUICK_LINKS = [
  { href: '#events', name: '活動專區', en: 'Events', emoji: '🎉', c1: '#d9434b', c2: '#7f1d24' },
  { href: '#winners', name: '中獎名單', en: 'Winners', emoji: '🏆', c1: '#e0a526', c2: '#8a5a00' },
  { href: '#mini', name: '線上刮刮卡', en: 'Scratch & Win', emoji: '🎫', c1: '#d9875a', c2: '#8a4a2b' },
];

let drawerTab = 'all';

function renderDrawer() {
  $('#drawer-tabs').innerHTML = DRAWER_TABS.map((t) => `
    <button class="drawer-tab ${t.id === drawerTab ? 'active' : ''}" data-action="drawer-tab"
      data-id="${t.id}" aria-pressed="${t.id === drawerTab}">${t.name}</button>`).join('');

  const tab = DRAWER_TABS.find((t) => t.id === drawerTab);
  const list = tab.id === 'all' ? PRODUCTS.filter((p) => p.hot) : productsIn(tab.id);
  const total = tab.id === 'all' ? PRODUCTS.length : list.length;

  $('#drawer-body').innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-intro">
        <span class="big-emoji" aria-hidden="true">${tab.emoji}</span>
        <em>${tab.en}</em>
        <h2>${tab.name}</h2>
        <p>${tab.desc}</p>
        <a class="btn btn-outline" href="${tab.href}">看全部 ${total} 件</a>
      </div>
      <div class="drawer-products">
        ${list.slice(0, 8).map((p) => `
          <a class="mp" href="#products/${p.category}">
            <span class="mp-img" aria-hidden="true">${p.emoji}</span>
            <span>${p.name}</span>
            <span class="price">${money(p.price)}</span>
          </a>`).join('')}
      </div>
    </div>
    <div class="drawer-quick">
      ${QUICK_LINKS.map((q) => `
        <a class="quick-card" href="${q.href}" style="--c1:${q.c1};--c2:${q.c2}">
          <span class="qc-emoji" aria-hidden="true">${q.emoji}</span>
          <em>${q.en}</em>
          <b>${q.name}</b>
        </a>`).join('')}
    </div>`;
}

function setDrawerTab(id) {
  if (id === drawerTab) return;
  drawerTab = id;
  renderDrawer();
}

let drawerOpener = null;

function openDrawer() {
  drawerOpener = document.activeElement;
  document.body.classList.add('drawer-open');
  $('#drawer').inert = false;
  $('.drawer-close').focus();
}

function closeDrawer() {
  if (!document.body.classList.contains('drawer-open')) return;
  document.body.classList.remove('drawer-open');
  $('#drawer').inert = true;
  drawerOpener?.focus();
}

/* =========================================================
   共用卡片
   ========================================================= */

function eventCard(ev) {
  return `
    <article class="card">
      <div class="event-banner" style="--c1:${ev.c1};--c2:${ev.c2}" aria-hidden="true">${ev.emoji}</div>
      <div class="card-body">
        ${statusTag(ev)}
        <h3>${ev.title}</h3>
        <p>${ev.desc}</p>
        <p class="muted small">📅 ${ev.start} ～ ${ev.end}</p>
      </div>
    </article>`;
}

function productCard(p) {
  return `
    <article class="product-card">
      <div class="product-img">
        ${p.tag ? `<span class="tag tag-hot">${p.tag}</span>` : ''}
        <span aria-hidden="true">${p.emoji}</span>
      </div>
      <div class="product-body">
        <span class="product-cat">${categoryById(p.category)?.name ?? ''}</span>
        <h3 class="product-name">${p.name}</h3>
        <div class="price">${money(p.price)}</div>
        <button class="btn btn-light btn-sm" data-action="add-to-cart" data-id="${p.id}">加入購物車</button>
      </div>
    </article>`;
}

function productSection(en, zh, products, moreHref) {
  return `
    <section class="section">
      ${sectionTitle(en, zh)}
      <div class="grid grid-products">${products.map(productCard).join('')}</div>
      <div class="more"><a class="btn btn-outline" href="${moreHref}">看更多</a></div>
    </section>`;
}

/* =========================================================
   首頁
   ========================================================= */

let carouselTimer;

function renderHome() {
  const slides = EVENTS.filter((e) => eventStatus(e).key !== 'ended');
  const slideHtml = slides.map((ev) => `
    <div class="slide" style="--c1:${ev.c1};--c2:${ev.c2}">
      <div class="slide-text">
        ${statusTag(ev)}
        <h2>${ev.title}</h2>
        <p>${ev.desc}</p>
        <div class="actions">
          ${eventStatus(ev).key === 'live' ? '<a class="btn btn-gold" href="#mini">立即線上刮</a>' : ''}
          <a class="btn btn-ghost" href="#events">活動詳情</a>
        </div>
      </div>
      <div class="slide-art" aria-hidden="true">${ev.emoji}</div>
    </div>`).join('');
  const dots = slides.map((_, i) => `
    <button class="dot ${i === 0 ? 'active' : ''}" aria-label="第 ${i + 1} 張"></button>`).join('');

  $('#page-home').innerHTML = `
    <section class="cat-hero" aria-labelledby="cat-hero-title">
      <div class="cat-hero-copy">
        <span class="cat-eyebrow">LUCKY SCRATCH · 貓貓的好運小舖</span>
        <h1 id="cat-hero-title">把可愛帶回家，<br>把<span>好運刮出來。</span></h1>
        <p>一隻招財貓，一份小驚喜。<br>和龍來刮一起，收藏生活裡的大吉大利。</p>
        <div class="actions"><a class="btn btn-primary" href="#products">逛逛好運商品 ↗</a><a class="btn btn-outline" href="#mini">試試手氣</a></div>
        <div class="cat-hero-note">貓貓迎春 <span>✦</span> 蔚藍海洋 <span>✦</span> 每天都有小期待</div>
      </div>
      <div class="cat-hero-art">
        <span class="cat-art-label">GOOD LUCK, GOOD DAY</span>
        <span class="cat-spark cat-spark-one" aria-hidden="true">✦</span>
        <div class="cat-photo cat-photo-hero" role="img" aria-label="照片中的虎斑招財貓，抱著大吉紅牌"></div>
        <span class="cat-spark cat-spark-two" aria-hidden="true">✧</span>
        <div class="cat-blessing">今日好運，貓貓幫你招！</div>
        <span class="cat-edition">貓貓迎春 / LUCKY CAT</span>
      </div>
    </section>
    <div class="cat-perks"><span>✦ 把驚喜送給自己</span><span>滿 NT$1,000 免運</span><span>7-11 取貨付款</span></div>
    <div class="carousel">
      <div class="slides" id="slides">${slideHtml}</div>
      <div class="dots">${dots}</div>
    </div>

    ${productSection('Hot Items', '熱銷商品', PRODUCTS.filter((p) => p.hot).slice(0, 8), '#products')}
    ${CATEGORIES.map((c) => productSection(c.en, c.name, productsIn(c.id).slice(0, 4), `#products/${c.id}`)).join('')}

    <section class="section">
      ${sectionTitle('Events', '熱門活動')}
      <div class="grid grid-3">${slides.slice(0, 3).map(eventCard).join('')}</div>
      <div class="more"><a class="btn btn-outline" href="#events">看更多</a></div>
    </section>`;

  setupCarousel();
}

function setupCarousel() {
  const track = $('#slides');
  const dots = [...document.querySelectorAll('.dot')];
  const current = () => Math.round(track.scrollLeft / track.clientWidth);
  const go = (i) => track.scrollTo({ left: i * track.clientWidth });

  dots.forEach((dot, i) => dot.addEventListener('click', () => go(i)));
  track.addEventListener('scroll', () => {
    const i = current();
    dots.forEach((dot, j) => dot.classList.toggle('active', i === j));
  }, { passive: true });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && dots.length > 1) {
    carouselTimer = setInterval(() => {
      if (!track.matches(':hover')) go((current() + 1) % dots.length);
    }, 5000);
  }
}

/* =========================================================
   活動
   ========================================================= */

const EVENT_FILTERS = [['all', '全部'], ['live', '進行中'], ['soon', '即將開始'], ['ended', '已結束']];
let eventFilter = 'all';

function renderEvents() {
  const list = EVENTS.filter((e) => eventFilter === 'all' || eventStatus(e).key === eventFilter);
  const chips = EVENT_FILTERS.map(([value, label]) => `
    <button class="chip ${value === eventFilter ? 'active' : ''}" data-action="event-filter"
      data-value="${value}" aria-pressed="${value === eventFilter}">${label}</button>`).join('');

  $('#page-events').innerHTML = `
    ${pageHead('活動', '最新優惠與刮刮卡活動，一次看清楚')}
    <div class="chips">${chips}</div>
    ${list.length
      ? `<div class="grid grid-3">${list.map(eventCard).join('')}</div>`
      : emptyBox('📭', '目前沒有符合的活動')}`;
}

/* =========================================================
   商品（左側分類 + 搜尋）
   ========================================================= */

function renderProducts(categoryId, params) {
  const query = (params.get('q') ?? '').trim();
  const category = categoryById(categoryId);
  let list = category ? productsIn(category.id) : PRODUCTS;
  if (query) list = list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  const activeId = query ? null : (category?.id ?? 'all');
  const links = [
    { id: 'all', name: '全部商品', href: '#products', count: PRODUCTS.length },
    ...CATEGORIES.map((c) => ({ id: c.id, name: c.name, href: `#products/${c.id}`, count: productsIn(c.id).length })),
  ];
  const title = query ? `搜尋「${escapeHtml(query)}」` : (category?.name ?? '全部商品');

  $('#page-products').innerHTML = `
    <div class="shop-layout">
      <aside class="shop-side" aria-label="產品分類">
        <h2>產品選單</h2>
        <em>Products</em>
        ${links.map((l) => `
          <a class="side-link ${l.id === activeId ? 'active' : ''}" href="${l.href}">${l.name}<small>${l.count}</small></a>`).join('')}
      </aside>

      <div class="shop-main">
        <form class="search search-inline" role="search">
          <input type="search" name="q" placeholder="搜尋商品" aria-label="搜尋商品" value="${escapeHtml(query)}">
          <button type="submit" aria-label="搜尋">
            <svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          </button>
        </form>
        <nav class="shop-chips" aria-label="產品分類">
          ${links.map((l) => `<a class="chip ${l.id === activeId ? 'active' : ''}" href="${l.href}">${l.name}</a>`).join('')}
        </nav>
        <div class="shop-head">
          <h1>${title}</h1>
          <span class="muted small">共 ${list.length} 件商品</span>
        </div>
        ${list.length
          ? `<div class="grid grid-products">${list.map(productCard).join('')}</div>`
          : emptyBox('🔍', '找不到符合的商品', '<a class="btn btn-light" href="#products">看全部商品</a>')}
      </div>
    </div>`;
}

function search(form) {
  const q = form.elements.q.value.trim();
  const target = q ? `#products?q=${encodeURIComponent(q)}` : '#products';
  if (location.hash === target) route();
  else location.hash = target;
}

/* =========================================================
   中獎
   ========================================================= */

let winnerFilter = 'all';

function renderWinners() {
  const list = WINNERS.filter((w) => winnerFilter === 'all' || w.event === winnerFilter);
  const options = EVENTS.map((e) => `
    <option value="${e.id}" ${e.id === winnerFilter ? 'selected' : ''}>${e.title}</option>`).join('');

  $('#page-winners').innerHTML = `
    ${pageHead('中獎名單', '恭喜以下得獎者！獎項將於活動結束後 7 個工作天內寄出')}
    <div class="toolbar">
      <label class="sr-only" for="winner-filter">選擇活動</label>
      <select id="winner-filter" class="select">
        <option value="all">全部活動</option>
        ${options}
      </select>
      <span class="muted small">共 ${list.length} 位得獎者</span>
    </div>
    ${list.length
      ? `<ul class="winner-list">${list.map(winnerRow).join('')}</ul>`
      : emptyBox('🏆', '此活動尚未公布中獎名單')}`;
}

function winnerRow(w) {
  const ev = EVENTS.find((e) => e.id === w.event);
  return `
    <li>
      <span class="avatar" aria-hidden="true">${w.name[0]}</span>
      <div class="winner-main"><strong>${w.name}</strong><span class="prize-text">${w.prize}</span></div>
      <div class="winner-meta">${ev ? ev.title : ''}<br>${w.date}</div>
    </li>`;
}

/* =========================================================
   小程式（含線上刮刮卡）
   ========================================================= */

function renderMini(sub) {
  if (sub === 'profit') {
    renderProfit();
    return;
  }
  const tiles = MINI_APPS.map((app) => `
    <button class="mini-tile ${app.ready ? '' : 'soon'}" data-action="open-mini" data-id="${app.id}">
      <span class="mini-icon" aria-hidden="true">${app.emoji}</span>
      ${app.name}
      ${app.ready ? '' : '<small>即將推出</small>'}
    </button>`).join('');

  $('#page-mini').innerHTML = `
    ${pageHead('小程式', '好玩又有獎的小工具，天天來玩拿點數')}
    <div class="mini-grid">${tiles}</div>

    <section class="panel scratch-panel" id="scratch-panel">
      <h2>🎫 線上刮刮卡</h2>
      <p class="muted">用手指或滑鼠刮開黑色塗層，看看今天的手氣！</p>
      <div class="scratch-card">
        <div class="scratch-result" id="scratch-result"></div>
        <canvas id="scratch-canvas" aria-label="刮刮卡塗層，按住拖曳即可刮開"></canvas>
      </div>
      <p class="scratch-msg" id="scratch-msg" aria-live="polite"></p>
      <button class="btn btn-light" data-action="scratch-again">再刮一張</button>
    </section>`;

  scratch.start($('#scratch-canvas'));
}

function openMini(id) {
  const app = MINI_APPS.find((a) => a.id === id);
  if (app.href) {
    location.hash = app.href;
  } else if (app.ready) {
    $('#scratch-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    toast(`「${app.name}」即將推出，敬請期待！`);
  }
}

/* ---------- 效益試算（給台主用的檯面獲利試算）----------
   公式依「刮刮卡娃娃機獲利試算_基礎計算邏輯」v1.0：
   期望停止刮數 = 獎數 ×（總刮數 + 1）÷（獎數 + 1），即隨機排列中最後一個獎平均落在第幾刮 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const prizeQty = (list) => list.reduce((sum, p) => sum + num(p.qty), 0);
const prizeTotal = (list) => list.reduce((sum, p) => sum + num(p.cost) * num(p.qty), 0);
const cardsFmt = (n) => `${n.toFixed(1)} 刮`;
const pctFmt = (n) => `${(n * 100).toFixed(1)}%`;
const signedMoney = (n) => (n < 0 ? '−' : '') + money(Math.round(Math.abs(n)));

function calcProfit(p) {
  const total = num(p.cards);
  const itemCost = num(p.itemCost);
  const stopAt = (count) => (count > 0 && total > 0 ? (count * (total + 1)) / (count + 1) : total);

  const majorCount = prizeQty(p.major);
  const allCount = majorCount + prizeQty(p.minor);
  const majorCost = prizeTotal(p.major);
  const allCost = majorCost + prizeTotal(p.minor);
  const clearCost = num(p.clearCost);
  const fullCost = num(p.fullCost);
  const target = num(p.target);

  const majorStop = stopAt(majorCount);
  const suggested = majorStop > 0 ? Math.ceil((target + majorCost + majorStop * itemCost) / majorStop) : 0;
  const userSpend = num(p.spend);
  const spend = userSpend > 0 ? userSpend : suggested;

  const mode = (stop, prizeCost) => {
    const revenue = stop * spend;
    const goods = stop * itemCost;
    const profit = revenue - prizeCost - goods;
    return { stop, revenue, prizeCost, goods, profit, margin: revenue > 0 ? profit / revenue : 0 };
  };
  const major = mode(majorStop, majorCost);
  // 清獎賞：所有大獎＋小獎都出完才送，所以算在全獎模式
  const all = mode(stopAt(allCount), allCost + clearCost);
  // 完刮：整版刮完，全部獎項、清獎賞、完刮獎都會送出
  const full = fullCost > 0 ? mode(total, allCost + clearCost + fullCost) : null;

  const runs = num(p.runs);
  const rent = num(p.rent);
  const monthlyGross = major.profit * runs;
  return {
    total, majorCount, allCount, target, suggested, spend, userSpend, major, all, full, runs, rent,
    monthlyRevenue: major.revenue * runs,
    monthlyGross,
    monthlyNet: monthlyGross - rent,
    breakEven: runs > 0 ? rent / runs : 0,
  };
}

function renderProfit() {
  const p = state.profit;
  const presetChips = CARD_PRESETS.map((n) => `
    <button type="button" class="chip ${!p.customCards && num(p.cards) === n ? 'active' : ''}"
      data-action="profit-cards" data-value="${n}">${n} 刮</button>`).join('');
  const field = (name, label, value, { unit = '$', placeholder = '' } = {}) => `
    <label class="field">${label}
      <span class="unit-input">${unit === '$' ? '<span>$</span>' : ''}
        <input name="${name}" type="number" min="0" inputmode="decimal" value="${escapeHtml(value)}" placeholder="${placeholder}">
        ${unit !== '$' && unit ? `<span>${unit}</span>` : ''}
      </span>
    </label>`;

  $('#page-mini').innerHTML = `
    <a class="back-link" href="#mini">← 回小程式</a>
    ${pageHead('📊 效益試算', '輸入版型、獎項與成本，用期望值算出建議均出與每月獲利')}
    <div class="profit-layout">
      <form id="profit-form" class="profit-inputs" autocomplete="off">
        <section class="panel">
          <h2><span class="step-no">01</span>版型與成本</h2>
          <div class="chips">${presetChips}
            <button type="button" class="chip ${p.customCards ? 'active' : ''}" data-action="profit-cards" data-value="custom">自訂</button>
          </div>
          ${p.customCards ? field('cards', '自訂總刮數', p.cards, { unit: '刮' }) : ''}
          <div class="field-row-2">
            ${field('spend', '均出（選填）', p.spend, { placeholder: '空白則反推' })}
            ${field('itemCost', '每刮商品成本', p.itemCost)}
          </div>
          <p class="hint">均出 = 總營業額 ÷ 實際出貨刮數；每刮商品成本 = 台內商品平均成本</p>
        </section>

        <section class="panel prize-panel gold">
          <h2><span class="step-no">02</span>🏆 大獎設定 <small>出完即廢套</small></h2>
          <div id="prize-major">${prizeRows('major')}</div>
        </section>

        <section class="panel prize-panel blue">
          <h2><span class="step-no">03</span>🎁 小獎設定 <small>不影響廢套</small></h2>
          <div id="prize-minor">${prizeRows('minor')}</div>
        </section>

        <section class="panel">
          <h2><span class="step-no">04</span>✨ 特殊獎項 <small>空白不計算</small></h2>
          <div class="field-row-2">
            <label class="field">完刮獎名稱<input name="fullName" maxlength="20" value="${escapeHtml(p.fullName)}" placeholder="例：神秘大獎"></label>
            ${field('fullCost', '完刮獎成本', p.fullCost, { placeholder: '例：500' })}
          </div>
          <p class="hint">完刮獎：整版全部刮完才送出，吸引客人刮完最後幾格</p>
          <div class="field-row-2">
            <label class="field">清獎賞名稱<input name="clearName" maxlength="20" value="${escapeHtml(p.clearName)}" placeholder="例：清版大禮"></label>
            ${field('clearCost', '清獎賞成本', p.clearCost, { placeholder: '例：300' })}
          </div>
          <p class="hint">清獎賞：大獎＋小獎全部出完後額外贈送，吸引客人拚完小獎</p>
        </section>

        <section class="panel">
          <h2><span class="step-no">05</span>🎯 目標設定</h2>
          ${field('rent', '每月台租', p.rent)}
          ${field('target', '每版目標獲利（用來反推建議均出）', p.target)}
          ${field('runs', '預計每月跑幾版', p.runs, { unit: '版' })}
          <button type="button" class="btn btn-light btn-sm" data-action="profit-reset">恢復範例數值</button>
        </section>
      </form>

      <div class="profit-results" id="profit-results" aria-live="polite"></div>
    </div>

    <section class="panel rng-panel">
      <h2>🎲 隨機號碼產生器</h2>
      <p class="muted small">輸入總刮數與獎號數量，一鍵產生不重複的中獎號碼，排版時用來決定獎項位置。</p>
      <div class="field-row-2">
        <label class="field">總刮數<input id="rng-total" type="number" min="1" max="1000" inputmode="numeric" value="${num(p.cards) || 80}"></label>
        <label class="field">獎號數量<input id="rng-count" type="number" min="1" inputmode="numeric" value="${prizeQty(p.major) || 2}"></label>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-action="rng">產生號碼</button>
      <div class="rng-result" id="rng-result"></div>
    </section>`;

  renderProfitResults();
}

function prizeRows(kind) {
  const list = state.profit[kind];
  const label = kind === 'major' ? '大獎' : '小獎';
  return `
    ${list.map((prize, i) => `
      <div class="prize-row">
        <span class="row-no">#${i + 1}</span>
        <input aria-label="${label}名稱" maxlength="20" placeholder="${label}名稱" value="${escapeHtml(prize.name)}"
          data-kind="${kind}" data-index="${i}" data-field="name">
        <span class="unit-input"><span>$</span><input aria-label="${label}單價" type="number" min="0" inputmode="decimal"
          value="${escapeHtml(prize.cost)}" data-kind="${kind}" data-index="${i}" data-field="cost"></span>
        <span class="unit-input"><input aria-label="${label}數量" type="number" min="0" inputmode="numeric"
          value="${escapeHtml(prize.qty)}" data-kind="${kind}" data-index="${i}" data-field="qty"><span>個</span></span>
        <button type="button" class="icon-btn" data-action="profit-remove" data-kind="${kind}" data-index="${i}"
          aria-label="刪除${escapeHtml(prize.name || label)}">✕</button>
      </div>`).join('')}
    <div class="prize-foot">
      <button type="button" class="btn btn-light btn-sm" data-action="profit-add" data-kind="${kind}">＋ 新增${label}</button>
      <span class="muted small">共 ${prizeQty(list)} 個 · 成本 ${money(Math.round(prizeTotal(list)))}</span>
    </div>`;
}

function renderProfitResults() {
  const p = state.profit;
  const r = calcProfit(p);
  const reached = r.major.profit >= r.target;

  let heroText;
  if (!r.userSpend) {
    heroText = `<b>要達到每版獲利 ${money(r.target)}（大獎即停模式）</b><p>建議均出設定為 <b>${money(r.suggested)}</b></p>`;
  } else if (reached) {
    heroText = `<b>✅ 目前均出 ${money(r.userSpend)} 已達每版目標獲利 ${money(r.target)}</b>
      <p>預估每版毛利 ${signedMoney(r.major.profit)}，超出 ${money(Math.round(r.major.profit - r.target))}</p>`;
  } else {
    heroText = `<b>⚠️ 目前均出 ${money(r.userSpend)} 尚未達到每版目標獲利 ${money(r.target)}</b>
      <p>均出需從 ${money(r.userSpend)} 調高至 <b>${money(r.suggested)}</b>（差 ${money(Math.max(0, r.suggested - r.userSpend))}）</p>`;
  }

  const modeCard = (title, tone, m, extraLabel) => `
    <article class="mode-card ${tone}">
      <h3>${title}</h3>
      <div class="sum-row"><span>期望停止刮數</span><span>${cardsFmt(m.stop)}</span></div>
      <div class="sum-row"><span>期望營業額</span><span>${money(Math.round(m.revenue))}</span></div>
      <div class="sum-row"><span>${extraLabel}</span><span>${money(Math.round(m.prizeCost))}</span></div>
      <div class="sum-row"><span>商品成本</span><span>${money(Math.round(m.goods))}</span></div>
      <div class="sum-row"><span>毛利率</span><span class="${m.margin < 0.2 ? 'neg' : 'pos'}">${pctFmt(m.margin)}</span></div>
      <div class="sum-row total"><span>整版毛利</span><span class="${m.profit < 0 ? 'neg' : 'pos'}">${signedMoney(m.profit)}</span></div>
    </article>`;

  const rangeOf = (qty) => {
    const q = num(qty);
    if (!q || !r.total) return '—';
    const step = (r.total + 1) / (q + 1);
    return q === 1 ? `約第 ${step.toFixed(1)} 刮` : `${step.toFixed(1)}～${(q * step).toFixed(1)} 刮`;
  };
  const prizeTable = [
    ...p.major.map((x) => ({ ...x, type: '大獎', tone: 'gold' })),
    ...p.minor.map((x) => ({ ...x, type: '小獎', tone: 'blue' })),
  ].map((x) => `
    <tr>
      <td><i class="dot ${x.tone}"></i>${escapeHtml(x.name || '未命名')}<small> ${x.type}</small></td>
      <td>${money(num(x.cost))}</td><td>${num(x.qty)}</td>
      <td>${money(Math.round(num(x.cost) * num(x.qty)))}</td><td>${rangeOf(x.qty)}</td>
    </tr>`).join('');

  const advice = [];
  advice.push([r.major.margin >= 0.2, `大獎即停毛利率 ${pctFmt(r.major.margin)}，${r.major.margin >= 0.2 ? '配置良好。' : '偏低，建議檢查獎品成本或均出設定。'}`]);
  advice.push([r.all.profit >= r.major.profit, `全獎出完模式每版毛利 ${signedMoney(r.all.profit)}，比大獎即停${r.all.profit >= r.major.profit ? '多' : '少'} ${money(Math.round(Math.abs(r.all.profit - r.major.profit)))}。`]);
  advice.push([r.major.profit >= r.breakEven, `每版過租門檻：至少需獲利 ${money(Math.round(r.breakEven))}（台租 ${money(r.rent)} ÷ ${r.runs} 版），目前每版毛利 ${signedMoney(r.major.profit)}。`]);
  advice.push([r.monthlyNet >= 0, r.monthlyNet >= 0
    ? `月預估淨利 ${signedMoney(r.monthlyNet)}（${r.runs} 版 × ${signedMoney(r.major.profit)} − 台租 ${money(r.rent)}）。`
    : `扣除台租後月淨利 ${signedMoney(r.monthlyNet)}，建議增加版數、提高均出或降低成本。`]);
  if (r.allCount > r.total) advice.push([false, `獎項總數 ${r.allCount} 個超過總刮數 ${r.total} 刮，請調整配置。`]);
  if (!r.majorCount) advice.push([false, '尚未設定大獎，大獎即停模式以整版刮完計算。']);

  $('#profit-results').innerHTML = `
    <div class="profit-hero">
      <div class="hero-num"><small>建議均出</small><strong>${money(r.suggested)}</strong><small>每刮定價</small></div>
      <div class="hero-text">${heroText}</div>
    </div>

    <h2 class="results-title">模式比較 <small>依目前輸入即時計算${r.userSpend ? '' : '，以建議均出試算'}</small></h2>
    <div class="mode-grid">
      ${modeCard('🏆 大獎出完即廢套', 'gold', r.major, '大獎成本')}
      ${modeCard('☀️ 全獎出完', 'blue', r.all, `大獎＋小獎${num(p.clearCost) ? '＋清獎賞' : ''}成本`)}
      ${r.full
        ? modeCard(`🎯 完刮${p.fullName ? `（${escapeHtml(p.fullName)}）` : ''}`, 'purple', r.full, '全部獎項＋完刮獎成本')
        : '<article class="mode-card empty">✨<br>填入完刮獎成本<br>即可啟用完刮分析</article>'}
    </div>

    <section class="panel">
      <h2>禮品配置明細</h2>
      <div class="table-wrap">
        <table class="prize-table">
          <thead><tr><th>禮品</th><th>成本</th><th>數量</th><th>小計</th><th>預期出現區間</th></tr></thead>
          <tbody>${prizeTable || '<tr><td colspan="5" class="muted">尚未設定獎項</td></tr>'}</tbody>
        </table>
      </div>
      <p class="note">預期出現區間：隨機排版時，該獎第一個～最後一個平均落在第幾刮。</p>
    </section>

    <section class="panel">
      <h2>月營收試算 <small>大獎即停模式</small></h2>
      <div class="sum-row"><span>每版期望營業額</span><span>${money(Math.round(r.major.revenue))}</span></div>
      <div class="sum-row"><span>每版毛利</span><span>${signedMoney(r.major.profit)}</span></div>
      <div class="sum-row"><span>× 每月版數</span><span>${r.runs} 版</span></div>
      <div class="sum-row"><span>月營業額</span><span>${money(Math.round(r.monthlyRevenue))}</span></div>
      <div class="sum-row"><span>月毛利</span><span>${signedMoney(r.monthlyGross)}</span></div>
      <div class="sum-row"><span>− 月台租</span><span>${money(r.rent)}</span></div>
      <div class="sum-row total"><span>月淨利</span><span class="${r.monthlyNet < 0 ? 'neg' : 'pos'}">${signedMoney(r.monthlyNet)}</span></div>
    </section>

    <section class="panel">
      <h2>診斷建議</h2>
      <ul class="advice">${advice.map(([good, text]) => `<li class="${good ? 'good' : 'warn'}">${text}</li>`).join('')}</ul>
    </section>

    <p class="note">⚠️ 以上為機率期望值試算，實際大獎出現位置與營收可能不同，請作為配置參考，不是獲利保證。</p>`;
}

function updateProfitField(input) {
  const p = state.profit;
  if (input.dataset.kind) {
    p[input.dataset.kind][Number(input.dataset.index)][input.dataset.field] = input.value;
    // 更新該區的小計，不重畫輸入框（避免游標跳掉）
    const foot = input.closest('.prize-panel').querySelector('.prize-foot .small');
    const list = p[input.dataset.kind];
    foot.textContent = `共 ${prizeQty(list)} 個 · 成本 ${money(Math.round(prizeTotal(list)))}`;
  } else if (input.name in p) {
    p[input.name] = input.value;
  } else {
    return;
  }
  save('profit');
  renderProfitResults();
}

function setProfitCards(value) {
  const p = state.profit;
  if (value === 'custom') {
    p.customCards = true;
  } else {
    p.customCards = false;
    p.cards = Number(value);
  }
  save('profit');
  renderProfit();
}

function changePrizeList(kind, index) {
  const list = state.profit[kind];
  if (index === undefined) list.push({ name: '', cost: '', qty: '1' });
  else list.splice(Number(index), 1);
  save('profit');
  $(`#prize-${kind}`).innerHTML = prizeRows(kind);
  renderProfitResults();
}

function resetProfit() {
  state.profit = structuredClone(PROFIT_DEFAULTS);
  save('profit');
  renderProfit();
  toast('已恢復範例數值');
}

function generateNumbers() {
  const total = Math.floor(num($('#rng-total').value));
  const count = Math.floor(num($('#rng-count').value));
  const out = $('#rng-result');
  if (total < 1 || total > 1000) {
    out.innerHTML = '<p class="form-error">總刮數請輸入 1～1000</p>';
    return;
  }
  if (count < 1 || count > total) {
    out.innerHTML = `<p class="form-error">獎號數量請輸入 1～${total}</p>`;
    return;
  }
  // Fisher–Yates：只洗前 count 個，取得不重複號碼
  const pool = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (total - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, count).sort((a, b) => a - b);
  out.innerHTML = `
    <p class="muted small">從 1～${total} 中抽出 ${count} 個號碼：</p>
    <div class="rng-numbers">${picked.map((n) => `<span>${n}</span>`).join('')}</div>`;
}

function drawPrize() {
  const total = PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  return PRIZES.find((p) => (r -= p.weight) < 0) ?? PRIZES[0];
}

const scratch = {
  BRUSH: 34,
  REVEAL_RATIO: 0.5,

  start(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.drawing = false;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.done) return;
      this.drawing = true;
      canvas.setPointerCapture(e.pointerId);
      this.last = this.point(e);
      this.ctx.beginPath();
      this.ctx.arc(this.last.x, this.last.y, this.BRUSH / 2, 0, Math.PI * 2);
      this.ctx.fill();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      const p = this.point(e);
      this.ctx.beginPath();
      this.ctx.moveTo(this.last.x, this.last.y);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this.last = p;
    });
    const end = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.checkProgress();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    this.reset();
  },

  // 把滑鼠位置換算成畫布座標（視窗縮放後依然準確）
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.w / r.width),
      y: (e.clientY - r.top) * (this.h / r.height),
    };
  },

  reset() {
    const { canvas, ctx } = this;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = width;
    this.h = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 黑色刮層（跟實體刮刮卡一樣）
    ctx.globalCompositeOperation = 'source-over';
    const coating = ctx.createLinearGradient(0, 0, width, height);
    coating.addColorStop(0, '#2b2b2b');
    coating.addColorStop(0.5, '#3d3d3d');
    coating.addColorStop(1, '#151515');
    ctx.fillStyle = coating;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#f2b630';
    ctx.font = 'bold 22px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ 刮開這裡 ✦', width / 2, height / 2);

    // 之後的筆畫改成「擦掉」
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.BRUSH;

    this.prize = drawPrize();
    this.done = false;
    canvas.classList.remove('cleared');

    const result = $('#scratch-result');
    result.classList.toggle('win', Boolean(this.prize.points));
    result.innerHTML = this.prize.points
      ? `<small>恭喜獲得</small>${this.prize.label}`
      : `${this.prize.label}<small>下次會更好</small>`;
    $('#scratch-msg').textContent = '';
  },

  checkProgress() {
    const { data } = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    let cleared = 0;
    let sampled = 0;
    for (let i = 3; i < data.length; i += 32) { // 每 8 個像素抽樣一次 alpha
      sampled++;
      if (data[i] === 0) cleared++;
    }
    if (cleared / sampled >= this.REVEAL_RATIO) this.reveal();
  },

  reveal() {
    this.done = true;
    this.canvas.classList.add('cleared');
    const msg = $('#scratch-msg');
    const { points, label } = this.prize;

    if (!points) {
      msg.textContent = '沒中也別灰心，再刮一張試試！';
      return;
    }
    const member = currentMember();
    if (member) {
      member.points += points;
      member.prizes.unshift({ label, date: todayStr() });
      save('members');
      msg.textContent = `🎉 恭喜！${label}已存入會員帳戶`;
    } else {
      msg.innerHTML = `🎉 恭喜中獎！<a href="#member">登入會員</a>才能領取點數喔`;
    }
  },
};

/* =========================================================
   購物車（右側滑出）與結帳
   ========================================================= */

const SHIPPING_FEE = 80;
const FREE_SHIPPING_THRESHOLD = 1000;

function cartLines() {
  return state.cart
    .map(({ id, qty }) => ({ product: productById(id), qty }))
    .filter((line) => line.product);
}

function cartSummary(lines = cartLines()) {
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateCartBadge() {
  const count = state.cart.reduce((n, item) => n + item.qty, 0);
  const badge = $('#cart-count');
  badge.textContent = count > 99 ? '99+' : count;
  badge.hidden = count === 0;
}

function addToCart(id) {
  const item = state.cart.find((i) => i.id === id);
  if (item) item.qty += 1;
  else state.cart.push({ id, qty: 1 });
  save('cart');
  updateCartBadge();
  openCart(id);
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  cartChanged();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((i) => i.id !== id);
  cartChanged();
}

function cartChanged() {
  save('cart');
  updateCartBadge();
  renderCartDrawer();
  if (!$('#page-order').hidden) renderCheckoutSummary();
  if (!$('#page-pickup').hidden) renderPickupSummary();
}

function summaryRows({ subtotal, shipping, total }) {
  return `
    <div class="sum-row"><span>商品小計</span><span>${money(subtotal)}</span></div>
    <div class="sum-row"><span>運費</span><span>${shipping ? money(shipping) : '免運'}</span></div>
    <div class="sum-row total"><span>合計</span><span class="price">${money(total)}</span></div>`;
}

function renderCartDrawer(highlightId) {
  const lines = cartLines();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  $('#cart-head-count').textContent = count ? `（${count} 件）` : '';

  if (!lines.length) {
    $('#cart-body').innerHTML = emptyBox('🛒', '購物車還是空的',
      '<button class="btn btn-primary" data-action="close-cart">去逛逛商品</button>');
    $('#cart-foot').hidden = true;
    return;
  }

  $('#cart-body').innerHTML = lines.map(({ product: p, qty }) => `
    <div class="cart-item ${p.id === highlightId ? 'just-added' : ''}">
      <span class="cart-thumb" aria-hidden="true">${p.emoji}</span>
      <div class="cart-info">
        <div class="cart-name">${p.name}</div>
        <div class="price small">${money(p.price * qty)}</div>
        <button class="remove-btn" data-action="remove-from-cart" data-id="${p.id}">刪除</button>
      </div>
      <div class="qty">
        <button type="button" data-action="qty" data-id="${p.id}" data-delta="-1" aria-label="減少 ${p.name}">−</button>
        <span>${qty}</span>
        <button type="button" data-action="qty" data-id="${p.id}" data-delta="1" aria-label="增加 ${p.name}">＋</button>
      </div>
    </div>`).join('');

  const summary = cartSummary(lines);
  const gap = FREE_SHIPPING_THRESHOLD - summary.subtotal;
  const progress = Math.min(100, (summary.subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  $('#cart-foot').hidden = false;
  $('#cart-foot').innerHTML = `
    <div class="ship-progress">
      ${gap > 0 ? `再買 <b>${money(gap)}</b> 即可免運` : '🎉 已達免運門檻'}
      <div class="ship-bar"><span style="width:${progress}%"></span></div>
    </div>
    ${summaryRows(summary)}
    <div class="cart-actions">
      <a class="btn btn-primary btn-block" href="#order">前往結帳</a>
      <button class="btn btn-light btn-block" data-action="close-cart">繼續購物</button>
    </div>`;
}

let cartOpener = null;

function openCart(highlightId) {
  renderCartDrawer(highlightId);
  if (document.body.classList.contains('cart-open')) return;
  cartOpener = document.activeElement;
  document.body.classList.add('cart-open');
  $('#cart-drawer').inert = false;
  $('#cart-drawer .icon-btn').focus();
}

function closeCart() {
  if (!document.body.classList.contains('cart-open')) return;
  document.body.classList.remove('cart-open');
  $('#cart-drawer').inert = true;
  cartOpener?.focus();
}

function renderOrder() {
  const el = $('#page-order');
  if (!cartLines().length) {
    el.innerHTML = `
      ${pageHead('結帳', '確認購物車內容並填寫收件資料')}
      ${emptyBox('🛒', '購物車還是空的', '<a class="btn btn-primary" href="#products">去逛逛商品</a>')}`;
    return;
  }

  el.innerHTML = `
    ${pageHead('結帳', '確認購物車內容，下一步填寫 7-11 取貨資料')}
    ${checkoutSteps(1)}
    <div class="order-layout">
      <section class="panel" id="checkout-summary"></section>
      <section class="panel">
        <h2>取貨與付款方式</h2>
        <div class="pay-method">
          <span class="pay-icon" aria-hidden="true">🏪</span>
          <div>
            <b>7-11 取貨付款</b>
            <p class="muted small">包裹寄到你指定的 7-11 門市，到店取貨時再付款，不用先付錢。</p>
          </div>
        </div>
        <a class="btn btn-primary btn-block" id="order-submit" href="#pickup"></a>
      </section>
    </div>`;
  renderCheckoutSummary();
}

function checkoutSteps(current) {
  const steps = ['確認訂單', '取貨資料', '完成'];
  return `
    <ol class="steps">
      ${steps.map((s, i) => `
        <li class="${i + 1 === current ? 'current' : ''} ${i + 1 < current ? 'done' : ''}"
          ${i + 1 === current ? 'aria-current="step"' : ''}><span>${i + 1}</span>${s}</li>`).join('')}
    </ol>`;
}

// 只重畫訂單明細，避免使用者已填的表單被清掉
function renderCheckoutSummary() {
  const lines = cartLines();
  if (!lines.length) {
    renderOrder();
    return;
  }
  const summary = cartSummary(lines);
  const rows = lines.map(({ product: p, qty }) => `
    <div class="cart-item">
      <span class="cart-thumb" aria-hidden="true">${p.emoji}</span>
      <div class="cart-info">
        <div class="cart-name">${p.name}</div>
        <div class="muted small">${money(p.price)} × ${qty}</div>
      </div>
      <span class="price">${money(p.price * qty)}</span>
    </div>`).join('');

  $('#checkout-summary').innerHTML = `
    <div class="summary-head">
      <h2>訂單明細</h2>
      <button class="btn btn-light btn-sm" data-action="open-cart">修改購物車</button>
    </div>
    ${rows}
    <div class="summary-total">${summaryRows(summary)}</div>`;
  $('#order-submit').textContent = `確認下單 · ${money(summary.total)}`;
}

/* ---------- 填寫 7-11 取貨資料（欄位規則參考快速建單） ----------
   之後串綠界電子地圖時，「店號／門市名稱」兩欄改由地圖帶入即可 */

const SEVEN_STORE_SEARCH_URL = 'https://emap.pcsc.com.tw/';

function renderPickup() {
  const el = $('#page-pickup');
  if (!cartLines().length) {
    el.innerHTML = `
      ${pageHead('填寫取貨資料', '購物車是空的，先挑選商品吧')}
      ${emptyBox('🛒', '購物車還是空的', '<a class="btn btn-primary" href="#products">去逛逛商品</a>')}`;
    return;
  }

  // 優先帶入上次填的取貨資料，其次是會員資料
  const member = currentMember();
  const last = state.lastPickup ?? {};
  const value = (key, fallback = '') => escapeHtml(last[key] ?? fallback);

  el.innerHTML = `
    ${pageHead('填寫 7-11 取貨資料', '包裹會寄到你指定的 7-11 門市，取貨時付款')}
    ${checkoutSteps(2)}
    <div class="order-layout">
      <section class="panel">
        <h2>收件人與門市</h2>
        <form id="pickup-form" class="form">
          <label class="field">收件人姓名
            <input name="name" required minlength="2" maxlength="10" autocomplete="name"
              value="${value('name', member?.name)}">
            <small class="hint">2～10 個字，取貨時要出示證件，請填證件上的姓名</small>
          </label>
          <label class="field">收件人手機
            <input name="phone" type="tel" required pattern="09\\d{8}" maxlength="10" placeholder="0912345678"
              title="請輸入 09 開頭的 10 碼手機號碼" autocomplete="tel" value="${value('phone', member?.phone)}">
            <small class="hint">包裹到店時會傳簡訊到這支手機</small>
          </label>
          <div class="field-row">
            <label class="field">7-11 門市店號
              <input name="storeCode" required pattern="\\d{6}" maxlength="6" inputmode="numeric"
                placeholder="6 碼數字" title="請輸入 6 碼數字的門市店號" value="${value('storeCode')}">
            </label>
            <label class="field">門市名稱
              <input name="storeName" required maxlength="20" placeholder="例如：○○門市"
                value="${value('storeName')}">
            </label>
          </div>
          <a class="store-search" href="${SEVEN_STORE_SEARCH_URL}" target="_blank" rel="noopener">
            🗺️ 不知道店號？到 7-11 官方門市查詢 ↗
          </a>
          <label class="field">備註
            <textarea name="note" rows="2" maxlength="60" placeholder="選填，60 字以內"></textarea>
          </label>
          <p class="form-error" id="pickup-error" role="alert" hidden></p>
          <button class="btn btn-primary btn-block" id="pickup-submit" type="submit"></button>
          <a class="btn btn-light btn-block" href="#order">回上一步</a>
        </form>
      </section>
      <section class="panel" id="pickup-summary"></section>
    </div>`;
  renderPickupSummary();
}

// 只重畫右側金額，避免使用者已填的表單被清掉
function renderPickupSummary() {
  const lines = cartLines();
  if (!lines.length) {
    renderPickup();
    return;
  }
  const summary = cartSummary(lines);
  $('#pickup-summary').innerHTML = `
    <div class="summary-head">
      <h2>訂單金額</h2>
      <button class="btn btn-light btn-sm" data-action="open-cart">修改購物車</button>
    </div>
    <ul class="list">
      ${lines.map(({ product: p, qty }) => `
        <li><span>${p.name} × ${qty}</span><span>${money(p.price * qty)}</span></li>`).join('')}
    </ul>
    <div class="summary-total">${summaryRows(summary)}</div>
    <p class="note">付款方式：7-11 取貨付款（到店取貨時付 ${money(summary.total)}）</p>`;
  $('#pickup-submit').textContent = `送出訂單 · ${money(summary.total)}`;
}

// 送到 Google 試算表（Apps Script）。用純文字送出，瀏覽器才不會先發 CORS 預檢請求
async function sendOrder(payload) {
  let result;
  try {
    const res = await fetch(ORDER_API_URL, { method: 'POST', body: JSON.stringify(payload) });
    result = await res.json();
  } catch {
    throw new Error('訂單服務暫時無法連線，請稍後再試');
  }
  if (!result.ok) throw new Error(result.error || '訂單送出失敗');
  return result; // { ok, id, subtotal, shipping, total }
}

async function submitPickup(form) {
  const lines = cartLines();
  if (!lines.length) {
    renderPickup();
    return;
  }
  const pickup = Object.fromEntries(
    ['name', 'phone', 'storeCode', 'storeName', 'note'].map((k) => [k, form.elements[k].value.trim()]),
  );
  const button = $('#pickup-submit');
  const error = $('#pickup-error');
  button.disabled = true;
  button.textContent = '送出中…';
  error.hidden = true;

  let result;
  try {
    result = ORDER_API_URL
      ? await sendOrder({ ...pickup, items: lines.map(({ product, qty }) => ({ id: product.id, qty })) })
      : { id: 'DEMO' + Date.now().toString().slice(-8), ...cartSummary(lines) };
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    button.disabled = false;
    renderPickupSummary();
    return;
  }

  const order = {
    id: result.id,
    date: todayStr(),
    subtotal: result.subtotal,
    shipping: result.shipping,
    total: result.total,
    items: lines.map(({ product, qty }) => ({ name: product.name, price: product.price, qty })),
    name: pickup.name,
    phone: pickup.phone,
    delivery: '7-11 取貨付款',
    address: `${pickup.storeName}（${pickup.storeCode}）`,
    note: pickup.note,
  };
  const { note, ...rememberedPickup } = pickup;
  state.lastPickup = rememberedPickup;
  state.orders.unshift(order);
  state.cart = [];
  save('lastPickup');
  save('orders');
  save('cart');
  updateCartBadge();
  renderCartDrawer();

  $('#page-pickup').innerHTML = `
    ${checkoutSteps(3)}
    <div class="panel success">
      <div class="success-icon" aria-hidden="true">✅</div>
      <h1 class="page-title">訂單已送出！</h1>
      <p>訂單編號 <b>${escapeHtml(order.id)}</b></p>
      <p>取貨門市：<b>7-11 ${escapeHtml(order.address)}</b><br>
        取貨時付款：<b class="price">${money(order.total)}</b></p>
      <p class="muted">包裹到店後會以簡訊通知 ${escapeHtml(order.phone)}，請帶證件到門市取貨付款。</p>
      ${ORDER_API_URL ? '' : '<p class="note">※ 示範模式：尚未設定 Google 試算表，訂單只存在這台瀏覽器中。</p>'}
      <div class="actions">
        <a class="btn btn-primary" href="#member">查看我的訂單</a>
        <a class="btn btn-light" href="#products">繼續購物</a>
      </div>
    </div>`;
  window.scrollTo(0, 0);
}

/* =========================================================
   會員：LINE / Google 登入，第一次登入要填姓名、電話、Email 完成註冊

   目前是「示範模式」：按下登入按鈕會模擬 LINE / Google 回傳一個帳號。
   正式上線時只要改寫 auth.signIn()，換成真正的 LINE / Google 登入，
   其餘畫面與流程都不用動。
   ========================================================= */

const LINE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#06C755"/><path fill="#fff" d="M12 5.2c-4.4 0-8 2.8-8 6.3 0 3.1 2.8 5.7 6.6 6.2.3.1.6.2.7.4.1.2.1.5 0 .8l-.1.7c0 .2-.2.8.7.4.9-.4 4.9-2.9 6.6-4.9 1.2-1.3 1.6-2.6 1.6-3.9 0-3.5-3.6-6-8.1-6z"/></svg>`;

const GOOGLE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const PROVIDERS = {
  line: { name: 'LINE', icon: LINE_ICON },
  google: { name: 'Google', icon: GOOGLE_ICON },
};

const auth = {
  demo: true,

  // 回傳 { provider, uid, name, email }：uid 是該 LINE / Google 帳號的唯一 ID，
  // name / email 是第三方提供的資料（有的話會自動帶入註冊表單）
  async signIn(provider) {
    state.demoUids[provider] ??= Math.random().toString(36).slice(2, 10);
    save('demoUids');
    return { provider, uid: state.demoUids[provider], name: '', email: '' };
  },
};

async function signIn(provider) {
  const identity = await auth.signIn(provider);
  const key = `${identity.provider}:${identity.uid}`;
  const member = state.members[key];

  if (member) {
    state.memberSession = key;
    save('memberSession');
    toast(`歡迎回來，${member.name}！`);
  } else {
    state.pendingSignup = identity;
  }
  renderMember();
}

function signUp(form) {
  const { provider, uid } = state.pendingSignup;
  const key = `${provider}:${uid}`;
  const name = form.elements.name.value.trim();

  state.members[key] = {
    provider,
    name,
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    points: 0,
    prizes: [],
    joined: todayStr(),
  };
  state.memberSession = key;
  state.pendingSignup = null;
  save('members');
  save('memberSession');
  toast(`註冊成功，歡迎 ${name}！`);
  renderMember();
}

function cancelSignup() {
  state.pendingSignup = null;
  renderMember();
}

function logout() {
  state.memberSession = null;
  save('memberSession');
  toast('已登出');
  renderMember();
}

function renderLogin() {
  return `
    <div class="panel auth-box">
      <div class="auth-head">
        <span class="auth-logo" aria-hidden="true">🎫</span>
        <h1 class="page-title">會員登入</h1>
        <p class="page-sub">使用 LINE 或 Google 帳號快速登入<br>第一次登入需填寫基本資料完成註冊</p>
      </div>
      <div class="social-btns">
        <button class="btn-social btn-line" data-action="sign-in" data-provider="line">${LINE_ICON}使用 LINE 登入</button>
        <button class="btn-social btn-google" data-action="sign-in" data-provider="google">${GOOGLE_ICON}使用 Google 登入</button>
      </div>
      <ul class="perks">
        <li>🎫 線上刮刮卡中獎點數自動入帳</li>
        <li>🧾 訂單紀錄隨時查詢</li>
        <li>💎 會員日點數 2 倍送</li>
      </ul>
      ${auth.demo ? '<p class="note">※ 示範模式：尚未串接 LINE / Google，按下按鈕會模擬登入，資料只存在這台裝置的瀏覽器中。</p>' : ''}
    </div>`;
}

function renderSignup({ provider, name, email }) {
  const p = PROVIDERS[provider];
  return `
    <div class="panel auth-box">
      <span class="provider-badge provider-${provider}">${p.icon}已透過 ${p.name} 驗證</span>
      <h1 class="page-title">完成會員註冊</h1>
      <p class="page-sub">最後一步！請填寫以下資料，方便通知中獎與寄送獎品</p>
      <form id="signup-form" class="form">
        <label class="field">姓名
          <input name="name" required autocomplete="name" value="${escapeHtml(name)}">
        </label>
        <label class="field">電話
          <input name="phone" type="tel" required pattern="09\\d{8}" placeholder="0912345678"
            title="請輸入 09 開頭的 10 碼手機號碼" autocomplete="tel">
        </label>
        <label class="field">Email
          <input name="email" type="email" required placeholder="name@example.com"
            autocomplete="email" value="${escapeHtml(email)}">
        </label>
        <button class="btn btn-primary btn-block" type="submit">完成註冊</button>
        <button class="btn btn-light btn-block" type="button" data-action="cancel-signup">取消</button>
      </form>
    </div>`;
}

function renderMember() {
  const el = $('#page-member');
  const member = currentMember();

  if (!member) {
    el.innerHTML = state.pendingSignup ? renderSignup(state.pendingSignup) : renderLogin();
    return;
  }

  const orders = state.orders.filter((o) => o.phone === member.phone);
  const orderList = orders.length
    ? `<ul class="list">${orders.map((o) => `
        <li>
          <div>
            <b>${o.id}</b>
            <div class="muted small">${o.date} · ${o.items.length} 項商品 · ${escapeHtml(o.delivery)}</div>
          </div>
          <span class="price">${money(o.total)}</span>
        </li>`).join('')}</ul>`
    : emptyBox('🧾', '還沒有訂單', '<a class="btn btn-light btn-sm" href="#products">去逛逛</a>');
  const prizeList = member.prizes.length
    ? `<ul class="list">${member.prizes.map((p) => `
        <li><span>🎉 ${p.label}</span><span class="muted small">${p.date}</span></li>`).join('')}</ul>`
    : emptyBox('🎫', '還沒有中獎紀錄', '<a class="btn btn-light btn-sm" href="#mini">去刮刮看</a>');
  const provider = PROVIDERS[member.provider];

  el.innerHTML = `
    <div class="member-card">
      <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(member.name[0])}</span>
      <div>
        <div class="member-name">${escapeHtml(member.name)}</div>
        <div class="small">${maskPhone(member.phone)} · ${escapeHtml(member.email)}</div>
        <span class="level">${memberLevel(member.points)}</span>
        <span class="level level-provider">${provider.icon}${provider.name} 登入</span>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="logout">登出</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${member.points.toLocaleString('zh-TW')}</b><span>我的點數</span></div>
      <div class="stat"><b>${orders.length}</b><span>訂單</span></div>
      <div class="stat"><b>${member.prizes.length}</b><span>中獎次數</span></div>
    </div>
    <div class="member-sections">
      <section class="panel"><h2>我的訂單</h2>${orderList}</section>
      <section class="panel"><h2>中獎紀錄</h2>${prizeList}</section>
    </div>`;
}

/* =========================================================
   路由與事件
   網址格式：#products、#products/cards、#products?q=關鍵字
   ========================================================= */

const PAGES = {
  home: renderHome,
  events: renderEvents,
  products: renderProducts,
  winners: renderWinners,
  mini: renderMini,
  order: renderOrder,
  pickup: renderPickup,
  member: renderMember,
};

function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [page, param] = path.split('/');
  const name = Object.hasOwn(PAGES, page) ? page : 'home';

  clearInterval(carouselTimer);
  closeDrawer();
  closeCart();

  document.querySelectorAll('.page').forEach((el) => {
    el.hidden = el.id !== `page-${name}`;
  });
  document.querySelectorAll('.main-nav a').forEach((a) => {
    const active = a.dataset.page === name;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  PAGES[name](param && decodeURIComponent(param), new URLSearchParams(query));
  window.scrollTo(0, 0);
}

const ACTIONS = {
  'add-to-cart': (el) => addToCart(el.dataset.id),
  'qty': (el) => changeQty(el.dataset.id, Number(el.dataset.delta)),
  'remove-from-cart': (el) => removeFromCart(el.dataset.id),
  'open-cart': () => openCart(),
  'close-cart': closeCart,
  'event-filter': (el) => { eventFilter = el.dataset.value; renderEvents(); },
  'open-mini': (el) => openMini(el.dataset.id),
  'profit-cards': (el) => setProfitCards(el.dataset.value),
  'profit-add': (el) => changePrizeList(el.dataset.kind),
  'profit-remove': (el) => changePrizeList(el.dataset.kind, el.dataset.index),
  'profit-reset': resetProfit,
  'rng': generateNumbers,
  'scratch-again': () => scratch.reset(),
  'open-drawer': openDrawer,
  'drawer-tab': (el) => setDrawerTab(el.dataset.id),
  'close-drawer': closeDrawer,
  'sign-in': (el) => signIn(el.dataset.provider),
  'cancel-signup': cancelSignup,
  'logout': logout,
};

const FORMS = {
  'pickup-form': submitPickup,
  'profit-form': () => {}, // 邊輸入邊算，按 Enter 不必送出
  'signup-form': signUp,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) ACTIONS[el.dataset.action]?.(el);
  // 點選單內連到目前頁面的連結時，hashchange 不會觸發，所以這裡也要關
  if (e.target.closest('.drawer a')) closeDrawer();
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const handler = form.classList.contains('search') ? search : FORMS[form.id];
  if (!handler) return;
  e.preventDefault();
  handler(form);
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'winner-filter') return;
  winnerFilter = e.target.value;
  renderWinners();
  $('#winner-filter').focus();
});

// 效益試算：邊輸入邊重算
document.addEventListener('input', (e) => {
  if (e.target.closest('#profit-form')) updateProfitField(e.target);
});

// 電腦上滑鼠移到分類頁籤就切換內容
document.addEventListener('mouseover', (e) => {
  const tab = e.target.closest('.drawer-tab');
  if (tab) setDrawerTab(tab.dataset.id);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeDrawer();
  closeCart();
});

window.addEventListener('hashchange', route);

renderAnnounce();
renderDrawer();
updateCartBadge();
renderCartDrawer();
route();
