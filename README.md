# Voxa - Multilingual Speech-to-Text Converter

## Project Description

Voxa is a web-based multilingual speech-to-text conversion system designed to convert spoken words into accurate digital text while supporting multiple languages. The system integrates speech recognition, text processing, translation, and AI-powered features to improve accessibility and communication.

The application allows users to record speech, convert audio into text, translate transcripts between languages, format generated text, save previous conversions, and manage their transcription history.

This project was developed as part of the requirements for the Computer Science ND programme.

---

# Features

## User Features

- User registration and authentication
- Login with email and password
- Google OAuth authentication
- Multilingual speech-to-text conversion
- Text translation between supported languages
- AI-powered text formatting and polishing
- Transcript history management
- Download and copy generated transcripts
- User profile and account settings
- Free and Pro subscription plans
- Daily usage limits based on user plan


## Admin Features

- Secure admin authentication
- User management dashboard
- View registered users
- Manage user accounts
- Monitor subscriptions and payments
- Revenue monitoring
- System statistics overview

## Owner Features

- Advanced owner dashboard
- Revenue monitoring
- Administrator management
- Platform management controls

---

# Technologies Used

## Frontend

- HTML5
- CSS3
- JavaScript
- Responsive Web Design


## Backend

- Node.js
- Express.js
- REST API Architecture


## Database

- PostgreSQL


## Authentication & Security

- JSON Web Token (JWT)
- bcrypt password hashing
- Google OAuth 2.0


## Other Technologies

- Paystack Payment Integration
- Nodemailer Email Service
- AI Speech Recognition API
- Translation Services

---

# System Architecture

Voxa follows a modular client-server architecture.
Voxa │ ├── Frontend │   ├── User Interface │   ├── Authentication Pages │   ├── Dashboard Pages │   └── Client-side Logic │ └── Backend ├── Routes │   ├── Authentication │   ├── Users │   ├── Billing │   ├── Admin │   └── Owner │ ├── Services │   ├── Google Authentication │   ├── Email Service │   └── Payment Service │ ├── Middleware └── Database Utilities

---

# Installation Guide

## Requirements

Before running Voxa locally, install:

- Node.js
- PostgreSQL
- Git


## Clone Repository

`bash
git clone https://github.com/ComputerScienceMoor/multilingual-speech-to-text-converter.git
Navigate into the project:
cd Voxa

Backend Setup
Navigate to the backend folder:
cd backend
Install dependencies:
npm install
Create a .env file:
DATABASE_URL=your_database_connection
JWT_SECRET=your_secret_key

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

PAYSTACK_SECRET_KEY=your_paystack_key

SMTP_HOST=your_smtp_host
SMTP_USER=your_email
SMTP_PASS=your_password
Initialize the database:
npm start
The server will run on:
http://localhost:3000


## How To Use The Application

# Creating an Account
Open the application.
Click Sign Up.
Enter your details.
Login using your account.
Speech-to-Text Conversion
Login to your account.
Open the transcription page.
Select language settings.
Record or upload speech.
Convert speech into text.

# Translation
Enter or generate text.
Select target language.
Translate the content.

# Subscription
Users can upgrade to Pro to access higher usage limits and additional features.

# User Access Levels
# Account Type                  Description              
Guest                           Limited access without account
Free User                       Basic transcription features
Pro User                        Increased limits and premium features
Admin                           System management
Owner                           Full platform control

# Project Folder Structure
backend
│
├── frontend
│
├── routes
│   ├── auth.js
│   ├── user.js
│   ├── ai.js
│   ├── billing.js
│   ├── admin.js
│   └── owner.js
│
├── services
│   ├── google.js
│   ├── mail.js
│   └── paystack.js
│
├── middleware
│
├── utils
│
└── server.js

# Security Features
Password encryption using bcrypt
JWT-based authentication
Protected API routes
Role-based access control
Secure payment verification
OAuth authentication

# Future Improvements
Future versions of Voxa may include:
Offline speech recognition
Mobile application version
More African language support
Advanced AI summarization
Voice emotion detection
Real-time collaborative transcription

# Author
Isreal Pelumi Ogundiji
Computer Science Department
Federal College of Animal Health and Production Technology
Moor Plantation, Ibadan, Nigeria

# License
This project was developed for academic purposes.
# multilingual-speech-to-text-converter
A multilingual speech to text converter by Ndcom/24/674
