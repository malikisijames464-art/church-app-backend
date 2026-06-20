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

router.post(

'/',

protect,
adminOnly,

async(req,res)=>{

const giving = await Giving.create(req.body);

res.json(giving);

});

module.exports = router;