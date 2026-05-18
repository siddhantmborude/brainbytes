# BrainBytes – AI Powered Shipment Tracking & Conflict Resolution System

## Overview

BrainBytes is a full-stack shipment tracking and logistics monitoring platform designed to provide a single, reliable source of truth for package movement across multiple delivery stages.

The system tracks shipments in real time, simulates delivery handovers, validates QR-based package scans, detects conflicts automatically, and visualizes shipment flow across hubs and delivery agents.

This project was built to solve a common logistics problem:

> Shipments move through multiple hands and systems, causing inconsistent updates, lost visibility, duplicate scans, wrong handovers, and delayed deliveries.

BrainBytes solves this using:

* Real-time shipment lifecycle tracking
* Intelligent conflict detection engine
* QR-based package validation
* Dynamic route planning
* Delivery handover simulation
* Live socket updates
* Multi-role dashboards (Admin / Customer / Delivery Partner)

---

# Features

## Core Shipment Tracking

* Create and monitor shipments
* Track shipment lifecycle across multiple stages
* Real-time shipment status updates
* Dynamic route generation
* Multi-hub shipment flow simulation
* Historical movement visibility

## QR-Based Verification

* QR scan validation for delivery agents
* Prevent unauthorized handovers
* Scan audit logging
* Duplicate scan detection
* Delivery confirmation workflows

## Conflict Detection Engine

Automatically detects:

* Wrong delivery agent scans
* Already delivered package scans
* Duplicate scans
* Wrong hub handovers
* Stuck shipments
* Invalid shipment transitions

## Real-Time Simulation Engine

Simulates:

* Shipment movement between hubs
* Agent assignment
* Package handovers
* Route progression
* Delivery completion

## Role-Based Access

### Admin

* Monitor all shipments
* View conflicts
* Observe simulation state
* Manage delivery flow

### Customer

* Track owned shipments
* View delivery progress
* Monitor current delivery agent

### Delivery Partner

* Accept shipment handovers
* Scan QR codes
* Update package state
* Complete deliveries

---

# Tech Stack

## Frontend

* React 19
* Vite
* React Router
* Tailwind CSS
* Leaflet Maps
* Socket.IO Client
* HTML5 QR Code Scanner

## Backend

* Node.js
* Express.js
* Socket.IO
* Prisma ORM
* PostgreSQL / SQLite compatible Prisma setup

## APIs & Services

* OpenStreetMap Nominatim API
* OSRM Routing API

---

# Project Structure

```bash
brainbytes-main/
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── src/
│   │   ├── db/
│   │   │   └── seed.js
│   │   │
│   │   ├── simulator/
│   │   │   ├── ConflictEngine.js
│   │   │   ├── RouteService.js
│   │   │   └── SimulationEngine.js
│   │   │
│   │   └── server.js
│   │
│   ├── package.json
│   └── prisma.config.ts
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   │
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

# Backend Architecture

## 1. server.js

Main backend entry point.

Responsibilities:

* Starts Express server
* Initializes Socket.IO
* Registers APIs
* Handles authentication
* Manages shipment endpoints
* Starts simulation engine
* Runs automatic stuck shipment detection

### Major APIs

#### Authentication

```http
POST /api/auth/register
POST /api/auth/login
```

#### Shipments

```http
GET /api/shipments
POST /api/shipments
```

#### QR Validation

```http
POST /api/scan
```

---

## 2. SimulationEngine.js

Responsible for automatic shipment lifecycle simulation.

### Features

* Generates delivery stages
* Assigns delivery agents
* Simulates handovers
* Moves shipments through states:

```text
Pending → Arrived → Waiting → Active → Completed
```

### Additional Responsibilities

* Route pre-calculation
* Agent-to-hub matching
* Shipment state broadcasting through Socket.IO

---

## 3. ConflictEngine.js

Core intelligent validation engine.

### Detects Conflicts

| Conflict Type     | Description                                 |
| ----------------- | ------------------------------------------- |
| WRONG_AGENT       | Unauthorized delivery agent scanned package |
| ALREADY_DELIVERED | Package already completed                   |
| DOUBLE_SCAN       | Shipment scanned multiple times             |
| WRONG_HUB         | Agent scanned at incorrect hub              |
| STUCK             | Shipment inactive for too long              |

### Main Responsibilities

* Validate QR scans
* Audit logging
* Shipment verification
* Conflict reporting
* State integrity checks

---

## 4. RouteService.js

Handles route calculation and map intelligence.

### Features

* Converts text locations to coordinates
* Fetches real road routes
* Generates route geometry
* Calculates distances
* Creates intermediate logistics hubs

### APIs Used

#### Nominatim

Used for geocoding:

```text
Location Name → Latitude/Longitude
```

#### OSRM

Used for road routing:

```text
Source → Destination → Route Path
```

---

# Frontend Architecture

## React + Vite Application

The frontend is built using React with Vite for high-speed development and optimized builds.

---

## Main Components

### App.jsx

Handles:

* Application routing
* Navigation
* Authentication state
* Protected dashboards

### Pages

#### Home

Landing page for the platform.

#### Login / Register

User authentication system.

#### Admin Dashboard

* View all shipments
* Monitor conflicts
* Track simulation state

#### Customer Portal

* Track customer shipments
* View shipment progress
* Observe assigned agents

#### Delivery Portal

* Scan QR codes
* Accept deliveries
* Update shipment stages

---

# Database Design

Managed using Prisma ORM.

## Main Entities

### User

Stores:

* Name
* Email
* Password
* Role
* Assigned Hub

### Shipment

Stores:

* Shipment ID
* Source
* Destination
* Current status
* Route data
* Owner details

### Shipment Chain

Stores:

* Shipment stages
* Hubs
* Assigned agents
* Status progression

### Conflict Logs

Stores:

* Conflict type
* Severity
* Related shipment
* Agent involved
* Timestamp

---

# Real-Time System

Socket.IO is used for:

* Live shipment updates
* Dashboard synchronization
* Real-time handover events
* Instant conflict alerts

---

# Installation Guide

## Clone Repository

```bash
git clone <your-repository-url>
cd brainbytes-main
```

---

# Backend Setup

## Navigate to Backend

```bash
cd backend
```

## Install Dependencies

```bash
npm install
```

## Configure Environment Variables

Create a `.env` file:

```env
DATABASE_URL="file:./dev.db"
PORT=5000
```

## Run Prisma Migration

```bash
npx prisma migrate dev
```

## Start Backend Server

```bash
node src/server.js
```

Backend runs on:

```text
http://localhost:5000
```

---

# Frontend Setup

## Navigate to Frontend

```bash
cd frontend
```

## Install Dependencies

```bash
npm install
```

## Start Frontend

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

---

# Shipment Lifecycle Flow

```text
Shipment Created
       ↓
Route Generated
       ↓
Hub Chain Created
       ↓
Agent Assigned
       ↓
Package Arrives at Hub
       ↓
QR Scan Validation
       ↓
Conflict Detection
       ↓
Shipment Handover
       ↓
Delivery Completed
```

---

# Intelligent Conflict Resolution

The platform continuously verifies shipment integrity.

Example scenarios:

### Duplicate Scan

If an agent scans the same package twice:

```text
DOUBLE_SCAN conflict triggered
```

### Wrong Agent

If an unauthorized agent attempts handover:

```text
WRONG_AGENT conflict triggered
```

### Stuck Shipment

If shipment inactivity exceeds threshold:

```text
STUCK conflict triggered
```

---

# Future Improvements

Potential enhancements:

* AI-based delivery delay prediction
* Fraud detection using anomaly models
* OTP-based customer verification
* Blockchain audit trail
* Push notifications
* Mobile application support
* Analytics dashboard
* ETA prediction engine
* Heatmap visualization
* Multi-language support

---

# Security Considerations

Current implementation includes:

* Role-based access
* QR validation
* Shipment verification
* Conflict auditing

Recommended production improvements:

* JWT authentication
* Password hashing
* Rate limiting
* HTTPS enforcement
* Role middleware
* API validation

---

# Challenges Solved

This system addresses:

* Shipment visibility problems
* Inconsistent tracking updates
* Delivery fraud attempts
* Unauthorized package handling
* Delayed shipment detection
* Cross-hub coordination issues

---

# Contributors

Built as part of a logistics intelligence and shipment tracking project.

---

# License

This project is licensed under the MIT License.

---

# Screenshots

Add screenshots here:

```text
frontend/public/screenshots/
```

Suggested screenshots:

* Home page
* Admin dashboard
* Customer tracking portal
* Delivery dashboard
* QR scanning screen
* Conflict detection logs
* Shipment map tracking

---

# Demo Flow

1. Register users with different roles
2. Create a shipment
3. Generate route & handover chain
4. Track shipment movement
5. Scan QR codes
6. Trigger conflicts intentionally
7. Observe real-time updates
8. Complete shipment delivery

---

# Why This Project Stands Out

Unlike traditional shipment trackers, BrainBytes combines:

* Real-time logistics simulation
* Intelligent conflict resolution
* Dynamic route planning
* Multi-agent coordination
* Audit-friendly shipment verification
* Live operational visibility

making it closer to a real logistics control system than a simple tracking dashboard.
