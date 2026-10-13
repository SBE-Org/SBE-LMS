// Shaggar BPO Academy — small progressive enhancements. Every page works without JavaScript.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Mobile navigation
  $$('[data-toggle-nav]').forEach(function (el) {
    el.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  });

  // Dismiss flash messages
  $$('.flash-close').forEach(function (b) {
    b.addEventListener('click', function () { b.parentNode.remove(); });
  });

  // Confirm before destructive actions
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) { e.preventDefault(); }
    });
  });

  // Auto-submit filter selects
  $$('select[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  // Show fields only for certain types (lesson type, question type)
  function bindShowFor(selectSel, scope) {
    var select = $(selectSel, scope);
    if (!select) return;
    var update = function () {
      $$('[data-show-for]', scope).forEach(function (el) {
        var on = el.getAttribute('data-show-for').split(' ').indexOf(select.value) !== -1;
        el.hidden = !on;
        $$('input, select, textarea', el).forEach(function (i) { i.disabled = !on; });
      });
    };
    select.addEventListener('change', update);
    update();
  }
  var lf = $('[data-lesson-form]'); if (lf) bindShowFor('[data-lesson-type]', lf);
  var qf = $('[data-question-form]');
  if (qf) {
    bindShowFor('[data-question-type]', qf);
    var typeSel = $('[data-question-type]', qf);
    // Single-answer questions: ticking one option unticks the others
    qf.addEventListener('change', function (e) {
      if (e.target.name === 'correct[]' && e.target.checked && typeSel.value === 'single') {
        $$('input[name="correct[]"]', qf).forEach(function (c) { if (c !== e.target) c.checked = false; });
      }
    });
    var add = $('[data-add-choice]', qf);
    if (add) add.addEventListener('click', function () {
      var rows = $('[data-choice-rows]', qf);
      var n = $$('.choice-row', rows).length;
      if (n >= 10) return;
      var row = document.createElement('div');
      row.className = 'choice-row';
      row.innerHTML = '<input type="checkbox" name="correct[]" value="' + n + '" aria-label="Correct answer"><input name="choice[' + n + ']" placeholder="Option ' + (n + 1) + '" maxlength="500">';
      rows.appendChild(row);
      row.querySelector('input[name^="choice"]').focus();
    });
  }

  // Filter a long <select multiple> by typed text
  $$('[data-filter-select]').forEach(function (input) {
    var select = document.getElementById(input.getAttribute('data-filter-select'));
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase();
      $$('option', select).forEach(function (o) {
        var group = o.parentNode.label || '';
        o.hidden = q && (o.textContent + ' ' + group).toLowerCase().indexOf(q) === -1;
      });
    });
  });

  // Quiz: answered counter, unanswered warning, countdown timer, leave-page warning
  var quiz = $('[data-quiz-form]');
  if (quiz) {
    var total = parseInt(quiz.getAttribute('data-total'), 10);
    var counter = $('[data-answered]');
    var dirty = false, submitting = false;
    var answered = function () {
      return $$('[data-question]', quiz).filter(function (q) { return $('input:checked', q); }).length;
    };
    quiz.addEventListener('change', function () { dirty = true; if (counter) counter.textContent = answered(); });
    quiz.addEventListener('submit', function (e) {
      var left = total - answered();
      if (!quiz.dataset.force && left > 0 && !window.confirm(left + ' question' + (left === 1 ? ' is' : 's are') + ' not answered. Submit anyway?')) {
        e.preventDefault();
        return;
      }
      submitting = true;
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty && !submitting) { e.preventDefault(); e.returnValue = ''; }
    });

    var timer = $('[data-timer]');
    if (timer) {
      var end = Date.now() + parseInt(timer.getAttribute('data-timer'), 10) * 1000;
      var text = $('[data-timer-text]', timer);
      var tick = function () {
        var s = Math.max(0, Math.round((end - Date.now()) / 1000));
        var m = Math.floor(s / 60), r = s % 60;
        text.textContent = (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
        if (s <= 60) timer.classList.add('is-low');
        if (s === 60) timer.setAttribute('aria-live', 'assertive');
        if (s <= 0) {
          clearInterval(iv);
          quiz.dataset.force = '1';
          submitting = true;
          quiz.requestSubmit ? quiz.requestSubmit() : quiz.submit();
        }
      };
      var iv = setInterval(tick, 1000);
      tick();
    }
  }

  // Click a column header to sort tables marked data-sortable
  $$('table[data-sortable]').forEach(function (table) {
    $$('th', table).forEach(function (th, idx) {
      th.setAttribute('data-sort', '');
      var asc = true;
      th.addEventListener('click', function () {
        var body = table.tBodies[0];
        var rows = $$('tr', body);
        var val = function (r) {
          var t = (r.cells[idx] ? r.cells[idx].textContent : '').trim();
          var n = parseFloat(t.replace(/[^\d.\-]/g, ''));
          return /^[\d.\-]/.test(t) && !isNaN(n) ? n : t.toLowerCase();
        };
        rows.sort(function (a, b) {
          var x = val(a), y = val(b);
          return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1);
        });
        asc = !asc;
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  });
})();
