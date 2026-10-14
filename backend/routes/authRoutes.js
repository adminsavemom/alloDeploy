import express from 'express';
import crypto from 'crypto';
import { db } from '../services/db.js';
import { storageService } from '../services/storageService.js';

export const authRouter = express.Router();

// Helper to hash password with salt
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Helper to verify password
function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (err) {
    return false;
  }
}

// Create session token
function generateToken(userId) {
  return 'allo_' + crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid work email address.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();

    // Check if user already exists
    let existingUser = await db.getUserByEmail(cleanEmail);
    if (!existingUser) {
      existingUser = storageService.getLocalUserByEmail(cleanEmail);
    }

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const passwordHash = hashPassword(password);
    const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
    const handle = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    const avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanEmail)}`;

    const userPayload = {
      id: userId,
      email: cleanEmail,
      passwordHash,
      name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      handle,
      role: 'Admin / Owner',
      team: 'Engineering Team',
      avatar
    };

    let user;
    if (db.isDbConnected()) {
      try {
        user = await db.createUser(userPayload);
      } catch (err) {
        console.warn('DB create user failed, using local storage fallback:', err.message);
        user = storageService.createLocalUser(userPayload);
      }
    } else {
      user = storageService.createLocalUser(userPayload);
    }

    const token = generateToken(user.id);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        handle: user.handle,
        role: user.role,
        team: user.team,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user in DB or local storage
    let user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      user = storageService.getLocalUserByEmail(cleanEmail);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user.id);

    return res.json({
      success: true,
      message: 'Authenticated successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        handle: user.handle,
        role: user.role,
        team: user.team,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// PUT /api/auth/profile - Update username / display name
authRouter.put('/profile', async (req, res) => {
  try {
    const { id, email, name, handle } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }

    const cleanName = name.trim();
    const cleanHandle = (handle || cleanName.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')).trim();

    let updatedUser = null;

    if (db.isDbConnected()) {
      if (id) {
        updatedUser = await db.updateUser(id, { name: cleanName, handle: cleanHandle });
      } else if (email) {
        const u = await db.getUserByEmail(email);
        if (u) {
          updatedUser = await db.updateUser(u.id, { name: cleanName, handle: cleanHandle });
        }
      }
    }

    if (!updatedUser) {
      if (id) {
        updatedUser = storageService.updateLocalUser(id, { name: cleanName, handle: cleanHandle });
      } else if (email) {
        const u = storageService.getLocalUserByEmail(email);
        if (u) {
          updatedUser = storageService.updateLocalUser(u.id, { name: cleanName, handle: cleanHandle });
        }
      }
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser || {
        id,
        email,
        name: cleanName,
        handle: cleanHandle
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'Failed to update user profile.' });
  }
});

