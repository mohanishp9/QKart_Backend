const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { cartService } = require("../services");

/**
 * Fetch the cart details
 *
 * Example response:
 * HTTP 200 OK
 * {
 *  "_id": "5f82eebd2b11f6979231653f",
 *  "email": "crio-user@gmail.com",
 *  "cartItems": [
 *      {
 *          "_id": "5f8feede75b0cc037b1bce9d",
 *          "product": {
 *              "_id": "5f71c1ca04c69a5874e9fd45",
 *              "name": "ball",
 *              "category": "Sports",
 *              "rating": 5,
 *              "cost": 20,
 *              "image": "google.com",
 *              "__v": 0
 *          },
 *          "quantity": 2
 *      }
 *  ],
 *  "paymentOption": "PAYMENT_OPTION_DEFAULT",
 *  "__v": 33
 * }
 *
 *
 */
const getCart = catchAsync(async (req, res) => {
  const cart = await cartService.getCartByUser(req.user);
  res.status(httpStatus.OK).send(cart);
});

/**
 * Add a product to cart
 *
 *
 */
const addProductToCart = catchAsync(async (req, res) => {
  const cart = await cartService.addProductToCart(
    req.user,
    req.body.productId,
    req.body.quantity
  );

  res.status(httpStatus.CREATED).send(cart);
});

/**
 * Update product quantity in cart
 * - If updated quantity > 0,
 * --- update product quantity in user's cart
 * --- return "200 OK" and the updated cart object
 * - If updated quantity == 0,
 * --- delete the product from user's cart
 * --- return "204 NO CONTENT"
 *
 * Example responses:
 * HTTP 200 - on successful update
 * HTTP 204 - on successful product deletion
 *
 *
 */
const updateCart = catchAsync(async (req, res) => {
  const cart = await cartService.updateProductInCart(
    req.user,
    req.body.productId,
    req.body.quantity
  );

  if (cart === null) {
    // If cart is null (quantity was 0), return 204 NO_CONTENT
    res.status(httpStatus.NO_CONTENT).send();
  } else {
    res.status(httpStatus.OK).json(cart);
  }
});

/**
 * Checkout user's cart
 */
const checkout = catchAsync(async (req, res) => {
  try {
    // Get cart and validate it exists and has items
    const cart = await cartService.getCartByUser(req.user);
    if (!cart || !cart.cartItems.length) {
      throw new Error("Cart is empty");
    }

    // Validate user has address
    if (!req.user.address) {
      throw new Error("Address not set");
    }

    // Calculate cart total
    const cartTotal = cart.cartItems.reduce(
      (total, item) => total + item.product.cost * item.quantity,
      0
    );

    // Validate user has enough balance
    if (req.user.walletMoney < cartTotal) {
      throw new Error("Insufficient wallet balance");
    }

    // Proceed with checkout
    const updatedUser = await cartService.checkout(req.user);
    if (!updatedUser) {
      throw new Error("Checkout failed");
    }

    return res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    if (
      error.message === "Cart is empty" ||
      error.message === "Address not set" ||
      error.message === "Insufficient wallet balance"
    ) {
      return res.status(httpStatus.BAD_REQUEST).json({
        message: error.message,
      });
    }
    throw error;
  }
  // return (
  //   res
  //     .send()
  // );
});

module.exports = {
  getCart,
  addProductToCart,
  updateCart,
  checkout,
};
