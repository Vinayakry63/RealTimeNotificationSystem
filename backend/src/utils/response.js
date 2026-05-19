// ============================================================
// STANDARDIZED API RESPONSE FORMAT
//
// Why standardize responses?
// Without a standard, different routes might return:
//   { user: {...} }
//   { data: { user: {...} } }
//   { result: {...}, ok: true }
//
// Frontend developers hate this — they have to check docs for every endpoint.
// Industry standard: always return { success, data, message, error }
//
// This is what companies like Stripe, Twilio, and GitHub do.
// Their APIs always have predictable response shapes.
// ============================================================

function successResponse(res, data, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(res, message = "Error", statusCode = 500, errors = null) {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

function createdResponse(res, data, message = "Created successfully") {
  return successResponse(res, data, message, 201);
}

module.exports = { successResponse, errorResponse, createdResponse };
