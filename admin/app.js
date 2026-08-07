(function () {
  "use strict";

  const config = window.ATHEER_CONFIG || {};
  const client = config.supabaseUrl && config.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  const storageBucket = config.storageBucket || "atheer-media";
  const state = {
    products: [],
    assets: [],
    content: [],
    settings: [],
    theme: {},
    currentView: "overview",
    session: null,
    productAssetKey: "",
    editingAssetId: ""
  };
  const defaultSettings = [
    { setting_key: "whatsapp_number", value: "212661852411", label: "رقم واتساب بصيغة دولية" },
    { setting_key: "bundle_price", value: "199", label: "سعر الباقة بالدرهم" },
    { setting_key: "delivery_text", value: "توصيل مجاني على جميع الطلبات", label: "نص التوصيل" }
  ];
  const defaultTheme = {
    theme_bg: "#0c0a08",
    theme_surface: "#211912",
    theme_text: "#f3ecdf",
    theme_muted: "#b9ab96",
    theme_accent: "#b79353",
    theme_accent_light: "#e0c17f",
    theme_jade: "#5d7c67",
    theme_radius: "0px"
  };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
  }

  function friendlyError(error, fallback = "تعذر إتمام العملية") {
    const message = String(error?.message || error || "");
    const lower = message.toLowerCase();
    if (lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist"))) return "مخزن الصور غير جاهز حالياً.";
    if (lower.includes("row-level security") || lower.includes("not authorized") || lower.includes("permission")) return "ليست لديك صلاحية تنفيذ هذا التغيير.";
    if (lower.includes("jwt") || lower.includes("session") || lower.includes("token")) return "انتهت جلسة الدخول. أعد تسجيل الدخول ثم حاول مرة أخرى.";
    if (lower.includes("duplicate key") || lower.includes("already exists")) return "يوجد عنصر آخر بنفس الاسم أو الكود.";
    return message || fallback;
  }

  function requireSession() {
    if (!state.session?.user?.id) throw new Error("انتهت جلسة الدخول. أعد تسجيل الدخول.");
    return state.session.user.id;
  }

  function setLoginError(message) {
    const element = $("#login-error");
    element.textContent = message;
    element.hidden = !message;
  }

  function configured() {
    return Boolean(client && config.supabaseUrl && config.supabaseAnonKey);
  }

  function themeFromSettings(settings) {
    return {
      ...defaultTheme,
      ...Object.fromEntries((settings || [])
        .filter(item => item.setting_key.startsWith("theme_"))
        .map(item => [item.setting_key, item.value]))
    };
  }

  function applyTheme(theme) {
    const values = { ...defaultTheme, ...(theme || {}) };
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
      document.documentElement.style.setProperty(variable, values[setting]);
    });
  }

  function showApp(session) {
    state.session = session;
    $("#auth-view").hidden = true;
    $("#app-view").hidden = false;
    $("#user-email").textContent = session?.user?.email || "";
  }

  function showAuth() {
    $("#auth-view").hidden = false;
    $("#app-view").hidden = true;
  }

  async function signIn(event) {
    event.preventDefault();
    setLoginError("");
    if (!configured()) {
      setLoginError("تعذر الاتصال بالخدمة. حاول مرة أخرى لاحقاً.");
      return;
    }
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value
      });
      if (error) throw error;
      showApp(data.session);
      await loadData();
      renderView();
    } catch (error) {
      setLoginError(friendlyError(error, "تعذر تسجيل الدخول. تحقق من البيانات."));
    } finally {
      button.disabled = false;
    }
  }

  async function loadData() {
    const results = await Promise.all([
      client.from("products").select("*").order("gender").order("sort_order"),
      client.from("site_assets").select("*").order("sort_order"),
      client.from("site_content").select("*").order("content_key"),
      client.from("settings").select("*").order("setting_key")
    ]);
    const failed = results.find(result => result.error);
    if (failed) throw failed.error;
    state.products = results[0].data || [];
    state.assets = results[1].data || [];
    state.content = results[2].data || [];
    state.settings = results[3].data || [];
    state.theme = themeFromSettings(state.settings);
    applyTheme(state.theme);
  }

  function navView(view) {
    state.currentView = view;
    document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === view));
    document.querySelectorAll(".view").forEach(item => item.classList.remove("active-view"));
    $(`#view-${view}`).classList.add("active-view");
    $("#page-title").textContent = ({ overview: "نظرة عامة", products: "المنتجات", media: "الصور والوسائط", content: "المحتوى", settings: "الإعدادات" })[view];
    renderView();
    $(".sidebar")?.classList.remove("open");
  }

  function renderView() {
    ({ overview: renderOverview, products: renderProducts, media: renderMedia, content: renderContent, settings: renderSettings }[state.currentView])();
  }

  function renderOverview() {
    const visibleProducts = state.products.filter(item => !item.is_hidden);
    const visibleAssets = state.assets.filter(item => !item.is_hidden);
    $("#view-overview").innerHTML = `
      <div class="dashboard-grid">
        <div class="stat-card"><small>كل المنتجات</small><strong>${state.products.length}</strong></div>
        <div class="stat-card"><small>منتجات ظاهرة</small><strong>${visibleProducts.length}</strong></div>
        <div class="stat-card"><small>الصور المسجلة</small><strong>${state.assets.length}</strong></div>
        <div class="stat-card"><small>الحقول القابلة للتعديل</small><strong>${state.content.length + state.settings.length}</strong></div>
      </div>
      <section class="panel">
        <div class="panel-head"><div><h2>حالة المتجر</h2><p>كل تغيير محفوظ هنا ينعكس على الموقع العام بعد التحديث.</p></div><span class="badge visible">${visibleProducts.length} منتج نشط</span></div>
        <div class="overview-body">
          <div class="overview-line"><span>المنتجات المخفية</span><b>${state.products.length - visibleProducts.length}</b></div>
          <div class="overview-line"><span>الصور الظاهرة</span><b>${visibleAssets.length}</b></div>
          <div class="overview-line"><span>آخر تحديث</span><b>${new Date().toLocaleDateString("ar-MA")}</b></div>
        </div>
      </section>`;
  }

  function renderProducts() {
    const query = ($("#product-search")?.value || "").toLowerCase();
    const showHidden = Boolean($("#show-hidden-products")?.checked);
    const rows = state.products.filter(item =>
      (showHidden || !item.is_hidden) &&
      `${item.code} ${item.name}`.toLowerCase().includes(query)
    );
    $("#view-products").innerHTML = `
      <section class="panel">
        <div class="panel-head"><div><h2>كتالوج العطور</h2><p>الإخفاء مؤقت، والحذف نهائي بعد التأكيد.</p></div>
          <div class="toolbar"><input id="product-search" value="${escapeHtml(query)}" placeholder="ابحث بالاسم أو الكود" />
          <label class="check-label"><input id="show-hidden-products" type="checkbox" ${showHidden ? "checked" : ""}/> المخفية</label>
          <button class="primary-button" id="add-product">منتج جديد <b>+</b></button></div>
        </div>
        <table class="data-table"><thead><tr><th>الكود</th><th>الاسم</th><th>القسم</th><th>الصورة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
          ${rows.length ? rows.map(productRow).join("") : '<tr><td colspan="6" class="empty">لا توجد منتجات مطابقة.</td></tr>'}
        </tbody></table>
      </section>`;
    $("#product-search").addEventListener("input", renderProducts);
    $("#show-hidden-products").addEventListener("change", renderProducts);
    $("#add-product").addEventListener("click", () => openProductDialog());
    $("#view-products").querySelectorAll("[data-product-action]").forEach(button =>
      button.addEventListener("click", () => productAction(button.dataset.productAction, button.dataset.id)));
  }

  function productAsset(item) {
    return item ? state.assets.find(asset => asset.asset_key === item.image_asset_key) : null;
  }

  function assetUrl(asset) {
    if (asset?.public_url) return asset.public_url;
    const path = String(asset?.storage_path || "");
    if (!path) return "";
    if (/^assets\//i.test(path)) {
      // Auto-fix legacy seed paths: assets/*.webp → assets/webp/*.webp
      const fixedPath = /^assets\/[^/]+\.webp$/i.test(path) ? path.replace("assets/", "assets/webp/") : path;
      return `../${fixedPath}`;
    }
    return client ? client.storage.from(storageBucket).getPublicUrl(path).data.publicUrl : "";
  }

  function productRow(item) {
    const asset = productAsset(item);
    return `<tr class="${item.is_hidden ? "is-hidden" : ""}">
      <td><span class="code">${escapeHtml(item.code)}</span></td>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.gender === "femme" ? "نسائي" : "رجالي"}</td>
      <td>${assetUrl(asset) ? `<img class="table-thumb" src="${escapeHtml(assetUrl(asset))}" alt="" />` : "—"}</td>
      <td><span class="badge ${item.is_hidden ? "hidden-badge" : "visible"}">${item.is_hidden ? "مخفي" : "ظاهر"}</span></td>
      <td><div class="row-actions">
        <button class="table-action" data-product-action="edit" data-id="${item.id}">تعديل</button>
        <button class="table-action ${item.is_hidden ? "restore" : ""}" data-product-action="toggle" data-id="${item.id}">${item.is_hidden ? "استرجاع" : "إخفاء"}</button>
        <button class="table-action delete-action" data-product-action="delete" data-id="${item.id}">حذف</button>
      </div></td>
    </tr>`;
  }

  function renderMedia() {
    $("#view-media").innerHTML = `
      <section class="panel"><div class="panel-head"><div><h2>مكتبة الصور</h2><p>إدارة الصور المستخدمة في المتجر.</p></div></div>
      <div class="upload-box"><div><strong>رفع صورة جديدة</strong><label class="upload-meta">وصف الصورة<input id="media-alt" placeholder="وصف قصير للصورة" /></label><label class="upload-meta">مكان الاستخدام<select id="media-placement"><option value="product">منتج</option><option value="gallery">المعرض</option><option value="hero">الواجهة الرئيسية</option><option value="offer">العرض</option><option value="other">آخر</option></select></label></div><input id="media-upload" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" /></div>
      <div class="media-grid">${state.assets.length ? state.assets.map(assetCard).join("") : '<div class="empty">لا توجد صور مسجلة.</div>'}</div></section>`;
    $("#media-upload").addEventListener("change", uploadAsset);
    $("#view-media").querySelectorAll("[data-asset-action]").forEach(button =>
      button.addEventListener("click", () => assetAction(button.dataset.assetAction, button.dataset.id)));
  }

  function assetCard(item) {
    const url = assetUrl(item);
    return `<article class="media-card ${item.is_hidden ? "is-hidden" : ""}">
      ${url ? `<img class="media-thumb" src="${escapeHtml(url)}" alt="${escapeHtml(item.alt_text)}" loading="lazy" />` : '<div class="media-thumb media-placeholder">لا توجد معاينة</div>'}
      <div class="media-info"><strong>${escapeHtml(item.asset_key)}</strong><small>${escapeHtml(item.placement)} · ${item.is_hidden ? "مخفي" : "ظاهر"}</small>
      <div class="row-actions"><button class="table-action" data-asset-action="edit" data-id="${item.id}">تعديل</button><button class="table-action ${item.is_hidden ? "restore" : ""}" data-asset-action="toggle" data-id="${item.id}">${item.is_hidden ? "استرجاع" : "إخفاء"}</button>
      <button class="table-action delete-action" data-asset-action="delete" data-id="${item.id}">حذف</button></div></div></article>`;
  }

  function renderContent() {
    $("#view-content").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>محتوى الموقع</h2><p>عدّل النصوص أو أخفها من الموقع العام.</p></div></div>
      <div class="content-list">${state.content.length ? state.content.map(item => `
        <div class="content-row ${item.is_hidden ? "is-hidden" : ""}"><span class="content-key">${escapeHtml(item.content_key)}</span>
        <span class="content-value">${escapeHtml(item.value)}</span><span class="badge ${item.is_hidden ? "hidden-badge" : "visible"}">${item.is_hidden ? "مخفي" : "ظاهر"}</span>
        <div class="row-actions"><button class="table-action" data-content-action="edit" data-id="${item.id}">تعديل</button>
        <button class="table-action ${item.is_hidden ? "restore" : ""}" data-content-action="toggle" data-id="${item.id}">${item.is_hidden ? "استرجاع" : "إخفاء"}</button>
        <button class="table-action delete-action" data-content-action="delete" data-id="${item.id}">حذف</button></div></div>`).join("") : '<div class="empty">لا يوجد محتوى محفوظ.</div>'}</div></section>`;
    $("#view-content").querySelectorAll("[data-content-action]").forEach(button =>
      button.addEventListener("click", () => contentAction(button.dataset.contentAction, button.dataset.id)));
  }

  function renderSettings() {
    const settings = state.settings.length ? state.settings : defaultSettings;
    $("#view-settings").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>إعدادات المتجر</h2><p>بيانات التواصل والأسعار التي تظهر للزوار.</p></div></div>
      <div class="settings-list">${settings.filter(item => !item.setting_key.startsWith("theme_")).map(item => `<div class="setting-row"><span class="setting-label">${escapeHtml(item.label || item.setting_key)}</span><label><input data-setting-key="${escapeHtml(item.setting_key)}" data-setting-label="${escapeHtml(item.label || item.setting_key)}" value="${escapeHtml(item.value)}" /></label><button class="table-action delete-action" data-setting-delete="${escapeHtml(item.setting_key)}">حذف</button></div>`).join("")}</div>
      <div class="panel-head settings-section-head"><div><h2>مظهر المتجر</h2><p>يتغير المظهر في الموقع ولوحة التحكم معاً.</p></div><button id="reset-theme" class="secondary-button" type="button">إعادة المظهر الأصلي</button></div>
      <div class="theme-grid">${[
        ["theme_bg", "الخلفية", "color"], ["theme_surface", "أسطح البطاقات", "color"], ["theme_text", "النص الرئيسي", "color"],
        ["theme_muted", "النص الثانوي", "color"], ["theme_accent", "اللون الأساسي", "color"], ["theme_accent_light", "اللون الفاتح", "color"],
        ["theme_jade", "اللون المساند", "color"], ["theme_radius", "استدارة الحواف", "text"]
      ].map(([key, label, type]) => `<label class="theme-field"><span>${label}</span><input data-setting-key="${key}" data-setting-label="${label}" data-theme-input type="${type}" value="${escapeHtml(state.theme[key] || defaultTheme[key])}" ${type === "color" ? "" : 'placeholder="مثال: 0px"'}/></label>`).join("")}</div>
      <div class="panel-head"><button id="save-settings" class="primary-button" type="button">حفظ الإعدادات <b>←</b></button></div></section>`;
    $("#save-settings")?.addEventListener("click", saveSettings);
    $("#reset-theme")?.addEventListener("click", () => {
      state.theme = { ...defaultTheme };
      applyTheme(state.theme);
      renderSettings();
      toast("تمت استعادة المظهر الأصلي");
    });
    $("#view-settings").querySelectorAll("[data-theme-input]").forEach(input =>
      input.addEventListener("input", () => applyTheme(Object.fromEntries(
        [...document.querySelectorAll("[data-theme-input]")].map(item => [item.dataset.settingKey, item.value])
      ))));
    $("#view-settings").querySelectorAll("[data-setting-delete]").forEach(button =>
      button.addEventListener("click", () => deleteSetting(button.dataset.settingDelete)));
  }

  function openProductDialog(id) {
    const product = state.products.find(item => item.id === id);
    $("#product-dialog-title").textContent = product ? "تعديل المنتج" : "منتج جديد";
    $("#product-id").value = product?.id || "";
    $("#product-code").value = product?.code || "";
    $("#product-name").value = product?.name || "";
    $("#product-gender").value = product?.gender || "femme";
    $("#product-order").value = product?.sort_order || 0;
    $("#product-featured").checked = product?.is_featured !== false;
    state.productAssetKey = product?.image_asset_key || "";
    $("#product-image-file").value = "";
    $("#product-image-alt").value = productAsset(product)?.alt_text || "";
    fillAssetSelect();
    renderProductImagePreview(productAsset(product));
    $("#product-dialog").showModal();
  }

  function renderProductImagePreview(asset) {
    const preview = $("#product-image-preview");
    const url = assetUrl(asset);
    preview.hidden = !url;
    preview.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset?.alt_text || "")}" />` : "";
  }

  function fillAssetSelect() {
    const select = $("#product-image");
    if (!select) return;
    select.innerHTML = `<option value="">الصورة الافتراضية</option>` + state.assets.filter(asset => !asset.is_hidden).map(asset =>
      `<option value="${escapeHtml(asset.asset_key)}" ${asset.asset_key === state.productAssetKey ? "selected" : ""}>${escapeHtml(asset.asset_key)}</option>`).join("");
  }

  async function saveProduct(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    let imageAssetKey = $("#product-image").value || null;
    const file = $("#product-image-file").files?.[0];
    let uploadedAsset = null;
    const saveButton = $("#product-save");
    try {
      if (saveButton) saveButton.disabled = true;
      if (file) {
        uploadedAsset = await uploadImageFile(file, $("#product-image-alt").value.trim(), "product");
        imageAssetKey = uploadedAsset.asset_key;
      }
      const payload = {
        code: $("#product-code").value.trim(),
        name: $("#product-name").value.trim(),
        gender: $("#product-gender").value,
        sort_order: Number($("#product-order").value || 0),
        is_featured: $("#product-featured").checked,
        image_asset_key: imageAssetKey,
        updated_by: requireSession()
      };
      const id = $("#product-id").value;
      const result = id ? await client.from("products").update(payload).eq("id", id) : await client.from("products").insert(payload);
      if (result.error) throw result.error;
      $("#product-dialog").close();
      await loadData(); renderProducts(); toast("تم حفظ المنتج");
    } catch (error) {
      if (uploadedAsset) await removeAsset(uploadedAsset);
      toast(friendlyError(error, "تعذر حفظ المنتج"));
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function productAction(action, id) {
    const product = state.products.find(item => item.id === id);
    if (!product) return;
    if (action === "edit") return openProductDialog(id);
    if (action === "delete" && !window.confirm(`حذف المنتج «${product.name}» نهائياً؟`)) return;
    const result = action === "delete"
      ? await client.from("products").delete().eq("id", id)
      : await client.from("products").update({ is_hidden: !product.is_hidden, updated_by: state.session.user.id }).eq("id", id);
    if (result.error) return toast(friendlyError(result.error));
    await loadData(); renderProducts(); toast(action === "delete" ? "تم حذف المنتج" : "تم تحديث حالة المنتج");
  }

  async function uploadAsset(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await uploadImageFile(
        file,
        $("#media-alt")?.value.trim() || file.name.replace(/\.[^.]+$/, ""),
        $("#media-placement")?.value || "product"
      );
    } catch (error) {
      event.target.value = "";
      return toast(friendlyError(error, "تعذر رفع الصورة"));
    }
    event.target.value = "";
    await loadData(); renderMedia(); toast("تم رفع الصورة");
  }

  async function uploadImageFile(file, altText, placement) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const acceptedExtensions = ["jpg", "jpeg", "png", "webp", "gif"];
    if (!file.type.startsWith("image/") && !acceptedExtensions.includes(extension)) throw new Error("اختر ملف صورة صالحاً");
    if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة أكبر من 8MB");
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `uploads/${stamp}-${safeName}`;
    const contentType = file.type || `image/${extension === "jpg" ? "jpeg" : extension}`;
    const upload = await client.storage.from(storageBucket).upload(path, file, { upsert: false, contentType, cacheControl: "3600" });
    if (upload.error) throw upload.error;
    const { data: publicData } = client.storage.from(storageBucket).getPublicUrl(path);
    const key = `upload-${stamp}`;
    const { data, error } = await client.from("site_assets").insert({
      asset_key: key,
      storage_path: path,
      public_url: publicData.publicUrl,
      alt_text: altText || file.name.replace(/\.[^.]+$/, ""),
      placement,
      sort_order: state.assets.length + 1,
      updated_by: state.session.user.id
    }).select("*").single();
    if (error) {
      await client.storage.from(storageBucket).remove([path]);
      throw error;
    }
    return data;
  }

  async function removeAsset(asset) {
    await client.from("site_assets").delete().eq("id", asset.id);
    if (asset.storage_path && !/^assets\//i.test(asset.storage_path)) await client.storage.from(storageBucket).remove([asset.storage_path]);
  }

  async function assetAction(action, id) {
    const asset = state.assets.find(item => item.id === id);
    if (!asset) return;
    if (action === "edit") return openAssetDialog(asset);
    if (action === "delete" && !window.confirm(`حذف الصورة «${asset.asset_key}» نهائياً؟`)) return;
    if (action === "delete") {
      const result = await client.from("site_assets").delete().eq("id", id);
      if (result.error) return toast(friendlyError(result.error));
      if (asset.storage_path && !/^assets\//i.test(asset.storage_path)) await client.storage.from(storageBucket).remove([asset.storage_path]);
    } else {
      const result = await client.from("site_assets").update({ is_hidden: !asset.is_hidden, updated_by: state.session.user.id }).eq("id", id);
      if (result.error) return toast(friendlyError(result.error));
    }
    await loadData(); renderMedia(); toast(action === "delete" ? "تم حذف الصورة" : "تم تحديث حالة الصورة");
  }

  function openAssetDialog(asset) {
    state.editingAssetId = asset.id;
    $("#asset-id").value = asset.id;
    $("#asset-key").value = asset.asset_key;
    $("#asset-alt").value = asset.alt_text || "";
    $("#asset-placement").value = asset.placement || "other";
    const url = assetUrl(asset);
    $("#asset-dialog-preview").innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || "")}" />`
      : "<span>لا توجد معاينة</span>";
    $("#asset-dialog").showModal();
  }

  async function saveAsset(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const result = await client.from("site_assets").update({
      alt_text: $("#asset-alt").value.trim(),
      placement: $("#asset-placement").value,
      updated_by: state.session.user.id
    }).eq("id", $("#asset-id").value);
    if (result.error) return toast(friendlyError(result.error));
    $("#asset-dialog").close();
    await loadData(); renderMedia(); toast("تم حفظ الصورة");
  }

  function openContentDialog(id) {
    const item = state.content.find(content => content.id === id);
    if (!item) return;
    $("#content-id").value = item.id;
    $("#content-label").value = item.label || item.content_key;
    $("#content-value").value = item.value;
    $("#content-hidden").checked = Boolean(item.is_hidden);
    $("#content-dialog").showModal();
  }

  async function contentAction(action, id) {
    const item = state.content.find(content => content.id === id);
    if (!item) return;
    if (action === "edit") return openContentDialog(id);
    if (action === "delete" && !window.confirm(`حذف المحتوى «${item.label || item.content_key}» نهائياً؟`)) return;
    const result = action === "delete"
      ? await client.from("site_content").delete().eq("id", id)
      : await client.from("site_content").update({ is_hidden: !item.is_hidden, updated_by: state.session.user.id }).eq("id", id);
    if (result.error) return toast(friendlyError(result.error));
    await loadData(); renderContent(); toast(action === "delete" ? "تم حذف المحتوى" : "تم تحديث حالة المحتوى");
  }

  async function saveContent(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const result = await client.from("site_content").update({
      label: $("#content-label").value.trim(),
      value: $("#content-value").value,
      is_hidden: $("#content-hidden").checked,
      updated_by: state.session.user.id
    }).eq("id", $("#content-id").value);
    if (result.error) return toast(friendlyError(result.error));
    $("#content-dialog").close(); await loadData(); renderContent(); toast("تم حفظ المحتوى");
  }

  async function saveSettings() {
    for (const input of [...document.querySelectorAll("[data-setting-key]")]) {
      const result = await client.from("settings").upsert({
        setting_key: input.dataset.settingKey,
        value: input.value,
        label: input.dataset.settingLabel || input.dataset.settingKey,
        updated_by: state.session.user.id
      });
      if (result.error) return toast(friendlyError(result.error, "تعذر حفظ الإعدادات"));
      const publicCopy = await client.from("site_content").upsert({
        content_key: `setting_${input.dataset.settingKey}`,
        value: input.value,
        label: input.dataset.settingLabel || input.dataset.settingKey,
        is_hidden: false,
        updated_by: state.session.user.id
      }, { onConflict: "content_key" });
      if (publicCopy.error) return toast(friendlyError(publicCopy.error, "تعذر مزامنة الإعدادات"));
    }
    await loadData(); toast("تم حفظ الإعدادات");
  }

  async function deleteSetting(key) {
    if (!window.confirm("حذف هذا الإعداد نهائياً؟")) return;
    const result = await client.from("settings").delete().eq("setting_key", key);
    if (result.error) return toast(friendlyError(result.error));
    await loadData(); renderSettings(); toast("تم حذف الإعداد");
  }

  async function boot() {
    $("#login-form").addEventListener("submit", signIn);
    $("#product-form").addEventListener("submit", saveProduct);
    $("#content-form").addEventListener("submit", saveContent);
    $("#asset-form").addEventListener("submit", saveAsset);
    $("#product-image").addEventListener("change", () => {
      renderProductImagePreview(state.assets.find(item => item.asset_key === $("#product-image").value));
    });
    $("#product-image-file").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!file.type.startsWith("image/") && !["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
        event.target.value = "";
        return toast("اختر ملف صورة صالحاً");
      }
      if (file.size > 8 * 1024 * 1024) {
        event.target.value = "";
        return toast("حجم الصورة أكبر من 8MB");
      }
      const preview = $("#product-image-preview");
      preview.hidden = false;
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
    });
    $("#logout-btn").addEventListener("click", async () => { await client.auth.signOut(); showAuth(); });
    document.querySelectorAll(".nav-item[data-view]").forEach(item => item.addEventListener("click", () => navView(item.dataset.view)));
    $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
    if (!configured()) {
      setLoginError("تعذر الاتصال بالخدمة. حاول مرة أخرى لاحقاً.");
      return;
    }
    applyTheme(defaultTheme);
    client.from("settings").select("setting_key,value").like("setting_key", "theme_%").then(({ data }) => {
      if (data?.length) applyTheme(themeFromSettings(data));
    });
    const { data } = await client.auth.getSession();
    if (data.session) {
      try { showApp(data.session); await loadData(); renderView(); }
      catch (error) { showAuth(); setLoginError(friendlyError(error, "تعذر تحميل البيانات.")); }
    }
    client.auth.onAuthStateChange((_event, session) => { if (session) showApp(session); else showAuth(); });
  }

  boot();
})();