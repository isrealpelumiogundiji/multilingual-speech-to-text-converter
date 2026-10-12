(function () {
  const WHATSAPP_NUMBER = "+12723470487";
  const SUPPORT_EMAIL = "voxa.technology@gmail.com";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  const wrap = el("div", {
    id: "supportBubblesWrap",
    style: {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      alignItems: "flex-end"
    }
  });

  function makeBubble({ label, bg, fg, onClick, sub }) {
    const btn = el("button", {
      type: "button",
      style: {
        border: "none",
        cursor: "pointer",
        borderRadius: "999px",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: bg,
        color: fg,
        fontWeight: "750",
        boxShadow: "0 10px 25px rgba(0,0,0,.25)"
      },
      onclick: onClick
    });

    const dot = el("span", {
      style: {
        width: "10px",
        height: "10px",
        borderRadius: "999px",
        background: "rgba(255,255,255,.85)"
      }
    });

    const textWrap = el("span", { style: { display: "flex", flexDirection: "column", lineHeight: "1.1" } }, [
      el("span", {}, [label]),
      el("span", { style: { fontSize: "12px", opacity: "0.9", fontWeight: "600" } }, [sub])
    ]);

    btn.appendChild(dot);
    btn.appendChild(textWrap);

    // Extra safety: also bind click listener (some browsers can be weird with attribute onclick)
    if (typeof onClick === "function") {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    }

    return btn;
  }

  const wa = makeBubble({
    label: "WhatsApp support",
    sub: "Chat with us",
    bg: "#25D366",
    fg: "#0b1220",
    onClick: () => {
      const txt = encodeURIComponent("Hello Voxa support, I need help.");
      const url = `https://wa.me/${WHATSAPP_NUMBER.replace("+", "")}?text=${txt}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  function openEmailSupport() {
    const subject = encodeURIComponent("Voxa Support");
    const body = encodeURIComponent("Hello Voxa support,\n\nI need help with:\n\n");

    // 1) Try mailto (native mail app or browser handler)
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;

    // 2) Fallback: open Gmail compose after a short delay
    // This helps when mailto is blocked or no mail app is configured
    setTimeout(() => {
      const gmailComposeUrl =
        `https://mail.google.com/mail/?view=cm&fs=1` +
        `&to=${encodeURIComponent(SUPPORT_EMAIL)}` +
        `&su=${subject}` +
        `&body=${body}`;

      window.open(gmailComposeUrl, "_blank", "noopener,noreferrer");
    }, 400);
  }

  const email = makeBubble({
    label: "Email support",
    sub: "Send us a message",
    bg: "#e8eefc",
    fg: "#0b1220",
    onClick: () => {
      openEmailSupport();
    }
  });

  wrap.appendChild(wa);
  wrap.appendChild(email);
  document.body.appendChild(wrap);
})();