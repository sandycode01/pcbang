# PCBang — Online Store for PC Parts & Accessories

A fully functional e-commerce demo app built with **Node.js + Express** on the
back end and **vanilla HTML/CSS/JS** on the front end, styled after modern
marketplaces like Lazada PH but focused exclusively on PC components.

MySQL stores the catalog, customer accounts, persistent login sessions, orders,
order items, stock, and sales counters. Cart, wishlist, recently viewed items,
category preferences, and recent searches remain browser-local.

## Features

**Public storefront (`/` or `/store.html`)**
- Sticky header with logo, live search, and Cart / Wishlist / Support / Login actions
- Category navigation includes Home and the separate Compatibility Checker page
- Flash Sale banner with a live Hours:Minutes:Seconds countdown and a horizontally
  scrollable deals feed (discount %, price, stock meter)
- Category grid and navigation (Processors, Graphics Cards, Motherboards, RAM,
  Storage, PSUs, Cases, Cooling, Peripherals, Laptops)
- Slide-out storefront filters with category selection and minimum/maximum price
  ranges; filters can be combined to narrow the product feed
- Personalized "Just For You" product feed showing up to 15 ranked products
  based on cart items, recently viewed items, previous searches, and category
  preferences; includes category filter pills, ratings, sold counts, and stock
  badges
- Slide-out cart panel with quantity controls and a mock checkout flow
  (delivery form → order confirmation)
- Wishlist with a live counter
- Customer signup with name, email, password, age, address, and phone number
- Customer login with persistent database-backed sessions
- My Account view with profile details, order items, product images, item prices,
  quantities, order totals, statuses, and logout
- Logged-in checkout pre-fills name, address, and phone; guest checkout remains
  available with manual details
- Footer with Customer Care, Delivery, Payment Method, and About links

**Admin dashboard (`/admin`)**
- Hardcoded login (`admin` / `admin123`) — session token stored in `sessionStorage`
- Overview: total products, mock total sales, active categories, low-stock alerts
- Product Management: full CRUD table (add / edit / delete) with a form for
  title, category, price, discount price, stock, rating, specs, image, and
  optional compatibility data
- Customer Orders: newest-first order list with order number, customer, delivery
  destination, contact number, payment method, total, status, and date ordered
- Flash Sale Management: toggle products into the sale, set an independent sale
  price, view stock, and manage a shared live campaign countdown. Sale prices
  automatically stop applying when the campaign expires; each product then
  returns to its regular selling price (including any standard discount)
- Admin data tables have a viewport-limited height and independent scrolling;
  column headers remain visible while scrolling, and the height limit adjusts
  for smaller screens

## Getting Started

```bash
npm install
npm run db:init
npm start
```

Start MySQL through XAMPP first, then import `database.sql` in phpMyAdmin. Copy
`.env.example` to
`.env` and change the `DB_*` values when your XAMPP credentials differ from the
defaults (`root` with no password). The schema import and seed are idempotent
and only insert starter rows that do not already exist.

Then open:
- Storefront: http://localhost:3000/
- Admin dashboard: http://localhost:3000/admin (login: `admin` / `admin123`)

The server runs on port `3000` by default; set `PORT` to change it.

## PC component compatibility data

The app adds a one-to-one `product_compatibility` table and creates it
automatically at server startup. This is an additive migration: it does not
recreate the database, alter existing product/order rows, or remove the Docker
database volume. Starter values are inserted only for products that do not
already have compatibility data.

Customers open the standalone checker at `/compatibility.html`, also linked
from the storefront category navigation. It retains the store header, category
navigation, and footer while hosting the compatibility form on its own page.
Each component picker is an expandable list with a product thumbnail, name, and
stock status, plus the current selling price. Active Flash Sale items show
their sale price; other items use the normal selling price, including any
standard discount. Compatibility checks run automatically as components are
selected. **Add to cart** adds each selected in-stock component to the existing
browser cart; it does not require all five component types to be selected.

To enter or update specifications, sign in at `/admin`, choose **Edit** for a
component, expand **PC compatibility data**, and enter verified manufacturer
details. Use the same socket notation on CPUs and motherboards (for example,
`AM5`), `DDR4`/`DDR5` for memory type, and comma-separated supported board
sizes for cases. GPU length and case clearance are whole millimeters. Leave
unknown values blank; a blank value is not treated as proof of compatibility.
The demo does not check BIOS support, power-supply capacity, cooler fit, or
other compatibility factors.

## Run with Docker Desktop

Docker Compose runs the Express app and MySQL in separate containers. The MySQL
database files are kept in a named Docker volume, so restarting or rebuilding
the containers does not erase the database.

1. Install Git for Windows and Docker Desktop, then open Docker Desktop and wait
   until its engine is running.
2. In PowerShell, go to this project directory:

   ```powershell
   cd C:\Users\ACER\Documents\Web_Commerce\pcbang
   ```

3. Create your local environment file and edit it:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Replace the example values for both `DB_PASSWORD` and
   `MYSQL_ROOT_PASSWORD` with local development passwords. Compose overrides
   `DB_HOST` to `db` and connects the app as the dedicated `pcbang` MySQL user.
   Do not commit `.env`.
4. Build the app image and start both services:

   ```powershell
   docker compose up --build
   ```

   The app waits for MySQL to become healthy. The first database container
   startup imports `database.sql`, then the app seeds its starter catalog.
5. Open `http://localhost:3000/` or `http://localhost:3000/admin`. Stop the
   containers with `Ctrl+C`, or run `docker compose down` in another terminal.
   Start again later with `docker compose up`.

The database volume survives `docker compose down`. `docker compose down -v`
deletes both the database and uploaded-image volumes; only use it when you
intentionally want to remove all local data. The SQL initialization script only
runs when the MySQL data volume is empty. New admin image uploads are saved in
the `product_uploads` named Docker volume and served from `/uploads/`, so they
survive app image rebuilds and container replacement. Existing image files
previously uploaded under `public/img/` are not automatically recoverable if
their app container has already been replaced; upload them again after this
change, or restore them from a backup.

To back up uploaded images, copy the `product_uploads` volume using Docker
Desktop's volume tools or a Docker volume backup procedure. Avoid deleting
volumes when removing containers; use `docker compose down` without `-v`.

## Git version control

From the project directory, initialize a local repository and make the first
commit:

```powershell
git init
git add .
git status
git commit -m "Initial commit"
```

Check `git status` before committing; `.gitignore` excludes `node_modules/` and
`.env`. For each change, create a branch, commit your work, and merge it back:

```powershell
git switch -c feature/my-change
# edit and test your files
git add .
git commit -m "Describe the change"
git switch main
git merge feature/my-change
```

Git tracks source changes, not running containers or the database volume.
Dockerfiles and `compose.yaml` let Git track the environment setup, while the
database volume retains local data. If you create a remote repository, add its
URL with `git remote add origin <repository-url>` and push with
`git push -u origin main`. Never push `.env`, passwords, or production data.

## Project Structure

```
pcbang/
├── server.js              # Express server + REST API (public & admin)
├── data.js                 # Starter catalog used to seed MySQL
├── database.sql             # MySQL schema and table definitions
├── db.js                    # MySQL pool and idempotent seed
├── package.json
└── public/
    ├── store.html           # Storefront page
    ├── admin.html           # Admin login + dashboard page
    ├── css/
    │   ├── styles.css        # Storefront styles (also shared tokens)
    │   └── admin.css         # Admin-only styles
    └── js/
        ├── icons.js           # Shared inline-SVG icon set
        ├── app.js             # Storefront logic (accounts, cart, search, checkout…)
        └── admin.js           # Admin logic (auth, products, orders, stats)
```

## API Reference

**Public**
- `GET /api/categories`
- `GET /api/products` — supports `?category=`, `?search=`, `?flashSale=true`
- `GET /api/products/:id`
- `GET /api/flash-sale` — current shared campaign end time and active state
- `GET /api/pc-builder/products` — component choices and recorded compatibility
  data and current price fields (`price`, `discountPrice`, `salePrice`, and
  campaign-aware `flashSale`) for CPUs, motherboards, RAM, GPUs, and cases
- `POST /api/pc-builder/check` — accepts `{ cpuId, motherboardId, ramId, gpuId,
  caseId }`; selections may be omitted for partial checks. Returns `overall`
  (`compatible`, `incompatible`, or `incomplete`) and individual checks

**Customer accounts** (account routes require `Authorization: Bearer <token>`)
- `POST /api/auth/signup` — `{ name, email, password, age, address, phone }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/logout`
- `GET /api/account` — returns the authenticated profile and order items

**Admin** (require header `Authorization: Bearer <token>` from `/api/admin/login`)
- `POST /api/admin/login` — `{ username, password }` → `{ token }`
- `GET /api/admin/stats`
- `GET /api/admin/products`
- `GET /api/admin/orders` — customer and order summary, newest first
- `GET /api/admin/flash-sale`
- `PUT /api/admin/flash-sale` — `{ endsAt }` as a future Unix timestamp in
  milliseconds, or `{ endsAt: null }` to end the campaign immediately
- `POST /api/admin/products`
- `PUT /api/admin/products/:id` — accepts `salePrice` independently of
  `discountPrice`; send `null` or an empty string to clear it
- `DELETE /api/admin/products/:id`

**Orders**
- `POST /api/orders` — `{ customerName, deliveryAddress, phone, paymentMethod, items: [{ productId, quantity }] }`; authenticated orders are linked to the customer

## Notes

- Payment processing is still simulated. The admin token and credentials are
  demo-only. Customer passwords are hashed and customer sessions are stored in
  MySQL, but production still requires stronger session expiration/revocation,
  CSRF protection, validation/rate limiting, secure environment-based secrets,
  and a payment provider.
