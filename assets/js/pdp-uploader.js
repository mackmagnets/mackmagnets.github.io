/**
 * Mack Magnets — PDP Photo Uploader
 * Built by AjayaDesign | Replaces external Shopify/UploadKit photo flow.
 *
 * - Reads variants_data + photo count from the PDP
 * - Renders N file inputs (1 per required photo)
 * - Uploads each file to our Cloudflare Worker, which proxies to Shopify Files
 * - On submit: MackCart.addToCart(variantId, qty, [{key:'Photo 1',value:url}, ...])
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var pdp = document.querySelector('.pdp');
    if (!pdp || pdp.getAttribute('data-is-custom') !== 'true') return;

    var dataEl = document.getElementById('pdp-variants-data');
    var slotsEl = document.getElementById('pdp-uploader-slots');
    var statusEl = document.getElementById('pdp-uploader-status');
    var ctaEl = document.getElementById('pdp-cta');
    if (!dataEl || !slotsEl || !ctaEl) return;

    var variants;
    try { variants = JSON.parse(dataEl.textContent || '[]'); }
    catch (e) { console.error('Bad variants JSON', e); return; }

    var cfg = window.MACK_UPLOADER || {};
    var configured = cfg.endpoint && /^https?:\/\//.test(cfg.endpoint);

    if (!configured) {
      slotsEl.innerHTML =
        '<p class="pdp-uploader__error">Photo upload is being set up. ' +
        'Please email <a href="mailto:anita@mackmagnets.com">anita@mackmagnets.com</a> ' +
        'to place an order.</p>';
      ctaEl.setAttribute('disabled', 'true');
      ctaEl.classList.add('is-disabled');
      ctaEl.textContent = 'Order via Email';
      return;
    }

    // ─── State ────────────────────────────────────────────
    var uploads = []; // [{ status: 'idle'|'uploading'|'done'|'error', url, file, originalFile, progress }]
    var currentVariant = findCurrentVariant();

    // ─── Crop config ─────────────────────────────────────
    function getCropConfig() {
      var ratio = pdp.getAttribute('data-crop-ratio') || '1:1';
      var shape = pdp.getAttribute('data-crop-shape') || 'square';
      // For puzzle magnets, ratio depends on selected variant
      if (currentVariant && currentVariant.option1) {
        var opt = currentVariant.option1.toLowerCase();
        if (opt.indexOf('2x3') !== -1) { ratio = '2:3'; }
        else if (opt.indexOf('2x2') !== -1) { ratio = '1:1'; }
      }
      var parts = ratio.split(':');
      var numeric = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : 1;
      return { aspectRatio: numeric, shape: shape };
    }

    // ─── Helpers ──────────────────────────────────────────
    function findCurrentVariant() {
      // Read currently selected option chips; fall back to first variant
      var chips = document.querySelectorAll('.pdp-option-chip[aria-pressed="true"]');
      var sel = {};
      chips.forEach(function (c) {
        var idx = parseInt(c.dataset.optionIndex, 10);
        sel[idx] = c.dataset.optionValue;
      });
      var match = variants.find(function (v) {
        return (!sel[1] || v.option1 === sel[1]) &&
               (!sel[2] || v.option2 === sel[2]) &&
               (!sel[3] || v.option3 === sel[3]);
      });
      return match || variants[0];
    }

    function getRequiredPhotoCount(v) {
      if (!v) return 1;
      // Server-computed value wins
      if (typeof v.photos_required === 'number' && v.photos_required > 0) {
        return v.photos_required;
      }
      // Fallback: parse leading digit from option1 or title
      var src = (v.option1 || v.title || '').toString();
      var m = src.match(/^\s*(\d+)/);
      return m ? parseInt(m[1], 10) : 1;
    }

    function setStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'pdp-uploader__status' + (type ? ' is-' + type : '');
    }

    function allUploaded() {
      return uploads.length > 0 &&
             uploads.every(function (u) { return u.status === 'done' && u.url; });
    }

    function refreshCTA() {
      if (!currentVariant) return;
      var avail = currentVariant.available !== false;
      if (!avail) {
        ctaEl.setAttribute('disabled', 'true');
        ctaEl.classList.add('is-disabled');
        ctaEl.textContent = 'Sold Out';
        return;
      }
      if (allUploaded()) {
        ctaEl.removeAttribute('disabled');
        ctaEl.classList.remove('is-disabled');
        ctaEl.textContent = 'Add to Cart';
      } else {
        ctaEl.setAttribute('disabled', 'true');
        ctaEl.classList.add('is-disabled');
        var done = uploads.filter(function (u) { return u.status === 'done'; }).length;
        ctaEl.textContent = 'Upload Photos (' + done + '/' + uploads.length + ')';
      }
    }

    // ─── Render slots ─────────────────────────────────────
    function renderSlots() {
      var n = getRequiredPhotoCount(currentVariant);
      uploads = new Array(n).fill(null).map(function () {
        return { status: 'idle', url: '', file: null, progress: 0 };
      });
      slotsEl.innerHTML = '';

      var hint = document.createElement('p');
      hint.className = 'pdp-uploader__hint';
      hint.textContent = n === 1
        ? '📸 Upload 1 photo to customize this item.'
        : '📸 Upload ' + n + ' photos — one for each magnet.';
      slotsEl.appendChild(hint);

      var grid = document.createElement('div');
      grid.className = 'pdp-uploader__grid';
      grid.style.setProperty('--cols', Math.min(n, 3));

      for (var i = 0; i < n; i++) {
        grid.appendChild(buildSlot(i));
      }
      slotsEl.appendChild(grid);
      refreshCTA();
    }

    function buildSlot(idx) {
      var slot = document.createElement('div');
      slot.className = 'pdp-uploader__slot';
      if (getCropConfig().shape === 'circle') {
        slot.classList.add('is-circle-preview');
      }
      slot.setAttribute('data-slot', idx);
      slot.innerHTML =
        '<input type="file" accept="image/*" hidden>' +
        '<div class="pdp-uploader__slot-inner">' +
          '<div class="pdp-uploader__slot-preview" aria-hidden="true">' +
            '<span class="pdp-uploader__plus">+</span>' +
          '</div>' +
          '<div class="pdp-uploader__slot-meta">' +
            '<span class="pdp-uploader__slot-label">Photo ' + (idx + 1) + '</span>' +
            '<span class="pdp-uploader__slot-state">Tap to choose</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="pdp-uploader__slot-edit" aria-label="Edit crop" title="Edit crop">✎</button>' +
        '<button type="button" class="pdp-uploader__slot-remove" aria-label="Remove photo" hidden>×</button>';

      var input = slot.querySelector('input');
      var removeBtn = slot.querySelector('.pdp-uploader__slot-remove');
      var editBtn = slot.querySelector('.pdp-uploader__slot-edit');
      var inner = slot.querySelector('.pdp-uploader__slot-inner');

      // Tap the slot area (inner) to open file picker
      inner.addEventListener('click', function () { input.click(); });

      input.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) handleFile(idx, f, slot);
      });

      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearSlot(idx, slot);
      });

      editBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var orig = uploads[idx] && uploads[idx].originalFile;
        if (orig) handleFile(idx, orig, slot);
      });

      return slot;
    }

    function setSlotState(slot, label, state, previewSrc) {
      var meta = slot.querySelector('.pdp-uploader__slot-state');
      var preview = slot.querySelector('.pdp-uploader__slot-preview');
      var removeBtn = slot.querySelector('.pdp-uploader__slot-remove');
      slot.setAttribute('data-state', state);
      if (meta) meta.textContent = label;
      if (preview) {
        if (previewSrc) {
          preview.style.backgroundImage = 'url(' + previewSrc + ')';
          preview.classList.add('has-image');
        } else {
          preview.style.backgroundImage = '';
          preview.classList.remove('has-image');
        }
      }
      if (removeBtn) {
        if (state === 'done' || state === 'error') removeBtn.removeAttribute('hidden');
        else removeBtn.setAttribute('hidden', '');
      }
    }

    function clearSlot(idx, slot) {
      uploads[idx] = { status: 'idle', url: '', file: null, progress: 0 };
      var input = slot.querySelector('input');
      if (input) input.value = '';
      setSlotState(slot, 'Tap to choose', 'idle', '');
      refreshCTA();
    }

    function handleFile(idx, file, slot) {
      // Validate
      if (cfg.acceptedTypes && cfg.acceptedTypes.indexOf(file.type) === -1 &&
          !/^image\//.test(file.type)) {
        setSlotState(slot, 'Image files only', 'error', '');
        uploads[idx] = { status: 'error', url: '', file: null, originalFile: null, progress: 0 };
        refreshCTA();
        return;
      }
      if (cfg.maxFileBytes && file.size > cfg.maxFileBytes) {
        var mb = (cfg.maxFileBytes / 1024 / 1024).toFixed(0);
        setSlotState(slot, 'Too large (max ' + mb + 'MB)', 'error', '');
        uploads[idx] = { status: 'error', url: '', file: null, originalFile: null, progress: 0 };
        refreshCTA();
        return;
      }

      // Open crop modal if MackCrop is available
      if (window.MackCrop && typeof window.MackCrop.open === 'function') {
        var cropCfg = getCropConfig();
        cropCfg.title = 'Crop Photo ' + (idx + 1);
        setSlotState(slot, 'Cropping…', 'uploading', '');

        MackCrop.open(file, cropCfg, function (blob, previewUrl) {
          if (!blob) {
            // User cancelled crop
            if (!uploads[idx] || !uploads[idx].url) {
              clearSlot(idx, slot);
            }
            return;
          }
          // Show cropped preview and upload
          setSlotState(slot, 'Uploading…', 'uploading', previewUrl);
          uploads[idx] = { status: 'uploading', url: '', file: blob, originalFile: file, progress: 0 };
          refreshCTA();

          uploadToWorker(blob, function (pct) {
            var s = slot.querySelector('.pdp-uploader__slot-state');
            if (s) s.textContent = 'Uploading… ' + pct + '%';
          }).then(function (url) {
            uploads[idx] = { status: 'done', url: url, file: blob, originalFile: file, progress: 100 };
            setSlotState(slot, 'Ready ✓', 'done', previewUrl);
            refreshCTA();
          }).catch(function (err) {
            console.error('Upload failed', err);
            uploads[idx] = { status: 'error', url: '', file: null, originalFile: file, progress: 0 };
            setSlotState(slot, 'Upload failed — tap to retry', 'error', '');
            refreshCTA();
          });
        });
      } else {
        // Fallback: no crop, upload original directly
        var reader = new FileReader();
        reader.onload = function (e) {
          setSlotState(slot, 'Uploading…', 'uploading', e.target.result);
        };
        reader.readAsDataURL(file);

        uploads[idx] = { status: 'uploading', url: '', file: file, originalFile: file, progress: 0 };
        refreshCTA();

        uploadToWorker(file, function (pct) {
          var s = slot.querySelector('.pdp-uploader__slot-state');
          if (s) s.textContent = 'Uploading… ' + pct + '%';
        }).then(function (url) {
          uploads[idx] = { status: 'done', url: url, file: file, originalFile: file, progress: 100 };
          setSlotState(slot, 'Ready ✓', 'done', url);
          refreshCTA();
        }).catch(function (err) {
          console.error('Upload failed', err);
          uploads[idx] = { status: 'error', url: '', file: null, originalFile: null, progress: 0 };
          setSlotState(slot, 'Upload failed — tap to retry', 'error', '');
          refreshCTA();
        });
      }
    }

    function uploadToWorker(file, onProgress) {
      return new Promise(function (resolve, reject) {
        var fd = new FormData();
        fd.append('file', file, file.name);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', cfg.endpoint);

        xhr.upload.addEventListener('progress', function (e) {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var json = JSON.parse(xhr.responseText);
              if (json && json.url) resolve(json.url);
              else reject(new Error(json && json.error || 'No url in response'));
            } catch (e) { reject(e); }
          } else {
            var msg = 'HTTP ' + xhr.status;
            try { var j = JSON.parse(xhr.responseText); if (j.error) msg += ': ' + j.error; }
            catch (_) {}
            reject(new Error(msg));
          }
        });
        xhr.addEventListener('error', function () { reject(new Error('Network error')); });
        xhr.send(fd);
      });
    }

    // ─── React to variant changes ────────────────────────
    document.querySelectorAll('.pdp-option-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        // Defer: main.js handler updates aria-pressed first
        setTimeout(function () {
          var newV = findCurrentVariant();
          var oldCount = uploads.length;
          var newCount = getRequiredPhotoCount(newV);
          currentVariant = newV;
          if (oldCount !== newCount) {
            renderSlots();
          } else {
            refreshCTA();
          }
        }, 0);
      });
    });

    // ─── Add to cart ─────────────────────────────────────
    ctaEl.addEventListener('click', function (e) {
      e.preventDefault();
      if (ctaEl.hasAttribute('disabled')) return;
      if (!allUploaded()) {
        setStatus('Please upload all photos first.', 'error');
        return;
      }
      var attrs = uploads.map(function (u, i) {
        return { key: 'Photo ' + (i + 1), value: u.url };
      });
      attrs.push({ key: '_uploader', value: 'mackmagnets-onsite' });

      ctaEl.setAttribute('disabled', 'true');
      ctaEl.textContent = 'Adding to cart…';
      setStatus('');

      var promise;
      if (window.MackCart && typeof window.MackCart.addToCart === 'function') {
        promise = window.MackCart.addToCart(currentVariant.id, 1, attrs);
      } else {
        promise = Promise.reject(new Error('Cart not initialized'));
      }

      promise.then(function () {
        // Reset slots for next add
        renderSlots();
        setStatus('Added to cart ✓', 'success');
      }).catch(function (err) {
        console.error(err);
        setStatus('Could not add to cart. Please try again.', 'error');
        ctaEl.removeAttribute('disabled');
        ctaEl.textContent = 'Add to Cart';
      });
    });

    // ─── Init ────────────────────────────────────────────
    renderSlots();
  });
})();
