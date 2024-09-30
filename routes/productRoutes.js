const express = require("express");
const { addProduct, getProductById } = require("../controllers/productController");
const router = express.Router();

router.post("/product/add", addProduct);
router.get("/product/by-id/:productId", getProductById);

module.exports = router;