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
- Flash Sale banner with a live Hours:Minutes:Seconds countdown and a horizontally
  scrollable deals feed (discount %, price, stock meter)
- Category grid and navigation (Processors, Graphics Cards, Motherboards, RAM,
  Storage, PSUs, Cases, Cooling, Peripherals, Laptops)
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
  title, category, price, discount price, stock, rating, specs, and icon
- Flash Sale Management: one-click toggle switches to add/remove any product
  from the storefront's Flash Sale banner

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
deletes that volume and all database data; only use it when you intentionally
want to reset the local database. The SQL initialization script only runs when
the MySQL data volume is empty. User-uploaded images currently live in the app
container and are not persisted when that container is replaced.

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
        └── admin.js           # Admin logic (auth, CRUD, stats)
```

## API Reference

**Public**
- `GET /api/categories`
- `GET /api/products` — supports `?category=`, `?search=`, `?flashSale=true`
- `GET /api/products/:id`

**Customer accounts** (account routes require `Authorization: Bearer <token>`)
- `POST /api/auth/signup` — `{ name, email, password, age, address, phone }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/logout`
- `GET /api/account` — returns the authenticated profile and order items

**Admin** (require header `Authorization: Bearer <token>` from `/api/admin/login`)
- `POST /api/admin/login` — `{ username, password }` → `{ token }`
- `GET /api/admin/stats`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`

**Orders**
- `POST /api/orders` — `{ customerName, deliveryAddress, phone, paymentMethod, items: [{ productId, quantity }] }`; authenticated orders are linked to the customer

## Notes

- Payment processing is still simulated. The admin token and credentials are
  demo-only. Customer passwords are hashed and customer sessions are stored in
  MySQL, but production still requires stronger session expiration/revocation,
  CSRF protection, validation/rate limiting, secure environment-based secrets,
  and a payment provider.
