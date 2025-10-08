# 🏆 Certificate Generator

A secure web application for generating and managing digital certificates with admin controls and student eligibility verification.

## 🔒 Security Features

This application now uses environment variables for secure credential management:

### Environment Variables Setup

1. **Copy the example file:**
   ```bash
   copy .env.example .env
   ```

2. **Update your `.env` file with secure credentials:**
   ```env
   # Admin Credentials (REQUIRED)
   ADMIN_USER=your-admin-username
   ADMIN_PASS=your-secure-password

   # Server Configuration (REQUIRED) 
   PORT=3000
   SESSION_SECRET=your-super-secret-session-key

   # Application Settings (OPTIONAL)
   APP_NAME=Certificate Generator
   NODE_ENV=development
   ```

3. **Important Security Notes:**
   - The `.env` file is already added to `.gitignore` to prevent accidental commits
   - Never commit the `.env` file to version control
   - Use strong passwords for production environments
   - Change the `SESSION_SECRET` to a random, secure string

## 📋 Setup Instructions

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
1. Copy `.env.example` to `.env`
2. Update the credentials in your `.env` file
3. Make sure all required variables are set

### Step 3: Start the Server
```bash
node server.js
```

The server will validate that all required environment variables are present before starting.

## 🎯 How to Use

### Admin Panel
1. Navigate to `/admin-login.html`
2. Use your configured admin credentials from the `.env` file
3. Access the admin dashboard to manage the system

### Certificate Generation
1. Navigate to the main page
2. Enter student credentials
3. Only students with "eligible" or "well done" status can receive certificates

## 🔧 Features Included

### Security Features:
- ✅ Environment variable-based credential management
- ✅ No hardcoded passwords in source code
- ✅ Session-based admin authentication
- ✅ Eligibility-based certificate generation
- ✅ Secure session management

### Certificate Features:
- ✅ A4 Landscape format (1123×794px)
- ✅ Student eligibility verification
- ✅ PNG and PDF export
- ✅ Real-time preview
- ✅ Responsive design with hamburger navigation

## 🚀 Production Deployment

For production environments:

1. **Set strong credentials:**
   ```env
   ADMIN_USER=admin-production
   ADMIN_PASS=very-secure-password-123!@#
   SESSION_SECRET=random-64-character-string-for-session-encryption
   NODE_ENV=production
   ```

2. **Use HTTPS:** Always use HTTPS in production
3. **Regular Updates:** Keep dependencies updated
4. **Backup:** Regular backup of student data

## ⚠️ Important Notes

- **Never commit the `.env` file** - it contains sensitive credentials
- **Use strong passwords** - especially for production environments  
- **Secure your session secret** - use a long, random string
- **Regular security updates** - keep all dependencies updated

The application will not start without proper environment variables configured, ensuring security by default! 🔒