import csv, glob, io, json, os, shutil, sqlite3, tempfile, time, zipfile
import xml.etree.ElementTree as ET
from urllib.parse import unquote
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 5051))  # hosts like Render provide PORT
HOST = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"  # open to the internet only when hosted

PRODUCTS_SQL = """
SELECT p.product_id, p.category_id, p.product_name, c.category_name, p.price,
       COALESCE((SELECT SUM(oi.quantity) FROM OrderItem oi WHERE oi.product_id = p.product_id), 0) AS total_units_sold,
       COALESCE((SELECT s.quantity_in_stock FROM StockItem s WHERE s.product_id = p.product_id), 0) AS quantity_in_stock,
       ROUND(COALESCE((SELECT SUM(oi.quantity * oi.unit_price) FROM OrderItem oi WHERE oi.product_id = p.product_id), 0), 2) AS total_revenue,
       ROUND(COALESCE((SELECT AVG(r.review_score) FROM Review r WHERE r.product_id = p.product_id), 0), 2) AS average_rating
FROM Product p
JOIN Category c ON c.category_id = p.category_id
ORDER BY p.product_name
"""

CITY_SQL = """
SELECT cu.city AS city,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(oi.quantity) AS items
FROM Customer cu
JOIN Orders o ON o.customer_id = cu.customer_id
JOIN OrderItem oi ON oi.order_id = o.order_id
GROUP BY cu.city
ORDER BY items DESC, orders DESC, cu.city
LIMIT 5
"""

GENDER_SQL = """
SELECT CASE UPPER(TRIM(COALESCE(gender, '')))
         WHEN 'F' THEN 'Female'
         WHEN 'M' THEN 'Male'
         ELSE 'Not specified'
       END AS label,
       COUNT(*) AS customers
FROM Customer
GROUP BY label
ORDER BY CASE label WHEN 'Female' THEN 1 WHEN 'Male' THEN 2 ELSE 3 END
"""

def customer_insights():
    gender = query(GENDER_SQL)
    total = sum(g["customers"] for g in gender) or 1
    for g in gender:
        g["pct"] = round(g["customers"] * 100 / total, 1)
    return {"gender": gender, "total_customers": total, "cities": query(CITY_SQL)}

DETAIL_SQL = """
SELECT p.product_id, p.category_id, p.product_name, c.category_name, p.price,
       COALESCE(s.initial_stock_quantity, 0) AS initial_stock_quantity,
       COALESCE(s.quantity_in_stock, 0) AS quantity_in_stock,
       (SELECT COALESCE(SUM(quantity), 0) FROM OrderItem WHERE product_id = p.product_id) AS total_units_sold,
       (SELECT COUNT(DISTINCT order_id) FROM OrderItem WHERE product_id = p.product_id) AS order_count,
       (SELECT ROUND(COALESCE(SUM(quantity * unit_price), 0), 2) FROM OrderItem WHERE product_id = p.product_id) AS total_revenue,
       (SELECT COUNT(*) FROM Review WHERE product_id = p.product_id) AS review_count,
       (SELECT ROUND(COALESCE(AVG(review_score), 0), 2) FROM Review WHERE product_id = p.product_id) AS average_rating
FROM Product p
JOIN Category c ON c.category_id = p.category_id
LEFT JOIN StockItem s ON s.product_id = p.product_id
WHERE p.product_id = ?
"""

MAX_UPLOAD = 50 * 1024 * 1024
ALIASES = {
    "name": ("product_name", "name", "product"),
    "category": ("category_name", "category"),
    "price": ("price", "retail_unit_price", "unit_price"),
    "stock": ("quantity_in_stock", "stock", "quantity", "in_stock"),
}

def read_csv(data):
    return list(csv.reader(io.StringIO(data.decode("utf-8-sig"))))

def read_xlsx(data):
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        shared = ["".join(t.text or "" for t in si.iter(ns + "t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(ns + "si")]
    rows = []
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(ns + "row"):
        values = {}
        for cell in row.iter(ns + "c"):
            col = 0
            for ch in cell.get("r", ""):
                if ch.isalpha():
                    col = col * 26 + ord(ch.upper()) - 64
            v = cell.find(ns + "v")
            if cell.get("t") == "s" and v is not None:
                text = shared[int(v.text)]
            elif cell.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(ns + "t"))
            else:
                text = v.text if v is not None and v.text else ""
            values[col - 1] = text
        rows.append([values.get(i, "") for i in range(max(values) + 1)] if values else [])
    return rows

def import_rows(conn, rows):
    if not rows:
        raise ValueError("The file is empty")
    header = [str(h).strip().lower().replace(" ", "_") for h in rows[0]]
    col = {k: next((header.index(a) for a in names if a in header), None) for k, names in ALIASES.items()}
    if None in (col["name"], col["category"], col["price"], col["stock"]):
        raise ValueError("Columns needed: product_name, category, price, quantity_in_stock")
    added = updated = skipped = 0
    for r in rows[1:]:
        try:
            name, cat = str(r[col["name"]]).strip(), str(r[col["category"]]).strip()
            price, stock = round(float(r[col["price"]]), 2), int(float(r[col["stock"]]))
            if not name or not cat or price < 0 or stock < 0:
                raise ValueError
        except (ValueError, IndexError):
            skipped += 1
            continue
        found = conn.execute("SELECT category_id FROM Category WHERE LOWER(category_name) = LOWER(?)", (cat,)).fetchone()
        cat_id = found[0] if found else conn.execute("INSERT INTO Category (category_name) VALUES (?)", (cat,)).lastrowid
        prod = conn.execute("SELECT product_id FROM Product WHERE LOWER(product_name) = LOWER(?) AND category_id = ?", (name, cat_id)).fetchone()
        if prod:
            conn.execute("UPDATE Product SET price = ? WHERE product_id = ?", (price, prod[0]))
            if conn.execute("UPDATE StockItem SET quantity_in_stock = ? WHERE product_id = ?", (stock, prod[0])).rowcount == 0:
                conn.execute("INSERT INTO StockItem (product_id, initial_stock_quantity, quantity_in_stock) VALUES (?, ?, ?)", (prod[0], stock, stock))
            updated += 1
        else:
            pid = conn.execute("INSERT INTO Product (product_name, category_id, price) VALUES (?, ?, ?)", (name, cat_id, price)).lastrowid
            conn.execute("INSERT INTO StockItem (product_id, initial_stock_quantity, quantity_in_stock) VALUES (?, ?, ?)", (pid, stock, stock))
            added += 1
    return {"ok": True, "message": f"Imported: {added} added, {updated} updated, {skipped} skipped."}

def replace_db(data):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    tmp.write(data)
    tmp.close()
    try:
        try:
            check = sqlite3.connect(tmp.name)
            tables = {r[0] for r in check.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            check.close()
        except sqlite3.DatabaseError:
            raise ValueError("That file isn't a valid SQLite database")
        if not {"Product", "Category", "StockItem", "OrderItem", "Review", "Customer", "Orders"} <= tables:
            raise ValueError("That database is missing tables this app needs (Product, Category, StockItem, OrderItem, Review, Customer, Orders)")
        backup = DB + ".backup-" + time.strftime("%Y%m%d-%H%M%S")
        shutil.copy2(DB, backup)
        shutil.copyfile(tmp.name, DB)
    finally:
        os.unlink(tmp.name)
    return {"ok": True, "message": "Database replaced. Your old copy was saved as " + os.path.basename(backup)}

def find_db():
    if os.environ.get("RETAIL_DB"):
        return os.environ["RETAIL_DB"]
    for folder in (HERE, os.path.join(HERE, "..")):
        for ext in ("*.db", "*.sqlite", "*.sqlite3"):
            found = sorted(glob.glob(os.path.join(folder, ext)))
            if found:
                return os.path.abspath(found[0])
    return None

DB = find_db()

def query(sql, params=()):
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)  # read-only, so it won't lock SQLPro Studio
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always serve fresh files so edits show up without a hard refresh
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        pid = self.product_id_from_path()
        if pid is not None and DB:
            rows = query(DETAIL_SQL, (pid,))
            return self.send_json(rows[0] if rows else {"error": "Product not found"}, 200 if rows else 404)
        if path in ("/api/products", "/api/tables", "/api/customer-insights", "/api/categories"):
            if not DB:
                return self.send_json({"error": "No database file found"}, 500)
            try:
                if path == "/api/products":
                    return self.send_json(query(PRODUCTS_SQL))
                if path == "/api/customer-insights":
                    return self.send_json(customer_insights())
                if path == "/api/categories":
                    return self.send_json(query("SELECT category_id, category_name FROM Category ORDER BY category_name"))
                return self.send_json(query("SELECT name FROM sqlite_master WHERE type='table'"))
            except sqlite3.Error as e:
                return self.send_json({"error": str(e)}, 500)
        super().do_GET()

    # ---- Insert / update / delete (products + their stock) ----
    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def product_id_from_path(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "products"] and parts[2].isdigit():
            return int(parts[2])
        return None

    def run_write(self, action):
        if not DB:
            return self.send_json({"error": "No database file found"}, 500)
        conn = sqlite3.connect(DB)
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            result = action(conn)
            conn.commit()
            return self.send_json(result)
        except ValueError as e:
            conn.rollback()
            return self.send_json({"error": str(e)}, 400)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            return self.send_json({"error": f"Not saved: {e}"}, 409)
        except sqlite3.Error as e:
            conn.rollback()
            return self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

    @staticmethod
    def clean_product(d):
        name = str(d.get("product_name", "")).strip()
        if not name:
            raise ValueError("Product name is required")
        try:
            category_id = int(d["category_id"])
            price = round(float(d["price"]), 2)
            stock = int(d["quantity_in_stock"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Category, price and stock must be valid numbers")
        if price < 0 or stock < 0:
            raise ValueError("Price and stock cannot be negative")
        return name, category_id, price, stock

    def handle_upload(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_UPLOAD:
            return self.send_json({"error": "File is too large (50 MB max)"}, 413)
        ext = os.path.splitext(unquote(self.headers.get("X-Filename", "")).lower())[1]
        data = self.rfile.read(length)
        if not DB:
            return self.send_json({"error": "No database file found"}, 500)
        try:
            if ext in (".db", ".sqlite", ".sqlite3"):
                return self.send_json(replace_db(data))
            if ext not in (".csv", ".xlsx"):
                raise ValueError("Please upload a .csv, .xlsx or .db file (save old .xls files as .xlsx)")
            rows = read_csv(data) if ext == ".csv" else read_xlsx(data)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception:
            return self.send_json({"error": "Couldn't read that file. Check it isn't damaged."}, 400)
        self.run_write(lambda conn: import_rows(conn, rows))

    def do_POST(self):
        if self.path.split("?")[0] == "/api/upload":
            return self.handle_upload()
        if self.path.split("?")[0] != "/api/products":
            return self.send_json({"error": "Not found"}, 404)
        try:
            name, cat, price, stock = self.clean_product(self.read_json())
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json({"error": str(e)}, 400)

        def action(conn):
            cur = conn.execute("INSERT INTO Product (product_name, category_id, price) VALUES (?, ?, ?)", (name, cat, price))
            conn.execute("INSERT INTO StockItem (product_id, initial_stock_quantity, quantity_in_stock) VALUES (?, ?, ?)", (cur.lastrowid, stock, stock))
            return {"ok": True, "product_id": cur.lastrowid}
        self.run_write(action)

    def do_PUT(self):
        pid = self.product_id_from_path()
        if pid is None:
            return self.send_json({"error": "Not found"}, 404)
        try:
            name, cat, price, stock = self.clean_product(self.read_json())
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json({"error": str(e)}, 400)

        def action(conn):
            cur = conn.execute("UPDATE Product SET product_name = ?, category_id = ?, price = ? WHERE product_id = ?", (name, cat, price, pid))
            if cur.rowcount == 0:
                raise ValueError("Product not found")
            cur = conn.execute("UPDATE StockItem SET quantity_in_stock = ? WHERE product_id = ?", (stock, pid))
            if cur.rowcount == 0:
                conn.execute("INSERT INTO StockItem (product_id, initial_stock_quantity, quantity_in_stock) VALUES (?, ?, ?)", (pid, stock, stock))
            return {"ok": True}
        self.run_write(action)

    def do_DELETE(self):
        pid = self.product_id_from_path()
        if pid is None:
            return self.send_json({"error": "Not found"}, 404)

        def action(conn):
            sold = conn.execute("SELECT COUNT(*) FROM OrderItem WHERE product_id = ?", (pid,)).fetchone()[0]
            reviews = conn.execute("SELECT COUNT(*) FROM Review WHERE product_id = ?", (pid,)).fetchone()[0]
            if sold or reviews:
                raise ValueError(f"Can't delete: this product has {sold} order line(s) and {reviews} review(s). Set its stock to 0 instead.")
            conn.execute("DELETE FROM StockItem WHERE product_id = ?", (pid,))
            cur = conn.execute("DELETE FROM Product WHERE product_id = ?", (pid,))
            if cur.rowcount == 0:
                raise ValueError("Product not found")
            return {"ok": True}
        self.run_write(action)

if __name__ == "__main__":
    print(f"Database: {DB}")
    print(f"Open http://localhost:{PORT}")
    ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=HERE)).serve_forever()
