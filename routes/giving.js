const express = require('express');

const router = express.Router();

const Giving = require('../models/Giving');

const { protect, adminOnly } = require('../middleware/auth');

router.get("/", async (req, res) => {
  try {
    let giving = await Giving.find().sort({ category: 1 });

    // Only insert default records if the collection is empty
    if (giving.length === 0) {
      const defaults = [
        {
          category: "Tithes",
          mtnNumber: "0779293045",
          airtelNumber: "0751585414",
          bankName: "Equity Bank",
          accountName: "Tonny Blair",
          accountNumber: "1035101801197",
        },
        {
          category: "Offerings",
          mtnNumber: "0779293045",
          airtelNumber: "0751585414",
          bankName: "Equity Bank",
          accountName: "Tonny Blair",
          accountNumber: "1035101801197",
        },
        {
          category: "Building Project",
          mtnNumber: "0779293045",
          airtelNumber: "0751585414",
          bankName: "Equity Bank",
          accountName: "Tonny Blair",
          accountNumber: "1035101801197",
        },
        {
          category: "Outreach",
          mtnNumber: "0779293045",
          airtelNumber: "0751585414",
          bankName: "Equity Bank",
          accountName: "Tonny Blair",
          accountNumber: "1035101801197",
        },
        {
          category: "Special Seed",
          mtnNumber: "0779293045",
          airtelNumber: "0751585414",
          bankName: "Equity Bank",
          accountName: "Tonny Blair",
          accountNumber: "1035101801197",
        },
      ];

      await Giving.insertMany(defaults);

      giving = await Giving.find().sort({ category: 1 });
    }

    res.json(giving);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

router.put(
  "/:id",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const giving = await Giving.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!giving) {
        return res.status(404).json({
          message: "Giving option not found",
        });
      }

      res.json(giving);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);
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