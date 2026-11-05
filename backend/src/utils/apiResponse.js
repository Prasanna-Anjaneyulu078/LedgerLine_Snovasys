export class ApiResponse {
  constructor(statusCode = 200, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    if (data !== null && data !== undefined) {
      this.data = data;
    }
  }

  static success(data, message = 'Operation successful', statusCode = 200) {
    return new ApiResponse(statusCode, data, message);
  }

  static created(data, message = 'Resource created successfully') {
    return new ApiResponse(201, data, message);
  }

  static noContent(message = 'Resource deleted successfully') {
    return new ApiResponse(204, null, message);
  }
}

