# 🏭 APAB Inspection App
<p align="center">
<img src="https://img.shields.io/badge/Python-3.x-blue.svg" alt="Python Version">
<img src="https://img.shields.io/badge/Flask-Framework-lightgrey.svg" alt="Flask Framework">
<img src="https://img.shields.io/badge/PWA-Enabled-green.svg" alt="PWA Enabled">
<img src="https://img.shields.io/badge/Docker-Containerized-blue.svg" alt="Docker Containerized">
</p>

## Table of Contents
- [About the Project](#about-the-project)
- [Features](#features)
  - [Current Features](#current-features)
  - [Future Enhancements](#future-enhancements)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development Setup](#local-development-setup)
  - [Accessing the Application](#accessing-the-application)
- [Database Management](#database-management)
  - [Switching Between Production and Test Database](#switching-between-production-and-test-database)
  - [Testing Database Connection](#testing-database-connection)
- [Deployment](#deployment)
  - [Docker Hub Push](#docker-hub-push)
  - [Cloud Deployment](#cloud-deployment)
  - [Local Server Deployment](#local-server-deployment)
- [PWA & Offline Capability](#pwa--offline-capability)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About the Project

The APAB Inspection App is a highly specialized web application designed for industrial inspection processes, particularly for factory machinery and production lines. It serves a very niche purpose: to digitize and streamline the workflow of inspectors who traditionally work with Word documents, often in environments with limited or no internet connectivity. This application simplifies the inspection process by allowing users to upload a .docx template, fill out inspection details, and then generate comprehensive Word reports. Its core strength lies in its ability to facilitate data collection for highly specific inspection points and later compile this into structured documentation.

## Features
### Current Features
.docx Upload & Parsing: Upload existing Word document inspection templates. The application parses the document, extracting "Station" headings and associated inspection tables.<br>
Interactive Web Editor: Provides a web-based interface to fill in comments and inspection statuses directly within the parsed document structure.<br>
Dynamic Status Updates: Automatically updates inspection status (e.g., "OK", "Anm.") based on comments entered by the user.<br>
Offline Capability (PWA): Functions as a Progressive Web App (PWA), allowing inspectors to work offline. Core UI and editing functionalities are available without an internet connection.<br>
Local JSON Temporary Save: Users can save their current inspection progress as a .json file locally on their device, enabling them to continue working offline at a later time.<br>
JSON Merge Functionality: Support for merging comments from multiple locally saved .json files (e.g., from different inspectors on the same machine) into a single, comprehensive report. This is designed for a scenario where different personnel inspect different parts of a machine simultaneously.<br>
Word Document Export: Generates a final, formatted .docx inspection report.<br>
This report includes: A dynamically generated summary table of all significant comments/deviations.<br>
Pre-filled customer, machine, date, and signature details.<br>
Structured inspection data from the interactive editor.<br>
Machine-Specific History: Displays a historical overview of past comments and issues for a given machine, aiding inspectors in identifying recurring problems.<br>
Robust Database Integration: Stores inspection records and comments in a PostgreSQL database (or local SQLite for development).<br>
Dockerized Deployment: The entire application (Flask backend, frontend, and PostgreSQL databases) is containerized with Docker for consistent and portable deployment across different environments.<br>
Online/Offline Indicator: Provides visual feedback to the user on the application's current network status, indicating when server-dependent features (like Word export) are available.<br>


### Future Enhancements (Planned)
Dedicated Merge UI: A specific user interface to visually manage and potentially resolve conflicts during the JSON merge process.

Machine Backlog: A feature to create and track a quick backlog of issues per machine, directly linked to inspection data.

Enhanced Navigation & Pages:

    - A dedicated home/dashboard page.
    - A searchable history page for past inspections (by customer, machine).
    - A new section for creating and managing service reports.

## Getting Started
To get a local copy up and running, follow these simple steps.

### Prerequisites
    Git
    
    Docker Desktop (for local development and database management)
    
    Python 3.x (for running Python scripts outside Docker, e.g., test_db_connection.py)
    
### Local Development Setup 
#### (with Docker Compose)

#### 1. Clone the repository:

```bash
    git clone https://github.com/kraemrz/apab.git
    cd apab
```

#### 2. Create your .env file:
In the root of the project, create a file named .env (it is in .gitignore and should not be committed).

Populate it with your database connection details. This setup supports separate production and test databases.

```env  
    # .env
    # --- PRODUCTION DATABASE (e.g., Supabase, or your local db-prod service) ---
    DATABASE_URL="postgres://your_prod_user:your_prod_password@your_prod_host:5432/your_prod_database_name"

    # --- TEST/DEVELOPMENT DATABASE (local Docker Compose) ---
    # When USE_TEST_DB is True, this URL is used. Note 'localhost' and port '5433'.
    DATABASE_URL_TEST="postgres://apab_test_user:your_test_db_password@localhost:5433/test_apab_db"

    # --- CONTROL WHICH DATABASE TO USE LOCALLY (True/False) ---
    USE_TEST_DB=True

    # --- OTHER ENVIRONMENT VARIABLES (e.g., Flask SECRET_KEY) ---
    # SECRET_KEY="a_very_secret_key_for_flask_sessions"
```

**IMPORTANT:** Replace your_prod_user, your_prod_password, your_prod_host, your_prod_database_name, apab_test_user, your_test_db_password, test_apab_db with your actual desired credentials.

When USE_TEST_DB=True, the app container will connect to db-test internally (via db-test:5432 from its perspective) and local scripts will connect via localhost:5433.

#### 3. Build and run the Docker Compose setup:

This command will build your application's Docker image, pull the PostgreSQL images, and start all services defined in docker-compose.yml.

```bash
    docker compose up -d --build
```

--build ensures your application image is rebuilt with the latest code.

db-prod will be exposed on localhost:5432.

db-test will be exposed on localhost:5433.

app will be exposed on localhost:5000.

### Accessing the Application

Once docker compose up -d completes, you can access the application:

Open your web browser and navigate to http://localhost:5000.

## Database Management
Switching Between Production and Test Database

The application determines which database to connect to based on the USE_TEST_DB environment variable (defined in your local .env or in your deployment environment like Render).

    Locally: Edit USE_TEST_DB=True or USE_TEST_DB=False in your .env file and restart your app container: docker compose restart app.

    Deployment (e.g., Render): Configure USE_TEST_DB in your service's environment variables dashboard. For production, set it to False and ensure DATABASE_URL points to your production database (e.g., Supabase).

Testing Database Connection

You can test the database connection directly (outside the Docker container for the app) using a helper script.

Ensure db-test (or db-prod) is running:

```bash
     docker compose up -d db-test # Or db-prod
```

Run the test script:

Ensure your .env is configured for the database you want to test (e.g., USE_TEST_DB=True for db-test).

```bash       
    python test_db_connection.py
```

This script will also create the necessary tables (Inspection, InspectionComment) if they don't exist in the selected database.

## Deployment

### Docker Hub Push

To update your Docker images on Docker Hub for sharing or deployment:
Log in to Docker Hub:
 ```bash    
    docker login
```

Ensure your local Git branch is updated:
```bash

    git checkout main # Or feature/branch-name
    git pull origin main
    # If you have local changes you want to commit before build/push:
    # git add .
    # git commit -m "Your commit message"
    # git push origin main
```

Build and push the image using the automation script:

```bash        
    python automate_build.py
```

This script will commit (if pending changes), push to GitHub, rebuild your Docker image, and push it to kraemrz/apab:latest (or :old for no_tmp_save branch).

### Cloud Deployment (e.g., Render)

For cloud deployment (like Render), your Docker image on Docker Hub is pulled and run. Ensure:

    Your Dockerfile uses Gunicorn (not Flask's dev server).

    DATABASE_URL (and USE_TEST_DB=False) are set correctly in your Render service's environment variables, pointing to your production Supabase database.

    You use a Session/Transaction Pooler connection string from Supabase (due to Render's IPv4-only nature).

### Local Server Deployment

For deploying to a dedicated local server (e.g., a mini-PC, Raspberry Pi):

    Install Docker on the server.

    Install a VPN server (e.g., OpenVPN, WireGuard) on the local server or router for secure remote access.

    Pull your Docker image: docker pull kraemrz/apab:latest

    Run the container:
```bash    
    docker run -d -p 5000:5000 \
               --env-file /path/to/server/.env \
               --name apab-prod \
               kraemrz/apab:latest
```
   Ensure your /path/to/server/.env contains your production DATABASE_URL and USE_TEST_DB=False.

## PWA & Offline Capability

The application is built as a Progressive Web App (PWA). This means:

    It can be "installed" on mobile devices (e.g., Android tablets) via the browser's "Add to Home Screen" feature.

    The Service Worker (sw.js) caches static assets, enabling offline usage of the interactive editor.

    Local JSON files can be saved and loaded while offline, allowing continued work without internet access.

    Server-dependent features (Word export, database history, .docx parsing) require an active internet connection to the deployed backend. A visual indicator in the UI shows the current online/offline status.

## Contributing

(Optional section - if you plan for others to contribute)
Contributions are welcome! Please open an issue to discuss proposed changes or submit pull requests.
## License

(Optional section - choose a license, e.g., MIT, GPL)
Distributed under the MIT License. See LICENSE for more information.

## Contact

kraemr - kraemrz@gmail.com
Project Link: https://github.com/kraemrz/apab
