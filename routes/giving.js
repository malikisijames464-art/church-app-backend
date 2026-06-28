const express = require('express');

const router = express.Router();

const Giving = require('../models/Giving');

const { protect, adminOnly } = require('../middleware/auth');

router.get('/', async(req,res)=>{

const giving = await Giving.find();

res.json(giving);

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