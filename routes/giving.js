const express = require('express');

const router = express.Router();

const Giving = require('../models/Giving');

const { protect, adminOnly } = require('../middleware/auth');

router.get("/", async (req, res) => {
  try {

    const defaults = [
      "Tithes",
      "Offerings",
      "Building Project",
      "Outreach",
      "Special Seed",
    ];

    // Create missing categories
    for (const category of defaults) {
      const exists = await Giving.findOne({ category });

      if (!exists) {
        await Giving.create({ category });
      }
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