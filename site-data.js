(function () {
  "use strict";
  const config = window.ATHEER_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey) return;
  const endpoint = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1`;
  const storageBucket = config.storageBucket || "atheer-media";
  const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` };
  const assetSelectors = {
    hero: [".hero::before"], product: [".product-shot"], offer: [".offer-main-img"],
    "gallery-flatlay": ['img[alt*="الحمضيات"]'], "gallery-room": ['img[alt*="مساحة مغربية"]'],
    "gallery-lantern": ['img[alt*="فانوس"]'], "gallery-zellige": ['img[alt*="زليج"]'],
    "gallery-hero": ['img[alt*="طاولة مغربية"]'], "gallery-gift": ['img[alt*="مجموعة عطر"]'],
    "gallery-closeup": ['img[alt*="تفاصيل"]']
  };
  const contentSelectors = {
    hero_subtitle: "#hero-title small", hero_copy: ".hero-copy",
    offer_subtitle: ".offer-sub", product_name: "#perfume-title", footer_copy: ".footer-copy"
  };
  const html = value => text(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));

  function url(asset) {
    if (asset?.public_url) return asset.public_url;
    const path = String(asset?.storage_path || "");
    if (!path) return "";
    if (/^assets\//i.test(path)) {
      // Auto-fix legacy seed paths: assets/*.webp → assets/webp/*.webp
      if (/^assets\/[^/]+\.webp$/i.test(path)) return path.replace("assets/", "assets/webp/");
      return path;
    }
    return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(storageBucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  function text(value) { return String(value ?? ""); }
  function fetchTable(table, query) {
    return fetch(`${endpoint}/${table}?${query}`, { headers }).then(response => {
      if (!response.ok) throw new Error("content unavailable");
      return response.json();
    });
  }
  function updateAssets(assets) {
    if (!assets.length) return; // don't hide everything when Supabase returns empty
    Object.values(assetSelectors).flat().forEach(selector => {
      if (selector.endsWith("::before")) {
        document.documentElement.style.setProperty("--atheer-hero-image", "none");
        return;
      }
      document.querySelectorAll(selector).forEach(image => {
        image.closest("figure, .experience-image, .offer-img-wrap")?.setAttribute("hidden", "");
      });
    });
    assets.forEach(asset => {
      const imageUrl = url(asset);
      (assetSelectors[asset.asset_key] || []).forEach(selector => {
        if (selector.endsWith("::before")) {
          if (!asset.is_hidden && imageUrl) document.documentElement.style.setProperty("--atheer-hero-image", `url("${imageUrl}")`);
          return;
        }
        document.querySelectorAll(selector).forEach(image => {
          if (!asset.is_hidden && imageUrl) {
            image.closest("figure, .experience-image, .offer-img-wrap")?.removeAttribute("hidden");
            image.src = imageUrl;
            if (asset.alt_text) image.alt = asset.alt_text;
          }
        });
      });
    });
  }
  function updateContent(items) {
    if (!items.length) return; // don't hide everything when Supabase returns empty
    Object.values(contentSelectors).forEach(selector => {
      document.querySelectorAll(selector).forEach(element => element.setAttribute("hidden", ""));
    });
    items.forEach(item => {
      const selector = contentSelectors[item.content_key];
      if (!selector) return;
      document.querySelectorAll(selector).forEach(element => {
        if (!item.is_hidden) {
          element.removeAttribute("hidden");
          element.textContent = text(item.value);
        }
      });
    });
  }
  function productCard(product, asset) {
    const image = html(url(asset) || "assets/webp/atheer-cutout.webp");
    const name = html(product.name);
    const code = html(product.code);
    return `<div class="p-card" data-name="${encodeURIComponent(text(product.name))}" data-num="${code}">
      ${product.is_featured ? '<span class="p-card-badge">مميز</span>' : ""}
      <div class="p-card-check">✓</div><span class="p-card-num">${code}</span>
      <img class="p-card-img" src="${image}" alt="${name}" loading="lazy"/>
      <span class="p-card-name">${name}</span></div>`;
  }
  function renderProducts(products, assets) {
    if (!products.length) return; // don't wipe grids when Supabase returns empty
    window.__atheerSyncDone = true; // signal that real data is loaded
    const assetMap = Object.fromEntries(assets.map(asset => [asset.asset_key, asset]));
    const groups = { femme: document.getElementById("grid-femme"), homme: document.getElementById("grid-homme") };
    Object.entries(groups).forEach(([gender, grid]) => {
      if (!grid) return;
      grid.innerHTML = products.filter(product => product.gender === gender).slice(0, 10)
        .map(product => productCard(product, assetMap[product.image_asset_key])).join("");
    });
    const lists = { femme: document.getElementById("fl-femme"), homme: document.getElementById("fl-homme") };
    Object.entries(lists).forEach(([gender, list]) => {
      if (!list) return;
      list.innerHTML = products.filter(product => product.gender === gender).map(product =>
        `<li class="fl-item" data-name="${encodeURIComponent(text(product.name))}" data-num="${html(product.code)}"><span>${html(product.code)}</span>${html(product.name)}</li>`).join("");
    });
    document.querySelector(".vfl-label")?.replaceChildren(`${products.length} عطراً في المجموع · نسائي ورجالي`);
    document.querySelectorAll(".p-card, .fl-item").forEach(item => item.addEventListener("click", () => {
      const name = decodeURIComponent(item.dataset.name || "");
      const num = item.dataset.num;
      document.dispatchEvent(new CustomEvent("atheer:select-product", { detail: { name, num } }));
    }));
  }
  function updateSettings(settings) {
    window.ATHEER_SETTINGS = Object.fromEntries(settings.map(item => [item.setting_key, item.value]));
    document.dispatchEvent(new CustomEvent("atheer:settings-updated", { detail: window.ATHEER_SETTINGS }));
    const delivery = window.ATHEER_SETTINGS.delivery_text;
    const price = window.ATHEER_SETTINGS.bundle_price;
    if (delivery) document.querySelectorAll(".hero-delivery-badge, .offer-price-unit small").forEach(element => element.textContent = delivery);
    if (price) document.querySelectorAll(".offer-price-num").forEach(element => element.textContent = price);
  }
  function updateTheme(settings) {
    const theme = Object.fromEntries(settings.filter(item => item.setting_key.startsWith("theme_")).map(item => [item.setting_key, item.value]));
    const root = document.documentElement;
    const variables = {
      theme_bg: "--ink",
      theme_surface: "--ink-card",
      theme_text: "--cream",
      theme_muted: "--muted",
      theme_accent: "--gold",
      theme_accent_light: "--gold-light",
      theme_jade: "--jade",
      theme_radius: "--radius"
    };
    Object.entries(variables).forEach(([setting, variable]) => {
      if (theme[setting]) root.style.setProperty(variable, theme[setting]);
    });
  }
  async function sync() {
    try {
       const [assets, content, products, settings] = await Promise.all([
        fetchTable("site_assets", "select=asset_key,storage_path,public_url,alt_text,is_hidden&order=sort_order"),
        fetchTable("site_content", "select=content_key,value,is_hidden"),
        fetchTable("products", "select=code,name,gender,image_asset_key,is_featured&is_hidden=eq.false&order=gender,sort_order"),
        fetchTable("settings", "select=setting_key,value").catch(() => [])
      ]);
      const publicSettings = content.filter(item => item.content_key.startsWith("setting_") && !item.is_hidden)
        .map(item => ({ setting_key: item.content_key.replace(/^setting_/, ""), value: item.value }));
       updateAssets(assets); updateContent(content); updateTheme(settings.length ? settings : publicSettings); updateSettings(settings.length ? settings : publicSettings);
      renderProducts(products, assets.filter(asset => !asset.is_hidden));
    } catch (_error) {
      // The bundled storefront remains available if the content service is unavailable.
    }
  }
  document.addEventListener("atheer:select-product", event => {
    const { name, num } = event.detail;
    if (typeof window.atheerAddItem === "function") window.atheerAddItem(name, num);
  });
  sync();
})();