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
  const STOREFRONT_TOKEN = 'e0369b1b658648502923373bb0cf6d27';
  const CART_STORAGE_KEY = 'mackmagnets_cart_id';
  const CHECKOUT_DOMAIN = 'https://mackmagnets.com';

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
    cart.checkoutUrl = shopifyCart.checkoutUrl;
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
    const numericId = variantId.toString().replace(/\D/g, '');
    window.location.href = `${CHECKOUT_DOMAIN}/cart/${numericId}:${quantity}`;
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
      // Fallback: build /cart/ URL
      const parts = cart.items.map(i => {
        const numId = i.variantId.toString().replace(/\D/g, '');
        return `${numId}:${i.quantity}`;
      });
      window.location.href = `${CHECKOUT_DOMAIN}/cart/${parts.join(',')}`;
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
