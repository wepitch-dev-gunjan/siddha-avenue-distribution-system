const express = require("express");
const { addProduct, getProductById, getAllProducts, addProductsFromCSV } = require("../controllers/productController");
const { upload } = require("../services/fileUpload");
const router = express.Router();

router.post("/product/add", addProduct);
router.get("/product/by-id/:productId", getProductById);
router.get("/product/get-all-products", getAllProducts);

router.post("/product/add-by-csv", upload.single("file"), addProductsFromCSV);

module.exports = router;