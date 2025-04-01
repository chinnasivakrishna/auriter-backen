const AdminProfile = require('../models/AdminProfile');
const User = require('../models/User');

// @desc    Get company profile
// @route   GET /api/company/profile
// @access  Private (Recruiter only)
exports.getCompanyProfile = async (req, res) => {
  try {
    // Check if user is a recruiter
    const user = await User.findById(req.user.id);
    if (user.role !== 'recruiter') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Recruiter only route.'
      });
    }

    // Get company profile
    const profile = await AdminProfile.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found'
      });
    }

    res.json({
      success: true,
      data: {
        name: profile.companyName,
        industry: profile.industry,
        size: profile.companySize,
        location: profile.location,
        website: profile.website,
        position: profile.position,
        isComplete: profile.isComplete
      }
    });

  } catch (error) {
    console.error('Error in getCompanyProfile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update company profile
// @route   PUT /api/company/profile
// @access  Private (Recruiter only)
exports.updateCompanyProfile = async (req, res) => {
  try {
    // Check if user is a recruiter
    const user = await User.findById(req.user.id);
    if (user.role !== 'recruiter') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Recruiter only route.'
      });
    }

    const {
      name,
      industry,
      size,
      location,
      website,
      position
    } = req.body;

    // Find and update profile
    let profile = await AdminProfile.findOne({ user: req.user.id });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found'
      });
    }

    // Update fields
    profile.companyName = name || profile.companyName;
    profile.industry = industry || profile.industry;
    profile.companySize = size || profile.companySize;
    profile.location = location || profile.location;
    profile.website = website || profile.website;
    profile.position = position || profile.position;
    profile.isComplete = true;
    profile.updatedAt = Date.now();

    await profile.save();

    res.json({
      success: true,
      data: {
        name: profile.companyName,
        industry: profile.industry,
        size: profile.companySize,
        location: profile.location,
        website: profile.website,
        position: profile.position,
        isComplete: profile.isComplete
      }
    });

  } catch (error) {
    console.error('Error in updateCompanyProfile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Create company profile
// @route   POST /api/company/profile
// @access  Private (Recruiter only)
exports.createCompanyProfile = async (req, res) => {
  try {
    // Check if user is a recruiter
    const user = await User.findById(req.user.id);
    if (user.role !== 'recruiter') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Recruiter only route.'
      });
    }

    // Check if profile already exists
    let profile = await AdminProfile.findOne({ user: req.user.id });
    if (profile) {
      return res.status(400).json({
        success: false,
        message: 'Profile already exists'
      });
    }

    const {
      name,
      industry,
      size,
      location,
      website,
      position
    } = req.body;

    // Create new profile
    profile = new AdminProfile({
      user: req.user.id,
      companyName: name,
      industry,
      companySize: size,
      location,
      website,
      position,
      isComplete: true
    });

    await profile.save();

    res.status(201).json({
      success: true,
      data: {
        name: profile.companyName,
        industry: profile.industry,
        size: profile.companySize,
        location: profile.location,
        website: profile.website,
        position: profile.position,
        isComplete: profile.isComplete
      }
    });

  } catch (error) {
    console.error('Error in createCompanyProfile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 