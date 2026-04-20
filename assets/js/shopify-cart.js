/**
 * Mack Magnets — Shopify Cart Integration (Storefront GraphQL Cart API)
 * Built by AjayaDesign | Fingerprint: 414A4459-43415254
 *
 * Standard items: Add to cart stays on-site, items collect in drawer.
 * Checkout button goes to Shopify checkout.
 * Custom products: Link to Shopify hosted page (photo upload).
 * If cart has items, show modal warning first.
 */

(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────
  var SHOPIFY_DOMAIN = '1pp0pw-1f.myshopify.com';
  var STOREFRONT_TOKEN = '58bb75ddbaf6ee38b7e98b629d296178';
  var API_VERSION = '2025-01';
  var ENDPOINT = 'https://' + SHOPIFY_DOMAIN + '/api/' + API_VERSION + '/graphql.json';
  var CART_STORAGE_KEY = 'mackmagnets_cart_id';

  var cart = null; // { id, checkoutUrl, lines[], subtotal, total }
  var cartTriggerEl = null;
  var cartReady = null; // Promise that resolves when cart is initialized

  // ─── GraphQL helper ───────────────────────────────────
  function gql(query, variables) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query: query, variables: variables || {} })
    })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (json.errors) {
        console.error('Shopify API errors:', json.errors);
        throw new Error(json.errors[0].message);
      }
      return json.data;
    });
  }

  // ─── Shared cart fields ───────────────────────────────
  var CART_FRAGMENT = [
    'fragment CF on Cart {',
    '  id',
    '  checkoutUrl',
    '  lines(first: 50) {',
    '    edges {',
    '      node {',
    '        id',
    '        quantity',
    '        attributes { key value }',
    '        merchandise {',
    '          ... on ProductVariant {',
    '            id title',
    '            price { amount currencyCode }',
    '            product { title }',
    '            image { url altText }',
    '          }',
    '        }',
    '      }',
    '    }',
    '  }',
    '  cost {',
    '    subtotalAmount { amount currencyCode }',
    '    totalAmount { amount currencyCode }',
    '  }',
    '}'
  ].join('\n');

  // ─── Parse raw cart ───────────────────────────────────
  function parseCart(raw) {
    if (!raw) return null;
    var lines = [];
    if (raw.lines && raw.lines.edges) {
      lines = raw.lines.edges.map(function (e) {
        var n = e.node;
        var m = n.merchandise || {};
        return {
          id: n.id,
          quantity: n.quantity,
          title: (m.product && m.product.title) || '',
          variantTitle: m.title || '',
          variantId: m.id || '',
          price: (m.price && m.price.amount) || '0.00',
          image: (m.image && m.image.url) || '',
          attributes: Array.isArray(n.attributes) ? n.attributes : []
        };
      });
    }
    // Ensure checkout URL uses myshopify.com (not mackmagnets.com which is GitHub Pages)
    var checkoutUrl = raw.checkoutUrl || '';
    if (checkoutUrl && checkoutUrl.indexOf(SHOPIFY_DOMAIN) === -1) {
      try {
        var u = new URL(checkoutUrl);
        u.hostname = SHOPIFY_DOMAIN;
        checkoutUrl = u.toString();
      } catch (e) { /* keep original */ }
    }
    return {
      id: raw.id,
      checkoutUrl: checkoutUrl,
      lines: lines,
      subtotal: (raw.cost && raw.cost.subtotalAmount && raw.cost.subtotalAmount.amount) || '0.00',
      total: (raw.cost && raw.cost.totalAmount && raw.cost.totalAmount.amount) || '0.00'
    };
  }

  // ─── Create empty cart ────────────────────────────────
  function createCart() {
    var q = 'mutation { cartCreate(input: {}) { cart { ...CF } userErrors { field message } } }\n' + CART_FRAGMENT;
    return gql(q).then(function (data) {
      cart = parseCart(data.cartCreate.cart);
      if (cart) localStorage.setItem(CART_STORAGE_KEY, cart.id);
      updateCartUI();
      return cart;
    });
  }

  // ─── Fetch existing cart ──────────────────────────────
  function fetchCart(cartId) {
    var q = 'query($id: ID!) { cart(id: $id) { ...CF } }\n' + CART_FRAGMENT;
    return gql(q, { id: cartId }).then(function (data) {
      if (data.cart) {
        cart = parseCart(data.cart);
        updateCartUI();
        return cart;
      }
      localStorage.removeItem(CART_STORAGE_KEY);
      return createCart();
    }).catch(function () {
      localStorage.removeItem(CART_STORAGE_KEY);
      return createCart();
    });
  }

  // ─── Add to cart ──────────────────────────────────────
  function addToCart(variantId, quantity, attributes) {
    quantity = quantity || 1;
    if (variantId.indexOf('gid://') !== 0) {
      variantId = 'gid://shopify/ProductVariant/' + variantId;
    }
    var lineInput = { merchandiseId: variantId, quantity: quantity };
    if (attributes && attributes.length) {
      lineInput.attributes = attributes.map(function (a) {
        return { key: String(a.key), value: String(a.value) };
      });
    }

    // Wait for cart to be ready (handles race condition on page load)
    var ready = cart ? Promise.resolve(cart) : (cartReady || createCart());
    return ready.then(function () {
      if (!cart) return createCart();
      return cart;
    }).then(function () {
      if (!cart) throw new Error('Cart unavailable');

      var q = [
        'mutation($cartId: ID!, $lines: [CartLineInput!]!) {',
        '  cartLinesAdd(cartId: $cartId, lines: $lines) {',
        '    cart { ...CF }',
        '    userErrors { field message }',
        '  }',
        '}',
        CART_FRAGMENT
      ].join('\n');

    return gql(q, {
        cartId: cart.id,
        lines: [lineInput]
      }).then(function (data) {
        var errs = data.cartLinesAdd.userErrors;
        if (errs && errs.length) {
          console.error('Add to cart errors:', errs);
          throw new Error(errs[0].message);
        }
        cart = parseCart(data.cartLinesAdd.cart);
        if (cart) localStorage.setItem(CART_STORAGE_KEY, cart.id);
        updateCartUI();
        openCartDrawer();
        showAddedFeedback();
        return cart;
      });
    }).catch(function (err) {
      console.error('Add to cart failed:', err);
      // Cart might be invalid — recreate and retry once
      return createCart().then(function () {
        if (!cart) throw new Error('Cart unavailable');
        var q2 = [
          'mutation($cartId: ID!, $lines: [CartLineInput!]!) {',
          '  cartLinesAdd(cartId: $cartId, lines: $lines) {',
          '    cart { ...CF }',
          '    userErrors { field message }',
          '  }',
          '}',
          CART_FRAGMENT
        ].join('\n');
        return gql(q2, {
          cartId: cart.id,
          lines: [lineInput]
        }).then(function (data) {
          cart = parseCart(data.cartLinesAdd.cart);
          if (cart) localStorage.setItem(CART_STORAGE_KEY, cart.id);
          updateCartUI();
          openCartDrawer();
          return cart;
        });
      });
    });
  }

  // ─── Update line quantity ─────────────────────────────
  function updateQuantity(lineId, quantity) {
    if (!cart) return Promise.resolve();
    if (quantity < 1) return removeItem(lineId);

    var q = [
      'mutation($cartId: ID!, $lines: [CartLineUpdateInput!]!) {',
      '  cartLinesUpdate(cartId: $cartId, lines: $lines) {',
      '    cart { ...CF }',
      '    userErrors { field message }',
      '  }',
      '}',
      CART_FRAGMENT
    ].join('\n');

    return gql(q, {
      cartId: cart.id,
      lines: [{ id: lineId, quantity: quantity }]
    }).then(function (data) {
      cart = parseCart(data.cartLinesUpdate.cart);
      updateCartUI();
    });
  }

  // ─── Remove line item ─────────────────────────────────
  function removeItem(lineId) {
    if (!cart) return Promise.resolve();

    var q = [
      'mutation($cartId: ID!, $lineIds: [ID!]!) {',
      '  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {',
      '    cart { ...CF }',
      '    userErrors { field message }',
      '  }',
      '}',
      CART_FRAGMENT
    ].join('\n');

    return gql(q, {
      cartId: cart.id,
      lineIds: [lineId]
    }).then(function (data) {
      cart = parseCart(data.cartLinesRemove.cart);
      updateCartUI();
    });
  }

  // ─── Cart Drawer ──────────────────────────────────────
  function openCartDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');
    if (drawer) {
      cartTriggerEl = document.activeElement;
      drawer.classList.add('open');
    }
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    var closeBtn = drawer && drawer.querySelector('#cart-drawer-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeCartDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (cartTriggerEl && cartTriggerEl.focus) {
      cartTriggerEl.focus();
      cartTriggerEl = null;
    }
  }

  function trapFocusInCart(e) {
    var drawer = document.getElementById('cart-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    if (e.key === 'Escape') { closeCartDrawer(); return; }
    if (e.key !== 'Tab') return;
    var focusable = drawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function showAddedFeedback() {
    var badge = document.querySelector('.cart-count');
    if (badge) {
      badge.classList.add('pop');
      setTimeout(function () { badge.classList.remove('pop'); }, 400);
    }
  }

  // ─── Render cart UI ───────────────────────────────────
  function updateCartUI() {
    if (!cart) return;

    var lines = cart.lines || [];
    var itemCount = lines.reduce(function (s, l) { return s + l.quantity; }, 0);

    // Badge
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = itemCount;
      el.style.display = itemCount > 0 ? 'flex' : 'none';
    });

    var itemsContainer = document.getElementById('cart-drawer-items');
    var emptyState = document.getElementById('cart-drawer-empty');
    var cartFooter = document.getElementById('cart-drawer-footer');
    var subtotalEl = document.getElementById('cart-drawer-total');

    if (!itemsContainer) return;

    if (lines.length === 0) {
      itemsContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (cartFooter) cartFooter.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (cartFooter) cartFooter.style.display = 'block';

    itemsContainer.innerHTML = lines.map(function (item) {
      var imgTag = item.image
        ? '<img class="cart-item-img" src="' + item.image + '&width=120" alt="' + item.title + '" width="60" height="60">'
        : '<div class="cart-item-img cart-item-img-placeholder"></div>';
      var variantLabel = item.variantTitle && item.variantTitle !== 'Default Title'
        ? '<p class="cart-item-variant">' + item.variantTitle + '</p>'
        : '';
      var lineTotal = (parseFloat(item.price) * item.quantity).toFixed(2);

      // Photo thumbnails from line-item attributes (Photo 1, Photo 2, ...)
      var photoThumbs = '';
      if (item.attributes && item.attributes.length) {
        var photos = item.attributes.filter(function (a) {
          return a && /^Photo\s+\d+$/i.test(a.key) && /^https?:\/\//.test(a.value);
        });
        if (photos.length) {
          photoThumbs = '<div class="cart-item-photos" aria-label="Uploaded photos">' +
            photos.map(function (p) {
              return '<a href="' + p.value + '" target="_blank" rel="noopener" title="' + p.key + '">' +
                '<img src="' + p.value + '" alt="' + p.key + '" width="32" height="32" loading="lazy">' +
              '</a>';
            }).join('') +
          '</div>';
        }
      }

      return '<div class="cart-item">' +
        imgTag +
        '<div class="cart-item-details">' +
          '<h4 class="cart-item-title">' + item.title + '</h4>' +
          variantLabel +
          photoThumbs +
          '<div class="cart-item-qty">' +
            '<button class="qty-btn" data-line-id="' + item.id + '" data-qty="' + (item.quantity - 1) + '" aria-label="Decrease quantity">\u2212</button>' +
            '<span class="qty-value">' + item.quantity + '</span>' +
            '<button class="qty-btn" data-line-id="' + item.id + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-item-right">' +
          '<span class="cart-item-price">$' + lineTotal + '</span>' +
          '<button class="cart-item-remove" data-line-id="' + item.id + '" aria-label="Remove item">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    if (subtotalEl) {
      subtotalEl.textContent = '$' + parseFloat(cart.total).toFixed(2);
    }
  }

  // ─── Custom product modal ─────────────────────────────
  // When a user has items in cart and clicks a custom product link
  // (goes to Shopify hosted page for photo upload), warn them that
  // the Shopify and on-site carts are separate.

  function isCustomProductLink(el) {
    var link = el.closest('a[href*="myshopify.com/products/"]');
    if (!link) return null;
    if (link.classList.contains('product-card__btn') || link.classList.contains('pdp-cta')) {
      return link;
    }
    return null;
  }

  function showCustomCartModal(customUrl) {
    var existing = document.getElementById('custom-cart-modal');
    if (existing) existing.remove();

    var itemCount = cart.lines.reduce(function (s, l) { return s + l.quantity; }, 0);
    var itemWord = itemCount === 1 ? 'item' : 'items';

    var modal = document.createElement('div');
    modal.id = 'custom-cart-modal';
    modal.className = 'custom-cart-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Cart notice');
    modal.innerHTML =
      '<div class="custom-cart-modal">' +
        '<button class="custom-cart-modal-close" aria-label="Close">&times;</button>' +
        '<div class="custom-cart-modal-icon">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
            '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
          '</svg>' +
        '</div>' +
        '<h3 class="custom-cart-modal-title">Heads up!</h3>' +
        '<p class="custom-cart-modal-text">' +
          'You have <strong>' + itemCount + ' ' + itemWord + '</strong> in your cart. ' +
          'Custom photo magnets are ordered on a separate page, so your current cart won\u2019t carry over there.' +
        '</p>' +
        '<div class="custom-cart-modal-actions">' +
          '<a href="' + cart.checkoutUrl + '" class="btn-primary custom-cart-modal-btn">Checkout Cart First</a>' +
          '<a href="' + customUrl + '" target="_blank" rel="noopener" class="btn-outline custom-cart-modal-btn">Continue to Custom Magnets</a>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('open'); });

    var firstBtn = modal.querySelector('.custom-cart-modal-btn');
    if (firstBtn) firstBtn.focus();

    modal.querySelector('.custom-cart-modal-close').addEventListener('click', closeCustomCartModal);
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) closeCustomCartModal();
    });
    document.addEventListener('keydown', function handler(ev) {
      if (ev.key === 'Escape') {
        closeCustomCartModal();
        document.removeEventListener('keydown', handler);
      }
    });
  }

  function closeCustomCartModal() {
    var modal = document.getElementById('custom-cart-modal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(function () { modal.remove(); }, 300);
    }
  }

  // ─── Event binding ────────────────────────────────────
  function bindCartEvents() {
    document.addEventListener('click', function (e) {

      // Intercept custom product links when cart has items
      var customLink = isCustomProductLink(e.target);
      if (customLink && cart && cart.lines && cart.lines.length > 0) {
        e.preventDefault();
        showCustomCartModal(customLink.href);
        return;
      }

      // Open cart
      if (e.target.closest('.cart-icon-btn') || e.target.closest('.cart-toggle')) {
        e.preventDefault();
        openCartDrawer();
        return;
      }

      // Close cart
      if (e.target.closest('#cart-drawer-close') || e.target.closest('#cart-overlay')) {
        closeCartDrawer();
        return;
      }

      // Add to cart — any [data-variant-id] button that isn't disabled
      var addBtn = e.target.closest('[data-variant-id]');
      if (addBtn && !addBtn.classList.contains('adding') && !addBtn.disabled) {
        // Custom PDPs: pdp-uploader.js owns the CTA so it can attach photo
        // attributes. Skip the generic handler there.
        var ownerPdp = addBtn.closest('.pdp[data-is-custom="true"]');
        if (ownerPdp && addBtn.id === 'pdp-cta') return;
        e.preventDefault();
        var vid = addBtn.getAttribute('data-variant-id');
        var origText = addBtn.textContent;
        addBtn.classList.add('adding');
        addBtn.textContent = 'Adding\u2026';

        addToCart(vid, 1).then(function () {
          addBtn.textContent = 'Added \u2713';
          setTimeout(function () {
            addBtn.classList.remove('adding');
            addBtn.textContent = origText;
          }, 1500);
        }).catch(function () {
          addBtn.classList.remove('adding');
          addBtn.textContent = origText;
        });
        return;
      }

      // Qty buttons in cart drawer
      var qtyBtn = e.target.closest('.qty-btn');
      if (qtyBtn) {
        var lid = qtyBtn.getAttribute('data-line-id');
        var nq = parseInt(qtyBtn.getAttribute('data-qty'), 10);
        if (nq < 1) {
          removeItem(lid);
        } else {
          updateQuantity(lid, nq);
        }
        return;
      }

      // Remove buttons in cart drawer
      var removeBtn = e.target.closest('.cart-item-remove');
      if (removeBtn) {
        removeItem(removeBtn.getAttribute('data-line-id'));
        return;
      }

      // Checkout button
      if (e.target.closest('#cart-checkout-btn')) {
        e.preventDefault();
        if (cart && cart.checkoutUrl) {
          window.location.href = cart.checkoutUrl;
        }
        return;
      }
    });

    document.addEventListener('keydown', trapFocusInCart);
  }

  // ─── Init ─────────────────────────────────────────────
  function init() {
    bindCartEvents();
    var existingId = localStorage.getItem(CART_STORAGE_KEY);
    if (existingId) {
      cartReady = fetchCart(existingId);
    } else {
      cartReady = createCart();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.MackCart = {
    addToCart: addToCart,
    openCartDrawer: openCartDrawer,
    closeCartDrawer: closeCartDrawer,
    getCart: function () { return cart; }
  };
})();
/**
 * Mack Magnets — Shopify Cart Integration
 * Built by AjayaDesign | Fingerprint: 414A4459-43415254
 * 
 * Uses Shopify Buy SDK (Storefront API) for cart management.
 * Falls back to direct checkout URL if cart API unavailable.
 */

(function() {
  'use strict';

  const SHOPIFY_DOMAIN = '1pp0pw-1f.myshopify.com';
  const STOREFRONT_TOKEN = '58bb75ddbaf6ee38b7e98b629d296178';
  const CART_STORAGE_KEY = 'mackmagnets_cart_id';
  const CHECKOUT_DOMAIN = `https://${SHOPIFY_DOMAIN}`;

  // Cart state
  let cart = { items: [], totalPrice: '0.00', totalQuantity: 0 };
  let cartDrawerOpen = false;

  // ── Storefront API helpers ──

  async function storefrontFetch(query, variables = {}) {
    const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query, variables })
    });
    return res.json();
  }

  // ── Cart operations (try Storefront API, fallback to direct checkout) ──

  async function createCart(variantId, quantity) {
    try {
      const { data } = await storefrontFetch(`
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart { id checkoutUrl
              lines(first:50) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { title } } } } } }
              cost { totalAmount { amount currencyCode } }
            }
            userErrors { field message }
          }
        }
      `, { input: { lines: [{ merchandiseId: variantId, quantity }] } });

      if (data?.cartCreate?.cart) {
        localStorage.setItem(CART_STORAGE_KEY, data.cartCreate.cart.id);
        syncCartState(data.cartCreate.cart);
        return true;
      }
    } catch (e) { console.warn('Storefront cart create failed, using fallback', e); }
    return false;
  }

  async function fetchCart() {
    const cartId = localStorage.getItem(CART_STORAGE_KEY);
    if (!cartId) return;
    try {
      const { data } = await storefrontFetch(`
        query getCart($id: ID!) {
          cart(id: $id) { id checkoutUrl
            lines(first:50) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { title } } } } } }
            cost { totalAmount { amount currencyCode } }
          }
        }
      `, { id: cartId });

      if (data?.cart) { syncCartState(data.cart); return; }
    } catch (e) { console.warn('Storefront cart fetch failed', e); }
    // Clear stale cart
    localStorage.removeItem(CART_STORAGE_KEY);
    cart = { items: [], totalPrice: '0.00', totalQuantity: 0 };
    updateCartUI();
  }

  async function addToCart(variantId, quantity = 1) {
    // Convert numeric variant ID to Storefront GID
    const gid = variantId.toString().startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`;
    
    const cartId = localStorage.getItem(CART_STORAGE_KEY);
    if (!cartId) {
      const created = await createCart(gid, quantity);
      if (!created) { fallbackCheckout(variantId, quantity); }
      updateCartUI();
      openCartDrawer();
      return;
    }

    try {
      const { data } = await storefrontFetch(`
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart { id checkoutUrl
              lines(first:50) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { title } } } } } }
              cost { totalAmount { amount currencyCode } }
            }
            userErrors { field message }
          }
        }
      `, { cartId, lines: [{ merchandiseId: gid, quantity }] });

      if (data?.cartLinesAdd?.cart) {
        syncCartState(data.cartLinesAdd.cart);
        updateCartUI();
        openCartDrawer();
        return;
      }
    } catch (e) { console.warn('Storefront add failed', e); }

    // If Storefront API fails, try fresh cart
    localStorage.removeItem(CART_STORAGE_KEY);
    const created = await createCart(gid, quantity);
    if (!created) { fallbackCheckout(variantId, quantity); }
    updateCartUI();
    openCartDrawer();
  }

  async function updateLineQuantity(lineId, quantity) {
    const cartId = localStorage.getItem(CART_STORAGE_KEY);
    if (!cartId) return;

    const mutation = quantity === 0 ? `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { id checkoutUrl
            lines(first:50) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { title } } } } } }
            cost { totalAmount { amount currencyCode } }
          }
        }
      }
    ` : `
      mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart { id checkoutUrl
            lines(first:50) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { title } } } } } }
            cost { totalAmount { amount currencyCode } }
          }
        }
      }
    `;

    const variables = quantity === 0
      ? { cartId, lineIds: [lineId] }
      : { cartId, lines: [{ id: lineId, quantity }] };

    try {
      const { data } = await storefrontFetch(mutation, variables);
      const updatedCart = quantity === 0 ? data?.cartLinesRemove?.cart : data?.cartLinesUpdate?.cart;
      if (updatedCart) { syncCartState(updatedCart); updateCartUI(); }
    } catch (e) { console.warn('Cart update failed', e); }
  }

  function syncCartState(shopifyCart) {
    // Rewrite checkout URL to use myshopify.com domain (mackmagnets.com is GitHub Pages)
    let checkoutUrl = shopifyCart.checkoutUrl || '';
    if (checkoutUrl && !checkoutUrl.includes(SHOPIFY_DOMAIN)) {
      try {
        const u = new URL(checkoutUrl);
        u.hostname = SHOPIFY_DOMAIN;
        checkoutUrl = u.toString();
      } catch (e) { /* keep original */ }
    }
    cart.checkoutUrl = checkoutUrl;
    cart.totalPrice = shopifyCart.cost?.totalAmount?.amount || '0.00';
    cart.items = (shopifyCart.lines?.edges || []).map(({ node }) => ({
      lineId: node.id,
      variantId: node.merchandise.id,
      title: node.merchandise.product?.title || node.merchandise.title,
      variantTitle: node.merchandise.title,
      price: node.merchandise.price.amount,
      quantity: node.quantity,
      image: node.merchandise.image?.url || ''
    }));
    cart.totalQuantity = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  }

  function fallbackCheckout(variantId, quantity) {
    // Direct /cart/ URLs redirect to mackmagnets.com (GitHub Pages) and 404
    // Alert the user to retry — Storefront API should handle this
    alert('Unable to add item to cart. Please try again or contact us for help.');
  }

  // ── UI ──

  function updateCartUI() {
    // Update all cart count badges
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = cart.totalQuantity;
      el.style.display = cart.totalQuantity > 0 ? 'flex' : 'none';
    });

    // Update drawer contents
    const drawerItems = document.getElementById('cart-drawer-items');
    const drawerTotal = document.getElementById('cart-drawer-total');
    const drawerEmpty = document.getElementById('cart-drawer-empty');
    const drawerFooter = document.getElementById('cart-drawer-footer');

    if (!drawerItems) return;

    if (cart.items.length === 0) {
      drawerItems.innerHTML = '';
      if (drawerEmpty) drawerEmpty.style.display = 'block';
      if (drawerFooter) drawerFooter.style.display = 'none';
      return;
    }

    if (drawerEmpty) drawerEmpty.style.display = 'none';
    if (drawerFooter) drawerFooter.style.display = 'block';

    drawerItems.innerHTML = cart.items.map(item => `
      <div class="cart-item" data-line-id="${item.lineId}">
        ${item.image ? `<img src="${item.image}" alt="${item.title}" class="cart-item__image" width="64" height="64">` : '<div class="cart-item__image cart-item__placeholder"></div>'}
        <div class="cart-item__details">
          <div class="cart-item__title">${item.title}</div>
          <div class="cart-item__price">$${parseFloat(item.price).toFixed(2)}</div>
          <div class="cart-item__qty">
            <button class="cart-item__qty-btn" data-action="decrease" aria-label="Decrease quantity">−</button>
            <span>${item.quantity}</span>
            <button class="cart-item__qty-btn" data-action="increase" aria-label="Increase quantity">+</button>
            <button class="cart-item__remove" data-action="remove" aria-label="Remove item">✕</button>
          </div>
        </div>
      </div>
    `).join('');

    if (drawerTotal) {
      drawerTotal.textContent = `$${parseFloat(cart.totalPrice).toFixed(2)}`;
    }

    // Bind qty buttons
    drawerItems.querySelectorAll('.cart-item__qty-btn, .cart-item__remove').forEach(btn => {
      btn.addEventListener('click', function() {
        const itemEl = this.closest('.cart-item');
        const lineId = itemEl.dataset.lineId;
        const item = cart.items.find(i => i.lineId === lineId);
        if (!item) return;

        const action = this.dataset.action;
        if (action === 'increase') updateLineQuantity(lineId, item.quantity + 1);
        else if (action === 'decrease') updateLineQuantity(lineId, Math.max(0, item.quantity - 1));
        else if (action === 'remove') updateLineQuantity(lineId, 0);
      });
    });
  }

  function openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer) { drawer.classList.add('open'); cartDrawerOpen = true; }
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer) { drawer.classList.remove('open'); cartDrawerOpen = false; }
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function goToCheckout() {
    if (cart.checkoutUrl) {
      window.location.href = cart.checkoutUrl;
    } else if (cart.items.length > 0) {
      // No checkout URL — try creating a fresh cart via Storefront API
      const gids = cart.items.map(i => ({
        merchandiseId: i.variantId.toString().startsWith('gid://') ? i.variantId : `gid://shopify/ProductVariant/${i.variantId.toString().replace(/\D/g, '')}`,
        quantity: i.quantity
      }));
      storefrontFetch(`
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart { checkoutUrl }
            userErrors { field message }
          }
        }
      `, { input: { lines: gids } }).then(({ data }) => {
        if (data?.cartCreate?.cart?.checkoutUrl) {
          window.location.href = data.cartCreate.cart.checkoutUrl;
        } else {
          alert('Unable to proceed to checkout. Please try again.');
        }
      }).catch(() => {
        alert('Unable to proceed to checkout. Please try again.');
      });
    }
  }

  // ── Init ──

  function init() {
    // Close drawer events
    document.getElementById('cart-drawer-close')?.addEventListener('click', closeCartDrawer);
    document.getElementById('cart-overlay')?.addEventListener('click', closeCartDrawer);
    document.getElementById('cart-checkout-btn')?.addEventListener('click', goToCheckout);

    // Cart icon click
    document.querySelectorAll('.cart-icon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); });
    });

    // Escape key
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cartDrawerOpen) closeCartDrawer(); });

    // Load existing cart
    fetchCart();
  }

  // Expose globally
  window.MackCart = { addToCart, openCartDrawer, closeCartDrawer, getCart: () => cart };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
