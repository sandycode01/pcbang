# PCBang — Online Store for PC Parts & Accessories

A fully functional e-commerce web app built with **Node.js + Express** on the
back-end and **vanilla HTML/CSS/JS** on the front end, styled after modern
marketplaces in the Philippines.

MySQL stores the catalog, customer accounts, persistent login sessions, each
signed-in customer's cart and wishlist, orders, order items, stock, and sales
counters. Guest cart and wishlist data, recently viewed items, category
preferences, and recent searches remain browser-local. When a guest logs in,
their cart and wishlist are merged with the account's saved lists.

## Features

**Public storefront (`/` or `/store.html`)**
- Sticky header with logo, live search, and Cart / Wishlist / Support / Login actions
- Category navigation includes Home and the separate Compatibility Checker page
- Flash Sale banner with a live Hours:Minutes:Seconds countdown and a horizontally
  scrollable deals feed (discount %, price, stock meter)
- Category grid and navigation (Processors, Graphics Cards, Motherboards, RAM,
  Storage, PSUs, Cases, Cooling, Peripherals, Laptops)
- Centered **Build a compatible PC** link below the category grid opens the
  standalone Compatibility Checker
- Slide-out storefront filters with category selection and minimum/maximum price
  ranges; filters can be combined to narrow the product feed
- Personalized "Just For You" product feed showing up to 13 ranked products
  based on cart items, recently viewed items, previous searches, and category
  preferences; includes category filter pills, ratings, sold counts, and stock
  badges
- Slide-out cart panel with quantity controls and a mock checkout flow
  (delivery form → order confirmation)
- Wishlist with a live counter; signed-in carts and wishlists sync to the
  account and are restored on other devices after login
- Support dialog with email and phone links and a form that prepares an email
  in the customer's mail app
- Customer signup with name, email, password, age, address, and phone number
- Customer login with persistent database-backed sessions
- My Account view with profile details, order items, product images, item prices,
  quantities, order totals, statuses, and logout
- Logged-in checkout pre-fills name, address, and phone; guest checkout remains
  available with manual details
- Footer with Customer Care, Delivery, Payment Method, and About links

**Admin dashboard (`/admin`)**
- Hardcoded login (`admin` / `admin123`) — session token stored in `sessionStorage`
- Overview: total products, sales for the current month, active categories, and
  low-stock alerts. Monthly sales history is calculated from saved orders and
  retained across months
- Overview, Product Management, and Flash Sale each have an independent category
  filter. The Overview filter applies to its low-stock table and alert count;
  the other filters only affect their own tables
- Product Management: full CRUD table (add / edit / delete) with a form for
  title, category, price, discount price, stock, rating, specs, image, and
  optional compatibility data
- Customer Orders: newest-first order list with order number, customer, delivery
  destination, contact number, payment method, total, date ordered, and an
  editable status (Pending, Shipped, On the way, Cancelled, or Returned).
  Customers see the latest status in My Account
- Flash Sale Management: toggle products into the sale, set an independent sale
  price, view stock, and manage a shared live campaign countdown. Sale prices
  automatically stop applying when the campaign expires; each product then
  returns to its regular selling price (including any standard discount)
- Monthly sales include Paid, Processing, Shipped, On the way, and Completed
  orders. Pending, Cancelled, and Returned orders are excluded; order records
  remain stored so monthly history is kept
- Admin-uploaded product images are stored in a persistent Docker volume when
  using Docker Compose
- Admin data tables have a viewport-limited height and independent scrolling;
  column headers remain visible while scrolling, and the height limit adjusts
  for smaller screens

## Getting started

**Recommended: Docker Desktop.** This starts the app and MySQL together and
keeps the database and uploaded images in Docker volumes. Follow
[Run with Docker Desktop](#run-with-docker-desktop) below.

**Alternative: run Node.js with a local MySQL server (such as XAMPP).**

1. Install Node.js and start MySQL in XAMPP.
2. Create the database schema once. Either import `database.sql` in
   phpMyAdmin, or run `npm run db:init` from PowerShell if the MySQL command-line
   client is installed. Use one method, not both.
3. Copy `.env.example` to `.env`. For a default XAMPP setup, set `DB_HOST` to
   `localhost`, `DB_USER` to `root`, and `DB_PASSWORD` to the password configured
   for that MySQL user (often blank in a local XAMPP installation).
   `MYSQL_ROOT_PASSWORD` is only used by Docker Compose.
4. From the project folder, install dependencies and start the app:

   ```powershell
   npm install
   npm start
   ```

5. Open `http://localhost:3000/` for the storefront or
   `http://localhost:3000/admin` for the admin dashboard.

The app listens on port `3000` by default; set `PORT` to use a different port.
On startup, it creates supported additive tables/columns and inserts starter
catalog rows only when they are missing. Back up your database before making
manual schema changes or resetting it.

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
standard discount. Compatibility checks run automatically after at least two
components are selected. **Add to cart** adds each selected in-stock component
to the existing browser cart; it does not require all five component types to
be selected. Checkout recalculates prices and checks stock on the server.

To enter or update specifications, sign in at `/admin`, choose **Edit** for a
component, expand **PC compatibility data**, and enter verified manufacturer
details. Use the same socket notation on CPUs and motherboards (for example,
`AM5`), `DDR4`/`DDR5` for memory type, and comma-separated supported board
sizes for cases. GPU length and case clearance are whole millimeters. Leave
unknown values blank; a blank value is not treated as proof of compatibility.
The demo does not check BIOS support, power-supply capacity, cooler fit, or
other compatibility factors.

## Run with Docker Desktop

Docker Compose runs the Express app and MySQL in separate containers. MySQL
data and admin-uploaded product images are kept in named Docker volumes, so
rebuilding or replacing the app container does not erase them.

1. Install Docker Desktop and wait until its engine is running. Git for Windows
   is optional for running the app, but is needed for the Git instructions below.
2. In PowerShell, go to this project directory:

   ```powershell
   cd C:\Users\ACER\Documents\Web_Commerce\pcbang
   ```

3. Create your local environment file and edit it:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Replace the example values for `DB_PASSWORD` and `MYSQL_ROOT_PASSWORD` with
   two local development passwords of your choice. They do not need to match
   your XAMPP passwords. Compose connects the app to the `db` service using a
   dedicated `pcbang` user; leave `DB_HOST` as `db`. Do not commit `.env`.
4. Build the app image and start both services:

   ```powershell
   docker compose up --build
   ```

   The app waits for MySQL to become healthy. The first database container
   startup imports `database.sql`, then the app seeds its starter catalog.
5. Open `http://localhost:3000/` for the storefront or
   `http://localhost:3000/admin` for the admin dashboard. The demo admin login is
   `admin` / `admin123`.
6. Stop the services with `Ctrl+C` if Compose is running in the foreground, or
   run `docker compose down` in another terminal. Start them later with
   `docker compose up -d`.

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
When running the app directly with `npm start` instead of Docker, uploads are
written to the project-level `uploads/` folder. That folder is excluded from
Git, so back it up separately.

## Git version control

From the project directory, initialize a local repository and make the first
commit:

```powershell
git init
git add .
git status
git commit -m "Initial commit"
```

Check `git status` before committing; `.gitignore` excludes dependencies,
local environment files, and the local `uploads/` directory. Docker volumes
are not tracked in Git. For each change, create a branch, commit your work, and
merge it back:

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
├── server.js                # Express server, APIs, and uploaded-image handling
├── data.js                  # Starter catalog and compatibility data
├── database.sql             # Initial MySQL schema
├── db.js                    # MySQL connection, additive migrations, and seed
├── Dockerfile               # App container build
├── compose.yaml              # App, MySQL, and persistent volume configuration
├── .env.example              # Local environment-variable template
├── .dockerignore             # Excludes local files from the app image build
├── .gitignore                # Excludes dependencies, secrets, and local uploads
├── package.json
└── public/
    ├── store.html            # Storefront page
    ├── admin.html            # Admin login and dashboard
    ├── compatibility.html    # Standalone PC compatibility checker
    ├── img/                  # Bundled sample product images
    ├── css/
    │   ├── styles.css        # Storefront styles (also shared tokens)
    │   └── admin.css         # Admin-only styles
    └── js/
        ├── icons.js           # Shared inline-SVG icon set
        ├── app.js             # Storefront, account, cart, and checkout logic
        ├── admin.js           # Admin dashboard logic
        └── compatibility.js   # Compatibility checker logic
```

## API Reference

**Public**
- `GET /api/categories`
- `GET /api/products` — supports `?category=<id>`, `?search=<text>`, and
  `?flashSale=true`. Product responses include regular, standard-discount, and
  flash-sale prices; `flashSale` is true only while the shared campaign is active
- `GET /api/products/:id`
- `GET /api/flash-sale` — current shared campaign end time and active state
- `GET /uploads/<category>/<filename>` — serves an uploaded product image
- `GET /api/pc-builder/products` — component choices and recorded compatibility
  data and current price fields (`price`, `discountPrice`, `salePrice`, and
  campaign-aware `flashSale`) for CPUs, motherboards, RAM, GPUs, and cases
- `POST /api/pc-builder/check` — accepts `{ cpuId, motherboardId, ramId, gpuId,
  caseId }`; selections may be omitted for partial checks. Returns `overall`
  (`compatible`, `incompatible`, or `incomplete`) and individual checks

Protected customer and admin requests use a bearer token returned by the
corresponding login endpoint in the `Authorization` header.

**Customer accounts** (account routes require `Authorization: Bearer <token>`)
- `POST /api/auth/signup` — `{ name, email, password, age, address, phone }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/logout`
- `GET /api/account` — returns the authenticated profile and order items
- `GET /api/account/saved-items` — returns the signed-in customer's cart and
  wishlist
- `PUT /api/account/saved-items` — replaces the customer's saved cart and
  wishlist after validating product IDs and current stock

**Admin** (require header `Authorization: Bearer <token>` from `/api/admin/login`)
- `POST /api/admin/login` — `{ username, password }` → `{ token }`
- `GET /api/admin/stats`
- `GET /api/admin/products`
- `GET /api/admin/orders` — customer and order summary, newest first
- `PUT /api/admin/orders/:id/status` — update status to `pending`, `shipped`,
  `on_the_way`, `cancelled`, or `returned` (legacy `paid`, `processing`, and
  `completed` statuses are also accepted)
- The stats response includes current-month `totalSales` and `monthlySales`
  history for qualifying order statuses
- `GET /api/admin/flash-sale`
- `POST /api/admin/upload-image` — multipart field `image`; accepts PNG, JPEG,
  WEBP, or GIF files up to 5 MB. Returns the persistent image URL
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
