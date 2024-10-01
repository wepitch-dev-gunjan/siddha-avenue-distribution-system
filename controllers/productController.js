const Product = require("../models/Product");
const csvParser = require("csv-parser");
const { Readable } = require("stream");

// Segments
const segments = [
  "100K", "70-100K", "40-70K", "> 40 K", "< 40 K", "30-40K", "20-30K", "15-20K", "10-15K", "6-10K",
  "Tab>40k", "Tab<40k", "Wearable"
];

// Function to get segment based on price and category
// function getSegmentByPrice(price, category) {
//   if (category === 'tab') {
//     return price > 40000 ? 'Tab>40k' : 'Tab<40k';
//   } else if (category === 'wearable') {
//     return 'Wearable';
//   } else { // Default to smartphone segment logic
//     if (price >= 100000) return "100K";
//     if (price >= 70000 && price < 100000) return "70-100K";
//     if (price >= 40000 && price < 70000) return "40-70K";
//     if (price > 40000) return "> 40 K";
//     if (price <= 40000) return "< 40 K";
//     if (price >= 30000 && price < 40000) return "30-40K";
//     if (price >= 20000 && price < 30000) return "20-30K";
//     if (price >= 15000 && price < 20000) return "15-20K";
//     if (price >= 10000 && price < 15000) return "10-15K";
//     if (price >= 6000 && price < 10000) return "6-10K";
//   }
// }

// Add Product API
function getSegmentByPrice(price, category) {
  if (category === 'tab') {
    return price > 40000 ? 'Tab>40k' : 'Tab<40k';
  } else if (category === 'wearable') {
    return 'Wearable';
  } else { // Default to smartphone segment logic
    if (price >= 100000) return "100K";
    if (price >= 70000) return "70-100K";
    if (price >= 40000) return "40-70K";
    if (price > 40000) return "> 40 K"; // This line is redundant given the 40-70K check above, so it's unnecessary
    if (price >= 30000) return "30-40K";
    if (price >= 20000) return "20-30K";
    if (price >= 15000) return "15-20K";
    if (price >= 10000) return "10-15K";
    if (price >= 6000) return "6-10K";
    return "< 6K"; 
  }
}


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

exports.getAllProducts = async (req, res) => {
    try {
        const { query } = req.query; // Get search query from request query string

        // Log the query for debugging purposes
        console.log("Search query:", query);

        // If query is empty, return all live products
        let products;
        if (!query || query.trim() === "") {
            products = await Product.find({ Status: 'live' });
        } else {
            // Convert query to lowercase
            const lowerCaseQuery = query.toLowerCase();

            // Find products that are "live" and match the search query in model, productCode, or category
            products = await Product.find({
                Status: 'live',
                $or: [
                    { Brand: { $regex: lowerCaseQuery, $options: 'i' } },
                    { Model: { $regex: lowerCaseQuery, $options: 'i' } },
                    { ProductCode: { $regex: lowerCaseQuery, $options: 'i' } },
                    { Category: { $regex: lowerCaseQuery, $options: 'i' } }
                ]
            });
        }

        if (products.length === 0) {
            return res.status(200).json({ message: 'No Matching Products Found' });
        }

        return res.status(200).json({ products });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Function to generate a unique product code using Brand, Model, and current timestamp
const generateProductCode = (brand, model) => {
  const sanitizedBrand = brand.replace(/\s+/g, '-').toUpperCase();
  const sanitizedModel = model.replace(/\s+/g, '-').toUpperCase();
  const timestamp = Date.now(); // Use current timestamp for uniqueness
  return `${sanitizedBrand}-${sanitizedModel}-${timestamp}`;
};

// API to upload CSV and add products
exports.addProductsFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    let results = [];

    if (req.file.originalname.endsWith(".csv")) {
      const stream = new Readable();
      stream.push(req.file.buffer);
      stream.push(null);

      stream
        .pipe(csvParser())
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', async () => {
          try {
            let newEntries = [];

            for (let data of results) {
              let { Brand, Model, ProductCode, Price, Category, Status, Specs } = data;

              if (!Brand || !Model || !Price || !Category) {
                console.log(`Missing required fields for product: ${Model}`);
                continue; // Skip rows with missing required fields
              }

              // Generate product code if missing
              if (!ProductCode) {
                ProductCode = generateProductCode(Brand, Model);
                console.log(`Generated Product Code: ${ProductCode}`);
              }

              const iuid = Object.values(data).join('|');
              console.log("IUID: ", iuid);

              // Check if the product already exists based on ProductCode
              const existingProduct = await Product.findOne({ ProductCode });
              if (existingProduct) {
                console.log(`Product with code ${ProductCode} already exists, skipping.`);
                continue; // Skip existing products
              }

              const priceValue = parseFloat(Price);
              const Segment = getSegmentByPrice(priceValue, Category);

              const newProduct = {
                Brand,
                Model,
                ProductCode,
                Price: priceValue,
                Segment,
                Category,
                Status: Status || 'draft',
                Specs: Specs || '',
              };

              newEntries.push(newProduct);
            }

            if (newEntries.length > 0) {
              await Product.insertMany(newEntries);
              res.status(200).send("Products inserted into database");
            } else {
              res.status(200).send("No new data to insert, all entries already exist.");
            }
          } catch (error) {
            console.error(error);
            res.status(500).send("Error inserting products into the database");
          }
        });
    } else {
      res.status(400).send("Unsupported file format");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};
