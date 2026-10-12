CREATE TABLE Customer (
    customer_id INTEGER PRIMARY KEY,
    gender TEXT NOT NULL, age INTEGER NOT NULL, city TEXT NOT NULL
);
CREATE TABLE Category (
    category_id INTEGER PRIMARY KEY, category_name TEXT NOT NULL UNIQUE
);
CREATE TABLE Product (
    product_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_name TEXT NOT NULL, category_id INTEGER NOT NULL, price REAL NOT NULL,
    UNIQUE(product_name, category_id),
    FOREIGN KEY(category_id) REFERENCES Category(category_id)
);
CREATE TABLE Orders (
    order_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    customer_id INTEGER NOT NULL, order_date TEXT NOT NULL, payment_method TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES Customer(customer_id)
);
CREATE TABLE OrderItem (
    order_item_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, source_product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL, source_unit_price REAL NOT NULL, unit_price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES Orders(order_id), FOREIGN KEY(product_id) REFERENCES Product(product_id)
);
CREATE TABLE Review (
    review_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL, review_score REAL NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES Customer(customer_id), FOREIGN KEY(product_id) REFERENCES Product(product_id)
);
CREATE TABLE StockItem (
    stock_item_id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL UNIQUE,
    initial_stock_quantity INTEGER NOT NULL,
    quantity_in_stock INTEGER NOT NULL,
    FOREIGN KEY(product_id) REFERENCES Product(product_id)
);
