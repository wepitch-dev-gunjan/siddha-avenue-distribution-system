const Product = require("../models/Product");

// Segments
const segments = [
  "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K",
  "Tab>40k", "Tab<40k", "Wearable"
];

// Function to get segment based on price and category
function getSegmentByPrice(price, category) {
  if (category === 'tab') {
    return price > 40000 ? 'Tab>40k' : 'Tab<40k';
  } else if (category === 'wearable') {
    return 'Wearable';
  } else { // Default to smartphone segment logic
    if (price >= 100000) return "100K";
    if (price >= 70000 && price < 100000) return "70-100K";
    if (price >= 40000 && price < 70000) return "40-70K";
    if (price > 40000) return "> 40 K";
    if (price <= 40000) return "< 40 K";
    if (price >= 30000 && price < 40000) return "30-40K";
    if (price >= 20000 && price < 30000) return "20-30K";
    if (price >= 15000 && price < 20000) return "15-20K";
    if (price >= 10000 && price < 15000) return "10-15K";
    if (price >= 6000 && price < 10000) return "6-10K";
  }
}

// Add Product API
exports.addProduct = async (req, res) => {
  try {
    const { Brand, Model, ProductCode, Price, Category, Status, Specs } = req.body;

    // Basic Validations
    if (!Brand || !Model || !Price || !Category) {
      return res.status(400).json({
        error: "Please provide all required fields: Brand, Model, Price, and Category."
      });
    }

    // Calculate segment based on price and category
    const Segment = getSegmentByPrice(Price, Category);

    // Check if the product code already exists in the database (optional)
    if (ProductCode) {
      const existingProduct = await Product.findOne({ ProductCode });
      if (existingProduct) {
        return res.status(400).json({
          error: "Product code already exists. Please provide a unique product code."
        });
      }
    }

    // Create a new Product with all fields
    const newProduct = new Product({
      Brand,
      Model,
      ProductCode,
      Price,
      Segment,
      Category,
      Status,
      Specs
    });

    // Save the new product to the database
    await newProduct.save();

    return res.status(200).json({
      message: "Product added successfully.",
      data: newProduct
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get product details by productId
exports.getProductById = async (req, res) => {
    try {
        const { productId } = req.params;

        // Find the product by ID
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        return res.status(200).json({ product });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};