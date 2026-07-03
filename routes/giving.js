const express = require('express');

const router = express.Router();

const Giving = require('../models/Giving');

const { protect, adminOnly } = require('../middleware/auth');

router.get("/", async (req, res) => {
  try {

    const defaults = [
      {
        category: "Tithes",
        mtnNumber: "0771234567",
        airtelNumber: "0701234567",
        bankName: "Stanbic Bank",
        accountName: "Grace Chapel Ministries",
        accountNumber: "9030012345678",
      },
      {
        category: "Offerings",
        mtnNumber: "0772345678",
        airtelNumber: "0702345678",
        bankName: "Centenary Bank",
        accountName: "Grace Chapel Ministries",
        accountNumber: "3100987654321",
      },
      {
        category: "Building Project",
        mtnNumber: "0773456789",
        airtelNumber: "0703456789",
        bankName: "DFCU Bank",
        accountName: "Grace Chapel Building Fund",
        accountNumber: "0150456789012",
      },
      {
        category: "Outreach",
        mtnNumber: "0774567890",
        airtelNumber: "0704567890",
        bankName: "Absa Bank Uganda",
        accountName: "Grace Chapel Outreach",
        accountNumber: "6005678901234",
      },
      {
        category: "Special Seed",
        mtnNumber: "0775678901",
        airtelNumber: "0705678901",
        bankName: "Equity Bank",
        accountName: "Grace Chapel Ministries",
        accountNumber: "1004789012345",
      },
    ];

    // TEMPORARY: upserts sample data on every GET so you can see it on the frontend.
    // Revert this back to the findOne/skip-if-exists version (or remove entirely)
    // before going to production, since this overwrites any real edits admins make.
    for (const item of defaults) {
      await Giving.findOneAndUpdate(
        { category: item.category },
        item,
        { upsert: true, new: true }
      );
    }

    const giving = await Giving.find().sort({ category: 1 });

    res.json(giving);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

router.put('/:id',

protect,
adminOnly,

async(req,res)=>{

const giving = await Giving.findByIdAndUpdate(

req.params.id,

req.body,

{new:true}

);

res.json(giving);

});
// DELETE route
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const giving = await Giving.findByIdAndDelete(req.params.id);
    if (!giving) return res.status(404).json({ message: 'Giving option not found' });
    res.json({ message: 'Giving option deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post(

'/',

protect,
adminOnly,

async(req,res)=>{

const giving = await Giving.create(req.body);

res.json(giving);

});

module.exports = router;