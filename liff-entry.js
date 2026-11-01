'use strict';

// 此頁在 LIFF 瀏覽器內完成驗證與註冊，不再把授權碼交回另一個瀏覽器。
async function startLiffMember() {
  const memberPage = document.getElementById('page-member');
  function showLiffError(message) {
    state.authBusy = false;
    location.hash = '#member';
    document.querySelectorAll('main .page').forEach(page => { page.hidden = page !== memberPage; });
    memberPage.innerHTML = '<div class="panel auth-box"><h1>LINE 會員登入</h1><p id="liff-error-message"></p><a class="btn btn-primary" href="./#member">返回網站</a></div>';
    document.getElementById('liff-error-message').textContent = message;
  }
  if (!APP_LINE_CONFIG.enabled || !/^\d+-[a-zA-Z0-9]+$/.test(APP_LINE_CONFIG.liffId)) {
    showLiffError('LINE App 登入尚未完成設定，請先使用網站會員登入。');
    return;
  }
  if (!window.liff) {
    showLiffError('無法載入 LINE 登入服務，請確認網路後重新開啟。');
    return;
  }
  state.authBusy = true;
  location.hash = '#member';
  route();
  try {
    await liff.init({ liffId: APP_LINE_CONFIG.liffId });
    // 外部瀏覽器未登入時交給 SDK 處理，不自行製作授權 URL 或放寬驗證。
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.origin + location.pathname + location.search });
      return;
    }
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('未取得 LINE 身分證明，請確認 LIFF 已設定 openid 權限。');
    const params = new URLSearchParams(location.search);
    const returnHash = ['order', 'pickup'].includes(params.get('target')) ? '#' + params.get('target') : '#member';
    // 跨瀏覽器僅帶入商品 ID 與數量，檢查範圍，絕不採用網址傳來的價格。
    const rawCart = params.get('cart');
    if (rawCart && rawCart.length <= 6000) {
      try {
        const items = JSON.parse(rawCart);
        if (Array.isArray(items) && items.length <= 50 && items.every(item => item &&
          typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.id) &&
          Number.isInteger(item.qty) && item.qty >= 1 && item.qty <= 99) &&
          new Set(items.map(item => item.id)).size === items.length) {
          state.cart = items.map(({ id, qty }) => ({ id, qty }));
          save('cart');
          updateCartBadge();
          renderCartDrawer();
        }
      } catch { /* 錯誤購物車參數不影響登入，不覆寫原購物車。 */ }
    }
    const result = await callApi({ action: 'liffLogin', idToken });
    // 不保存 ID token；換成既有後端憑證後沿用原本的會員畫面。
    history.replaceState(null, '', location.pathname + '#member');
    state.authBusy = false;
    if (result.needSignup) {
      state.pendingSignup = { ticket: result.ticket, name: result.lineName, returnHash };
      route();
    } else {
      setSession(result);
      goAfterLogin(returnHash);
    }
  } catch (err) {
    showLiffError('LINE App 登入未完成，請重新從網站開啟。若持續發生，請聯絡店家確認 LIFF 設定與接單服務部署。');
  }
}

startLiffMember();
