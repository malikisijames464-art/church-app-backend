const express = require('express');
const { protect, adminOnly } = require('../middleware/auth');
const Department = require('../models/Department');
const User = require('../models/User');

const router = express.Router();

// ====================== CREATE DEPARTMENT ======================
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, leader } = req.body;

    const department = await Department.create({
      name,
      description,
      leader
    });

    // If leader is assigned, update user's department
    if (leader) {
      await User.findByIdAndUpdate(leader, { department: department._id });
    }

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ====================== GET ALL DEPARTMENTS ======================
router.get('/', protect, async (req, res) => {
  try {
    const departments = await Department.find()
      .populate('leader', 'name email photo')
      .populate('members', 'name email photo');
    
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== ADD MEMBER TO DEPARTMENT ======================
router.put('/:id/add-member', protect, adminOnly, async (req, res) => {
  try {
    const { memberId } = req.body;
    const department = await Department.findById(req.params.id);

    if (!department) return res.status(404).json({ message: 'Department not found' });

    // Add member to department
    if (!department.members.includes(memberId)) {
      department.members.push(memberId);
      await department.save();
    }

    // Update member's department
    await User.findByIdAndUpdate(memberId, { department: department._id });

    res.json({ success: true, message: 'Member added to department' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== REMOVE MEMBER FROM DEPARTMENT ======================
router.put('/:id/remove-member', protect, adminOnly, async (req, res) => {
  try {
    const { memberId } = req.body;
    const department = await Department.findById(req.params.id);

    if (!department) return res.status(404).json({ message: 'Department not found' });

    department.members = department.members.filter(id => id.toString() !== memberId);
    await department.save();

    // Remove department from user
    await User.findByIdAndUpdate(memberId, { department: null });

    res.json({ success: true, message: 'Member removed from department' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== UPDATE DEPARTMENT ======================
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, leader } = req.body;

    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        message: 'Department not found'
      });
    }

    // Remove old leader's department assignment if leader changed
    if (
      leader &&
      department.leader &&
      department.leader.toString() !== leader
    ) {
      await User.findByIdAndUpdate(department.leader, {
        department: null,
      });
    }

    department.name = name || department.name;
    department.description = description || department.description;
    department.leader = leader || department.leader;

    await department.save();

    // Assign department to new leader
    if (leader) {
      await User.findByIdAndUpdate(leader, {
        department: department._id,
      });
    }

    const updatedDepartment = await Department.findById(department._id)
      .populate('leader', 'name email photo')
      .populate('members', 'name email photo');

    res.json({
      success: true,
      message: 'Department updated successfully',
      department: updatedDepartment,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server Error',
      error: error.message,
    });
  }
});

// ====================== DELETE DEPARTMENT ======================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Department deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;