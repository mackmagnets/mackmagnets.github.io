/**
 * Mack Magnets — Photo Crop Modal (Cropper.js wrapper)
 * Built by AjayaDesign
 *
 * Usage:
 *   MackCrop.open(file, { aspectRatio: 1, shape: 'circle', title: 'Photo 1' }, function(blob, previewUrl) { ... })
 *   callback(null) if user cancels.
 */
(function () {
  'use strict';

  var modal, imgEl, cropper, currentCallback;
  var MAX_CANVAS = 2000;
  var baseAspectRatio, currentAspectRatio, currentOpts;

  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'mack-crop-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Crop photo');
    modal.innerHTML =
      '<div class="mack-crop-modal__backdrop"></div>' +
      '<div class="mack-crop-modal__content">' +
        '<div class="mack-crop-modal__header">' +
          '<span class="mack-crop-modal__title">Crop Photo</span>' +
          '<button type="button" class="mack-crop-modal__close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="mack-crop-modal__body">' +
          '<div class="mack-crop-modal__canvas-wrap">' +
            '<img class="mack-crop-modal__image" alt="Crop preview">' +
          '</div>' +
        '</div>' +
        '<div class="mack-crop-modal__controls">' +
          '<div class="mack-crop-modal__actions-left">' +
            '<button type="button" class="mack-crop-modal__btn mack-crop-modal__btn--icon" data-action="flip-orientation" aria-label="Switch landscape/portrait" title="Switch landscape/portrait">⟲</button>' +
            '<button type="button" class="mack-crop-modal__btn mack-crop-modal__btn--icon" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>' +
            '<button type="button" class="mack-crop-modal__btn mack-crop-modal__btn--icon" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>' +
          '</div>' +
          '<div class="mack-crop-modal__actions-right">' +
            '<button type="button" class="mack-crop-modal__btn mack-crop-modal__btn--cancel" data-action="cancel">Cancel</button>' +
            '<button type="button" class="mack-crop-modal__btn mack-crop-modal__btn--apply" data-action="apply">Apply Crop</button>' +
          '</div>' +
        '</div>' +
        '<div class="mack-crop-modal__warning" hidden>' +
          '⚠️ Low resolution — may appear blurry when printed' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    imgEl = modal.querySelector('.mack-crop-modal__image');

    // Event delegation
    modal.addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-action') ||
                   (e.target.parentElement && e.target.parentElement.getAttribute('data-action'));
      if (e.target.classList.contains('mack-crop-modal__backdrop') ||
          e.target.classList.contains('mack-crop-modal__close')) {
        action = 'cancel';
      }
      if (!action || !cropper) return;

      switch (action) {
        case 'flip-orientation': flipOrientation(); break;
        case 'zoom-in':      cropper.zoom(0.1); break;
        case 'zoom-out':     cropper.zoom(-0.1); break;
        case 'cancel':       close(null); break;
        case 'apply':        applyCrop(); break;
      }
    });

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        close(null);
      }
    });
  }

  function open(file, opts, callback) {
    buildModal();
    currentCallback = callback;
    currentOpts = opts;
    var title = opts.title || 'Crop Photo';
    modal.querySelector('.mack-crop-modal__title').textContent = title;

    // Circle mask
    var wrap = modal.querySelector('.mack-crop-modal__canvas-wrap');
    if (opts.shape === 'circle') {
      wrap.classList.add('is-circle');
    } else {
      wrap.classList.remove('is-circle');
    }

    // Store base aspect ratio
    baseAspectRatio = opts.aspectRatio || NaN;

    // Show/hide flip button — only useful for non-square, fixed ratios
    var flipBtn = modal.querySelector('[data-action="flip-orientation"]');
    if (flipBtn) {
      flipBtn.style.display = (baseAspectRatio && baseAspectRatio !== 1) ? '' : 'none';
    }

    // Hide warning
    modal.querySelector('.mack-crop-modal__warning').hidden = true;

    // Load image
    var reader = new FileReader();
    reader.onload = function (e) {
      imgEl.src = e.target.result;
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';

      // Destroy previous instance
      if (cropper) { cropper.destroy(); cropper = null; }

      // Auto-detect: if image is landscape and ratio is portrait (< 1), flip it
      var img = new Image();
      img.onload = function () {
        var imgIsLandscape = img.naturalWidth > img.naturalHeight;
        var ratioIsPortrait = baseAspectRatio && baseAspectRatio < 1;
        var ratioIsLandscape = baseAspectRatio && baseAspectRatio > 1;

        if ((imgIsLandscape && ratioIsPortrait) || (!imgIsLandscape && ratioIsLandscape)) {
          currentAspectRatio = 1 / baseAspectRatio;
        } else {
          currentAspectRatio = baseAspectRatio;
        }

        initCropper();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function initCropper() {
    if (cropper) { cropper.destroy(); cropper = null; }

    cropper = new Cropper(imgEl, {
      aspectRatio: currentAspectRatio || NaN,
      viewMode: 0,
      dragMode: 'move',
      autoCropArea: 1,
      responsive: true,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: !currentAspectRatio, // locked if ratio set
      toggleDragModeOnDblclick: false,
      minContainerWidth: 300,
      minContainerHeight: 300,
      minCropBoxWidth: 50,
      minCropBoxHeight: 50,
      ready: function () {
        checkResolution();
      },
      cropend: function () {
        checkResolution();
      }
    });
  }

  function flipOrientation() {
    if (!cropper || !currentAspectRatio || currentAspectRatio === 1) return;
    currentAspectRatio = 1 / currentAspectRatio;
    initCropper();
  }

  function checkResolution() {
    if (!cropper) return;
    var data = cropper.getCropBoxData();
    var imageData = cropper.getImageData();
    var warnEl = modal.querySelector('.mack-crop-modal__warning');
    // Estimate actual pixel coverage
    var canvasData = cropper.getCanvasData();
    var scaleX = imageData.naturalWidth / canvasData.width;
    var scaleY = imageData.naturalHeight / canvasData.height;
    var cropW = data.width * scaleX;
    var cropH = data.height * scaleY;
    if (cropW < 600 || cropH < 600) {
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  }

  function applyCrop() {
    if (!cropper) return;
    var canvas = cropper.getCroppedCanvas({
      maxWidth: MAX_CANVAS,
      maxHeight: MAX_CANVAS,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    if (!canvas) { close(null); return; }

    var previewUrl = canvas.toDataURL('image/jpeg', 0.85);

    canvas.toBlob(function (blob) {
      close({ blob: blob, previewUrl: previewUrl });
    }, 'image/jpeg', 0.92);
  }

  function close(result) {
    if (cropper) { cropper.destroy(); cropper = null; }
    if (modal) {
      modal.classList.remove('is-open');
    }
    document.body.style.overflow = '';
    if (currentCallback) {
      var cb = currentCallback;
      currentCallback = null;
      if (result) {
        cb(result.blob, result.previewUrl);
      } else {
        cb(null);
      }
    }
  }

  window.MackCrop = { open: open };
})();
