const Product = require('../models/Product');
const { cloudinary } = require('../config/cloudinary');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      featured, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = { status: 'active' };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (featured) {
      query.featured = featured === 'true';
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const products = await Product.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res, next) => {
  try {
    const productData = req.body;
    
    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Limit to maximum 3 images
      const limitedFiles = req.files.slice(0, 3);
      const images = limitedFiles.map(file => ({
        public_id: file.filename || file.public_id,
        url: file.path || file.secure_url || file.url
      }));
      productData.images = images;
    } else {
      return res.status(400).json({
        success: false,
        error: 'At least one product image is required'
      });
    }

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const updateData = req.body;

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      // Limit to maximum 3 images
      const limitedFiles = req.files.slice(0, 3);
      
      // Delete old images from cloudinary if replacing
      if (req.body.replaceImages === 'true' && product.images.length > 0) {
        for (const image of product.images) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (err) {
            console.error('Error deleting image:', err);
          }
        }
        updateData.images = limitedFiles.map(file => ({
          public_id: file.filename || file.public_id,
          url: file.path || file.secure_url || file.url
        }));
      } else {
        // Add new images to existing ones, but respect 3-image limit
        const newImages = limitedFiles.map(file => ({
          public_id: file.filename || file.public_id,
          url: file.path || file.secure_url || file.url
        }));
        const combinedImages = [...product.images, ...newImages];
        updateData.images = combinedImages.slice(0, 3); // Ensure max 3 images
      }
    }

    product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Delete images from cloudinary
    if (product.images.length > 0) {
      for (const image of product.images) {
        try {
          await cloudinary.uploader.destroy(image.public_id);
        } catch (err) {
          console.error('Error deleting image:', err);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
const getCategories = async (req, res, next) => {
  try {
    const categories = await Product.distinct('category');
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories
};