// Product inventory: click a row for details/edit/delete, and upload CSV / Excel / .db files
(() => {
  const $ = (s) => document.querySelector(s);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dialog = $("#product-dialog");
  let currentId = null;

  async function api(url, method = "GET", body) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function say(el, text, ok) {
    el.textContent = text;
    el.className = "upload-msg " + (ok ? "ok" : "err");
  }

  function refresh() {
    if (window.refreshDashboard) window.refreshDashboard();
  }

  async function openProduct(id) {
    try {
      const [p, categories] = await Promise.all([api(`/api/products/${id}`), api("/api/categories")]);
      currentId = id;
      $("#dialog-title").textContent = p.product_name;
      $("#p-category").replaceChildren(...categories.map((c) => new Option(c.category_name, c.category_id)));
      $("#p-name").value = p.product_name;
      $("#p-category").value = p.category_id;
      $("#p-price").value = p.price;
      $("#p-stock").value = p.quantity_in_stock;
      const stats = [["Product ID", p.product_id], ["Initial stock", p.initial_stock_quantity], ["Units sold", p.total_units_sold],
        ["Orders", p.order_count], ["Revenue", money.format(p.total_revenue)], ["Rating", `${p.average_rating.toFixed(1)} / 5 (${p.review_count})`]];
      $("#detail-stats").replaceChildren(...stats.map(([label, value]) => {
        const box = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        box.append(dt, dd);
        return box;
      }));
      say($("#dialog-msg"), "", true);
      dialog.showModal();
    } catch (error) {
      alert("Couldn't load this product. Is the server running?");
    }
  }

  $("#product-results").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (row && row.dataset.id) openProduct(row.dataset.id);
  });
  $("#product-results").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset && e.target.dataset.id) openProduct(e.target.dataset.id);
  });

  $("#p-close").addEventListener("click", () => dialog.close());

  $("#product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/products/${currentId}`, "PUT", {
        product_name: $("#p-name").value, category_id: $("#p-category").value,
        price: $("#p-price").value, quantity_in_stock: $("#p-stock").value,
      });
      dialog.close();
      refresh();
    } catch (error) {
      say($("#dialog-msg"), error.message, false);
    }
  });

  $("#p-delete").addEventListener("click", async () => {
    if (!confirm(`Delete "${$("#p-name").value}"? This can't be undone.`)) return;
    try {
      await api(`/api/products/${currentId}`, "DELETE");
      dialog.close();
      refresh();
    } catch (error) {
      say($("#dialog-msg"), error.message, false);
    }
  });

  $("#upload-btn").addEventListener("click", () => $("#upload-input").click());
  $("#upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = $("#upload-msg");
    const isDb = /\.(db|sqlite3?)$/i.test(file.name);
    if (isDb && !confirm("This replaces the whole database with the uploaded file. Your current one is backed up first. Continue?")) {
      e.target.value = "";
      return;
    }
    say(msg, "Uploading…", true);
    try {
      const response = await fetch("/api/upload", { method: "POST", headers: { "X-Filename": encodeURIComponent(file.name) }, body: file });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload failed");
      say(msg, data.message, true);
      refresh();
    } catch (error) {
      say(msg, error.message, false);
    }
    e.target.value = "";
  });
})();
