// Manage products page: add, edit and delete products (and their stock)
(() => {
  const $ = (s) => document.querySelector(s);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let categories = [];

  function showMessage(text, ok) {
    const el = $("#manage-msg");
    el.textContent = text;
    el.className = "manage-msg " + (ok ? "ok" : "err");
  }

  async function api(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function resetForm() {
    $("#product-form").reset();
    $("#p-id").value = "";
    $("#form-title").textContent = "Add a product";
    $("#p-save").textContent = "Add product";
    $("#p-cancel").hidden = true;
  }

  function startEdit(p) {
    $("#p-id").value = p.product_id;
    $("#p-name").value = p.product_name;
    $("#p-category").value = p.category_id;
    $("#p-price").value = p.price;
    $("#p-stock").value = p.quantity_in_stock;
    $("#form-title").textContent = "Edit product";
    $("#p-save").textContent = "Save changes";
    $("#p-cancel").hidden = false;
    $("#manage-view").scrollIntoView({ behavior: "smooth" });
    $("#p-name").focus();
  }

  async function removeProduct(p) {
    if (!confirm(`Delete "${p.product_name}"? This can't be undone.`)) return;
    try {
      await api(`/api/products/${p.product_id}`, "DELETE");
      showMessage(`Deleted ${p.product_name}.`, true);
      await loadManage();
      if (window.refreshDashboard) window.refreshDashboard();
    } catch (error) {
      showMessage(error.message, false);
    }
  }

  function button(label, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn small " + className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderRows(products) {
    $("#manage-rows").replaceChildren(
      ...products.map((p) => {
        const tr = document.createElement("tr");
        [p.product_name, p.category_name, money.format(p.price), p.quantity_in_stock].forEach((text) => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        });
        const actions = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.className = "row-actions";
        wrap.append(button("Edit", "", () => startEdit(p)), button("Delete", "danger", () => removeProduct(p)));
        actions.append(wrap);
        tr.append(actions);
        return tr;
      })
    );
  }

  async function loadManage() {
    try {
      if (!categories.length) {
        categories = await api("/api/categories", "GET");
        $("#p-category").replaceChildren(
          ...categories.map((c) => new Option(c.category_name, c.category_id))
        );
      }
      renderRows(await api("/api/products", "GET"));
    } catch (error) {
      showMessage("Can't reach the server. Start it with start.command first.", false);
    }
  }

  $("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#p-id").value;
    const body = {
      product_name: $("#p-name").value,
      category_id: $("#p-category").value,
      price: $("#p-price").value,
      quantity_in_stock: $("#p-stock").value,
    };
    try {
      await api(id ? `/api/products/${id}` : "/api/products", id ? "PUT" : "POST", body);
      showMessage(id ? "Changes saved." : "Product added.", true);
      resetForm();
      await loadManage();
      if (window.refreshDashboard) window.refreshDashboard();
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  $("#p-cancel").addEventListener("click", () => {
    resetForm();
    showMessage("", true);
  });

  function route() {
    const manage = location.hash === "#manage";
    $("#dashboard-view").hidden = manage;
    $("#manage-view").hidden = !manage;
    document.querySelectorAll(".nav-link").forEach((a) =>
      a.classList.toggle("active", (a.getAttribute("href") === "#manage") === manage)
    );
    if (manage) loadManage();
  }

  window.addEventListener("hashchange", route);
  route();
})();
