const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US");
const searchInput = document.querySelector("#search-input");
const categoryFilter = document.querySelector("#category-filter");
const resultBody = document.querySelector("#product-results");
let products = window.retailProducts; // fallback snapshot from data.js

function updateMetrics() {
  document.querySelector("#product-count").textContent = number.format(products.length);
  document.querySelector("#stock-count").textContent = number.format(products.reduce((total, product) => total + product.quantity_in_stock, 0));
  document.querySelector("#sold-count").textContent = number.format(products.reduce((total, product) => total + product.total_units_sold, 0));
  document.querySelector("#low-stock-count").textContent = number.format(products.filter(product => product.quantity_in_stock < 60).length);
  const totalRevenue = products.reduce((total, product) => total + product.total_revenue, 0);
  document.querySelector("#revenue-total").textContent = currency.format(totalRevenue);
  const topProduct = [...products].sort((a, b) => b.total_revenue - a.total_revenue)[0];
  document.querySelector("#top-product").textContent = `${topProduct.product_name} leads at ${currency.format(topProduct.total_revenue)}`;
}

function renderChart() {
  const chart = document.querySelector("#revenue-chart");
  const topProducts = [...products].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 7);
  const largestRevenue = topProducts[0].total_revenue;
  chart.innerHTML = topProducts.map(product => `<div class="bar-group"><div class="bar" style="height:${Math.max(12, (product.total_revenue / largestRevenue) * 100)}%"></div><span>${product.product_name}</span></div>`).join("");
}

function renderProducts() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const matchingProducts = products.filter(product => product.product_name.toLowerCase().includes(search) && (!category || product.category_name === category));
  resultBody.innerHTML = matchingProducts.map(product => `<tr class="clickable" tabindex="0" data-id="${product.product_id ?? ""}"><td>${product.product_name}</td><td>${product.category_name}</td><td>${currency.format(product.price)}</td><td>${number.format(product.total_units_sold)}</td><td class="${product.quantity_in_stock < 60 ? "stock-low" : ""}">${number.format(product.quantity_in_stock)}</td><td>${currency.format(product.total_revenue)}</td><td>${product.average_rating.toFixed(1)} / 5</td></tr>`).join("");
  document.querySelector("#result-count").textContent = `${matchingProducts.length} product${matchingProducts.length === 1 ? "" : "s"} shown`;
}

function populateCategories() {
  const selected = categoryFilter.value;
  categoryFilter.length = 1;
  [...new Set(products.map(product => product.category_name))].sort().forEach(category => categoryFilter.insertAdjacentHTML("beforeend", `<option value="${category}">${category}</option>`));
  categoryFilter.value = selected;
}

function renderAll() {
  populateCategories();
  updateMetrics();
  renderChart();
  renderProducts();
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status);
    products = await response.json();
  } catch (error) {
    console.warn("Live data unavailable, using data.js snapshot.", error);
  }
  renderAll();
}

const fallbackInsights = {
  gender: [{ label: "Female", pct: 44 }, { label: "Male", pct: 45.7 }, { label: "Not specified", pct: 10.3 }],
  cities: [
    { city: "East David", items: 12 }, { city: "East William", items: 11 }, { city: "Port Matthew", items: 10 },
    { city: "Lewisfort", items: 10 }, { city: "Port Melissaborough", items: 9 }
  ]
};

function barRow(label, valueText, percent) {
  const row = document.createElement("div");
  row.className = "hbar";
  const top = document.createElement("div");
  top.className = "hbar-top";
  const name = document.createElement("span");
  name.className = "hbar-label";
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "hbar-value";
  value.textContent = valueText;
  top.append(name, value);
  const track = document.createElement("div");
  track.className = "hbar-track";
  const fill = document.createElement("div");
  fill.className = "hbar-fill";
  fill.style.width = `${Math.max(2, Math.min(100, percent))}%`;
  track.append(fill);
  row.append(top, track);
  return row;
}

function renderInsights(data) {
  const genderBars = document.querySelector("#gender-bars");
  genderBars.replaceChildren(...data.gender.map(g => barRow(g.label, `${Math.round(g.pct)}%`, g.pct)));
  const cityBars = document.querySelector("#city-bars");
  const maxItems = Math.max(...data.cities.map(c => c.items), 1);
  cityBars.replaceChildren(...data.cities.map(c => barRow(c.city, number.format(c.items), (c.items / maxItems) * 100)));
}

async function loadInsights() {
  try {
    const response = await fetch("/api/customer-insights", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status);
    renderInsights(await response.json());
  } catch (error) {
    console.warn("Live insight data unavailable, using the saved snapshot.", error);
    renderInsights(fallbackInsights);
  }
}

loadProducts();
loadInsights();
window.refreshDashboard = () => { loadProducts(); loadInsights(); };
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
