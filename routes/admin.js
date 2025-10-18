// This file has been removed. Admin panel is now in frontend.

// Note: The actual route handling code has been removed.
const express = require('express');
const path = require('path');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { upload } = require('../config/cloudinary');
const router = express.Router();

// Admin dashboard - serve static HTML page for CMS
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hudamoji Admin - CMS</title>
        <link href="/admin-cms.css" rel="stylesheet">
        <style>
            .tab-content { display: none; }
            .tab-content.active { display: block; }
        </style>
    </head>
    <body class="bg-gray-100">
        <div class="min-h-screen">
            <!-- Header -->
            <header class="bg-white shadow">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center py-6">
                        <h1 class="text-3xl font-bold text-gray-900">Hudamoji Admin</h1>
                        <div class="flex space-x-4">
                            <button onclick="showTab('products')" class="tab-btn bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Products</button>
                            <button onclick="showTab('orders')" class="tab-btn bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">Orders</button>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Products Tab -->
            <div id="products" class="tab-content active max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold">Products Management</h2>
                        <button onclick="showAddProductForm()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Add New Product</button>
                    </div>
                    
                    <!-- Add Product Form (Hidden by default) -->
                    <div id="addProductForm" class="hidden mb-8 p-6 bg-gray-50 rounded-lg">
                        <h3 class="text-xl font-semibold mb-4">Add New Product</h3>
                        <form id="productForm" enctype="multipart/form-data">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                                    <input type="text" name="name" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Price</label>
                                    <input type="number" name="price" step="0.01" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Original Price (Optional)</label>
                                    <input type="number" name="originalPrice" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Category</label>
                                    <select name="category" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                        <option value="">Select Category</option>
                                        <option value="Electronics">Electronics</option>
                                        <option value="Clothing">Clothing</option>
                                        <option value="Home & Garden">Home & Garden</option>
                                        <option value="Books">Books</option>
                                        <option value="Sports">Sports</option>
                                        <option value="Beauty">Beauty</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Stock</label>
                                    <input type="number" name="stock" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <script src="/admin-cms.js"></script>
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert('Product deleted successfully!');
                        loadProducts();
                    } else {
                        alert('Error: ' + data.error);
                    }
                } catch (error) {
                    alert('Error deleting product: ' + error.message);
                }
            }

            // Update order status
            async function updateOrderStatus(orderId, status) {
                try {
                    const response = await fetch(\`/api/orders/\${orderId}/status\`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert('Order status updated successfully!');
                    } else {
                        alert('Error: ' + data.error);
                    }
                } catch (error) {
                    alert('Error updating order status: ' + error.message);
                }
            }

            // Initialize
            loadProducts();
        </script>
    </body>
    </html>
  `);
});

module.exports = router;