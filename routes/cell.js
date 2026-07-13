const express = require("express");

const router = express.Router();

const Cell = require("../models/Cell");

const { protect, adminOnly } = require("../middleware/auth");


// GET ALL CELLS

router.get("/", async (req, res) => {
  try {

    let cells = await Cell.find().sort({ name: 1 });

    res.json(cells);

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
});


// CREATE CELL (ADMIN)

router.post(

  "/",

  protect,

  adminOnly,

  async (req, res) => {

    try {

      const cell = await Cell.create(req.body);

      res.status(201).json(cell);

    } catch (error) {

      res.status(500).json({
        message: error.message,
      });

    }

  }

);


// UPDATE CELL (ADMIN)

router.put(

  "/:id",

  protect,

  adminOnly,

  async (req, res) => {

    try {

      const cell = await Cell.findByIdAndUpdate(

        req.params.id,

        req.body,

        {
          new: true,
          runValidators: true,
        }

      );

      if (!cell) {

        return res.status(404).json({
          message: "Cell not found",
        });

      }

      res.json(cell);

    } catch (error) {

      res.status(500).json({
        message: error.message,
      });

    }

  }

);


// DELETE CELL (ADMIN)

router.delete(

  "/:id",

  protect,

  adminOnly,

  async (req, res) => {

    try {

      const cell = await Cell.findByIdAndDelete(req.params.id);

      if (!cell) {

        return res.status(404).json({
          message: "Cell not found",
        });

      }

      res.json({
        message: "Cell deleted successfully",
      });

    } catch (error) {

      res.status(500).json({
        message: error.message,
      });

    }

  }

);


module.exports = router;