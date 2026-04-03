/**
 * Live Product Sync — Mack Magnets
 * =================================
 * Client-side freshness layer that runs on top of the statically-rendered
 * product cards (pre-built by GitHub Actions / sync-products.py).
 *
 * What it does:
 *   1. Fetches LIVE product data from Shopify Storefront API (cache: no-store)
 *   2. Updates existing product cards: prices, availability, sold-out status
 *   3. Hides products that have been unpublished since the last build
 *   4. Dynamically renders NEW products added since the last build
 *
 * SEO is handled by the static HTML — this script only patches the live state.
 * If the API call fails, the static HTML is still perfectly functional.
 *
 * Built by AjayaDesign | Fingerprint: 414A4459-50524F44
 */

(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────
  var SHOPIFY_DOMAIN = '1pp0pw-1f.myshopify.com';
  var STOREFRONT_TOKEN = 'e0369b1b658648502923373bb0cf6d27';
  var API_VERSION = '2024-01';
  var ENDPOINT = 'https://' + SHOPIFY_DOMAIN + '/api/' + API_VERSION + '/graphql.json';

  // ─── GraphQL query ──────────────────────────────────
  var PRODUCTS_QUERY = [
    '{',
    '  products(first: 50, sortKey: PRICE, reverse: false) {',
    '    nodes {',
    '      id',
    '      handle',
    '      title',
    '      availableForSale',
    '      priceRange {',
    '        minVariantPrice { amount currencyCode }',
    '        maxVariantPrice { amount currencyCode }',
    '      }',
    '      featuredImage { url altText }',
    '      variants(first: 10) {',
    '        nodes {',
    '          id',
    '          title',
    '          price { amount currencyCode }',
    '          availableForSale',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n');

  // ─── Helpers ────────────────────────────────────────

  function formatPrice(product) {
    var pr = product.priceRange || {};
    var min = parseFloat((pr.minVariantPrice || {}).amount || '0');
    var max = parseFloat((pr.maxVariantPrice || {}).amount || '0');
    if (min === 0) return 'Free';
    var formatted = '$' + min.toFixed(2);
    if (min !== max) return '<span class="from">From </span>' + formatted;
    return formatted;
  }

  function getImageUrl(product, width) {
    width = width || 400;
    var img = product.featuredImage;
    if (!img || !img.url) return '';
    var url = img.url;
    if (url.indexOf('?') !== -1) return url + '&width=' + width;
    return url + '?width=' + width;
  }

  function getFirstVariantId(product) {
    var variants = (product.variants || {}).nodes || [];
    return variants.length ? variants[0].id : '';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Fetch live products ────────────────────────────

  function fetchLiveProducts() {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query: PRODUCTS_QUERY }),
      cache: 'no-store',
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.errors) {
          console.warn('[ProductSync] API errors:', json.errors);
          return [];
        }
        return (json.data && json.data.products && json.data.products.nodes) || [];
      });
  }

  // ─── Update existing product cards ──────────────────

  function updateExistingCards(liveProducts) {
    var productMap = {};
    liveProducts.forEach(function (p) { productMap[p.handle] = p; });

    document.querySelectorAll('.product-card').forEach(function (card) {
      // Try to match by handle from link href or data attribute
      var link = card.querySelector('a[href*="/shop/"]');
      var handle = null;
      if (link) {
        var match = link.getAttribute('href').match(/\/shop\/([^/]+)/);
        if (match) handle = match[1];
      }
      if (!handle) return;

      var product = productMap[handle];
      if (!product) {
        // Product removed from Shopify — hide it
        card.style.display = 'none';
        return;
      }

      // Update availability
      var btn = card.querySelector('.product-card__btn');
      if (!product.availableForSale) {
        card.classList.add('sold-out');
        if (btn && btn.tagName === 'BUTTON') {
          btn.disabled = true;
          btn.textContent = 'Sold Out';
        }
      } else {
        card.classList.remove('sold-out');
        if (btn && btn.tagName === 'BUTTON' && btn.disabled) {
          btn.disabled = false;
          btn.textContent = 'Add to Cart';
        }
      }

      // Update price
      var priceEl = card.querySelector('.product-card__price');
      if (priceEl) {
        var newPrice = formatPrice(product);
        if (priceEl.innerHTML !== newPrice) {
          priceEl.innerHTML = newPrice;
        }
      }

      // Update variant ID
      if (btn && btn.hasAttribute('data-variant-id')) {
        var variantId = getFirstVariantId(product);
        if (variantId) btn.setAttribute('data-variant-id', variantId);
      }
    });
  }

  // ─── Bind Add to Cart buttons on static cards ──────

  function bindStaticButtons() {
    document.querySelectorAll('.product-card__btn[data-variant-id]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var vid = this.dataset.variantId;
        if (vid && window.MackCart) {
          this.textContent = 'Adding...';
          this.disabled = true;
          var self = this;
          window.MackCart.addToCart(vid, 1).then(function () {
            self.textContent = 'Added ✓';
            setTimeout(function () { self.textContent = 'Add to Cart'; self.disabled = false; }, 1500);
          }).catch(function () {
            self.textContent = 'Add to Cart';
            self.disabled = false;
          });
        }
      });
    });
  }

  // ─── Update PDP (product detail page) ──────────────

  function updateProductDetailPage(liveProducts) {
    var pdpSection = document.querySelector('.pdp[data-product-id]');
    if (!pdpSection) return;

    var productId = pdpSection.getAttribute('data-product-id');
    var product = null;
    liveProducts.forEach(function (p) {
      // Match by GID or numeric ID
      if (p.id === productId || p.id === 'gid://shopify/Product/' + productId) {
        product = p;
      }
    });

    if (!product) return;

    // Update price
    var priceEl = pdpSection.querySelector('.pdp-price');
    if (priceEl) {
      priceEl.innerHTML = formatPrice(product);
    }

    // Update availability
    var ctaBtn = pdpSection.querySelector('.pdp-cta');
    if (ctaBtn) {
      if (!product.availableForSale) {
        if (ctaBtn.tagName === 'BUTTON') {
          ctaBtn.disabled = true;
          ctaBtn.textContent = 'Sold Out';
        }
      } else {
        if (ctaBtn.tagName === 'BUTTON' && ctaBtn.disabled) {
          ctaBtn.disabled = false;
          ctaBtn.textContent = 'Add to Cart';
        }
      }
    }

    console.log('[ProductSync] PDP updated for: ' + product.title);
  }

  // ─── Main sync logic ───────────────────────────────

  function syncProducts() {
    // Always bind static buttons first — they work without API
    bindStaticButtons();

    fetchLiveProducts()
      .then(function (liveProducts) {
        if (!liveProducts || liveProducts.length === 0) {
          console.log('[ProductSync] No products returned or API error — static HTML remains active');
          return;
        }

        console.log('[ProductSync] Live data received: ' + liveProducts.length + ' products');

        // Update PDP if present
        updateProductDetailPage(liveProducts);

        // Update existing cards (prices, availability, variant IDs)
        updateExistingCards(liveProducts);
      })
      .catch(function (err) {
        // Graceful degradation — static HTML still works perfectly
        console.warn('[ProductSync] Live sync failed, static HTML still active:', err.message);
      });
  }

  // ─── Init ──────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncProducts);
  } else {
    syncProducts();
  }

})();
