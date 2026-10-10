/*! SupportAI embeddable chat widget. Usage:
 *  <script src="https://YOUR-HOST/widget.js" data-bot-id="bot_xxx" async></script>
 */
(function () {
  if (window.__supportaiLoaded) return;
  window.__supportaiLoaded = true;

  var script = document.currentScript || document.querySelector("script[data-bot-id]");
  if (!script) return;
  var botId = script.getAttribute("data-bot-id");
  var origin = new URL(script.src, location.href).origin;
  var API = origin + "/api/public/" + encodeURIComponent(botId);

  var sessionKey = "supportai_session_" + botId;
  var session;
  try { session = localStorage.getItem(sessionKey); } catch (e) {}
  if (!session) {
    session = "w" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { localStorage.setItem(sessionKey, session); } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  fetch(API + "/config").then(function (r) { return r.json(); }).then(function (cfg) {
    if (!cfg.bot_name) return;
    init(cfg);
  }).catch(function () {});

  function init(cfg) {
    var color = cfg.brand_color || "#2563eb";
    var host = document.createElement("div");
    host.id = "supportai-root";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483000;bottom:0;right:0;";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    root.innerHTML =
      '<style>' +
      ':host{all:initial}*{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.launcher{position:fixed;right:22px;bottom:22px;width:62px;height:62px;border-radius:50%;border:1px solid rgba(255,255,255,.45);cursor:pointer;' +
      'background:' + color + ';box-shadow:0 8px 22px ' + color + '66;' +
      'display:flex;align-items:center;justify-content:center;transition:transform .2s}' +
      '.launcher:hover{transform:scale(1.07)}.launcher svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.panel{position:fixed;right:22px;bottom:100px;width:380px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);display:none;flex-direction:column;overflow:hidden;' +
      'border-radius:22px;background:#fff;' +
      'border:1px solid #e2e8f0;box-shadow:0 20px 50px rgba(15,23,42,.2);color:#0f172a;animation:pop .22s ease}' +
      '.panel.open{display:flex}@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}' +
      '.head{padding:16px 18px;color:#fff;display:flex;align-items:center;gap:12px;background:' + color + '}' +
      '.avatar{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:700;border:1px solid rgba(255,255,255,.35)}' +
      '.head b{display:block;font-size:15px}.head small{opacity:.85;font-size:12px;display:flex;align-items:center;gap:6px}' +
      '.dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}' +
      '.x{margin-left:auto;background:rgba(255,255,255,.18);border:0;color:#fff;width:30px;height:30px;border-radius:10px;cursor:pointer;font-size:16px}' +
      '.msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}' +
      '.m{max-width:86%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}' +
      '.m.bot{background:#f1f5f9;border:1px solid #e2e8f0;align-self:flex-start;border-bottom-left-radius:5px;}' +
      '.m.me{background:' + color + ';color:#fff;align-self:flex-end;border-bottom-right-radius:5px}' +
      '.src{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}' +
      '.chip{font-size:11px;padding:3px 9px;border-radius:999px;background:' + color + '1a;color:' + shade(color, -50) + ';border:1px solid ' + color + '33;cursor:pointer}' +
      '.snip{margin-top:6px;font-size:12px;color:#475569;background:rgba(241,245,249,.9);border-left:3px solid ' + color + ';padding:6px 9px;border-radius:6px;white-space:normal}' +
      '.fb{display:flex;gap:6px;margin-top:8px}.fb button{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:2px 8px;cursor:pointer;font-size:13px}' +
      '.fb button.on{background:' + color + '22;border-color:' + color + '}' +
      '.cta{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}.btn{border:0;border-radius:10px;padding:8px 12px;font-size:13px;cursor:pointer;font-weight:600;color:#fff;background:' + color + '}' +
      '.btn.ghost{background:#fff;color:#334155;border:1px solid #e2e8f0}' +
      '.typing{display:flex;gap:4px;padding:4px 2px}.typing i{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:b 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}' +
      '@keyframes b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}' +
      '.form{display:flex;flex-direction:column;gap:8px;margin-top:10px}.form input,.form textarea{border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;background:#fff;width:100%;outline:none;font-family:inherit}' +
      '.sugg{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px}.sugg button{border:1px solid ' + color + '44;background:rgba(255,255,255,.7);color:#334155;border-radius:999px;font-size:12px;padding:5px 11px;cursor:pointer}' +
      '.bar{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(148,163,184,.25);background:rgba(255,255,255,.5)}' +
      '.bar input{flex:1;border:1px solid rgba(148,163,184,.4);background:rgba(255,255,255,.9);border-radius:14px;padding:11px 14px;font-size:14px;outline:none}' +
      '.bar input:focus{border-color:' + color + '}.bar button{width:44px;border:0;border-radius:14px;background:' + color + ';cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.bar svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
      '.foot{text-align:center;font-size:10.5px;color:#64748b;padding:0 0 8px}' +
      '</style>' +
      '<button class="launcher" aria-label="Open chat"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg></button>' +
      '<section class="panel" role="dialog" aria-label="Chat">' +
      '<div class="head"><div class="avatar">' + esc((cfg.bot_name || "S").charAt(0).toUpperCase()) + '</div>' +
      '<div><b>' + esc(cfg.bot_name) + '</b><small><span class="dot"></span>Answers from ' + esc(cfg.name) + ' docs</small></div><button class="x" aria-label="Close">&#10005;</button></div>' +
      '<div class="msgs"></div><div class="sugg"></div>' +
      '<form class="bar"><input placeholder="Type your question..." maxlength="1000" /><button aria-label="Send"><svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button></form>' +
      '<div class="foot">Powered by SupportAI &middot; answers cite their sources</div></section>';

    var panel = root.querySelector(".panel"),
      msgs = root.querySelector(".msgs"),
      input = root.querySelector(".bar input"),
      sugg = root.querySelector(".sugg");

    function scroll() { msgs.scrollTop = msgs.scrollHeight; }
    function add(html, cls) {
      var d = document.createElement("div");
      d.className = "m " + cls;
      d.innerHTML = html;
      msgs.appendChild(d);
      scroll();
      return d;
    }

    add(esc(cfg.welcome), "bot");
    root.querySelector(".launcher").onclick = function () {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) input.focus();
    };
    root.querySelector(".x").onclick = function () { panel.classList.remove("open"); };

    function renderBot(res) {
      var el = add("", "bot");
      var html = esc(res.answer);
      if (res.citations && res.citations.length) {
        html += '<div class="src">' + res.citations.map(function (c, i) {
          var label = c.doc + (c.page ? " · p." + c.page : "") + (c.section ? " · " + c.section : "");
          return '<span class="chip" data-i="' + i + '" title="Show source">' + (i + 1) + " &middot; " + esc(label) + "</span>";
        }).join("") + "</div><div class=\"snipbox\"></div>";
      }
      if (res.message_id && res.answered) {
        html += '<div class="fb"><button data-v="1" title="Helpful">&#128077;</button><button data-v="-1" title="Not helpful">&#128078;</button></div>';
      }
      if (res.escalate) {
        html += '<div class="cta"><button class="btn" data-act="human">Talk to a human</button></div><div class="formbox"></div>';
      }
      el.innerHTML = html;

      el.querySelectorAll(".chip").forEach(function (chip) {
        chip.onclick = function () {
          var c = res.citations[+chip.getAttribute("data-i")];
          el.querySelector(".snipbox").innerHTML = '<div class="snip">&ldquo;' + esc(c.snippet) + "&rdquo;</div>";
          scroll();
        };
      });
      el.querySelectorAll(".fb button").forEach(function (b) {
        b.onclick = function () {
          el.querySelectorAll(".fb button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          fetch(API + "/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message_id: res.message_id, value: +b.getAttribute("data-v") }) });
        };
      });
      var human = el.querySelector('[data-act="human"]');
      if (human) human.onclick = function () {
        human.style.display = "none";
        var box = el.querySelector(".formbox");
        box.innerHTML = '<div class="form"><input class="n" placeholder="Your name" /><input class="e" type="email" placeholder="Your email" />' +
          '<textarea class="t" rows="2" placeholder="Anything we should know?"></textarea><button class="btn">Send to support</button></div>';
        box.querySelector(".btn").onclick = function () {
          var email = box.querySelector(".e").value.trim();
          if (!email) { box.querySelector(".e").style.borderColor = "#ef4444"; return; }
          fetch(API + "/handoff", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: session, name: box.querySelector(".n").value, email: email, message: box.querySelector(".t").value }) })
            .then(function () { box.innerHTML = '<div style="margin-top:8px">✅ Thanks! Our team will email you at <b>' + esc(email) + "</b> soon.</div>"; });
        };
        scroll();
      };
    }

    var busy = false;
    function send(text) {
      if (busy || !text.trim()) return;
      busy = true;
      sugg.innerHTML = "";
      add(esc(text), "me");
      var t = add('<div class="typing"><i></i><i></i><i></i></div>', "bot");
      fetch(API + "/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: session }) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (res) { t.remove(); renderBot(res); })
        .catch(function () { t.remove(); add("Sorry, something went wrong. Please try again in a moment.", "bot"); })
        .finally(function () { busy = false; });
    }
    root.querySelector(".bar").onsubmit = function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = "";
      send(v);
    };
  }
})();
