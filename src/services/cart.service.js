const httpStatus = require("http-status");
const { Cart, Product } = require("../models");
const ApiError = require("../utils/ApiError");
const config = require("../config/config");

/**
 * Fetches cart for a user
 * - Fetch user's cart from Mongo
 * - If cart doesn't exist, throw ApiError
 * --- status code  - 404 NOT FOUND
 * --- message - "User does not have a cart"
 *
 * @param {User} user
 * @returns {Promise<Cart>}
 * @throws {ApiError}
 */
const getCartByUser = async (user) => {
  const cart = await Cart.findOne({ email: user.email });
  if (!cart) {
    throw new ApiError(httpStatus.NOT_FOUND, "User does not have a cart");
  }
  return cart;
};

/**
 * Adds a new product to cart
 * - Get user's cart object using "Cart" model's findOne() method
 * --- If it doesn't exist, create one
 * --- If cart creation fails, throw ApiError with "500 Internal Server Error" status code
 *
 * - If product to add already in user's cart, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "Product already in cart. Use the cart sidebar to update or remove product from cart"
 *
 * - If product to add not in "products" collection in MongoDB, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "Product doesn't exist in database"
 *
 * - Otherwise, add product to user's cart
 *
 *
 *
 * @param {User} user
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<Cart>}
 * @throws {ApiError}
 */
const addProductToCart = async (user, productId, quantity) => {
  let cart = await Cart.findOne({ email: user.email });

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Product doesn't exist in database"
    );
  }

  // If cart doesn't exist, try to create new cart
  if (!cart) {
    cart = await Cart.create({
      email: user.email,
      cartItems: [],
      paymentOption: config.default_payment_option,
    });

    // Explicitly check if cart creation failed
    if (!cart) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create cart"
      );
    }
  }

  // Check if product already in cart
  const isProductInCart = cart.cartItems.some(
    (item) => item.product._id.toString() === productId
  );

  if (isProductInCart) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Product already in cart. Use the cart sidebar to update or remove product from cart"
    );
  }

  // Add new product to cart
  cart.cartItems.push({ product, quantity });
  const updatedCart = await cart.save();

  // Check if save operation failed
  if (!updatedCart) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update cart"
    );
  }

  return updatedCart;
};

/**
 * Updates the quantity of an already existing product in cart
 * - Get user's cart object using "Cart" model's findOne() method
 * - If cart doesn't exist, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "User does not have a cart. Use POST to create cart and add a product"
 *
 * - If product to add not in "products" collection in MongoDB, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "Product doesn't exist in database"
 *
 * - If product to update not in user's cart, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "Product not in cart"
 *
 * - Otherwise, update the product's quantity in user's cart to the new quantity provided and return the cart object
 *
 *
 * @param {User} user
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<Cart>
 * @throws {ApiError}
 */
const updateProductInCart = async (user, productId, quantity) => {
  const cart = await Cart.findOne({ email: user.email });
  if (!cart) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "User does not have a cart. Use POST to create cart and add a product"
    );
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Product doesn't exist in database"
    );
  }

  const cartItem = cart.cartItems.find(
    (item) => item.product._id.toString() === productId
  );

  if (!cartItem) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Product not in cart");
  }

  if (quantity > 0) {
    cartItem.quantity = quantity;
    await cart.save();
    return cart;
  } else {
    // Remove product if quantity is 0
    cart.cartItems = cart.cartItems.filter(
      (item) => item.product._id.toString() !== productId
    );
    await cart.save();
    return null; // Return null to indicate item was removed
  }
};

/**
 * Deletes an already existing product in cart
 * - If cart doesn't exist for user, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "User does not have a cart"
 *
 * - If product to update not in user's cart, throw ApiError with
 * --- status code  - 400 BAD REQUEST
 * --- message - "Product not in cart"
 *
 * Otherwise, remove the product from user's cart
 *
 *
 * @param {User} user
 * @param {string} productId
 * @throws {ApiError}
 */
const deleteProductFromCart = async (user, productId) => {
  const cart = await Cart.findOne({ email: user.email });
  if (!cart) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User does not have a cart");
  }

  const productIndex = cart.cartItems.findIndex(
    (item) => item.product._id.toString() === productId
  );

  if (productIndex === -1) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Product not in cart");
  }

  cart.cartItems.splice(productIndex, 1);
  await cart.save();
  return cart;
};

/**
 * Checkout a users cart.
 * On success, users cart must have no products.
 *
 * @param {User} user
 * @returns {Promise}
 * @throws {ApiError} when cart is invalid
 */
const checkout = async (user) => {
  const cart = await Cart.findOne({ email: user.email });

  if (!cart) {
    throw new ApiError(httpStatus.NOT_FOUND, "User does not have a cart");
  }

  if (!cart.cartItems.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cart is empty");
  }

  if (!user.hasSetNonDefaultAddress()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Address not set");
  }

  const cartTotal = cart.cartItems.reduce((total, item) => {
    return total + item.product.price * item.quantity;
  }, 0);

  // Ensure we're working with numbers for comparison
  const walletBalance = parseFloat(user.walletMoney);
  const totalCost = parseFloat(cartTotal);

  if (totalCost > walletBalance) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Wallet balance is insufficient"
    );
  }

  // Update wallet balance
  user.walletMoney = walletBalance - totalCost;

  // Empty cart
  cart.cartItems = [];

  // Save both user and cart
  await Promise.all([user.save(), cart.save()]);

  return cart;
};

module.exports = {
  getCartByUser,
  addProductToCart,
  updateProductInCart,
  deleteProductFromCart,
  checkout,
};
