// Snapshot used by the standalone browser app. Regenerate it from the desktop
// application's database whenever the source data is intentionally changed.
window.retailProducts = [
  ["Basketball","Sports & Outdoors",24.99,96,88,2399.04,4.1], ["Blanket","Home & Living",39.99,108,120,4318.92,4.22],
  ["Carpet","Home & Living",89.99,106,49,9538.94,3.76], ["Dress","Fashion",59.99,120,104,7198.8,4.14],
  ["Eraser","Books & Stationery",1.99,131,185,260.69,3.72], ["Headphones","Electronics",79.99,128,189,10238.72,4.21],
  ["Laptop","Electronics",599.99,134,210,80398.66,3.91], ["Notebook","Books & Stationery",4.99,131,174,653.69,3.91],
  ["Novel","Books & Stationery",12.99,90,220,1169.1,4.1], ["Painting","Home & Living",34.99,108,55,3778.92,4.07],
  ["Pants","Fashion",39.99,127,101,5078.73,3.84], ["Pen","Books & Stationery",2.49,90,62,224.1,3.93],
  ["Pillow","Home & Living",24.99,113,158,2823.87,4], ["Running Shoes","Sports & Outdoors",74.99,131,172,9823.69,4.26],
  ["Shirt","Fashion",24.99,69,56,1724.31,3.65], ["Skirt","Fashion",29.99,113,56,3388.87,4.12],
  ["Smartphone","Electronics",499.99,159,151,79498.41,4.13], ["Smartwatch","Electronics",149.99,103,31,15448.97,3.73],
  ["Soccer Ball","Sports & Outdoors",29.99,137,191,4108.63,4.18], ["Story Book","Books & Stationery",9.99,105,78,1048.95,4.4],
  ["T-shirt","Fashion",19.99,135,214,2698.65,4.06], ["Tablet","Electronics",299.99,124,60,37198.76,3.91],
  ["Tent","Sports & Outdoors",129.99,112,168,14558.88,3.91], ["Vase","Home & Living",29.99,128,72,3838.72,3.57],
  ["Yoga Mat","Sports & Outdoors",24.99,149,75,3723.51,4.03]
].map(([product_name, category_name, price, total_units_sold, quantity_in_stock, total_revenue, average_rating]) =>
  ({ product_name, category_name, price, total_units_sold, quantity_in_stock, total_revenue, average_rating })
);
