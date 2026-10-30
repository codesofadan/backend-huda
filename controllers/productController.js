const Product = require('../models/Product');
const { cloudinary } = require('../config/cloudinary');
const { escapeRegex } = require('../utils/helpers');

const toImage = (file) => ({
  public_id: file.filename || file.public_id,
  url: file.path || file.secure_url || file.url
});

const destroyImages = (images) => Promise.all(images.map(img =>
  cloudinary.uploader.destroy(img.public_id).catch(err => console.error('Error deleting image:', err))
));

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
      status,
      stock,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query. The store only sees active products; the admin list (req.adminList) sees all.
    let query = req.adminList ? {} : { status: 'active' };
    if (req.adminList && status && status !== 'all') {
      query.status = status;
    }
    if (req.adminList && stock === 'low') {
      query.stock = { $lte: 5 };
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (featured) {
      query.featured = featured === 'true';
    }
    
    if (search) {
      if (req.adminList) {
        query.name = { $regex: escapeRegex(search.trim()), $options: 'i' };
      } else {
        query.$text = { $search: search };
      }
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
    
    // Parse shades if it's a JSON string
    if (productData.shades && typeof productData.shades === 'string') {
      try {
        productData.shades = JSON.parse(productData.shades);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid shades format'
        });
      }
    }
    
    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Limit to maximum 6 images
      productData.images = req.files.slice(0, 6).map(toImage);
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
    
    // Parse shades if it's a JSON string
    if (updateData.shades && typeof updateData.shades === 'string') {
      try {
        updateData.shades = JSON.parse(updateData.shades);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid shades format'
        });
      }
    }

    // Images: `existingImages` is the JSON list of public_ids to keep, uploaded files are added after them.
    let removed = [];
    const newImages = (req.files || []).map(toImage);
    if (updateData.existingImages !== undefined || newImages.length > 0) {
      let kept = product.images;
      if (updateData.existingImages !== undefined) {
        let keepIds;
        try {
          keepIds = JSON.parse(updateData.existingImages);
        } catch (e) {
          return res.status(400).json({ success: false, error: 'Invalid existingImages format' });
        }
        kept = product.images.filter(img => keepIds.includes(img.public_id));
        removed = product.images.filter(img => !keepIds.includes(img.public_id));
      }
      const images = [...kept, ...newImages].slice(0, 6);
      if (images.length === 0) {
        return res.status(400).json({ success: false, error: 'Product needs at least one image' });
      }
      updateData.images = images;
    }
    delete updateData.existingImages;

    product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    // Only after the DB update succeeded, so a failed save never loses images.
    await destroyImages(removed);

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
    await destroyImages(product.images);

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