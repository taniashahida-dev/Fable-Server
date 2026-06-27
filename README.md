# 📚 Fable — Backend API Server

> *RESTful API powering the Fable ebook sharing platform — built with Node.js, Express & MongoDB.*

[![Server Repo](https://img.shields.io/badge/GitHub-Server-181717?style=for-the-badge&logo=github)](https://github.com/taniashahida-dev/Fable-Server)
[![Live API](https://img.shields.io/badge/Live%20API-Active-brightgreen?style=for-the-badge)](https://fable-server-nu.vercel.app)

---

## 🌟 Purpose

This is the Express.js backend for **Fable**, a full-stack ebook sharing platform. It handles authentication, role-based access control, ebook management, Stripe payments, and all database operations via MongoDB.

---

## ✨ Core Features

- **JWT Authentication** — Secure token-based auth with 7-day expiry
- **Google OAuth** — BetterAuth integration for social login
- **Role-Based Access** — Three roles: Reader, Writer, Admin with protected routes
- **Ebook CRUD** — Full create, read, update, delete for ebooks
- **Stripe Payments** — Checkout session creation and webhook handling
- **Transaction Records** — Purchase history and publishing fee tracking
- **Admin Controls** — User role management, ebook moderation, revenue overview
- **CORS Configured** — Production-safe cross-origin setup

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Database** | MongoDB + Mongoose |
| **Auth** | JSON Web Token (JWT), BetterAuth |
| **Payments** | Stripe |
| **Security** | bcryptjs, dotenv |
| **Middleware** | cors, express.json |

---

## 📦 NPM Packages

`express` · `mongoose` · `jsonwebtoken` ·  `stripe` · `cors` · `dotenv` · `better-auth` · `nodemailer`





## 🚀 Run Locally

```bash
git clone https://github.com/your-username/fable-server
cd fable-server
npm install
# Add your .env file
npm start
```

---

## 🔗 Related

- **Frontend Repo:** [fable-client](https://github.com/taniashahida-dev/Fable-Client)
- **Live Site:** [fable.vercel.app](https://fable-bookstore.vercel.app)

---

*Part of the Fable full-stack MERN project.*
