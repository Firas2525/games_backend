# Games Backend API 🚀

A modular, clean-architecture REST API built with **Node.js**, **Express**, and **Mongoose (MongoDB)** designed specifically for the Flutter client app (`games_user`) and admin dashboard (`games_admin`).

---

## 🏗️ Architecture

```text
src/
├── config/             # DB & environment variables setup
├── constants/          # Roles, HTTP status codes, error definitions
├── middlewares/        # JWT auth, role validation, global error handling, Zod schema validation
├── modules/            # Feature-first modular business domains
│   ├── auth/           # Login, Register, Me profile
│   ├── games/          # Game CRUD, featured games, play count
│   └── users/          # Admin user management & status toggling
├── utils/              # Unified ApiResponse, ApiError, asyncHandler
├── app.js              # Express middleware pipeline & routing
└── server.js           # Entry point & DB connection
```

---

## ⚡ Unified Response Format

All responses follow this consistent format expected by Flutter:

```json
{
  "success": true,
  "message": "Operation description",
  "data": { ... }
}
```

In case of error:
```json
{
  "success": false,
  "message": "Error description",
  "errors": [ ... ]
}
```

---

## 📡 API Endpoints

### 1. Health Check
- `GET /health` - Server health status (Used by Render health check)

### 2. Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` - Register a new account (`name`, `email`, `password`, optional `role`)
- `POST /api/v1/auth/login` - Login (`email`, `password`)
- `GET /api/v1/auth/me` - Get profile of authenticated user (`Bearer <token>`)

### 3. Games (`/api/v1/games`)
- `GET /api/v1/games` - List all games (Query filters: `?category=...&isFeatured=true`)
- `GET /api/v1/games/:id` - Get game details
- `POST /api/v1/games/:id/play` - Increment play counter (User Auth required)
- `POST /api/v1/games` - Create new game (**Admin only**)
- `PUT /api/v1/games/:id` - Update game (**Admin only**)
- `DELETE /api/v1/games/:id` - Delete game (**Admin only**)

### 4. Users Management (`/api/v1/users` - Admin only)
- `GET /api/v1/users` - List all users
- `GET /api/v1/users/:id` - Get user details
- `PATCH /api/v1/users/:id/toggle-status` - Activate / Deactivate user account

---

## 🛠️ Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   - Copy `.env.example` to `.env`
   - Adjust `MONGO_URI` and `JWT_SECRET`

3. Start server in development mode:
   ```bash
   npm run dev
   ```

---

## ☁️ Deployment on Render (Step-by-Step)

1. **MongoDB Atlas:**
   - Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
   - Create a database user and whitelist `0.0.0.0/0` in Network Access.
   - Copy your connection string (e.g., `mongodb+srv://user:password@cluster.mongodb.net/games_db?retryWrites=true&w=majority`).

2. **Render.com:**
   - Create a new **Web Service** on Render and connect your GitHub repository.
   - Set **Root Directory**: `games_backend`
   - Set **Runtime**: `Node`
   - Set **Build Command**: `npm install`
   - Set **Start Command**: `npm start`
   - Add **Environment Variables**:
     - `MONGO_URI`: (Your MongoDB Atlas connection string)
     - `JWT_SECRET`: (Your strong secret key)
     - `NODE_ENV`: `production`
   - Set **Health Check Path**: `/health`
   - Click **Deploy**!
