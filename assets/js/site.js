/* QuickEasy Software — site interactions (standard JS, no dependencies) */
(function () {
  "use strict";

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  // On mobile, tapping a parent item opens its submenu instead of navigating
  document.querySelectorAll(".nav .has-menu > a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (window.matchMedia("(max-width:1040px)").matches) {
        e.preventDefault();
        a.parentElement.classList.toggle("open");
      }
    });
  });
  // Close menu when a real link is tapped
  document.querySelectorAll(".nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (!a.parentElement.classList.contains("has-menu")) {
        document.body.classList.remove("nav-open");
      }
    });
  });

  /* ---------- Contact form (per contact-form-integration skill) ---------- */
  // TODO: set this to the relay endpoint given to you by the relay operator.
  var RELAY_URL = "";                       // <-- fill in the relay API URL
  var SITE_NAME = "quickeasysoftware.com";

  // Live site mails info@quickeasysoftware.com; anywhere else (localhost,
  // staging, preview) mails the test inbox so testing never hits the live one.
  function recipientFor() {
    // Temporary: send everything to the test inbox for now.
    return "info@vibecraftedsoftware.com";
    // Live/test switch (restore when going live):
    // var h = location.hostname;
    // if (h === "quickeasysoftware.com" || h === "www.quickeasysoftware.com") return "info@quickeasysoftware.com";
    // return "info@vibecraftedsoftware.com";
  }

  document.querySelectorAll("form.contact-form").forEach(function (form) {
    var statusEl = form.querySelector(".form-status");
    var submitBtn = form.querySelector('button[type="submit"]');
    var defaultLabel = submitBtn ? submitBtn.textContent : "Send";

    function setStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = "form-status is-" + type;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Honeypot — real users never fill this.
      if (form.elements["hp_field"] && form.elements["hp_field"].value) return;

      var el = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ""; };
      var name = el("name"), email = el("email"), phone = el("phone"), message = el("message");

      if (!name || !email || !message) {
        setStatus("Please fill in your name, email, and message.", "error");
        return;
      }

      var body = message + (phone ? "\n\nPhone: " + phone : "");
      var payload = {
        site: SITE_NAME,
        recipient: recipientFor(),
        name: name,
        email: email,
        message: body,
        turnstileToken: window.turnstile ? window.turnstile.getResponse() : ""
      };

      if (!RELAY_URL) {
        setStatus("This form isn't connected yet. Please email info@quickeasysoftware.com.", "error");
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
      setStatus("", "");

      fetch(RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) { if (!r.ok) throw new Error("failed"); return r.json().catch(function(){return {};}); })
        .then(function () {
          setStatus("Thanks — your message is on its way.", "success");
          form.reset();
          if (window.turnstile) window.turnstile.reset();
        })
        .catch(function () {
          setStatus("Something went wrong. Please try again, or email info@quickeasysoftware.com.", "error");
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = defaultLabel; }
        });
    });
  });
})();
