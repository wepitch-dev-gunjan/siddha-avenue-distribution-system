const express = require("express");
const { addProduct, getProductById, getAllProducts } = require("../controllers/productController");
const router = express.Router();

router.post("/product/add", addProduct);
router.get("/product/by-id/:productId", getProductById);
router.get("/product/get-all-products", getAllProducts);

module.exports = router;