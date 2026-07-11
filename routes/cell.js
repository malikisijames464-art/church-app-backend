const express = require("express");
const router = express.Router();

const Cell = require("../models/Cell");

const { protect, adminOnly } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {

    const cells = await Cell.find().sort({
      name: 1,
    });

    res.json(cells);

  } catch (err) {

    res.status(500).json({
      message: err.message,
    });

  }
});

router.post(
  "/",
  protect,
  adminOnly,
  async (req, res) => {

    try {

      const cell = await Cell.create(req.body);

      res.json(cell);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

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

      res.json(cell);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

router.delete(
  "/:id",
  protect,
  adminOnly,
  async (req, res) => {

    try {

      await Cell.findByIdAndDelete(req.params.id);

      res.json({
        message: "Deleted",
      });

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

module.exports = router;