# Voxa | Multilingual Speech-to-Text Converter

Voxa is a web-based multilingual speech-to-text conversion platform designed to transform spoken language into digital text. It combines speech recognition, text processing, translation, and account management features to support accessible communication and improve productivity.

The platform allows users to convert speech into text, translate transcripts, format generated text, manage transcription history, and download their results.

This project was developed as part of the requirements for the National Diploma (ND) programme in Computer Science.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Installation and Setup](#installation-and-setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Using Voxa](#using-voxa)
- [User Roles](#user-roles)
- [Security](#security)
- [Future Enhancements](#future-enhancements)
- [Author](#author)
- [Academic Information](#academic-information)
- [License](#license)

---

## Project Overview

Voxa provides a web-based interface for speech transcription and related text-processing tasks.

The application follows a client-server architecture. The frontend provides the user interface, while the backend handles authentication, application logic, API requests, billing, and communication with external services.

The system uses PostgreSQL for data storage and integrates with selected third-party services for authentication, email delivery, payments, and AI-powered functionality.

### Project Objectives

The main objectives of Voxa are to:

- Convert spoken language into readable digital text.
- Support speech transcription across multiple languages.
- Provide translation and text-processing capabilities.
- Allow users to manage and retrieve previous transcripts.
- Provide account registration and authentication.
- Support subscription-based access and usage limits.
- Provide administrative tools for managing users and platform activity.

---

## Features

### User Features

- User registration and account authentication.
- Email and password login.
- Google OAuth authentication.
- Multilingual speech-to-text conversion.
- Translation between supported languages.
- AI-assisted text formatting and polishing.
- Transcription history management.
- Copying and downloading generated transcripts.
- User profile and account settings.
- Free and Pro subscription plans.
- Usage limits based on subscription level.

### Administrative Features

- Secure administrator authentication.
- Administrative dashboard.
- Registered-user overview.
- User account management.
- Subscription and payment monitoring.
- Revenue reporting.
- Platform statistics.

### Platform Owner Features

- Owner dashboard.
- Revenue monitoring.
- Administrator management.
- Platform management controls.

Feature availability depends on the implementation, account permissions, and configuration of the application.

---

## Technology Stack

### Frontend

- HTML5
- CSS3
- JavaScript
- Responsive web design

### Backend

- Node.js
- Express.js
- RESTful API architecture

### Database

- PostgreSQL

### Authentication and Security

- JSON Web Tokens (JWT)
- bcrypt password hashing
- Google OAuth 2.0
- Protected API routes
- Role-based access control

### External Services and Integrations

- Paystack for payment processing
- Nodemailer for email delivery
- Google authentication services
- Speech recognition and translation services

The availability of individual integrations depends on their implementation and the required API credentials.

---

## System Architecture

Voxa uses a modular client-server architecture.

The frontend communicates with the backend through HTTP requests. The backend processes requests, interacts with the database, applies authentication and authorization rules, and communicates with external services when required.

```text
Voxa
|
|-- Frontend
|   |-- User Interface
|   |-- Authentication Pages
|   |-- Application Dashboard
|   |-- Transcription Interface
|   |-- Account Settings
|   `-- Client-Side JavaScript
|
`-- Backend
    |-- Express Server
    |
    |-- Routes
    |   |-- Authentication
    |   |-- User Management
    |   |-- AI Services
    |   |-- Billing
    |   |-- Administration
    |   `-- Platform Owner
    |
    |-- Services
    |   |-- Google Authentication
    |   |-- Email Delivery
    |   `-- Payment Processing
    |
    |-- Middleware
    |
    |-- Database Utilities
    |
    `-- PostgreSQL Database
```

---

## Project Structure

The repository contains the frontend and backend components of Voxa.

```text
Voxa/
|
|-- README.md
|
`-- backend/
    |
    |-- frontend/
    |   |-- assets/
    |   |-- index.html
    |   |-- login.html
    |   |-- signup.html
    |   |-- app.html
    |   |-- admin.html
    |   |-- owner.html
    |   `-- Other frontend pages and scripts
    |
    |-- middleware/
    |   `-- auth.js
    |
    |-- routes/
    |   |-- auth.js
    |   |-- user.js
    |   |-- ai.js
    |   |-- billing.js
    |   |-- admin.js
    |   `-- owner.js
    |
    |-- services/
    |   |-- google.js
    |   |-- mail.js
    |   `-- paystack.js
    |
    |-- utils/
    |   |-- db.js
    |   |-- dbInit.js
    |   `-- helpers.js
    |
    |-- server.js
    |-- package.json
    |-- package-lock.json
    |-- Dockerfile
    `-- fly.toml
```

The structure above highlights the principal application components. Additional files may exist in the repository.

---

## Requirements

Before installing Voxa locally, ensure that the following are available:

- Node.js
- npm
- PostgreSQL database access
- Git
- A modern web browser

Depending on the features being used, you may also need credentials for Google OAuth, Paystack, email delivery, and speech recognition or translation services.

---

## Installation and Setup

### 1. Clone the Repository

Clone the repository from GitHub:

```bash
git clone https://github.com/isrealpelumiogundiji/multilingual-speech-to-text-converter.git
```

Navigate into the project directory:

```bash
cd voxa-backup
```

### 2. Navigate to the Backend

```bash
cd backend
```

### 3. Install Dependencies

Install the dependencies specified in `package.json`:

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file inside the `backend` directory.

Add the environment variables required by the application. See the example below.

### 5. Configure the Database

Create or obtain access to a PostgreSQL database.

Set the database connection string in the `.env` file and ensure that the database is accessible to the backend.

If the project includes database initialization scripts, follow the initialization process implemented by the application.

### 6. Configure External Services

If you intend to use the related functionality, configure the required credentials for:

- Google OAuth
- Paystack
- Email delivery
- Speech recognition and translation services

Use the exact variable names expected by the backend source code.

---

## Environment Configuration

Example `.env` configuration:

```env
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

PAYSTACK_SECRET_KEY=your_paystack_secret_key

SMTP_HOST=your_smtp_host
SMTP_USER=your_email_address
SMTP_PASS=your_email_password
```

**Important configuration notes:**

- These values are placeholders, not working credentials.
- Replace them with the appropriate values for your environment.
- The variable names must match those referenced in the backend code.
- Never commit your actual `.env` file to GitHub.
- Do not expose database passwords, API keys, authentication secrets, or email credentials.
- Keep production credentials separate from development credentials.

---

## Running the Application

After completing the installation and configuration steps, start the backend using the appropriate command defined in `package.json`.

If the project defines the `start` script, run:

```bash
npm start
```

If the server starts successfully, use the local address and port configured by the application.

For example, if the server uses port 3000:

```text
http://localhost:3000
```

The actual address depends on the server configuration and the way the frontend is served.

If the frontend is served separately during development, start it using the development method appropriate for your project.

---

## Using Voxa

### Creating an Account

1. Open the application.
2. Navigate to the registration page.
3. Enter the required account details.
4. Submit the registration form.
5. Sign in using the available authentication method.

### Speech-to-Text Conversion

1. Sign in to your account.
2. Open the transcription interface.
3. Select a supported language.
4. Record speech or upload audio if the application supports uploading.
5. Start the transcription process.
6. Review the generated text.
7. Copy or download the result when the relevant options are available.

### Text Translation

1. Enter text or generate a transcript.
2. Select a supported target language.
3. Start the translation process.
4. Review the translated result.

### Transcript Management

Users can access the available transcript-management features to review previous conversions, retrieve saved text, and manage their transcription history.

### Subscription Management

Users can access the subscription features available to their accounts.

Free and Pro plans may provide different usage limits and functionality, depending on the application's configuration.

---

## User Roles

Voxa supports different account roles.

| Role | Description |
|---|---|
| Guest | Access to any functionality available without authentication. |
| Free User | Access to the features and usage limits assigned to the free plan. |
| Pro User | Access to the features and usage limits assigned to the Pro plan. |
| Admin | Access to authorized administrative functions. |
| Owner | Access to authorized platform-owner functions. |

Access to protected features is determined by the application's authentication and authorization logic.

---

## Security

Voxa incorporates security mechanisms intended to protect accounts, application endpoints, and sensitive operations.

These include:

- Password hashing using bcrypt.
- JWT-based authentication.
- Protected API endpoints.
- Role-based access control.
- Google OAuth authentication.
- Environment-based configuration of secrets.
- Payment verification through the payment integration.

Security depends on correct implementation, configuration, and maintenance of these mechanisms.

---

## Future Enhancements

Potential future improvements include:

- Expanded support for African languages.
- Offline speech recognition.
- A dedicated mobile application.
- Advanced AI-powered summarization.
- Voice emotion analysis.
- Real-time collaborative transcription.
- Additional accessibility features.
- Further improvements to transcription accuracy and performance.

These items represent possible future developments and should not be interpreted as currently available functionality.

---

## Author

**Isreal Pelumi Ogundiji**

Department of Computer Science  
Federal College of Animal Health and Production Technology  
Moor Plantation, Ibadan, Nigeria

### Academic Information

Programme: National Diploma (ND) in Computer Science

Matriculation Number: NDCOM/24/674

---

## License

This project was developed for academic purposes as part of the National Diploma programme in Computer Science.

The publication of this repository does not, by itself, grant permission to reuse, modify, or redistribute its contents. Contact the author for permission unless a separate applicable license states otherwise.

---

## Project Information

**Project Name:** Voxa

**Project Title:** Design and Implementation of a Multilingual Speech-to-Text Converter

**Repository:** `multilingual-speech-to-text-converter`

**Developed by:** Isreal Pelumi Ogundiji