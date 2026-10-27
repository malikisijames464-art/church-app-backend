const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ====================== REGISTER ======================

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, address } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name and password are required'
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Either email or phone number is required'
      });
    }

    const normalizedEmail = email
      ? email.toLowerCase().trim()
      : undefined;

    const normalizedPhone = phone
      ? phone.trim()
      : undefined;

    // Find an existing account/member
    const existingUser = await User.findOne({
      $or: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]
    }).select('+password');

    // =====================================================
    // EXISTING MEMBER WITHOUT PASSWORD
    // Allow them to complete registration.
    // =====================================================
    if (existingUser && !existingUser.password) {

      // If email belongs to another account, don't allow it
      if (
        normalizedEmail &&
        existingUser.email &&
        existingUser.email !== normalizedEmail
      ) {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered'
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      existingUser.name = name.trim();
      existingUser.password = hashedPassword;

      if (normalizedEmail) {
        existingUser.email = normalizedEmail;
      }

      if (normalizedPhone) {
        existingUser.phone = normalizedPhone;
      }

      if (address) {
        existingUser.address = address.trim();
      }

      await existingUser.save();

      const token = jwt.sign(
        {
          id: existingUser._id,
          role: existingUser.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      const userResponse = existingUser.toObject();
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        message: 'Registration completed successfully',
        token,
        user: userResponse
      });
    }

    // =====================================================
    // EXISTING REGISTERED ACCOUNT
    // =====================================================
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    // =====================================================
    // COMPLETELY NEW USER
    // =====================================================
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      address: address?.trim() || '',
      role: 'member'
    });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Register error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is already registered'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});


// ====================== LOGIN (Email OR Phone) ======================
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;   // identifier = email or phone

    if (!identifier || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email/Phone and password are required' 
      });
    }

    // Find user by email OR phone
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { phone: identifier }
      ]
    }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====================== GET CURRENT USER ======================
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('department', 'name');
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;