// routes/userManagement.js
const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Profile = require('../models/Profile');
const JobApplication = require('../models/JobApplication');
const bcrypt = require('bcryptjs');


// Get all users with optional role filter - admin only
router.get('/users', protect, isAdmin, async (req, res) => {
    try {
      const { role } = req.query;
      let filter = {};
      
      // Apply role filter if provided
      if (role) {
        filter.role = role;
      }
      
      console.log('Fetching users with filter:', filter); // Add logging
      
      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 });
      
      console.log(`Found ${users.length} users`); // Log number of users found
      
      res.json({
        success: true,
        users
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching users'
      });
    }
  });

// Get user's job applications statistics
router.get('/users/:userId/applications', protect, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Make sure the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get total applications count
    const totalApplications = await JobApplication.countDocuments({ applicant: userId });
    
    // Get active applications count
    const activeApplications = await JobApplication.countDocuments({
      applicant: userId,
      status: { $in: ['pending', 'reviewed', 'shortlisted'] }
    });
    
    // Get applications by status
    const applicationsByStatus = await JobApplication.aggregate([
      { $match: { applicant: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Get applications by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const applicationsByDate = await JobApplication.aggregate([
      { 
        $match: { 
          applicant: userId,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json({
      success: true,
      totalApplications,
      activeApplications,
      applicationsByStatus,
      applicationsByDate
    });
  } catch (error) {
    console.error('Error fetching user applications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user applications'
    });
  }
});

// Get all applications for a user
router.get('/users/:userId/applications/list', protect, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, sort = 'newest', page = 1, limit = 10 } = req.query;
    
    // Build filter
    const filter = { applicant: userId };
    if (status) {
      filter.status = status;
    }
    
    // Build sort options
    let sortOption = { createdAt: -1 }; // Default: newest first
    if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get applications
    const applications = await JobApplication.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('job', 'title company location')
      .lean();
    
    // Get total count for pagination
    const totalApplications = await JobApplication.countDocuments(filter);
    
    res.json({
      success: true,
      applications,
      pagination: {
        total: totalApplications,
        page: parseInt(page),
        pages: Math.ceil(totalApplications / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user applications list:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user applications'
    });
  }
});

// Get user profile details
router.get('/users/:userId/profile', protect, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const profile = await Profile.findOne({ user: userId });
    
    res.json({
      success: true,
      user,
      profile
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user profile'
    });
  }
});

// Add a new user - admin only
router.post('/users', protect, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and password'
      });
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user (password will be hashed via pre-save middleware)
    const newUser = new User({
      name,
      email,
      password,
      role: role || 'user', // Default to user
      isActive: true
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User added successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive
      }
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
});

// Update user active status - admin only
router.patch('/users/:userId/status', protect, isAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deactivating themselves
    if (user._id.toString() === req.user.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    user.isActive = isActive;

    await user.save();

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user status'
    });
  }
});

// Update user details - admin only
router.put('/users/:userId', protect, isAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (role && ['user', 'recruiter', 'admin'].includes(role)) user.role = role;

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
});

// Delete user - admin only
router.delete('/users/:userId', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    await user.deleteOne();

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
});

// Get user's resume - admin only
router.get('/users/:userId/resume', protect, isAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Find the user's profile
      const profile = await Profile.findOne({ user: userId });
      
      if (!profile || !profile.resumePath) {
        return res.status(404).json({
          success: false,
          message: 'Resume not found for this user'
        });
      }
      
      // Check if it's a file URL or text content
      const isFileURL = profile.resumePath.startsWith('http') || profile.resumePath.startsWith('/uploads/');
      console.log(isFileURL)
      console.log(profile.resumePath)
      res.json({
        success: true,
        profile
      });
    } catch (error) {
      console.error('Error fetching user resume:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching user resume'
      });
    }
  });
module.exports = router;