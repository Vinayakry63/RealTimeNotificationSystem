# NotifyPro — Production Real-Time Notification Platform

A full-stack real-time notification platform built with Node.js, Socket.IO, PostgreSQL, Redis, and React.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  AuthContext → useSocket → NotificationContext → UI Components   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (REST) + WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                    BACKEND (Node.js + Express)                   │
│  Routes → Middleware → Controllers → Services → Prisma → PostgreSQL  │
│                         └── Socket.IO ──┘                        │
│                              ↕ Pub/Sub                           │
│                           [Redis]                                │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Tailwind CSS, Socket.IO Client |
| Backend | Node.js, Express.js, Socket.IO |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Database | PostgreSQL + Prisma ORM |
| Cache/PubSub | Redis (ioredis) |
| Security | Helmet, CORS, Rate Limiting, Input Validation |

## Project Structure

```
RealTimeNotificationSystem/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database models
│   │   └── seed.js              # Demo data seeder
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.js         # Centralized env config + validation
│   │   │   ├── database.js      # Prisma singleton
│   │   │   └── redis.js         # Redis client factory
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── notification.controller.js
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js       # JWT verify + RBAC
│   │   │   ├── error.middleware.js      # Global error handler
│   │   │   └── validation.middleware.js # Input validation
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   └── notification.routes.js
│   │   ├── services/
│   │   │   ├── auth.service.js          # Business logic: register/login
│   │   │   └── notification.service.js  # Business logic + Redis caching
│   │   ├── sockets/
│   │   │   └── socket.manager.js        # Socket.IO + Redis Pub/Sub
│   │   ├── utils/
│   │   │   ├── jwt.js
│   │   │   ├── logger.js
│   │   │   └── response.js
│   │   ├── app.js               # Express app setup
│   │   └── server.js            # HTTP server + graceful shutdown
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── common/
    │   │   │   └── ProtectedRoute.jsx
    │   │   ├── layout/
    │   │   │   └── Navbar.jsx
    │   │   └── notifications/
    │   │       ├── NotificationBell.jsx
    │   │       ├── NotificationDropdown.jsx
    │   │       └── NotificationItem.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   └── NotificationContext.jsx
    │   ├── hooks/
    │   │   └── useSocket.js
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── UserDashboard.jsx
    │   │   └── AdminDashboard.jsx
    │   ├── services/
    │   │   └── api.js
    │   ├── App.jsx
    │   ├── index.js
    │   └── index.css
    ├── .env.example
    └── package.json
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Redis running locally

### 1. Clone and Install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and other settings
```

### 3. Set Up Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate dev --name init

# Seed demo data
node prisma/seed.js
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start
```

### 5. Test the System

1. Open http://localhost:3000
2. Login as **admin**: `admin@demo.com` / `password123`
3. Open a new browser tab, login as **user**: `user@demo.com` / `password123`
4. In admin tab: go to Admin Panel → send a notification to the user
5. Watch the notification appear instantly in the user tab (no refresh\!)

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login, get JWT |
| GET | `/api/auth/profile` | User | Get own profile |
| GET | `/api/auth/users` | Admin | List all users |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | User | Get notifications (paginated) |
| GET | `/api/notifications/unread-count` | User | Get unread badge count |
| PATCH | `/api/notifications/:id/read` | User | Mark one as read |
| PATCH | `/api/notifications/read-all` | User | Mark all as read |
| POST | `/api/notifications/send` | Admin | Send notification to user |

## Socket.IO Events

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, room }` | Connection confirmed |
| `new_notification` | `{ notification, timestamp }` | Real-time notification |
| `offline_notifications` | `{ notifications, count }` | Queued notifications on reconnect |
| `unread_count_update` | `{ count }` | Badge count sync |

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `mark_read` | `{ notificationId }` | Mark notification as read |
| `mark_all_read` | `{}` | Mark all as read |

## Deployment

### Backend (Railway/Render)
1. Push code to GitHub
2. Connect Railway to your repo
3. Add environment variables in Railway dashboard
4. Railway auto-detects `npm start` from package.json

### Frontend (Vercel)
1. Push frontend to GitHub
2. Import in Vercel dashboard
3. Set `REACT_APP_API_URL` and `REACT_APP_SOCKET_URL` to your Railway backend URL
4. Deploy

### Environment Variables (Production)
```
DATABASE_URL=postgresql://... (from Railway/Neon/Supabase)
REDIS_URL=rediss://... (from Upstash Redis)
JWT_SECRET=<generate with: openssl rand -hex 64>
CORS_ORIGIN=https://your-app.vercel.app
NODE_ENV=production
```

## Key Architecture Concepts

### Why Socket.IO Rooms?
Each user joins room `user:ID`. The server emits to rooms, not individual sockets. This enables multi-device support — user'\''s phone, tablet, and laptop all receive the same notification.

### Why Redis Pub/Sub?
When you run multiple backend servers (horizontal scaling), each server only knows about ITS sockets. Redis acts as a message bus — Server A publishes, Redis delivers to Server B which has the user'\''s socket.

### Why PostgreSQL + Redis (not just one)?
- PostgreSQL: persistent, queryable, relational — your source of truth
- Redis: fast (~0.1ms), ephemeral, perfect for: cache, queues, counters, pub/sub
- They solve different problems. Use both.

### Why DB-first, then emit socket?
Save to PostgreSQL FIRST, then emit via Socket.IO. If socket emission fails, notification is still saved. User sees it on refresh. Reverse order risks "ghost notifications" seen but not persisted.
