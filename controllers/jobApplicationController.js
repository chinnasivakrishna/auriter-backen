// controllers/jobApplicationController.js
const JobApplication = require('../models/JobApplication');
const Job = require('../models/Job');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { analyzeApplicationResume } = require('./applicationResumeController');
const ResumeAnalysis = require('../models/ResumeAnalysis');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

exports.generateApplicationText = async (req, res) => {
  console.log('------- Generate Application Text -------');
  console.log('Full Request Object:', {
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers
  });

  try {
    const { jobTitle, company, skills = [], requirements = [], type } = req.body;

    // Validate input with more detailed checks
    if (!jobTitle || !company || !type) {
      console.error('Validation Failed', { 
        jobTitle: !!jobTitle, 
        company: !!company, 
        type: !!type 
      });
      return res.status(400).json({ 
        message: 'Invalid input. Missing required fields',
        details: {
          jobTitle: !!jobTitle,
          company: !!company,
          type: !!type
        }
      });
    }

    const promptTemplates = {
      coverLetter: `Generate a professional cover letter for a job application. 

Job Details:
- Job Title: ${jobTitle}
- Company: ${company}
- Required Skills: ${skills.join(', ')}
- Key Requirements: ${requirements.join(', ')}

Please write a compelling, concise cover letter that:
- Highlights the applicant's relevant skills and experience
- Shows enthusiasm for the role and company
- Demonstrates how the applicant meets the job requirements
- Is no more than 250-300 words
- Uses a professional and engaging tone`,

      additionalNotes: `Generate additional notes for a job application. 

Job Details:
- Job Title: ${jobTitle}
- Company: ${company}
- Required Skills: ${skills.join(', ')}
- Key Requirements: ${requirements.join(', ')}

Please write additional notes that:
- Provide context about the applicant's career goals
- Highlight any unique qualifications not covered in the resume
- Explain any gaps or transitions in the applicant's career
- Demonstrate alignment with the company's values or mission
- Are professional, honest, and no more than 150-200 words`
    };

    // Generate text using OpenAI (existing code)
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a professional career coach helping job applicants create compelling application materials."
        },
        {
          role: "user",
          content: promptTemplates[type]
        }
      ],
      max_tokens: type === 'coverLetter' ? 350 : 250,
      temperature: 0.7
    });

    const generatedText = response.choices[0].message.content.trim();

    res.json({ 
      generatedText,
      type 
    });
  } catch (error) {
    console.error('Generate Text Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({ 
      message: 'Failed to generate text',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// In jobApplicationController.js
exports.getAllCompanyApplications = async (req, res) => {
  try {
    // Get all jobs posted by the recruiter
    const recruiterJobs = await Job.find({ recruiter: req.user.id });
    const jobIds = recruiterJobs.map(job => job._id);

    // Get all applications for these jobs with interviewRoomId
    const applications = await JobApplication.find({
      job: { $in: jobIds }
    })
    .populate('applicant', 'name email')
    .populate('job', 'title company type')
    .select('applicant job status createdAt interviewRoomId') // Explicitly select interviewRoomId
    .sort({ createdAt: -1 });

    // Log applications with their interview room IDs
    applications.forEach(app => {
      console.log('Backend - Application:', {
        id: app._id,
        interviewRoomId: app.interviewRoomId || 'No room assigned'
      });
    });

    const applicationStats = {
      total: applications.length,
      pending: applications.filter(app => app.status === 'pending').length,
      reviewed: applications.filter(app => app.status === 'reviewed').length,
      shortlisted: applications.filter(app => app.status === 'shortlisted').length,
      rejected: applications.filter(app => app.status === 'rejected').length
    };

    res.json({
      applications,
      stats: applicationStats
    });
  } catch (error) {
    console.error('Error in getAllCompanyApplications:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.searchApplications = async (req, res) => {
  try {
    const { searchTerm, status, jobType, jobId } = req.query;
    
    let query = {};

    // If jobId is provided, filter by specific job
    if (jobId) {
      query.job = jobId;
    } else {
      // Get all recruiter's jobs
      const recruiterJobs = await Job.find({ recruiter: req.user.id });
      query.job = { $in: recruiterJobs.map(job => job._id) };
    }

    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add job type filter if provided
    if (jobType && jobType !== 'all') {
      const jobsOfType = recruiterJobs
        .filter(job => job.type === jobType)
        .map(job => job._id);
      query.job = { $in: jobsOfType };
    }

    // Get applications with interviewRoomId
    let applications = await JobApplication.find(query)
      .populate('applicant', 'name email')
      .populate('job', 'title company type')
      .select('applicant job status createdAt interviewRoomId') // Explicitly select interviewRoomId
      .sort({ createdAt: -1 });

    // Apply search term filter if provided
    if (searchTerm) {
      applications = applications.filter(app => 
        app.applicant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.applicant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.job.company.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    const stats = {
      total: applications.length,
      pending: applications.filter(app => app.status === 'pending').length,
      reviewed: applications.filter(app => app.status === 'reviewed').length,
      shortlisted: applications.filter(app => app.status === 'shortlisted').length,
      rejected: applications.filter(app => app.status === 'rejected').length
    };

    res.json({
      applications,
      stats
    });
  } catch (error) {
    console.error('Error in searchApplications:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getUserApplications = async (req, res) => {
  try {
    const applications = await JobApplication.find({ applicant: req.user.id })
      .populate('job', 'title company status')
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.applicationId);
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const job = await Job.findOne({
      _id: application.job,
      recruiter: req.user.id
    });

    if (!job) {
      return res.status(403).json({ message: 'Not authorized to update this application' });
    }

    application.status = req.body.status;
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.submitApplication = async (req, res) => {
  let uploadedFileName;
  
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'active') {
      return res.status(400).json({ message: 'This job is no longer accepting applications' });
    }

    const existingApplication = await JobApplication.findOne({
      job: req.params.jobId,
      applicant: req.user.id
    });

    if (existingApplication) {
      return res.status(400).json({ message: 'You have already applied for this job' });
    }

    if (!req.files || !req.files.resume) {
      return res.status(400).json({ message: 'Resume is required' });
    }

    const resumeFile = req.files.resume;
    const fileExt = path.extname(resumeFile.name);
    uploadedFileName = `${req.user.id}-${Date.now()}${fileExt}`;
    const uploadPath = path.join(__dirname, '../uploads/resumes', uploadedFileName);

    // Move the file to uploads directory
    await resumeFile.mv(uploadPath);

    // Create the job application
    const application = new JobApplication({
      job: req.params.jobId,
      applicant: req.user.id,
      resume: uploadedFileName,
      coverLetter: req.body.coverLetter,
      additionalNotes: req.body.additionalNotes
    });

    await application.save();

    // Create a response object that we'll build up
    const response = {
      success: true,
      application
    };

    // Try to analyze the resume
    try {
      // Modified to create a mock response object
      const mockRes = {
        json: (data) => data
      };

      const analysisResponse = await analyzeApplicationResume({
        body: {
          resumeUrl: uploadedFileName,
          jobId: req.params.jobId
        }
      }, mockRes);

      // If we got analysis data back, store it and add to response
      if (analysisResponse && analysisResponse.data) {
        const analysis = await ResumeAnalysis.create({
          application: application._id,
          feedback: analysisResponse.data.feedback,
          keyFindings: analysisResponse.data.keyFindings,
          suggestions: analysisResponse.data.suggestions
        });

        response.analysis = analysisResponse.data;
      }
    } catch (analysisError) {
      console.error('Resume analysis error:', analysisError);
      // Add a warning to the response but don't fail the application
      response.warning = 'Resume analysis service temporarily unavailable';
    }

    return res.status(201).json(response);

  } catch (error) {
    // Clean up uploaded file if there's an error
    if (uploadedFileName) {
      const uploadPath = path.join(__dirname, '../uploads/resumes', uploadedFileName);
      if (fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }
    }
    return res.status(400).json({ message: error.message });
  }
};


// Add new route to get analysis for an application
exports.getApplicationAnalysis = async (req, res) => {
  try {
    const analysis = await ResumeAnalysis.findOne({
      application: req.params.applicationId
    });

    if (!analysis) {
      return res.status(404).json({ message: 'Analysis not found' });
    }

    // Check if user has permission to view this analysis
    const application = await JobApplication.findById(req.params.applicationId)
      .populate('job');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Allow access if user is the applicant or the job recruiter
    if (
      application.applicant.toString() !== req.user.id &&
      application.job.recruiter.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to view this analysis' });
    }

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getApplicationsByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Verify the job belongs to the recruiter
    const job = await Job.findOne({
      _id: jobId,
      recruiter: req.user.id
    });

    if (!job) {
      return res.status(403).json({ message: 'Not authorized to view these applications' });
    }

    const applications = await JobApplication.find({ job: jobId })
      .populate('applicant', 'name email')
      .populate('job', 'title company type')
      .sort({ createdAt: -1 });

    console.log('Found applications:', applications); // Add this debug log

    res.json({
      applications,
      job
    });
  } catch (error) {
    console.error('Error in getApplicationsByJob:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.applicationId)
      .populate('applicant', 'name email')
      .populate('job', 'title company type');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Verify the job belongs to the recruiter
    const job = await Job.findOne({
      _id: application.job._id,
      recruiter: req.user.id
    });

    if (!job) {
      return res.status(403).json({ message: 'Not authorized to view this application' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getApplicationResume = async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.applicationId);
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Verify the job belongs to the recruiter
    const job = await Job.findOne({
      _id: application.job,
      recruiter: req.user.id
    });

    if (!job) {
      return res.status(403).json({ message: 'Not authorized to view this resume' });
    }

    const resumePath = path.join(__dirname, '../uploads/resumes', application.resume);
    
    if (!fs.existsSync(resumePath)) {
      return res.status(404).json({ message: 'Resume file not found' });
    }

    res.sendFile(resumePath);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

 
  